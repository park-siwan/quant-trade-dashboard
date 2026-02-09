import { useState, useRef, useCallback, useEffect } from 'react';

interface UseSoundAlertsResult {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  soundVolume: number;
  setSoundVolume: (volume: number) => void;
  playAlertSound: (direction: 'bullish' | 'bearish', forcePlay?: boolean) => Promise<void>;
  playExitSound: (isProfit: boolean, forcePlay?: boolean) => void;
}

/**
 * 사운드 알림 Hook
 * - Web Audio API를 사용한 8bit 스타일 사운드 재생
 * - 진입 신호 (bullish/bearish) 및 청산 (익절/손절) 소리
 */
export function useSoundAlerts(): UseSoundAlertsResult {
  const [soundEnabled, setSoundEnabledRaw] = useState(true);
  const [soundVolume, setSoundVolumeRaw] = useState(1);

  // SSR hydration 후 localStorage에서 복원
  useEffect(() => {
    const savedEnabled = localStorage.getItem('soundEnabled');
    if (savedEnabled !== null) setSoundEnabledRaw(savedEnabled === 'true');
    const savedVolume = localStorage.getItem('soundVolume');
    if (savedVolume !== null) setSoundVolumeRaw(parseFloat(savedVolume));
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledRaw(v);
    localStorage.setItem('soundEnabled', String(v));
  }, []);

  const setSoundVolume = useCallback((v: number) => {
    setSoundVolumeRaw(v);
    localStorage.setItem('soundVolume', String(v));
  }, []);
  const audioContextRef = useRef<AudioContext | null>(null);

  // macOS Safari: 사용자 상호작용 시 AudioContext 초기화
  useEffect(() => {
    const initAudioContext = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    };

    const handleUserInteraction = () => {
      initAudioContext();
      ['click', 'touchstart', 'keydown'].forEach((event) => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };

    ['click', 'touchstart', 'keydown'].forEach((event) => {
      document.addEventListener(event, handleUserInteraction, { once: true });
    });

    return () => {
      ['click', 'touchstart', 'keydown'].forEach((event) => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, []);

  // 8bit 스타일 소리 알림 (진입 신호)
  const playAlertSound = useCallback(async (
    direction: 'bullish' | 'bearish',
    forcePlay = false,
  ) => {
    if (!soundEnabled && !forcePlay) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      const ctx = audioContextRef.current;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const playNote = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(soundVolume * 0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const t = ctx.currentTime;
      if (direction === 'bullish') {
        // 롱 신호: 상승 멜로디
        playNote(523.25, t, 0.08); // C5
        playNote(659.25, t + 0.08, 0.08); // E5
        playNote(783.99, t + 0.16, 0.08); // G5
        playNote(1046.5, t + 0.24, 0.12); // C6
        playNote(1318.51, t + 0.36, 0.12); // E6
        playNote(1567.98, t + 0.48, 0.25); // G6
      } else {
        // 숏 신호: 하강 멜로디
        playNote(1046.5, t, 0.08); // C6
        playNote(932.33, t + 0.08, 0.08); // Bb5
        playNote(783.99, t + 0.16, 0.08); // G5
        playNote(622.25, t + 0.24, 0.12); // Eb5
        playNote(523.25, t + 0.36, 0.12); // C5
        playNote(392.0, t + 0.48, 0.25); // G4
      }
    } catch (err) {
      console.error('Failed to play alert sound:', err);
    }
  }, [soundEnabled, soundVolume]);

  // 폴백 청산 소리 (Web Audio API)
  const playFallbackExitSound = useCallback(async (isProfit: boolean) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      const ctx = audioContextRef.current;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const playNote = (
        freq: number,
        startTime: number,
        duration: number,
        type: OscillatorType = 'square',
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(soundVolume * 0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const t = ctx.currentTime;
      if (isProfit) {
        // 익절: 승리 팡파레
        playNote(523.25, t, 0.08); // C5
        playNote(659.25, t + 0.08, 0.08); // E5
        playNote(783.99, t + 0.16, 0.08); // G5
        playNote(1046.5, t + 0.24, 0.15); // C6
        playNote(783.99, t + 0.4, 0.08); // G5
        playNote(1046.5, t + 0.48, 0.08); // C6
        playNote(1318.51, t + 0.56, 0.25); // E6
        playNote(1567.98, t + 0.82, 0.35); // G6
      } else {
        // 손절: 실패 사운드
        playNote(493.88, t, 0.12, 'sawtooth'); // B4
        playNote(440.0, t + 0.12, 0.12, 'sawtooth'); // A4
        playNote(392.0, t + 0.24, 0.12, 'sawtooth'); // G4
        playNote(349.23, t + 0.36, 0.12, 'sawtooth'); // F4
        playNote(329.63, t + 0.48, 0.15, 'sawtooth'); // E4
        playNote(293.66, t + 0.64, 0.15, 'sawtooth'); // D4
        playNote(261.63, t + 0.8, 0.2, 'sawtooth'); // C4
        playNote(196.0, t + 1.0, 0.35, 'sawtooth'); // G3
      }
    } catch (err) {
      console.error('Failed to play fallback exit sound:', err);
    }
  }, [soundVolume]);

  // TP/SL 청산 알림
  const playExitSound = useCallback((isProfit: boolean, forcePlay = false) => {
    if (!soundEnabled && !forcePlay) return;

    try {
      if (isProfit) {
        // 익절: 캐셔 소리 파일 재생
        const audio = new Audio('/sounds/cashier.mp3');
        audio.volume = soundVolume;
        audio.play().catch(() => {
          // 폴백: Web Audio API 사용
          playFallbackExitSound(true);
        });
      } else {
        // 손절: Web Audio API 경고음
        playFallbackExitSound(false);
      }
    } catch (err) {
      console.error('Failed to play exit sound:', err);
    }
  }, [soundEnabled, soundVolume, playFallbackExitSound]);

  return {
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    playAlertSound,
    playExitSound,
  };
}
