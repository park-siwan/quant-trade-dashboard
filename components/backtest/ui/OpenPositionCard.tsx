import { memo } from 'react';
import { OpenPosition } from '@/lib/backtest-api';

interface OpenPositionCardProps {
  openPosition: OpenPosition | null;
  ticker: any;
}

export const OpenPositionCard: React.FC<OpenPositionCardProps> = memo(
  ({ openPosition, ticker }) => {
    if (!openPosition) return null;

    return (
      <div
        className={`mb-3 p-3 rounded-lg border ${
          openPosition.direction === 'long'
            ? 'bg-green-900/20 border-green-500/50'
            : 'bg-red-900/20 border-red-500/50'
        }`}
      >
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <span
              className={`text-xl font-bold ${openPosition.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}
            >
              {openPosition.direction === 'long'
                ? '🟢 롱 진행중'
                : '🔴 숏 진행중'}
            </span>
            <div className='flex items-center gap-2 text-sm'>
              <span className='text-zinc-400'>진입</span>
              <span className='text-white font-medium'>
                ${openPosition.entryPrice.toFixed(2)}
              </span>
            </div>
          </div>
          <div className='flex items-center gap-4'>
            {/* 실시간 PnL */}
            {(() => {
              const currentPrice = ticker?.price || openPosition.currentPrice;
              const isLong = openPosition.direction === 'long';
              const pnlPercent = isLong
                ? ((currentPrice - openPosition.entryPrice) /
                    openPosition.entryPrice) *
                  100
                : ((openPosition.entryPrice - currentPrice) /
                    openPosition.entryPrice) *
                  100;
              const pnl =
                (pnlPercent / 100) *
                openPosition.size *
                openPosition.entryPrice;
              const isProfit = pnl >= 0;

              return (
                <div
                  className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}
                >
                  {isProfit ? '+' : ''}
                  {pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                </div>
              );
            })()}
            {/* TP/SL */}
            <div className='flex gap-3 text-xs'>
              <div className='text-center'>
                <div className='text-green-400'>TP</div>
                <div className='text-white'>${openPosition.tp.toFixed(0)}</div>
              </div>
              <div className='text-center'>
                <div className='text-red-400'>SL</div>
                <div className='text-white'>${openPosition.sl.toFixed(0)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

OpenPositionCard.displayName = 'OpenPositionCard';
