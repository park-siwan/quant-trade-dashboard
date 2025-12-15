'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

interface RefreshCountdownProps {
  timeframe: string; // '5m', '1h', '1d' etc.
  lastCandleTime: number; // Unix timestamp in seconds
  onRefresh: () => void;
  onManualRefresh?: () => void; // 수동 새로고침 (클릭 시)
}

// 타임프레임을 밀리초로 변환
function parseTimeframe(timeframe: string): number {
  const match = timeframe.match(/^(\d+)([smhd])$/);
  if (!match) return 5 * 60 * 1000; // 기본값: 5분

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 5 * 60 * 1000;
  }
}

export default function RefreshCountdown({
  timeframe,
  lastCandleTime,
  onRefresh,
  onManualRefresh,
}: RefreshCountdownProps) {
  const [countdown, setCountdown] = useState<string>('00:00');
  const [showTooltip, setShowTooltip] = useState(false);
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    // 새로운 캔들이 들어오면 리셋
    hasRefreshedRef.current = false;

    const interval = setInterval(() => {
      const timeframeMs = parseTimeframe(timeframe);
      const nextCandleTime = (lastCandleTime + timeframeMs / 1000) * 1000; // 밀리초로 변환
      const now = Date.now();
      const remaining = nextCandleTime - now;

      if (remaining <= 0) {
        setCountdown('00:00');
        if (!hasRefreshedRef.current) {
          hasRefreshedRef.current = true;
          onRefresh();
        }
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setCountdown(
          `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
            2,
            '0',
          )}`,
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timeframe, lastCandleTime, onRefresh]);

  // 타임프레임에 따른 설명 메시지
  const getTooltipMessage = () => {
    const match = timeframe.match(/^(\d+)([smhd])$/);
    if (!match) return '타임프레임에 맞춰 자동으로 새로운 분석을 시도합니다';

    const value = match[1];
    const unit = match[2];
    let unitText = '';

    switch (unit) {
      case 's':
        unitText = '초';
        break;
      case 'm':
        unitText = '분';
        break;
      case 'h':
        unitText = '시간';
        break;
      case 'd':
        unitText = '일';
        break;
    }

    return `${value}${unitText}마다 자동으로 새로운 분석을 시도합니다 (클릭하여 수동 분석)`;
  };

  return (
    <div className='relative'>
      <button
        onClick={onManualRefresh}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className='flex items-center gap-1.5 px-2 py-1 backdrop-blur-md bg-orange-500/20 text-orange-300 rounded-lg text-xs font-mono border border-orange-400/30 shadow-lg shadow-orange-500/10 hover:bg-orange-500/30 hover:border-orange-400/50 hover:shadow-orange-500/20 transition-all duration-200 cursor-pointer active:scale-95'
      >
        <RefreshCw
          className='w-3 h-3 text-orange-400 animate-spin'
          style={{ animationDuration: '3s' }}
        />
        <span className='font-medium'>{countdown}</span>
      </button>

      {/* 커스텀 툴팁 */}
      {showTooltip && (
        <div className='absolute top-full right-0 mt-2 px-3 py-2 backdrop-blur-xl bg-black/80 text-white text-xs rounded-lg shadow-xl border border-white/20 whitespace-nowrap z-50'>
          {getTooltipMessage()}
        </div>
      )}
    </div>
  );
}
