import { useState, useEffect, useRef } from 'react';
import {
  SavedOptimizeResult,
  fetchStrategyPreviews,
  fetchRollingSharpe,
  RollingSharpeResult,
} from '@/lib/backtest-api';
import { performanceMonitor } from '@/lib/performance-monitor';

interface UseStrategyListResult {
  strategies: SavedOptimizeResult[];
  isLoading: boolean;
  rollingSharpeMap: Map<string, RollingSharpeResult>;
  strategyPreviews: Map<number, {
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
    sharpeRatio: number;
    loading: boolean;
  }>;
  refetch: () => void;
}

/**
 * 전략 목록 관리 Hook
 * - 백엔드에서 전략 프리뷰 가져오기
 * - 참조 안정화로 불필요한 리렌더링 방지
 * - 롤링 Sharpe 데이터 자동 로드
 */
export function useStrategyList(
  symbol: string,
  symbolId: string,
  timeframe: string
): UseStrategyListResult {
  const [strategies, setStrategies] = useState<SavedOptimizeResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rollingSharpeMap, setRollingSharpeMap] = useState<Map<string, RollingSharpeResult>>(new Map());
  const [strategyPreviews, setStrategyPreviews] = useState<Map<number, {
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
    sharpeRatio: number;
    loading: boolean;
  }>>(new Map());

  // 강제 refetch 함수
  const refetchTrigger = useRef(0);
  const refetch = () => {
    refetchTrigger.current += 1;
  };

  useEffect(() => {
    const loadStrategies = async () => {
      const perfEnd = performanceMonitor.start('loadStrategies');

      // 로딩 시작
      setIsLoading(true);

      try {
        // 백엔드에서 모든 전략 프리뷰 가져오기 (JSON 기본값으로 백테스트)
        console.log('[Strategy] Fetching strategy previews from backend...');
        const previews = await performanceMonitor.measureAsync(
          'fetchStrategyPreviews',
          () => fetchStrategyPreviews(symbol, timeframe, 5000)
        );

        if (previews.length === 0) {
          console.log('[Strategy] No previews returned');
          setStrategies([]);
          setIsLoading(false);
          return;
        }

        // StrategyPreview → SavedOptimizeResult 변환 (UI 호환성)
        const convertedResults: SavedOptimizeResult[] = previews.map((p, idx) => ({
          id: idx + 1,
          strategy: p.strategy as 'z_score' | 'vol_breakout' | 'ml_hmm' | 'rsi_div' | 'trend_reversal_combo' | 'hmm_orchestrator',
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
          // 필수 필드 (JSON 기본값 사용)
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
        }));

        // 참조 안정화: API 응답 내용이 동일하면 기존 배열 참조 유지
        setStrategies(prev => {
          if (prev.length === convertedResults.length) {
            const allMatch = convertedResults.every((newS, idx) => {
              const prevS = prev[idx];
              return prevS &&
                     prevS.strategy === newS.strategy &&
                     prevS.sharpeRatio === newS.sharpeRatio &&
                     prevS.totalTrades === newS.totalTrades &&
                     prevS.winRate === newS.winRate &&
                     prevS.totalPnlPercent === newS.totalPnlPercent;
            });
            if (allMatch) {
              console.log('[loadStrategies] Previews unchanged, reusing array');
              return prev;
            }
          }
          console.log('[loadStrategies] Previews changed, creating new array');
          return convertedResults;
        });
        console.log('[Strategy] Loaded', convertedResults.length, 'strategies from backend');

        // 미리보기 맵 업데이트
        const previewMap = new Map<number, { totalTrades: number; winRate: number; totalPnlPercent: number; sharpeRatio: number; loading: boolean }>();
        convertedResults.forEach(s => {
          previewMap.set(s.id, {
            totalTrades: s.totalTrades ?? 0,
            winRate: s.winRate ?? 0,
            totalPnlPercent: s.totalPnlPercent ?? 0,
            sharpeRatio: s.sharpeRatio ?? 0,
            loading: false,
          });
        });
        setStrategyPreviews(previewMap);

        // 롤링 기간별 Sharpe 데이터 로드 (백엔드에서 5분마다 자동 계산)
        fetchRollingSharpe(symbolId, timeframe).then((rollingData) => {
          console.log('[Strategy] Rolling Sharpe response:', rollingData);
          if (rollingData && rollingData.length > 0) {
            const rollingMap = new Map<string, RollingSharpeResult>();
            rollingData.forEach((d) => {
              rollingMap.set(d.strategy, d);
            });
            setRollingSharpeMap(rollingMap);
            console.log('[Strategy] Loaded rolling Sharpe for', rollingData.length, 'strategies');
          } else {
            console.log('[Strategy] No rolling Sharpe data received');
          }
        }).catch((err) => {
          console.error('[Strategy] Failed to load rolling Sharpe:', err);
        });

        setIsLoading(false);
        perfEnd();
      } catch (err) {
        console.error('Failed to load strategies:', err);
        setIsLoading(false);
        perfEnd();
      }
    };

    loadStrategies();
  }, [symbol, symbolId, timeframe, refetchTrigger.current]); // 타임프레임, 심볼 변경 시 재로드

  return {
    strategies,
    isLoading,
    rollingSharpeMap,
    strategyPreviews,
    refetch,
  };
}
