// src/utils/audio.ts
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let beepInterval: ReturnType<typeof setInterval> | null = null;
let hapticInterval: ReturnType<typeof setInterval> | null = null;
let isAlarmPlaying = false;

// ثابت‌های قابل تنظیم
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
    window.AudioContext || (window as any).webkitAudioContext;

  if (!AudioContextClass) return null;

  return new AudioContextClass();
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
      ctx.close();
    } catch {}
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

/**
 * برنامه‌ریزی یک چرخه بیپ (چند بیپ با فاصله) روی TimeLine
 * این تابع فقط فرکانس و gain را زمان‌بندی می‌کند و oscillator در حال اجراست.
 */
function scheduleBeepCycle(ctx: AudioContext, gain: GainNode) {
  const now = ctx.currentTime;
  let t = now;

  for (let i = 0; i < BEEPS_PER_CYCLE; i++) {
    const freq = BEEP_FREQUENCY + (i % 2 === 0 ? 0 : 80);
    if (oscillator) {
      oscillator.frequency.setValueAtTime(freq, t);
    }
    gain.gain.setValueAtTime(ALARM_VOLUME, t);
    gain.gain.setValueAtTime(0.0001, t + BEEP_ON_MS / 1000);
    t += (BEEP_ON_MS + BEEP_OFF_MS) / 1000;
  }
  gain.gain.setValueAtTime(0.0001, t);
}

/**
 * پخش صدای آلارم به‌صورت تکرارشونده تا توقف
 */
export async function playAlarm() {
  if (isAlarmPlaying) return;

  isAlarmPlaying = true;
  clearAudioResources();

  // شروع ویبره تکرارشونده
  startPersistentHaptics();

  try {
    const ctx = createAudioContext();
    if (!ctx) {
      isAlarmPlaying = false;
      return;
    }

    audioContext = ctx;

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn('خطا در resume کردن AudioContext:', error);
      }
    }

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(BEEP_FREQUENCY, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    try {
      oscillator.start();
    } catch (error) {
      console.error('خطا در شروع oscillator:', error);
      stopAlarm();
      return;
    }

    const runCycle = () => {
      if (!isAlarmPlaying || !audioContext || !gainNode) return;
      scheduleBeepCycle(audioContext, gainNode);
    };

    runCycle(); // اجرای اولین چرخه بلافاصله

    // برنامه‌ریزی چرخه‌های بعدی با setInterval
    const cycleDurationMs =
      BEEPS_PER_CYCLE * (BEEP_ON_MS + BEEP_OFF_MS) + GAP_AFTER_CYCLE_MS;

    beepInterval = setInterval(runCycle, cycleDurationMs);
  } catch (error) {
    console.error('خطا در پخش آلارم:', error);
    stopAlarm();
  }
}

/**
 * توقف کامل آلارم و ویبره
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
      navigator.vibrate([300, 100, 300, 100, 300]);
    }
  };

  pulse();
  hapticInterval = setInterval(pulse, HAPTIC_INTERVAL_MS);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { formatTime } from './time';
