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
}

export interface ApiResponse {
  success: boolean;
  data: {
    candles: number[][];
    indicators: {
      rsi: (number | null)[];
      obv: number[];
    };
    signals: {
      divergence: DivergenceSignal[];
    };
    summary: {
      rsi: { bullish: number; bearish: number };
      obv: { bullish: number; bearish: number };
      total: number;
    };
  };
}
