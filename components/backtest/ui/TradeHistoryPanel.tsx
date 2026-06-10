'use client';

import { TradeResult } from '@/lib/backtest-api';
import { toSeconds } from '@/lib/utils/timestamp';

interface TradeHistoryPanelProps {
  trades: TradeResult[];
  isBacktestRunning: boolean;
  leverage: number;
  selectedTrade: TradeResult | null;
  onTradeClick: (trade: TradeResult) => void;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

export function TradeHistoryPanel({
  trades,
  isBacktestRunning,
  leverage,
  selectedTrade,
  onTradeClick,
}: TradeHistoryPanelProps) {
  return (
    <div className='mt-4'>
      <div className='bg-zinc-900 p-4 rounded-lg'>
        <h3 className='text-sm font-medium text-zinc-400 mb-3'>
          거래 히스토리 {isBacktestRunning ? '' : `(${trades.length})`}
        </h3>
        <div className='max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar'>
          {isBacktestRunning ? (
            <div className='space-y-2'>
              {[...Array(5)].map((_, i) => (
                <div key={i} className='flex items-center justify-between p-2 bg-zinc-800 rounded'>
                  <div className='flex items-center gap-2'>
                    <div className='w-6 h-5 bg-zinc-700 rounded animate-pulse' />
                    <div className='flex flex-col gap-1'>
                      <div className='w-24 h-3 bg-zinc-700 rounded animate-pulse' />
                      <div className='w-12 h-2 bg-zinc-700 rounded animate-pulse' />
                    </div>
                  </div>
                  <div className='w-12 h-4 bg-zinc-700 rounded animate-pulse' />
                </div>
              ))}
            </div>
          ) : trades.length > 0 ? (
            trades.map((trade, idx) => {
              const isSelected = selectedTrade?.entryTime === trade.entryTime;
              const pnlPercent = (trade.pnlPercent ?? 0) * leverage;
              const isWin = pnlPercent > 0;
              const entryDate = new Date(toSeconds(trade.entryTime) * 1000);
              const exitDate = new Date(toSeconds(trade.exitTime) * 1000);
              const durationMs = exitDate.getTime() - entryDate.getTime();
              const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
              const durationMins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
              const durationStr = durationHours > 0
                ? `${durationHours}h ${durationMins}m`
                : `${durationMins}m`;

              return (
                <div
                  key={idx}
                  onClick={() => onTradeClick(trade)}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                    isSelected ? 'bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-750'
                  }`}
                >
                  <div className='flex items-center gap-2'>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        trade.direction === 'long'
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-red-900/50 text-red-400'
                      }`}
                    >
                      {trade.direction === 'long' ? 'L' : 'S'}
                    </span>
                    <div className='flex flex-col'>
                      <span className='text-xs text-zinc-400'>{formatDate(exitDate)}</span>
                      <span className='text-[10px] text-zinc-500'>{durationStr}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                    {isWin ? '+' : ''}{pnlPercent.toFixed(2)}%
                  </span>
                </div>
              );
            })
          ) : (
            <div className='text-center text-zinc-500 text-xs py-4'>
              거래 내역이 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
