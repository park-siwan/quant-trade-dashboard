'use client';

import { TradeResult } from '@/lib/backtest-api';

interface TradeListProps {
  trades: TradeResult[];
  onTradeClick: (trade: TradeResult) => void;
  selectedTrade?: TradeResult | null;
}

export default function TradeList({ trades, onTradeClick, selectedTrade }: TradeListProps) {
  const formatTime = (dateStr: string) => {
    // UTC로 해석하여 한국 시간으로 표시 (YYYY-MM-DD HH:mm)
    const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const date = new Date(utcDateStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
  };

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <h2 className="text-lg font-semibold text-white mb-4">거래 목록 ({trades.length})</h2>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400 sticky top-0 bg-zinc-900">
            <tr>
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">방향</th>
              <th className="text-left py-2 px-2">진입</th>
              <th className="text-left py-2 px-2">청산</th>
              <th className="text-right py-2 px-2">진입가</th>
              <th className="text-right py-2 px-2">청산가</th>
              <th className="text-right py-2 px-2">손익</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => {
              const isSelected = selectedTrade?.entryTime === trade.entryTime;
              const isWin = trade.pnl > 0;

              return (
                <tr
                  key={index}
                  onClick={() => onTradeClick(trade)}
                  className={`cursor-pointer border-b border-zinc-800 hover:bg-zinc-800 transition-colors ${
                    isSelected ? 'bg-zinc-700' : ''
                  }`}
                >
                  <td className="py-2 px-2 text-zinc-400">{index + 1}</td>
                  <td className="py-2 px-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        trade.direction === 'long'
                          ? 'bg-green-900 text-green-400'
                          : 'bg-red-900 text-red-400'
                      }`}
                    >
                      {trade.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-zinc-300">{formatTime(trade.entryTime)}</td>
                  <td className="py-2 px-2 text-zinc-300">{formatTime(trade.exitTime)}</td>
                  <td className="py-2 px-2 text-right text-white">${trade.entryPrice.toFixed(0)}</td>
                  <td className="py-2 px-2 text-right text-white">${trade.exitPrice.toFixed(0)}</td>
                  <td className={`py-2 px-2 text-right font-medium ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                    {isWin ? '+' : ''}{trade.pnl.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
