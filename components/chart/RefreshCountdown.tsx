'use client';

import { useEffect, useState, useRef } from 'react';

interface RefreshCountdownProps {
  timeframe: string; // '5m', '1h', '1d' etc.
  lastCandleTime: number; // Unix timestamp in seconds
  onRefresh: () => void;
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
}: RefreshCountdownProps) {
  const [countdown, setCountdown] = useState<string>('00:00');
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

  return (
    <div className='flex items-center gap-2 px-4 py-2 bg-(--secondary) text-purple-400 rounded-lg text-sm font-mono'>
      {/* <span>🔄</span> */}
      <span>{countdown}</span>
    </div>
  );
}
