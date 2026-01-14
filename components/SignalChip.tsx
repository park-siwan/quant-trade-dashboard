'use client';

import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { getSignalStyle, SignalStyle, SignalType } from '@/lib/signal';
import { MTFAction } from '@/lib/types';

interface SignalChipProps {
  action: MTFAction;
  reason: string;
  size?: 'sm' | 'md'; // sm: 미니차트용, md: 테이블용
}

// 아이콘 결정
const getIcon = (type: SignalType) => {
  switch (type) {
    case 'long_ok':
    case 'bullish':
      return TrendingUp;
    case 'short_ok':
    case 'bearish':
      return TrendingDown;
    case 'wait':
    default:
      return Clock;
  }
};

export default function SignalChip({ action, reason, size = 'md' }: SignalChipProps) {
  const style = getSignalStyle(action, reason);
  const IconComponent = getIcon(style.type);

  // 사이즈별 스타일
  const sizeStyles = {
    sm: {
      container: 'px-1.5 py-0.5 gap-1',
      icon: 'w-2.5 h-2.5',
      text: 'text-[10px]',
    },
    md: {
      container: 'px-2 py-0.5 gap-1',
      icon: 'w-3 h-3',
      text: 'text-xs',
    },
  };

  const s = sizeStyles[size];

  return (
    <div className={`inline-flex items-center rounded border ${style.bg} ${style.border} ${s.container}`}>
      <IconComponent className={`${s.icon} ${style.text}`} />
      <span className={`font-semibold ${s.text} ${style.text}`}>{style.label}</span>
    </div>
  );
}
