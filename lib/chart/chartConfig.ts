/**
 * 차트 설정 및 테마 중앙 관리
 */
import { ColorType, DeepPartial, ChartOptions, TimeChartOptions } from 'lightweight-charts';

// 차트 테마 색상
export const CHART_THEME = {
  background: '#0c0908',           // 따뜻한 블랙
  textColor: '#d1d5db',
  gridColor: 'rgba(45, 38, 32, 0.25)',
  separatorColor: 'rgba(255, 255, 255, 0.3)',
  separatorHoverColor: 'rgba(255, 255, 255, 0.5)',
} as const;

// 캔들 색상
export const CANDLE_COLORS = {
  UP: {
    body: 'rgba(34, 197, 94, 0.3)',      // green-500 투명
    border: 'rgba(134, 239, 172, 0.8)',   // green-300 테두리
    wick: 'rgba(34, 197, 94, 0.6)',       // 심지
  },
  DOWN: {
    body: 'rgba(239, 68, 68, 0.3)',       // red-500 투명
    border: 'rgba(252, 165, 165, 0.8)',   // red-300 테두리
    wick: 'rgba(239, 68, 68, 0.6)',       // 심지
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
  return {
    upColor: `rgba(34, 197, 94, ${opacity})`,
    downColor: `rgba(239, 68, 68, ${opacity})`,
    borderUpColor: 'rgba(134, 239, 172, 0.8)',
    borderDownColor: 'rgba(252, 165, 165, 0.8)',
    wickUpColor: 'rgba(34, 197, 94, 0.6)',
    wickDownColor: 'rgba(239, 68, 68, 0.6)',
  };
}

/**
 * 에어리어 시리즈 옵션 (미니 모드용)
 */
export function getAreaSeriesOptions() {
  return {
    lineColor: 'rgba(251, 146, 60, 0.9)',
    topColor: 'rgba(251, 146, 60, 0.3)',
    bottomColor: 'rgba(251, 146, 60, 0.05)',
    lineWidth: 2 as const,
    priceLineVisible: false,
    lastValueVisible: false,
  };
}
