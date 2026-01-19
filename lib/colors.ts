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

// 무채색 캔들 색상 (다이버전스 강조용)
export const GRAY_UP = '#9ca3af';      // gray-400 (밝은 회색 - 양봉)
export const GRAY_DOWN = '#4b5563';    // gray-600 (어두운 회색 - 음봉)

// 자주 쓰는 투명도 색상
export const CHART_COLORS = {
  // 캔들 바디 (무채색)
  CANDLE_UP: rgba(GRAY_UP, 0.3),
  CANDLE_DOWN: rgba(GRAY_DOWN, 0.4),

  // 캔들 테두리 (무채색)
  CANDLE_UP_BORDER: rgba(GRAY_UP, 0.7),
  CANDLE_DOWN_BORDER: rgba(GRAY_DOWN, 0.8),

  // 캔들 심지 (무채색)
  CANDLE_UP_WICK: rgba(GRAY_UP, 0.5),
  CANDLE_DOWN_WICK: rgba(GRAY_DOWN, 0.6),

  // 라인 (무채색)
  LINE_LONG: rgba(GRAY_UP, 0.5),
  LINE_SHORT: rgba(GRAY_DOWN, 0.5),
  LINE_NEUTRAL: rgba(COLORS.NEUTRAL, 0.5),

  // 다이버전스
  DIV_BULLISH: rgba(COLORS.BULLISH, 0.95),
  DIV_BEARISH: rgba(COLORS.BEARISH, 0.95),
  DIV_FILTERED: rgba(COLORS.FILTERED, 0.7),

  // 그리드/구분선
  GRID: rgba(COLORS.GRID_WARM, 0.25),
  SEPARATOR: rgba(COLORS.WHITE, 0.3),
  SEPARATOR_HOVER: rgba(COLORS.WHITE, 0.5),

  // 영역 (무채색)
  AREA_LONG: 'rgba(160, 160, 160, 0.12)',
  AREA_SHORT: 'rgba(100, 100, 100, 0.15)',
  AREA_NEUTRAL: rgba(COLORS.NEUTRAL, 0.15),

  // 미니 차트 (무채색 - 어두운 회색)
  MINI_LINE: 'rgba(60, 60, 60, 1)',
  MINI_TOP: 'rgba(50, 50, 50, 0.15)',
  MINI_BOTTOM: 'rgba(50, 50, 50, 0.01)',

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
  // CVD (무채색)
  CVD_LINE: 'rgba(140, 140, 140, 0.4)',

  // OI (무채색)
  OI_LINE: 'rgba(120, 120, 120, 0.4)',

  // ATR (무채색)
  ATR_LINE: 'rgba(160, 160, 160, 0.5)',

  // EMA 라인 (투명도 25%)
  EMA_FAST: rgba(COLORS.SHORT, 0.25),      // 빨강 (가장 빠른)
  EMA_MID: 'rgba(59, 130, 246, 0.25)',     // 파랑 (중간)
  EMA_SLOW: rgba(COLORS.LONG, 0.25),       // 초록 (가장 느린)

  // 다이버전스 라인
  DIV_BULLISH: rgba(COLORS.BULLISH, 0.95),
  DIV_BEARISH: rgba(COLORS.BEARISH, 0.95),
  DIV_FILTERED: rgba(COLORS.FILTERED, 0.7),

  // 횡보 구간 (무채색)
  CONSOLIDATION_BG: 'rgba(150, 150, 150, 0.06)',
  CONSOLIDATION_BORDER: 'rgba(150, 150, 150, 0.3)',

  // Volume Profile 라인 (무채색)
  POC: 'rgba(200, 200, 200, 0.7)',
  POC_LABEL: '#c8c8c8',
  VAH: 'rgba(170, 170, 170, 0.5)',
  VAH_LABEL: 'rgba(170, 170, 170, 0.7)',
  VAL: 'rgba(130, 130, 130, 0.5)',
  VAL_LABEL: 'rgba(130, 130, 130, 0.7)',
  VWAP: 'rgba(180, 180, 180, 0.6)',
  VWAP_LABEL: '#b4b4b4',

  // ATR 타겟 라인 (무채색)
  ATR_LONG: 'rgba(160, 160, 160, 0.5)',
  ATR_LONG_LABEL: 'rgba(160, 160, 160, 0.8)',
  ATR_SHORT: 'rgba(120, 120, 120, 0.5)',
  ATR_SHORT_LABEL: 'rgba(120, 120, 120, 0.8)',

  // 오더블록 (무채색)
  SUPPORT: 'rgba(170, 170, 170, 0.6)',
  RESISTANCE: 'rgba(100, 100, 100, 0.6)',
} as const;

// 지지/저항 영역 색상
export const ZONE_COLORS = {
  SUPPORT: {
    fill: 'rgba(34, 197, 94, 0.15)',      // 초록
    fillStrong: 'rgba(34, 197, 94, 0.25)',
    border: 'rgba(34, 197, 94, 0.4)',
  },
  RESISTANCE: {
    fill: 'rgba(239, 68, 68, 0.15)',      // 빨강
    fillStrong: 'rgba(239, 68, 68, 0.25)',
    border: 'rgba(239, 68, 68, 0.4)',
  },
  CONFLICT: {
    fill: 'rgba(234, 179, 8, 0.20)',      // 노랑 (혼조)
    border: 'rgba(234, 179, 8, 0.5)',
  },
  POC: {
    line: 'rgba(255, 255, 255, 0.5)',     // 흰색 점선
  },
} as const;

