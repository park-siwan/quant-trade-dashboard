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
  priceValue?: number; // 해당 위치의 가격 (bearish: high, bullish: low) - 차트 라인용
  isFiltered?: boolean; // 필터링 여부
  reason?: string; // 필터링 사유
  emaFilter?: SignalClassification; // EMA 필터 결과
  confirmed?: boolean; // 피봇 확정 여부 (rightBars만큼 확인되면 true)
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

// 크로스오버 이벤트 (EMA 50/200 기준 - 전통적 골든/데드크로스)
export interface CrossoverEvent {
  index: number;
  timestamp: number;
  type: Crossover;
  ema50: number;
  ema200: number;
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
  oi: (number | null)[]; // Binance API 30일 제한으로 오래된 데이터는 null
  signals: MarketSignal[];
}

// 횡보 구간 타입
export interface ConsolidationZone {
  startIndex: number;
  endIndex: number;
  startTimestamp: number;
  endTimestamp: number;
  high: number; // 횡보 구간 최고가
  low: number; // 횡보 구간 최저가
  rangePercent: number; // 변동폭 (%)
  candleCount: number; // 캔들 개수
  isActive: boolean; // 현재 진행 중인 횡보인지
}

export interface ConsolidationData {
  zones: ConsolidationZone[];
  isCurrentlyConsolidating: boolean;
  currentZone: ConsolidationZone | null;
}

// VWAP + ATR 데이터 타입
export interface VwapAtrData {
  vwap: number[]; // VWAP 배열
  atr: (number | null)[]; // ATR 배열 (period 이전은 null)
  currentVwap: number; // 현재 VWAP
  currentAtr: number | null; // 현재 ATR
  atrPercent: number | null; // ATR을 현재가 대비 %로 표현
  avgAtrPercent: number | null; // 평균 ATR % (최근 50개 캔들)
  atrRatio: number | null; // 현재 ATR / 평균 ATR (1.0 = 평균, 1.5 = 50% 높음)
  suggestedStopLoss: {
    long: number; // 롱 포지션 손절가 (현재가 - 2*ATR)
    short: number; // 숏 포지션 손절가 (현재가 + 2*ATR)
  } | null;
}

// 오더블록 타입
export interface OrderBlock {
  type: 'bullish' | 'bearish';
  startIndex: number;
  timestamp: number;
  high: number; // 오더블록 상단
  low: number; // 오더블록 하단
  isActive: boolean; // 아직 터치되지 않은 활성 오더블록
  strength: 'strong' | 'medium' | 'weak'; // 오더블록 강도
}

export interface OrderBlockData {
  blocks: OrderBlock[];
  activeBlocks: OrderBlock[];
}

// 오더북 타입 (호가창 매수/매도벽)
export interface OrderBookLevel {
  price: number;
  size: number;
  total: number; // 누적 물량
}

export interface OrderWall {
  price: number;
  size: number;
  type: 'bid' | 'ask';
  strength: 'major' | 'minor'; // 물량 크기에 따른 강도
  percentFromPrice: number; // 현재가 대비 %
}

export interface OrderBookData {
  symbol: string;
  timestamp: number;
  bids: OrderBookLevel[]; // 매수 호가
  asks: OrderBookLevel[]; // 매도 호가
  bidWalls: OrderWall[]; // 감지된 매수벽
  askWalls: OrderWall[]; // 감지된 매도벽
  totalBidVolume: number; // 총 매수 물량
  totalAskVolume: number; // 총 매도 물량
  bidAskRatio: number; // 매수/매도 비율 (>1 = 매수 우세)
}

// 고래 거래 타입
export interface WhaleTrade {
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  usdValue: number;
  timestamp: number;
  tradeId: number;
}

export interface WhaleStats {
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
}

export interface WhaleSummary {
  symbol: string;
  recentTrades: WhaleTrade[];
  stats: {
    last5m: WhaleStats;
    last15m: WhaleStats;
    last1h: WhaleStats;
  };
}

// 청산 데이터 타입
export interface LiquidationEvent {
  symbol: string;
  side: 'Buy' | 'Sell'; // Buy = 숏청산(가격상승), Sell = 롱청산(가격하락)
  price: number;
  size: number;
  timestamp: number;
  usdValue: number; // USD 가치
}

export interface LiquidationStats {
  longLiq: number; // 롱 청산 USD
  shortLiq: number; // 숏 청산 USD
  totalUsd: number;
}

export interface LiquidationSummary {
  symbol: string;
  recentLiquidations: LiquidationEvent[];
  stats: {
    last1m: LiquidationStats;
    last5m: LiquidationStats;
    last15m: LiquidationStats;
  };
}

// 시장 구조 (BOS/CHoCH) 타입
export type MarketTrend = 'bullish' | 'bearish' | 'ranging';
export type StructureType = 'BOS' | 'CHoCH';
export type SwingType = 'HH' | 'HL' | 'LH' | 'LL';

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
  swingType?: SwingType;
}

export interface StructureBreak {
  type: StructureType;
  direction: 'bullish' | 'bearish';
  breakIndex: number;
  breakTime: number;
  breakPrice: number;
  swingPoint: SwingPoint;
  strength: 'strong' | 'medium' | 'weak';
  description: string;
  rsiAtBreak?: number; // CHoCH 발생 시점 RSI
  isOverheated?: boolean; // RSI 과열 여부 (CHoCH 유효성)
  adxFiltered?: boolean; // ADX 필터링 여부 (추세장에서 역추세 신호 필터링)
  adxValue?: number; // ADX 값
}

