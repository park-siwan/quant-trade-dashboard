'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CandlestickData } from 'lightweight-charts';
import { checkBacktestHealth, BacktestResult, TradeResult, runBacktest } from '@/lib/backtest-api';
import OptimizePanel from '@/components/backtest/OptimizePanel';
import SavedResultsPanel, { SavedResultsPanelRef } from '@/components/backtest/SavedResultsPanel';
import BacktestStats from '@/components/backtest/BacktestStats';
import BacktestChart from '@/components/backtest/BacktestChart';
import EquityCurve from '@/components/backtest/EquityCurve';
import TradeList from '@/components/backtest/TradeList';
import RealtimeChart from '@/components/backtest/RealtimeChart';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type TabType = 'realtime' | 'results' | 'optimize';

export default function StrategyPage() {
  const [activeTab, setActiveTab] = useState<TabType>('realtime');
  const [healthStatus, setHealthStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const savedResultsRef = useRef<SavedResultsPanelRef>(null);

  // 결과 시각화를 위한 상태
  const [isLoadingResult, setIsLoadingResult] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<TradeResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  useEffect(() => {
    checkBacktestHealth().then(setHealthStatus).catch(() => {
      setHealthStatus({ valid: false, message: 'API 연결 실패' });
    });
  }, []);

  const handleSaveSuccess = () => {
    // 저장 성공 시 SavedResultsPanel 새로고침
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
      // 백테스트 실행 - 저장된 결과의 인디케이터를 사용하거나, 없으면 RSI만 사용
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

      // 캔들 데이터 가져오기 (차트용)
      const candleResponse = await fetch(
        `${API_BASE}/exchange/candles?symbol=${encodeURIComponent('BTC/USDT')}&timeframe=5m&limit=5000`
      );
      const candleData = await candleResponse.json();

      // API 응답 구조: { data: { candles: [...] } } 또는 { candles: [...] }
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
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold">RSI 다이버전스 전략</h1>
            <p className="text-zinc-400 text-sm">파라미터 최적화 및 백테스트</p>
          </div>
          {/* 탭 메뉴 */}
          <div className="flex gap-1 bg-zinc-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('realtime')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === 'realtime'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              실시간
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === 'results'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              결과 조회
            </button>
            <button
              onClick={() => setActiveTab('optimize')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === 'optimize'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              파라미터 최적화
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {healthStatus && (
            <div className={`text-sm px-3 py-1 rounded ${healthStatus.valid ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
              {healthStatus.valid ? 'Python Ready' : healthStatus.message}
            </div>
          )}
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
            대시보드로
          </Link>
        </div>
      </div>

      {/* 탭 0: 실시간 */}
      {activeTab === 'realtime' && (
        <div>
          <RealtimeChart />
        </div>
      )}

      {/* 탭 1: 결과 조회 */}
      {activeTab === 'results' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* 좌측: 저장된 결과 목록 + 자산곡선 + 거래목록 */}
          <div className="space-y-4">
            <SavedResultsPanel
              ref={savedResultsRef}
              onViewResult={handleViewResult}
              autoSelectFirst={true}
            />

            {/* 자산 곡선 & 거래 목록 */}
            {backtestResult && (
              <>
                <EquityCurve
                  data={backtestResult.equityCurve}
                  initialCapital={1000}
                />
                <TradeList
                  trades={backtestResult.trades}
                  onTradeClick={setSelectedTrade}
                  selectedTrade={selectedTrade}
                />
              </>
            )}
          </div>

          {/* 우측: 백테스트 결과 (통계 + 차트) */}
          <div className="space-y-4">
            {/* 로딩 상태 */}
            {isLoadingResult && (
              <div className="bg-zinc-900 p-4 rounded-lg flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                <span className="text-zinc-400">백테스트 실행 중...</span>
              </div>
            )}

            {/* 에러 메시지 */}
            {resultError && (
              <div className="bg-red-900/30 border border-red-700 p-4 rounded-lg text-red-400">
                {resultError}
              </div>
            )}

            {/* 백테스트 결과 */}
            {backtestResult ? (
              <>
                {/* 통계 */}
                <BacktestStats result={backtestResult} />

                {/* 차트 */}
                {candles.length > 0 ? (
                  <BacktestChart
                    result={backtestResult}
                    candles={candles}
                    onTradeClick={setSelectedTrade}
                    selectedTrade={selectedTrade}
                  />
                ) : (
                  <div className="bg-zinc-900 p-4 rounded-lg">
                    <p className="text-zinc-400 text-sm">캔들 데이터 로딩 중...</p>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-zinc-900 p-8 rounded-lg text-center text-zinc-500">
                <p>저장된 결과를 클릭하면 백테스트 결과가 표시됩니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 탭 2: 파라미터 최적화 */}
      {activeTab === 'optimize' && (
        <div className="max-w-4xl">
          <OptimizePanel onSaveSuccess={handleSaveSuccess} />
        </div>
      )}
    </div>
  );
}
