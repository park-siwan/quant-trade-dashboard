import { memo, useMemo } from 'react';
import { useSocket, useSocketTicker } from '@/contexts/SocketContext';
import type { TradeResult } from '@/lib/backtest-api';

interface SignalThresholdMonitorProps {
  timeframe: string;
  trades?: TradeResult[];
}

interface TypeStats { count: number; wins: number; wr: number; }

function calcTypeStats(trades: TradeResult[], type: string): TypeStats {
  const filtered = trades.filter(t => t.signalType === type);
  const wins = filtered.filter(t => t.pnl > 0).length;
  return { count: filtered.length, wins, wr: filtered.length > 0 ? (wins / filtered.length) * 100 : 0 };
}

// 전략별 실제 임계값 (JSON config 기준)
const THRESH = {
  RSI_OVERSOLD: 30,      // rsi_div.json → rsi_oversold
  RSI_OVERBOUGHT: 60,    // rsi_div.json → rsi_overbought (표준 70이 아닌 60!)
  VOL_MULT: 2.5,         // vol_breakout.json → volume_mult
  ADX_TREND: 25,         // vol_breakout.json → adx_threshold
  EMA_MAX_DIST: 1,       // vol_breakout.json → ema_max_dist_pct
  ATR_MAX_PCT: 76,       // orchestrator.json → mr_atr_max_pct (P76)
};

// ── 서브 컴포넌트 ──

/** 조건 칩: 충족=초록 배경, 미충족=어두운 배경 */
function Chip({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
        ok
          ? 'bg-green-500/15 text-green-400 border border-green-500/20'
          : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/30'
      }`}
      title={detail}
    >
      {label}
    </span>
  );
}

/** 프로그레스 바: 조건 충족 비율 시각화 */
function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? (filled / total) * 100 : 0;
  const allMet = filled === total && total > 0;

  return (
    <div className='flex items-center gap-1.5 shrink-0'>
      <div className='w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden'>
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            allMet
              ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]'
              : filled > 0
                ? 'bg-green-600/60'
                : 'bg-zinc-700/30'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-[10px] w-5 text-right ${allMet ? 'text-green-400' : 'text-zinc-500'}`}>
        {filled}/{total}
      </span>
    </div>
  );
}

/** 거래수/승률 배지 */
function StatsBadge({ stats }: { stats: TypeStats | null }) {
  if (!stats || stats.count === 0) return null;
  const wrColor = stats.wr >= 50 ? 'text-green-400' : stats.wr >= 40 ? 'text-yellow-400' : 'text-red-400';
  return (
    <span className='text-[10px] font-mono text-zinc-500 shrink-0' title={`${stats.wins}승 ${stats.count - stats.wins}패`}>
      {stats.count}회 <span className={wrColor}>{stats.wr.toFixed(0)}%</span>
    </span>
  );
}

const REGIME_STYLE: Record<string, { text: string; color: string; icon: string }> = {
  BULL: { text: '상승', color: 'text-green-400', icon: '▲' },
  BEAR: { text: '하락', color: 'text-red-400', icon: '▼' },
  SIDEWAYS: { text: '횡보', color: 'text-yellow-400', icon: '◆' },
};

