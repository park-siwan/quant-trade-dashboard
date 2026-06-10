'use client';

import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { longShortRatioDataAtom, isConnectedAtom } from '@/stores/socketAtoms';
import type { LongShortRatioData } from '@/contexts/SocketContext';

interface UseLongShortRatioParams {
  symbol?: string;
  period?: string;
  enabled?: boolean;
}

export interface LongShortRatio {
  longRatio: number;
  shortRatio: number;
  dominant: 'long' | 'short' | 'neutral';
  dominance: number;
  timestamp: number;
}

function transformToLegacy(data: LongShortRatioData | null): LongShortRatio | null {
  if (!data) return null;
  const total = data.longAccount + data.shortAccount;
  const longRatio = total > 0 ? data.longAccount / total : 0.5;
  const shortRatio = total > 0 ? data.shortAccount / total : 0.5;
  const diff = Math.abs(longRatio - shortRatio);
  let dominant: 'long' | 'short' | 'neutral' = 'neutral';
  if (diff > 0.02) dominant = longRatio > shortRatio ? 'long' : 'short';
  return { longRatio, shortRatio, dominant, dominance: diff * 100, timestamp: data.timestamp };
}

export function useLongShortRatio({
  symbol = 'BTCUSDT',
  period = '1h',
  enabled = true,
}: UseLongShortRatioParams = {}) {
  const longShortRatioData = useAtomValue(longShortRatioDataAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const ratio = useMemo(() => transformToLegacy(longShortRatioData), [longShortRatioData]);

  return {
    data: longShortRatioData,
    isLoading: !longShortRatioData && isConnected,
    isError: false,
    error: null,
    ratio,
  };
}

export type { LongShortRatioData };
