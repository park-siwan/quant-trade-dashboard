'use client';

import { useAtomValue } from 'jotai';
import { tickerAtom } from '@/stores/socketAtoms';

interface PriceData {
  price: number;
  change24h: number;
  changePercent24h: number;
}

export function useBTCPrice(): PriceData | null {
  const ticker = useAtomValue(tickerAtom);
  if (!ticker) return null;
  return {
    price: ticker.price,
    change24h: ticker.change24h,
    changePercent24h: ticker.changePercent24h,
  };
}
