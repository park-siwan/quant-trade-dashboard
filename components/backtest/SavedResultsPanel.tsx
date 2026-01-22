'use client';

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  SavedOptimizeResult,
  getSavedResults,
  getTopSavedResults,
  getOptimizeStats,
  deleteSavedResult,
  OptimizeStats,
} from '@/lib/backtest-api';

interface SavedResultsPanelProps {
  onApplyParams: (params: {
    rsiPeriod: number;
    pivotLeftBars: number;
    pivotRightBars: number;
    minDistance: number;
    maxDistance: number;
    takeProfitAtr: number;
    stopLossAtr: number;
    minDivergencePct?: number;
    indicators?: string[];
  }) => void;
  onViewResult?: (params: {
    rsiPeriod: number;
    pivotLeftBars: number;
    pivotRightBars: number;
    minDistance: number;
    maxDistance: number;
    takeProfitAtr: number;
    stopLossAtr: number;
    minDivergencePct?: number;
    indicators?: string[];
  }) => void;
}

export interface SavedResultsPanelRef {
  refresh: () => void;
}

const SavedResultsPanel = forwardRef<SavedResultsPanelRef, SavedResultsPanelProps>(({ onApplyParams, onViewResult }, ref) => {
  const [results, setResults] = useState<SavedOptimizeResult[]>([]);
  const [stats, setStats] = useState<OptimizeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'recent' | 'top-sharpe' | 'top-profit'>('recent');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadResults();
    loadStats();
  }, [viewMode]);

  // 외부에서 refresh 호출 가능하도록 노출
  useImperativeHandle(ref, () => ({
    refresh: () => {
      loadResults();
      loadStats();
    },
  }));

  const loadResults = async () => {
    setIsLoading(true);
    try {
      let data: SavedOptimizeResult[];
      switch (viewMode) {
        case 'top-sharpe':
          data = await getTopSavedResults('sharpe', 20);
          break;
        case 'top-profit':
          data = await getTopSavedResults('profit', 20);
          break;
        default:
          data = await getSavedResults(50);
      }
      setResults(data);
    } catch (err) {
      console.error('Failed to load saved results:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getOptimizeStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleApply = (item: SavedOptimizeResult) => {
    // indicators는 쉼표 구분 문자열로 저장됨 (예: "rsi,obv,cvd")
    const indicators = item.indicators ? item.indicators.split(',').filter(Boolean) : ['rsi'];
    const params = {
      rsiPeriod: item.rsiPeriod,
      pivotLeftBars: item.pivotLeft,
      pivotRightBars: item.pivotRight,
      minDistance: item.minDistance,
      maxDistance: item.maxDistance,
      takeProfitAtr: item.tpAtr,
      stopLossAtr: item.slAtr,
      minDivergencePct: item.minDivPct,
      indicators,
    };
    onApplyParams(params);
  };

  const handleViewChart = (item: SavedOptimizeResult) => {
    // indicators는 쉼표 구분 문자열로 저장됨 (예: "rsi,obv,cvd")
    const indicators = item.indicators ? item.indicators.split(',').filter(Boolean) : ['rsi'];
    const params = {
      rsiPeriod: item.rsiPeriod,
      pivotLeftBars: item.pivotLeft,
      pivotRightBars: item.pivotRight,
      minDistance: item.minDistance,
      maxDistance: item.maxDistance,
      takeProfitAtr: item.tpAtr,
      stopLossAtr: item.slAtr,
      minDivergencePct: item.minDivPct,
      indicators,
    };
    onApplyParams(params);
    onViewResult?.(params);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 결과를 삭제하시겠습니까?')) return;
    try {
      await deleteSavedResult(id);
      setResults(results.filter(r => r.id !== id));
      loadStats();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-zinc-900 p-4 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">저장된 최적화 결과</h2>
        <button
          onClick={loadResults}
          disabled={isLoading}
          className="text-xs text-zinc-400 hover:text-white"
        >
          {isLoading ? '로딩...' : '새로고침'}
        </button>
      </div>

      {/* 통계 */}
      {stats && stats.totalCount > 0 && (
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="bg-zinc-800 p-2 rounded">
            <div className="text-xs text-zinc-400">저장된 결과</div>
            <div className="text-lg font-bold text-white">{stats.totalCount}</div>
          </div>
          <div className="bg-zinc-800 p-2 rounded">
            <div className="text-xs text-zinc-400">최고 Sharpe</div>
            <div className="text-lg font-bold text-blue-400">{stats.bestSharpe.toFixed(2)}</div>
          </div>
          <div className="bg-zinc-800 p-2 rounded">
            <div className="text-xs text-zinc-400">최고 수익률</div>
            <div className={`text-lg font-bold ${stats.bestProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.bestProfit >= 0 ? '+' : ''}{stats.bestProfit.toFixed(1)}%
            </div>
          </div>
          <div className="bg-zinc-800 p-2 rounded">
            <div className="text-xs text-zinc-400">평균 Sharpe</div>
            <div className="text-lg font-bold text-zinc-300">{stats.avgSharpe.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* 필터 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('recent')}
          className={`px-3 py-1.5 text-sm rounded ${
            viewMode === 'recent'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          최근
        </button>
        <button
          onClick={() => setViewMode('top-sharpe')}
          className={`px-3 py-1.5 text-sm rounded ${
            viewMode === 'top-sharpe'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Sharpe 순
        </button>
        <button
          onClick={() => setViewMode('top-profit')}
          className={`px-3 py-1.5 text-sm rounded ${
            viewMode === 'top-profit'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          수익률 순
        </button>
      </div>

      {/* 결과 목록 */}
      {results.length === 0 ? (
        <div className="text-center text-zinc-500 py-8">
          저장된 결과가 없습니다.
          <br />
          <span className="text-sm">최적화 실행 후 결과를 저장해보세요.</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700 text-xs">
                <th className="text-left py-2 px-1">날짜</th>
                <th className="text-center py-2 px-1">방식</th>
                <th className="text-left py-2 px-1">조건</th>
                <th className="text-center py-2 px-1">RSI</th>
                <th className="text-center py-2 px-1">Pivot</th>
                <th className="text-center py-2 px-1">Dist</th>
                <th className="text-center py-2 px-1">TP/SL</th>
                <th className="text-center py-2 px-1" title="최소 다이버전스 강도">Div</th>
                <th className="text-right py-2 px-1">거래</th>
                <th className="text-right py-2 px-1" title="갈아타기 횟수">플립</th>
                <th className="text-right py-2 px-1">승률</th>
                <th className="text-right py-2 px-1">수익률</th>
                <th className="text-right py-2 px-1">MDD</th>
                <th className="text-right py-2 px-1">Sharpe</th>
                <th className="text-center py-2 px-1">액션</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-zinc-800 hover:bg-zinc-800/50"
                >
                  <td className="py-2 px-2 text-zinc-500 text-xs">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      item.optimizeMethod === 'bayesian'
                        ? 'bg-purple-900/50 text-purple-300'
                        : 'bg-blue-900/50 text-blue-300'
                    }`}>
                      {item.optimizeMethod === 'bayesian' ? 'B' : 'G'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs">
                    <span className="text-zinc-400">{item.symbol}</span>
                    <span className="text-zinc-600 mx-1">|</span>
                    <span className="text-zinc-400">{item.timeframe}</span>
                  </td>
                  <td className="py-2 px-2">{item.rsiPeriod}</td>
                  <td className="py-2 px-2 text-xs">
                    {item.pivotLeft}/{item.pivotRight}
                  </td>
                  <td className="py-2 px-2 text-xs">
                    {item.minDistance}-{item.maxDistance}
                  </td>
                  <td className="py-2 px-2 text-xs">
                    {item.tpAtr}/{item.slAtr}
                  </td>
                  <td className="py-2 px-2 text-center text-xs text-zinc-400">
                    {item.minDivPct != null ? `${item.minDivPct}%` : '-'}
                  </td>
                  <td className="py-2 px-2 text-right">{item.totalTrades}</td>
                  <td className="py-2 px-2 text-right text-xs text-zinc-400">
                    {item.flipCount ?? '-'}
                  </td>
                  <td className="py-2 px-2 text-right">{item.winRate.toFixed(1)}%</td>
                  <td className={`py-2 px-2 text-right font-medium ${
                    item.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {item.totalPnlPercent >= 0 ? '+' : ''}{item.totalPnlPercent.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right text-red-400">
                    {item.maxDrawdown.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-blue-400">
                    {item.sharpeRatio.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => handleViewChart(item)}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                        title="차트 & 거래내역 보기"
                      >
                        보기
                      </button>
                      <button
                        onClick={() => handleApply(item)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                        title="파라미터 선택"
                      >
                        선택
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs bg-zinc-700 hover:bg-red-600 text-zinc-300 hover:text-white px-2 py-1 rounded"
                        title="삭제"
                      >
                        X
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

SavedResultsPanel.displayName = 'SavedResultsPanel';

export default SavedResultsPanel;
