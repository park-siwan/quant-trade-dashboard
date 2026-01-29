'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { TTS } from '@/lib/constants';
import { loadFromStorage, saveToStorage, cleanupTimestampRecord } from '@/lib/storage';

// 페이지가 마지막으로 숨겨진 시간
let lastHiddenTime = 0;

// 숫자 → 한글 음성 파일 매핑
const ONES_MAP: Record<number, string> = {
  1: '일', 2: '이', 3: '삼', 4: '사', 5: '오',
  6: '육', 7: '칠', 8: '팔', 9: '구',
};

const ONES_POINT_MAP: Record<number, string> = {
  1: '일점', 2: '이점', 3: '삼점', 4: '사점', 5: '오점',
  6: '육점', 7: '칠점', 8: '팔점', 9: '구점',
};

const TENS_MAP: Record<number, string> = {
  1: '십', 2: '이십', 3: '삼십', 4: '사십', 5: '오십',
  6: '육십', 7: '칠십', 8: '팔십', 9: '구십',
};

// 숫자를 한글 음성 파일 배열로 변환
function numberToAudioFiles(num: number): string[] {
  if (num < 1 || num > 100) return [];
  if (num === 100) return ['백'];

  const files: string[] = [];
  const tens = Math.floor(num / 10);
  const ones = num % 10;

  if (tens > 0) files.push(TENS_MAP[tens]);
  if (ones > 0) files.push(ONES_MAP[ones]);

  return files;
}

// 점수를 "XX점" 형태로 변환
function scoreToAudioFiles(num: number): string[] {
  if (num < 1 || num > 100) return [];
  if (num === 100) return ['백', '점'];

  const files: string[] = [];
  const tens = Math.floor(num / 10);
  const ones = num % 10;

  if (tens > 0) files.push(TENS_MAP[tens]);
  if (ones > 0) {
    files.push(ONES_POINT_MAP[ones]);
  } else {
    files.push('점');
  }

  return files;
}

export type AlertType =
  | 'entry'           // 진입 타점
  | 'strong_signal'   // 강한 신호
  | 'divergence';     // 다이버전스

export interface TTSOptions {
  enabled?: boolean;
}

// 전역 상태: 사용자 상호작용 여부
let hasUserInteraction = false;

// 사용자 상호작용 감지 (한 번만 설정)
if (typeof window !== 'undefined') {
  const enableAudio = () => {
    hasUserInteraction = true;
    // 이벤트 리스너 제거
    ['click', 'touchstart', 'keydown'].forEach(event => {
      document.removeEventListener(event, enableAudio);
    });
  };

  ['click', 'touchstart', 'keydown'].forEach(event => {
    document.addEventListener(event, enableAudio, { once: true });
  });
}

// 8비트 사운드 생성을 위한 AudioContext
let audioContext: AudioContext | null = null;

// 8비트 사운드 볼륨 (0.0 ~ 1.0)
const SOUND_VOLUME_KEY = '8bit-sound-volume';
let soundVolume = 0.5; // 기본값 50%

// 초기 볼륨 로드
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem(SOUND_VOLUME_KEY);
  if (saved) {
    soundVolume = parseFloat(saved);
  }
}

export function get8BitVolume(): number {
  return soundVolume;
}

