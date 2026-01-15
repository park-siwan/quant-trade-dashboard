/**
 * 차트/UI 색상 중앙 관리
 * 모든 색상은 여기서 import하여 사용
 */

// 기본 색상 (Tailwind 기반)
export const COLORS = {
  // 방향성 색상
  LONG: '#22c55e',      // green-500
  SHORT: '#ef4444',     // red-500
  NEUTRAL: '#6b7280',   // gray-500

  // 다이버전스/신호 색상
  BULLISH: '#a3e635',   // lime-400
  BEARISH: '#f87171',   // red-400
  FILTERED: '#9ca3af',  // gray-400

  // 지표 색상
  RSI: '#fb923c',       // orange-400
  OBV: '#60a5fa',       // blue-400
  CVD: '#c084fc',       // purple-400
  OI: '#fbbf24',        // amber-400

  // 가격 레벨
  POC: '#facc15',       // yellow-400
  VAH: '#ef4444',       // red-500
  VAL: '#22c55e',       // green-500

  // 배경
  CHART_BG: '#0c0908',

  // 텍스트
  TEXT_PRIMARY: '#ffffff',
  TEXT_SECONDARY: '#d1d5db',
  TEXT_MUTED: '#9ca3af',
} as const;

// RGBA 생성 헬퍼
export const rgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 자주 쓰는 투명도 색상
export const CHART_COLORS = {
  // 캔들
  CANDLE_UP: rgba(COLORS.LONG, 0.3),
  CANDLE_DOWN: rgba(COLORS.SHORT, 0.3),

  // 라인
  LINE_LONG: rgba(COLORS.LONG, 0.5),
  LINE_SHORT: rgba(COLORS.SHORT, 0.5),
  LINE_NEUTRAL: rgba(COLORS.NEUTRAL, 0.5),

  // 다이버전스
  DIV_BULLISH: rgba(COLORS.BULLISH, 0.95),
  DIV_BEARISH: rgba(COLORS.BEARISH, 0.95),
  DIV_FILTERED: rgba(COLORS.FILTERED, 0.7),

  // 그리드
  GRID: 'rgba(45, 38, 32, 0.25)',

  // 영역
  AREA_LONG: rgba(COLORS.LONG, 0.15),
  AREA_SHORT: rgba(COLORS.SHORT, 0.15),
  AREA_NEUTRAL: rgba(COLORS.NEUTRAL, 0.15),
} as const;

// 신호 스타일 (signal.ts에서 이전)
export const SIGNAL_COLORS = {
  long_ok: {
    rgb: COLORS.LONG,
    light: rgba(COLORS.LONG, 0.15),
    fade: rgba(COLORS.LONG, 0.02),
  },
  short_ok: {
    rgb: COLORS.SHORT,
    light: rgba(COLORS.SHORT, 0.15),
    fade: rgba(COLORS.SHORT, 0.02),
  },
  wait: {
    rgb: COLORS.NEUTRAL,
    light: rgba(COLORS.NEUTRAL, 0.15),
    fade: rgba(COLORS.NEUTRAL, 0.02),
  },
} as const;
