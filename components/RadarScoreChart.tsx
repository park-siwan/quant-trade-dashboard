'use client';

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';

interface RadarScoreChartProps {
  longScores: {
    divergence: number;
    momentum: number;
    volume: number;
    levels: number;
    sentiment: number;
  };
  shortScores: {
    divergence: number;
    momentum: number;
    volume: number;
    levels: number;
    sentiment: number;
  };
  size?: 'small' | 'normal' | 'large';
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
  // 4개 카테고리: 다이버전스, 모멘텀, 시장환경(거래량+시장심리), 지지/저항

  // sqrt 스케일: 낮은 점수도 시각적으로 인식 가능 (0은 0 유지)
  // 0→0, 4→20, 25→50, 50→71, 100→100
  const sqrtScale = (value: number) => Math.round(Math.sqrt(Math.max(0, value) / 100) * 100);

  // 다이버전스는 동적 max (둘 중 큰 값 또는 최소 400)
  const divMax = Math.max(400, longScores.divergence, shortScores.divergence);

  const normalize = (raw: number, max: number) => Math.min(100, Math.round((raw / max) * 100));

  // 시장환경 = 거래량(20) + 시장심리(15) = 35점 만점
  const envMax = 35;
  const longEnvRaw = longScores.volume + longScores.sentiment;
  const shortEnvRaw = shortScores.volume + shortScores.sentiment;

  const data = [
    {
      category: '다이버전스',
      fullName: '다이버전스',
      long: sqrtScale(normalize(longScores.divergence, divMax)),
      short: sqrtScale(normalize(shortScores.divergence, divMax)),
      longRaw: longScores.divergence,
      shortRaw: shortScores.divergence,
      max: divMax,
    },
    {
      category: '모멘텀',
      fullName: '모멘텀/RSI+ADX',
      long: sqrtScale(normalize(longScores.momentum, 25)),
      short: sqrtScale(normalize(shortScores.momentum, 25)),
      longRaw: longScores.momentum,
      shortRaw: shortScores.momentum,
      max: 25,
    },
    {
      category: '시장환경',
      fullName: '시장환경 (CVD+ATR+펀딩+OI)',
      long: sqrtScale(normalize(longEnvRaw, envMax)),
      short: sqrtScale(normalize(shortEnvRaw, envMax)),
      longRaw: longEnvRaw,
      shortRaw: shortEnvRaw,
      max: envMax,
    },
    {
      category: '지지/저항',
      fullName: '지지/저항 (OB+POC+VA)',
      long: sqrtScale(normalize(longScores.levels, 15)),
      short: sqrtScale(normalize(shortScores.levels, 15)),
      longRaw: longScores.levels,
      shortRaw: shortScores.levels,
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

  const height = size === 'large' ? 'h-[300px]' : size === 'small' ? 'h-[130px]' : 'h-[200px]';
  const outerRadius = size === 'large' ? '85%' : size === 'small' ? '70%' : '75%';

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
            tick={{ fill: '#9ca3af', fontSize: size === 'large' ? 11 : size === 'small' ? 7 : 9 }}
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
