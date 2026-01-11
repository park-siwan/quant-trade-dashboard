'use client';

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';

interface RadarScoreChartProps {
  longScores: {
    mtfAlignment: number;
    divergence: number;
    marketStructure: number;
    externalFactors: number;
  };
  shortScores: {
    mtfAlignment: number;
    divergence: number;
    marketStructure: number;
    externalFactors: number;
  };
  size?: 'normal' | 'large';
}

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  // 최대 점수로 정규화 (0-100%)
  const data = [
    {
      category: '추세',
      fullName: '추세 종합',
      long: Math.round((longScores.mtfAlignment / 30) * 100),
      short: Math.round((shortScores.mtfAlignment / 30) * 100),
      longRaw: longScores.mtfAlignment,
      shortRaw: shortScores.mtfAlignment,
      max: 30,
    },
    {
      category: '다이버전스',
      fullName: '다이버전스',
      long: Math.round((longScores.divergence / 30) * 100),
      short: Math.round((shortScores.divergence / 30) * 100),
      longRaw: longScores.divergence,
      shortRaw: shortScores.divergence,
      max: 30,
    },
    {
      category: '시장구조',
      fullName: '시장 구조',
      long: Math.round((longScores.marketStructure / 20) * 100),
      short: Math.round((shortScores.marketStructure / 20) * 100),
      longRaw: longScores.marketStructure,
      shortRaw: shortScores.marketStructure,
      max: 20,
    },
    {
      category: '외부요인',
      fullName: '외부 요인',
      long: Math.round((longScores.externalFactors / 20) * 100),
      short: Math.round((shortScores.externalFactors / 20) * 100),
      longRaw: longScores.externalFactors,
      shortRaw: shortScores.externalFactors,
      max: 20,
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

  const height = size === 'large' ? 'h-[280px]' : 'h-[180px]';
  const outerRadius = size === 'large' ? '80%' : '70%';

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
            tick={{ fill: '#9ca3af', fontSize: size === 'large' ? 11 : 10 }}
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
