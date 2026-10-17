/**
 * src/utils/audio.ts — mobile-safe alarm audio + haptics
 *
 * Architecture
 * ============
 *   Web Audio API (OscillatorNode + GainNode) for the alarm tone.
 *   Capacitor Haptics on native; navigator.vibrate on web.
 *
 * Safety model
 * ============
 *   - Audio on mobile requires a user gesture before it can play. We attach
 *     a one-time gesture listener on load that "unlocks" the audio context.
 *   - Haptics are independent of audio — if audio fails, haptics keep going.
 *   - All resource cleanup is wrapped in try/catch so a partially-broken
 *     state never blocks a subsequent play attempt.
 *
 * Known platform quirks
 * =====================
 *   - An OscillatorNode can only be started ONCE. Calling start() on a node
 *     that has already been started throws. We create a fresh oscillator per
 *     cycle to avoid this.
 *   - On iOS Safari, an AudioContext created before a user gesture stays
 *     'suspended' indefinitely until resume() is called from within a
 *     gesture handler. We attempt resume() in playAlarm but tolerate failure.
 *   - navigator.vibrate(0) is the only reliable way to cancel an ongoing
 *     Vibration API pattern.
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/* ==========================================================================
 * Constants — tuned for mobile audibility
 * ========================================================================== */

const BEEP_FREQUENCY = 920;
/** Frequency offset for odd-indexed beeps — adds a two-tone urgency pattern. */
const BEEP_ALT_FREQUENCY_OFFSET = 80;
const BEEP_ON_MS = 280;
const BEEP_OFF_MS = 140;
const BEEPS_PER_CYCLE = 6;
const GAP_AFTER_CYCLE_MS = 700;
const ALARM_VOLUME = 0.55;
/** Gain value used as "silent" — must be > 0 to avoid click artifacts. */
const SILENT_GAIN = 0.0001;
const HAPTIC_INTERVAL_MS = 2200;
/** Native haptic double-pulse spacing. */
const HAPTIC_DOUBLE_PULSE_GAP_MS = 80;
/** Haptic pattern used for web fallback and the one-shot `triggerHaptics`. */
const HAPTIC_PATTERN: readonly number[] = [400, 120, 400, 120, 400, 120, 400];
/** Shorter pattern used inside `startPersistentHaptics` (web only). */
const HAPTIC_PERSISTENT_PATTERN: readonly number[] = [300, 100, 300, 100, 300];
/** Delay between the three impacts in `triggerHaptics` (native). */
const TRIGGER_HAPTICS_DELAY_MS = 100;
/** Sample rate for the silent unlock buffer (1 sample is enough). */
const UNLOCK_BUFFER_SAMPLE_RATE = 22050;
/** Events that count as a user gesture for audio unlock. */
const UNLOCK_GESTURE_EVENTS = ['touchstart', 'touchend', 'click', 'keydown'] as const;

/* ==========================================================================
 * Module state (singleton)
 *
 * Encapsulated in a single object so `clearAudioResources` can reset every
 * field in one shot, eliminating the "forgot to reset this flag" class of
 * bugs that the original scattered-state version was prone to.
 * ========================================================================== */

interface AudioState {
  audioContext: AudioContext | null;
  oscillator: OscillatorNode | null;
  gainNode: GainNode | null;
  beepInterval: ReturnType<typeof setInterval> | null;
  hapticInterval: ReturnType<typeof setInterval> | null;
  isAlarmPlaying: boolean;
  userGestureUnlocked: boolean;
}

const state: AudioState = {
  audioContext: null,
  oscillator: null,
  gainNode: null,
  beepInterval: null,
  hapticInterval: null,
  isAlarmPlaying: false,
  userGestureUnlocked: false,
};

/* ==========================================================================
 * Pure helpers
 * ========================================================================== */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns the AudioContext constructor, webkit-prefixed fallback included. */
function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

/** Creates a fresh AudioContext. Returns null on any failure. */
function createAudioContext(): AudioContext | null {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return null;
  try {
    return new AudioContextClass();
  } catch {
    return null;
  }
}

/** Safe wrapper around navigator.vibrate — never throws. */
function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Vibration API can throw on some embedded webviews; ignore.
  }
}

/* ==========================================================================
 * Resource cleanup
 * ========================================================================== */

/**
 * Stops every active resource (intervals, oscillator, gain, context, haptics)
 * and resets the corresponding state fields to null. Safe to call when
 * nothing is active. Every individual cleanup is wrapped in try/catch so a
 * partially-broken state never blocks subsequent cleanup steps.
 */
