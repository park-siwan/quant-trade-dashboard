/**
 * 지표 임계값 중앙 관리
 * 모든 하드코딩된 임계값은 여기서 관리
 */

// RSI 임계값
export const RSI = {
  // 기본 레벨
  OVERBOUGHT: 70,       // 과매수 (매도 신호)
  OVERSOLD: 30,         // 과매도 (매수 신호)
  // 다이버전스 필터링
  FILTER_HIGH: 60,      // bearish 다이버전스 유효 기준
  FILTER_LOW: 40,       // bullish 다이버전스 유효 기준
  // 스코어링용 (롱 진입)
  LONG: {
    OVERHEATED: 75,     // 과열 - 추격금지
    HIGH: 65,           // 고점대
    PULLBACK: 35,       // 눌림목 (상승추세 중)
    CORRECTION: 45,     // 조정 구간
  },
  // 스코어링용 (숏 진입)
  SHORT: {
    EXHAUSTED: 25,      // 침체 - 추격금지
    LOW: 35,            // 저점대
    BOUNCE: 65,         // 반등 (하락추세 중)
    RETRACEMENT: 55,    // 되돌림 구간
  },
} as const;

// ADX 임계값
export const ADX = {
  STRONG_TREND: 25,     // 강한 추세 기준
  VERY_STRONG: 40,      // 매우 강한 추세/과열
  OPTIMAL_MIN: 20,      // 적정 추세 하한
  OPTIMAL_MAX: 30,      // 적정 추세 상한
} as const;

// ATR 임계값
export const ATR = {
  HIGH_VOLATILITY: 1.5, // 고변동성
  LOW_VOLATILITY: 0.8,  // 저변동성
} as const;

// 점수 임계값
export const SCORE = {
  // 신뢰도 등급
  CONFIDENCE: {
    HIGHEST: 80,
    HIGH: 65,
    MEDIUM: 50,
    LOW: 35,
  },
  // 알림 임계값
  ALERT: {
    STRONG_SIGNAL: 70,  // 강한 신호
    ENTRY: 60,          // 진입 타점
  },
  // 방향 결정
  DIRECTION_DIFF: 10,   // 롱/숏 방향 결정 점수 차이
} as const;

// 펀딩레이트 임계값
export const FUNDING = {
  OVERHEATED: 0.01,     // 과열 기준 (±1%)
  SIGNIFICANT: 0.005,   // 의미있는 변화 (±0.5%)
} as const;

// 쿨다운 시간 (ms)
export const COOLDOWN = {
  ALERT: 300000,        // 알림 쿨다운 (5분)
  DUPLICATE_MSG: 1000,  // 중복 메시지 방지 (1초)
} as const;
