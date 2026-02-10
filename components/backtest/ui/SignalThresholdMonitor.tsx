import { memo } from 'react';
import { useSocket, useSocketTicker } from '@/contexts/SocketContext';
import { RSI, ADX } from '@/lib/thresholds';

interface SignalThresholdMonitorProps {
  timeframe: string;
}

// 임계값
const VOL_THRESH = 2.5;   // 볼륨 돌파
const ATR_WARN = 76;       // 평균회귀 차단 백분위

// ── 게이지 컴포넌트 ──

/** 범위 게이지: 값의 위치를 바 위에 마커로 표시, 임계선은 세로선 */
function Gauge({ value, min, max, zones, thresholds, width = 'w-14' }: {
  value: number;
  min: number;
  max: number;
  zones: { from: number; to: number; color: string }[];
  thresholds?: { at: number; color: string }[];
  width?: string;
}) {
  const clamp = Math.max(min, Math.min(max, value));
  const pct = ((clamp - min) / (max - min)) * 100;

  return (
    <div className={`${width} h-2 bg-zinc-800 rounded-full overflow-hidden relative`}>
      {/* 구간별 배경 색상 */}
      {zones.map((z, i) => {
        const left = ((z.from - min) / (max - min)) * 100;
        const w = ((z.to - z.from) / (max - min)) * 100;
        return <div key={i} className={`absolute top-0 h-full ${z.color}`} style={{ left: `${left}%`, width: `${w}%` }} />;
      })}
      {/* 임계선 */}
      {thresholds?.map((t, i) => {
        const pos = ((t.at - min) / (max - min)) * 100;
        return <div key={i} className={`absolute top-0 w-[1.5px] h-full ${t.color}`} style={{ left: `${pos}%` }} />;
      })}
      {/* 현재값 마커 */}
      <div
        className='absolute top-0 w-[3px] h-full bg-white rounded-full shadow-[0_0_3px_rgba(255,255,255,0.8)]'
        style={{ left: `calc(${pct}% - 1.5px)` }}
      />
    </div>
  );
}

// RSI 게이지 구간
const RSI_ZONES = [
  { from: 0, to: 30, color: 'bg-green-600/60' },
  { from: 30, to: 40, color: 'bg-green-900/30' },
  { from: 40, to: 60, color: 'bg-zinc-700/30' },
  { from: 60, to: 70, color: 'bg-red-900/30' },
  { from: 70, to: 100, color: 'bg-red-600/60' },
];
const RSI_THRESH = [
  { at: RSI.OVERSOLD, color: 'bg-green-400/60' },
  { at: RSI.OVERBOUGHT, color: 'bg-red-400/60' },
];

// ADX 게이지 구간 (0-50)
const ADX_ZONES = [
  { from: 0, to: 20, color: 'bg-zinc-700/40' },
  { from: 20, to: 25, color: 'bg-yellow-800/40' },
  { from: 25, to: 40, color: 'bg-orange-700/50' },
  { from: 40, to: 50, color: 'bg-red-700/50' },
];
const ADX_THRESH = [
  { at: ADX.WEAK, color: 'bg-yellow-400/60' },
  { at: ADX.STRONG, color: 'bg-orange-400/60' },
];

// Volume 게이지 구간 (0-4x)
const VOL_ZONES = [
  { from: 0, to: 1, color: 'bg-zinc-700/30' },
  { from: 1, to: 2.5, color: 'bg-zinc-600/30' },
  { from: 2.5, to: 4, color: 'bg-cyan-700/50' },
];
const VOL_THRESHOLDS = [{ at: VOL_THRESH, color: 'bg-cyan-400/60' }];

// ATR 백분위 게이지 구간 (0-100)
const ATR_ZONES = [
  { from: 0, to: 50, color: 'bg-zinc-700/30' },
  { from: 50, to: 76, color: 'bg-zinc-600/40' },
  { from: 76, to: 100, color: 'bg-orange-700/50' },
];
const ATR_THRESH = [{ at: ATR_WARN, color: 'bg-orange-400/60' }];

// 값 색상
function rsiColor(v: number): string {
  if (v <= 30) return 'text-green-400';
  if (v >= 70) return 'text-red-400';
  if (v <= 40) return 'text-green-300/70';
  if (v >= 60) return 'text-red-300/70';
  return 'text-zinc-300';
}

function adxColor(v: number): string {
  if (v >= 40) return 'text-red-400';
  if (v >= 25) return 'text-orange-400';
  if (v >= 20) return 'text-yellow-400';
  return 'text-zinc-400';
}

function adxLabel(v: number): string {
  if (v >= 40) return '극강';
  if (v >= 25) return '강';
  if (v >= 20) return '중';
  return '약';
}

