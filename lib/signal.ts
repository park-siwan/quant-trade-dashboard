import { MTFAction } from './types';

// 신호 라벨 타입
export type SignalType = 'long_ok' | 'short_ok' | 'bullish' | 'bearish' | 'wait';

// 신호 스타일 정보
export interface SignalStyle {
  label: string;
  type: SignalType;
  // Tailwind 클래스
  bg: string;
  text: string;
  border: string;
  // RGB 값 (차트용)
  rgbColor: string;
  rgbLight: string;
  rgbFade: string;
}

// 신호 스타일 상수
export const SIGNAL_STYLES: Record<SignalType, SignalStyle> = {
  long_ok: {
    label: '롱',
    type: 'long_ok',
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    rgbColor: '#22c55e',
    rgbLight: 'rgba(34, 197, 94, 0.15)',
    rgbFade: 'rgba(34, 197, 94, 0.02)',
  },
  short_ok: {
    label: '숏',
    type: 'short_ok',
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    rgbColor: '#ef4444',
    rgbLight: 'rgba(239, 68, 68, 0.15)',
    rgbFade: 'rgba(239, 68, 68, 0.02)',
  },
  bullish: {
    label: '상승',
    type: 'bullish',
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    rgbColor: '#22c55e',
    rgbLight: 'rgba(34, 197, 94, 0.15)',
    rgbFade: 'rgba(34, 197, 94, 0.02)',
  },
  bearish: {
    label: '하락',
    type: 'bearish',
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    rgbColor: '#ef4444',
    rgbLight: 'rgba(239, 68, 68, 0.15)',
    rgbFade: 'rgba(239, 68, 68, 0.02)',
  },
  wait: {
    label: '대기',
    type: 'wait',
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    rgbColor: '#6b7280',
    rgbLight: 'rgba(107, 114, 128, 0.15)',
    rgbFade: 'rgba(107, 114, 128, 0.02)',
  },
};

// actionInfo를 기반으로 신호 스타일 결정
export function getSignalStyle(action: MTFAction, reason: string): SignalStyle {
  // 만료된 신호는 대기로 처리
  if (reason.includes('만료')) {
    return SIGNAL_STYLES.wait;
  }

  switch (action) {
    case 'long_ok':
      return SIGNAL_STYLES.long_ok;
    case 'short_ok':
      return SIGNAL_STYLES.short_ok;
    case 'reversal_warn':
      // 반등/반락 모두 대기로 통일
      return SIGNAL_STYLES.wait;
    case 'trend_hold':
      if (reason.includes('상승')) {
        return SIGNAL_STYLES.bullish;
      } else {
        return SIGNAL_STYLES.bearish;
      }
    case 'wait':
    default:
      return SIGNAL_STYLES.wait;
  }
}

// 차트 색상용 타입 (getSignalStyle의 결과에서 추출)
export type ChartColorType = 'green' | 'red' | 'gray';

export function getChartColor(action: MTFAction, reason: string): ChartColorType {
  const style = getSignalStyle(action, reason);

  switch (style.type) {
    case 'long_ok':
    case 'bullish':
      return 'green';
    case 'short_ok':
    case 'bearish':
      return 'red';
    case 'wait':
    default:
      return 'gray';
  }
}

// RGB 색상 타입
interface RGB {
  r: number;
  g: number;
  b: number;
}

// 색상 상수
const COLORS_RGB = {
  green: { r: 34, g: 197, b: 94 },   // #22c55e
  red: { r: 239, g: 68, b: 68 },     // #ef4444
  gray: { r: 107, g: 114, b: 128 },  // #6b7280
};

// 지표별 + 방향별 다이버전스 색상
// Bullish: 초록/파랑 계열, Bearish: 빨강/주황 계열
export const DIVERGENCE_COLORS: Record<string, { bullish: RGB; bearish: RGB }> = {
  rsi: {
    bullish: { r: 34, g: 197, b: 94 },   // 초록 #22c55e
    bearish: { r: 239, g: 68, b: 68 },   // 빨강 #ef4444
  },
  obv: {
    bullish: { r: 20, g: 184, b: 166 },  // 청록 #14b8a6
    bearish: { r: 249, g: 115, b: 22 },  // 주황 #f97316
  },
  cvd: {
    bullish: { r: 59, g: 130, b: 246 },  // 파랑 #3b82f6
    bearish: { r: 234, g: 179, b: 8 },   // 노랑 #eab308
  },
  oi: {
    bullish: { r: 16, g: 185, b: 129 },  // 에메랄드 #10b981
    bearish: { r: 236, g: 72, b: 153 },  // 분홍 #ec4899
  },
};

