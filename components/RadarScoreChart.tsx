'use client';

import { useMemo } from 'react';

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
  nameEn: string;
  long: number;
  short: number;
}

function ScoreBar({ data, isTotal = false, index = 0 }: { data: CategoryData; isTotal?: boolean; index?: number }) {
  const total = data.long + data.short;
  const longPercent = total > 0 ? (data.long / total) * 100 : 50;
  const isLongWin = data.long > data.short;
  const isShortWin = data.short > data.long;
  const isTie = data.long === data.short;

  // 애니메이션 딜레이
  const animDelay = isTotal ? '0ms' : `${index * 50}ms`;

  return (
    <div
      className={`group relative ${isTotal ? 'mb-4 pb-4 border-b border-cyan-900/30' : ''}`}
      style={{ animationDelay: animDelay }}
    >
      {/* 배경 그리드 라인 (토탈만) */}
      {isTotal && (
        <div className="absolute inset-0 opacity-20">
          <div className="absolute left-1/4 top-0 w-px h-full bg-gradient-to-b from-transparent via-slate-600 to-transparent" />
          <div className="absolute left-1/2 top-0 w-px h-full bg-gradient-to-b from-transparent via-slate-500 to-transparent" />
          <div className="absolute left-3/4 top-0 w-px h-full bg-gradient-to-b from-transparent via-slate-600 to-transparent" />
        </div>
      )}

      {/* 라벨 행 */}
      <div className={`flex items-center justify-between ${isTotal ? 'mb-2' : 'mb-1'}`}>
        {/* 롱 점수 */}
        <div className={`flex items-center gap-2 ${isTotal ? 'min-w-[80px]' : 'min-w-[50px]'}`}>
          <span
            className={`
              font-mono tabular-nums tracking-tight
              ${isTotal ? 'text-lg font-bold' : 'text-[11px] font-medium'}
              ${isLongWin ? 'text-cyan-400' : 'text-slate-600'}
              transition-colors duration-300
            `}
          >
            {data.long}
          </span>
          {isLongWin && !isTie && (
            <span className={`
              ${isTotal ? 'text-[10px]' : 'text-[8px]'}
              text-cyan-500/80 font-medium uppercase tracking-wider
            `}>
              ▲
            </span>
          )}
        </div>

        {/* 카테고리 이름 */}
        <div className="flex flex-col items-center">
          <span className={`
            ${isTotal ? 'text-xs font-semibold text-slate-200' : 'text-[10px] text-slate-500'}
            uppercase tracking-[0.15em]
          `}>
            {data.name}
          </span>
          {isTotal && (
            <span className="text-[8px] text-slate-600 tracking-widest mt-0.5">
              TOTAL SCORE
            </span>
          )}
        </div>

        {/* 숏 점수 */}
        <div className={`flex items-center justify-end gap-2 ${isTotal ? 'min-w-[80px]' : 'min-w-[50px]'}`}>
          {isShortWin && !isTie && (
            <span className={`
              ${isTotal ? 'text-[10px]' : 'text-[8px]'}
              text-rose-500/80 font-medium uppercase tracking-wider
            `}>
              ▲
            </span>
          )}
          <span
            className={`
              font-mono tabular-nums tracking-tight
              ${isTotal ? 'text-lg font-bold' : 'text-[11px] font-medium'}
              ${isShortWin ? 'text-rose-400' : 'text-slate-600'}
              transition-colors duration-300
            `}
          >
            {data.short}
          </span>
        </div>
      </div>

      {/* 프로그레스 바 컨테이너 */}
      <div className={`relative ${isTotal ? 'h-3' : 'h-1.5'} overflow-hidden`}>
        {/* 배경 트랙 */}
        <div className={`
          absolute inset-0
          ${isTotal ? 'bg-slate-900/90 border border-slate-800' : 'bg-slate-900/60'}
        `} />

        {/* 중앙 기준선 */}
        <div className={`
          absolute left-1/2 top-0 w-px h-full -translate-x-1/2 z-20
          ${isTotal ? 'bg-slate-500' : 'bg-slate-700'}
        `} />

        {/* 롱 바 */}
        <div
          className="absolute left-0 top-0 h-full transition-all duration-700 ease-out"
          style={{
            width: `${longPercent}%`,
            background: isLongWin
              ? `linear-gradient(90deg,
                  rgba(6,182,212,0.15) 0%,
                  rgba(6,182,212,0.6) 40%,
                  rgba(34,211,238,0.9) 100%)`
              : `linear-gradient(90deg,
                  rgba(6,182,212,0.05) 0%,
                  rgba(6,182,212,0.15) 100%)`,
          }}
        />

        {/* 롱 엣지 글로우 */}
        {isLongWin && (
          <div
            className="absolute top-0 h-full w-1 transition-all duration-700"
            style={{
              left: `calc(${longPercent}% - 2px)`,
              background: 'linear-gradient(90deg, rgba(34,211,238,0.8), rgba(34,211,238,0))',
              boxShadow: '0 0 8px rgba(34,211,238,0.6)',
            }}
          />
        )}

        {/* 숏 바 */}
        <div
          className="absolute right-0 top-0 h-full transition-all duration-700 ease-out"
          style={{
            width: `${100 - longPercent}%`,
            background: isShortWin
              ? `linear-gradient(270deg,
                  rgba(244,63,94,0.15) 0%,
                  rgba(244,63,94,0.6) 40%,
                  rgba(251,113,133,0.9) 100%)`
              : `linear-gradient(270deg,
                  rgba(244,63,94,0.05) 0%,
                  rgba(244,63,94,0.15) 100%)`,
          }}
        />

        {/* 숏 엣지 글로우 */}
        {isShortWin && (
          <div
            className="absolute top-0 h-full w-1 transition-all duration-700"
            style={{
              right: `calc(${100 - longPercent}% - 2px)`,
              background: 'linear-gradient(270deg, rgba(251,113,133,0.8), rgba(251,113,133,0))',
              boxShadow: '0 0 8px rgba(251,113,133,0.6)',
            }}
          />
        )}

        {/* 퍼센트 표시 (토탈만) */}
        {isTotal && (
          <>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 z-30">
              <span className={`
                text-[9px] font-mono font-bold
                ${isLongWin ? 'text-cyan-300' : 'text-slate-500'}
              `}>
                {Math.round(longPercent)}%
              </span>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-30">
              <span className={`
                text-[9px] font-mono font-bold
                ${isShortWin ? 'text-rose-300' : 'text-slate-500'}
              `}>
                {Math.round(100 - longPercent)}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* 영문 이름 (카테고리만) */}
      {!isTotal && (
        <div className="flex justify-center mt-0.5">
          <span className="text-[7px] text-slate-700 uppercase tracking-[0.2em]">
            {data.nameEn}
          </span>
        </div>
      )}
    </div>
  );
}

export default function RadarScoreChart({ longScores, shortScores, size = 'normal' }: RadarScoreChartProps) {
  const categories: CategoryData[] = useMemo(() => [
    { name: '다이버전스', nameEn: 'DIVERGENCE', long: longScores.divergence, short: shortScores.divergence },
    { name: '모멘텀', nameEn: 'MOMENTUM', long: longScores.momentum, short: shortScores.momentum },
    { name: '거래량', nameEn: 'VOLUME', long: longScores.volume, short: shortScores.volume },
    { name: '지지저항', nameEn: 'S/R LEVELS', long: longScores.levels, short: shortScores.levels },
    { name: '심리', nameEn: 'SENTIMENT', long: longScores.sentiment, short: shortScores.sentiment },
  ], [longScores, shortScores]);

  const longTotal = longScores.divergence + longScores.momentum + longScores.volume + longScores.levels + longScores.sentiment;
  const shortTotal = shortScores.divergence + shortScores.momentum + shortScores.volume + shortScores.levels + shortScores.sentiment;

  const gap = size === 'large' ? 'gap-3' : size === 'small' ? 'gap-1' : 'gap-2';

  return (
    <div className={`w-full flex flex-col ${gap}`}>
      {/* 종합 점수 */}
      <ScoreBar
        data={{ name: '종합', nameEn: 'TOTAL', long: longTotal, short: shortTotal }}
        isTotal
      />

      {/* 개별 카테고리 */}
      {categories.map((item, idx) => (
        <ScoreBar key={item.name} data={item} index={idx} />
      ))}

      {/* 범례 */}
      <div className="flex justify-between items-center text-[9px] mt-3 pt-3 border-t border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-1.5 bg-slate-900 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-3/4 bg-gradient-to-r from-cyan-500/30 to-cyan-400/80" />
          </div>
          <span className="text-cyan-500/70 uppercase tracking-wider font-medium">Long</span>
        </div>

        <span className="text-slate-700 text-[8px] tracking-widest">◆ 50% ◆</span>

        <div className="flex items-center gap-2">
          <span className="text-rose-500/70 uppercase tracking-wider font-medium">Short</span>
          <div className="relative w-8 h-1.5 bg-slate-900 overflow-hidden">
            <div className="absolute inset-y-0 right-0 w-3/4 bg-gradient-to-l from-rose-500/30 to-rose-400/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
