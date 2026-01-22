'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { checkBacktestHealth } from '@/lib/backtest-api';
import OptimizePanel from '@/components/backtest/OptimizePanel';
import SavedResultsPanel from '@/components/backtest/SavedResultsPanel';

export default function OptimizePage() {
  const [healthStatus, setHealthStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [appliedParams, setAppliedParams] = useState<{
    rsiPeriod: number;
    pivotLeftBars: number;
    pivotRightBars: number;
    minDistance: number;
    maxDistance: number;
    takeProfitAtr: number;
    stopLossAtr: number;
  } | null>(null);

  useEffect(() => {
    checkBacktestHealth().then(setHealthStatus).catch(() => {
      setHealthStatus({ valid: false, message: 'API 연결 실패' });
    });
  }, []);

  const handleApplyParams = (params: typeof appliedParams) => {
    setAppliedParams(params);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">파라미터 최적화</h1>
          <p className="text-zinc-400 text-sm">RSI 다이버전스 전략 파라미터 최적화</p>
        </div>
        <div className="flex items-center gap-4">
          {healthStatus && (
            <div className={`text-sm px-3 py-1 rounded ${healthStatus.valid ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
              {healthStatus.valid ? 'Python Ready' : healthStatus.message}
            </div>
          )}
          <Link
            href="/backtest"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            ← 백테스트로
          </Link>
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
              </span>
            </div>
            <Link
              href={`/backtest?rsi=${appliedParams.rsiPeriod}&pl=${appliedParams.pivotLeftBars}&pr=${appliedParams.pivotRightBars}&mind=${appliedParams.minDistance}&maxd=${appliedParams.maxDistance}&tp=${appliedParams.takeProfitAtr}&sl=${appliedParams.stopLossAtr}`}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              백테스트 실행하기 →
            </Link>
          </div>
        </div>
      )}

      {/* 메인 컨텐츠 - 2열 레이아웃 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 최적화 실행 패널 */}
        <div>
          <OptimizePanel onApplyParams={handleApplyParams} />
        </div>

        {/* 저장된 결과 패널 */}
        <div>
          <SavedResultsPanel onApplyParams={handleApplyParams} />
        </div>
      </div>
    </div>
  );
}
