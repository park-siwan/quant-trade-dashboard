'use client';

import { usePolling } from './usePolling';
import { LiquidationSummary } from '@/lib/types';
import { POLLING_INTERVALS } from '@/lib/config';

interface UseLiquidationsParams {
  symbol: string;
  refreshInterval?: number;
}

export function useLiquidations({
  symbol,
  refreshInterval = POLLING_INTERVALS.LIQUIDATIONS,
}: UseLiquidationsParams) {
  return usePolling<LiquidationSummary>({
    endpoint: '/exchange/liquidations',
    params: { symbol },
    refreshInterval,
  });
}
