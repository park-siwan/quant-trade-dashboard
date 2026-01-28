'use client';

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

interface CategoryData {
  name: string;
  long: number;
  short: number;
  longRaw: number;
  shortRaw: number;
  longTier: string;
  shortTier: string;
}

function ScoreBar({ data }: { data: CategoryData }) {
  const total = data.long + data.short;
  const longPercent = total > 0 ? (data.long / total) * 100 : 50;
  const shortPercent = total > 0 ? (data.short / total) * 100 : 50;
  const isLongWin = data.long > data.short;
  const isShortWin = data.short > data.long;
  const isTie = data.long === data.short;

  return (
    <div className="space-y-1">
      {/* 카테고리 이름 + 점수 */}
      <div className="flex items-center justify-between text-[10px]">
        <span className={`font-mono ${isLongWin ? 'text-green-400 font-bold' : 'text-green-400/60'}`}>
          {data.longRaw} ({data.longTier})
        </span>
        <span className="text-gray-400 text-[11px]">{data.name}</span>
        <span className={`font-mono ${isShortWin ? 'text-red-400 font-bold' : 'text-red-400/60'}`}>
          ({data.shortTier}) {data.shortRaw}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="relative h-4 rounded-full overflow-hidden bg-white/5">
        {/* 롱 바 (왼쪽에서) */}
        <div
          className={`absolute left-0 top-0 h-full transition-all duration-300 ${
            isLongWin ? 'bg-green-500' : 'bg-green-500/50'
          }`}
          style={{ width: `${longPercent}%` }}
        />
        {/* 숏 바 (오른쪽에서) */}
        <div
          className={`absolute right-0 top-0 h-full transition-all duration-300 ${
            isShortWin ? 'bg-red-500' : 'bg-red-500/50'
          }`}
          style={{ width: `${shortPercent}%` }}
        />
        {/* 중앙선 */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-white/20 -translate-x-1/2" />
        {/* 티어 점수 표시 */}
        <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-bold">
          <span className="text-white/90 drop-shadow">{data.long}</span>
          <span className="text-white/90 drop-shadow">{data.short}</span>
        </div>
      </div>
    </div>
  );
}

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  const longEnvRaw = longScores.volume + longScores.sentiment;
  const shortEnvRaw = shortScores.volume + shortScores.sentiment;

  const data: CategoryData[] = [
    {
      name: '다이버전스',
      long: toTier(longScores.divergence, 'divergence'),
      short: toTier(shortScores.divergence, 'divergence'),
      longRaw: longScores.divergence,
      shortRaw: shortScores.divergence,
      longTier: getTierLabel(longScores.divergence, 'divergence'),
      shortTier: getTierLabel(shortScores.divergence, 'divergence'),
    },
    {
      name: '모멘텀',
      long: toTier(longScores.momentum, 'momentum'),
      short: toTier(shortScores.momentum, 'momentum'),
      longRaw: longScores.momentum,
      shortRaw: shortScores.momentum,
      longTier: getTierLabel(longScores.momentum, 'momentum'),
      shortTier: getTierLabel(shortScores.momentum, 'momentum'),
    },
    {
      name: '시장환경',
      long: toTier(longEnvRaw, 'environment'),
      short: toTier(shortEnvRaw, 'environment'),
      longRaw: longEnvRaw,
      shortRaw: shortEnvRaw,
      longTier: getTierLabel(longEnvRaw, 'environment'),
      shortTier: getTierLabel(shortEnvRaw, 'environment'),
    },
    {
      name: '지지/저항',
      long: toTier(longScores.levels, 'levels'),
      short: toTier(shortScores.levels, 'levels'),
      longRaw: longScores.levels,
      shortRaw: shortScores.levels,
      longTier: getTierLabel(longScores.levels, 'levels'),
      shortTier: getTierLabel(shortScores.levels, 'levels'),
    },
  ];

  const gap = size === 'large' ? 'gap-3' : size === 'small' ? 'gap-1' : 'gap-2';

  return (
    <div className={`w-full flex flex-col ${gap}`}>
      {data.map((item) => (
        <ScoreBar key={item.name} data={item} />
      ))}

      {/* 범례 */}
      <div className="flex justify-center gap-4 text-[10px] mt-1 pt-2 border-t border-white/10">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-green-500" />
          <span className="text-gray-400">롱</span>
        </span>
        <span className="text-gray-500">◀ 50% ▶</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-red-500" />
          <span className="text-gray-400">숏</span>
        </span>
      </div>
    </div>
  );
}
