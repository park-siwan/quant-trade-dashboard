'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '@/lib/config';
import { SIGNAL } from '@/lib/constants';

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
}

// ==================== Context Types ====================

// 1. Ticker Context (가장 빈번하게 업데이트)
interface TickerContextValue {
  ticker: TickerData | null;
}

// 2. Kline Context (실시간 캔들)
interface KlineContextValue {
  kline: KlineData | null;
  klineMap: Map<string, KlineData>;
  getKline: (timeframe: string) => KlineData | null;
}

// 3. Socket Context (나머지 + functions)
interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  orderbook: OrderBookData | null;
  mtfData: BackendMTFData | null;
  lastMtfUpdate: number;
  liquidationData: LiquidationData | null;
  whaleData: WhaleData | null;
  fundingRateData: FundingRateData | null;
  coinglassData: CoinglassData | null;
  longShortRatioData: LongShortRatioData | null;
  balanceData: BalanceData | null;
  tradingStatus: TradingStatus | null;
  divergenceData: RealtimeDivergenceData | null;
  divergenceHistory: RealtimeDivergenceData[];
  currentSymbol: string;
  wakeUpCounter: number;
  subscribeKline: (timeframe: string) => void;
  subscribeMtf: (symbol: string) => void;
  subscribeSymbol: (symbol: string) => void;
}

// ==================== Contexts ====================
const TickerContext = createContext<TickerContextValue>({ ticker: null });
const KlineContext = createContext<KlineContextValue>({
  kline: null,
  klineMap: new Map(),
  getKline: () => null,
});
const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  orderbook: null,
  mtfData: null,
  lastMtfUpdate: 0,
  liquidationData: null,
  whaleData: null,
  fundingRateData: null,
  coinglassData: null,
  longShortRatioData: null,
  balanceData: null,
  tradingStatus: null,
  divergenceData: null,
  divergenceHistory: [],
  currentSymbol: '',
  wakeUpCounter: 0,
  subscribeKline: () => {},
  subscribeMtf: () => {},
  subscribeSymbol: () => {},
});

// ==================== Constants ====================
let lastHiddenTime = 0;
const TICKER_THROTTLE_MS = 500;
const KLINE_THROTTLE_MS = 500;

