import { useCallback, useRef, useEffect } from "react";

interface UseFlipDotSoundOptions {
  enabled: boolean;
  volume?: number;
}

interface UseFlipDotSoundReturn {
  /** Play a single dot-flip click. */
  playClick: () => void;
  /** Play a composite click for multiple simultaneous flips. */
  playBatchClick: (count: number) => void;
}

/**
 * Web Audio hook that produces the mechanical "click" of a flip-dot disc.
 *
 * Creates an AudioContext lazily on first playback (respects browser autoplay policy).
 * Each click is a short square-wave burst at ~2 kHz with rapid gain decay and slight
 * pitch randomisation for an organic feel.
 */
export function useFlipDotSound({
  enabled,
  volume = 0.3,
}: UseFlipDotSoundOptions): UseFlipDotSoundReturn {
  const ctxRef = useRef<AudioContext | null>(null);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const getContext = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  useEffect(() => {
    return () => {
      ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  const playClick = useCallback(() => {
    if (!enabled) return;
    const ctx = getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = 1800 + Math.random() * 400; // 1800-2200 Hz

    gain.gain.setValueAtTime(volumeRef.current * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.03);
  }, [enabled, getContext]);

  const playBatchClick = useCallback(
    (count: number) => {
      if (!enabled || count <= 0) return;
      const ctx = getContext();
      const now = ctx.currentTime;

      // Scale volume and duration with count, capped for sanity
      const batchVolume = Math.min(volumeRef.current, volumeRef.current * (0.4 + count * 0.03));
      const duration = Math.min(0.06, 0.025 + count * 0.001);
      const layerCount = Math.min(count, 4);

      for (let i = 0; i < layerCount; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.value = 1600 + Math.random() * 800;

        const layerVolume = batchVolume / layerCount;
        gain.gain.setValueAtTime(layerVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + Math.random() * 0.005);
        osc.stop(now + duration + 0.01);
      }
    },
    [enabled, getContext],
  );

  return { playClick, playBatchClick };
}
