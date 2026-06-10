import { memo, useMemo, useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { indicatorSnapshotAtom, signalStatsAtom, tickerAtom } from '@/stores/socketAtoms';
import type { SignalStats } from '@/contexts/SocketContext';
import type { TradeResult } from '@/lib/backtest-api';
import { toSeconds } from '@/lib/utils/timestamp';
import { SignalVerdict } from './SignalVerdict';

interface SignalThresholdMonitorProps {
  timeframe: string;
  trades?: TradeResult[];
}

interface TypeStats {
  count: number;
  wins: number;
  wr: number;
  longCount: number;
  shortCount: number;
  longWr: number | null;
  shortWr: number | null;
}

function calcTypeStats(trades: TradeResult[], type: string): TypeStats {
  const filtered = trades.filter(t => t.signalType === type);
  const wins = filtered.filter(t => t.pnl > 0).length;
  const longs = filtered.filter(t => t.direction === 'long');
  const shorts = filtered.filter(t => t.direction === 'short');
  const longWins = longs.filter(t => t.pnl > 0).length;
  const shortWins = shorts.filter(t => t.pnl > 0).length;
  return {
    count: filtered.length,
    wins,
    wr: filtered.length > 0 ? (wins / filtered.length) * 100 : 0,
    longCount: longs.length,
    shortCount: shorts.length,
    longWr: longs.length > 0 ? (longWins / longs.length) * 100 : null,
    shortWr: shorts.length > 0 ? (shortWins / shorts.length) * 100 : null,
  };
}

/** 최근 N거래 승률 (유형별) — 엣지 이동 감지용, 전체 집계와 달리 최신 흐름 반영 */
function calcRecentWr(trades: TradeResult[], type: string, window = 20): { wr: number | null; count: number } {
  const filtered = trades
    .filter(t => t.signalType === type)
    .sort((a, b) => toSeconds(b.exitTime) - toSeconds(a.exitTime))
    .slice(0, window);
  if (filtered.length === 0) return { wr: null, count: 0 };
  const wins = filtered.filter(t => t.pnl > 0).length;
  return { wr: (wins / filtered.length) * 100, count: filtered.length };
}

const THRESH = {
  RSI_OVERSOLD: 30,
  RSI_OVERBOUGHT: 60,
  VOL_MULT: 2.5,
  ADX_TREND: 25,
  EMA_MAX_DIST: 1,
  ATR_MAX_PCT: 76,
};

// ── 미니 게이지 바 (충족 진행도) ─────────────────────────────────────

/**
 * 조건 충족까지의 진행도를 채움 바로 시각화.
 * progress 1.0 = 임계 도달(충족). 가득 찬 바 = 조건 ON — 모든 지표가 같은 방식으로 읽힘.
 */
function GaugeBar({
  name,
  displayValue,
  progress,
  met,
  color = 'green',
  tooltip,
}: {
  name: string;
  displayValue: string;
  /** 0~1 = 임계까지 진행도, ≥1 = 충족 (null = 데이터 없음) */
  progress: number | null;
  met: boolean;
  /** 충족 시 채움 색 (롱=초록, 숏=빨강, 횡보=노랑) */
  color?: 'green' | 'red' | 'yellow';
  tooltip?: string;
}) {
  const pct = progress !== null ? Math.max(0, Math.min(100, progress * 100)) : 0;

  const palette = {
    green: { border: 'border-green-500/25', bg: 'bg-green-500/8', name: 'text-green-400/70', value: 'text-green-300', fill: 'bg-green-400' },
    red: { border: 'border-red-500/30', bg: 'bg-red-500/8', name: 'text-red-400/70', value: 'text-red-300', fill: 'bg-red-400' },
    yellow: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/8', name: 'text-yellow-400/70', value: 'text-yellow-300', fill: 'bg-yellow-400' },
  }[color];

  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 py-1 rounded border ${
        met ? `${palette.bg} ${palette.border}` : 'bg-zinc-800/50 border-zinc-700/30'
      }`}
      title={tooltip}
    >
      <span className={`text-[9px] font-mono w-5 shrink-0 ${met ? palette.name : 'text-zinc-600'}`}>{name}</span>

      {/* 진행도 채움 바: 가득 차면 충족 */}
      <div className='relative w-10 h-2 bg-zinc-800/80 rounded-full overflow-hidden shrink-0'>
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
            met ? palette.fill : 'bg-zinc-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <span className={`text-[9px] font-mono shrink-0 ${met ? palette.value : 'text-zinc-400'}`}>{displayValue}</span>
    </div>
  );
}

/** Boolean 조건 도트 (피봇, 레짐 등) */
function CondDot({
  ok,
  label,
  detail,
  color = 'green',
}: {
  ok: boolean;
  label: string;
  detail: string;
  color?: 'green' | 'red' | 'yellow';
}) {
  const onColor: Record<string, string> = {
    green: 'bg-green-500/15 text-green-400 border-green-500/25',
    red: 'bg-red-500/15 text-red-400 border-red-500/25',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  };
  const dotOn: Record<string, string> = {
    green: 'bg-green-400',
    red: 'bg-red-400',
    yellow: 'bg-yellow-400',
  };
  return (
    <span
      className={`flex items-center gap-1 px-1.5 py-1 rounded border text-[9px] font-mono ${
        ok ? onColor[color] : 'bg-zinc-800/50 text-zinc-600 border-zinc-700/30'
      }`}
      title={detail}
    >
      <span className={`w-1 h-1 rounded-full shrink-0 ${ok ? dotOn[color] : 'bg-zinc-700'}`} />
      {label}
    </span>
  );
}

// ── StatsBadge: 롱/숏 분리 승률 ────────────────────────────────────

function StatsBadge({ stats }: { stats: TypeStats | null }) {
  if (!stats || stats.count === 0) return null;
  const wrColor = (wr: number) =>
    wr >= 55 ? 'text-green-400' : wr >= 45 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div
      className='flex items-center gap-1 shrink-0 font-mono text-[9px]'
      title={`${stats.wins}승 ${stats.count - stats.wins}패 / 전체 ${stats.count}회`}
    >
      <span className='text-zinc-600'>{stats.count}회</span>
      {stats.longWr !== null && (
        <span title={`롱 ${stats.longCount}회`}>
          <span className='text-green-700'>▲</span>
          <span className={wrColor(stats.longWr)}>{stats.longWr.toFixed(0)}%</span>
        </span>
      )}
      {stats.shortWr !== null && (
        <span title={`숏 ${stats.shortCount}회`}>
          <span className='text-red-700'>▼</span>
          <span className={wrColor(stats.shortWr)}>{stats.shortWr.toFixed(0)}%</span>
        </span>
      )}
    </div>
  );
}

// ── 조건 충족 프로그레스 ────────────────────────────────────────────

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const allMet = filled === total && total > 0;
  return (
    <div className='flex items-center gap-1 shrink-0'>
      <div className='flex gap-0.5'>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i < filled
                ? allMet
                  ? 'bg-green-400'
                  : 'bg-zinc-400'
                : 'bg-zinc-700'
            }`}
          />
        ))}
      </div>
      <span className={`font-mono text-[9px] w-5 text-right ${allMet ? 'text-green-400' : 'text-zinc-500'}`}>
        {filled}/{total}
      </span>
    </div>
  );
}

