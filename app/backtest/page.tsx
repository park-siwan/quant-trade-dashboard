'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CandlestickData } from 'lightweight-charts';
import { runBacktest, checkBacktestHealth, BacktestParams, BacktestResult } from '@/lib/backtest-api';
import BacktestPanel from '@/components/backtest/BacktestPanel';
import BacktestStats from '@/components/backtest/BacktestStats';
import BacktestChart from '@/components/backtest/BacktestChart';
import EquityCurve from '@/components/backtest/EquityCurve';
import TradeList from '@/components/backtest/TradeList';
import { TradeResult } from '@/lib/backtest-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function BacktestPage() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<TradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [lastParams, setLastParams] = useState<BacktestParams | null>(null);
  const [externalParams, setExternalParams] = useState<Partial<BacktestParams> | null>(null);

  // Python 환경 체크
  useEffect(() => {
    checkBacktestHealth().then(setHealthStatus).catch(() => {
      setHealthStatus({ valid: false, message: 'API 연결 실패' });
    });
  }, []);

  // URL 파라미터에서 최적화 결과 읽기
  useEffect(() => {
    const rsi = searchParams.get('rsi');
    const pl = searchParams.get('pl');
    const pr = searchParams.get('pr');
    const mind = searchParams.get('mind');
    const maxd = searchParams.get('maxd');
    const tp = searchParams.get('tp');
    const sl = searchParams.get('sl');

    if (rsi && pl && pr && mind && maxd && tp && sl) {
      setExternalParams({
        rsiPeriod: parseInt(rsi),
        pivotLeftBars: parseInt(pl),
        pivotRightBars: parseInt(pr),
        minDistance: parseInt(mind),
        maxDistance: parseInt(maxd),
        takeProfitAtr: parseFloat(tp),
        stopLossAtr: parseFloat(sl),
      });
    }
  }, [searchParams]);

  const handleRunBacktest = async (params: BacktestParams) => {
    setIsLoading(true);
    setError(null);
    setSelectedTrade(null);
    setLastParams(params);

    try {
      // 백테스트 실행
      const backtestResult = await runBacktest(params);
      setResult(backtestResult);

      // 캔들 데이터 가져오기
      const candleResponse = await fetch(
        `${API_BASE}/exchange/candles?symbol=${encodeURIComponent(params.symbol)}&timeframe=${params.timeframe}&limit=${params.candleCount}`
      );
      const candleData = await candleResponse.json();

      if (candleData.candles) {
        const formattedCandles: CandlestickData[] = candleData.candles.map((c: number[]) => ({
          time: c[0] / 1000,
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
        }));
        setCandles(formattedCandles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '백테스트 실패');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">다이버전스 백테스트</h1>
          <p className="text-zinc-400 text-sm">RSI 다이버전스 전략 성과 분석</p>
        </div>
        <div className="flex items-center gap-4">
          {healthStatus && (
            <div className={`text-sm px-3 py-1 rounded ${healthStatus.valid ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
              {healthStatus.valid ? 'Python Ready' : healthStatus.message}
            </div>
          )}
          <Link
            href="/optimize"
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            파라미터 최적화
          </Link>
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
            ← 대시보드로
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 왼쪽: 설정 패널 */}
        <div className="col-span-4 space-y-4">
          <BacktestPanel
            onRun={handleRunBacktest}
            isLoading={isLoading}
            externalParams={externalParams}
          />

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-4 bg-red-900/50 border border-red-700 text-red-400 p-4 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* 오른쪽: 결과 */}
        <div className="col-span-8 space-y-6">
          {result ? (
            <>
              {/* 통계 */}
              <BacktestStats result={result} />

              {/* 차트 */}
              {candles.length > 0 && (
                <BacktestChart
                  result={result}
                  candles={candles}
                  onTradeClick={setSelectedTrade}
                  selectedTrade={selectedTrade}
                />
              )}

              {/* 자산 곡선 */}
              <EquityCurve
                data={result.equityCurve}
                initialCapital={lastParams?.initialCapital || 10000}
              />

              {/* 거래 목록 */}
              <TradeList
                trades={result.trades}
                onTradeClick={setSelectedTrade}
                selectedTrade={selectedTrade}
              />
            </>
          ) : (
            <div className="bg-zinc-900 p-8 rounded-lg text-center">
              <div className="text-zinc-400 mb-4">
                {isLoading ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <span>백테스트 실행 중...</span>
                  </div>
                ) : (
                  <>
                    <p className="text-lg mb-2">백테스트를 실행해주세요</p>
                    <p className="text-sm">왼쪽 패널에서 파라미터를 설정하고 실행 버튼을 누르세요</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
