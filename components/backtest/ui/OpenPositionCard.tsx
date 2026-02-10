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
  maxConsecLoss?: number; // 실제 최대 연속 손실
}

// 연패3회 시 DD ≤ 20% 를 목표로 하는 실용 레버리지
const COMFORT_MAX_DD = 0.20; // 목표 최대 DD 20%
const COMFORT_CONSEC = 3;    // 기준 연패 횟수

/**
 * Comfort-Kelly: Half-Kelly와 심리적 한계의 타협
 * 1) Half-Kelly 계산 (수학적 최적)
 * 2) Comfort 레버리지 = 목표DD / (연패N × SL거리)
 * 3) 둘 중 작은 값 채택
 */
function calcComfortKelly(
  winRate: number, tpDist: number, slDist: number, actualMaxConsec?: number
): { comfort: number; halfKelly: number; comfortOnly: number } {
  // Half-Kelly
  const p = winRate / 100;
  const q = 1 - p;
  const mu = p * tpDist - q * slDist;
  let halfKelly = 1;
  if (mu > 0) {
    const variance = p * tpDist * tpDist + q * slDist * slDist - mu * mu;
    if (variance > 0) {
      halfKelly = Math.max(1, Math.floor((mu / variance) / 2));
    }
  }

  // Comfort: 연패N × SL × lev ≤ targetDD (복리 기반)
  // (1 - slDist * lev)^N ≥ (1 - targetDD) → lev = (1 - (1-DD)^(1/N)) / slDist
  const consecN = actualMaxConsec && actualMaxConsec > COMFORT_CONSEC
    ? actualMaxConsec
    : COMFORT_CONSEC;
  const comfortOnly = slDist > 0
    ? Math.floor((1 - Math.pow(1 - COMFORT_MAX_DD, 1 / consecN)) / slDist)
    : 1;

  const comfort = Math.max(1, Math.min(Math.min(halfKelly, comfortOnly), 125));
  return { comfort, halfKelly: Math.min(halfKelly, 125), comfortOnly: Math.max(1, Math.min(comfortOnly, 125)) };
}

export const OpenPositionCard: React.FC<OpenPositionCardProps> = memo(
  ({ openPosition, ticker, leverage = 1, winRate, maxConsecLoss }) => {
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

    // Comfort-Kelly 추천 레버리지
    const { comfort: recLev, halfKelly, comfortOnly } = winRate && winRate > 0
      ? calcComfortKelly(winRate, tpDist1x, slDist1x, maxConsecLoss)
      : { comfort: slDist1x > 0 ? Math.min(Math.floor(0.2 / slDist1x), 125) : 1, halfKelly: 0, comfortOnly: 0 };

    // SL 도달 시 손실률 (추천 레버리지 기준)
    const slAtRec = (slDist1x * recLev * 100).toFixed(0);
    // 연패3 시 DD (복리)
    const dd3 = ((1 - Math.pow(1 - slDist1x * recLev, COMFORT_CONSEC)) * 100).toFixed(0);

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
              title={halfKelly > 0
                ? `½Kelly:${halfKelly}x, 심리:${comfortOnly}x | SL@rec:-${slAtRec}% | 연패${COMFORT_CONSEC}→DD-${dd3}%`
                : `SL@rec: -${slAtRec}%`}
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
