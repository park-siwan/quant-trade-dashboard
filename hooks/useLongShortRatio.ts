'use client';

import { useMemo } from 'react';
import { useSocket, LongShortRatioData } from '@/contexts/SocketContext';

interface UseLongShortRatioParams {
  symbol?: string;
  period?: string;
  enabled?: boolean;
}

// 레거시 타입 호환성 유지
export interface LongShortRatio {
  longRatio: number;
  shortRatio: number;
  dominant: 'long' | 'short' | 'neutral';
  dominance: number;
  timestamp: number;
}

/**
 * LongShortRatioData를 LongShortRatio로 변환
 */
function transformToLegacy(data: LongShortRatioData | null): LongShortRatio | null {
  if (!data) return null;

  // longAccount와 shortAccount에서 비율 계산
  const total = data.longAccount + data.shortAccount;
  const longRatio = total > 0 ? data.longAccount / total : 0.5;
  const shortRatio = total > 0 ? data.shortAccount / total : 0.5;

  // dominant 결정
  let dominant: 'long' | 'short' | 'neutral' = 'neutral';
  const diff = Math.abs(longRatio - shortRatio);
  if (diff > 0.02) {
    dominant = longRatio > shortRatio ? 'long' : 'short';
  }

  return {
    longRatio,
    shortRatio,
    dominant,
    dominance: diff * 100,
    timestamp: data.timestamp,
  };
}

/**
 * 롱숏 비율 데이터 훅
 * 백엔드 socket.io를 통해 실시간 데이터 수신
 */
export function useLongShortRatio({
  symbol = 'BTCUSDT',
  period = '1h',
  enabled = true,
}: UseLongShortRatioParams = {}) {
  const { longShortRatioData, isConnected } = useSocket();

  // LongShortRatioData → LongShortRatio 변환 (메모이제이션)
  const ratio = useMemo(() => transformToLegacy(longShortRatioData), [longShortRatioData]);

  return {
    data: longShortRatioData,
    isLoading: !longShortRatioData && isConnected,
    isError: false,
    error: null,
    ratio, // 변환된 LongShortRatio 타입
  };
}

export type { LongShortRatioData };
