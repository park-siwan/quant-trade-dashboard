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

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  // 6개 카테고리 데이터 (정규화: 0-100%)
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
      category: '다이버전스',
      fullName: '다이버전스',
      long: Math.round((longScores.divergence / 20) * 100),
      short: Math.round((shortScores.divergence / 20) * 100),
      longRaw: longScores.divergence,
      shortRaw: shortScores.divergence,
      max: 20,
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
      category: '거래량',
      fullName: '거래량/CVD',
      long: Math.round((longScores.volume / 15) * 100),
      short: Math.round((shortScores.volume / 15) * 100),
      longRaw: longScores.volume,
      shortRaw: shortScores.volume,
      max: 15,
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
        <div className="bg-gray-800/95 border border-white/10 rounded-lg p-2 text-xs">
          <p className="text-gray-300 font-medium mb-1">{data.fullName}</p>
          <p className="text-green-400">롱: {data.longRaw}/{data.max}</p>
          <p className="text-red-400">숏: {data.shortRaw}/{data.max}</p>
        </div>
      );
    }
    return null;
  };

  const height = size === 'large' ? 'h-[300px]' : 'h-[200px]';
  const outerRadius = size === 'large' ? '75%' : '65%';

  return (
    <div className={`w-full ${height}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius={outerRadius} data={data}>
          <PolarGrid
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: '#9ca3af', fontSize: size === 'large' ? 11 : 9 }}
            tickLine={false}
          />
          <Radar
            name="롱"
            dataKey="long"
            stroke="#4ade80"
            fill="#4ade80"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Radar
            name="숏"
            dataKey="short"
            stroke="#f87171"
            fill="#f87171"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
