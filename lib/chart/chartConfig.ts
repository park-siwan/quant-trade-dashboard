/**
 * 차트 설정 및 테마 중앙 관리
 */
import { ColorType, DeepPartial, TimeChartOptions } from 'lightweight-charts';
import { COLORS, CHART_COLORS, rgba } from '@/lib/colors';

// 차트 테마 색상
export const CHART_THEME = {
  background: COLORS.CHART_BG,
  textColor: COLORS.TEXT_SECONDARY,
  gridColor: CHART_COLORS.GRID,
  separatorColor: CHART_COLORS.SEPARATOR,
  separatorHoverColor: CHART_COLORS.SEPARATOR_HOVER,
} as const;

// 캔들 색상
export const CANDLE_COLORS = {
  UP: {
    body: CHART_COLORS.CANDLE_UP,
    border: CHART_COLORS.CANDLE_UP_BORDER,
    wick: CHART_COLORS.CANDLE_UP_WICK,
  },
  DOWN: {
    body: CHART_COLORS.CANDLE_DOWN,
    border: CHART_COLORS.CANDLE_DOWN_BORDER,
    wick: CHART_COLORS.CANDLE_DOWN_WICK,
  },
} as const;

// 패널 설정
export const PANEL_CONFIG = {
  mainPaneRatio: 4,      // 메인 패널 비율
  indicatorPaneRatio: 1, // 지표 패널 비율
  panelHeight: 280,      // 각 패널 높이 (일반 모드)
} as const;

// 미니 차트 설정
export const MINI_CONFIG = {
  fontSize: 9,
  priceScaleWidth: 50,
  rightOffset: 15,
  scaleMargins: { top: 0.15, bottom: 0.15 },
} as const;

// 일반 차트 설정
export const NORMAL_CONFIG = {
  fontSize: 12,
  priceScaleWidth: 80,
  rightOffset: 20,
  scaleMargins: { top: 0.1, bottom: 0.1 },
} as const;

/**
 * 차트 높이 계산
 */
export function calculateChartHeight(
  containerHeight: number,
  mini: boolean,
  indicatorFlags: {
    hasRsi: boolean;
    hasObv: boolean;
    hasCvd: boolean;
    hasOi: boolean;
    hasAtr: boolean;
  }
): number {
  if (mini) {
    return containerHeight || 200;
  }

  const { hasRsi, hasObv, hasCvd, hasOi, hasAtr } = indicatorFlags;
  const panelCount = 1 + (hasRsi ? 1 : 0) + (hasObv ? 1 : 0) + (hasCvd ? 1 : 0) + (hasOi ? 1 : 0) + (hasAtr ? 1 : 0);
  return panelCount * PANEL_CONFIG.panelHeight;
}

/**
 * 차트 기본 옵션 생성
 */
export function createChartOptions(
  width: number,
  height: number,
  mini: boolean
): DeepPartial<TimeChartOptions> {
  const config = mini ? MINI_CONFIG : NORMAL_CONFIG;

  return {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: CHART_THEME.background },
      textColor: CHART_THEME.textColor,
      fontSize: config.fontSize,
      panes: {
        separatorColor: CHART_THEME.separatorColor,
        separatorHoverColor: CHART_THEME.separatorHoverColor,
        enableResize: false,
      },
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    grid: {
      vertLines: { color: CHART_THEME.gridColor },
      horzLines: { color: CHART_THEME.gridColor },
    },
    timeScale: {
      timeVisible: !mini,
      secondsVisible: false,
      rightOffset: config.rightOffset,
      lockVisibleTimeRangeOnResize: true,
    },
    kineticScroll: {
      touch: false,
      mouse: false,
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: config.scaleMargins,
      autoScale: true,
      mode: 0,
      minimumWidth: config.priceScaleWidth,
    },
    localization: {
      timeFormatter: formatSeoulTime,
    },
  };
}

/**
 * UTC 타임스탬프를 서울 시간으로 포맷
 */
export function formatSeoulTime(time: number): string {
  const date = new Date(time * 1000);
  const seoulDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

  const year = seoulDate.getUTCFullYear();
  const month = String(seoulDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(seoulDate.getUTCDate()).padStart(2, '0');
  const hours = String(seoulDate.getUTCHours()).padStart(2, '0');
  const minutes = String(seoulDate.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 캔들스틱 시리즈 옵션
 */
export function getCandlestickOptions(opacity: number = 0.3) {
  // 무채색 캔들 (다이버전스 강조용)
  return {
    upColor: CHART_COLORS.CANDLE_UP,
    downColor: CHART_COLORS.CANDLE_DOWN,
    borderUpColor: CHART_COLORS.CANDLE_UP_BORDER,
    borderDownColor: CHART_COLORS.CANDLE_DOWN_BORDER,
    wickUpColor: CHART_COLORS.CANDLE_UP_WICK,
    wickDownColor: CHART_COLORS.CANDLE_DOWN_WICK,
  };
}

/**
 * 에어리어 시리즈 옵션 (미니 모드용)
 */
export function getAreaSeriesOptions() {
  return {
    lineColor: CHART_COLORS.MINI_LINE,
    topColor: CHART_COLORS.MINI_TOP,
    bottomColor: CHART_COLORS.MINI_BOTTOM,
    lineWidth: 2 as const,
    priceLineVisible: false,
    lastValueVisible: false,
  };
}
