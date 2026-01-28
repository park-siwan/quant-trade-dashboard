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

  const barHeight = thick ? 'h-6' : 'h-2.5';

  return (
    <div className={thick ? 'mb-3' : ''}>
      {/* 카테고리 이름 + 점수 */}
      <div className={`flex items-center justify-between mb-1 ${thick ? 'text-xs' : 'text-[10px]'}`}>
        <span className={`font-mono tabular-nums ${isLongWin ? 'text-emerald-400' : 'text-slate-500'}`}>
          {data.long}
        </span>
        <span className={`text-slate-400 ${thick ? 'font-semibold text-slate-300' : ''}`}>
          {data.name}
        </span>
        <span className={`font-mono tabular-nums ${isShortWin ? 'text-rose-400' : 'text-slate-500'}`}>
          {data.short}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className={`relative ${barHeight} rounded-full overflow-hidden`}>
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800" />

        {/* 롱 바 (왼쪽에서) */}
        <div
          className="absolute left-0 top-0 h-full transition-all duration-500 ease-out rounded-r-full"
          style={{
            width: `${longPercent}%`,
            background: isLongWin
              ? 'linear-gradient(90deg, rgba(16,185,129,0.9) 0%, rgba(52,211,153,0.7) 100%)'
              : 'linear-gradient(90deg, rgba(16,185,129,0.3) 0%, rgba(52,211,153,0.2) 100%)',
            boxShadow: isLongWin ? '0 0 12px rgba(16,185,129,0.4)' : 'none',
          }}
        />

        {/* 숏 바 (오른쪽에서) */}
        <div
          className="absolute right-0 top-0 h-full transition-all duration-500 ease-out rounded-l-full"
          style={{
            width: `${shortPercent}%`,
            background: isShortWin
              ? 'linear-gradient(270deg, rgba(244,63,94,0.9) 0%, rgba(251,113,133,0.7) 100%)'
              : 'linear-gradient(270deg, rgba(244,63,94,0.3) 0%, rgba(251,113,133,0.2) 100%)',
            boxShadow: isShortWin ? '0 0 12px rgba(244,63,94,0.4)' : 'none',
          }}
        />

        {/* 중앙 구분선 */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-slate-600 -translate-x-1/2 z-10" />

        {/* 두꺼운 바일 때 퍼센트 표시 */}
        {thick && (
          <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-bold z-20">
            <span className={`drop-shadow-lg ${isLongWin ? 'text-white' : 'text-slate-400'}`}>
              {Math.round(longPercent)}%
            </span>
            <span className={`drop-shadow-lg ${isShortWin ? 'text-white' : 'text-slate-400'}`}>
              {Math.round(shortPercent)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  const categories: CategoryData[] = [
    { name: '다이버전스', long: longScores.divergence, short: shortScores.divergence },
    { name: '모멘텀', long: longScores.momentum, short: shortScores.momentum },
    { name: '거래량', long: longScores.volume, short: shortScores.volume },
    { name: '지지/저항', long: longScores.levels, short: shortScores.levels },
    { name: '시장심리', long: longScores.sentiment, short: shortScores.sentiment },
  ];

  const longTotal = longScores.divergence + longScores.momentum + longScores.volume + longScores.levels + longScores.sentiment;
  const shortTotal = shortScores.divergence + shortScores.momentum + shortScores.volume + shortScores.levels + shortScores.sentiment;

  const gap = size === 'large' ? 'gap-2' : size === 'small' ? 'gap-1' : 'gap-1.5';

  return (
    <div className={`w-full flex flex-col ${gap}`}>
      {/* 최종 점수 */}
      <ScoreBar data={{ name: '종합', long: longTotal, short: shortTotal }} thick />

      {/* 개별 카테고리 */}
      {categories.map((item) => (
        <ScoreBar key={item.name} data={item} />
      ))}

      {/* 범례 */}
      <div className="flex justify-center items-center gap-6 text-[10px] mt-2 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" />
          <span className="text-slate-500">롱</span>
        </div>
        <div className="text-slate-600">|</div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-gradient-to-r from-rose-400 to-rose-500" />
          <span className="text-slate-500">숏</span>
        </div>
      </div>
    </div>
  );
}
