/**
 * 차트/UI 색상 중앙 관리
 * 모든 색상은 여기서 import하여 사용
 */

// 기본 색상 (Tailwind 기반)
export const COLORS = {
  // 방향성 색상
  LONG: '#22c55e',        // green-500
  LONG_LIGHT: '#86efac',  // green-300 (테두리용)
  SHORT: '#ef4444',       // red-500
  SHORT_LIGHT: '#fca5a5', // red-300 (테두리용)
  NEUTRAL: '#6b7280',     // gray-500

  // 다이버전스/신호 색상
  BULLISH: '#a3e635',   // lime-400
  BEARISH: '#f87171',   // red-400
  FILTERED: '#9ca3af',  // gray-400

  // 지표 색상
  RSI: '#fb923c',       // orange-400
  OBV: '#60a5fa',       // blue-400
  CVD: '#c084fc',       // purple-400
  OI: '#fbbf24',        // amber-400
  ORANGE: '#fb923c',    // orange-400 (미니차트용)
  CYAN: '#22d3ee',      // cyan-400 (롱타점용)

  // 가격 레벨
  POC: '#facc15',       // yellow-400
  VAH: '#ef4444',       // red-500
  VAL: '#22c55e',       // green-500

  // 배경/그리드
  CHART_BG: '#0c0908',
  GRID_WARM: '#2d2620', // 따뜻한 그리드 (rgba로 25% 사용)
  WHITE: '#ffffff',
  BLACK: '#000000',

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
  // 캔들 바디
  CANDLE_UP: rgba(COLORS.LONG, 0.3),
  CANDLE_DOWN: rgba(COLORS.SHORT, 0.3),

  // 캔들 테두리
  CANDLE_UP_BORDER: rgba(COLORS.LONG_LIGHT, 0.8),
  CANDLE_DOWN_BORDER: rgba(COLORS.SHORT_LIGHT, 0.8),

  // 캔들 심지
  CANDLE_UP_WICK: rgba(COLORS.LONG, 0.6),
  CANDLE_DOWN_WICK: rgba(COLORS.SHORT, 0.6),

  // 라인
  LINE_LONG: rgba(COLORS.LONG, 0.5),
  LINE_SHORT: rgba(COLORS.SHORT, 0.5),
  LINE_NEUTRAL: rgba(COLORS.NEUTRAL, 0.5),

  // 다이버전스
  DIV_BULLISH: rgba(COLORS.BULLISH, 0.95),
  DIV_BEARISH: rgba(COLORS.BEARISH, 0.95),
  DIV_FILTERED: rgba(COLORS.FILTERED, 0.7),

  // 그리드/구분선
  GRID: rgba(COLORS.GRID_WARM, 0.25),
  SEPARATOR: rgba(COLORS.WHITE, 0.3),
  SEPARATOR_HOVER: rgba(COLORS.WHITE, 0.5),

  // 영역
  AREA_LONG: rgba(COLORS.LONG, 0.15),
  AREA_SHORT: rgba(COLORS.SHORT, 0.15),
  AREA_NEUTRAL: rgba(COLORS.NEUTRAL, 0.15),

  // 미니 차트 (오렌지)
  MINI_LINE: rgba(COLORS.ORANGE, 0.9),
  MINI_TOP: rgba(COLORS.ORANGE, 0.3),
  MINI_BOTTOM: rgba(COLORS.ORANGE, 0.05),

  // 신호 마커
  SIGNAL_BULLISH: rgba(COLORS.BULLISH, 0.9),
  SIGNAL_BEARISH: rgba(COLORS.SHORT, 0.9),
  SIGNAL_ORANGE: rgba(COLORS.ORANGE, 0.9),
  SIGNAL_CYAN: rgba(COLORS.CYAN, 0.9),

  // 그림자
  SHADOW_DARK: rgba(COLORS.BLACK, 0.8),
  SHADOW_MEDIUM: rgba(COLORS.BLACK, 0.5),
} as const;

// 지표 라인 색상
export const INDICATOR_COLORS = {
  // CVD (파란색 계열)
  CVD_LINE: rgba(COLORS.OBV, 0.5),  // blue-400

  // OI (보라색)
  OI_LINE: rgba(COLORS.CVD, 0.5),   // purple-400

  // ATR (오렌지)
  ATR_LINE: rgba(COLORS.ORANGE, 0.7),

  // EMA 라인 (투명도 25%)
  EMA_FAST: rgba(COLORS.SHORT, 0.25),      // 빨강 (가장 빠른)
  EMA_MID: 'rgba(59, 130, 246, 0.25)',     // 파랑 (중간)
  EMA_SLOW: rgba(COLORS.LONG, 0.25),       // 초록 (가장 느린)

  // 다이버전스 라인
  DIV_BULLISH: rgba(COLORS.BULLISH, 0.95),
  DIV_BEARISH: rgba(COLORS.BEARISH, 0.95),
  DIV_FILTERED: rgba(COLORS.FILTERED, 0.7),

  // 횡보 구간 (amber)
  CONSOLIDATION_BG: rgba(COLORS.OI, 0.08),
  CONSOLIDATION_BORDER: rgba(COLORS.OI, 0.4),
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
