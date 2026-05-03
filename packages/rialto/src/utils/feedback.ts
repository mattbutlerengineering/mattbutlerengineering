/**
 * Triggers a short haptic vibration pattern if supported by the device.
 * [15, 30, 15] pattern: short burst, pause, short burst.
 */
export function triggerHapticFeedback(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([15, 30, 15]);
    } catch {
      // Ignore vibration errors (e.g. user hasn't interacted with the page)
    }
  }
}

/**
 * Synthesizes a mechanical "click" sound using the Web Audio API.
 * Uses an OscillatorNode at ~80Hz with a fast exponential decay.
 * No external asset file required.
 */
export function playClickSound(): void {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    // Mechanical click frequency around 80Hz
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);

    // Fast decay envelope
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);

    // Close context after playback to free resources
    setTimeout(() => {
      void audioCtx.close();
    }, 200);
  } catch {
    // Ignore audio errors (e.g. autoplay policy restrictions)
  }
}
