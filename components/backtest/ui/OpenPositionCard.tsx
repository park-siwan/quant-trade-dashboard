import { memo } from 'react';
import { OpenPosition } from '@/lib/backtest-api';

const SIGNAL_TYPE_LABEL: Record<string, string> = {
  breakout: '돌파',
  divergence: '다이버전스',
  mean_reversion: '평균회귀',
  default: '-',
};

const REGIME_COLOR: Record<string, string> = {
  Bullish: 'text-green-400',
  Bearish: 'text-red-400',
  Sideways: 'text-yellow-400',
};

interface OpenPositionCardProps {
  openPosition: OpenPosition | null;
  ticker: any;
  leverage?: number;
}

export const OpenPositionCard: React.FC<OpenPositionCardProps> = memo(
  ({ openPosition, ticker, leverage = 1 }) => {
    if (!openPosition) return null;

    const currentPrice = ticker?.price || openPosition.currentPrice;
    const isLong = openPosition.direction === 'long';
    const pnlPercent = isLong
      ? ((currentPrice - openPosition.entryPrice) / openPosition.entryPrice) * 100 * leverage
      : ((openPosition.entryPrice - currentPrice) / openPosition.entryPrice) * 100 * leverage;
    const isProfit = pnlPercent >= 0;
    const si = openPosition.signalInfo;

    return (
      <div
        className={`mb-3 px-3 py-2 rounded-lg border ${
          isLong
            ? 'bg-green-900/20 border-green-500/50'
            : 'bg-red-900/20 border-red-500/50'
        }`}
      >
        {/* 1줄: 방향 + PnL% + 진입가 */}
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <span className={`text-sm font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
              {isLong ? '● LONG' : '● SHORT'}
            </span>
            <span className='text-zinc-500 text-xs'>
              ${openPosition.entryPrice.toFixed(0)}
            </span>
          </div>
          <span className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%
          </span>
        </div>

        {/* 2줄: 신호 근거 */}
        {si && (
          <div className='flex items-center gap-3 mt-1 text-[10px] text-zinc-400'>
            {si.signalType !== 'default' && (
              <span className='px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300'>
                {SIGNAL_TYPE_LABEL[si.signalType] || si.signalType}
              </span>
            )}
            <span className={REGIME_COLOR[si.regime] || 'text-zinc-400'}>
              {si.regime}
            </span>
            {si.strength > 0 && (
              <span>강도 {si.strength}%</span>
            )}
            <span>ATR {si.atr}</span>
            <span className='text-green-500'>TP:{si.tpAtr}x</span>
            <span className='text-red-500'>SL:{si.slAtr}x</span>
            {si.signalCount !== '1x' && (
              <span className='text-yellow-400'>{si.signalCount}</span>
            )}
          </div>
        )}
      </div>
    );
  }
);

OpenPositionCard.displayName = 'OpenPositionCard';