// 마켓 신호 마커 색상
export const MARKER_COLORS = {
  REAL_BULL: rgba(COLORS.BULLISH, 0.9),
  SHORT_TRAP: rgba(COLORS.BULLISH, 0.9),
  PUMP_DUMP: rgba(COLORS.ORANGE, 0.9),
  MORE_DROP: rgba(COLORS.SHORT, 0.9),
  LONG_ENTRY: rgba(COLORS.CYAN, 0.9),
} as const;

// 측정 박스 색상
export const MEASURE_COLORS = {
  BG: 'rgba(59, 130, 246, 0.9)',
  GLOW: '0 0 8px rgba(59, 130, 246, 0.6)',
} as const;

// 호가벽 색상 (무채색)
export const WALL_COLORS = {
  // 매도벽 (어두운 회색)
  ASK_LARGE: 'rgba(100, 100, 100, 0.7)',
  ASK_NORMAL: 'rgba(100, 100, 100, 0.4)',
  ASK_BORDER: '#646464',
  // 매수벽 (밝은 회색)
  BID_LARGE: 'rgba(160, 160, 160, 0.7)',
  BID_NORMAL: 'rgba(160, 160, 160, 0.4)',
  BID_BORDER: '#a0a0a0',
  // 스프레드 구분선
  SPREAD: 'rgba(180, 180, 180, 0.5)',
} as const;

// 글로우 점 색상 (미니차트용)
export const GLOW_DOT_COLORS = {
  green: {
    bg: COLORS.LONG,
    shadow: `${rgba(COLORS.LONG, 0.8)}, 0 0 16px ${rgba(COLORS.LONG, 0.5)}, 0 0 24px ${rgba(COLORS.LONG, 0.3)}`,
  },
  red: {
    bg: COLORS.SHORT,
    shadow: `${rgba(COLORS.SHORT, 0.8)}, 0 0 16px ${rgba(COLORS.SHORT, 0.5)}, 0 0 24px ${rgba(COLORS.SHORT, 0.3)}`,
  },
  gray: {
    bg: COLORS.NEUTRAL,
    shadow: `${rgba(COLORS.NEUTRAL, 0.8)}, 0 0 16px ${rgba(COLORS.NEUTRAL, 0.5)}, 0 0 24px ${rgba(COLORS.NEUTRAL, 0.3)}`,
  },
} as const;

// 툴팁 색상
export const TOOLTIP_COLORS = {
  // 배경/기본
  BG: rgba(COLORS.WHITE, 0.05),
  BORDER: rgba(COLORS.ORANGE, 0.3),
  DIVIDER: rgba(COLORS.WHITE, 0.2),
  DIVIDER_LIGHT: rgba(COLORS.WHITE, 0.1),
  SHADOW: `0 8px 32px ${rgba(COLORS.BLACK, 0.4)}, 0 0 20px ${rgba(COLORS.ORANGE, 0.1)}`,

  // 알림 박스 - 높은 신뢰도 (라임)
  CONFIRM_BG: rgba(COLORS.BULLISH, 0.1),
  CONFIRM_BORDER: rgba(COLORS.BULLISH, 0.3),

  // 알림 박스 - 신호 상충 (오렌지)
  CONFLICT_BG: rgba(COLORS.ORANGE, 0.1),
  CONFLICT_BORDER: rgba(COLORS.ORANGE, 0.3),
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

// 오더북 색상
export const ORDERBOOK_COLORS = {
  // 차트 스트로크/필
  CHART_BID: '#84cc16',  // lime-500
  CHART_ASK: '#ef4444',  // red-500
  CHART_BID_FILL: rgba('#84cc16', 0.2),
  CHART_ASK_FILL: rgba('#ef4444', 0.2),

  // 그리드/텍스트
  GRID: rgba(COLORS.WHITE, 0.2),
  TEXT_MUTED: rgba(COLORS.WHITE, 0.4),

  // 매도 호가 그래디언트
  ASK_GRADIENT: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.25), rgba(239,68,68,0.4))',
  ASK_GLOW: '0 0 15px rgba(239,68,68,0.4), inset 0 0 10px rgba(239,68,68,0.2)',
  ASK_BAR_GRADIENT: 'linear-gradient(90deg, rgba(239,68,68,0.3), rgba(239,68,68,0.5))',
  ASK_BAR_GLOW: '0 0 15px rgba(239,68,68,0.4), inset 0 0 8px rgba(239,68,68,0.2)',

  // 매수 호가 그래디언트
  BID_GRADIENT: 'linear-gradient(90deg, transparent, rgba(163,230,53,0.25), rgba(163,230,53,0.4))',
  BID_GLOW: '0 0 15px rgba(163,230,53,0.4), inset 0 0 10px rgba(163,230,53,0.2)',
  BID_BAR_GRADIENT: 'linear-gradient(90deg, rgba(163,230,53,0.5), rgba(163,230,53,0.7))',
  BID_BAR_GLOW: '0 0 15px rgba(163,230,53,0.5), inset 0 0 8px rgba(163,230,53,0.3)',
} as const;
