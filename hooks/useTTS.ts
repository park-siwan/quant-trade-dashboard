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

  return {
    isPlaying,
    isUnlocked, // 오디오 재생 가능 여부
    playEntryAlert,
    playStrongSignal,
    playDivergenceAlert,
    playSequence,
    stop,
  };
}
