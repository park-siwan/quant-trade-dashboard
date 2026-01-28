'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell } from 'recharts';

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

// 색상 정의
const COLORS = {
  long: {
    main: '#22c55e',
    light: 'rgba(34, 197, 94, 0.6)',
  },
  short: {
    main: '#ef4444',
    light: 'rgba(239, 68, 68, 0.6)',
  },
};

// 티어 기반 정규화
const TIER_THRESHOLDS = {
  divergence: [
    [25, 1, 30],
    [50, 31, 80],
    [75, 81, 200],
  ],
  momentum: [
    [25, 1, 5],
    [50, 6, 12],
    [75, 13, 20],
  ],
  environment: [
    [25, 1, 8],
    [50, 9, 18],
    [75, 19, 28],
  ],
  levels: [
    [25, 1, 4],
    [50, 5, 8],
    [75, 9, 12],
  ],
} as const;

type TierCategory = keyof typeof TIER_THRESHOLDS;

const TIER_LABELS = ['없음', '약함', '보통', '강함', '매우강함'] as const;

function toTier(raw: number, category: TierCategory): number {
  if (raw <= 0) return 0;
  const tiers = TIER_THRESHOLDS[category];
  for (const [tierBase, min, max] of tiers) {
    if (raw >= min && raw <= max) {
      if (min === max) return tierBase;
      return Math.round(tierBase + ((raw - min) / (max - min)) * 25);
    }
  }
  return 100;
}

function getTierLabel(raw: number, category: TierCategory): string {
  if (raw <= 0) return TIER_LABELS[0];
  const tiers = TIER_THRESHOLDS[category];
  if (raw <= tiers[0][2]) return TIER_LABELS[1];
  if (raw <= tiers[1][2]) return TIER_LABELS[2];
  if (raw <= tiers[2][2]) return TIER_LABELS[3];
  return TIER_LABELS[4];
}

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  const longEnvRaw = longScores.volume + longScores.sentiment;
  const shortEnvRaw = shortScores.volume + shortScores.sentiment;

  const longDiv = toTier(longScores.divergence, 'divergence');
  const shortDiv = toTier(shortScores.divergence, 'divergence');
  const longMom = toTier(longScores.momentum, 'momentum');
  const shortMom = toTier(shortScores.momentum, 'momentum');
  const longEnv = toTier(longEnvRaw, 'environment');
  const shortEnv = toTier(shortEnvRaw, 'environment');
  const longLev = toTier(longScores.levels, 'levels');
  const shortLev = toTier(shortScores.levels, 'levels');

  const data = [
    {
      name: '다이버전스',
      long: longDiv,
      short: shortDiv,
      longRaw: longScores.divergence,
      shortRaw: shortScores.divergence,
      longTier: getTierLabel(longScores.divergence, 'divergence'),
      shortTier: getTierLabel(shortScores.divergence, 'divergence'),
    },
    {
      name: '모멘텀',
      long: longMom,
      short: shortMom,
      longRaw: longScores.momentum,
      shortRaw: shortScores.momentum,
      longTier: getTierLabel(longScores.momentum, 'momentum'),
      shortTier: getTierLabel(shortScores.momentum, 'momentum'),
    },
    {
      name: '시장환경',
      long: longEnv,
      short: shortEnv,
      longRaw: longEnvRaw,
      shortRaw: shortEnvRaw,
      longTier: getTierLabel(longEnvRaw, 'environment'),
      shortTier: getTierLabel(shortEnvRaw, 'environment'),
    },
    {
      name: '지지/저항',
      long: longLev,
      short: shortLev,
      longRaw: longScores.levels,
      shortRaw: shortScores.levels,
      longTier: getTierLabel(longScores.levels, 'levels'),
      shortTier: getTierLabel(shortScores.levels, 'levels'),
    },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg p-2.5 text-xs shadow-xl">
          <p className="text-white font-medium mb-1.5">{label}</p>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-400">롱: {d.longRaw}점</span>
            <span className="text-gray-400">({d.longTier})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-400">숏: {d.shortRaw}점</span>
            <span className="text-gray-400">({d.shortTier})</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const height = size === 'large' ? 'h-[200px]' : size === 'small' ? 'h-[80px]' : 'h-[150px]';
  const fontSize = size === 'small' ? 8 : size === 'large' ? 11 : 9;
  const barSize = size === 'large' ? 16 : size === 'small' ? 8 : 12;

  return (
    <div className={`w-full ${height}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: -15 }} barGap={2}>
          {/* 티어 기준선 */}
          <ReferenceLine y={25} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 2" />
          <ReferenceLine y={50} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 2" />
          <ReferenceLine y={75} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 2" />

          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9ca3af', fontSize }}
          />
          <YAxis
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7280', fontSize: fontSize - 1 }}
            ticks={[0, 50, 100]}
            width={30}
          />

          {/* 롱 바 */}
          <Bar dataKey="long" fill={COLORS.long.main} radius={[4, 4, 0, 0]} barSize={barSize}>
            {data.map((entry, index) => (
              <Cell
                key={`long-${index}`}
                fill={entry.long > entry.short ? COLORS.long.main : COLORS.long.light}
              />
            ))}
          </Bar>

          {/* 숏 바 */}
          <Bar dataKey="short" fill={COLORS.short.main} radius={[4, 4, 0, 0]} barSize={barSize}>
            {data.map((entry, index) => (
              <Cell
                key={`short-${index}`}
                fill={entry.short > entry.long ? COLORS.short.main : COLORS.short.light}
              />
            ))}
          </Bar>

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
        </BarChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div className="flex justify-center gap-4 text-[10px] mt-1">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-green-500" />
          <span className="text-gray-400">롱</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-red-500" />
          <span className="text-gray-400">숏</span>
        </span>
        <span className="text-gray-500">| 진한색 = 우세</span>
      </div>
    </div>
  );
}
