'use client';

import { useAtomValue } from 'jotai';
import { whaleDataAtom, isConnectedAtom } from '@/stores/socketAtoms';
import type { WhaleData } from '@/contexts/SocketContext';

interface UseWhalesParams {
  symbol: string;
  refreshInterval?: number;
}

export function useWhales({ symbol }: UseWhalesParams) {
  const whaleData = useAtomValue(whaleDataAtom);
  const isConnected = useAtomValue(isConnectedAtom);

  return {
    data: whaleData,
    isLoading: !whaleData && isConnected,
    isError: false,
    error: null,
  };
}