export const SignalThresholdMonitor = memo(({ timeframe, trades }: SignalThresholdMonitorProps) => {
  const { indicatorSnapshot } = useSocket();
  const { ticker } = useSocketTicker();

  const typeStats = useMemo(() => {
    if (!trades || trades.length === 0) return null;
    return {
      divergence: calcTypeStats(trades, 'divergence'),
      breakout: calcTypeStats(trades, 'breakout'),
      mean_reversion: calcTypeStats(trades, 'mean_reversion'),
    };
  }, [trades]);

  const snap = indicatorSnapshot?.timeframe === timeframe ? indicatorSnapshot : null;

  if (!snap) {
    return (
      <div className='flex items-center px-3 py-1.5 mt-1 bg-zinc-900/60 rounded-lg'>
        <span className='text-[11px] text-zinc-600'>지표 로딩 중...</span>
      </div>
    );
  }

  const { rsi, adx, atr, atrPct, ema200, volumeRatio, regime, rsiPivot1, rsiPivot2, rsiDivSignal } = snap;
  const price = ticker?.price || snap.price;
  const regimeStyle = REGIME_STYLE[regime] || REGIME_STYLE.SIDEWAYS;
  const emaDist = price && ema200 ? (((price - ema200) / ema200) * 100) : null;

  // ── rsi_div 조건 (3단계: RSI구간 → 피봇1 → 피봇2+다이버전스) ──
  const rdRsi = rsi !== null && (rsi <= THRESH.RSI_OVERSOLD || rsi >= THRESH.RSI_OVERBOUGHT);
  const rdCount = [rdRsi, rsiPivot1, rsiPivot2].filter(Boolean).length;

  // ── vol_breakout 조건 ──
  const vbVol = volumeRatio !== null && volumeRatio >= THRESH.VOL_MULT;
  const vbAdx = adx !== null && adx >= THRESH.ADX_TREND;
  const vbEma = emaDist !== null && Math.abs(emaDist) <= THRESH.EMA_MAX_DIST;
  const vbRegime = regime !== 'SIDEWAYS';
  const vbCount = [vbVol, vbAdx, vbEma, vbRegime].filter(Boolean).length;

  // ── orchestrator/mean_reversion 조건 ──
  const mrAtr = atrPct !== null && atrPct < THRESH.ATR_MAX_PCT;
  const mrRegime = regime === 'SIDEWAYS';
  const mrCount = [mrAtr, mrRegime].filter(Boolean).length;

  // 포맷 헬퍼
  const fmtDist = emaDist !== null ? `${emaDist > 0 ? '+' : ''}${emaDist.toFixed(1)}%` : '—';

  return (
    <div className='mt-1 rounded-lg overflow-hidden space-y-px'>
      {/* ↩ 반전매매 (RSI Divergence) */}
      <div
        className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 text-[11px]'
        title='RSI 과매도/과매수 → 가격 피봇 감지 → 두 피봇 간 다이버전스 확인 후 진입'
      >
        <span className='text-zinc-400 font-medium w-13 shrink-0'>↩ 반전</span>
        <div className='flex items-center gap-1.5 flex-1 min-w-0 flex-wrap'>
          <Chip
            ok={rdRsi}
            label={`RSI ${rsi?.toFixed(0) ?? '—'}/${THRESH.RSI_OVERSOLD}·${THRESH.RSI_OVERBOUGHT}`}
            detail={`≤${THRESH.RSI_OVERSOLD} 과매도 또는 ≥${THRESH.RSI_OVERBOUGHT} 과매수 구간 필요`}
          />
          <Chip
            ok={!!rsiPivot1}
            label='피봇1'
            detail='RSI 구간 내 첫 번째 가격 피봇 감지 (pivot_left=5, right=2)'
          />
          <Chip
            ok={!!rsiPivot2}
            label='피봇2'
            detail='두 번째 피봇 감지 — 두 피봇 간 가격/RSI 다이버전스 비교 가능'
          />
          {rsiDivSignal && (
            <span className={`text-[10px] font-medium ${rsiDivSignal === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
              {rsiDivSignal === 'bullish' ? '강세' : '약세'} DIV
            </span>
          )}
        </div>
        <StatsBadge stats={typeStats?.divergence ?? null} />
        <ProgressBar filled={rdCount} total={3} />
      </div>

      {/* ⚡ 돌파매매 (Volume Breakout) */}
      <div
        className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 text-[11px]'
        title={`4개 필터 모두 통과 + 가격이 ${THRESH.VOL_MULT}x 거래량과 함께 고/저점 돌파 시 진입`}
      >
        <span className='text-zinc-400 font-medium w-13 shrink-0'>⚡ 돌파</span>
        <div className='flex items-center gap-1.5 flex-1 min-w-0 flex-wrap'>
          <Chip
            ok={vbVol}
            label={`Vol ${volumeRatio?.toFixed(1) ?? '—'}/${THRESH.VOL_MULT}x`}
            detail={`거래량 ≥${THRESH.VOL_MULT}x (20봉 평균 대비)`}
          />
          <Chip
            ok={vbAdx}
            label={`ADX ${adx?.toFixed(0) ?? '—'}/${THRESH.ADX_TREND}`}
            detail={`ADX ≥${THRESH.ADX_TREND} (강한 추세)`}
          />
          <Chip
            ok={vbEma}
            label={`EMA ${fmtDist}/±${THRESH.EMA_MAX_DIST}%`}
            detail={`EMA200 거리 ±${THRESH.EMA_MAX_DIST}% 이내 (위든 아래든 1% 이내여야 통과)`}
          />
          <Chip
            ok={vbRegime}
            label={`${regimeStyle.icon}${regimeStyle.text}`}
            detail='추세 레짐 필요 (BULL 또는 BEAR, 횡보 제외)'
          />
        </div>
        <StatsBadge stats={typeStats?.breakout ?? null} />
        <ProgressBar filled={vbCount} total={4} />
      </div>

      {/* ♻ 평균회귀 (Mean Reversion) */}
      <div
        className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 text-[11px]'
        title={`ATR이 낮고(P${THRESH.ATR_MAX_PCT} 미만) 횡보 레짐일 때 볼린저밴드 기반 평균회귀 진입`}
      >
        <span className='text-zinc-400 font-medium w-13 shrink-0'>♻ 평균회귀</span>
        <div className='flex items-center gap-1.5 flex-1 min-w-0'>
          <Chip
            ok={mrAtr}
            label={`ATR P${atrPct ?? '—'}/<P${THRESH.ATR_MAX_PCT}`}
            detail={`ATR 백분위 < P${THRESH.ATR_MAX_PCT} (저변동성 구간)`}
          />
          <Chip
            ok={mrRegime}
            label={`${regimeStyle.icon}${regimeStyle.text}`}
            detail='횡보 레짐 필요 (SIDEWAYS)'
          />
          {mrCount >= 2 && (
            <span className='text-green-400/50 text-[10px]'>BB 감시 중</span>
          )}
        </div>
        <StatsBadge stats={typeStats?.mean_reversion ?? null} />
        <ProgressBar filled={mrCount} total={2} />
      </div>
    </div>
  );
});

SignalThresholdMonitor.displayName = 'SignalThresholdMonitor';
