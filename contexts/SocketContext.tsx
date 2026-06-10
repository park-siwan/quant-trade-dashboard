'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSetAtom } from 'jotai';
import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '@/lib/config';
import { SIGNAL } from '@/lib/constants';
import {
  isConnectedAtom,
  wakeUpCounterAtom,
  tickerAtom,
  klineAtom,
  klineMapAtom,
  orderbookAtom,
  mtfDataAtom,
  lastMtfUpdateAtom,
  liquidationDataAtom,
  whaleDataAtom,
  fundingRateDataAtom,
  coinglassDataAtom,
  longShortRatioDataAtom,
  balanceDataAtom,
  tradingStatusAtom,
  divergenceDataAtom,
  divergenceHistoryAtom,
  indicatorSnapshotAtom,
  signalStatsAtom,
  resetSocketSymbolDataAtom,
} from '@/stores/socketAtoms';

// ==================== Types ====================
export interface TickerData {
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
  symbol?: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  timestamp: number;
}

export interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
  timeframe: string;
  symbol?: string;
}

export interface BackendMTFData {
  timestamp: number;
  symbol: string;
  timeframes: any[];
}

export interface LiquidationData {
  symbol: string;
  recentLiquidations: any[];
  stats: {
    last1m: { longLiq: number; shortLiq: number; totalUsd: number };
    last5m: { longLiq: number; shortLiq: number; totalUsd: number };
    last15m: { longLiq: number; shortLiq: number; totalUsd: number };
  };
}

export interface WhaleData {
  symbol: string;
  recentTrades: any[];
  stats: {
    last5m: { buyVolume: number; sellVolume: number; buyCount: number; sellCount: number };
    last15m: { buyVolume: number; sellVolume: number; buyCount: number; sellCount: number };
    last1h: { buyVolume: number; sellVolume: number; buyCount: number; sellCount: number };
  };
}

export interface FundingRateData {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  nextFundingRate: number | null;
  markPrice: number;
  indexPrice: number;
}

export interface CoinglassData {
  fearGreedIndex: any;
  liquidationCoinList: any;
  bullMarketPeak: any;
  btcEtfFlow: any;
}

export interface LongShortRatioData {
  symbol: string;
  longShortRatio: number;
  longAccount: number;
  shortAccount: number;
  timestamp: number;
}

export interface BalanceData {
  totalEquity: number;
  availableBalance: number;
  unrealisedPnl: number;
}

export interface TradingStatus {
  envEnabled: boolean;
  enabled: boolean;
  pendingOrder: {
    orderId: string;
    side: 'buy' | 'sell';
    price: number;
    amount: number;
    tp: number;
    sl: number;
    createdAt: number;
  } | null;
  activePosition: {
    side: 'buy' | 'sell';
    entryPrice: number;
    amount: number;
    leverage: number;
    positionIM: number;
    tp: number;
    sl: number;
    openedAt: number;
  } | null;
  retryInfo: {
    active: boolean;
    attempt: number;
    maxAttempts: number;
    side: 'buy' | 'sell';
    leverage: number;
  } | null;
  halfCloseInfo: {
    active: boolean;
    attempt: number;
    maxAttempts: number;
    amount: number;
  } | null;
}

export interface RealtimeDivergenceData {
  id: string;
  symbol: string;
  divergenceType: string;
  direction: string;
  currentPrice: number;
  entryPrice: number;
  tp: number;
  sl: number;
  timestamp: string;
  timeframe: string;
  rsiValue?: number;
  strategy?: string;
  signalType?: string;
}

export interface SignalStats {
  liveStrategy: string;
  totalSignals: number;
  byType: Record<string, number>;
  lastSignalAt: number | null;
  lastSignalDirection: string | null;
  lastSignalType: string | null;
  lastSignalPrice: number | null;
  pythonErrors: number;
  lastErrorAt: number | null;
  lastErrorMsg: string | null;
  avgExecMs: number | null;
  startedAt: number;
}

export interface IndicatorSnapshot {
  symbol: string;
  timeframe: string;
  timestamp: number;
  price: number;
  rsi: number | null;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
  atr: number | null;
  atrPct: number | null;
  ema50: number | null;
  ema200: number | null;
  volumeRatio: number | null;
  regime: 'BULL' | 'BEAR' | 'SIDEWAYS';
  rsiPivot1: boolean;
  rsiPivot2: boolean;
  rsiDivSignal: 'bullish' | 'bearish' | null;
}

// ==================== Actions Context (stable methods only) ====================
interface SocketActionsValue {
  subscribeKline: (timeframe: string) => void;
  subscribeMtf: (symbol: string) => void;
  subscribeSymbol: (symbol: string) => void;
  getKline: (timeframe: string) => KlineData | null;
}

const SocketActionsContext = createContext<SocketActionsValue>({
  subscribeKline: () => {},
  subscribeMtf: () => {},
  subscribeSymbol: () => {},
  getKline: () => null,
});

