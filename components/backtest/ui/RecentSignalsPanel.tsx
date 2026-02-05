import { memo } from 'react';
import { RealtimeDivergenceData } from '@/contexts/SocketContext';
import { formatKST, toSeconds } from '@/lib/utils/timestamp';

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
                    ? '🚀 롱 신호'
                    : '🌧 숏 신호'}
                </span>
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
              최근 신호 ({divergenceHistory.length})
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
                      {signal.direction === 'bullish' ? '🚀 롱' : '🌧 숏'}
                    </span>
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