// ── 유틸 ───────────────────────────────────────────────────────────

function formatRelativeTime(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}초전`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간전`;
  return `${Math.floor(diff / 86_400_000)}일전`;
}

function getHealthColor(stats: SignalStats | null): { dot: string; text: string; label: string } {
  if (!stats) return { dot: 'bg-zinc-600', text: 'text-zinc-500', label: '대기' };
  if (stats.pythonErrors > 0 && stats.lastErrorAt && Date.now() - stats.lastErrorAt < 600_000) {
    return { dot: 'bg-red-500', text: 'text-red-400', label: '오류' };
  }
  if (!stats.lastSignalAt) return { dot: 'bg-zinc-600', text: 'text-zinc-500', label: '대기' };
  const age = Date.now() - stats.lastSignalAt;
  if (age < 1_800_000) return { dot: 'bg-green-500', text: 'text-green-400', label: '정상' };
  if (age < 7_200_000) return { dot: 'bg-yellow-500', text: 'text-yellow-400', label: '유휴' };
  return { dot: 'bg-red-500', text: 'text-red-400', label: '중단' };
}

const TYPE_ICONS: Record<string, string> = {
  breakout: '⚡',
  divergence: '↩',
  mean_reversion: '♻',
  rsi: '↩',
};

const DIR_LABEL: Record<string, { text: string; color: string }> = {
  bullish: { text: 'LONG', color: 'text-green-400' },
  bearish: { text: 'SHORT', color: 'text-red-400' },
};

