import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  SavedOptimizeResult,
  fetchStrategyPreviews,
  StrategyType,
} from '@/lib/backtest-api';

interface UseStrategyListResult {
  strategies: SavedOptimizeResult[];
  isLoading: boolean;
  strategyPreviews: Map<number, {
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
    sharpeRatio: number;
    loading: boolean;
  }>;
  refetch: () => void;
}

export function useStrategyList(
  symbol: string,
  symbolId: string,
  timeframe: string
): UseStrategyListResult {
  const { data: strategies = [], isLoading, refetch } = useQuery({
    queryKey: ['strategy-previews', symbol, symbolId, timeframe],
    queryFn: async () => {
      const previews = await fetchStrategyPreviews(symbol, timeframe, 5000);
      return previews.map((p, idx) => ({
        id: idx + 1,
        strategy: p.strategy as StrategyType,
        symbol,
        timeframe,
        sharpeRatio: p.sharpeRatio,
        totalTrades: p.totalTrades,
        winRate: p.winRate,
        totalPnlPercent: p.totalPnlPercent,
        maxDrawdownPercent: 0,
        profitFactor: 0,
        createdAt: new Date().toISOString(),
        note: p.displayName,
        candleCount: 5000,
        indicators: 'rsi',
        metric: 'sharpe',
        optimizeMethod: 'bayesian',
        pivotLeft: 0,
        pivotRight: 0,
        rsiPeriod: 0,
        minDistance: 0,
        maxDistance: 0,
        tpAtr: 0,
        slAtr: 0,
        minDivPct: 0,
        oosValidation: false,
        maxDrawdown: 0,
        rank: idx + 1,
      } as SavedOptimizeResult));
    },
    staleTime: 30_000,
  });

  const strategyPreviews = useMemo(() => {
    const map = new Map<number, {
      totalTrades: number;
      winRate: number;
      totalPnlPercent: number;
      sharpeRatio: number;
      loading: boolean;
    }>();
    strategies.forEach(s => {
      map.set(s.id, {
        totalTrades: s.totalTrades ?? 0,
        winRate: s.winRate ?? 0,
        totalPnlPercent: s.totalPnlPercent ?? 0,
        sharpeRatio: s.sharpeRatio ?? 0,
        loading: false,
      });
    });
    return map;
  }, [strategies]);

  return { strategies, isLoading, strategyPreviews, refetch };
}
