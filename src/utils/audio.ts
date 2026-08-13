// src/utils/audio.ts
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let audioLoopTimer: ReturnType<typeof setTimeout> | null = null;
let hapticLoopTimer: ReturnType<typeof setTimeout> | null = null;
let isAlarmPlaying = false;

/** صدای آلارم قوی‌تر و تکراری تا تأیید مصرف */
const BEEP_FREQUENCY = 920;
const BEEP_ON_SEC = 0.28;
const BEEP_OFF_SEC = 0.14;
const BEEPS_PER_CYCLE = 6;
const GAP_AFTER_CYCLE_MS = 700;
const ALARM_VOLUME = 0.55;
const HAPTIC_REPEAT_MS = 2200;

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

  if (hapticLoopTimer !== null) {
    clearTimeout(hapticLoopTimer);
    hapticLoopTimer = null;
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

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

function scheduleBeepCycle(ctx: AudioContext, gain: GainNode): number {
  let t = ctx.currentTime;

  for (let i = 0; i < BEEPS_PER_CYCLE; i++) {
    const freq = BEEP_FREQUENCY + (i % 2 === 0 ? 0 : 80);
    if (oscillator) {
      oscillator.frequency.setValueAtTime(freq, t);
    }
    gain.gain.setValueAtTime(ALARM_VOLUME, t);
    gain.gain.setValueAtTime(0, t + BEEP_ON_SEC);
    t += BEEP_ON_SEC + BEEP_OFF_SEC;
  }

  gain.gain.setValueAtTime(0, t);

  return Math.max(0, (t - ctx.currentTime) * 1000);
}

/**
 * پخش صدای آلارم داخل اپ
 * تا زمانی که stopAlarm صدا زده نشود، به‌صورت چرخه‌ای ادامه می‌دهد
 */
export async function playAlarm() {
  if (isAlarmPlaying) return;

  isAlarmPlaying = true;
  clearAudioResources();

  startPersistentHaptics();

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

    oscillator.type = 'square';
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
    console.error('خطا در پخش آلارم:', error);
    stopAlarm();
  }
}

/**
 * توقف کامل صدای آلارم و ویبره
 */
export function stopAlarm() {
  isAlarmPlaying = false;
  clearAudioResources();
}

/**
 * یک‌بار ویبره قوی
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
      console.warn('خطای ویبره نیتیو:', error);
    }
    return;
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([400, 120, 400, 120, 400, 120, 400]);
  }
}

/**
 * ویبره تکراری تا زمان توقف آلارم
 */
function startPersistentHaptics() {
  const pulse = async () => {
    if (!isAlarmPlaying) return;

    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await delay(80);
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch {}
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 300]);
    }

    if (isAlarmPlaying) {
      hapticLoopTimer = setTimeout(pulse, HAPTIC_REPEAT_MS);
    }
  };

  pulse();
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * قالب‌بندی زمان به صورت ساعت:دقیقه:ثانیه
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