// ── 실매매 헤더 ───────────────────────────────────────────────────

function LiveSignalHeader({ stats }: { stats: SignalStats | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  if (!stats) return null;

  const health = getHealthColor(stats);
  const dirStyle = stats.lastSignalDirection ? DIR_LABEL[stats.lastSignalDirection] : null;
  const typeIcon = stats.lastSignalType ? (TYPE_ICONS[stats.lastSignalType] || '') : '';

  return (
    <div className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 text-[11px] border-b border-zinc-800/50'>
      <span className='text-zinc-300 font-medium shrink-0'>{stats.liveStrategy}</span>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${health.dot}`} title={health.label} />
      <span className={`${health.text} text-[10px] shrink-0`}>{health.label}</span>

      {stats.lastSignalAt && (
        <span className='text-zinc-500 text-[10px] shrink-0'>
          {formatRelativeTime(stats.lastSignalAt)}
          {dirStyle && <span className={`ml-1 ${dirStyle.color}`}>{dirStyle.text}</span>}
          {typeIcon && <span className='ml-0.5 text-zinc-500'>{typeIcon}</span>}
        </span>
      )}

      <div className='flex-1' />

      {Object.entries(stats.byType).map(([type, count]) => (
        <span key={type} className='text-[10px] font-mono text-zinc-500' title={type}>
          {TYPE_ICONS[type] ?? ''}{count}
        </span>
      ))}
      {stats.totalSignals > 0 && (
        <span className='text-[10px] font-mono text-zinc-600'>={stats.totalSignals}</span>
      )}
      {stats.pythonErrors > 0 && (
        <span className='text-[10px] font-mono text-red-400' title={stats.lastErrorMsg || ''}>
          err:{stats.pythonErrors}
        </span>
      )}
      {stats.avgExecMs !== null && (
        <span className='text-[10px] font-mono text-zinc-600'>
          {(stats.avgExecMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export const SignalThresholdMonitor = memo(({ timeframe, trades }: SignalThresholdMonitorProps) => {
  const indicatorSnapshot = useAtomValue(indicatorSnapshotAtom);
  const signalStats = useAtomValue(signalStatsAtom);
  const ticker = useAtomValue(tickerAtom);

  const typeStats = useMemo(() => {
    if (!trades || trades.length === 0) return null;
    return {
      divergence: calcTypeStats(trades, 'divergence'),
      breakout: calcTypeStats(trades, 'breakout'),
      mean_reversion: calcTypeStats(trades, 'mean_reversion'),
    };
  }, [trades]);

  const recentStats = useMemo(() => {
    if (!trades || trades.length === 0) return null;
    return {
      divergence: calcRecentWr(trades, 'divergence'),
      breakout: calcRecentWr(trades, 'breakout'),
      mean_reversion: calcRecentWr(trades, 'mean_reversion'),
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

  const { rsi, adx, atrPct, ema200, volumeRatio, regime, rsiPivot1, rsiPivot2, rsiDivSignal } = snap;
  const price = ticker?.price || snap.price;
  const emaDist = price && ema200 ? (((price - ema200) / ema200) * 100) : null;
  const fmtEmaDist = emaDist !== null ? `${emaDist > 0 ? '+' : ''}${emaDist.toFixed(1)}%` : '—';

  // ── 조건 평가 ──
  const rdRsi = rsi !== null && (rsi <= THRESH.RSI_OVERSOLD || rsi >= THRESH.RSI_OVERBOUGHT);
  const rdCount = [rdRsi, rsiPivot1, rsiPivot2].filter(Boolean).length;

  const vbVol = volumeRatio !== null && volumeRatio >= THRESH.VOL_MULT;
  const vbAdx = adx !== null && adx >= THRESH.ADX_TREND;
  const vbEma = emaDist !== null && Math.abs(emaDist) <= THRESH.EMA_MAX_DIST;
  const vbRegime = regime !== 'SIDEWAYS';
  const vbCount = [vbVol, vbAdx, vbEma, vbRegime].filter(Boolean).length;

  const mrAtr = atrPct !== null && atrPct < THRESH.ATR_MAX_PCT;
  const mrRegime = regime === 'SIDEWAYS';
  const mrCount = [mrAtr, mrRegime].filter(Boolean).length;

  // ── 충족 진행도 (1.0 = 임계 도달) ──
  // RSI: 중립(45)에서 과매도/과매수 중 가까운 쪽으로의 진행도
  const RSI_NEUTRAL = (THRESH.RSI_OVERSOLD + THRESH.RSI_OVERBOUGHT) / 2;
  const rsiLongProg = rsi !== null ? (RSI_NEUTRAL - rsi) / (RSI_NEUTRAL - THRESH.RSI_OVERSOLD) : null;
  const rsiShortProg = rsi !== null ? (rsi - RSI_NEUTRAL) / (THRESH.RSI_OVERBOUGHT - RSI_NEUTRAL) : null;
  const rsiProg = rsi !== null ? Math.max(rsiLongProg!, rsiShortProg!) : null;
  const rsiSide: 'green' | 'red' = (rsiShortProg ?? 0) > (rsiLongProg ?? 0) ? 'red' : 'green';

  const volProg = volumeRatio !== null ? volumeRatio / THRESH.VOL_MULT : null;
  const adxProg = adx !== null ? adx / THRESH.ADX_TREND : null;
  // EMA: 거리 5% 밖 = 0, ±1% 이내 = 충족
  const emaProg = emaDist !== null ? (5 - Math.abs(emaDist)) / (5 - THRESH.EMA_MAX_DIST) : null;
  // ATR: P100 = 0, P76 미만 = 충족 (낮을수록 좋음)
  const atrProg = atrPct !== null ? (100 - atrPct) / (100 - THRESH.ATR_MAX_PCT) : null;

  // 레짐별 스타일
  const regimeColor: 'green' | 'red' | 'yellow' =
    regime === 'BULL' ? 'green' : regime === 'BEAR' ? 'red' : 'yellow';
  const regimeLabel = regime === 'BULL' ? '▲상승' : regime === 'BEAR' ? '▼하락' : '◆횡보';

  return (
    <div className='mt-1 rounded-lg overflow-hidden space-y-px'>
      <SignalVerdict
        edges={[
          {
            key: 'divergence',
            label: '반전',
            icon: '↩',
            filled: rdCount,
            total: 3,
            recentWr: recentStats?.divergence.wr ?? null,
            recentCount: recentStats?.divergence.count ?? 0,
          },
          {
            key: 'breakout',
            label: '돌파',
            icon: '⚡',
            filled: vbCount,
            total: 4,
            recentWr: recentStats?.breakout.wr ?? null,
            recentCount: recentStats?.breakout.count ?? 0,
          },
          {
            key: 'mean_reversion',
            label: '평균회귀',
            icon: '♻',
            filled: mrCount,
            total: 2,
            recentWr: recentStats?.mean_reversion.wr ?? null,
            recentCount: recentStats?.mean_reversion.count ?? 0,
          },
        ]}
      />
      <LiveSignalHeader stats={signalStats} />

      {/* ↩ 반전매매 — RSI Divergence */}
      <div
        className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 text-[11px]'
        title='RSI 과매도/과매수 → 피봇 감지 → 다이버전스 확인 후 진입'
      >
        <span className='text-zinc-400 font-medium w-13 shrink-0'>↩ 반전</span>
        <div className='flex items-center gap-1.5 flex-1 min-w-0 flex-wrap'>
          {/* RSI: 과매도(롱·초록)/과매수(숏·빨강) 중 가까운 쪽 진행도 */}
          <GaugeBar
            name='RSI'
            displayValue={rsi?.toFixed(0) ?? '—'}
            progress={rsiProg}
            met={rdRsi}
            color={rsiSide}
            tooltip={`RSI ${rsi?.toFixed(1)} | 조건: ≤${THRESH.RSI_OVERSOLD}(과매도·롱) 또는 ≥${THRESH.RSI_OVERBOUGHT}(과매수·숏) | 바 가득 = 충족`}
          />
          <CondDot ok={!!rsiPivot1} label='피봇1' detail='RSI 구간 내 첫 번째 가격 피봇 감지' />
          <CondDot ok={!!rsiPivot2} label='피봇2' detail='두 번째 피봇 — 다이버전스 비교 가능' />
          {rsiDivSignal && (
            <span className={`text-[9px] font-medium ${rsiDivSignal === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
              {rsiDivSignal === 'bullish' ? '▲강세DIV' : '▼약세DIV'}
            </span>
          )}
        </div>
        <StatsBadge stats={typeStats?.divergence ?? null} />
        <ProgressBar filled={rdCount} total={3} />
      </div>

      {/* ⚡ 돌파매매 — Volume Breakout */}
      <div
        className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 text-[11px]'
        title='4개 필터 통과 + 고/저점 돌파 시 진입'
      >
        <span className='text-zinc-400 font-medium w-13 shrink-0'>⚡ 돌파</span>
        <div className='flex items-center gap-1.5 flex-1 min-w-0 flex-wrap'>
          {/* 거래량: 평균 대비 배율 → 2.5×까지 진행도 */}
          <GaugeBar
            name='Vol'
            displayValue={volumeRatio !== null ? `×${volumeRatio.toFixed(1)}` : '—'}
            progress={volProg}
            met={vbVol}
            tooltip={`거래량 ${volumeRatio?.toFixed(2)}×. 조건: ≥${THRESH.VOL_MULT}× (20봉 평균 대비) | 바 가득 = 충족`}
          />
          {/* ADX: 25까지 진행도 */}
          <GaugeBar
            name='ADX'
            displayValue={adx?.toFixed(0) ?? '—'}
            progress={adxProg}
            met={vbAdx}
            tooltip={`ADX ${adx?.toFixed(1)}. 조건: ≥${THRESH.ADX_TREND} (강한 추세) | 바 가득 = 충족`}
          />
          {/* EMA 거리: 가까울수록 채워짐 (±1% 이내 = 충족) */}
          <GaugeBar
            name='EMA'
            displayValue={fmtEmaDist}
            progress={emaProg}
            met={vbEma}
            tooltip={`EMA200 거리 ${fmtEmaDist}. 조건: ±${THRESH.EMA_MAX_DIST}% 이내 (가까울수록 채워짐) | 바 가득 = 충족`}
          />
          {/* 레짐: 상승=초록, 하락=빨강 */}
          <CondDot
            ok={vbRegime}
            label={regimeLabel}
            detail={`현재 레짐: ${regime}. 조건: 추세 (BULL·BEAR)`}
            color={regimeColor}
          />
        </div>
        <StatsBadge stats={typeStats?.breakout ?? null} />
        <ProgressBar filled={vbCount} total={4} />
      </div>

      {/* ♻ 평균회귀 — Mean Reversion */}
      <div
        className='flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 text-[11px]'
        title={`ATR P${THRESH.ATR_MAX_PCT} 미만 + 횡보 레짐일 때 볼린저밴드 평균회귀 진입`}
      >
        <span className='text-zinc-400 font-medium w-13 shrink-0'>♻ 평균회귀</span>
        <div className='flex items-center gap-1.5 flex-1 min-w-0'>
          {/* ATR 백분위: 변동성 낮을수록 채워짐 (P76 미만 = 충족) */}
          <GaugeBar
            name='ATR'
            displayValue={atrPct !== null ? `P${atrPct}` : '—'}
            progress={atrProg}
            met={mrAtr}
            color='yellow'
            tooltip={`ATR 백분위 P${atrPct}. 조건: <P${THRESH.ATR_MAX_PCT} (저변동성, 낮을수록 채워짐) | 바 가득 = 충족`}
          />
          <CondDot
            ok={mrRegime}
            label='◆횡보'
            detail={`현재 레짐: ${regime}. 조건: SIDEWAYS (횡보)`}
            color='yellow'
          />
          {mrCount >= 2 && (
            <span className='text-yellow-400/60 text-[9px]'>BB 감시 중</span>
          )}
        </div>
        <StatsBadge stats={typeStats?.mean_reversion ?? null} />
        <ProgressBar filled={mrCount} total={2} />
      </div>
    </div>
  );
});

SignalThresholdMonitor.displayName = 'SignalThresholdMonitor';
