// src/utils/audio.ts — Final release: mobile-safe audio + haptics
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let beepInterval: ReturnType<typeof setInterval> | null = null;
let hapticInterval: ReturnType<typeof setInterval> | null = null;
let isAlarmPlaying = false;
let userGestureUnlocked = false;

// ثابت‌های قابل تنظیم — tuned for mobile audibility
const BEEP_FREQUENCY = 920;
const BEEP_ON_MS = 280;
const BEEP_OFF_MS = 140;
const BEEPS_PER_CYCLE = 6;
const GAP_AFTER_CYCLE_MS = 700;
const ALARM_VOLUME = 0.55;
const HAPTIC_INTERVAL_MS = 2200;

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;

  if (!AudioContextClass) return null;

  try {
    return new AudioContextClass();
  } catch {
    return null;
  }
}

function clearAudioResources() {
  if (beepInterval !== null) {
    clearInterval(beepInterval);
    beepInterval = null;
  }

  if (hapticInterval !== null) {
    clearInterval(hapticInterval);
    hapticInterval = null;
  }

  if (oscillator) {
    try {
      oscillator.stop();
    } catch {}
    try {
      oscillator.disconnect();
    } catch {}
    oscillator = null;
  }

  if (gainNode) {
    try {
      gainNode.disconnect();
    } catch {}
    gainNode = null;
  }

  if (audioContext) {
    const ctx = audioContext;
    audioContext = null;
    try {
      // Don't close if suspended — reuse later
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    } catch {}
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(0);
    } catch {}
  }
}

/**
 * برنامه‌ریزی یک چرخه بیپ روی TimeLine
 */
function scheduleBeepCycle(ctx: AudioContext, gain: GainNode) {
  const now = ctx.currentTime;
  let t = now;

  for (let i = 0; i < BEEPS_PER_CYCLE; i++) {
    const freq = BEEP_FREQUENCY + (i % 2 === 0 ? 0 : 80);
    if (oscillator) {
      try {
        oscillator.frequency.setValueAtTime(freq, t);
      } catch {}
    }
    try {
      gain.gain.setValueAtTime(ALARM_VOLUME, t);
      gain.gain.setValueAtTime(0.0001, t + BEEP_ON_MS / 1000);
    } catch {}
    t += (BEEP_ON_MS + BEEP_OFF_MS) / 1000;
  }
  try {
    gain.gain.setValueAtTime(0.0001, t);
  } catch {}
}

/**
 * Unlock audio on first user gesture — required for mobile autoplay
 */
function unlockAudioOnGesture() {
  if (userGestureUnlocked) return;
  const events = ['touchstart', 'touchend', 'click', 'keydown'];
  const unlock = async () => {
    try {
      const ctx = createAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
        // Play silent buffer to unlock
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        await ctx.close().catch(() => {});
      }
      userGestureUnlocked = true;
      console.info('[Audio] unlocked via gesture');
    } catch {}
    events.forEach((e) => document.removeEventListener(e, unlock));
  };
  events.forEach((e) => document.addEventListener(e, unlock, { once: true, passive: true }));
}

// Auto-setup unlock listener on load
if (typeof document !== 'undefined') {
  unlockAudioOnGesture();
}

/**
 * پخش صدای آلارم به‌صورت تکرارشونده تا توقف
 * Safe on mobile: handles suspended context, user gesture, and fallback
 */
export async function playAlarm() {
  if (isAlarmPlaying) return;

  isAlarmPlaying = true;
  clearAudioResources();

  // شروع ویبره تکرارشونده — works even if audio fails
  startPersistentHaptics();

  try {
    const ctx = createAudioContext();
    if (!ctx) {
      console.warn('[Audio] AudioContext not available, haptics only');
      return;
    }

    audioContext = ctx;

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn('[Audio] resume failed:', error);
        // On mobile, resume may need gesture — keep haptics, don't fail
        if (!userGestureUnlocked) {
          console.info('[Audio] waiting for gesture to resume');
          return;
        }
      }
    }

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'square';
    try {
      oscillator.frequency.setValueAtTime(BEEP_FREQUENCY, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    } catch {}

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    try {
      oscillator.start();
    } catch (error) {
      console.error('[Audio] oscillator start failed:', error);
      stopAlarm();
      return;
    }

    const runCycle = () => {
      if (!isAlarmPlaying || !audioContext || !gainNode) return;
      // Ensure context is running
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      scheduleBeepCycle(audioContext, gainNode);
    };

    runCycle();

    const cycleDurationMs = BEEPS_PER_CYCLE * (BEEP_ON_MS + BEEP_OFF_MS) + GAP_AFTER_CYCLE_MS;
    beepInterval = setInterval(runCycle, cycleDurationMs);

    console.info('[Audio] alarm started');
  } catch (error) {
    console.error('[Audio] play failed:', error);
    // Don't stop haptics if audio fails
  }
}

/**
 * توقف کامل آلارم و ویبره
 */
export function stopAlarm() {
  if (!isAlarmPlaying) {
    clearAudioResources();
    return;
  }
  isAlarmPlaying = false;
  clearAudioResources();
  console.info('[Audio] alarm stopped');
}

/**
 * یک‌بار ویبره قوی — mobile optimized
 */
export async function triggerHaptics() {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await delay(100);
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await delay(100);
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.warn('[Haptics] native failed:', error);
      // Fallback to web vibrate
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([400, 120, 400, 120, 400, 120, 400]);
        } catch {}
      }
    }
    return;
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([400, 120, 400, 120, 400, 120, 400]);
    } catch {}
  }
}

/**
 * ویبره تکرارشونده تا زمان توقف آلارم
 */
function startPersistentHaptics() {
  const pulse = () => {
    if (!isAlarmPlaying) return;

    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      setTimeout(() => {
        if (isAlarmPlaying) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      }, 80);
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 100, 300, 100, 300]);
      } catch {}
    }
  };

  pulse();
  hapticInterval = setInterval(pulse, HAPTIC_INTERVAL_MS);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { formatTime } from './time';