// ==================== Provider ====================
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Ticker state (별도 context)
  const [ticker, setTicker] = useState<TickerData | null>(null);

  // Kline state (별도 context)
  const [kline, setKline] = useState<KlineData | null>(null);
  const klineMapRef = useRef<Map<string, KlineData>>(new Map());
  const [klineMapVersion, setKlineMapVersion] = useState(0);

  // Socket state (나머지)
  const [orderbook, setOrderbook] = useState<OrderBookData | null>(null);
  const [mtfData, setMtfData] = useState<BackendMTFData | null>(null);
  const [lastMtfUpdate, setLastMtfUpdate] = useState(0);
  const [liquidationData, setLiquidationData] = useState<LiquidationData | null>(null);
  const [whaleData, setWhaleData] = useState<WhaleData | null>(null);
  const [fundingRateData, setFundingRateData] = useState<FundingRateData | null>(null);
  const [coinglassData, setCoinglassData] = useState<CoinglassData | null>(null);
  const [longShortRatioData, setLongShortRatioData] = useState<LongShortRatioData | null>(null);
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null);
  const [divergenceData, setDivergenceData] = useState<RealtimeDivergenceData | null>(null);
  const [divergenceHistory, setDivergenceHistory] = useState<RealtimeDivergenceData[]>([]);
  const [currentSymbol, setCurrentSymbol] = useState<string>('');
  const currentSymbolRef = useRef<string>('');
  const [wakeUpCounter, setWakeUpCounter] = useState(0);

  // Throttle refs
  const latestTickerRef = useRef<TickerData | null>(null);
  const tickerThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const klineThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const orderbookThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);

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

          // 캔들 리로드 트리거
          setWakeUpCounter(c => c + 1);

          // 소켓이 끊겨있으면 강제 재연결
          const sock = socketRef.current;
          if (sock && !sock.connected) {
            console.log('[Socket] 재연결 시도...');
            sock.connect();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
      // 초기 trading status 가져오기 (소켓 연결 전 broadcast 놓침 방지)
      fetch(`${API_CONFIG.BASE_URL}/trading/status`)
        .then(r => r.json())
        .then(data => setTradingStatus(data))
        .catch(() => {});
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Ticker (throttled)
    socket.on('binance:ticker', (data: TickerData) => {
      if (!data.symbol || data.symbol !== currentSymbolRef.current) return;

      latestTickerRef.current = data;
      if (tickerThrottleTimerRef.current) return;

      setTicker(data);
      tickerThrottleTimerRef.current = setTimeout(() => {
        tickerThrottleTimerRef.current = null;
        if (latestTickerRef.current && latestTickerRef.current !== data) {
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

    // Kline (throttled)
    socket.on('binance:kline', (data: KlineData) => {
      if (!data.symbol || data.symbol !== currentSymbolRef.current) return;

      klineMapRef.current.set(data.timeframe, data);
      if (klineThrottleTimerRef.current) return;

      setKlineMapVersion(v => v + 1);
      setKline(data);
      klineThrottleTimerRef.current = setTimeout(() => {
        klineThrottleTimerRef.current = null;
      }, KLINE_THROTTLE_MS);
    });

    // MTF data
    socket.on('mtf:data', (data: BackendMTFData) => {
      const normalizedSymbol = data.symbol?.replace('/', '');
      if (!normalizedSymbol || normalizedSymbol !== currentSymbolRef.current) return;
      setMtfData(data);
      setLastMtfUpdate(Date.now());
    });

    // Market data
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

    // Balance (symbol-independent)
    socket.on('data:balance', (data: BalanceData) => {
      setBalanceData(data);
    });

    // Trading status (symbol-independent)
    socket.on('data:trading:status', (data: TradingStatus) => {
      setTradingStatus(data);
    });

    // Divergence signals
    socket.on('data:divergence', (data: RealtimeDivergenceData) => {
      const normalizedSymbol = data.symbol?.replace('/', '');
      if (!normalizedSymbol || normalizedSymbol !== currentSymbolRef.current) return;

      setDivergenceData(data);
      setDivergenceHistory(prev => {
        const exists = prev.some(d => d.id === data.id);
        if (exists) return prev;
        const newHistory = [data, ...prev];
        return newHistory.slice(0, SIGNAL.MAX_HISTORY);
      });
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
    if (isConnected && pendingKlineTimeframeRef.current) {
      console.log('[Socket] Connected, subscribing to pending kline:', pendingKlineTimeframeRef.current);
      socketRef.current?.emit('subscribe:kline', { timeframe: pendingKlineTimeframeRef.current });
    }
  }, [isConnected]);

  const subscribeMtf = useCallback((symbol: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbol });
    }
  }, []);

  const getKline = useCallback((timeframe: string): KlineData | null => {
    return klineMapRef.current.get(timeframe) || null;
  }, [klineMapVersion]);

  const subscribeSymbol = useCallback((symbol: string) => {
    if (symbol === currentSymbolRef.current) return;

    const isFirstSubscription = currentSymbolRef.current === '';
    console.log(`[Socket] ${isFirstSubscription ? 'First subscription' : 'Changing symbol'} to: ${symbol}`);

    setCurrentSymbol(symbol);
    currentSymbolRef.current = symbol;

    if (!isFirstSubscription) {
      setTicker(null);
      setOrderbook(null);
      setKline(null);
      klineMapRef.current.clear();
      setKlineMapVersion(v => v + 1);
      setMtfData(null);
      setLiquidationData(null);
      setWhaleData(null);
      setFundingRateData(null);
      setCoinglassData(null);
      setLongShortRatioData(null);
      setDivergenceData(null);
      setDivergenceHistory([]);
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbol });
    }
  }, []);

  // Memoized context values (각각 별도로 메모이제이션)
  const tickerValue = useMemo(() => ({ ticker }), [ticker]);

  const klineValue = useMemo(() => ({
    kline,
    klineMap: klineMapRef.current,
    getKline,
  }), [kline, getKline]);

  const socketValue = useMemo(() => ({
    socket: socketRef.current,
    isConnected,
    orderbook,
    mtfData,
    lastMtfUpdate,
    liquidationData,
    whaleData,
    fundingRateData,
    coinglassData,
    longShortRatioData,
    balanceData,
    tradingStatus,
    divergenceData,
    divergenceHistory,
    currentSymbol,
    wakeUpCounter,
    subscribeKline,
    subscribeMtf,
    subscribeSymbol,
  }), [
    isConnected,
    orderbook,
    mtfData,
    lastMtfUpdate,
    liquidationData,
    whaleData,
    fundingRateData,
    coinglassData,
    longShortRatioData,
    balanceData,
    tradingStatus,
    divergenceData,
    divergenceHistory,
    currentSymbol,
    wakeUpCounter,
    subscribeKline,
    subscribeMtf,
    subscribeSymbol,
  ]);

  return (
    <SocketContext.Provider value={socketValue}>
      <TickerContext.Provider value={tickerValue}>
        <KlineContext.Provider value={klineValue}>
          {children}
        </KlineContext.Provider>
      </TickerContext.Provider>
    </SocketContext.Provider>
  );
}

// ==================== Hooks ====================
// 메인 소켓 hook (orderbook, divergence 등)
export function useSocket() {
  return useContext(SocketContext);
}

// Ticker 전용 hook (가장 빈번하게 업데이트)
export function useSocketTicker() {
  return useContext(TickerContext);
}

// Kline 전용 hook
export function useSocketKline() {
  return useContext(KlineContext);
}

// 하위 호환성: ticker + kline + socket 전부 필요한 경우
export function useSocketAll() {
  const socket = useSocket();
  const { ticker } = useSocketTicker();
  const klineData = useSocketKline();

  return {
    ...socket,
    ticker,
    ...klineData,
  };
}
