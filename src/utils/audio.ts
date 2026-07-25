// src/utils/audio.ts
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let audioLoopTimer: ReturnType<typeof setTimeout> | null = null;
let isAlarmPlaying = false;

const BEEP_FREQUENCY = 880;
const BEEP_ON_SEC = 0.22;
const BEEP_OFF_SEC = 0.18;
const BEEPS_PER_CYCLE = 5;
const GAP_AFTER_CYCLE_MS = 900;
const ALARM_VOLUME = 0.35;

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext;

  if (!AudioContextClass) return null;

  return new AudioContextClass();
}

function clearAudioResources() {
  if (audioLoopTimer !== null) {
    clearTimeout(audioLoopTimer);
    audioLoopTimer = null;
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
      ctx.close();
    } catch {}
  }

  // توقف ویبره وب اگر فعال بوده
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

function scheduleBeepCycle(ctx: AudioContext, gain: GainNode): number {
  let t = ctx.currentTime;

  for (let i = 0; i < BEEPS_PER_CYCLE; i++) {
    gain.gain.setValueAtTime(ALARM_VOLUME, t);
    gain.gain.setValueAtTime(0, t + BEEP_ON_SEC);
    t += BEEP_ON_SEC + BEEP_OFF_SEC;
  }

  gain.gain.setValueAtTime(0, t);

  return Math.max(0, (t - ctx.currentTime) * 1000);
}

/**
 * پخش صدای آلارم داخل خود اپ
 * تا زمانی که stopAlarm صدا زده نشود، به صورت چرخه‌ای ادامه می‌دهد
 */
export async function playAlarm() {
  if (isAlarmPlaying) return;

  isAlarmPlaying = true;
  clearAudioResources();

  try {
    const ctx = createAudioContext();
    if (!ctx) {
      isAlarmPlaying = false;
      return;
    }

    audioContext = ctx;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(BEEP_FREQUENCY, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();

    const runCycle = () => {
      if (!isAlarmPlaying || !audioContext || !gainNode) return;

      const cycleMs = scheduleBeepCycle(audioContext, gainNode);

      audioLoopTimer = setTimeout(() => {
        runCycle();
      }, cycleMs + GAP_AFTER_CYCLE_MS);
    };

    runCycle();
  } catch (error) {
    console.error('Failed to play alarm:', error);
    stopAlarm();
  }
}

/**
 * توقف صدای آلارم
 */
export function stopAlarm() {
  isAlarmPlaying = false;
  clearAudioResources();
}

/**
 * اجرای ویبره
 * - در Native: Haptics
 * - در Web/PWA: Vibration API
 */
export async function triggerHaptics() {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await delay(120);
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await delay(120);
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.warn('Haptics error:', error);
    }
    return;
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([350, 150, 350, 150, 350]);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
