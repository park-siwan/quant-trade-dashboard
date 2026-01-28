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

interface CategoryData {
  name: string;
  long: number;
  short: number;
}

function ScoreBar({ data, thick = false }: { data: CategoryData; thick?: boolean }) {
  const total = data.long + data.short;
  const longPercent = total > 0 ? (data.long / total) * 100 : 50;
  const shortPercent = total > 0 ? (data.short / total) * 100 : 50;
  const isLongWin = data.long > data.short;
  const isShortWin = data.short > data.long;

  const barHeight = thick ? 'h-7' : 'h-3';
  const fontSize = thick ? 'text-sm' : 'text-[10px]';
  const innerFontSize = thick ? 'text-xs' : 'text-[8px]';

  return (
    <div className="space-y-0.5">
      {/* 카테고리 이름 + 점수 */}
      <div className={`flex items-center justify-between ${fontSize}`}>
        <span className={`font-mono ${isLongWin ? 'text-green-400 font-bold' : 'text-green-400/60'}`}>
          {data.long}
        </span>
        <span className={`text-gray-400 ${thick ? 'font-bold' : ''}`}>{data.name}</span>
        <span className={`font-mono ${isShortWin ? 'text-red-400 font-bold' : 'text-red-400/60'}`}>
          {data.short}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className={`relative ${barHeight} rounded-full overflow-hidden bg-white/5`}>
        {/* 롱 바 (왼쪽에서) */}
        <div
          className={`absolute left-0 top-0 h-full transition-all duration-300 ${
            isLongWin ? 'bg-green-500' : 'bg-green-500/40'
          }`}
          style={{ width: `${longPercent}%` }}
        />
        {/* 숏 바 (오른쪽에서) */}
        <div
          className={`absolute right-0 top-0 h-full transition-all duration-300 ${
            isShortWin ? 'bg-red-500' : 'bg-red-500/40'
          }`}
          style={{ width: `${shortPercent}%` }}
        />
        {/* 중앙선 */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-white/30 -translate-x-1/2" />

        {/* 두꺼운 바일 때만 내부 점수 표시 */}
        {thick && (
          <div className={`absolute inset-0 flex items-center justify-between px-3 ${innerFontSize} font-bold`}>
            <span className="text-white drop-shadow">{Math.round(longPercent)}%</span>
            <span className="text-white drop-shadow">{Math.round(shortPercent)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  // 개별 카테고리 데이터
  const categories: CategoryData[] = [
    { name: '다이버전스', long: longScores.divergence, short: shortScores.divergence },
    { name: '모멘텀', long: longScores.momentum, short: shortScores.momentum },
    { name: '거래량', long: longScores.volume, short: shortScores.volume },
    { name: '지지/저항', long: longScores.levels, short: shortScores.levels },
    { name: '시장심리', long: longScores.sentiment, short: shortScores.sentiment },
  ];

  // 총점 계산
  const longTotal = longScores.divergence + longScores.momentum + longScores.volume + longScores.levels + longScores.sentiment;
  const shortTotal = shortScores.divergence + shortScores.momentum + shortScores.volume + shortScores.levels + shortScores.sentiment;

  const gap = size === 'large' ? 'gap-2' : size === 'small' ? 'gap-0.5' : 'gap-1.5';

  return (
    <div className={`w-full flex flex-col ${gap}`}>
      {/* 최종 점수 (두꺼운 바) */}
      <div className="mb-2">
        <ScoreBar
          data={{ name: '최종 점수', long: longTotal, short: shortTotal }}
          thick
        />
      </div>

      {/* 개별 카테고리 (얇은 바) */}
      {categories.map((item) => (
        <ScoreBar key={item.name} data={item} />
      ))}

      {/* 범례 */}
      <div className="flex justify-center gap-4 text-[10px] mt-2 pt-2 border-t border-white/10">
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