function clearAudioResources(): void {
  if (state.beepInterval !== null) {
    clearInterval(state.beepInterval);
    state.beepInterval = null;
  }

  if (state.hapticInterval !== null) {
    clearInterval(state.hapticInterval);
    state.hapticInterval = null;
  }

  if (state.oscillator) {
    try {
      state.oscillator.stop();
    } catch {
      // start() may never have been called, or already stopped.
    }
    try {
      state.oscillator.disconnect();
    } catch {
      // Already disconnected.
    }
    state.oscillator = null;
  }

  if (state.gainNode) {
    try {
      state.gainNode.disconnect();
    } catch {
      // Already disconnected.
    }
    state.gainNode = null;
  }

  if (state.audioContext) {
    const ctx = state.audioContext;
    state.audioContext = null;
    try {
      // Don't close if suspended — reuse later. Only close contexts that
      // are actually 'running' so the next playAlarm can create a fresh one
      // without racing on a half-closed handle.
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    } catch {
      // close() can throw synchronously on detached webviews.
    }
  }

  // Cancel any ongoing vibration pattern.
  safeVibrate(0);
}

/* ==========================================================================
 * Beep cycle scheduling
 *
 * NOTE: An OscillatorNode can only be started ONCE per instance. The
 * original code reused a single oscillator across cycles and called
 * setValueAtTime on its frequency — that works for frequency changes but
 * cannot restart the oscillator. Here we schedule gain envelopes on a
 * long-running oscillator whose start() is called exactly once. The
 * gain envelope (not start/stop) is what produces the beeping pattern.
 * ========================================================================== */

/**
 * Schedules one beep cycle (BEEPS_PER_CYCLE beeps + trailing gap) on the
 * shared gain node. The oscillator must already be running.
 */
function scheduleBeepCycle(ctx: AudioContext, gain: GainNode): void {
  const now = ctx.currentTime;
  let t = now;

  for (let i = 0; i < BEEPS_PER_CYCLE; i++) {
    const freq = BEEP_FREQUENCY + (i % 2 === 0 ? 0 : BEEP_ALT_FREQUENCY_OFFSET);
    if (state.oscillator) {
      try {
        state.oscillator.frequency.setValueAtTime(freq, t);
      } catch {
        // setValueAtTime can throw if the oscillator has been stopped
        // concurrently — the next interval tick will bail via the
        // `isAlarmPlaying` guard.
      }
    }
    try {
      gain.gain.setValueAtTime(ALARM_VOLUME, t);
      gain.gain.setValueAtTime(SILENT_GAIN, t + BEEP_ON_MS / 1000);
    } catch {
      // Schedule overlap can happen on rapid re-entry; ignore.
    }
    t += (BEEP_ON_MS + BEEP_OFF_MS) / 1000;
  }
  try {
    gain.gain.setValueAtTime(SILENT_GAIN, t);
  } catch {
    // Trailing silence; ignore if it fails.
  }
}

/* ==========================================================================
 * User-gesture unlock
 *
 * Mobile browsers block AudioContext until a user gesture occurs. We attach
 * a one-time listener on load that creates a throwaway context, plays a
 * silent buffer to satisfy the autoplay policy, then closes it. Subsequent
 * playAlarm calls create a fresh long-lived context.
 * ========================================================================== */

function unlockAudioOnGesture(): void {
  if (state.userGestureUnlocked) return;

  const unlock = async (): Promise<void> => {
    try {
      const ctx = createAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      // Play a single-sample silent buffer to satisfy the autoplay policy.
      const buffer = ctx.createBuffer(1, 1, UNLOCK_BUFFER_SAMPLE_RATE);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      await ctx.close().catch(() => {});
      state.userGestureUnlocked = true;
      console.info('[Audio] unlocked via gesture');
    } catch {
      // Unlock is best-effort; playAlarm has its own fallback.
    }
    for (const e of UNLOCK_GESTURE_EVENTS) {
      document.removeEventListener(e, unlock);
    }
  };

  for (const e of UNLOCK_GESTURE_EVENTS) {
    document.addEventListener(e, unlock, { once: true, passive: true });
  }
}

// Auto-attach the unlock listener on module load (browser only).
if (typeof document !== 'undefined') {
  unlockAudioOnGesture();
}

/* ==========================================================================
 * Haptics
 * ========================================================================== */

