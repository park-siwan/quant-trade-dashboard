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
  type: 'rsi' | 'obv';
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
}

export interface ApiResponse {
  success: boolean;
  data: {
    candles: number[][];
    indicators: {
      rsi: (number | null)[];
      obv: number[];
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
      total: DivergenceSummaryItem;
    };
    trendAnalysis?: TrendAnalysis;
    crossoverEvents?: CrossoverEvent[];
  };
}
