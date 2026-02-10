import { memo } from 'react';
import { useSocket, useSocketTicker } from '@/contexts/SocketContext';
import { RSI, ADX } from '@/lib/thresholds';

interface SignalThresholdMonitorProps {
  timeframe: string;
}

// 임계값
const VOL_THRESH = 2.5;   // 볼륨 돌파
const ATR_WARN = 76;       // 평균회귀 차단 백분위

// 전략별 실제 임계값 (JSON config 기준)
const STRAT = {
  RSI_OVERSOLD: 30,      // rsi_div.json → rsi_oversold
  RSI_OVERBOUGHT: 60,    // rsi_div.json → rsi_overbought (표준 70이 아닌 60!)
  ADX_TREND: 25,         // vol_breakout.json → adx_threshold
  EMA_MAX_DIST: 1,       // vol_breakout.json → ema_max_dist_pct
};

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
      {zones.map((z, i) => {
        const left = ((z.from - min) / (max - min)) * 100;
        const w = ((z.to - z.from) / (max - min)) * 100;
        return <div key={i} className={`absolute top-0 h-full ${z.color}`} style={{ left: `${left}%`, width: `${w}%` }} />;
      })}
      {thresholds?.map((t, i) => {
        const pos = ((t.at - min) / (max - min)) * 100;
        return <div key={i} className={`absolute top-0 w-[1.5px] h-full ${t.color}`} style={{ left: `${pos}%` }} />;
      })}
      <div
        className='absolute top-0 w-[3px] h-full bg-white rounded-full shadow-[0_0_3px_rgba(255,255,255,0.8)]'
        style={{ left: `calc(${pct}% - 1.5px)` }}
      />
    </div>
  );
}

