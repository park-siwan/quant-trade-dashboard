'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, ReferenceLine, XAxis, YAxis, Tooltip } from 'recharts';
import { ScoreHistoryEntry } from '@/hooks/useScoreHistory';

interface ScoreSparklineProps {
  history: ScoreHistoryEntry[];
  height?: number;
  showBoth?: boolean; // true면 롱/숏 둘다, false면 차이만
}

// 시간 포맷 (HH:mm)
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

export default function ScoreSparkline({ history, height = 60, showBoth = true }: ScoreSparklineProps) {
  const data = useMemo(() => {
    // 시간순 정렬 (오래된 것 먼저)
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    return sorted.map(entry => ({
      time: entry.timestamp,
      timeLabel: formatTime(entry.timestamp),
      long: entry.longTotal,
      short: entry.shortTotal,
      diff: entry.longTotal - entry.shortTotal,
    }));
  }, [history]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-[10px]" style={{ height }}>
        데이터 수집 중...
      </div>
    );
  }

  // 최근 변화 계산
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const longChange = latest.long - prev.long;
  const shortChange = latest.short - prev.short;

  // 첫/마지막 시간
  const firstTime = formatTime(data[0].time);
  const lastTime = formatTime(data[data.length - 1].time);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg p-2 text-[10px] shadow-xl">
          <p className="text-gray-400 mb-1">{d.timeLabel}</p>
          <div className="flex gap-3">
            <span className="text-green-400">롱: {d.long}</span>
            <span className="text-red-400">숏: {d.short}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full" style={{ height: height + 20 }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
          <XAxis
            dataKey="timeLabel"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7280', fontSize: 9 }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis hide domain={['auto', 'auto']} />

          {/* 기준선 (0 또는 중간값) */}
          {!showBoth && <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" />}

          {showBoth ? (
            <>
              {/* 롱 점수 영역 */}
              <Area
                type="monotone"
                dataKey="long"
                stroke="#22c55e"
                strokeWidth={1.5}
                fill="#22c55e"
                fillOpacity={0.15}
              />
              {/* 숏 점수 영역 */}
              <Area
                type="monotone"
                dataKey="short"
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="#ef4444"
                fillOpacity={0.15}
              />
            </>
          ) : (
            /* 차이 영역 */
            <Area
              type="monotone"
              dataKey="diff"
              stroke={latest.diff >= 0 ? '#22c55e' : '#ef4444'}
              strokeWidth={1.5}
              fill={latest.diff >= 0 ? '#22c55e' : '#ef4444'}
              fillOpacity={0.2}
            />
          )}

          <Tooltip content={<CustomTooltip />} />
        </AreaChart>
      </ResponsiveContainer>

      {/* 변화 표시 */}
      <div className="flex justify-between text-[9px] mt-1">
        <span className={longChange >= 0 ? 'text-green-400' : 'text-green-400/50'}>
          롱 {longChange >= 0 ? '+' : ''}{longChange}
        </span>
        <span className="text-gray-500">{firstTime} ~ {lastTime} ({data.length}개)</span>
        <span className={shortChange >= 0 ? 'text-red-400' : 'text-red-400/50'}>
          숏 {shortChange >= 0 ? '+' : ''}{shortChange}
        </span>
      </div>
    </div>
  );
}
