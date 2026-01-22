'use client';

import { BacktestResult } from '@/lib/backtest-api';

interface BacktestStatsProps {
  result: BacktestResult;
}

export default function BacktestStats({ result }: BacktestStatsProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">백테스트 결과</h2>
        <span className="text-sm text-zinc-400">
          {formatDate(result.startDate)} ~ {formatDate(result.endDate)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* 승률 */}
        <div className="bg-zinc-800 p-3 rounded">
          <div className="text-xs text-zinc-400 mb-1">승률</div>
          <div className={`text-2xl font-bold ${result.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {result.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-zinc-500">
            {result.winningTrades}W / {result.losingTrades}L
          </div>
        </div>

        {/* 총 수익 */}
        <div className="bg-zinc-800 p-3 rounded">
          <div className="text-xs text-zinc-400 mb-1">총 수익</div>
          <div className={`text-2xl font-bold ${result.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${result.totalPnl.toFixed(0)}
          </div>
          <div className="text-xs text-zinc-500">
            {result.totalPnlPercent >= 0 ? '+' : ''}{result.totalPnlPercent.toFixed(2)}%
          </div>
        </div>

        {/* Profit Factor */}
        <div className="bg-zinc-800 p-3 rounded">
          <div className="text-xs text-zinc-400 mb-1">Profit Factor</div>
          <div className={`text-2xl font-bold ${result.profitFactor >= 1.5 ? 'text-green-400' : result.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
            {result.profitFactor.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-500">
            W${result.avgWin.toFixed(0)} / L${result.avgLoss.toFixed(0)}
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="bg-zinc-800 p-3 rounded">
          <div className="text-xs text-zinc-400 mb-1">Max Drawdown</div>
          <div className={`text-2xl font-bold ${result.maxDrawdownPercent <= 5 ? 'text-green-400' : result.maxDrawdownPercent <= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
            {result.maxDrawdownPercent.toFixed(2)}%
          </div>
          <div className="text-xs text-zinc-500">
            Sharpe: {result.sharpeRatio.toFixed(2)}
          </div>
        </div>
      </div>

      {/* 추가 정보 */}
      <div className="mt-4 pt-4 border-t border-zinc-700 grid grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-zinc-400">총 거래: </span>
          <span className="text-white">{result.totalTrades}회</span>
        </div>
        <div>
          <span className="text-zinc-400">캔들 수: </span>
          <span className="text-white">{result.totalCandles}개</span>
        </div>
        <div>
          <span className="text-zinc-400">타임프레임: </span>
          <span className="text-white">{result.timeframe}</span>
        </div>
        <div>
          <span className="text-zinc-400">심볼: </span>
          <span className="text-white">{result.symbol}</span>
        </div>
      </div>
    </div>
  );
}
