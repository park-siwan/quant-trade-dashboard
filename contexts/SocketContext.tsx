'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '@/lib/config';

// Types
export interface TickerData {
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
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

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  ticker: TickerData | null;
  orderbook: OrderBookData | null;
  kline: KlineData | null;
  mtfData: BackendMTFData | null;
  lastMtfUpdate: number;
  liquidationData: LiquidationData | null;
  whaleData: WhaleData | null;
  fundingRateData: FundingRateData | null;
  coinglassData: CoinglassData | null;
  longShortRatioData: LongShortRatioData | null;
  subscribeKline: (timeframe: string) => void;
  subscribeMtf: (symbol: string) => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  ticker: null,
  orderbook: null,
  kline: null,
  mtfData: null,
  lastMtfUpdate: 0,
  liquidationData: null,
  whaleData: null,
  fundingRateData: null,
  coinglassData: null,
  longShortRatioData: null,
  subscribeKline: () => {},
  subscribeMtf: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [orderbook, setOrderbook] = useState<OrderBookData | null>(null);
  const [kline, setKline] = useState<KlineData | null>(null);
  const [mtfData, setMtfData] = useState<BackendMTFData | null>(null);
  const [lastMtfUpdate, setLastMtfUpdate] = useState(0);
  const [liquidationData, setLiquidationData] = useState<LiquidationData | null>(null);
  const [whaleData, setWhaleData] = useState<WhaleData | null>(null);
  const [fundingRateData, setFundingRateData] = useState<FundingRateData | null>(null);
  const [coinglassData, setCoinglassData] = useState<CoinglassData | null>(null);
  const [longShortRatioData, setLongShortRatioData] = useState<LongShortRatioData | null>(null);

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
      socket.emit('subscribe', { symbol: 'BTCUSDT' });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Binance realtime data
    socket.on('binance:ticker', (data: TickerData) => {
      setTicker(data);
    });

    socket.on('binance:orderbook', (data: OrderBookData) => {
      setOrderbook(data);
    });

    socket.on('binance:kline', (data: KlineData) => {
      setKline(data);
    });

    // MTF data from backend
    socket.on('mtf:data', (data: BackendMTFData) => {
      setMtfData(data);
      setLastMtfUpdate(Date.now());
    });

    // Liquidation data from backend
    socket.on('data:liquidation', (data: LiquidationData) => {
      setLiquidationData(data);
    });

    // Whale data from backend
    socket.on('data:whale', (data: WhaleData) => {
      setWhaleData(data);
    });

    // Funding rate from backend
    socket.on('data:fundingRate', (data: FundingRateData) => {
      setFundingRateData(data);
    });

    // Coinglass data from backend
    socket.on('data:coinglass', (data: CoinglassData) => {
      setCoinglassData(data);
    });

    // Long-short ratio from backend
    socket.on('data:longShortRatio', (data: LongShortRatioData) => {
      setLongShortRatioData(data);
    });

    socket.on('connect_error', () => {
      // Connection error - socket.io will automatically retry
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const subscribeKline = useCallback((timeframe: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe:kline', { timeframe });
    }
  }, []);

  const subscribeMtf = useCallback((symbol: string) => {
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
        mtfData,
        lastMtfUpdate,
        liquidationData,
        whaleData,
        fundingRateData,
        coinglassData,
        longShortRatioData,
        subscribeKline,
        subscribeMtf,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
