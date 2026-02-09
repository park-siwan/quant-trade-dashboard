import { memo, useState, useCallback } from 'react';
import { OpenPosition } from '@/lib/backtest-api';
import { API_CONFIG } from '@/lib/config';

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

interface RetryInfo {
  active: boolean;
  attempt: number;
  maxAttempts: number;
  side: 'buy' | 'sell';
  leverage: number;
}

interface OpenPositionCardProps {
  openPosition: OpenPosition | null;
  ticker: any;
  leverage?: number;
  winRate?: number; // 전략 승률 (0-100)
  maxConsecLoss?: number; // 실제 최대 연속 손실
  tradingEnvEnabled?: boolean; // AUTO_TRADE_ENABLED from backend
  retryInfo?: RetryInfo | null;
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
  ({ openPosition, ticker, leverage = 1, winRate, maxConsecLoss, tradingEnvEnabled, retryInfo }) => {
    const [orderState, setOrderState] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
    const [orderMsg, setOrderMsg] = useState('');

    const startOrder = useCallback(() => {
      setOrderState('confirm');
    }, []);

    const executeOrder = useCallback(async () => {
      if (!openPosition || orderState !== 'confirm') return;

      setOrderState('loading');
      try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/trading/manual-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            side: openPosition.direction === 'long' ? 'buy' : 'sell',
            entryPrice: openPosition.entryPrice,
            tp: openPosition.tp,
            sl: openPosition.sl,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setOrderState('done');
          setOrderMsg(`PostOnly ${data.order.side.toUpperCase()} 시도 중...`);
        } else {
          setOrderState('error');
          setOrderMsg(data.message || 'Failed');
        }
      } catch (e: any) {
        setOrderState('error');
        setOrderMsg(e.message);
      }
      setTimeout(() => { setOrderState('idle'); setOrderMsg(''); }, 4000);
    }, [openPosition, orderState]);

    const cancelRetry = useCallback(async () => {
      try {
        await fetch(`${API_CONFIG.BASE_URL}/trading/cancel`, { method: 'POST' });
      } catch {}
      setOrderState('idle');
      setOrderMsg('');
    }, []);

    const cancelOrder = useCallback(() => {
      setOrderState('idle');
    }, []);

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

        {/* PostOnly 주문 버튼 */}
        {true && ( /* TODO: restore tradingEnvEnabled guard */
          <div className='flex items-center gap-2 mt-1.5'>
            {/* 재시도 중 (retryInfo from WS) */}
            {retryInfo?.active ? (
              <>
                <span className='text-[10px] text-cyan-400 animate-pulse'>
                  PostOnly {retryInfo.leverage}x 시도 중 ({retryInfo.attempt}/{retryInfo.maxAttempts})
                </span>
                <button
                  onClick={cancelRetry}
                  className='px-2 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                >
                  취소
                </button>
              </>
            ) : (
              <>
                {orderState === 'idle' && (
                  <button
                    onClick={startOrder}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                      isLong
                        ? 'bg-green-600/30 text-green-400 hover:bg-green-600/50 border border-green-600/40'
                        : 'bg-red-600/30 text-red-400 hover:bg-red-600/50 border border-red-600/40'
                    }`}
                  >
                    PostOnly {isLong ? 'LONG' : 'SHORT'}
                  </button>
                )}
                {orderState === 'confirm' && (
                  <>
                    <span className='text-[10px] text-yellow-400'>
                      PostOnly {isLong ? 'LONG' : 'SHORT'} 라스트가 진입?
                    </span>
                    <button
                      onClick={executeOrder}
                      className='px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-600/40 text-yellow-300 hover:bg-yellow-600/60 border border-yellow-600/50'
                    >
                      확인
                    </button>
                    <button
                      onClick={cancelOrder}
                      className='px-2 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    >
                      취소
                    </button>
                  </>
                )}
                {orderState === 'loading' && (
                  <span className='text-[10px] text-zinc-400 animate-pulse'>주문 중...</span>
                )}
                {orderState === 'done' && (
                  <span className='text-[10px] text-green-400'>{orderMsg}</span>
                )}
                {orderState === 'error' && (
                  <span className='text-[10px] text-red-400'>{orderMsg}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);

OpenPositionCard.displayName = 'OpenPositionCard';
