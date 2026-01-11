'use client';

import { usePolling } from './usePolling';
import { WhaleSummary } from '@/lib/types';
import { POLLING_INTERVALS } from '@/lib/config';

interface UseWhalesParams {
  symbol: string;
  refreshInterval?: number;
}

export function useWhales({
  symbol,
  refreshInterval = POLLING_INTERVALS.WHALES,
}: UseWhalesParams) {
  return usePolling<WhaleSummary>({
    endpoint: '/exchange/whales',
    params: { symbol },
    refreshInterval,
  });
}
