'use client';

import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { symbolAtom } from '@/stores/symbolAtom';
import { useSocket } from '@/contexts/SocketContext';

/**
 * 심볼 변경 시 자동으로 WebSocket 구독을 변경하는 훅
 * App 레벨에서 한 번만 사용
 */
export function useSymbolSubscription() {
  const symbol = useAtomValue(symbolAtom);
  const { subscribeSymbol, isConnected } = useSocket();

  useEffect(() => {
    if (isConnected) {
      subscribeSymbol(symbol.id);
    }
  }, [symbol.id, isConnected, subscribeSymbol]);

  return symbol;
}
