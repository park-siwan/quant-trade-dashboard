'use client';

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';

interface RadarScoreChartProps {
  longScores: {
    trendAlignment: number;
    divergence: number;
    momentum: number;
    volume: number;
    levels: number;
    sentiment: number;
  };
  shortScores: {
    trendAlignment: number;
    divergence: number;
    momentum: number;
    volume: number;
    levels: number;
    sentiment: number;
  };
  size?: 'normal' | 'large';
}

// 색상 정의: 초록(롱) + 빨강(숏) - 겹치면 보라색
const COLORS = {
  long: {
    stroke: '#4ade80',    // green-400
    fill: '#22c55e',      // green-500
  },
  short: {
    stroke: '#f87171',    // red-400
    fill: '#ef4444',      // red-500
  },
};

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  // 6개 카테고리 데이터 (정규화: 0-100%)
  // 대척점 배치: 추세↔다이버전스, 거래량↔지지/저항, 모멘텀↔시장심리
  const data = [
    {
      category: '추세',
      fullName: '추세 정렬',
      long: Math.round((longScores.trendAlignment / 20) * 100),
      short: Math.round((shortScores.trendAlignment / 20) * 100),
      longRaw: longScores.trendAlignment,
      shortRaw: shortScores.trendAlignment,
      max: 20,
    },
    {
      category: '거래량',
      fullName: '거래량/CVD',
      long: Math.round((longScores.volume / 15) * 100),
      short: Math.round((shortScores.volume / 15) * 100),
      longRaw: longScores.volume,
      shortRaw: shortScores.volume,
      max: 15,
    },
    {
      category: '모멘텀',
      fullName: '모멘텀/RSI',
      long: Math.round((longScores.momentum / 15) * 100),
      short: Math.round((shortScores.momentum / 15) * 100),
      longRaw: longScores.momentum,
      shortRaw: shortScores.momentum,
      max: 15,
    },
    {
      category: '다이버전스',
      fullName: '다이버전스',
      long: Math.round((longScores.divergence / 20) * 100),
      short: Math.round((shortScores.divergence / 20) * 100),
      longRaw: longScores.divergence,
      shortRaw: shortScores.divergence,
      max: 20,
    },
    {
      category: '지지/저항',
      fullName: '지지/저항',
      long: Math.round((longScores.levels / 15) * 100),
      short: Math.round((shortScores.levels / 15) * 100),
      longRaw: longScores.levels,
      shortRaw: shortScores.levels,
      max: 15,
    },
    {
      category: '시장심리',
      fullName: '시장심리 (펀딩+OI)',
      long: Math.round((longScores.sentiment / 15) * 100),
      short: Math.round((shortScores.sentiment / 15) * 100),
      longRaw: longScores.sentiment,
      shortRaw: shortScores.sentiment,
      max: 15,
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg p-2.5 text-xs shadow-xl">
          <p className="text-white font-medium mb-1.5">{data.fullName}</p>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-green-400">롱: {data.longRaw}/{data.max}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-red-400">숏: {data.shortRaw}/{data.max}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const height = size === 'large' ? 'h-[340px]' : 'h-[220px]';
  const outerRadius = size === 'large' ? '85%' : '75%';

  return (
    <div className={`w-full ${height} relative`}>
      {/* 그라디언트 & 글로우 효과를 위한 SVG Defs */}
      <svg width="0" height="0" className="absolute">
        <defs>
          {/* 롱 그라디언트 */}
          <linearGradient id="longGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.long.stroke} stopOpacity={0.7} />
            <stop offset="100%" stopColor={COLORS.long.fill} stopOpacity={0.3} />
          </linearGradient>
          {/* 숏 그라디언트 */}
          <linearGradient id="shortGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.short.stroke} stopOpacity={0.7} />
            <stop offset="100%" stopColor={COLORS.short.fill} stopOpacity={0.3} />
          </linearGradient>
          {/* 글로우 필터 */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius={outerRadius} data={data}>
          {/* 배경 그리드 */}
          <PolarGrid
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="none"
            gridType="polygon"
          />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: '#9ca3af', fontSize: size === 'large' ? 11 : 9 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />

          {/* 숏 레이더 (먼저 그려서 뒤에) */}
          <Radar
            name="숏"
            dataKey="short"
            stroke={COLORS.short.stroke}
            fill="url(#shortGradient)"
            fillOpacity={0.6}
            strokeWidth={2}
            strokeOpacity={0.9}
            style={{ filter: 'url(#glow)', mixBlendMode: 'overlay' }}
          />

          {/* 롱 레이더 (나중에 그려서 앞에) - 블렌드 모드로 겹침 시 색상 혼합 */}
          <Radar
            name="롱"
            dataKey="long"
            stroke={COLORS.long.stroke}
            fill="url(#longGradient)"
            fillOpacity={0.6}
            strokeWidth={2}
            strokeOpacity={0.9}
            style={{ filter: 'url(#glow)', mixBlendMode: 'overlay' }}
          />

          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

    </div>
  );
}
