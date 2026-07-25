// src/utils/audio.ts
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// ─── Web Audio (oscillator) ───────────────────────────────────────────────────
let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let alarmLoopHandle: ReturnType<typeof setTimeout> | null = null;
let isAlarmPlaying = false;

/**
 * یک بوق کوتاه (200ms روشن، 200ms خاموش) × 5 بار
 * سپس یک وقفه ۱ ثانیه‌ای و دوباره تکرار می‌شود تا stopAlarm صدا زده شود
 */
function playBeepCycle(ctx: AudioContext, gain: GainNode) {
  const beepOn = 0.2;
  const beepOff = 0.2;
  let t = ctx.currentTime;

  for (let i = 0; i < 5; i++) {
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.setValueAtTime(0, t + beepOn);
    t += beepOn + beepOff;
  }
  return t; // زمان پایان این چرخه
}

export function playAlarm() {
  if (isAlarmPlaying) return; // از اجرای دوباره جلوگیری می‌کند
  isAlarmPlaying = true;

  // ─── Haptics (ویبره) ─────────────────────────────────────────────────────
  triggerHaptics();

  // ─── Web Audio ────────────────────────────────────────────────────────────
  try {
    stopAlarmInternal(); // پاک‌سازی قبلی

    audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();

    // اجرای اولین چرخه
    const cycleDuration = playBeepCycle(audioContext, gainNode);

    // تکرار هر چرخه + ۱ ثانیه مکث
    const scheduleNextCycle = (delayMs: number) => {
      alarmLoopHandle = setTimeout(() => {
        if (!isAlarmPlaying || !audioContext || !gainNode) return;
        const end = playBeepCycle(audioContext, gainNode);
        const cycleMs = (end - audioContext.currentTime) * 1000;
        scheduleNextCycle(cycleMs + 1000);
      }, delayMs);
    };

    scheduleNextCycle((cycleDuration - audioContext.currentTime) * 1000 + 1000);
  } catch (err) {
    console.warn('Web Audio playAlarm error:', err);
    isAlarmPlaying = false;
  }
}

export function stopAlarm() {
  isAlarmPlaying = false;
  stopAlarmInternal();
}

function stopAlarmInternal() {
  if (alarmLoopHandle !== null) {
    clearTimeout(alarmLoopHandle);
    alarmLoopHandle = null;
  }
  if (oscillator) {
    try { oscillator.stop(); } catch {}
    try { oscillator.disconnect(); } catch {}
    oscillator = null;
  }
  if (gainNode) {
    try { gainNode.disconnect(); } catch {}
    gainNode = null;
  }
  if (audioContext) {
    try { audioContext.close(); } catch {}
    audioContext = null;
  }
}

// ─── Haptics ─────────────────────────────────────────────────────────────────
export async function triggerHaptics() {
  // وب: Vibration API
  if (!Capacitor.isNativePlatform()) {
    if ('vibrate' in navigator) {
      // الگوی ویبره: روشن/خاموش به میلی‌ثانیه
      navigator.vibrate([300, 150, 300, 150, 300]);
    }
    return;
  }

  // Native: Capacitor Haptics
  try {
    // ویبره سنگین ۳ بار پشت سرهم
    for (let i = 0; i < 3; i++) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await delay(300);
    }
  } catch (err) {
    console.warn('Haptics error:', err);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Format helper ────────────────────────────────────────────────────────────
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}
