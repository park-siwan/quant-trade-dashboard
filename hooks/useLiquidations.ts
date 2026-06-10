'use client';

import { useAtomValue } from 'jotai';
import { liquidationDataAtom, isConnectedAtom } from '@/stores/socketAtoms';
import type { LiquidationData } from '@/contexts/SocketContext';

interface UseLiquidationsParams {
  symbol: string;
  refreshInterval?: number;
}

export function useLiquidations({ symbol }: UseLiquidationsParams) {
  const liquidationData = useAtomValue(liquidationDataAtom);
  const isConnected = useAtomValue(isConnectedAtom);

  return {
    data: liquidationData,
    isLoading: !liquidationData && isConnected,
    isError: false,
    error: null,
  };
}
