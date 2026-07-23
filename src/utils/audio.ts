let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;

export function playAlarm() {
  try {
    stopAlarm(); // Stop any existing alarm
    
    // Create audio context
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create oscillator (generates sound wave)
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    
    // Configure alarm sound
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800 Hz
    
    // Set volume
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Create beeping pattern
    const beepDuration = 0.2;
    const pauseDuration = 0.2;
    let time = audioContext.currentTime;
    
    for (let i = 0; i < 5; i++) {
      gainNode.gain.setValueAtTime(0.3, time);
      gainNode.gain.setValueAtTime(0, time + beepDuration);
      time += beepDuration + pauseDuration;
    }
    
    // Start the oscillator
    oscillator.start(audioContext.currentTime);
    oscillator.stop(time);
    
    // Clean up after alarm finishes
    oscillator.onended = () => {
      stopAlarm();
    };
  } catch (error) {
    console.error('Failed to play alarm:', error);
  }
}

export function stopAlarm() {
  if (oscillator) {
    try {
      oscillator.stop();
      oscillator.disconnect();
    } catch (e) {
      // Already stopped
    }
    oscillator = null;
  }
  
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