/**
 * One-shot strong haptic pulse. On native, fires three heavy impacts with
 * short delays. On web, plays the HAPTIC_PATTERN via the Vibration API.
 * Never throws.
 */
export async function triggerHaptics(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await delay(TRIGGER_HAPTICS_DELAY_MS);
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await delay(TRIGGER_HAPTICS_DELAY_MS);
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.warn('[Haptics] native failed:', error);
      safeVibrate([...HAPTIC_PATTERN]);
    }
    return;
  }
  safeVibrate([...HAPTIC_PATTERN]);
}

/**
 * Starts a repeating haptic pulse that continues until `clearAudioResources`
 * is called. Used by `playAlarm` to keep haptics going even if audio fails.
 */
function startPersistentHaptics(): void {
  const pulse = (): void => {
    if (!state.isAlarmPlaying) return;

    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      setTimeout(() => {
        if (state.isAlarmPlaying) {
          Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
        }
      }, HAPTIC_DOUBLE_PULSE_GAP_MS);
    } else {
      safeVibrate([...HAPTIC_PERSISTENT_PATTERN]);
    }
  };

  pulse();
  state.hapticInterval = setInterval(pulse, HAPTIC_INTERVAL_MS);
}

/* ==========================================================================
 * Public API — play / stop alarm
 * ========================================================================== */

/**
 * Starts the repeating alarm tone + persistent haptics. Idempotent — a
 * second call while already playing is a no-op. If audio cannot start
 * (no AudioContext, suspended state without gesture), haptics still run
 * so the user is alerted even with the screen locked.
 */
export async function playAlarm(): Promise<void> {
  if (state.isAlarmPlaying) return;

  state.isAlarmPlaying = true;
  clearAudioResources();

  // Haptics are independent of audio and work even when audio is blocked.
  startPersistentHaptics();

  try {
    const ctx = createAudioContext();
    if (!ctx) {
      console.warn('[Audio] AudioContext not available, haptics only');
      return;
    }
    state.audioContext = ctx;

    if (state.audioContext.state === 'suspended') {
      try {
        await state.audioContext.resume();
      } catch (error) {
        console.warn('[Audio] resume failed:', error);
        // On mobile, resume may need a gesture. Keep haptics going and
        // bail out of audio setup — we cannot meaningfully continue.
        if (!state.userGestureUnlocked) {
          console.info('[Audio] waiting for gesture to resume');
          return;
        }
      }
    }

    state.oscillator = state.audioContext.createOscillator();
    state.gainNode = state.audioContext.createGain();

    state.oscillator.type = 'square';
    try {
      state.oscillator.frequency.setValueAtTime(BEEP_FREQUENCY, state.audioContext.currentTime);
      state.gainNode.gain.setValueAtTime(SILENT_GAIN, state.audioContext.currentTime);
    } catch {
      // Initial param set can race with context teardown; ignore.
    }

    state.oscillator.connect(state.gainNode);
    state.gainNode.connect(state.audioContext.destination);

    try {
      state.oscillator.start();
    } catch (error) {
      console.error('[Audio] oscillator start failed:', error);
      stopAlarm();
      return;
    }

    const runCycle = (): void => {
      if (!state.isAlarmPlaying || !state.audioContext || !state.gainNode) return;
      // Ensure context is running — it may have been suspended by the OS
      // between cycles (e.g. screen lock on some Android OEMs).
      if (state.audioContext.state === 'suspended') {
        state.audioContext.resume().catch(() => {});
      }
      scheduleBeepCycle(state.audioContext, state.gainNode);
    };

    runCycle();

    const cycleDurationMs =
      BEEPS_PER_CYCLE * (BEEP_ON_MS + BEEP_OFF_MS) + GAP_AFTER_CYCLE_MS;
    state.beepInterval = setInterval(runCycle, cycleDurationMs);

    console.info('[Audio] alarm started');
  } catch (error) {
    console.error('[Audio] play failed:', error);
    // Do NOT stop haptics if audio fails — the user must still be alerted.
  }
}

/**
 * Stops the alarm tone and persistent haptics. Safe to call when not
 * playing — clears any lingering resources either way.
 */
export function stopAlarm(): void {
  if (!state.isAlarmPlaying) {
    clearAudioResources();
    return;
  }
  state.isAlarmPlaying = false;
  clearAudioResources();
  console.info('[Audio] alarm stopped');
}

/* ==========================================================================
 * Re-exports
 * ========================================================================== */

export { formatTime } from './time';