const REGIME_STYLE: Record<string, { text: string; color: string }> = {
  BULL: { text: '상승', color: 'text-green-400' },
  BEAR: { text: '하락', color: 'text-red-400' },
  SIDEWAYS: { text: '횡보', color: 'text-yellow-400' },
};

export const SignalThresholdMonitor = memo(({ timeframe }: SignalThresholdMonitorProps) => {
  const { indicatorSnapshot } = useSocket();
  const { ticker } = useSocketTicker();

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
  const emaAbove = price && ema200 ? price > ema200 : null;
  const emaDist = price && ema200 ? (((price - ema200) / ema200) * 100) : null;

  // RSI 신호 근접도: 30 이하 or 70 이상이면 "진입 가능"
  const rsiSignal = rsi !== null && (rsi <= 30 || rsi >= 70);
  // ADX 추세 판단: 20 이상이면 추세
  const adxTrending = adx !== null && adx >= 20;
  // 볼륨 돌파
  const volBreakout = volumeRatio !== null && volumeRatio >= VOL_THRESH;
  // ATR 경고 (평균회귀 차단)
  const atrHigh = atrPct !== null && atrPct >= ATR_WARN;

  return (
    <div className='flex items-center gap-2.5 px-3 py-1.5 mt-1 bg-zinc-900/60 rounded-lg text-[10px] flex-wrap'>
      {/* RSI */}
      {rsi !== null && (
        <div className='flex items-center gap-1' title={`RSI ${rsi.toFixed(1)} — ≤30: 매수 신호 구간, ≥70: 매도 신호 구간`}>
          <span className={`font-mono font-medium ${rsiColor(rsi)}`}>
            RSI {rsi.toFixed(0)}
          </span>
          <Gauge value={rsi} min={0} max={100} zones={RSI_ZONES} thresholds={RSI_THRESH} />
          {rsiSignal && <span className={rsi <= 30 ? 'text-green-400' : 'text-red-400'}>!</span>}
        </div>
      )}

      <div className='w-px h-3.5 bg-zinc-700/50' />

      {/* ADX */}
      {adx !== null && (
        <div className='flex items-center gap-1' title={`ADX ${adx.toFixed(1)} — ≥20: 추세 시작, ≥25: 강한 추세, <20: 횡보`}>
          <span className={`font-mono font-medium ${adxColor(adx)}`}>
            ADX {adx.toFixed(0)}
          </span>
          <Gauge value={adx} min={0} max={50} zones={ADX_ZONES} thresholds={ADX_THRESH} width='w-12' />
          <span className={`${adxColor(adx)} text-[9px]`}>{adxLabel(adx)}</span>
        </div>
      )}

      <div className='w-px h-3.5 bg-zinc-700/50' />

      {/* Volume */}
      {volumeRatio !== null && (
        <div className='flex items-center gap-1' title={`거래량 ${volumeRatio.toFixed(1)}x — ≥2.5x: 돌파 임계값 돌파`}>
          <span className={`font-mono font-medium ${volBreakout ? 'text-cyan-400' : 'text-zinc-400'}`}>
            Vol {volumeRatio.toFixed(1)}x
          </span>
          <Gauge value={volumeRatio} min={0} max={4} zones={VOL_ZONES} thresholds={VOL_THRESHOLDS} width='w-10' />
          {volBreakout && <span className='text-cyan-400'>!</span>}
        </div>
      )}

      <div className='w-px h-3.5 bg-zinc-700/50' />

      {/* ATR 백분위 */}
      {atrPct !== null && atr !== null && (
        <div className='flex items-center gap-1' title={`ATR $${atr.toFixed(0)} (P${atrPct}) — P76↑: 고변동성, 평균회귀 차단`}>
          <span className={`font-mono font-medium ${atrHigh ? 'text-orange-400' : 'text-zinc-400'}`}>
            ATR P{atrPct}
          </span>
          <Gauge value={atrPct} min={0} max={100} zones={ATR_ZONES} thresholds={ATR_THRESH} width='w-10' />
          {atrHigh && <span className='text-orange-400'>!</span>}
        </div>
      )}

      <div className='w-px h-3.5 bg-zinc-700/50' />

      {/* 레짐 + EMA200 */}
      <div className='flex items-center gap-1.5'>
        <span className={`font-medium ${regimeStyle.color}`}>
          {adxTrending ? (regime === 'BULL' ? '▲' : '▼') : '◆'} {regimeStyle.text}
        </span>
        {emaAbove !== null && emaDist !== null && (
          <span className={`font-mono ${emaAbove ? 'text-green-400/70' : 'text-red-400/70'}`}>
            EMA {emaDist > 0 ? '+' : ''}{emaDist.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
});

SignalThresholdMonitor.displayName = 'SignalThresholdMonitor';
