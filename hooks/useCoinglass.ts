'use client';

import { useAtomValue } from 'jotai';
import { coinglassDataAtom, isConnectedAtom } from '@/stores/socketAtoms';
import type { CoinglassData } from '@/contexts/SocketContext';

interface UseCoinglassParams {
  symbol?: string;
  refreshInterval?: number;
}

export function useCoinglass({ symbol = 'BTC' }: UseCoinglassParams = {}) {
  const coinglassData = useAtomValue(coinglassDataAtom);
  const isConnected = useAtomValue(isConnectedAtom);

  return {
    data: coinglassData,
    isLoading: !coinglassData && isConnected,
    isError: false,
    error: null,
  };
}

export type CoinglassTradingSignals = CoinglassData;
