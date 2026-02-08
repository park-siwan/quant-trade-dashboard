import { memo } from 'react';
import type { ProposeResult } from '@/lib/backtest-api';

interface OptimizeComparisonCardProps {
  result: ProposeResult;
  isApplying: boolean;
  onApprove: () => void;
  onReject: () => void;
}

function MetricRow({
  label,
  current,
  proposed,
  delta,
  format = 'number',
}: {
  label: string;
  current: number;
  proposed: number;
  delta?: number;
  format?: 'number' | 'percent' | 'integer';
}) {
  const d = delta ?? proposed - current;
  const improved = d > 0;
  const deltaColor = d === 0 ? 'text-zinc-500' : improved ? 'text-green-400' : 'text-red-400';

  const fmt = (v: number) => {
    if (format === 'percent') return `${v.toFixed(2)}%`;
    if (format === 'integer') return v.toString();
    return v.toFixed(2);
  };

  return (
    <div className='flex items-center justify-between py-1'>
      <span className='text-[11px] text-zinc-500 w-16'>{label}</span>
      <span className='text-xs text-zinc-400 font-mono w-16 text-right'>{fmt(current)}</span>
      <span className='text-zinc-600 text-[10px] px-1'>&rarr;</span>
      <span className='text-xs text-zinc-200 font-mono w-16 text-right'>{fmt(proposed)}</span>
      <span className={`text-[11px] font-mono w-20 text-right ${deltaColor}`}>
        {d > 0 ? '+' : ''}{format === 'percent' ? `${d.toFixed(2)}%` : d.toFixed(2)}
      </span>
    </div>
  );
}

/** tp_sl_by_type 비교 렌더링 (orchestrator용) */
function TpSlByTypeChanges({
  currentByType,
  proposedByType,
}: {
  currentByType: Record<string, { tp_atr: number; sl_atr: number }>;
  proposedByType: Record<string, { tp_atr: number; sl_atr: number }>;
}) {
  const types = [...new Set([...Object.keys(currentByType || {}), ...Object.keys(proposedByType || {})])];
  if (types.length === 0) return null;

  const labelMap: Record<string, string> = {
    breakout: 'BRK',
    divergence: 'DIV',
    mean_reversion: 'MR',
  };

  return (
    <div className='mb-3 space-y-1'>
      {types.map((type) => {
        const cur = currentByType?.[type] || { tp_atr: 0, sl_atr: 0 };
        const prop = proposedByType?.[type] || { tp_atr: 0, sl_atr: 0 };
        const tpChanged = cur.tp_atr !== prop.tp_atr;
        const slChanged = cur.sl_atr !== prop.sl_atr;
        if (!tpChanged && !slChanged) return null;

        return (
          <div key={type} className='flex items-center gap-2 flex-wrap'>
            <span className='text-[10px] text-zinc-500 w-8'>{labelMap[type] || type}</span>
            {tpChanged && (
              <span className='text-[11px] font-mono bg-yellow-600/15 text-yellow-400 px-1.5 py-0.5 rounded'>
                TP: {cur.tp_atr} &rarr; {prop.tp_atr}
              </span>
            )}
            {slChanged && (
              <span className='text-[11px] font-mono bg-yellow-600/15 text-yellow-400 px-1.5 py-0.5 rounded'>
                SL: {cur.sl_atr} &rarr; {prop.sl_atr}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const OptimizeComparisonCard: React.FC<OptimizeComparisonCardProps> = memo(
  ({ result, isApplying, onApprove, onReject }) => {
    const { current, proposed, improvement } = result;

    const isOrchestrator = !!proposed.params.tp_sl_by_type;

    // 단순 파라미터 변경 (rsi_div, vol_breakout)
    const paramChanges = isOrchestrator
      ? []
      : Object.keys(proposed.params).filter(
          k => proposed.params[k] !== current.params[k],
        );

    const srImproved = improvement.sharpeDelta > 0;

    return (
      <div className='mt-3 bg-zinc-800 border border-zinc-600 rounded-lg p-4'>
        {/* 헤더 */}
        <div className='flex items-center justify-between mb-3'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium text-zinc-200'>
              {result.displayName}
            </span>
            <span className='text-[10px] text-zinc-500'>
              {(result.duration / 1000).toFixed(0)}s
            </span>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              srImproved
                ? 'bg-green-600/20 text-green-400'
                : 'bg-red-600/20 text-red-400'
            }`}
          >
            SR {srImproved ? '+' : ''}{improvement.sharpeDelta.toFixed(2)}
          </span>
        </div>

        {/* 파라미터 변경: orchestrator는 per-type, 나머지는 flat */}
        {isOrchestrator ? (
          <TpSlByTypeChanges
            currentByType={current.params.tp_sl_by_type}
            proposedByType={proposed.params.tp_sl_by_type}
          />
        ) : paramChanges.length > 0 ? (
          <div className='mb-3 flex gap-2 flex-wrap'>
            {paramChanges.map((k) => (
              <span
                key={k}
                className='text-[11px] font-mono bg-yellow-600/15 text-yellow-400 px-1.5 py-0.5 rounded'
              >
                {k}: {current.params[k]} &rarr; {proposed.params[k]}
              </span>
            ))}
          </div>
        ) : null}

        {/* 메트릭 비교 */}
        <div className='space-y-0.5'>
          <div className='flex items-center justify-between text-[10px] text-zinc-600 pb-1 border-b border-zinc-700'>
            <span className='w-16'>Metric</span>
            <span className='w-16 text-right'>Current</span>
            <span className='px-1'></span>
            <span className='w-16 text-right'>Proposed</span>
            <span className='w-20 text-right'>Delta</span>
          </div>
          <MetricRow
            label='Sharpe'
            current={current.sharpeRatio}
            proposed={proposed.sharpeRatio}
            delta={improvement.sharpeDelta}
          />
          <MetricRow
            label='PnL'
            current={current.totalPnlPercent}
            proposed={proposed.totalPnlPercent}
            delta={improvement.pnlDelta}
            format='percent'
          />
          <MetricRow
            label='WR'
            current={current.winRate}
            proposed={proposed.winRate}
            format='percent'
          />
          <MetricRow
            label='Trades'
            current={current.totalTrades}
            proposed={proposed.totalTrades}
            format='integer'
          />
        </div>

        {/* 버튼 */}
        <div className='flex gap-2 mt-4'>
          <button
            onClick={onReject}
            disabled={isApplying}
            className='flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors disabled:opacity-50'
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={isApplying}
            className='flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5'
          >
            {isApplying ? (
              <>
                <span className='inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                Applying...
              </>
            ) : (
              'Approve'
            )}
          </button>
        </div>
      </div>
    );
  },
);

OptimizeComparisonCard.displayName = 'OptimizeComparisonCard';
