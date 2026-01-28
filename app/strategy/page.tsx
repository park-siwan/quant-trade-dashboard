'use client';

import { useState, useEffect, useRef } from 'react';
import { CandlestickData } from 'lightweight-charts';
import { StrategyLNB, type StrategySubTab } from '@/components/layout';
import RealtimeChart from '@/components/backtest/RealtimeChart';
import OptimizePanel from '@/components/backtest/OptimizePanel';
import DataCachePanel from '@/components/backtest/DataCachePanel';
import SavedResultsPanel, { SavedResultsPanelRef } from '@/components/backtest/SavedResultsPanel';
import BacktestStats from '@/components/backtest/BacktestStats';
import BacktestChart from '@/components/backtest/BacktestChart';
import EquityCurve from '@/components/backtest/EquityCurve';
import TradeList from '@/components/backtest/TradeList';
import { BacktestResult, TradeResult, runBacktest } from '@/lib/backtest-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const STRATEGY_TAB_STORAGE_KEY = 'strategy-sub-tab';

export default function StrategyPage() {
  const [strategySubTab, setStrategySubTab] = useState<StrategySubTab>('realtime');
  const [isTabLoaded, setIsTabLoaded] = useState(false);
  const savedResultsRef = useRef<SavedResultsPanelRef>(null);

  // 결과 조회 상태
  const [isLoadingResult, setIsLoadingResult] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<TradeResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  // localStorage에서 탭 상태 복원
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedStrategyTab = localStorage.getItem(STRATEGY_TAB_STORAGE_KEY) as StrategySubTab | null;
      if (savedStrategyTab && ['realtime', 'results', 'optimize', 'cache'].includes(savedStrategyTab)) {
        setStrategySubTab(savedStrategyTab);
      }
      setIsTabLoaded(true);
    }
  }, []);

  // 탭 변경 시 저장
  useEffect(() => {
    if (isTabLoaded && typeof window !== 'undefined') {
      localStorage.setItem(STRATEGY_TAB_STORAGE_KEY, strategySubTab);
    }
  }, [strategySubTab, isTabLoaded]);

  const handleSaveSuccess = () => {
    savedResultsRef.current?.refresh();
  };

  // 파라미터로 백테스트 실행 및 결과 시각화
  const handleViewResult = async (params: {
    rsiPeriod: number;
    pivotLeftBars: number;
    pivotRightBars: number;
    minDistance: number;
    maxDistance: number;
    takeProfitAtr: number;
    stopLossAtr: number;
    minDivergencePct?: number;
    indicators?: string[];
  }) => {
    setIsLoadingResult(true);
    setResultError(null);
    setSelectedTrade(null);

    try {
      const indicators = params.indicators || ['rsi'];
      const result = await runBacktest({
        symbol: 'BTC/USDT',
        timeframe: '5m',
        candleCount: 5000,
        rsiPeriod: params.rsiPeriod,
        pivotLeftBars: params.pivotLeftBars,
        pivotRightBars: params.pivotRightBars,
        minDistance: params.minDistance,
        maxDistance: params.maxDistance,
        takeProfitAtr: params.takeProfitAtr,
        stopLossAtr: params.stopLossAtr,
        minDivergencePct: params.minDivergencePct,
        initialCapital: 1000,
        positionSizePercent: 100,
        indicators,
      });
      setBacktestResult(result);

      // 캔들 데이터 가져오기
      const candleResponse = await fetch(
        `${API_BASE}/exchange/candles?symbol=${encodeURIComponent('BTC/USDT')}&timeframe=5m&limit=5000`
      );
      const candleData = await candleResponse.json();
      const candlesArray = candleData.data?.candles || candleData.candles;
      if (candlesArray && candlesArray.length > 0) {
        const formattedCandles: CandlestickData[] = candlesArray.map((c: number[]) => ({
          time: c[0] / 1000,
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
        }));
        setCandles(formattedCandles);
      }
    } catch (err) {
      console.error('Backtest error:', err);
      setResultError(err instanceof Error ? err.message : '결과 조회 실패');
    } finally {
      setIsLoadingResult(false);
    }
  };

  return (
    <div className='p-4 md:p-8'>
      {/* LNB */}
      <StrategyLNB activeSubTab={strategySubTab} onSubTabChange={setStrategySubTab} />

        {/* 실시간 */}
        {strategySubTab === 'realtime' && <RealtimeChart />}

        {/* 결과 조회 */}
        {strategySubTab === 'results' && (
          <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
            {/* 좌측 */}
            <div className='space-y-4'>
              <SavedResultsPanel
                ref={savedResultsRef}
                onViewResult={handleViewResult}
                autoSelectFirst={true}
              />
              {backtestResult && (
                <>
                  <EquityCurve data={backtestResult.equityCurve} initialCapital={1000} />
                  <TradeList
                    trades={backtestResult.trades}
                    onTradeClick={setSelectedTrade}
                    selectedTrade={selectedTrade}
                  />
                </>
              )}
            </div>

            {/* 우측 */}
            <div className='space-y-4'>
              {isLoadingResult && (
                <div className='bg-zinc-900 p-4 rounded-lg flex items-center justify-center gap-2'>
                  <div className='animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500'></div>
                  <span className='text-zinc-400'>백테스트 실행 중...</span>
                </div>
              )}
              {resultError && (
                <div className='bg-red-900/30 border border-red-700 p-4 rounded-lg text-red-400'>
                  {resultError}
                </div>
              )}
              {backtestResult ? (
                <>
                  <BacktestStats result={backtestResult} />
                  {candles.length > 0 ? (
                    <BacktestChart
                      result={backtestResult}
                      candles={candles}
                      onTradeClick={setSelectedTrade}
                      selectedTrade={selectedTrade}
                    />
                  ) : (
                    <div className='bg-zinc-900 p-4 rounded-lg'>
                      <p className='text-zinc-400 text-sm'>캔들 데이터 로딩 중...</p>
                    </div>
                  )}
                </>
              ) : (
                <div className='bg-zinc-900 p-8 rounded-lg text-center text-zinc-500'>
                  <p>저장된 결과를 클릭하면 백테스트 결과가 표시됩니다.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 파라미터 최적화 */}
        {strategySubTab === 'optimize' && (
          <div className='max-w-4xl space-y-6'>
            <OptimizePanel onSaveSuccess={handleSaveSuccess} />
          </div>
        )}

      {/* 데이터 캐시 관리 */}
      {strategySubTab === 'cache' && (
        <div className='max-w-4xl'>
          <DataCachePanel />
        </div>
      )}
    </div>
  );
}