// ==================== Shared Ticker Ref (re-render 없이 최신 ticker 접근용) ====================
export const tickerSharedRef: { current: TickerData | null } = { current: null };

// ==================== Constants ====================
let lastHiddenTime = 0;
const TICKER_THROTTLE_MS = 500;
const KLINE_THROTTLE_MS = 500;

// ==================== Provider ====================
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const klineMapRef = useRef<Map<string, KlineData>>(new Map());
  const currentSymbolRef = useRef<string>('');

  // Throttle refs
  const latestTickerRef = useRef<TickerData | null>(null);
  const tickerThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestKlineRef = useRef<KlineData | null>(null);
  const klineThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const orderbookThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Atom setters
  const setIsConnected = useSetAtom(isConnectedAtom);
  const setWakeUpCounter = useSetAtom(wakeUpCounterAtom);
  const setTicker = useSetAtom(tickerAtom);
  const setKline = useSetAtom(klineAtom);
  const setKlineMap = useSetAtom(klineMapAtom);
  const setOrderbook = useSetAtom(orderbookAtom);
  const setMtfData = useSetAtom(mtfDataAtom);
  const setLastMtfUpdate = useSetAtom(lastMtfUpdateAtom);
  const setLiquidationData = useSetAtom(liquidationDataAtom);
  const setWhaleData = useSetAtom(whaleDataAtom);
  const setFundingRateData = useSetAtom(fundingRateDataAtom);
  const setCoinglassData = useSetAtom(coinglassDataAtom);
  const setLongShortRatioData = useSetAtom(longShortRatioDataAtom);
  const setBalanceData = useSetAtom(balanceDataAtom);
  const setTradingStatus = useSetAtom(tradingStatusAtom);
  const setDivergenceData = useSetAtom(divergenceDataAtom);
  const setDivergenceHistory = useSetAtom(divergenceHistoryAtom);
  const setIndicatorSnapshot = useSetAtom(indicatorSnapshotAtom);
  const setSignalStats = useSetAtom(signalStatsAtom);
  const resetSymbolData = useSetAtom(resetSocketSymbolDataAtom);

  // Visibility change handler
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastHiddenTime = Date.now();
      } else {
        const hiddenDuration = Date.now() - lastHiddenTime;
        if (lastHiddenTime > 0 && hiddenDuration > SIGNAL.SLEEP_THRESHOLD) {
          console.log(`[Socket] 잠자기 복귀 (${Math.round(hiddenDuration / 1000)}초), 다이버전스 히스토리 클리어 + 소켓 재연결`);
          setDivergenceHistory([]);
          setDivergenceData(null);
          setWakeUpCounter(c => c + 1);

          const sock = socketRef.current;
          if (sock && !sock.connected) {
            console.log('[Socket] 재연결 시도...');
            sock.connect();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Socket connection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = io(`${API_CONFIG.BASE_URL}/mtf`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      setIsConnected(true);
      fetch(`${API_CONFIG.BASE_URL}/trading/status`)
        .then(r => r.json())
        .then(data => setTradingStatus(data))
        .catch(() => {});
      fetch(`${API_CONFIG.BASE_URL}/trading/signal-stats`)
        .then(r => r.json())
        .then(data => setSignalStats(data))
        .catch(() => {});
    });

    socket.on('disconnect', () => setIsConnected(false));

    // Ticker (throttled)
    socket.on('binance:ticker', (data: TickerData) => {
      if (!data.symbol || data.symbol !== currentSymbolRef.current) return;

      latestTickerRef.current = data;
      tickerSharedRef.current = data;
      if (tickerThrottleTimerRef.current) return;

      setTicker(data);
      tickerThrottleTimerRef.current = setTimeout(() => {
        tickerThrottleTimerRef.current = null;
        if (latestTickerRef.current && latestTickerRef.current !== data) {
          tickerSharedRef.current = latestTickerRef.current;
          setTicker(latestTickerRef.current);
        }
      }, TICKER_THROTTLE_MS);
    });

    // Orderbook (throttled)
    socket.on('binance:orderbook', (data: OrderBookData) => {
      if (orderbookThrottleTimerRef.current) return;
      setOrderbook(data);
      orderbookThrottleTimerRef.current = setTimeout(() => {
        orderbookThrottleTimerRef.current = null;
      }, TICKER_THROTTLE_MS);
    });

    // Kline (throttled with trailing update)
    socket.on('binance:kline', (data: KlineData) => {
      if (!data.symbol || data.symbol !== currentSymbolRef.current) return;

      klineMapRef.current.set(data.timeframe, data);
      latestKlineRef.current = data;

      if (data.isFinal) {
        if (klineThrottleTimerRef.current) {
          clearTimeout(klineThrottleTimerRef.current);
          klineThrottleTimerRef.current = null;
        }
        setKlineMap(new Map(klineMapRef.current));
        setKline(data);
        return;
      }

      if (klineThrottleTimerRef.current) return;

      setKlineMap(new Map(klineMapRef.current));
      setKline(data);
      klineThrottleTimerRef.current = setTimeout(() => {
        klineThrottleTimerRef.current = null;
      }, KLINE_THROTTLE_MS);
    });

    socket.on('mtf:data', (data: BackendMTFData) => {
      const normalizedSymbol = data.symbol?.replace('/', '');
      if (!normalizedSymbol || normalizedSymbol !== currentSymbolRef.current) return;
      setMtfData(data);
      setLastMtfUpdate(Date.now());
    });

    socket.on('data:liquidation', (data: LiquidationData) => {
      if (data.symbol !== currentSymbolRef.current) return;
      setLiquidationData(data);
    });

    socket.on('data:whale', (data: WhaleData) => {
      if (data.symbol !== currentSymbolRef.current) return;
      setWhaleData(data);
    });

    socket.on('data:fundingRate', (data: FundingRateData) => {
      if (data.symbol !== currentSymbolRef.current) return;
      setFundingRateData(data);
    });

    socket.on('data:coinglass', (data: CoinglassData) => {
      setCoinglassData(data);
    });

    socket.on('data:longShortRatio', (data: LongShortRatioData) => {
      if (data.symbol !== currentSymbolRef.current) return;
      setLongShortRatioData(data);
    });

    socket.on('data:balance', (data: BalanceData) => {
      setBalanceData(data);
    });

    socket.on('data:trading:status', (data: TradingStatus) => {
      setTradingStatus(data);
    });

    socket.on('data:signal:stats', (data: SignalStats) => {
      setSignalStats(data);
    });

    socket.on('data:divergence', (data: RealtimeDivergenceData) => {
      const normalizedSymbol = data.symbol?.replace('/', '');
      if (!normalizedSymbol || normalizedSymbol !== currentSymbolRef.current) return;

      setDivergenceData(data);
      setDivergenceHistory(prev => {
        const exists = prev.some(d => d.id === data.id);
        if (exists) return prev;
        return [data, ...prev].slice(0, SIGNAL.MAX_HISTORY);
      });
    });

    socket.on('data:indicators', (data: IndicatorSnapshot) => {
      const normalizedSymbol = data.symbol?.replace('/', '');
      if (!normalizedSymbol || normalizedSymbol !== currentSymbolRef.current) return;
      setIndicatorSnapshot(data);
    });

    socket.on('connect_error', () => {
      console.warn('[Socket] Connection error');
    });

    return () => {
      if (tickerThrottleTimerRef.current) clearTimeout(tickerThrottleTimerRef.current);
      if (klineThrottleTimerRef.current) clearTimeout(klineThrottleTimerRef.current);
      if (orderbookThrottleTimerRef.current) clearTimeout(orderbookThrottleTimerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Pending subscriptions
  const pendingKlineTimeframeRef = useRef<string | null>(null);

  const subscribeKline = useCallback((timeframe: string) => {
    pendingKlineTimeframeRef.current = timeframe;
    if (socketRef.current?.connected) {
      console.log('[Socket] Subscribing to kline:', timeframe);
      socketRef.current.emit('subscribe:kline', { timeframe });
    }
  }, []);

  // Auto-subscribe when connected
  useEffect(() => {
    const isConnectedNow = socketRef.current?.connected;
    if (isConnectedNow && pendingKlineTimeframeRef.current) {
      console.log('[Socket] Connected, subscribing to pending kline:', pendingKlineTimeframeRef.current);
      socketRef.current?.emit('subscribe:kline', { timeframe: pendingKlineTimeframeRef.current });
    }
  });

  const subscribeMtf = useCallback((symbol: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbol });
    }
  }, []);

  const getKline = useCallback((timeframe: string): KlineData | null => {
    return klineMapRef.current.get(timeframe) || null;
  }, []);

  const subscribeSymbol = useCallback((symbol: string) => {
    if (symbol === currentSymbolRef.current) return;

    const isFirstSubscription = currentSymbolRef.current === '';
    console.log(`[Socket] ${isFirstSubscription ? 'First subscription' : 'Changing symbol'} to: ${symbol}`);

    currentSymbolRef.current = symbol;

    if (!isFirstSubscription) {
      klineMapRef.current.clear();
      resetSymbolData();
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbol });
    }
  }, [resetSymbolData]);

  const socketActions = useMemo(
    () => ({ subscribeKline, subscribeMtf, subscribeSymbol, getKline }),
    [subscribeKline, subscribeMtf, subscribeSymbol, getKline],
  );

  return (
    <SocketActionsContext.Provider value={socketActions}>
      {children}
    </SocketActionsContext.Provider>
  );
}

// ==================== Hooks ====================

// 소켓 액션 훅 (subscribeKline, subscribeMtf, subscribeSymbol, getKline)
export function useSocket() {
  return useContext(SocketActionsContext);
}

// 하위 호환성 유지 — 신규 코드는 useAtomValue(xxxAtom) 직접 사용 권장
export { useAtomValue as useSocketAtom } from 'jotai';
