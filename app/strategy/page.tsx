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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function StrategyPage() {
  const [healthStatus, setHealthStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [appliedParams, setAppliedParams] = useState<{
    rsiPeriod: number;
    pivotLeftBars: number;
    pivotRightBars: number;
    minDistance: number;
    maxDistance: number;
    takeProfitAtr: number;
    stopLossAtr: number;
    minDivergencePct?: number;
    indicators?: string[];
  } | null>(null);
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

  const handleApplyParams = (params: typeof appliedParams) => {
    setAppliedParams(params);
  };

  const handleSaveSuccess = () => {
    // 저장 성공 시 SavedResultsPanel 새로고침
    savedResultsRef.current?.refresh();
  };

  // 파라미터로 백테스트 실행 및 결과 시각화
  const handleViewResult = async (paramsOverride?: typeof appliedParams) => {
    const params = paramsOverride || appliedParams;
    if (!params) return;

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
        <div>
          <h1 className="text-2xl font-bold">RSI 다이버전스 전략</h1>
          <p className="text-zinc-400 text-sm">파라미터 최적화 및 백테스트</p>
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

      {/* 적용된 파라미터 알림 */}
      {appliedParams && (
        <div className="mb-6 bg-blue-900/30 border border-blue-700 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-blue-400 font-medium">파라미터가 선택되었습니다</span>
              <span className="text-zinc-400 text-sm ml-4">
                RSI: {appliedParams.rsiPeriod} |
                Pivot: {appliedParams.pivotLeftBars}/{appliedParams.pivotRightBars} |
                Dist: {appliedParams.minDistance}-{appliedParams.maxDistance} |
                TP/SL: {appliedParams.takeProfitAtr}/{appliedParams.stopLossAtr}
                {appliedParams.minDivergencePct !== undefined && ` | Div: ${appliedParams.minDivergencePct}%`}
                {appliedParams.indicators && ` | 지표: ${appliedParams.indicators.join(', ').toUpperCase()}`}
              </span>
            </div>
            <button
              onClick={() => handleViewResult()}
              disabled={isLoadingResult}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isLoadingResult ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  로딩 중...
                </>
              ) : (
                '차트 & 거래내역 보기'
              )}
            </button>
          </div>
        </div>
      )}

      {/* 에러 메시지 */}
      {resultError && (
        <div className="mb-6 bg-red-900/30 border border-red-700 p-4 rounded-lg text-red-400">
          {resultError}
        </div>
      )}

      {/* 결과 시각화 (선택된 파라미터로 실행 후) */}
      {backtestResult && (
        <div className="mb-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">백테스트 결과</h2>
            <button
              onClick={() => {
                setBacktestResult(null);
                setCandles([]);
                setSelectedTrade(null);
              }}
              className="text-xs text-zinc-400 hover:text-white"
            >
              결과 닫기 ✕
            </button>
          </div>

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
              <h2 className="text-lg font-semibold text-white mb-2">거래 차트</h2>
              <p className="text-zinc-400 text-sm">캔들 데이터 로딩 중...</p>
            </div>
          )}

          {/* 자산 곡선 */}
          <EquityCurve
            data={backtestResult.equityCurve}
            initialCapital={1000}
          />

          {/* 거래 목록 */}
          <TradeList
            trades={backtestResult.trades}
            onTradeClick={setSelectedTrade}
            selectedTrade={selectedTrade}
          />
        </div>
      )}

      {/* 메인 컨텐츠 - 2열 레이아웃 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 최적화 실행 패널 */}
        <div>
          <OptimizePanel onApplyParams={handleApplyParams} onSaveSuccess={handleSaveSuccess} />
        </div>

        {/* 저장된 결과 패널 */}
        <div>
          <SavedResultsPanel
            ref={savedResultsRef}
            onApplyParams={handleApplyParams}
            onViewResult={(params) => {
              setAppliedParams(params);
              handleViewResult(params);
            }}
          />
        </div>
      </div>
    </div>
  );
}
