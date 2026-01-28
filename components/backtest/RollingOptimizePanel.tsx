'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  RollingOptimizeParams,
  RollingOptimizeResult,
  RollingProgress,
  RollingWindowResult,
  CurrentParams,
  runRollingOptimization,
  getDegradationInterpretation,
  getCurrentParams,
  saveOptimizationResult,
  STRATEGIES,
  StrategyType,
} from '@/lib/backtest-api';

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}분 ${secs}초`;
}

// 5분봉 기준 캔들 → 시간 변환
function candlesToTime(candles: number, timeframe: string = '5m'): string {
  const minutes = timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : timeframe === '1h' ? 60 : 5;
  const totalMinutes = candles * minutes;
  if (totalMinutes < 60) return `${totalMinutes}분`;
  if (totalMinutes < 1440) return `${(totalMinutes / 60).toFixed(1)}시간`;
  return `${(totalMinutes / 1440).toFixed(1)}일`;
}

// 전략별 파라미터 표시
function formatStrategyParams(params: Record<string, unknown>, strategyType: StrategyType): string {
  if (!params) return '-';
  switch (strategyType) {
    case 'rsi_divergence':
      return `RSI ${params.rsi_period ?? '-'} | Pvt ${params.pivot_left ?? '-'}/${params.pivot_right ?? '-'} | TP/SL ${params.tp_atr ?? '-'}/${params.sl_atr ?? '-'}`;
    case 'bb_reversion':
      return `Lb ${params.lookback ?? '-'} | Z ${params.entry_z ?? '-'} | TP/SL ${params.tp_atr ?? '-'}/${params.sl_atr ?? '-'}`;
    case 'ema_adx':
      return `SMA ${params.sma_period ?? '-'} | ROC ${params.roc_threshold ?? '-'}% | TP/SL ${params.tp_atr ?? '-'}/${params.sl_atr ?? '-'}`;
    default:
      return '-';
  }
}

export default function RollingOptimizePanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RollingOptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RollingProgress | null>(null);
  const [windowResults, setWindowResults] = useState<RollingWindowResult[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);

  // 파라미터 설정
  const [strategy, setStrategy] = useState<StrategyType>('rsi_divergence');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [trainCandles, setTrainCandles] = useState(5000);
  const [testCandles, setTestCandles] = useState(1000);
  const [stepCandles, setStepCandles] = useState(1000);
  const [nTrials, setNTrials] = useState(50);
  const [indicators, setIndicators] = useState<string[]>(['rsi']);

  // 파라미터 범위 (넓은 탐색)
  const [pivotLeftRange] = useState([3, 5, 7, 10]);
  const [pivotRightRange] = useState([2, 3, 4, 5]);
  const [rsiPeriodRange] = useState([7, 10, 14, 21]);
  const [minDistanceRange] = useState([3, 5, 10, 15, 20]);
  const [maxDistanceRange] = useState([30, 50, 80, 100, 150]);
  const [tpAtrRange] = useState([1.0, 1.5, 2.0, 2.5, 3.0, 4.0]);
  const [slAtrRange] = useState([0.5, 0.75, 1.0, 1.5, 2.0]);
  const [minDivPctRange] = useState([5, 10, 15, 20, 30]);

  // 현재 활성 파라미터
  const [currentParams, setCurrentParams] = useState<CurrentParams | null>(null);
  const [paramsLoading, setParamsLoading] = useState(false);

  // 정렬 설정
  type SortKey = 'windowId' | 'testSharpe' | 'trainSharpe' | 'ratio' | 'testPnl';
  const [sortKey, setSortKey] = useState<SortKey>('testSharpe');
  const [sortDesc, setSortDesc] = useState(true);

  // DB 저장 상태
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 현재 파라미터 로드
  useEffect(() => {
    const loadCurrentParams = async () => {
      setParamsLoading(true);
      try {
        const params = await getCurrentParams(symbol, timeframe);
        setCurrentParams(params);
      } catch {
        // ignore
      } finally {
        setParamsLoading(false);
      }
    };
    loadCurrentParams();
  }, [symbol, timeframe]);

  const handleProgress = useCallback((data: RollingProgress) => {
    setProgress(data);

    if (data.type === 'progress' && data.windowId) {
      setWindowResults(prev => {
        const existing = prev.find(w => w.windowId === data.windowId);
        if (existing) return prev;
        return [...prev, {
          windowId: data.windowId!,
          trainStart: '',
          trainEnd: '',
          testStart: '',
          testEnd: '',
          bestParams: data.params || {},
          trainSharpe: data.trainSharpe || 0,
          trainTrades: 0,
          trainWinRate: 0,
          trainPnl: 0,
          testSharpe: data.testSharpe || 0,
          testTrades: data.testTrades || 0,
          testWinRate: data.testWinRate || 0,
          testPnl: data.testPnl || 0,
        }];
      });
    }
  }, []);

  const runOptimization = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setWindowResults([]);
    setStartTime(Date.now());

    const params: RollingOptimizeParams = {
      symbol,
      timeframe,
      trainCandles,
      testCandles,
      stepCandles,
      nTrials,
      indicators,
      metric: 'sharpe',
      strategy,
      pivotLeftRange,
      pivotRightRange,
      rsiPeriodRange,
      minDistanceRange,
      maxDistanceRange,
      tpAtrRange,
      slAtrRange,
      minDivPctRange,
    };

    try {
      const result = await runRollingOptimization(params, handleProgress);
      setResult(result);
      setWindowResults(result.windows);
      setSaveSuccess(false);  // 새 결과면 저장 상태 초기화
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // 정렬된 윈도우 목록
  const sortedWindows = result?.windows ? [...result.windows].sort((a, b) => {
    let aVal = 0, bVal = 0;
    const aRatio = (a.trainSharpe ?? 0) > 0 ? (a.testSharpe ?? 0) / (a.trainSharpe ?? 1) : 0;
    const bRatio = (b.trainSharpe ?? 0) > 0 ? (b.testSharpe ?? 0) / (b.trainSharpe ?? 1) : 0;

    switch (sortKey) {
      case 'windowId': aVal = a.windowId; bVal = b.windowId; break;
      case 'testSharpe': aVal = a.testSharpe ?? 0; bVal = b.testSharpe ?? 0; break;
      case 'trainSharpe': aVal = a.trainSharpe ?? 0; bVal = b.trainSharpe ?? 0; break;
      case 'ratio': aVal = aRatio; bVal = bRatio; break;
      case 'testPnl': aVal = a.testPnl ?? 0; bVal = b.testPnl ?? 0; break;
    }
    return sortDesc ? bVal - aVal : aVal - bVal;
  }) : [];

  // 정렬 토글
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  // DB에 최적 파라미터 저장
  const saveToDb = async () => {
    if (!result || sortedWindows.length === 0) return;

    // 테스트 Sharpe 기준 최고 윈도우 선택
    const bestWindow = sortedWindows[0];
    if (!bestWindow.bestParams) return;

    setIsSaving(true);
    try {
      await saveOptimizationResult({
        symbol,
        timeframe,
        strategy,
        params: bestWindow.bestParams,
        trainSharpe: bestWindow.trainSharpe ?? 0,
        testSharpe: bestWindow.testSharpe ?? 0,
        degradationRatio: result.summary?.degradationRatio ?? 0,
        totalWindows: result.summary?.totalWindows ?? 0,
      });
      setSaveSuccess(true);
      // 현재 파라미터 새로고침
      const params = await getCurrentParams(symbol, timeframe);
      setCurrentParams(params);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">롤링 최적화</h2>
          <p className="text-sm text-zinc-500">Walk-Forward Analysis - 과최적화 검증</p>
        </div>
        <button
          onClick={runOptimization}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '실행 중...' : '롤링 최적화 실행'}
        </button>
      </div>

      {/* 현재 활성 파라미터 (RSI 다이버전스 전용) */}
      {strategy === 'rsi_divergence' && currentParams && !paramsLoading && (
        <div className="p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-300">현재 활성 파라미터</h3>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                currentParams.confidence === 'high' ? 'bg-green-900/50 text-green-400' :
                currentParams.confidence === 'medium' ? 'bg-yellow-900/50 text-yellow-400' :
                'bg-red-900/50 text-red-400'
              }`}>
                {currentParams.confidence === 'high' ? '높은 신뢰도' :
                 currentParams.confidence === 'medium' ? '보통 신뢰도' : '낮은 신뢰도'}
              </span>
              <span className="text-xs text-zinc-500">
                Sharpe: <span className="text-blue-400">{currentParams.trainSharpe.toFixed(2)}</span>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-3 text-xs">
            <div>
              <span className="text-zinc-500">RSI</span>
              <div className="text-zinc-200 font-mono">{currentParams.params.rsi_period}</div>
            </div>
            <div>
              <span className="text-zinc-500">Pivot L/R</span>
              <div className="text-zinc-200 font-mono">{currentParams.params.pivot_left}/{currentParams.params.pivot_right}</div>
            </div>
            <div>
              <span className="text-zinc-500">거리</span>
              <div className="text-zinc-200 font-mono">{currentParams.params.min_distance}-{currentParams.params.max_distance}</div>
            </div>
            <div>
              <span className="text-zinc-500">TP/SL ATR</span>
              <div className="text-zinc-200 font-mono">{currentParams.params.tp_atr}/{currentParams.params.sl_atr}</div>
            </div>
            <div>
              <span className="text-zinc-500">최적화</span>
              <div className="text-zinc-400 text-[10px]">{new Date(currentParams.optimizedAt).toLocaleDateString()}</div>
            </div>
            <div>
              <span className="text-zinc-500">유효기간</span>
              <div className="text-zinc-400 text-[10px]">{new Date(currentParams.validUntil).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* 전략 선택 */}
      <div className="p-4 bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-700/50 rounded-lg">
        <label className="block text-xs text-indigo-300 mb-2 font-semibold">전략 선택</label>
        <div className="grid grid-cols-3 gap-3">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStrategy(s.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                strategy === s.id
                  ? 'bg-indigo-600/30 border-indigo-500 ring-1 ring-indigo-500'
                  : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              <div className={`text-sm font-medium ${strategy === s.id ? 'text-indigo-200' : 'text-zinc-300'}`}>
                {s.label}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 설정 패널 */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-zinc-900 rounded-lg">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">심볼</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
          >
            <option value="BTCUSDT">BTC/USDT</option>
            <option value="ETHUSDT">ETH/USDT</option>
            <option value="SOLUSDT">SOL/USDT</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">타임프레임</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
          >
            <option value="5m">5분</option>
            <option value="15m">15분</option>
            <option value="1h">1시간</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Optuna 트라이얼</label>
          <input
            type="number"
            value={nTrials}
            onChange={(e) => setNTrials(Number(e.target.value))}
            className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
            min={10}
            max={500}
          />
        </div>
      </div>

      {/* 데이터 기간 안내 */}
      <div className="px-4 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-500">
        최신 캐시 데이터에서 자동 로드 · 약 {candlesToTime(trainCandles + testCandles + stepCandles * 20, timeframe)} 분량
      </div>

      {/* 윈도우 설정 */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-zinc-900 rounded-lg">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            학습 윈도우 <span className="text-zinc-600">({candlesToTime(trainCandles, timeframe)})</span>
          </label>
          <input
            type="number"
            value={trainCandles}
            onChange={(e) => setTrainCandles(Number(e.target.value))}
            className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
            step={500}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            테스트 윈도우 <span className="text-zinc-600">({candlesToTime(testCandles, timeframe)})</span>
          </label>
          <input
            type="number"
            value={testCandles}
            onChange={(e) => setTestCandles(Number(e.target.value))}
            className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
            step={100}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            롤링 스텝 <span className="text-zinc-600">({candlesToTime(stepCandles, timeframe)})</span>
          </label>
          <input
            type="number"
            value={stepCandles}
            onChange={(e) => setStepCandles(Number(e.target.value))}
            className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
            step={100}
          />
        </div>
      </div>

      {/* 지표 선택 */}
      <div className="p-4 bg-zinc-900 rounded-lg">
        <label className="block text-xs text-zinc-500 mb-2">지표</label>
        <div className="flex gap-4">
          {['rsi', 'obv', 'cvd', 'oi'].map((ind) => (
            <label key={ind} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={indicators.includes(ind)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setIndicators([...indicators, ind]);
                  } else {
                    setIndicators(indicators.filter(i => i !== ind));
                  }
                }}
                className="rounded"
              />
              <span className="text-sm text-zinc-300 uppercase">{ind}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 진행 상황 */}
      {isLoading && (
        <div className="p-4 bg-zinc-900 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">
              {progress?.type === 'status' ? progress.message : `윈도우 ${windowResults.length} 완료`}
            </span>
            <span className="text-sm text-zinc-500">{formatTime(elapsed)}</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${Math.min((windowResults.length / 20) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* 결과 요약 */}
      {result && (
        <div className="space-y-4">
          {/* Degradation Ratio 카드 */}
          <div className="p-6 bg-zinc-900 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Degradation Ratio</h3>
                <p className="text-sm text-zinc-500">테스트 Sharpe / 학습 Sharpe</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">
                  {getDegradationInterpretation(result.summary?.degradationRatio ?? 0).emoji}{' '}
                  <span className={getDegradationInterpretation(result.summary?.degradationRatio ?? 0).color}>
                    {((result.summary?.degradationRatio ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <p className={`text-sm ${getDegradationInterpretation(result.summary?.degradationRatio ?? 0).color}`}>
                  {getDegradationInterpretation(result.summary?.degradationRatio ?? 0).description}
                </p>
              </div>
            </div>

            {/* 해석 가이드 */}
            <div className="mt-4 p-3 bg-zinc-800 rounded text-xs text-zinc-400">
              <div className="grid grid-cols-5 gap-2">
                <div>🟢 70%+ = 로버스트</div>
                <div>🟡 40-70% = 양호</div>
                <div>🟠 20-40% = 주의</div>
                <div>🔴 0-20% = 과최적화</div>
                <div>🔴 &lt;0% = 역전</div>
              </div>
            </div>
          </div>

          {/* 성과 요약 */}
          <div className="grid grid-cols-5 gap-4">
            <div className="p-4 bg-zinc-900 rounded-lg">
              <div className="text-xs text-zinc-500">유효 / 전체 윈도우</div>
              <div className="text-xl font-bold text-zinc-100">
                {result.summary?.totalWindows ?? 0}
                <span className="text-sm text-zinc-500 font-normal">
                  /{(result.summary as any)?.totalAttempted ?? '?'}
                </span>
              </div>
              {(result.summary as any)?.skippedWindows > 0 && (
                <div className="text-[10px] text-zinc-500 mt-1">
                  {(result.summary as any).skippedWindows}개 저품질
                </div>
              )}
            </div>
            <div className="p-4 bg-zinc-900 rounded-lg">
              <div className="text-xs text-zinc-500">평균 학습 Sharpe</div>
              <div className="text-xl font-bold text-blue-400">{(result.summary?.avgTrainSharpe ?? 0).toFixed(2)}</div>
            </div>
            <div className="p-4 bg-zinc-900 rounded-lg">
              <div className="text-xs text-zinc-500">평균 테스트 Sharpe</div>
              <div className="text-xl font-bold text-green-400">{(result.summary?.avgTestSharpe ?? 0).toFixed(2)}</div>
            </div>
            <div className="p-4 bg-zinc-900 rounded-lg">
              <div className="text-xs text-zinc-500">총 거래</div>
              <div className="text-xl font-bold text-zinc-100">{result.summary?.totalTrades ?? 0}</div>
            </div>
            <div className="p-4 bg-zinc-900 rounded-lg">
              <div className="text-xs text-zinc-500">총 PnL</div>
              <div className={`text-xl font-bold ${(result.summary?.totalPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(result.summary?.totalPnl ?? 0) >= 0 ? '+' : ''}{(result.summary?.totalPnl ?? 0).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* 학습 vs 테스트 Sharpe 스캐터 차트 */}
          {result.windows && result.windows.length > 0 && (
            <div className="bg-zinc-900 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-100">학습 vs 테스트 Sharpe</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span> 70%+</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500"></span> 40-70%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500"></span> 20-40%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500"></span> &lt;20%</span>
                  </div>
                </div>
              </div>
              <div className="p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                      type="number"
                      dataKey="trainSharpe"
                      name="학습 Sharpe"
                      domain={[0, 'auto']}
                      tick={{ fill: '#888', fontSize: 11 }}
                      label={{ value: '학습 Sharpe', position: 'bottom', fill: '#666', fontSize: 12, offset: 0 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="testSharpe"
                      name="테스트 Sharpe"
                      domain={['auto', 'auto']}
                      tick={{ fill: '#888', fontSize: 11 }}
                      label={{ value: '테스트 Sharpe', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value, name) => [typeof value === 'number' ? value.toFixed(2) : '-', name ?? '']}
                      labelFormatter={(label) => `윈도우 ${label}`}
                    />
                    <ReferenceLine y={0} stroke="#444" />
                    <Scatter
                      name="윈도우"
                      data={result.windows.map(w => ({
                        windowId: w.windowId,
                        trainSharpe: w.trainSharpe ?? 0,
                        testSharpe: w.testSharpe ?? 0,
                      }))}
                      fill="#3b82f6"
                    >
                      {result.windows.map((w, index) => {
                        const train = w.trainSharpe ?? 0;
                        const test = w.testSharpe ?? 0;
                        const ratio = train > 0 ? test / train : 0;
                        const color = ratio >= 0.7 ? '#22c55e' : ratio >= 0.4 ? '#eab308' : ratio >= 0.2 ? '#f97316' : '#ef4444';
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 윈도우별 결과 테이블 */}
          <div className="bg-zinc-900 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-100">윈도우별 상세 (정렬: {sortKey})</h3>
              <button
                onClick={saveToDb}
                disabled={isSaving || saveSuccess || sortedWindows.length === 0}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  saveSuccess
                    ? 'bg-green-600 text-white cursor-default'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                }`}
              >
                {isSaving ? '저장 중...' : saveSuccess ? '저장 완료!' : 'DB에 최적 파라미터 저장'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800">
                  <tr>
                    <th
                      className="px-4 py-2 text-left text-zinc-400 cursor-pointer hover:text-zinc-200"
                      onClick={() => handleSort('windowId')}
                    >
                      # {sortKey === 'windowId' && (sortDesc ? '↓' : '↑')}
                    </th>
                    <th
                      className="px-4 py-2 text-right text-zinc-400 cursor-pointer hover:text-zinc-200"
                      onClick={() => handleSort('trainSharpe')}
                    >
                      학습 Sharpe {sortKey === 'trainSharpe' && (sortDesc ? '↓' : '↑')}
                    </th>
                    <th
                      className="px-4 py-2 text-right text-zinc-400 cursor-pointer hover:text-zinc-200"
                      onClick={() => handleSort('testSharpe')}
                    >
                      테스트 Sharpe {sortKey === 'testSharpe' && (sortDesc ? '↓' : '↑')}
                    </th>
                    <th
                      className="px-4 py-2 text-right text-zinc-400 cursor-pointer hover:text-zinc-200"
                      onClick={() => handleSort('ratio')}
                    >
                      Ratio {sortKey === 'ratio' && (sortDesc ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-2 text-right text-zinc-400">거래수</th>
                    <th className="px-4 py-2 text-right text-zinc-400">승률</th>
                    <th
                      className="px-4 py-2 text-right text-zinc-400 cursor-pointer hover:text-zinc-200"
                      onClick={() => handleSort('testPnl')}
                    >
                      PnL {sortKey === 'testPnl' && (sortDesc ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-2 text-left text-zinc-400">파라미터</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWindows.map((w, idx) => {
                    const trainSharpe = w.trainSharpe ?? 0;
                    const testSharpe = w.testSharpe ?? 0;
                    const testWinRate = w.testWinRate ?? 0;
                    const testPnl = w.testPnl ?? 0;
                    const ratio = trainSharpe > 0 ? testSharpe / trainSharpe : 0;
                    const interp = getDegradationInterpretation(ratio);
                    const isBest = idx === 0 && sortKey === 'testSharpe' && sortDesc;
                    return (
                      <tr
                        key={w.windowId}
                        className={`border-t border-zinc-800 hover:bg-zinc-800/50 ${
                          isBest ? 'bg-indigo-900/30 ring-1 ring-indigo-500/50' : ''
                        }`}
                      >
                        <td className="px-4 py-2 text-zinc-300">
                          {isBest && <span className="text-yellow-400 mr-1">★</span>}
                          #{idx + 1} (W{w.windowId})
                        </td>
                        <td className="px-4 py-2 text-right text-blue-400">{trainSharpe.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-green-400">{testSharpe.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">
                          {trainSharpe <= 0.1 ? (
                            <span className="text-zinc-600">N/A</span>
                          ) : (
                            <span className={interp.color}>
                              {interp.emoji}{' '}
                              {ratio > 2 ? '>200' : ratio < -2 ? '<-200' : (ratio * 100).toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-zinc-300">{w.testTrades ?? 0}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={testWinRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                            {testWinRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={testPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {testPnl >= 0 ? '+' : ''}{testPnl.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">
                          {formatStrategyParams(w.bestParams || {}, strategy)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 파라미터 안정성 */}
          <div className="p-4 bg-zinc-900 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-zinc-100">파라미터 안정성</h3>
                <p className="text-sm text-zinc-500">윈도우 간 파라미터 변동 계수 (낮을수록 안정)</p>
              </div>
              <div className="text-xl font-bold">
                <span className={(result.summary?.paramStability ?? 0) < 0.3 ? 'text-green-400' : (result.summary?.paramStability ?? 0) < 0.5 ? 'text-yellow-400' : 'text-red-400'}>
                  {((result.summary?.paramStability ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 실시간 윈도우 스캐터 차트 (로딩 중) */}
      {isLoading && windowResults.length > 0 && (
        <div className="bg-zinc-900 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-semibold text-zinc-100">진행 중 - 학습 vs 테스트 Sharpe</h3>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  type="number"
                  dataKey="trainSharpe"
                  name="학습 Sharpe"
                  domain={[0, 'auto']}
                  tick={{ fill: '#888', fontSize: 11 }}
                  label={{ value: '학습 Sharpe', position: 'bottom', fill: '#666', fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="testSharpe"
                  name="테스트 Sharpe"
                  domain={[0, 'auto']}
                  tick={{ fill: '#888', fontSize: 11 }}
                  label={{ value: '테스트 Sharpe', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value, name) => [typeof value === 'number' ? value.toFixed(2) : '-', name ?? '']}
                />
                <ReferenceLine y={0} stroke="#444" />
                <Scatter name="윈도우" data={windowResults} fill="#3b82f6">
                  {windowResults.map((entry, index) => {
                    const ratio = entry.trainSharpe > 0 ? entry.testSharpe / entry.trainSharpe : 0;
                    const color = ratio >= 0.7 ? '#22c55e' : ratio >= 0.4 ? '#eab308' : ratio >= 0.2 ? '#f97316' : '#ef4444';
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
