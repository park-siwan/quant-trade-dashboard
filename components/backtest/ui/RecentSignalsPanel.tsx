import { memo } from 'react';
import { RealtimeDivergenceData } from '@/contexts/SocketContext';
import { formatKST, toSeconds } from '@/lib/utils/timestamp';

const TYPE_LABELS: Record<string, { short: string; color: string }> = {
  breakout: { short: '\uB3CC\uD30C', color: 'text-amber-400' },
  divergence: { short: '\uBC18\uC804', color: 'text-blue-400' },
  mean_reversion: { short: 'MR', color: 'text-purple-400' },
  rsi: { short: 'RSI', color: 'text-blue-400' },
  default: { short: '', color: 'text-zinc-500' },
};

function SignalTypeTag({ type }: { type?: string }) {
  if (!type || type === 'default') return null;
  const label = TYPE_LABELS[type] || TYPE_LABELS.default;
  if (!label.short) return null;
  return (
    <span className={`text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-700/50 ${label.color}`}>
      {label.short}
    </span>
  );
}

interface RecentSignalsPanelProps {
  divergenceData: RealtimeDivergenceData | null;
  divergenceHistory: RealtimeDivergenceData[];
}

export const RecentSignalsPanel: React.FC<RecentSignalsPanelProps> = memo(
  ({ divergenceData, divergenceHistory }) => {
    return (
      <>
        {/* 최근 신호 */}
        {divergenceData && (
          <div className='mt-4 p-3 bg-zinc-800 rounded-lg'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <span
                  className={`text-lg ${divergenceData.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}
                >
                  {divergenceData.direction === 'bullish'
                    ? '\uD83D\uDE80 \uB871 \uC2E0\uD638'
                    : '\uD83C\uDF27 \uC20F \uC2E0\uD638'}
                </span>
                <SignalTypeTag type={divergenceData.signalType} />
                <span className='text-zinc-400 text-sm'>
                  @ ${divergenceData.currentPrice.toLocaleString()}
                </span>
              </div>
              <div className='text-right'>
                <div className='text-sm text-zinc-400'>
                  {divergenceData.rsiValue && `RSI: ${divergenceData.rsiValue.toFixed(1)}`}
                </div>
                <div className='text-xs text-zinc-500'>
                  {formatKST(toSeconds(divergenceData.timestamp))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 신호 히스토리 */}
        {divergenceHistory.length > 0 && (
          <div className='mt-4'>
            <h3 className='text-sm font-medium text-zinc-400 mb-2'>
              \uCD5C\uADFC \uC2E0\uD638 ({divergenceHistory.length})
            </h3>
            <div className='max-h-40 overflow-y-auto space-y-1 custom-scrollbar'>
              {[...divergenceHistory]
                .reverse()
                .slice(0, 10)
                .map((signal, idx) => (
                  <div
                    key={idx}
                    className='flex items-center justify-between text-xs p-2 bg-zinc-800 rounded'
                  >
                    <span
                      className={
                        signal.direction === 'bullish'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }
                    >
                      {signal.direction === 'bullish' ? '\uD83D\uDE80 \uB871' : '\uD83C\uDF27 \uC20F'}
                    </span>
                    <SignalTypeTag type={signal.signalType} />
                    <span className='text-zinc-300'>
                      ${signal.currentPrice.toLocaleString()}
                    </span>
                    <span className='text-zinc-500'>
                      {formatKST(toSeconds(signal.timestamp))}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </>
    );
  }
);

RecentSignalsPanel.displayName = 'RecentSignalsPanel';
