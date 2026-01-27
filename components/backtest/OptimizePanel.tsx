'use client';

import { useState } from 'react';
import {
  OptimizeParams,
  OptimizeResult,
  OptimizeResultItem,
  OptimizeProgress,
  runOptimizationWithProgress,
  runBayesianOptimization,
  BayesianOptimizeParams,
  saveOptimizeResult,
  saveMultipleOptimizeResults,
} from '@/lib/backtest-api';

interface OptimizePanelProps {
  onSaveSuccess?: () => void;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}분 ${secs}초`;
}

type OptimizeMethod = 'grid' | 'bayesian';

export default function OptimizePanel({ onSaveSuccess }: OptimizePanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [optimizeMethod, setOptimizeMethod] = useState<OptimizeMethod>('bayesian');
  const [nTrials, setNTrials] = useState(500);  // 기본값 500으로 증가
  const [usePriorResults, setUsePriorResults] = useState(true);
  // 파라미터 범위 설정 (2025 BTC 1h 최적화 결과 기반)
  const [pivotLeftRange, setPivotLeftRange] = useState<number[]>([7, 9]);
  const [pivotRightRange, setPivotRightRange] = useState<number[]>([4, 5]);
  const [rsiPeriodRange, setRsiPeriodRange] = useState<number[]>([14, 21]);
  const [minDistanceRange, setMinDistanceRange] = useState<number[]>([5, 10]);
  const [maxDistanceRange, setMaxDistanceRange] = useState<number[]>([150, 200]);
  const [tpAtrRange, setTpAtrRange] = useState<number[]>([1.5, 2.0]);
  const [slAtrRange, setSlAtrRange] = useState<number[]>([1.5]);
  const [minDivPctRange, setMinDivPctRange] = useState<number[]>([30]);
  // 추가 필터 설정 (고정 사용)
  const [useTrendFilter, setUseTrendFilter] = useState(true);   // EMA 트렌드 필터 (기본 ON - 1h 최적)
  const [trendEmaPeriod, setTrendEmaPeriod] = useState(100);    // EMA 100 (최적값)
  const [useVolatilityFilter, setUseVolatilityFilter] = useState(true);  // ATR 변동성 필터 (기본 ON)
  const [useRsiExtremeFilter, setUseRsiExtremeFilter] = useState(false);  // RSI 극단값 필터
  const [rsiOversold, setRsiOversold] = useState(30);  // RSI 과매도
  const [rsiOverbought, setRsiOverbought] = useState(70);  // RSI 과매수
  // 필터/지표 파라미터 탐색 모드 (Optuna가 최적 조합 탐색)
  const [searchFilters, setSearchFilters] = useState(false);  // 필터 조합 탐색
  const [searchIndicators, setSearchIndicators] = useState(false);  // 지표 조합 탐색
  const [minTrades, setMinTrades] = useState(30);  // 최소 거래 수 (테스트 기준)
  // Out-of-Sample 검증
  const [useOosValidation, setUseOosValidation] = useState(false);
  const [oosRatio, setOosRatio] = useState(30);  // 검증 데이터 비율 (%)
  // 날짜 기반 데이터 범위
  const currentYear = new Date().getFullYear();
  const [dataYear, setDataYear] = useState(2025);
  const [dateRangeType, setDateRangeType] = useState<'year' | 'quarter' | 'custom'>('year');
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [customStartDate, setCustomStartDate] = useState('2025-01-01');
  const [customEndDate, setCustomEndDate] = useState('2025-12-31');

  // 날짜 범위 계산
  const getDateRange = () => {
    if (dateRangeType === 'year') {
      return { startDate: `${dataYear}-01-01`, endDate: `${dataYear}-12-31` };
    } else if (dateRangeType === 'quarter') {
      const qStart = { 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' };
      const qEnd = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
      return { startDate: `${dataYear}-${qStart[quarter]}`, endDate: `${dataYear}-${qEnd[quarter]}` };
    } else {
      return { startDate: customStartDate, endDate: customEndDate };
    }
  };

  const [params, setParams] = useState<OptimizeParams>({
    symbol: 'BTC/USDT',
    timeframe: '1h',  // 1시간봉 기본
    indicators: ['rsi', 'obv', 'cvd', 'oi'],
    initialCapital: 1000,
    positionSizePercent: 100,
    metric: 'sharpe',
    topResults: 10,
  });

  const handleOptimize = async () => {
    setIsLoading(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      let optimizeResult: OptimizeResult;

      const rangeParams = {
        pivotLeftRange,
        pivotRightRange,
        rsiPeriodRange,
        minDistanceRange,
        maxDistanceRange,
        tpAtrRange,
        slAtrRange,
        minDivPctRange,
      };

      const filterParams = {
        useTrendFilter,
        trendEmaPeriod,
        useVolatilityFilter,
        useRsiExtremeFilter,
        rsiOversold,
        rsiOverbought,
        // 필터/지표 파라미터 탐색 모드
        searchFilters,
        searchIndicators,
        minTrades,
        // OOS 검증
        useOosValidation,
        oosRatio,
      };

      // 날짜 범위 추가
      const dateRange = getDateRange();
      const paramsWithDate = {
        ...params,
        ...dateRange,
        year: dataYear,
      };

      if (optimizeMethod === 'bayesian') {
        const bayesianParams: BayesianOptimizeParams = {
          ...paramsWithDate,
          nTrials,
          usePriorResults,
          ...rangeParams,
          ...filterParams,
        };
        optimizeResult = await runBayesianOptimization(bayesianParams, (prog) => {
          setProgress(prog);
        });
      } else {
        // 그리드 서치에도 파라미터 범위 전달
        optimizeResult = await runOptimizationWithProgress(
          { ...paramsWithDate, ...rangeParams, ...filterParams },
          (prog) => {
            setProgress(prog);
          },
        );
      }

      setResult(optimizeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleSaveOne = async (item: OptimizeResultItem, rank: number) => {
    setIsSaving(true);
    setSaveMessage(null);
    const dateRange = getDateRange();
    try {
      await saveOptimizeResult({
        symbol: params.symbol,
        timeframe: params.timeframe,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        indicators: params.indicators || [],
        metric: params.metric || 'sharpe',
        optimizeMethod,
        params: item.params,
        result: item.result,
        rank: rank,
      });
      setSaveMessage(`#${rank} 결과가 저장되었습니다.`);
      onSaveSuccess?.();
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage('저장 실패: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!result) return;
    setIsSaving(true);
    setSaveMessage(null);
    const dateRange = getDateRange();
    try {
      await saveMultipleOptimizeResults({
        symbol: params.symbol,
        timeframe: params.timeframe,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        indicators: params.indicators || [],
        metric: params.metric || 'sharpe',
        optimizeMethod,
        results: result.topResults,
      });
      setSaveMessage(`${result.topResults.length}개 결과가 모두 저장되었습니다.`);
      onSaveSuccess?.();
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage('저장 실패: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">파라미터 최적화</h2>
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
        >
          <span>{showGuide ? '가이드 숨기기' : '효율적인 사용법'}</span>
          <svg className={`w-4 h-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 효율적인 최적화 가이드 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-purple-300 mb-3">효율적인 파라미터 최적화 3단계</h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">1</div>
              <div>
                <div className="text-sm text-white font-medium">베이지안으로 빠르게 탐색</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  100회 시도로 유망한 파라미터 영역을 빠르게 파악 (1-2분)
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">2</div>
              <div>
                <div className="text-sm text-white font-medium">좋은 결과 저장</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  상위 결과 중 유망한 파라미터를 저장 → 다음 베이지안 실행 시 시작점으로 활용
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">3</div>
              <div>
                <div className="text-sm text-white font-medium">그리드 서치로 정밀 탐색 (선택)</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  모든 파라미터 조합을 완전히 테스트 → 놓친 최적해 없이 확인 (10-30분)
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-purple-700/30 text-xs text-zinc-500">
            <span className="text-purple-400">TIP:</span> 베이지안은 ~11,000개 조합 중 100개만 테스트해도 좋은 결과를 찾습니다. 저장된 결과를 활용하면 더 빠르게 수렴합니다.
          </div>
        </div>
      )}

      {/* 설정 */}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">타임프레임</label>
          <select
            value={params.timeframe}
            onChange={e => setParams(p => ({ ...p, timeframe: e.target.value }))}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
          >
            <option value="5m">5분</option>
            <option value="15m">15분</option>
            <option value="1h">1시간</option>
            <option value="4h">4시간</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">최적화 기준</label>
          <select
            value={params.metric}
            onChange={e => setParams(p => ({ ...p, metric: e.target.value as OptimizeParams['metric'] }))}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
          >
            <option value="sharpe">Sharpe Ratio</option>
            <option value="profit">총 수익률</option>
            <option value="winrate">승률</option>
            <option value="profitfactor">Profit Factor</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">상위 결과</label>
          <input
            type="number"
            value={params.topResults}
            onChange={e => setParams(p => ({ ...p, topResults: parseInt(e.target.value) }))}
            min={5}
            max={20}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
          />
        </div>
      </div>

      {/* 데이터 기간 설정 */}
      <div className="bg-zinc-800/50 p-3 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-300 font-medium">데이터 기간</span>
          <div className="flex gap-1">
            {(['year', 'quarter', 'custom'] as const).map(type => (
              <button
                key={type}
                onClick={() => setDateRangeType(type)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  dateRangeType === type ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                }`}
              >
                {type === 'year' ? '연도' : type === 'quarter' ? '분기' : '직접'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 items-end">
          {/* 연도 선택 */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">연도</label>
            <select
              value={dataYear}
              onChange={e => setDataYear(parseInt(e.target.value))}
              className="bg-zinc-700 text-white text-sm px-3 py-2 rounded border border-zinc-600"
            >
              {[currentYear - 1, currentYear].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* 분기 선택 (분기 모드일 때) */}
          {dateRangeType === 'quarter' && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">분기</label>
              <select
                value={quarter}
                onChange={e => setQuarter(parseInt(e.target.value) as 1 | 2 | 3 | 4)}
                className="bg-zinc-700 text-white text-sm px-3 py-2 rounded border border-zinc-600"
              >
                <option value={1}>Q1 (1-3월)</option>
                <option value={2}>Q2 (4-6월)</option>
                <option value={3}>Q3 (7-9월)</option>
                <option value={4}>Q4 (10-12월)</option>
              </select>
            </div>
          )}

          {/* 직접 입력 (커스텀 모드일 때) */}
          {dateRangeType === 'custom' && (
            <>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">시작일</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="bg-zinc-700 text-white text-sm px-3 py-2 rounded border border-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">종료일</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="bg-zinc-700 text-white text-sm px-3 py-2 rounded border border-zinc-600"
                />
              </div>
            </>
          )}

          {/* 선택된 기간 표시 */}
          <div className="flex-1 text-right">
            <span className="text-xs text-zinc-500">선택 기간: </span>
            <span className="text-sm text-green-400 font-mono">
              {getDateRange().startDate} ~ {getDateRange().endDate}
            </span>
          </div>
        </div>

        {/* 학습/검증 분리 팁 */}
        {dateRangeType === 'quarter' && (
          <p className="text-xs text-zinc-500">
            <span className="text-yellow-400">TIP:</span> Q1-Q3로 학습 → Q4로 검증하면 과적합 방지에 효과적
          </p>
        )}
      </div>

      {/* 지표 선택 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-zinc-400">지표 프리셋:</span>
          <button
            onClick={() => setParams(p => ({ ...p, indicators: ['rsi'] }))}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              params.indicators?.length === 1 && params.indicators[0] === 'rsi'
                ? 'bg-orange-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            RSI만
          </button>
          <button
            onClick={() => setParams(p => ({ ...p, indicators: ['rsi', 'cvd'] }))}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              params.indicators?.length === 2 && params.indicators.includes('rsi') && params.indicators.includes('cvd')
                ? 'bg-cyan-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            RSI+CVD
          </button>
          <button
            onClick={() => setParams(p => ({ ...p, indicators: ['rsi', 'obv'] }))}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              params.indicators?.length === 2 && params.indicators.includes('rsi') && params.indicators.includes('obv')
                ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            RSI+OBV
          </button>
          <button
            onClick={() => setParams(p => ({ ...p, indicators: ['rsi', 'cvd', 'oi'] }))}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              params.indicators?.length === 3 && params.indicators.includes('rsi') && params.indicators.includes('cvd') && params.indicators.includes('oi')
                ? 'bg-yellow-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            RSI+CVD+OI
          </button>
          <button
            onClick={() => setParams(p => ({ ...p, indicators: ['rsi', 'cvd', 'obv'] }))}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              params.indicators?.length === 3 && params.indicators.includes('rsi') && params.indicators.includes('cvd') && params.indicators.includes('obv')
                ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            RSI+CVD+OBV
          </button>
          <button
            onClick={() => setParams(p => ({ ...p, indicators: ['rsi', 'obv', 'cvd', 'oi'] }))}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              params.indicators?.length === 4
                ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            전체 (4개)
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {['rsi', 'obv', 'cvd', 'oi'].map(indicator => (
            <label key={indicator} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={params.indicators?.includes(indicator) || false}
                onChange={e => {
                  const current = params.indicators || [];
                  if (e.target.checked) {
                    setParams(p => ({ ...p, indicators: [...current, indicator] }));
                  } else {
                    setParams(p => ({ ...p, indicators: current.filter(i => i !== indicator) }));
                  }
                }}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-zinc-300 uppercase">{indicator}</span>
              {indicator === 'oi' && (
                <span className="text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">최근 30일</span>
              )}
            </label>
          ))}
        </div>
        {params.indicators?.includes('oi') && (
          <p className="text-xs text-yellow-400/80">
            ⚠️ OI(미결제약정)는 Binance API 제한으로 최근 30일 데이터만 사용 가능합니다.
          </p>
        )}
      </div>

      {/* 최적화 방식 선택 */}
      <div className="border-t border-zinc-700 pt-4">
        <label className="block text-xs text-zinc-400 mb-2">최적화 방식</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="optimizeMethod"
              checked={optimizeMethod === 'bayesian'}
              onChange={() => setOptimizeMethod('bayesian')}
              className="w-4 h-4 accent-purple-500"
            />
            <span className="text-sm text-zinc-300">베이지안 (Optuna)</span>
            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded">권장</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="optimizeMethod"
              checked={optimizeMethod === 'grid'}
              onChange={() => setOptimizeMethod('grid')}
              className="w-4 h-4 accent-purple-500"
            />
            <span className="text-sm text-zinc-300">그리드 서치</span>
          </label>
        </div>

        {/* 베이지안 전용 옵션 */}
        {optimizeMethod === 'bayesian' && (
          <div className="mt-3 grid grid-cols-2 gap-4 bg-zinc-800/50 p-3 rounded-lg">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">시도 횟수 (Trials)</label>
              <input
                type="number"
                value={nTrials}
                onChange={e => setNTrials(parseInt(e.target.value) || 100)}
                min={50}
                max={500}
                className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
              />
              <span className={`text-xs ${nTrials < 50 ? 'text-red-400' : nTrials < 100 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                {nTrials < 50 ? '50회 이상 권장 (학습 부족)' : nTrials < 100 ? '100회 이상 권장' : '50~500, 100회 이상 권장'}
              </span>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer mt-5">
                <input
                  type="checkbox"
                  checked={usePriorResults}
                  onChange={e => setUsePriorResults(e.target.checked)}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-sm text-zinc-300">저장된 결과 활용</span>
              </label>
              <span className="text-xs text-zinc-500 block mt-1">이전 최적화 결과를 초기값으로 사용</span>
            </div>
          </div>
        )}
      </div>

      {/* 파라미터 범위 설정 (공통 - 베이지안/그리드 모두 적용) */}
      <div className="border-t border-zinc-700 pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-300 font-medium">파라미터 탐색 범위</span>
          <span className="text-xs text-zinc-500">(선택된 값들의 조합을 탐색)</span>
        </div>

        {/* 피봇 설정 */}
        <div className="bg-zinc-800/50 p-3 rounded-lg">
          <div className="text-xs text-zinc-400 mb-2 font-medium">피봇 설정 (다이버전스 감지)</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Pivot Left (좌측 캔들)</label>
              <div className="flex flex-wrap gap-1">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (pivotLeftRange.includes(val)) {
                        if (pivotLeftRange.length > 1) setPivotLeftRange(pivotLeftRange.filter(v => v !== val));
                      } else {
                        setPivotLeftRange([...pivotLeftRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      pivotLeftRange.includes(val) ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Pivot Right (확정 캔들)</label>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (pivotRightRange.includes(val)) {
                        if (pivotRightRange.length > 1) setPivotRightRange(pivotRightRange.filter(v => v !== val));
                      } else {
                        setPivotRightRange([...pivotRightRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      pivotRightRange.includes(val) ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RSI & 거리 설정 */}
        <div className="bg-zinc-800/50 p-3 rounded-lg">
          <div className="text-xs text-zinc-400 mb-2 font-medium">RSI & 피봇 거리</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">RSI Period</label>
              <div className="flex flex-wrap gap-1">
                {[7, 10, 14, 21, 28].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (rsiPeriodRange.includes(val)) {
                        if (rsiPeriodRange.length > 1) setRsiPeriodRange(rsiPeriodRange.filter(v => v !== val));
                      } else {
                        setRsiPeriodRange([...rsiPeriodRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      rsiPeriodRange.includes(val) ? 'bg-orange-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Min Distance (최소 피봇 간격)</label>
              <div className="flex flex-wrap gap-1">
                {[3, 5, 10, 15, 20].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (minDistanceRange.includes(val)) {
                        if (minDistanceRange.length > 1) setMinDistanceRange(minDistanceRange.filter(v => v !== val));
                      } else {
                        setMinDistanceRange([...minDistanceRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      minDistanceRange.includes(val) ? 'bg-teal-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Max Distance (최대 피봇 간격)</label>
              <div className="flex flex-wrap gap-1">
                {[50, 100, 150, 200, 300].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (maxDistanceRange.includes(val)) {
                        if (maxDistanceRange.length > 1) setMaxDistanceRange(maxDistanceRange.filter(v => v !== val));
                      } else {
                        setMaxDistanceRange([...maxDistanceRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      maxDistanceRange.includes(val) ? 'bg-teal-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TP/SL & 강도 설정 */}
        <div className="bg-zinc-800/50 p-3 rounded-lg">
          <div className="text-xs text-zinc-400 mb-2 font-medium">TP/SL ATR 배율 & 다이버전스 강도</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">TP ATR (익절 배율)</label>
              <div className="flex flex-wrap gap-1">
                {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (tpAtrRange.includes(val)) {
                        if (tpAtrRange.length > 1) setTpAtrRange(tpAtrRange.filter(v => v !== val));
                      } else {
                        setTpAtrRange([...tpAtrRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      tpAtrRange.includes(val) ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">SL ATR (손절 배율)</label>
              <div className="flex flex-wrap gap-1">
                {[0.5, 0.75, 1.0, 1.5, 2.0].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (slAtrRange.includes(val)) {
                        if (slAtrRange.length > 1) setSlAtrRange(slAtrRange.filter(v => v !== val));
                      } else {
                        setSlAtrRange([...slAtrRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      slAtrRange.includes(val) ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Min Div % (최소 강도)</label>
              <div className="flex flex-wrap gap-1">
                {[5, 10, 20, 30, 40, 50].map(val => (
                  <button
                    key={val}
                    onClick={() => {
                      if (minDivPctRange.includes(val)) {
                        if (minDivPctRange.length > 1) setMinDivPctRange(minDivPctRange.filter(v => v !== val));
                      } else {
                        setMinDivPctRange([...minDivPctRange, val].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      minDivPctRange.includes(val) ? 'bg-yellow-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 추가 필터 설정 */}
      <div className="border-t border-zinc-700 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-300 font-medium">추가 필터</span>
          <span className="text-xs text-zinc-500">(진입 조건 강화)</span>
        </div>

        <div className="bg-zinc-800/50 p-3 rounded-lg space-y-3">
          {/* 트렌드 필터 */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTrendFilter}
                onChange={e => setUseTrendFilter(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-zinc-300">트렌드 필터 (EMA)</span>
            </label>
            {useTrendFilter && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">EMA</span>
                <select
                  value={trendEmaPeriod}
                  onChange={e => setTrendEmaPeriod(parseInt(e.target.value))}
                  className="bg-zinc-700 text-white text-xs px-2 py-1 rounded border border-zinc-600"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            )}
          </div>
          {useTrendFilter && (
            <p className="text-xs text-zinc-500 ml-6">
              Long: 가격 &gt; EMA{trendEmaPeriod} | Short: 가격 &lt; EMA{trendEmaPeriod}
            </p>
          )}

          {/* 변동성 필터 */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useVolatilityFilter}
                onChange={e => setUseVolatilityFilter(e.target.checked)}
                className="w-4 h-4 accent-yellow-500"
              />
              <span className="text-sm text-zinc-300">변동성 필터 (ATR)</span>
            </label>
          </div>
          {useVolatilityFilter && (
            <p className="text-xs text-zinc-500 ml-6">
              ATR이 20일 평균 이상일 때만 진입 (저변동성 구간 회피)
            </p>
          )}

          {/* RSI 극단값 필터 */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useRsiExtremeFilter}
                onChange={e => setUseRsiExtremeFilter(e.target.checked)}
                className="w-4 h-4 accent-orange-500"
              />
              <span className="text-sm text-zinc-300">RSI 극단값 필터</span>
            </label>
            {useRsiExtremeFilter && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">&lt;</span>
                <input
                  type="number"
                  value={rsiOversold}
                  onChange={e => setRsiOversold(parseInt(e.target.value))}
                  className="w-12 bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-600 text-center"
                />
                <span className="text-zinc-500">또는 &gt;</span>
                <input
                  type="number"
                  value={rsiOverbought}
                  onChange={e => setRsiOverbought(parseInt(e.target.value))}
                  className="w-12 bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-600 text-center"
                />
              </div>
            )}
          </div>
          {useRsiExtremeFilter && (
            <p className="text-xs text-zinc-500 ml-6">
              Long: RSI &lt; {rsiOversold} | Short: RSI &gt; {rsiOverbought}
            </p>
          )}

          {/* 파라미터 탐색 모드 (Bayesian & Grid 공통) */}
          <div className="border-t border-zinc-700/50 pt-3 mt-3">
            <div className="text-sm font-medium text-purple-400 mb-2">필터/지표 조합 탐색</div>
            <p className="text-xs text-zinc-500 mb-2">
              {optimizeMethod === 'bayesian'
                ? 'Optuna가 최적 조합을 자동 탐색합니다'
                : '모든 필터/지표 조합을 전수 탐색합니다'}
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={searchFilters}
                  onChange={e => setSearchFilters(e.target.checked)}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-sm text-zinc-300">필터 조합 탐색</span>
                <span className="text-xs text-zinc-500">(트렌드/변동성/RSI 극단값)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={searchIndicators}
                  onChange={e => setSearchIndicators(e.target.checked)}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-sm text-zinc-300">지표 조합 탐색</span>
                <span className="text-xs text-zinc-500">(RSI/OBV/CVD/OI 조합)</span>
              </label>
            </div>
            {(searchFilters || searchIndicators) && (
              <p className="text-xs text-yellow-500/80 mt-2 ml-6">
                {optimizeMethod === 'bayesian'
                  ? '탐색 공간이 확장됩니다. Trials를 500+ 권장'
                  : '탐색 조합 수가 크게 증가합니다 (필터: x8, 지표: x15)'}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-zinc-500">최소 거래 수</span>
              <select
                value={minTrades}
                onChange={e => setMinTrades(parseInt(e.target.value))}
                className="bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-600 text-xs"
              >
                <option value={10}>10</option>
                <option value={30}>30</option>
                <option value={50}>50 (권장)</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* OOS 검증 */}
          <div className="border-t border-zinc-700/50 pt-3 mt-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useOosValidation}
                  onChange={e => setUseOosValidation(e.target.checked)}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-sm text-zinc-300">Out-of-Sample 검증</span>
              </label>
              {useOosValidation && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-500">검증 비율</span>
                  <select
                    value={oosRatio}
                    onChange={e => setOosRatio(parseInt(e.target.value))}
                    className="bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-600"
                  >
                    <option value={20}>20%</option>
                    <option value={30}>30%</option>
                    <option value={40}>40%</option>
                  </select>
                </div>
              )}
            </div>
            {useOosValidation && (
              <p className="text-xs text-zinc-500 ml-6 mt-1">
                {100 - oosRatio}% 데이터로 최적화 → {oosRatio}% 데이터로 검증 (과적합 방지)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 현재 선택된 설정 요약 */}
      <div className="bg-zinc-800/70 border border-zinc-700 p-3 rounded-lg">
        <div className="text-xs text-zinc-400 mb-2 font-medium">현재 설정 요약</div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-x-3 gap-y-1 text-xs">
          <div><span className="text-zinc-500">PvL:</span> <span className="text-purple-400">{pivotLeftRange.length}</span></div>
          <div><span className="text-zinc-500">PvR:</span> <span className="text-blue-400">{pivotRightRange.length}</span></div>
          <div><span className="text-zinc-500">RSI:</span> <span className="text-orange-400">{rsiPeriodRange.length}</span></div>
          <div><span className="text-zinc-500">MinD:</span> <span className="text-teal-400">{minDistanceRange.length}</span></div>
          <div><span className="text-zinc-500">MaxD:</span> <span className="text-teal-400">{maxDistanceRange.length}</span></div>
          <div><span className="text-zinc-500">TP:</span> <span className="text-green-400">{tpAtrRange.length}</span></div>
          <div><span className="text-zinc-500">SL:</span> <span className="text-red-400">{slAtrRange.length}</span></div>
          <div><span className="text-zinc-500">Div:</span> <span className="text-yellow-400">{minDivPctRange.length}</span></div>
        </div>
        <div className="mt-2 pt-2 border-t border-zinc-700 flex justify-between items-center text-xs">
          <div className="text-zinc-400">
            <span className="text-zinc-500">TF:</span> <span className="text-white">{params.timeframe}</span>
            <span className="mx-2">|</span>
            <span className="text-zinc-500">기간:</span> <span className="text-white">{getDateRange().startDate} ~ {getDateRange().endDate}</span>
            <span className="mx-2">|</span>
            <span className="text-zinc-500">방식:</span> <span className="text-yellow-400">{optimizeMethod === 'bayesian' ? 'Bay' : 'Grid'}</span>
          </div>
          <div className="text-zinc-300 font-medium">
            총 조합: {(
              rsiPeriodRange.length *
              pivotLeftRange.length *
              pivotRightRange.length *
              minDistanceRange.length *
              maxDistanceRange.length *
              tpAtrRange.length *
              slAtrRange.length *
              minDivPctRange.length
            ).toLocaleString()}개
            {optimizeMethod === 'bayesian' && <span className="text-purple-400"> → {nTrials}회</span>}
          </div>
        </div>
      </div>

      {/* 실행 버튼 */}
      <button
        onClick={handleOptimize}
        disabled={isLoading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-600 text-white font-medium py-3 rounded-lg transition-colors"
      >
        {isLoading
          ? (optimizeMethod === 'bayesian' ? '베이지안 최적화 실행 중...' : '그리드 서치 실행 중...')
          : (optimizeMethod === 'bayesian' ? `베이지안 최적화 (${nTrials}회)` : '그리드 서치 실행')
        }
      </button>

      {/* 진행 상황 */}
      {isLoading && progress && (
        <div className="bg-zinc-800 p-4 rounded-lg space-y-3">
          {progress.type === 'status' && (
            <div className="text-zinc-300 text-sm">{progress.message}</div>
          )}

          {progress.type === 'progress' && (
            <>
              {/* 진행바 */}
              <div className="relative h-4 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress.percent || 0}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium">
                  {progress.current} / {progress.total} ({progress.percent}%)
                </div>
              </div>

              {/* 시간 정보 */}
              <div className="flex justify-between text-xs text-zinc-400">
                <span>경과: {formatTime(progress.elapsed || 0)}</span>
                <span>예상 남은 시간: {formatTime(progress.remaining || 0)}</span>
              </div>

              {/* 현재까지 최고 성과 */}
              {progress.best && (
                <div className="border-t border-zinc-700 pt-3 mt-3">
                  <div className="text-xs text-zinc-400 mb-2">현재까지 최고 성과:</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-zinc-500">수익률:</span>{' '}
                      <span className={progress.best.result.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {progress.best.result.totalPnlPercent >= 0 ? '+' : ''}{progress.best.result.totalPnlPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">승률:</span>{' '}
                      <span className="text-white">{progress.best.result.winRate.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Sharpe:</span>{' '}
                      <span className="text-white">{progress.best.result.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {/* 결과 */}
      {result && (
        <div className="mt-4">
          {/* 사용된 파라미터 범위 표시 */}
          <div className="bg-zinc-800/50 p-3 rounded-lg mb-3">
            <div className="text-xs text-zinc-400 mb-2 font-medium">탐색 파라미터 범위</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-zinc-500">Pivot Left:</span>{' '}
                <span className="text-purple-400">[{pivotLeftRange.join(', ')}]</span>
              </div>
              <div>
                <span className="text-zinc-500">Pivot Right:</span>{' '}
                <span className="text-blue-400">[{pivotRightRange.join(', ')}]</span>
              </div>
              <div>
                <span className="text-zinc-500">타임프레임:</span>{' '}
                <span className="text-white">{params.timeframe}</span>
              </div>
              <div>
                <span className="text-zinc-500">기간:</span>{' '}
                <span className="text-green-400">{getDateRange().startDate} ~ {getDateRange().endDate}</span>
              </div>
              <div>
                <span className="text-zinc-500">방식:</span>{' '}
                <span className="text-yellow-400">{optimizeMethod === 'bayesian' ? `베이지안 (${nTrials}회)` : '그리드 서치'}</span>
              </div>
              <div>
                <span className="text-zinc-500">지표:</span>{' '}
                <span className="text-cyan-400">{(params.indicators || []).join(', ').toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-zinc-400">
              총 {result.totalCombinations}개 조합 중 {result.validResults}개 유효 (기준: {result.metric})
            </div>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white px-3 py-1.5 rounded"
            >
              {isSaving ? '저장 중...' : '전체 저장'}
            </button>
          </div>

          {saveMessage && (
            <div className={`text-sm mb-2 ${saveMessage.includes('실패') ? 'text-red-400' : 'text-green-400'}`}>
              {saveMessage}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700 text-xs">
                  <th className="text-left py-2 px-1 w-6">#</th>
                  <th className="text-center py-2 px-1">RSI</th>
                  <th className="text-center py-2 px-1">PvL</th>
                  <th className="text-center py-2 px-1">PvR</th>
                  <th className="text-center py-2 px-1">Min</th>
                  <th className="text-center py-2 px-1">Max</th>
                  <th className="text-center py-2 px-1">TP</th>
                  <th className="text-center py-2 px-1">SL</th>
                  <th className="text-center py-2 px-1" title="최소 다이버전스 강도">Div</th>
                  {(searchFilters || searchIndicators) && (
                    <>
                      {searchFilters && <th className="text-center py-2 px-1" title="트렌드 필터">Trnd</th>}
                      {searchFilters && <th className="text-center py-2 px-1" title="변동성 필터">Vol</th>}
                      {searchFilters && <th className="text-center py-2 px-1" title="RSI 극단값">RSI-E</th>}
                      {searchIndicators && <th className="text-center py-2 px-1" title="지표 조합">Ind</th>}
                    </>
                  )}
                  <th className="text-right py-2 px-1">거래</th>
                  <th className="text-right py-2 px-1" title="갈아타기 횟수">플립</th>
                  <th className="text-right py-2 px-1">승률</th>
                  <th className="text-right py-2 px-1">수익률</th>
                  <th className="text-right py-2 px-1">MDD</th>
                  <th className="text-right py-2 px-1">Sharpe</th>
                  <th className="text-right py-2 px-1">PF</th>
                  <th className="text-center py-2 px-1 w-20">액션</th>
                </tr>
              </thead>
              <tbody>
                {result.topResults.map((item, idx) => (
                  <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800">
                    <td className="py-2 px-1 text-zinc-500 text-xs">{idx + 1}</td>
                    <td className="py-2 px-1 text-center text-xs">{item.params.rsi_period}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.pivot_left}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.pivot_right}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.min_distance}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.max_distance}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.tp_atr}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.sl_atr}</td>
                    <td className="py-2 px-1 text-center text-yellow-400 text-xs">{item.params.min_div_pct ?? '-'}</td>
                    {(searchFilters || searchIndicators) && (
                      <>
                        {searchFilters && (
                          <td className="py-2 px-1 text-center text-cyan-400 text-xs" title={item.params.trend_filter}>
                            {item.params.trend_filter?.replace('EMA', '') || '-'}
                          </td>
                        )}
                        {searchFilters && (
                          <td className="py-2 px-1 text-center text-orange-400 text-xs" title={item.params.volatility_filter}>
                            {item.params.volatility_filter === 'OFF' ? '-' : item.params.volatility_filter === 'ATR_AVG' ? '1x' : '1.5x'}
                          </td>
                        )}
                        {searchFilters && (
                          <td className="py-2 px-1 text-center text-pink-400 text-xs" title={item.params.rsi_extreme_filter}>
                            {item.params.rsi_extreme_filter?.replace('RSI_', '').replace('_', '/') || '-'}
                          </td>
                        )}
                        {searchIndicators && (
                          <td className="py-2 px-1 text-center text-teal-400 text-xs" title={`Preset ${item.params.indicator_preset}`}>
                            {item.params.indicator_preset || '-'}
                          </td>
                        )}
                      </>
                    )}
                    <td className="py-2 px-1 text-right text-xs">{item.result.totalTrades}</td>
                    <td className="py-2 px-1 text-right text-purple-400 text-xs">{item.result.flipCount ?? 0}</td>
                    <td className="py-2 px-1 text-right text-xs">{item.result.winRate.toFixed(1)}%</td>
                    <td className={`py-2 px-1 text-right font-medium text-xs ${item.result.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.result.totalPnlPercent >= 0 ? '+' : ''}{item.result.totalPnlPercent.toFixed(1)}%
                    </td>
                    <td className="py-2 px-1 text-right text-red-400 text-xs">{item.result.maxDrawdown.toFixed(1)}%</td>
                    <td className="py-2 px-1 text-right font-medium text-blue-400 text-xs">{item.result.sharpeRatio.toFixed(2)}</td>
                    <td className="py-2 px-1 text-right text-zinc-400 text-xs">{item.result.profitFactor.toFixed(1)}</td>
                    <td className="py-2 px-1 text-center">
                      <button
                        onClick={() => handleSaveOne(item, idx + 1)}
                        disabled={isSaving}
                        className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white px-1.5 py-0.5 rounded"
                        title="이 결과만 저장"
                      >
                        저장
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
