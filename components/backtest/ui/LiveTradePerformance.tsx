'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchLiveTrades, fetchLiveTradeStats, LiveTrade, TradeStats, SourceStats } from '@/lib/backtest-api';

const TYPE_LABELS: Record<string, string> = {
  breakout: '돌파',
  divergence: '반전',
  mean_reversion: 'MR',
};

const TYPE_ICONS: Record<string, string> = {
  breakout: '\u26A1',
  divergence: '\u21A9',
  mean_reversion: '\u267B',
};

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return `${hours}h ${rem}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${pnl.toFixed(2)}`;
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function SourceCard({ label, icon, stats }: { label: string; icon: string; stats: SourceStats }) {
  const pnlColor = stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400';
  const wrColor = stats.winRate >= 50 ? 'text-green-400' : stats.winRate >= 40 ? 'text-yellow-400' : 'text-red-400';
  const srColor = stats.sharpeRatio >= 1 ? 'text-green-400' : stats.sharpeRatio >= 0 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className='bg-zinc-800/50 rounded-lg p-3'>
      <div className='flex items-center gap-2 mb-3'>
        <span className='text-lg'>{icon}</span>
        <span className='text-sm font-medium text-zinc-200'>{label}</span>
        <span className='text-xs text-zinc-500'>({stats.totalTrades})</span>
      </div>

      <div className='grid grid-cols-3 gap-2 text-center mb-3'>
        <div>
          <div className='text-[10px] text-zinc-500 uppercase'>Win Rate</div>
          <div className={`text-sm font-mono font-medium ${wrColor}`}>
            {stats.totalTrades > 0 ? `${stats.winRate.toFixed(0)}%` : '-'}
          </div>
        </div>
        <div>
          <div className='text-[10px] text-zinc-500 uppercase'>PnL</div>
          <div className={`text-sm font-mono font-medium ${pnlColor}`}>
            {stats.totalTrades > 0 ? formatPnl(stats.totalPnl) : '-'}
          </div>
        </div>
        <div>
          <div className='text-[10px] text-zinc-500 uppercase'>SR</div>
          <div className={`text-sm font-mono font-medium ${srColor}`}>
            {stats.totalTrades >= 2 ? stats.sharpeRatio.toFixed(2) : '-'}
          </div>
        </div>
      </div>

      {/* Auto: type breakdown */}
      {Object.keys(stats.byType).length > 0 && (
        <div className='border-t border-zinc-700 pt-2 space-y-1'>
          {Object.entries(stats.byType).map(([type, data]) => (
            <div key={type} className='flex items-center justify-between text-xs'>
              <span className='text-zinc-400'>
                {TYPE_ICONS[type] || ''} {TYPE_LABELS[type] || type}
              </span>
              <span className='text-zinc-500'>{data.count}</span>
              <span className={data.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                {formatPnl(data.pnl)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: LiveTrade }) {
  const isOpen = trade.status === 'open';
  const sourceIcon = trade.source === 'auto' ? '\uD83E\uDD16' : '\uD83E\uDDD1';
  const sideLabel = trade.side === 'buy' ? 'L' : 'S';
  const sideColor = trade.side === 'buy' ? 'text-green-400' : 'text-red-400';
  const pnlColor = (trade.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400';
  const typeLabel = trade.signalType ? (TYPE_LABELS[trade.signalType] || trade.signalType) : 'manual';
  const duration = trade.closedAt
    ? formatDuration(trade.closedAt - trade.openedAt)
    : formatDuration(Date.now() - trade.openedAt);

  const statusLabel = isOpen
    ? 'OPEN'
    : trade.status === 'closed_tp'
      ? 'TP'
      : trade.status === 'closed_sl'
        ? 'SL'
        : 'Manual';
  const statusColor = isOpen
    ? 'text-blue-400'
    : trade.status === 'closed_tp'
      ? 'text-green-400'
      : 'text-red-400';

  return (
    <div className='flex items-center gap-2 text-xs p-1.5 bg-zinc-800/30 rounded hover:bg-zinc-800/60 transition-colors'>
      <span className='w-5 text-center'>{sourceIcon}</span>
      <span className={`w-4 font-mono font-bold ${sideColor}`}>{sideLabel}</span>
      <span className='w-12 text-zinc-400 truncate'>{typeLabel}</span>
      <span className='flex-1 font-mono text-zinc-300 text-right'>
        ${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        {trade.exitPrice ? ` \u2192 $${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''}
      </span>
      <span className={`w-16 font-mono text-right ${pnlColor}`}>
        {trade.pnl != null ? formatPnl(trade.pnl) : '-'}
      </span>
      <span className={`w-10 font-mono text-right ${pnlColor}`}>
        {trade.pnlPercent != null ? formatPct(trade.pnlPercent) : ''}
      </span>
      <span className={`w-10 text-right font-mono text-[10px] ${statusColor}`}>{statusLabel}</span>
      <span className='w-12 text-right text-zinc-500'>{duration}</span>
    </div>
  );
}

export default function LiveTradePerformance() {
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [t, s] = await Promise.all([fetchLiveTrades(), fetchLiveTradeStats()]);
    setTrades(t);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 30000); // 30s polling
    return () => clearInterval(iv);
  }, [refresh]);

  if (loading) {
    return (
      <div className='bg-zinc-900 rounded-xl p-4 text-center text-zinc-500 text-sm'>
        Loading trades...
      </div>
    );
  }

  const closedTrades = trades.filter(t => t.status !== 'open');
  const overall = stats?.overall;

  // Winner: who has higher SR (or totalPnl as tiebreaker)
  const autoWins = stats && stats.auto.totalTrades > 0 && stats.manual.totalTrades > 0
    ? stats.auto.sharpeRatio > stats.manual.sharpeRatio
    : null;

  return (
    <div className='bg-zinc-900 rounded-xl p-4'>
      {/* Header */}
      <div className='flex items-center justify-between mb-4'>
        <h2 className='text-sm font-semibold text-zinc-200'>
          Live Performance
        </h2>
        {overall && overall.totalTrades > 0 && (
          <div className='flex items-center gap-2 text-xs'>
            <span className='text-zinc-400'>{overall.totalTrades} trades</span>
            <span className={overall.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
              {formatPnl(overall.totalPnl)}
            </span>
          </div>
        )}
      </div>

      {closedTrades.length === 0 ? (
        <div className='text-center text-zinc-600 text-sm py-8'>
          No trades recorded yet
        </div>
      ) : (
        <>
          {/* Auto vs Manual cards */}
          {stats && (
            <div className='grid grid-cols-2 gap-3 mb-4'>
              <div className={autoWins === true ? 'ring-1 ring-green-500/30 rounded-lg' : ''}>
                <SourceCard label='Auto' icon='\uD83E\uDD16' stats={stats.auto} />
              </div>
              <div className={autoWins === false ? 'ring-1 ring-green-500/30 rounded-lg' : ''}>
                <SourceCard label='Manual' icon='\uD83E\uDDD1' stats={stats.manual} />
              </div>
            </div>
          )}

          {/* Recent trades list */}
          <div>
            <h3 className='text-xs text-zinc-500 mb-2'>Recent Trades</h3>
            <div className='max-h-48 overflow-y-auto space-y-0.5 custom-scrollbar'>
              {[...trades]
                .sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt))
                .slice(0, 20)
                .map(trade => (
                  <TradeRow key={trade.id} trade={trade} />
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
