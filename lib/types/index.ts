// API 응답 타입
export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DivergenceSignal {
  index: number;
  type: 'rsi' | 'obv' | 'cvd' | 'oi';
  direction: 'bullish' | 'bearish';
  phase: 'start' | 'end' | 'entry';
  timestamp: number;
  datetime: string;
  isFiltered?: boolean; // 필터링 여부
  reason?: string; // 필터링 사유
  emaFilter?: SignalClassification; // EMA 필터 결과
}

export interface DivergenceSummaryItem {
  valid: number;
  filtered: number;
  total: number;
}

// EMA 데이터
export interface EmaData {
  ema20: number[];
  ema50: number[];
  ema200: number[];
}

// 추세 타입
export type Trend = 'bullish' | 'bearish' | 'neutral';

// 크로스오버 타입
export type Crossover = 'golden_cross' | 'dead_cross' | 'none';

// 신호 강도 타입
export type SignalStrength = 'strong' | 'medium' | 'weak' | 'invalid';

// 추세 분석 결과
export interface TrendAnalysis {
  trend: Trend;
  crossover: Crossover;
  currentPrice: number;
  ema20: number;
  ema50: number;
  ema200: number;
}

// 신호 강도 분류 결과
export interface SignalClassification {
  strength: SignalStrength;
  reason: string;
  leverageRecommendation: '5x' | '3x' | 'skip';
}

// 크로스오버 이벤트
export interface CrossoverEvent {
  index: number;
  timestamp: number;
  type: Crossover;
  ema20: number;
  ema50: number;
  // 볼륨 기반 필터링
  isFiltered?: boolean; // 볼륨이 낮으면 true
  volume?: number; // 해당 캔들 볼륨
  avgVolume?: number; // 평균 볼륨
}

// CVD + OI 관련 타입
export type PriceDirection = 'up' | 'down' | 'neutral';
export type CvdDirection = 'up' | 'down' | 'neutral';
export type OiDirection = 'up' | 'down' | 'neutral';

export type MarketSignalType =
  | 'REAL_BULL' // 진짜 상승
  | 'SHORT_TRAP' // 숏 유인 상승
  | 'PUMP_DUMP' // 청산 기반 펌핑
  | 'MORE_DROP' // 더 하락
  | 'LONG_ENTRY'; // 저점 롱 타점

export interface MarketSignal {
  timestamp: number;
  type: MarketSignalType;
  price: number;
  priceDirection: PriceDirection;
  cvd: number;
  cvdDirection: CvdDirection;
  oi: number;
  oiDirection: OiDirection;
  description: string;
  action: 'LONG' | 'SHORT' | 'CLOSE' | 'WAIT';
}

export interface CvdOiData {
  cvd: number[];
  oi: number[];
  signals: MarketSignal[];
}

export interface ApiResponse {
  success: boolean;
  data: {
    candles: number[][];
    indicators: {
      rsi: (number | null)[];
      obv: number[];
      cvd?: number[]; // CVD 데이터
      oi?: number[]; // OI 데이터
      ema?: EmaData;
    };
    signals: {
      divergence: DivergenceSignal[];
    };
    summary: {
      rsi: {
        bullish: DivergenceSummaryItem;
        bearish: DivergenceSummaryItem;
      };
      obv: {
        bullish: DivergenceSummaryItem;
        bearish: DivergenceSummaryItem;
      };
      cvd: {
        bullish: DivergenceSummaryItem;
        bearish: DivergenceSummaryItem;
      };
      oi: {
        bullish: DivergenceSummaryItem;
        bearish: DivergenceSummaryItem;
      };
      total: DivergenceSummaryItem;
    };
    trendAnalysis?: TrendAnalysis;
    crossoverEvents?: CrossoverEvent[];
    cvdOi?: CvdOiData; // CVD + OI 3중 조합 신호
  };
}
