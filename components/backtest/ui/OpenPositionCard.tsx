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
  winRate?: number; // 전략 승률 (0-100)
}

/**
 * Half-Kelly 레버리지 계산
 * Kelly f* = μ / σ² (연속 수익률 근사)
 * μ = p * tp_dist - (1-p) * sl_dist
 * σ² = p * tp² + (1-p) * sl² - μ²
 * Half-Kelly = f* / 2 (실무 안전 마진)
 */
function calcKellyLeverage(winRate: number, tpDist: number, slDist: number): number {
  const p = winRate / 100;
  const q = 1 - p;
  const mu = p * tpDist - q * slDist;
  if (mu <= 0) return 1; // 기대값 음수면 1x
  const variance = p * tpDist * tpDist + q * slDist * slDist - mu * mu;
  if (variance <= 0) return 1;
  const fullKelly = mu / variance;
  const halfKelly = Math.floor(fullKelly / 2);
  return Math.max(1, Math.min(halfKelly, 125));
}

export const OpenPositionCard: React.FC<OpenPositionCardProps> = memo(
  ({ openPosition, ticker, leverage = 1, winRate }) => {
    if (!openPosition) {
      return (
        <div className='mb-3 px-3 py-2 rounded-lg border bg-zinc-900/50 border-zinc-700/50'>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-zinc-500'>포지션 없음</span>
          </div>
        </div>
      );
    }

    const currentPrice = ticker?.price || openPosition.currentPrice;
    const isLong = openPosition.direction === 'long';
    const pnlPercent = isLong
      ? ((currentPrice - openPosition.entryPrice) / openPosition.entryPrice) * 100 * leverage
      : ((openPosition.entryPrice - currentPrice) / openPosition.entryPrice) * 100 * leverage;
    const isProfit = pnlPercent >= 0;
    const si = openPosition.signalInfo;

    // TP/SL 1x 거리 (비율)
    const tpDist1x = Math.abs(openPosition.tp - openPosition.entryPrice) / openPosition.entryPrice;
    const slDist1x = Math.abs(openPosition.sl - openPosition.entryPrice) / openPosition.entryPrice;

    const tpPct = isLong
      ? ((openPosition.tp - openPosition.entryPrice) / openPosition.entryPrice) * 100 * leverage
      : ((openPosition.entryPrice - openPosition.tp) / openPosition.entryPrice) * 100 * leverage;
    const slPct = isLong
      ? ((openPosition.sl - openPosition.entryPrice) / openPosition.entryPrice) * 100 * leverage
      : ((openPosition.entryPrice - openPosition.sl) / openPosition.entryPrice) * 100 * leverage;

    // Kelly 기반 추천 레버리지 (승률 있을 때), 없으면 SL=-20% 기준
    const recLev = winRate && winRate > 0
      ? calcKellyLeverage(winRate, tpDist1x, slDist1x)
      : slDist1x > 0 ? Math.min(Math.floor(0.2 / slDist1x), 125) : 1;

    // SL 도달 시 손실률 (추천 레버리지 기준)
    const slAtRec = (slDist1x * recLev * 100).toFixed(0);

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
            <span className='text-green-500'>TP:{si.tpAtr}x (+{tpPct.toFixed(1)}%)</span>
            <span className='text-red-500'>SL:{si.slAtr}x ({slPct.toFixed(1)}%)</span>
            <span
              className={`font-medium ${leverage <= recLev ? 'text-cyan-400' : 'text-orange-400'}`}
              title={winRate ? `½Kelly (WR:${winRate}%, SL@rec:-${slAtRec}%)` : `SL@rec: -${slAtRec}%`}
            >
              추천 {recLev}x
            </span>
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
