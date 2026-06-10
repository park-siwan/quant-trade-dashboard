'use client';

import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { symbolAtom } from '@/stores/symbolAtom';
import { isConnectedAtom } from '@/stores/socketAtoms';
import { useSocket } from '@/contexts/SocketContext';

export function useSymbolSubscription() {
  const symbol = useAtomValue(symbolAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const { subscribeSymbol } = useSocket();

  useEffect(() => {
    if (isConnected) {
      subscribeSymbol(symbol.id);
    }
  }, [symbol.id, isConnected, subscribeSymbol]);

  return symbol;
}