// 두 RGB 색상을 보간 (0 = start, 1 = end)
function lerpColor(start: RGB, end: RGB, t: number): RGB {
  return {
    r: Math.round(start.r + (end.r - start.r) * t),
    g: Math.round(start.g + (end.g - start.g) * t),
    b: Math.round(start.b + (end.b - start.b) * t),
  };
}

// RGB를 hex 문자열로 변환
function rgbToHex(color: RGB): string {
  return `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`;
}

// RGB를 rgba 문자열로 변환
function rgbToRgba(color: RGB, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

// 신선도 기반 색상 계산 결과
export interface FreshnessColors {
  lineColor: string;      // 라인 색상
  solidColor: string;     // 불투명 색상
  lightColor: string;     // 상단 그라데이션
  fadeColor: string;      // 하단 그라데이션
  chartColorType: ChartColorType;
}

/**
 * 다이버전스 신선도에 따른 색상 계산
 * @param direction 다이버전스 방향 ('bullish' | 'bearish')
 * @param freshness 신선도 (0~1, 1이 가장 신선함)
 * @param indicatorType 지표 타입 ('rsi' | 'obv' | 'cvd' | 'oi') - 지표별 색상 구분
 * @returns 보간된 색상들
 */
export function getDivergenceFreshnessColors(
  direction: 'bullish' | 'bearish',
  freshness: number,
  indicatorType?: 'rsi' | 'obv' | 'cvd' | 'oi'
): FreshnessColors {
  // freshness 클램핑 (0~1)
  const f = Math.max(0, Math.min(1, freshness));

  // 지표 타입에 따른 색상 선택 (없으면 기본 초록/빨강)
  const colorSet = indicatorType ? DIVERGENCE_COLORS[indicatorType] : null;
  const baseColor = colorSet
    ? (direction === 'bullish' ? colorSet.bullish : colorSet.bearish)
    : (direction === 'bullish' ? COLORS_RGB.green : COLORS_RGB.red);
  const grayColor = COLORS_RGB.gray;

  // 신선도가 낮을수록 회색에 가까워짐 (1 - f로 보간)
  const interpolatedColor = lerpColor(baseColor, grayColor, 1 - f);

  // 색상 생성 (라인은 항상 최고 색상, 그라데이션만 신선도에 따라 투명도 조절)
  const lineColor = rgbToHex(baseColor);
  const solidColor = rgbToHex(baseColor);
  // 그라데이션은 기본 색상 사용 (너무 밝아지지 않도록)
  const lightColor = rgbToRgba(baseColor, 0.08 * f + 0.02); // 0.02 ~ 0.10
  const fadeColor = rgbToRgba(baseColor, 0.01 * f + 0.005);  // 0.005 ~ 0.015

  // 신선도가 0.3 이하면 gray로 분류
  const chartColorType: ChartColorType = f <= 0.3
    ? 'gray'
    : direction === 'bullish' ? 'green' : 'red';

  return {
    lineColor,
    solidColor,
    lightColor,
    fadeColor,
    chartColorType,
  };
}

/**
 * 다이버전스 신선도 계산
 * @param divergenceEndTime 다이버전스 종료 시간 (밀리초)
 * @param expiryMs 만료까지의 시간 (밀리초)
 * @returns 신선도 (0~1)
 */
export function calculateDivergenceFreshness(
  divergenceEndTime: number,
  expiryMs: number
): number {
  const now = Date.now();
  const elapsed = now - divergenceEndTime;

  if (elapsed <= 0) return 1; // 아직 시작 안 함 (미래) → 최대 신선도
  if (elapsed >= expiryMs) return 0; // 만료됨

  return 1 - (elapsed / expiryMs);
}