export function set8BitVolume(volume: number): void {
  soundVolume = Math.max(0, Math.min(1, volume));
  if (typeof window !== 'undefined') {
    localStorage.setItem(SOUND_VOLUME_KEY, soundVolume.toString());
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

// 단일 음 재생 헬퍼
function playNote(
  ctx: AudioContext,
  startTime: number,
  freq: number,
  duration: number,
  volume: number,
  waveType: OscillatorType = 'square'
) {
  const osc = ctx.createOscillator();
  osc.type = waveType;
  osc.frequency.setValueAtTime(freq, startTime);

  const gain = ctx.createGain();
  const maxGain = volume * 0.25;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(maxGain, startTime + 0.008);
  gain.gain.setValueAtTime(maxGain * 0.8, startTime + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// 8비트 스타일 사운드 재생 (Web Audio API)
// 마리오 코인사운드 참고: B5 (987.77Hz) → E6 (1318.51Hz) - 완전 4도 도약
export function play8BitSound(direction: 'bullish' | 'bearish', forceVolume?: number): void {
  if (!forceVolume && !hasUserInteraction) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const vol = forceVolume ?? soundVolume;
  const now = ctx.currentTime;

  if (direction === 'bullish') {
    // 🪙 마리오 코인 사운드 + 1UP 팡파레
    // Part 1: 코인 사운드 (B5 → E6 완전4도 도약)
    playNote(ctx, now, 987.77, 0.07, vol);                // B5 (짧은 장식음)
    playNote(ctx, now + 0.07, 1318.51, 0.35, vol);        // E6 (메인 - 길게)
    playNote(ctx, now + 0.07, 659.25, 0.30, vol * 0.3, 'triangle'); // E5 서브 화음

    // Part 2: 1UP 스타일 팡파레 (E-G-C 상승)
    playNote(ctx, now + 0.45, 1318.51, 0.08, vol * 0.9);  // E6
    playNote(ctx, now + 0.53, 1567.98, 0.08, vol * 0.9);  // G6
    playNote(ctx, now + 0.61, 2093.00, 0.30, vol);        // C7 (하이 피니시)
    playNote(ctx, now + 0.61, 1046.50, 0.25, vol * 0.4, 'triangle'); // C6 화음
    playNote(ctx, now + 0.61, 1318.51, 0.20, vol * 0.25, 'triangle'); // E6 화음

  } else {
    // 💀 마리오 죽음/파이프 다운 사운드
    // Part 1: 충격 (반음계 하강)
    playNote(ctx, now, 987.77, 0.06, vol);                // B5
    playNote(ctx, now + 0.06, 932.33, 0.06, vol);         // A#5
    playNote(ctx, now + 0.12, 880.00, 0.06, vol);         // A5
    playNote(ctx, now + 0.18, 830.61, 0.06, vol);         // G#5

    // Part 2: 슬라이드 다운 (빠른 하강)
    playNote(ctx, now + 0.26, 783.99, 0.08, vol);         // G5
    playNote(ctx, now + 0.34, 659.25, 0.08, vol);         // E5
    playNote(ctx, now + 0.42, 523.25, 0.08, vol);         // C5
    playNote(ctx, now + 0.50, 392.00, 0.10, vol);         // G4

    // Part 3: 게임오버 피니시 (저음 + 펑)
    playNote(ctx, now + 0.62, 261.63, 0.12, vol);         // C4
    playNote(ctx, now + 0.76, 196.00, 0.35, vol);         // G3 (길게 유지)
    playNote(ctx, now + 0.76, 98.00, 0.30, vol * 0.5, 'triangle');   // G2 베이스
  }
}

// 타임프레임별 8비트 사운드 재생
// 짧은 타임프레임 = 높은 음, 빠름 / 긴 타임프레임 = 낮은 음, 느림
export function play8BitTimeframe(timeframe: string, forceVolume?: number): void {
  if (!forceVolume && !hasUserInteraction) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const vol = (forceVolume ?? soundVolume) * 0.7; // 타임프레임 소리는 약간 작게
  const now = ctx.currentTime;

  // 타임프레임별 음계 매핑 (짧을수록 높은 음)
  const tfSounds: Record<string, { notes: number[]; tempo: number }> = {
    '1m': { notes: [1568, 1760, 1976], tempo: 0.06 },      // G6-A6-B6 (매우 빠름)
    '5m': { notes: [1319, 1480, 1568], tempo: 0.07 },      // E6-F#6-G6
    '15m': { notes: [1047, 1175, 1319], tempo: 0.08 },     // C6-D6-E6
    '30m': { notes: [880, 988, 1047], tempo: 0.09 },       // A5-B5-C6
    '1h': { notes: [659, 784, 880], tempo: 0.10 },         // E5-G5-A5
    '4h': { notes: [523, 587, 659], tempo: 0.12 },         // C5-D5-E5
    '1d': { notes: [392, 440, 523], tempo: 0.14 },         // G4-A4-C5 (느림, 장엄)
  };

  const sound = tfSounds[timeframe] || tfSounds['1h'];
  const { notes, tempo } = sound;

  // 3음 아르페지오 재생
  notes.forEach((freq, i) => {
    playNote(ctx, now + i * tempo, freq, tempo * 1.5, vol);
  });

  // 마지막 음에 화음 추가 (옥타브 아래)
  playNote(ctx, now + 2 * tempo, notes[2] / 2, tempo * 2, vol * 0.3, 'triangle');
}

// 타임프레임 + 방향 통합 알림 사운드
// 타임프레임 음역대에서 상승/하락 패턴을 한 번에 재생
export function play8BitAlert(
  timeframe: string,
  direction: 'bullish' | 'bearish',
  forceVolume?: number
): void {
  if (!forceVolume && !hasUserInteraction) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const vol = forceVolume ?? soundVolume;
  const now = ctx.currentTime;

  // 타임프레임별 기준음 (베이스 주파수)
  const tfBase: Record<string, number> = {
    '1m': 1568,   // G6
    '5m': 1319,   // E6
    '15m': 1047,  // C6
    '30m': 880,   // A5
    '1h': 659,    // E5
    '4h': 523,    // C5
    '1d': 392,    // G4
  };

  const base = tfBase[timeframe] || tfBase['1h'];

  if (direction === 'bullish') {
    // 🎮 상승 알림: 기준음에서 시작하여 상승 팡파레
    // 인트로 (타임프레임 식별)
    playNote(ctx, now, base * 0.75, 0.08, vol * 0.6);           // 5도 아래에서 시작
    playNote(ctx, now + 0.08, base, 0.12, vol * 0.8);           // 기준음으로

    // --- 간격 (0.15초) ---

    // 메인 코인 사운드 (기준음에서 완전4도 위로)
    playNote(ctx, now + 0.35, base, 0.06, vol);                 // 기준음
    playNote(ctx, now + 0.41, base * 1.33, 0.30, vol);          // 완전4도 위 (메인)
    playNote(ctx, now + 0.41, base * 0.67, 0.25, vol * 0.3, 'triangle'); // 화음

    // 팡파레 마무리
    playNote(ctx, now + 0.74, base * 1.5, 0.08, vol * 0.9);     // 완전5도
    playNote(ctx, now + 0.82, base * 2, 0.25, vol);             // 옥타브 피니시
    playNote(ctx, now + 0.82, base, 0.20, vol * 0.3, 'triangle');

  } else {
    // 💀 하락 알림: 기준음에서 시작하여 하강 경고음
    // 인트로 (타임프레임 식별) - 긴장감 있는 시작
    playNote(ctx, now, base * 1.33, 0.08, vol * 0.7);           // 높은 음에서 시작
    playNote(ctx, now + 0.08, base * 1.25, 0.10, vol * 0.8);    // 반음 하강

    // --- 간격 (0.15초) ---

    // 경고 하강
    playNote(ctx, now + 0.33, base, 0.08, vol);                 // 기준음
    playNote(ctx, now + 0.41, base * 0.94, 0.08, vol);          // 반음 아래
    playNote(ctx, now + 0.49, base * 0.84, 0.08, vol);          // 단3도 아래
    playNote(ctx, now + 0.57, base * 0.75, 0.10, vol);          // 완전4도 아래

    // 게임오버 피니시
    playNote(ctx, now + 0.69, base * 0.5, 0.12, vol);           // 옥타브 아래
    playNote(ctx, now + 0.83, base * 0.375, 0.30, vol);         // 더 낮게
    playNote(ctx, now + 0.83, base * 0.1875, 0.25, vol * 0.4, 'triangle'); // 베이스
  }
}

// 탭 간 소리 중복 방지용 키
const TTS_PLAYED_KEY = 'tts-last-played';

// 소리가 최근에 재생되었는지 확인 (탭 간 동기화)
function canPlaySound(soundKey: string): boolean {
  const data = loadFromStorage<Record<string, number>>(TTS_PLAYED_KEY, {});
  const lastPlayed = data[soundKey];
  // 같은 소리 재생 방지
  if (lastPlayed && Date.now() - lastPlayed < TTS.DEDUP_WINDOW) {
    return false;
  }
  return true;
}

// 소리 재생 기록 저장
function markSoundPlayed(soundKey: string) {
  const data = loadFromStorage<Record<string, number>>(TTS_PLAYED_KEY, {});
  data[soundKey] = Date.now();
  // 오래된 기록 정리 후 저장
  saveToStorage(TTS_PLAYED_KEY, data, (d) =>
    cleanupTimestampRecord(d, TTS.CLEANUP_THRESHOLD)
  );
}

export function useTTS(options: TTSOptions = {}) {
  const { enabled = true } = options;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false); // 오디오 잠금 해제 여부
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[][]>([]);
  const isProcessingRef = useRef(false);
  const pendingQueueRef = useRef<string[][]>([]); // 잠금 해제 전 대기열
  const processQueueRef = useRef<(() => void) | null>(null); // processQueue 함수 참조

  // 페이지 visibility 변경 감지 - 잠자기 복귀 시 큐 클리어
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 숨겨질 때 시간 기록
        lastHiddenTime = Date.now();
      } else {
        // 다시 보일 때 - 오래 숨겨졌으면 큐 클리어
        const hiddenDuration = Date.now() - lastHiddenTime;
        if (lastHiddenTime > 0 && hiddenDuration > TTS.SLEEP_THRESHOLD) {
          console.log(`[TTS] 잠자기 복귀 (${Math.round(hiddenDuration / 1000)}초), 큐 클리어`);
          queueRef.current = [];
          pendingQueueRef.current = [];
          // 재생 중인 오디오도 중지
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
          setIsPlaying(false);
        }
        lastHiddenTime = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 사용자 상호작용 후 잠금 해제
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkUnlock = () => {
      if (hasUserInteraction && !isUnlocked) {
        setIsUnlocked(true);
        // 대기 중인 알림이 있으면 큐에 추가하고 재생
        if (pendingQueueRef.current.length > 0) {
          pendingQueueRef.current.forEach(files => {
            queueRef.current.push(files);
          });
          pendingQueueRef.current = [];
          // 큐 처리 시작 (setTimeout으로 상태 업데이트 후 실행)
          setTimeout(() => {
            if (queueRef.current.length > 0 && !isProcessingRef.current) {
              processQueueRef.current?.();
            }
          }, 0);
        }
      }
    };

    // 초기 체크
    checkUnlock();

    // 상호작용 이벤트에서 체크
    const handleInteraction = () => {
      hasUserInteraction = true;
      checkUnlock();
    };

    ['click', 'touchstart', 'keydown'].forEach(event => {
      document.addEventListener(event, handleInteraction, { passive: true });
    });

    return () => {
      ['click', 'touchstart', 'keydown'].forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, [isUnlocked]);

  // 단일 오디오 파일 재생
  const playAudioFile = useCallback((src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 사용자 상호작용 없으면 재생 시도하지 않음 (브라우저 에러 방지)
      if (!hasUserInteraction) {
        resolve();
        return;
      }

      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error(`Failed to play ${src}`));
      audio.play().catch((error) => {
        // 혹시 모를 에러는 조용히 처리
        if (error.name === 'NotAllowedError') {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }, []);

  // 파일 배열 순차 재생
  const playSequence = useCallback(async (files: string[]) => {
    if (!enabled || files.length === 0) return;

    setIsPlaying(true);
    try {
      for (const file of files) {
        await playAudioFile(`/audio/${file}.mp3`);
      }
    } catch (error) {
      console.error('TTS playback error:', error);
    }
    setIsPlaying(false);
  }, [enabled, playAudioFile]);

  // 큐 처리 (중복 방지)
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;
    if (!hasUserInteraction) return; // 사용자 상호작용 없으면 처리하지 않음

    isProcessingRef.current = true;
    while (queueRef.current.length > 0) {
      const files = queueRef.current.shift();
      if (files) {
        await playSequence(files);
      }
    }
    isProcessingRef.current = false;
  }, [playSequence]);

  // processQueue 참조 업데이트
  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  // 큐에 추가 (탭 간 중복 방지 + 큐 크기 제한)
  const enqueue = useCallback((files: string[]) => {
    if (!enabled) return;

    // 탭 간 중복 방지: 같은 소리가 다른 탭에서 최근에 재생되었는지 확인
    const soundKey = files.join('_');
    if (!canPlaySound(soundKey)) {
      return;
    }

    // 오디오가 아직 잠금 해제되지 않았으면 대기열에 추가 (최대 1개만 보관)
    if (!hasUserInteraction) {
      // 최근 알림만 보관 (오래된 것 삭제)
      pendingQueueRef.current = [files];
      return;
    }

    // 큐 크기 제한 - 초과 시 오래된 것 버림
    while (queueRef.current.length >= TTS.MAX_QUEUE_SIZE) {
      const dropped = queueRef.current.shift();
      console.log('[TTS] 큐 초과, 오래된 알림 버림:', dropped?.[0]);
    }

    // 재생 기록 저장 (다른 탭에서 중복 재생 방지)
    markSoundPlayed(soundKey);

    queueRef.current.push(files);
    processQueue();
  }, [enabled, processQueue]);

  // 진입 타점 알림
  // "롱 타점입니다. 72점. 손익비 1대 3. 진입 고려해보세요."
  const playEntryAlert = useCallback((
    direction: 'long' | 'short',
    score: number,
    riskReward: number
  ) => {
    const entryFile = direction === 'long' ? '롱_타점입니다' : '숏_타점입니다';
    const scoreFiles = scoreToAudioFiles(score);
    const rrFiles = numberToAudioFiles(Math.round(riskReward));

    const files = [
      entryFile,
      ...scoreFiles,
      '손익비',
      '일_대',
      ...rrFiles,
      '진입_고려해보세요',
    ];

    enqueue(files);
  }, [enqueue]);

  // 강한 신호 알림
  // "강한 롱/숏 신호입니다. 확인하세요."
  const playStrongSignal = useCallback((direction: 'long' | 'short') => {
    const file = direction === 'long'
      ? '강한_롱_신호입니다_확인하세요'
      : '강한_숏_신호입니다_확인하세요';

    enqueue([file]);
  }, [enqueue]);

  // 다이버전스 알림
  // "5분봉 하락 다이버전스입니다. 숏준비 해보세요. 추세력이 약합니다."
  const playDivergenceAlert = useCallback((
    timeframe: '5m' | '15m' | '1h' | '4h',
    direction: 'bullish' | 'bearish'
  ) => {
    const tfMap: Record<string, string> = {
      '5m': '5분봉',
      '15m': '15분봉',
      '1h': '1시간봉',
      '4h': '4시간봉',
    };

    const tfFile = tfMap[timeframe];
    const dirFile = direction === 'bullish' ? '상승' : '하락';
    const actionFile = direction === 'bullish' ? '롱준비_해보세요' : '숏준비_해보세요';

    const files = [
      tfFile,
      dirFile,
      '다이버전스입니다',
      actionFile,
      '추세력이_약합니다',
    ];

    enqueue(files);
  }, [enqueue]);

  // 재생 중지
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    queueRef.current = [];
    setIsPlaying(false);
  }, []);

  // 8비트 다이버전스 알림 (탭 간 중복 방지 적용)
  const play8BitDivergenceAlert = useCallback((direction: 'bullish' | 'bearish') => {
    if (!enabled) return;

    // 탭 간 중복 방지
    const soundKey = `8bit_div_${direction}`;
    if (!canPlaySound(soundKey)) return;

    markSoundPlayed(soundKey);
    play8BitSound(direction);
  }, [enabled]);

  return {
    isPlaying,
    isUnlocked, // 오디오 재생 가능 여부
    playEntryAlert,
    playStrongSignal,
    playDivergenceAlert,
    play8BitDivergenceAlert, // 8비트 다이버전스 알림
    playSequence,
    stop,
  };
}