/** 전략 조건 라벨: 충족=초록, 미충족=어두운 회색 */
function Cond({ ok, label, title }: { ok: boolean; label: string; title?: string }) {
  return (
    <span className={ok ? 'text-green-400/90' : 'text-zinc-600'} title={title}>
      {label}
    </span>
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
  { at: STRAT.RSI_OVERBOUGHT, color: 'bg-purple-400/60' },  // 전략 실제값 60
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

  // ── 게이지용 판단 ──
  const rsiSignal = rsi !== null && (rsi <= 30 || rsi >= 70);
  const adxTrending = adx !== null && adx >= 20;
  const volBreakout = volumeRatio !== null && volumeRatio >= VOL_THRESH;
  const atrHigh = atrPct !== null && atrPct >= ATR_WARN;

  // ── 전략 필터 조건 (실제 JSON config 임계값 기준) ──

  // rsi_div: RSI가 과매도/과매수 구간에 있어야 다이버전스 감지 가능
  const rdRsi = rsi !== null && (rsi <= STRAT.RSI_OVERSOLD || rsi >= STRAT.RSI_OVERBOUGHT);

  // vol_breakout: 4개 필터 모두 통과해야 진입
  const vbVol = volumeRatio !== null && volumeRatio >= VOL_THRESH;
  const vbAdx = adx !== null && adx >= STRAT.ADX_TREND;
  const vbEma = emaDist !== null && Math.abs(emaDist) <= STRAT.EMA_MAX_DIST;
  const vbRegime = regime !== 'SIDEWAYS';
  const vbCount = [vbVol, vbAdx, vbEma, vbRegime].filter(Boolean).length;

  // orchestrator/mean_reversion: ATR 낮고 횡보일 때만 진입
  const mrAtr = atrPct !== null && atrPct < ATR_WARN;
  const mrRegime = regime === 'SIDEWAYS';
  const mrCount = [mrAtr, mrRegime].filter(Boolean).length;

  return (
    <div className='mt-1 rounded-lg overflow-hidden'>
      {/* Row 1: 지표 게이지 */}
      <div className='flex items-center gap-2.5 px-3 py-1.5 bg-zinc-900/60 text-[10px] flex-wrap'>
        {/* RSI */}
        {rsi !== null && (
          <div className='flex items-center gap-1' title={`RSI ${rsi.toFixed(1)} — ≤30: 과매도, ≥60: rsi_div 과매수, ≥70: 표준 과매수`}>
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
          <div className='flex items-center gap-1' title={`ADX ${adx.toFixed(1)} — ≥20: 추세 시작, ≥25: 돌파매매 임계값, <20: 횡보`}>
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
          <div className='flex items-center gap-1' title={`거래량 ${volumeRatio.toFixed(1)}x — ≥2.5x: 돌파매매 임계값`}>
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

      {/* Row 2: 전략 필터 상태 */}
      <div className='flex items-center gap-2.5 px-3 py-1 bg-zinc-950/50 text-[9px] flex-wrap border-t border-zinc-800/30'>
        {/* rsi_div */}
        <div
          className='flex items-center gap-1'
          title='반전매매(RSI Divergence): RSI ≤30 or ≥60일 때 다이버전스 패턴 감지 가능. 필터 통과 후에도 피봇 패턴이 필요.'
        >
          <span className='text-zinc-500 font-medium'>↩반전</span>
          <Cond
            ok={rdRsi}
            label={rsi !== null
              ? (rsi <= STRAT.RSI_OVERSOLD
                ? `RSI≤${STRAT.RSI_OVERSOLD}`
                : rsi >= STRAT.RSI_OVERBOUGHT
                  ? `RSI≥${STRAT.RSI_OVERBOUGHT}`
                  : `RSI ${rsi.toFixed(0)}`)
              : '—'}
            title={`RSI ≤${STRAT.RSI_OVERSOLD} 또는 ≥${STRAT.RSI_OVERBOUGHT}이어야 다이버전스 감지`}
          />
          {rdRsi
            ? <span className='text-green-400/60'>대기</span>
            : <span className='text-zinc-600'>—</span>}
        </div>

        <div className='w-px h-3 bg-zinc-800/50' />

        {/* vol_breakout */}
        <div
          className='flex items-center gap-1'
          title={`돌파매매(Volume Breakout): Vol≥${VOL_THRESH}x + ADX≥${STRAT.ADX_TREND} + EMA200≤${STRAT.EMA_MAX_DIST}% + 추세 레짐. 4개 모두 통과 + 가격 돌파 필요.`}
        >
          <span className='text-zinc-500 font-medium'>⚡돌파</span>
          <Cond ok={vbVol} label='Vol' title={`거래량 ≥${VOL_THRESH}x`} />
          <Cond ok={vbAdx} label='ADX' title={`ADX ≥${STRAT.ADX_TREND}`} />
          <Cond ok={vbEma} label='EMA' title={`EMA200 거리 ≤${STRAT.EMA_MAX_DIST}%`} />
          <Cond ok={vbRegime} label='추세' title='레짐이 BULL 또는 BEAR' />
          <span className={vbCount >= 4 ? 'text-green-400' : 'text-zinc-600 font-mono'}>
            {vbCount}/4
          </span>
        </div>

        <div className='w-px h-3 bg-zinc-800/50' />

        {/* orchestrator/mean_reversion */}
        <div
          className='flex items-center gap-1'
          title={`평균회귀(Mean Reversion): ATR < P${ATR_WARN} + 횡보 레짐일 때 볼린저밴드 기반 진입. 고변동 구간에서는 차단.`}
        >
          <span className='text-zinc-500 font-medium'>♻평균회귀</span>
          <Cond ok={mrAtr} label={`ATR<P${ATR_WARN}`} title={`ATR 백분위가 ${ATR_WARN} 미만이어야 진입 가능`} />
          <Cond ok={mrRegime} label='횡보' title='레짐이 SIDEWAYS여야 함' />
          <span className={mrCount >= 2 ? 'text-green-400' : 'text-zinc-600 font-mono'}>
            {mrCount}/2
          </span>
        </div>
      </div>
    </div>
  );
});

SignalThresholdMonitor.displayName = 'SignalThresholdMonitor';
