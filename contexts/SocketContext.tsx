'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '@/lib/config';
import { SIGNAL } from '@/lib/constants';

// Types
export interface TickerData {
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
  symbol?: string; // 심볼 정보 (BTCUSDT 형식)
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
  symbol?: string; // 심볼 정보 (BTCUSDT 형식)
}

// MTF 백엔드 데이터 타입
export interface BackendMTFData {
  timestamp: number;
  symbol: string;
  timeframes: any[];
}

// 청산 데이터 타입
export interface LiquidationData {
  symbol: string;
  recentLiquidations: any[];
  stats: {
    last1m: { longLiq: number; shortLiq: number; totalUsd: number };
    last5m: { longLiq: number; shortLiq: number; totalUsd: number };
    last15m: { longLiq: number; shortLiq: number; totalUsd: number };
  };
}

// 고래 데이터 타입
export interface WhaleData {
  symbol: string;
  recentTrades: any[];
  stats: {
    last5m: { buyVolume: number; sellVolume: number; buyCount: number; sellCount: number };
    last15m: { buyVolume: number; sellVolume: number; buyCount: number; sellCount: number };
    last1h: { buyVolume: number; sellVolume: number; buyCount: number; sellCount: number };
  };
}

// 펀딩 레이트 데이터 타입
export interface FundingRateData {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  nextFundingRate: number | null;
  markPrice: number;
  indexPrice: number;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  signalStrength: 'STRONG' | 'MEDIUM' | 'WEAK';
  description: string;
}

// 코인글래스 데이터 타입
export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: number;
}

export interface CoinglassData {
  symbol: string;
  fearGreed: FearGreedData | null;
  liquidationBias: 'long_heavy' | 'short_heavy' | 'neutral';
  bullMarketRisk: number;
  etfTrend: 'inflow' | 'outflow' | 'neutral';
}

// 롱숏 비율 데이터 타입
export interface LongShortRatioData {
  longRatio: number;
  shortRatio: number;
  dominant: 'long' | 'short' | 'neutral';
  dominance: number;
  timestamp: number;
}

// 실시간 다이버전스 신호 타입
export interface RealtimeDivergenceData {
  type: 'rsi';
  direction: 'bullish' | 'bearish';
  timestamp: number;
  price: number;
  rsiValue: number;
  strength: number;
  timeframe: string;
}

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  ticker: TickerData | null;
  orderbook: OrderBookData | null;
  kline: KlineData | null; // deprecated, use getKline(timeframe)
  klineMap: Map<string, KlineData>; // 타임프레임별 kline
  getKline: (timeframe: string) => KlineData | null;
  mtfData: BackendMTFData | null;
  lastMtfUpdate: number;
  liquidationData: LiquidationData | null;
  whaleData: WhaleData | null;
  fundingRateData: FundingRateData | null;
  coinglassData: CoinglassData | null;
  longShortRatioData: LongShortRatioData | null;
  divergenceData: RealtimeDivergenceData | null;
  divergenceHistory: RealtimeDivergenceData[];
  currentSymbol: string;
  subscribeKline: (timeframe: string) => void;
  subscribeMtf: (symbol: string) => void;
  subscribeSymbol: (symbol: string) => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  ticker: null,
  orderbook: null,
  kline: null,
  klineMap: new Map(),
  getKline: () => null,
  mtfData: null,
  lastMtfUpdate: 0,
  liquidationData: null,
  whaleData: null,
  fundingRateData: null,
  coinglassData: null,
  longShortRatioData: null,
  divergenceData: null,
  divergenceHistory: [],
  currentSymbol: '',
  subscribeKline: () => {},
  subscribeMtf: () => {},
  subscribeSymbol: () => {},
});

