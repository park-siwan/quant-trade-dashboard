import { memo } from 'react';
import { useSocket, useSocketTicker } from '@/contexts/SocketContext';
import { RSI, ADX } from '@/lib/thresholds';

interface SignalThresholdMonitorProps {
  timeframe: string;
}

// 볼륨 돌파 임계값 (vol_breakout.json 기본값)
const VOLUME_THRESHOLD = 2.5;
// ATR 백분위 경고 (orchestrator mr_atr_max_pct)
const ATR_PCT_WARN = 76;

// RSI 색상
function rsiColor(val: number): string {
  if (val <= RSI.OVERSOLD) return 'text-green-400';
  if (val >= RSI.OVERBOUGHT) return 'text-red-400';
  if (val <= 40) return 'text-green-300/70';
  if (val >= 60) return 'text-red-300/70';
  return 'text-zinc-300';
}

// RSI 미니바 (0-100 범위)
function RsiBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const barColor = pct <= 30 ? 'bg-green-500' : pct >= 70 ? 'bg-red-500' : pct <= 45 ? 'bg-green-400/50' : pct >= 55 ? 'bg-red-400/50' : 'bg-zinc-500';
  return (
    <div className='w-12 h-1.5 bg-zinc-700 rounded-full overflow-hidden relative'>
      <div className='absolute left-[30%] top-0 w-px h-full bg-zinc-500/50' />
      <div className='absolute left-[70%] top-0 w-px h-full bg-zinc-500/50' />
      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ADX 레이블
function adxLabel(val: number): { text: string; color: string } {
  if (val >= ADX.VERY_STRONG) return { text: '강', color: 'text-orange-400' };
  if (val >= ADX.STRONG) return { text: '중', color: 'text-yellow-400' };
  return { text: '약', color: 'text-zinc-500' };
}

// 레짐 색상
const REGIME_STYLE: Record<string, { text: string; color: string }> = {
  BULL: { text: '상승', color: 'text-green-400' },
  BEAR: { text: '하락', color: 'text-red-400' },
  SIDEWAYS: { text: '횡보', color: 'text-yellow-400' },
};

export const SignalThresholdMonitor = memo(({ timeframe }: SignalThresholdMonitorProps) => {
  const { indicatorSnapshot } = useSocket();
  const { ticker } = useSocketTicker();

  // 타임프레임 불일치 시 표시 안함
  const snap = indicatorSnapshot?.timeframe === timeframe ? indicatorSnapshot : null;

  if (!snap) {
    return (
      <div className='flex items-center px-3 py-1 mt-1 bg-zinc-900/60 rounded-lg'>
        <span className='text-[10px] text-zinc-600'>지표 로딩 중...</span>
      </div>
    );
  }

  const { rsi, adx, atr, atrPct, ema200, volumeRatio, regime } = snap;
  const price = ticker?.price || snap.price;
  const regimeStyle = REGIME_STYLE[regime] || REGIME_STYLE.SIDEWAYS;
  const adxInfo = adx !== null ? adxLabel(adx) : null;
  const emaAbove = price && ema200 ? price > ema200 : null;

  return (
    <div className='flex items-center gap-3 px-3 py-1 mt-1 bg-zinc-900/60 rounded-lg text-[10px] flex-wrap'>
      {/* RSI */}
      {rsi !== null && (
        <div className='flex items-center gap-1.5'>
          <span className='text-zinc-500'>RSI</span>
          <span className={`font-mono font-medium ${rsiColor(rsi)}`}>{rsi.toFixed(1)}</span>
          <RsiBar value={rsi} />
        </div>
      )}

      <div className='w-px h-3 bg-zinc-700' />

      {/* ADX */}
      {adx !== null && adxInfo && (
        <div className='flex items-center gap-1'>
          <span className='text-zinc-500'>ADX</span>
          <span className='font-mono text-zinc-300'>{adx.toFixed(1)}</span>
          <span className={adxInfo.color}>{adxInfo.text}</span>
        </div>
      )}

      <div className='w-px h-3 bg-zinc-700' />

      {/* Volume Ratio */}
      {volumeRatio !== null && (
        <div className='flex items-center gap-1'>
          <span className='text-zinc-500'>Vol</span>
          <span className={`font-mono ${volumeRatio >= VOLUME_THRESHOLD ? 'text-cyan-400 font-medium' : 'text-zinc-300'}`}>
            {volumeRatio.toFixed(1)}x
          </span>
          <span className='text-zinc-600'>/ {VOLUME_THRESHOLD}x</span>
        </div>
      )}

      <div className='w-px h-3 bg-zinc-700' />

      {/* ATR */}
      {atr !== null && (
        <div className='flex items-center gap-1'>
          <span className='text-zinc-500'>ATR</span>
          <span className='font-mono text-zinc-300'>${atr.toFixed(0)}</span>
          {atrPct !== null && (
            <span className={`${atrPct >= ATR_PCT_WARN ? 'text-orange-400' : 'text-zinc-500'}`}>
              P{atrPct}
            </span>
          )}
        </div>
      )}

      <div className='w-px h-3 bg-zinc-700' />

      {/* 레짐 */}
      <div className='flex items-center gap-1'>
        <span className='text-zinc-500'>레짐</span>
        <span className={`font-medium ${regimeStyle.color}`}>{regimeStyle.text}</span>
      </div>

      <div className='w-px h-3 bg-zinc-700' />

      {/* EMA200 */}
      {emaAbove !== null && (
        <div className='flex items-center gap-1'>
          <span className='text-zinc-500'>EMA200</span>
          <span className={emaAbove ? 'text-green-400' : 'text-red-400'}>
            {emaAbove ? '▲' : '▼'}
          </span>
        </div>
      )}
    </div>
  );
});

SignalThresholdMonitor.displayName = 'SignalThresholdMonitor';
