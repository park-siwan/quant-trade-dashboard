'use client';

import { useAtom, useAtomValue } from 'jotai';
import { strategyChartTabAtom, highlightedStrategyAtom, leverageAtom } from '@/stores/strategyAtoms';
import { EquityPoint } from '@/lib/backtest-api';
import MultiStrategyEquityChart from '../MultiStrategyEquityChart';
import WeeklySharpeTimeline from '../WeeklySharpeTimeline';
import AvgSharpeChart from '../AvgSharpeChart';

interface ChartStrategy {
  strategyId: number;
  strategyName: string;
  strategyType: string;
  color: string;
  equityCurve: EquityPoint[];
  rollingSharpe: Array<{ timestamp: number; sharpe: number }>;
}

interface StrategyComparisonPanelProps {
  chartStrategies: ChartStrategy[];
  isLoadingAllStrategies: boolean;
  isLoadingEquityCurves: boolean;
  hasData: boolean;
  onStrategyClick: (strategyId: number) => void;
}

export function StrategyComparisonPanel({
  chartStrategies,
  isLoadingAllStrategies,
  isLoadingEquityCurves,
  hasData,
  onStrategyClick,
}: StrategyComparisonPanelProps) {
  const [strategyChartTab, setStrategyChartTab] = useAtom(strategyChartTabAtom);
  const highlightedStrategy = useAtomValue(highlightedStrategyAtom);
  const leverage = useAtomValue(leverageAtom);
  const isLoading = isLoadingAllStrategies || isLoadingEquityCurves;

  return (
    <div className="bg-zinc-900 rounded-lg overflow-hidden">
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setStrategyChartTab(strategyChartTab === 'equity' ? null : 'equity')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            strategyChartTab === 'equity'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-800/50'
              : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/30'
          }`}
        >
          📈 자산 곡선
        </button>
        <button
          onClick={() => setStrategyChartTab(strategyChartTab === 'sharpe' ? null : 'sharpe')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            strategyChartTab === 'sharpe'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-zinc-800/50'
              : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/30'
          }`}
        >
          📊 샤프 타임라인
        </button>
        <button
          onClick={() => setStrategyChartTab(strategyChartTab === 'avg-sharpe' ? null : 'avg-sharpe')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            strategyChartTab === 'avg-sharpe'
              ? 'text-cyan-400 border-b-2 border-cyan-400 bg-zinc-800/50'
              : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/30'
          }`}
        >
          📉 평균 샤프
        </button>
        {strategyChartTab && (
          <button
            onClick={() => setStrategyChartTab(null)}
            className="ml-auto px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300"
          >
            ✕ 닫기
          </button>
        )}
      </div>

      {strategyChartTab === 'equity' && (
        isLoading ? (
          <LoadingSpinner color="blue" height="h-[400px]" label="차트 로딩 중..." />
        ) : hasData ? (
          <MultiStrategyEquityChart
            strategies={chartStrategies}
            highlightedStrategyId={highlightedStrategy}
            leverage={leverage}
            onStrategyClick={onStrategyClick}
          />
        ) : <EmptyState />
      )}

      {strategyChartTab === 'sharpe' && (
        isLoading ? (
          <LoadingSpinner color="purple" height="h-[300px]" label="샤프 계산 중..." />
        ) : hasData ? (
          <WeeklySharpeTimeline
            strategies={chartStrategies}
            highlightedStrategyId={highlightedStrategy}
            leverage={leverage}
            onStrategyClick={onStrategyClick}
          />
        ) : <EmptyState />
      )}

      {strategyChartTab === 'avg-sharpe' && (
        isLoading ? (
          <LoadingSpinner color="cyan" height="h-[300px]" label="평균 샤프 계산 중..." />
        ) : hasData ? (
          <AvgSharpeChart
            strategies={chartStrategies}
            highlightedStrategyId={highlightedStrategy}
            onStrategyClick={onStrategyClick}
          />
        ) : <EmptyState />
      )}

      {!strategyChartTab && (
        <div className="p-4 text-center text-zinc-600 text-xs">
          위 탭을 클릭하여 전략 비교 차트를 확인하세요
        </div>
      )}
    </div>
  );
}

function LoadingSpinner({ color, height, label }: { color: string; height: string; label: string }) {
  return (
    <div className="p-4 animate-pulse">
      <div className={`w-full ${height} bg-zinc-800 rounded flex items-center justify-center`}>
        <div className="text-center">
          <div className={`w-10 h-10 border-4 border-${color}-500 border-t-transparent rounded-full animate-spin mx-auto mb-2`} />
          <div className="text-sm text-zinc-400">{label}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return <div className="p-8 text-center text-zinc-500 text-sm">전략 데이터가 없습니다</div>;
}