// 페이지가 마지막으로 숨겨진 시간
let lastHiddenTime = 0;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [orderbook, setOrderbook] = useState<OrderBookData | null>(null);
  const [kline, setKline] = useState<KlineData | null>(null);
  // 타임프레임별 kline 저장 (5분봉, 15분봉 등 동시 지원)
  const klineMapRef = useRef<Map<string, KlineData>>(new Map());
  const [klineMapVersion, setKlineMapVersion] = useState(0); // Map 변경 감지용
  const [mtfData, setMtfData] = useState<BackendMTFData | null>(null);
  const [lastMtfUpdate, setLastMtfUpdate] = useState(0);
  const [liquidationData, setLiquidationData] = useState<LiquidationData | null>(null);
  const [whaleData, setWhaleData] = useState<WhaleData | null>(null);
  const [fundingRateData, setFundingRateData] = useState<FundingRateData | null>(null);
  const [coinglassData, setCoinglassData] = useState<CoinglassData | null>(null);
  const [longShortRatioData, setLongShortRatioData] = useState<LongShortRatioData | null>(null);
  const [divergenceData, setDivergenceData] = useState<RealtimeDivergenceData | null>(null);
  const [divergenceHistory, setDivergenceHistory] = useState<RealtimeDivergenceData[]>([]);
  const [currentSymbol, setCurrentSymbol] = useState<string>('');
  const currentSymbolRef = useRef<string>(''); // 이벤트 핸들러에서 최신 심볼 확인용

  // 페이지 visibility 변경 감지 - 잠자기 복귀 시 히스토리 클리어
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 숨겨질 때 시간 기록
        lastHiddenTime = Date.now();
      } else {
        // 다시 보일 때 - 오래 숨겨졌으면 히스토리 클리어
        const hiddenDuration = Date.now() - lastHiddenTime;
        if (lastHiddenTime > 0 && hiddenDuration > SIGNAL.SLEEP_THRESHOLD) {
          console.log(`[Socket] 잠자기 복귀 (${Math.round(hiddenDuration / 1000)}초), 다이버전스 히스토리 클리어`);
          setDivergenceHistory([]);
          setDivergenceData(null);
        }
        lastHiddenTime = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = io(`${API_CONFIG.BASE_URL}/mtf`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      // 초기 구독은 useSymbolSubscription 훅에서 처리
      // (URL 기반 심볼로 올바르게 구독하기 위해)
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Binance realtime data
    socket.on('binance:ticker', (data: TickerData) => {
      // symbol 필드가 없거나 다른 심볼이면 무시 (필수 체크)
      if (!data.symbol || data.symbol !== currentSymbolRef.current) {
        return;
      }
      setTicker(data);
    });

    socket.on('binance:orderbook', (data: OrderBookData) => {
      setOrderbook(data);
    });

    socket.on('binance:kline', (data: KlineData) => {
      // symbol 필드가 없거나 다른 심볼이면 무시 (필수 체크)
      if (!data.symbol || data.symbol !== currentSymbolRef.current) {
        return;
      }
      // 타임프레임별로 kline 저장
      klineMapRef.current.set(data.timeframe, data);
      setKlineMapVersion(v => v + 1); // 변경 알림
      setKline(data); // 하위 호환성 유지
    });

    // MTF data from backend
    socket.on('mtf:data', (data: BackendMTFData) => {
      // symbol 필드가 없거나 다른 심볼이면 무시 (다이버전스 잔재 방지)
      // MTF 심볼은 "BTC/USDT" 형식, currentSymbolRef는 "BTCUSDT" 형식
      const normalizedSymbol = data.symbol?.replace('/', '').toUpperCase();
      if (!normalizedSymbol || normalizedSymbol !== currentSymbolRef.current) {
        return;
      }
      setMtfData(data);
      setLastMtfUpdate(Date.now());
    });

    // Liquidation data from backend
    socket.on('data:liquidation', (data: LiquidationData) => {
      // 심볼 체크 (BTCUSDT 형식)
      if (data.symbol && data.symbol !== currentSymbolRef.current) {
        return;
      }
      setLiquidationData(data);
    });

    // Whale data from backend
    socket.on('data:whale', (data: WhaleData) => {
      // 심볼 체크 (BTCUSDT 형식)
      if (data.symbol && data.symbol !== currentSymbolRef.current) {
        return;
      }
      setWhaleData(data);
    });

    // Funding rate from backend
    socket.on('data:fundingRate', (data: FundingRateData) => {
      // 심볼 체크 (BTCUSDT 형식)
      if (data.symbol && data.symbol !== currentSymbolRef.current) {
        return;
      }
      setFundingRateData(data);
    });

    // Coinglass data from backend
    socket.on('data:coinglass', (data: CoinglassData) => {
      // Coinglass는 baseSymbol 사용 (BTC, ETH 등)
      const expectedBase = currentSymbolRef.current?.replace('USDT', '');
      if (data.symbol && data.symbol !== expectedBase) {
        return;
      }
      setCoinglassData(data);
    });

    // Long-short ratio from backend
    socket.on('data:longShortRatio', (data: LongShortRatioData) => {
      setLongShortRatioData(data);
    });

    // 실시간 다이버전스 신호
    socket.on('data:divergence', (data: RealtimeDivergenceData) => {
      // 오래된 신호 무시 (절전 복귀 후 쌓인 신호 방지)
      const signalAge = Date.now() - data.timestamp;
      if (signalAge > SIGNAL.MAX_AGE_MS) {
        console.log(`[Socket] 오래된 다이버전스 신호 무시 (${Math.round(signalAge / 1000)}초 전)`);
        return;
      }

      setDivergenceData(data);
      // 히스토리에 추가 (최대 50개 유지)
      setDivergenceHistory(prev => {
        const newHistory = [...prev, data];
        if (newHistory.length > 50) {
          return newHistory.slice(-50);
        }
        return newHistory;
      });
    });

    socket.on('connect_error', () => {
      // Connection error - socket.io will automatically retry
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // 대기 중인 kline 구독 요청 저장
  const pendingKlineTimeframeRef = useRef<string | null>(null);

  const subscribeKline = useCallback((timeframe: string) => {
    pendingKlineTimeframeRef.current = timeframe;
    if (socketRef.current?.connected) {
      console.log(`[Socket] Subscribing to kline: ${timeframe}`);
      socketRef.current.emit('subscribe:kline', { timeframe });
    } else {
      console.log(`[Socket] Socket not connected, queued kline subscription: ${timeframe}`);
    }
  }, []);

  // 소켓 연결 시 대기 중인 kline 구독 처리
  useEffect(() => {
    if (isConnected && pendingKlineTimeframeRef.current) {
      console.log(`[Socket] Connected, subscribing to pending kline: ${pendingKlineTimeframeRef.current}`);
      socketRef.current?.emit('subscribe:kline', { timeframe: pendingKlineTimeframeRef.current });
    }
  }, [isConnected]);

  const subscribeMtf = useCallback((symbol: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbol });
    }
  }, []);

  // 타임프레임별 kline 가져오기
  const getKline = useCallback((timeframe: string): KlineData | null => {
    return klineMapRef.current.get(timeframe) || null;
  }, [klineMapVersion]); // klineMapVersion 변경 시 함수 갱신

  // 심볼 변경 시 데이터 초기화 및 재구독
  const subscribeSymbol = useCallback((symbol: string) => {
    // 같은 심볼이면 무시 (중복 구독 방지)
    if (symbol === currentSymbolRef.current) {
      return;
    }

    const isFirstSubscription = currentSymbolRef.current === '';
    console.log(`[Socket] ${isFirstSubscription ? 'First subscription' : 'Changing symbol'} to: ${symbol}`);

    setCurrentSymbol(symbol);
    currentSymbolRef.current = symbol; // ref도 업데이트 (이벤트 핸들러용)

    // 첫 구독이 아닐 때만 기존 데이터 초기화 (깜빡임 방지)
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

    // 백엔드에 심볼 변경 요청
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbol });
    }
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        ticker,
        orderbook,
        kline,
        klineMap: klineMapRef.current,
        getKline,
        mtfData,
        lastMtfUpdate,
        liquidationData,
        whaleData,
        fundingRateData,
        coinglassData,
        longShortRatioData,
        divergenceData,
        divergenceHistory,
        currentSymbol,
        subscribeKline,
        subscribeMtf,
        subscribeSymbol,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