export interface MarketStructureData {
  currentTrend: MarketTrend;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  structureBreaks: StructureBreak[];
  lastBOS: StructureBreak | null;
  lastCHoCH: StructureBreak | null;
}

// ADX (추세 강도) 타입
export type TrendStrength = 'none' | 'forming' | 'strong' | 'very_strong' | 'extreme';
export type AdxTrendDirection = 'bullish' | 'bearish' | 'neutral';
export type AdxRecommendation = 'trend_follow' | 'counter_trend' | 'wait';

export interface AdxData {
  adx: (number | null)[];
  plusDi: (number | null)[];
  minusDi: (number | null)[];
  currentAdx: number | null;
  currentPlusDi: number | null;
  currentMinusDi: number | null;
  trendStrength: TrendStrength;
  trendDirection: AdxTrendDirection;
  isTrending: boolean; // ADX >= 25
  recommendation: AdxRecommendation;
  description: string;
}

export interface ApiResponse {
  success: boolean;
  data: {
    candles: number[][];
    indicators: {
      rsi: (number | null)[];
      obv: number[];
      cvd?: number[]; // CVD 데이터
      oi?: (number | null)[]; // OI 데이터 (Binance API 30일 제한으로 오래된 데이터는 null)
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
    consolidation?: ConsolidationData; // 횡보 구간 데이터
    vwapAtr?: VwapAtrData; // VWAP + ATR 데이터
    orderBlocks?: OrderBlockData; // 오더블록 데이터
    orderBook?: OrderBookData; // 오더북 매수/매도벽 데이터
    marketStructure?: MarketStructureData; // 시장 구조 (BOS/CHoCH)
    adx?: AdxData; // ADX 추세 강도 데이터
  };
}

// MTF (Multi-Timeframe) 타입
export type MTFStatus = 'bullish' | 'bearish' | 'neutral';
export type MTFStrength = 'strong' | 'medium' | 'weak' | 'neutral'; // 강도

// Action 추천 타입
export type MTFAction =
  | 'long_ok'      // 🟢 롱 OK - 상위TF 추세 + 다이버전스 일치
  | 'short_ok'     // 🔴 숏 OK - 상위TF 추세 + 다이버전스 일치
  | 'reversal_warn' // ⚠️ 반전주의 - 상위TF 추세와 다이버전스 역행
  | 'trend_hold'   // 추세유지 - 신호 없음, 추세 따라가기
  | 'wait';        // 대기 - 명확한 신호 없음

export interface MTFActionInfo {
  action: MTFAction;
  reason: string;
}

// 다이버전스 정보 타입
export interface MTFDivergenceInfo {
  type: 'rsi' | 'obv' | 'cvd' | 'oi';
  direction: 'bullish' | 'bearish';
  timestamp: number; // 발생 시간
  candlesAgo: number; // 몇 캔들 전
  isExpired: boolean; // 유효기간 만료 여부
  confirmed?: boolean; // 피봇 확정 여부 (캔들 종가 확정 후 true)
  isFiltered?: boolean; // RSI 필터링 여부 (필터링된 경우 알림 안함)
  strength?: number; // 다이버전스 강도 (0-100, 선분 길이/각도 기반)
}

export interface MTFTimeframeData {
  timeframe: string;
  trend: MTFStatus;
  rsi: number | null;
  cvdDirection: MTFStatus;
  cvdStrength: MTFStrength; // CVD 강도
  cvdChange: number; // CVD 변화율 (%)
  oiDirection: MTFStatus;
  oiStrength: MTFStrength; // OI 강도
  oiChange: number; // OI 변화율 (%)
  divergence: MTFDivergenceInfo | null; // 대표 다이버전스 (우선순위 1위)
  divergences: MTFDivergenceInfo[]; // 모든 다이버전스 (우선순위 정렬)
  currentPrice: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  // ADX (추세 강도)
  adx: number | null;
  isStrongTrend: boolean; // ADX >= 25
  // ATR Ratio (평균 대비 변동성)
  atrRatio: number | null;
  actionInfo: MTFActionInfo; // 추천 액션
}

export interface MTFSignalValidation {
  valid: boolean;
  confidence: number; // 0~1
  reason?: string;
  details: {
    timeframe: string;
    trend: MTFStatus;
    aligned: boolean;
  }[];
}

export interface MTFOverviewData {
  timeframes: MTFTimeframeData[];
  overallTrend: MTFStatus;
  alignmentScore: number; // 0~1, 모든 타임프레임이 같은 방향일수록 높음
}

// 지지/저항 영역 타입
export type ZoneType = 'support' | 'resistance' | 'neutral';
export type ZoneSource = 'VAL' | 'VAH' | 'OB_SUPPORT' | 'OB_RESISTANCE' | 'POC';

export interface SupportResistanceZone {
  id: string;
  source: ZoneSource;
  type: ZoneType;
  priceTop: number;
  priceBottom: number;
  strength: number;  // 0-1
}

export interface BlendedZone extends SupportResistanceZone {
  overlappingSources: ZoneSource[];
  blendType: 'support' | 'resistance' | 'conflict';
  finalColor: string;
}

