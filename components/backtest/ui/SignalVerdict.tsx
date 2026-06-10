import { memo } from 'react';

export interface TypeEdge {
  key: string;
  label: string;
  icon: string;
  filled: number;
  total: number;
  /** 최근 N거래 승률 (거래 없으면 null) */
  recentWr: number | null;
  recentCount: number;
}

// 조건 충족률 50% + 최근 승률 50% 가중 합산 (승률 데이터 없으면 중립 50% 취급)
function edgeScore(e: TypeEdge): number {
  const condRatio = e.total > 0 ? e.filled / e.total : 0;
  const wr = e.recentWr !== null ? e.recentWr / 100 : 0.5;
  return condRatio * 0.5 + wr * 0.5;
}

/** 유형별 우세 종합 판정 한 줄 — 조건 충족 + 최근 승률 기반 */
export const SignalVerdict = memo(({ edges }: { edges: TypeEdge[] }) => {
  const ranked = [...edges].sort((a, b) => edgeScore(b) - edgeScore(a));
  const top = ranked[0];
  const isNeutral = !top || top.filled === 0;

  const wrColor = (wr: number | null) =>
    wr === null ? 'text-zinc-600' : wr >= 55 ? 'text-green-400' : wr >= 45 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 text-[11px] border-b border-zinc-800/50'>
      <span className='text-zinc-500 text-[10px] shrink-0'>현재 우세</span>
      {isNeutral ? (
        <span className='text-zinc-400 font-medium'>관망 — 충족 조건 없음</span>
      ) : (
        <span className='flex items-center gap-1.5 font-medium text-zinc-200'>
          {top.icon} {top.label}
          <span className='text-zinc-500 font-normal text-[10px]'>
            조건 {top.filled}/{top.total}
          </span>
          {top.recentWr !== null && (
            <span className={`font-mono text-[10px] ${wrColor(top.recentWr)}`}>
              최근{top.recentCount}거래 {top.recentWr.toFixed(0)}%
            </span>
          )}
        </span>
      )}
      <div className='flex-1' />
      {/* 차순위 유형 요약 (비교용) */}
      {ranked.slice(1).map(e => (
        <span
          key={e.key}
          className='text-[9px] font-mono text-zinc-600 shrink-0'
          title={`${e.label}: 조건 ${e.filled}/${e.total}${
            e.recentWr !== null ? ` · 최근${e.recentCount}거래 승률 ${e.recentWr.toFixed(0)}%` : ''
          }`}
        >
          {e.icon}{e.filled}/{e.total}
          {e.recentWr !== null && `·${e.recentWr.toFixed(0)}%`}
        </span>
      ))}
    </div>
  );
});

SignalVerdict.displayName = 'SignalVerdict';
