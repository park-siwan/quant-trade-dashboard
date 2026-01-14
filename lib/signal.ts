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
