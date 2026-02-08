'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  IChartApi,
  CandlestickData,
  CandlestickSeries,
  SeriesMarker,
  Time,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts';
import { useSocket, useSocketTicker, useSocketKline } from '@/contexts/SocketContext';
import {
  getTopSavedResults,
  getRollingParams,
  SavedOptimizeResult,
  RollingParamResult,
  runBacktest,
  runWalkForwardBacktest,
  TradeResult,
  SkippedSignal,
  OpenPosition,
  BacktestResult,
  EquityPoint,
  deleteSavedResult,
  getDailyRollingSharpeTimeline,
  refreshSingleStrategy,
  refreshAllStrategies,
} from '@/lib/backtest-api';
import { X, RefreshCw, Zap } from 'lucide-react';
import {
  convertApiParams,
  getDefaultParams,
} from '@/lib/strategy-params';
import MultiStrategyEquityChart from './MultiStrategyEquityChart';
import WeeklySharpeTimeline from './WeeklySharpeTimeline';
import AvgSharpeChart from './AvgSharpeChart';
import { ChartLegend } from './ui/ChartLegend';
import { OpenPositionCard } from './ui/OpenPositionCard';
import { RecentSignalsPanel } from './ui/RecentSignalsPanel';
import { ChartHeader } from './ui/ChartHeader';
import { SettingsPanel } from './ui/SettingsPanel';
import { OptimizeComparisonCard } from './ui/OptimizeComparisonCard';
import { useStrategyOptimize } from '@/hooks/useStrategyOptimize';
import { StatisticsHeader } from './ui/StatisticsHeader';
import { StrategyMiniChart } from './ui/StrategyMiniChart';

// JSON Single Source of Truth: API 캐시에서 로드된 기본값 사용
// z_score removed - orchestrator handles mean reversion internally
const getOrchestratorDefaults = () => getDefaultParams('orchestrator');
import { preloadStrategyDefaults, getCachedStrategyDisplayName, fetchStrategyPreviews, StrategyPreview, StrategyType } from '@/lib/backtest-api';
import { calculateTotalHoldingTime, calculateMeasurementPeriod, formatDuration } from '@/lib/backtest-calculations';
import { CHART } from '@/lib/constants';
import { useAtomValue } from 'jotai';
import { symbolAtom, symbolIdAtom } from '@/stores/symbolAtom';
import { toSeconds, formatKST, getTimeframeSeconds } from '@/lib/utils/timestamp';
// useAutoOptimize removed — optimization integrated into strategy list
import { usePerformanceMonitor, performanceMonitor } from '@/lib/performance-monitor';

// ✅ Custom Hooks
import { useChartData } from './hooks/useChartData';
import { useStrategyList } from './hooks/useStrategyList';
import { useBacktestRunner } from './hooks/useBacktestRunner';
import { useRealtimeUpdates } from './hooks/useRealtimeUpdates';
import { useSoundAlerts } from './hooks/useSoundAlerts';
import { usePositionAlerts } from './hooks/usePositionAlerts';
import { useMarkerGeneration } from './hooks/useMarkerGeneration';
// import { useWhyDidYouUpdate } from './hooks/useWhyDidYouUpdate'; // 비활성화

// 무지개 색상 배열 (빨주노초파보)
const RAINBOW_COLORS = [
  '#ef4444',  // 빨강 (Red)
  '#f97316',  // 주황 (Orange)
  '#eab308',  // 노랑 (Yellow)
  '#22c55e',  // 초록 (Green)
  '#3b82f6',  // 파랑 (Blue)
  '#a855f7',  // 보라 (Purple)
];

// 순서대로 무지개 색상 할당
const getStrategyColor = (index: number): string => {
  return RAINBOW_COLORS[index % RAINBOW_COLORS.length];
};

// 전략 ID에서 표시 이름 추출 (JSON Single Source of Truth)
const getStrategyDisplayName = (strategy: SavedOptimizeResult): string => {
  // note에 한글 displayName이 있으면 바로 사용 (백엔드 프리뷰 응답)
  if (strategy.note && /[가-힣]/.test(strategy.note)) {
    return strategy.note;
  }
  // note에서 전략 타입 추출: "[롤링] z_score" → "z_score"
  const match = strategy.note?.match(/\[롤링\]\s*(\w+)/);
  const strategyType = match?.[1] || (strategy as any).strategy || 'rsi_div';
  // API 캐시에서 displayName 가져오기 (old ID 자동 변환)
  return getCachedStrategyDisplayName(strategyType);
};


function RealtimeChart() {
  // Performance monitoring
  usePerformanceMonitor('RealtimeChart');

  // 🔍 리렌더 원인 추적 (디버깅용) - 비활성화
  // const renderCountRef = useRef(0);
  // renderCountRef.current += 1;
  // useEffect(() => {
  //   console.log(`🔄 [RealtimeChart] Render #${renderCountRef.current}`);
  // });

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]); // TP/SL/Entry price lines
  const seriesMarkersRef = useRef<any>(null); // 마커 인스턴스 재사용 (누적 방지)
  const isChartDisposedRef = useRef(false);
  // 🎯 핵심 최적화: Context 분리로 불필요한 리렌더 방지
  // - TickerContext: ticker만 구독 (가장 빈번)
  // - KlineContext: kline 데이터만 구독
  // - SocketContext: 나머지 (divergence, subscriptions 등)
  const { ticker: tickerData } = useSocketTicker();
  const { getKline } = useSocketKline();
  const {
    isConnected,
    divergenceData,
    divergenceHistory,
    subscribeKline,
  } = useSocket();

  // ticker는 ref로 저장하여 리렌더 없이 접근
  const tickerRef = useRef(tickerData);
  useEffect(() => {
    tickerRef.current = tickerData;
  }, [tickerData]);

  // ticker 접근용 프록시 객체 (ref를 통해 최신 값 반환)
  const ticker = useMemo(() => ({
    get price() { return tickerRef.current?.price; },
    get timestamp() { return tickerRef.current?.timestamp; }
  }), []); // 빈 deps = 객체 참조 안정화

  // 현재 선택된 심볼
  const currentSymbol = useAtomValue(symbolAtom);
  const symbolId = useAtomValue(symbolIdAtom); // 문자열 심볼 ID (BTCUSDT)

  // ==================== Local UI State (not from hooks) ====================
  const [timeframe, setTimeframe] = useState('5m');
  const [selectedStrategy, setSelectedStrategy] = useState<SavedOptimizeResult | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<TradeResult | null>(null);
  const [highlightedStrategy, setHighlightedStrategy] = useState<number | null>(null);
  const [useWalkForward, setUseWalkForward] = useState(false);

  // Tooltip 상태
  const [hoveredTrade, setHoveredTrade] = useState<TradeResult | null>(null);
  const [hoveredSkipped, setHoveredSkipped] = useState<SkippedSignal | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const tradeMapRef = useRef<Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>>(new Map());

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // autoOptimizeEnabled removed — optimization integrated into strategy list
  const [leverage, setLeverage] = useState(20);
  const [nextCandleCountdown, setNextCandleCountdown] = useState<number>(0);

  // 전략 비교 차트 탭 (null = 숨김, 'equity' = 자산곡선, 'sharpe' = 샤프 타임라인)
  const [strategyChartTab, setStrategyChartTab] = useState<'equity' | 'sharpe' | 'avg-sharpe' | null>(null);

  // 단일 전략 갱신 중 상태
  const [refreshingStrategy, setRefreshingStrategy] = useState<string | null>(null);

  // Refs for tracking
  const savedStrategyIdRef = useRef<number | null>(null);
  const lastCandleTimeRef = useRef<number>(0);
  const manuallySelectedRef = useRef(false);
  const isChangingStrategyRef = useRef(false);

  // ==================== Custom Hooks ====================

  // 1. Chart Data (candles loading)
  const {
    candles,
    isLoading,
    chartKey,
    initialCandlesLoaded,
  } = useChartData(symbolId, timeframe, subscribeKline);

  // Expose setCandles for real-time updates
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  // 2. Strategy List
  const {
    strategies,
    isLoading: isLoadingAllStrategies,
    refetch: refetchStrategies,
  } = useStrategyList(currentSymbol.slashFormat, symbolId, timeframe);

  // 3. Backtest Runner (equity curves + rolling sharpe timeline + all positions + stats + trades)
  const {
    equityCurves: allStrategiesEquityCurves,
    isLoading: isLoadingEquityCurves,
    rollingSharpeData,
    allOpenPositions,
    allStrategyStats,
    allTradesMap,
    refetch: refetchBacktestData,
  } = useBacktestRunner(strategies, symbolId, timeframe, useWalkForward);

  // 4. Real-time Updates (selected strategy backtest)
  // 미리 로드된 trades/openPositions를 우선 사용 → runBacktest 호출 최소화
  const {
    backtestTrades,
    skippedSignals,
    openPosition,
    backtestStats,
    equityCurve,
    lastBacktestTime,
    isBacktestRunning,
    loadBacktestTrades,
    clearOpenPosition,
  } = useRealtimeUpdates(
    selectedStrategy,
    symbolId,
    currentSymbol.slashFormat,
    timeframe,
    candles.length,
    isLoading,
    allTradesMap,      // 미리 로드된 trades (마커 표시용)
    allOpenPositions,  // 미리 로드된 open positions
    allStrategyStats,  // 미리 로드된 통계 (헤더 표시용)
  );

  // 5. Sound Alerts
  const {
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    playAlertSound,
    playExitSound,
  } = useSoundAlerts();

  // 6. Position Alerts (divergence signals, TP/SL exits, entry alerts)
  const {
    lastSignalIdRef,
    lastExitAlertRef,
    lastEntryAlertRef,
  } = usePositionAlerts({
    divergenceData,
    openPosition,
    ticker,
    selectedStrategy,
    soundEnabled,
    playAlertSound,
    playExitSound,
    loadBacktestTrades,
    onPositionExit: (exitType, exitPrice) => {
      console.log(`[Position Exit] ${exitType.toUpperCase()} @ $${exitPrice}`);
      clearOpenPosition();
    },
  });

  // 전략 최적화 (Propose → Approve/Reject)
  const {
    strategies: optimizeStatuses,
    optimizingStrategy,
    proposeResult,
    isApplying,
    applyResult,
    error: optimizeError,
    startOptimize,
    approve: approveOptimize,
    reject: rejectOptimize,
  } = useStrategyOptimize();

  // approve 성공 시 차트 데이터 갱신
  useEffect(() => {
    if (applyResult?.success) {
      refetchBacktestData(true, true);
    }
  }, [applyResult, refetchBacktestData]);

  // 🔍 리렌더 원인 추적 (개발 모드에서만 활성화) - 비활성화
  // if (process.env.NODE_ENV === 'development') {
  //   useWhyDidYouUpdate('RealtimeChart', {
  //     // Custom hooks 반환값
  //     candles: candles.length,
  //     isLoading,
  //     initialCandlesLoaded,
  //     strategies: strategies.length,
  //     isLoadingAllStrategies,
  //     equityCurves: allStrategiesEquityCurves.size,
  //     isLoadingEquityCurves,
  //     rollingSharpeData: rollingSharpeData.size,
  //     backtestTrades: backtestTrades.length,
  //     skippedSignals: skippedSignals.length,
  //     openPosition: openPosition?.direction,
  //     backtestStats: backtestStats?.totalTrades,
  //     equityCurve: equityCurve.length,
  //     isBacktestRunning,

  //     // Local state
  //     timeframe,
  //     selectedStrategy: selectedStrategy?.id,
  //     highlightedStrategy,
  //     useWalkForward,

  //     // Socket data
  //     ticker: ticker?.price,
  //     divergenceData: divergenceData?.timestamp,
  //   });
  // }

  // ==================== localStorage 복원 ====================
  useEffect(() => {
    const savedId = localStorage.getItem('selectedStrategyId');
    const savedTf = localStorage.getItem('selectedStrategyTimeframe');
    if (savedId) {
      savedStrategyIdRef.current = parseInt(savedId, 10);
      manuallySelectedRef.current = true;
      console.log('[Strategy] Restored saved strategy ID:', savedStrategyIdRef.current);
      if (savedTf && savedTf !== timeframe) {
        console.log('[Strategy] Restoring saved timeframe:', savedTf);
        setTimeframe(savedTf);
      }
    }
  }, []);

  // 자동 최적화는 OptimizationPanel로 이전됨

  // ==================== Helper Functions ====================

  // 마커 인스턴스 재사용 유틸 함수 (누적 방지)
  const updateSeriesMarkers = useCallback((markers: SeriesMarker<Time>[]) => {
    console.log('[updateSeriesMarkers] Called with', markers.length, 'markers, candleSeries:', !!candleSeriesRef.current, 'existingMarkers:', !!seriesMarkersRef.current);

    if (!candleSeriesRef.current) {
      console.warn('[updateSeriesMarkers] candleSeriesRef.current is null, skipping');
      return;
    }

    if (!seriesMarkersRef.current) {
      // 첫 호출: 인스턴스 생성
      console.log('[updateSeriesMarkers] Creating new marker series with', markers.length, 'markers');
      seriesMarkersRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
      console.log('[updateSeriesMarkers] Created marker series:', !!seriesMarkersRef.current);
    } else {
      // 이후 호출: 기존 인스턴스에서 마커만 교체
      console.log('[updateSeriesMarkers] Updating existing marker series with', markers.length, 'markers');
      seriesMarkersRef.current.setMarkers(markers);
    }

    // 첫 3개 마커 샘플 로그
    if (markers.length > 0) {
      console.log('[updateSeriesMarkers] Sample markers:', markers.slice(0, 3).map(m => ({ time: m.time, shape: m.shape, color: m.color })));
    }
  }, []); // refs만 사용하므로 의존성 없음

  // ==================== Hook Calls (after helper functions) ====================

  // Note: Position alerts (divergence signals, TP/SL exits, entry alerts) are now handled by usePositionAlerts hook

  // 7. Marker Generation (chart markers and candle coloring)
  useMarkerGeneration({
    backtestTrades,
    skippedSignals,
    openPosition,
    candles,
    divergenceHistory,
    selectedStrategy,
    isBacktestRunning,
    lastBacktestTime,  // 캐시 사용 시에도 마커 갱신 트리거
    candleSeriesRef,
    chartRef,
    isChangingStrategyRef,
    updateSeriesMarkers,
    tradeMapRef,
  });

  // 다음 캔들까지 카운트다운 타이머
  useEffect(() => {
    const getTimeframeSeconds = (tf: string): number => {
      if (tf === '1m') return 60;
      if (tf === '5m') return 300;
      if (tf === '15m') return 900;
      if (tf === '1h') return 3600;
      return 300;
    };

    const updateCountdown = () => {
      const tfSeconds = getTimeframeSeconds(timeframe);
      const now = Math.floor(Date.now() / 1000);
      const nextCandleTime = Math.ceil(now / tfSeconds) * tfSeconds;
      const remaining = nextCandleTime - now;
      setNextCandleCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);


  // 전략 미리보기 백테스트 실행 (단일 전략)
  // 파라미터를 보내지 않고 Python이 JSON 기본값을 사용하도록 함 (race condition 방지)
  const runPreviewBacktest = async (strategy: SavedOptimizeResult): Promise<{
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
    sharpeRatio: number;
  } | null> => {
    try {
      const strategyType = (strategy.strategy || 'rsi_div') as StrategyType;

      // 최소 파라미터만 전송 - Python이 JSON 기본값 사용
      const result = await runBacktest({
        strategy: strategyType,
        symbol: currentSymbol.slashFormat,
        timeframe: strategy.timeframe,
        candleCount: 5000,
        initialCapital: 1000,
        positionSizePercent: 100,
        useLiveData: false, // 인메모리 캐시 사용
        // 파라미터 전송 안 함 → Python에서 JSON 기본값 사용
      });

      return {
        totalTrades: result.totalTrades,
        winRate: result.winRate,
        totalPnlPercent: result.totalPnlPercent,
        sharpeRatio: result.sharpeRatio,
      };
    } catch (err) {
      console.error(`Preview backtest failed for strategy ${strategy.id}:`, err);
      return null;
    }
  };

  // 롤링 파라미터를 SavedOptimizeResult 형식으로 변환
  // param_registry.py 기반 자동 변환 사용
  const convertRollingToSaved = (rolling: RollingParamResult, index: number): SavedOptimizeResult => {
    // 모든 전략 지원
    const strategyType = rolling.strategy as StrategyType;

    // 1. API 파라미터 (snake_case) → 프론트엔드 (camelCase) 자동 변환
    const rawParams = rolling.params as Record<string, unknown>;
    const convertedParams = convertApiParams(rawParams) as Record<string, number>;

    // 2. 전략별 기본값 가져오기
    const defaults = getDefaultParams(strategyType);

    // 3. 기본 공통 필드 + 변환된 파라미터 병합
    const base: SavedOptimizeResult = {
      id: -(index + 1000), // 음수 ID로 롤링 구분
      createdAt: rolling.savedAt,
      symbol: rolling.symbol,
      timeframe: rolling.timeframe,
      candleCount: 5000,
      indicators: 'rsi',
      metric: 'sharpe',
      optimizeMethod: 'bayesian',
      strategy: strategyType,
      // 기본값 (전략별 기본값에서 가져옴)
      rsiPeriod: convertedParams.rsiPeriod ?? defaults.rsiPeriod ?? 14,
      pivotLeft: convertedParams.pivotLeft ?? defaults.pivotLeft ?? 5,
      pivotRight: convertedParams.pivotRight ?? defaults.pivotRight ?? 1,
      minDistance: convertedParams.minDistance ?? defaults.minDistance ?? 8,
      maxDistance: convertedParams.maxDistance ?? defaults.maxDistance ?? 60,
      tpAtr: convertedParams.tpAtr ?? defaults.tpAtr ?? 2.5,
      slAtr: convertedParams.slAtr ?? defaults.slAtr ?? 1.5,
      totalTrades: 0,
      winRate: 0,
      totalPnlPercent: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      sharpeRatio: rolling.testSharpe,
      rank: 1,
      note: `[롤링] ${rolling.strategy}`,
    };

    // 4. 전략별 추가 파라미터 및 필터 문자열 설정
    if (strategyType === 'rsi_div') {
      // 반전매매(RSI DIV) (학술 기반)
      base.minDivPct = convertedParams.minRsiDiff ?? defaults.minRsiDiff ?? 3;
      base.trendFilter = convertedParams.regimeFilter ? 'regime' : 'OFF';
      base.volatilityFilter = convertedParams.volFilter ? 'atr' : 'OFF';
      base.rsiExtremeFilter = convertedParams.volumeConfirm ? 'extreme' : 'OFF';
    } else if (strategyType === 'vol_breakout') {
      // 돌파매매 (학술 기반)
      base.smaPeriod = convertedParams.smaPeriod ?? defaults.smaPeriod ?? 50;
      base.atrPeriod = convertedParams.atrPeriod ?? defaults.atrPeriod ?? 14;
      base.compressionMult = convertedParams.compressionMult ?? defaults.compressionMult ?? 0.8;
      base.breakoutPeriod = convertedParams.breakoutPeriod ?? defaults.breakoutPeriod ?? 10;
      base.rocPeriod = convertedParams.rocPeriod ?? defaults.rocPeriod ?? 5;
      base.rocThreshold = convertedParams.rocThreshold ?? defaults.rocThreshold ?? 1.0;
      base.volumeConfirm = convertedParams.volumeConfirm ?? defaults.volumeConfirm ?? 0;
      base.volatilityFilter = base.volumeConfirm ? 'volume' : 'OFF';
    } else if (strategyType === 'orchestrator') {
      // 오케스트레이터 v3 (횡보=RSI Divergence+평균회귀, 추세=브레이크아웃)
      const orchDefaults = getOrchestratorDefaults();
      // RSI Divergence 파라미터 (콤보 동일)
      base.pivotLeft = convertedParams.pivotLeft ?? orchDefaults.pivotLeft ?? 5;
      base.pivotRight = convertedParams.pivotRight ?? orchDefaults.pivotRight ?? 1;
      base.rsiPeriod = convertedParams.rsiPeriod ?? orchDefaults.rsiPeriod ?? 14;
      base.minRsiDiff = convertedParams.minRsiDiff ?? orchDefaults.minRsiDiff ?? 3;
      base.minDistance = convertedParams.minDistance ?? orchDefaults.minDistance ?? 5;
      base.maxDistance = convertedParams.maxDistance ?? orchDefaults.maxDistance ?? 100;
      base.rsiOversold = convertedParams.rsiOversold ?? orchDefaults.rsiOversold ?? 35;
      base.rsiOverbought = convertedParams.rsiOverbought ?? orchDefaults.rsiOverbought ?? 65;
      // 평균회귀 파라미터
      base.bbLookback = convertedParams.bbLookback ?? orchDefaults.bbLookback ?? 20;
      base.lowVolEntryZ = convertedParams.lowVolEntryZ ?? orchDefaults.lowVolEntryZ ?? 1.5;
      base.highVolEntryZ = convertedParams.highVolEntryZ ?? orchDefaults.highVolEntryZ ?? 2.5;
      base.exitZ = convertedParams.exitZ ?? orchDefaults.exitZ ?? 0.25;
      base.bbVolumeMult = convertedParams.bbVolumeMult ?? orchDefaults.bbVolumeMult ?? 0.8;
      // 브레이크아웃 파라미터
      base.breakoutPeriod = convertedParams.breakoutPeriod ?? orchDefaults.breakoutPeriod ?? 20;
      base.breakoutVolumeMult = convertedParams.breakoutVolumeMult ?? orchDefaults.breakoutVolumeMult ?? 1.5;
      base.adxThreshold = convertedParams.adxThreshold ?? orchDefaults.adxThreshold ?? 25;
      base.volumeMult = convertedParams.volumeMult ?? orchDefaults.volumeMult ?? 1.5;
      // 공통
      base.cooldownBars = convertedParams.cooldownBars ?? orchDefaults.cooldownBars ?? 5;
      base.tpAtr = convertedParams.tpAtr ?? orchDefaults.tpAtr ?? 1.7;
      base.slAtr = convertedParams.slAtr ?? orchDefaults.slAtr ?? 3.5;
    }

    return base;
  };

  // ==================== Strategy Loading & Backtesting ====================
  // Note: Strategy loading, equity curves, and rolling sharpe are now handled by custom hooks:
  // - useStrategyList: loads strategies from backend
  // - useBacktestRunner: runs backtests and collects equity curves
  // Old useEffect blocks (lines 610-970) have been removed to avoid duplication

  // ==================== Event Handlers ====================
  // 전략 변경 핸들러
  const handleStrategyChange = useCallback(async (strategy: SavedOptimizeResult) => {
    console.log('[Strategy] User clicked strategy:', strategy.id, 'params:', {
      rsiPeriod: strategy.rsiPeriod,
      pivotLeft: strategy.pivotLeft,
      pivotRight: strategy.pivotRight,
      tpAtr: strategy.tpAtr,
      slAtr: strategy.slAtr,
    });

    // 전략 변경 중 플래그 설정 (ref는 동기적으로 업데이트됨)
    isChangingStrategyRef.current = true;

    // 마커 및 라인 즉시 클리어 (상태 업데이트 전에 시각적으로 즉시 제거)
    if (candleSeriesRef.current) {
      console.log('[Strategy Clear] Clearing markers and candle colors...');
      updateSeriesMarkers([]);
      // 캔들 색상도 원래대로 복구
      if (candles.length > 0) {
        candleSeriesRef.current.setData(candles);
        console.log('[Strategy Clear] Reset candle colors, count:', candles.length);
      }
      // TP/SL/Entry 라인도 즉시 제거
      priceLinesRef.current.forEach((line) => {
        try {
          candleSeriesRef.current?.removePriceLine(line);
        } catch {}
      });
      priceLinesRef.current = [];
      console.log('[Strategy Clear] Cleared price lines');
    }

    // Note: Backtest execution and state management is now handled by useRealtimeUpdates hook

    manuallySelectedRef.current = true;
    savedStrategyIdRef.current = strategy.id;
    localStorage.setItem('selectedStrategyId', String(strategy.id));
    localStorage.setItem('selectedStrategyTimeframe', strategy.timeframe);

    // 전략의 타임프레임으로 변경
    if (strategy.timeframe && strategy.timeframe !== timeframe) {
      console.log('[Strategy] Changing timeframe to match strategy:', strategy.timeframe);
      setTimeframe(strategy.timeframe);
    }

    setSelectedStrategy(strategy);
    console.log('[Strategy] Manually selected:', strategy.id, 'TF:', strategy.timeframe);
  }, [updateSeriesMarkers, candles, timeframe, setTimeframe, setSelectedStrategy]);

  // 차트 컴포넌트용 전략 데이터 메모이제이션 (성능 최적화)
  const chartStrategies = useMemo(() => {
    return Array.from(allStrategiesEquityCurves.entries()).map(([strategyId, equityCurve], index) => {
      const strategy = strategies.find(s => s.id === strategyId);
      if (!strategy) return null;

      const strategyType = strategy.strategy || 'rsi_div';
      const rollingSharpe = rollingSharpeData.get(strategyType) || [];

      return {
        strategyId,
        strategyName: getStrategyDisplayName(strategy),
        strategyType,
        color: getStrategyColor(index),
        equityCurve,
        rollingSharpe,
      };
    }).filter(Boolean) as any[];
  }, [allStrategiesEquityCurves, strategies, rollingSharpeData]);

  // 전략 클릭 핸들러 메모이제이션 (성능 최적화)
  const handleStrategyClickMemo = useCallback((strategyId: number) => {
    setHighlightedStrategy(strategyId === highlightedStrategy ? null : strategyId);
    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy) {
      handleStrategyChange(strategy);
    }
  }, [highlightedStrategy, strategies, handleStrategyChange]);

  // 설정 토글 핸들러
  const handleSettingsToggle = useCallback(() => {
    setIsSettingsOpen(prev => !prev);
  }, []);

  // 타임프레임 변경 핸들러
  const handleTimeframeChange = useCallback((tf: string) => {
    if (tf !== timeframe) {
      manuallySelectedRef.current = false;
      savedStrategyIdRef.current = null;
      localStorage.removeItem('selectedStrategyId');
      localStorage.removeItem('selectedStrategyTimeframe');
    }
    setTimeframe(tf);
  }, [timeframe]);

  // 거래 선택 핸들러
  const handleTradeClick = useCallback((trade: TradeResult) => {
    setSelectedTrade(prev => (prev === trade ? null : trade));
  }, []);

  // ==================== useEffects (심볼 변경 시 리셋) ====================
  // Note: loadBacktestTrades, candle loading은 이제 hooks에서 처리됨

  // 심볼 변경 시 로컬 refs 리셋
  useEffect(() => {
    lastExitAlertRef.current = null;
    lastEntryAlertRef.current = null;
    manuallySelectedRef.current = false;
    savedStrategyIdRef.current = null;
    localStorage.removeItem('selectedStrategyId');
    localStorage.removeItem('selectedStrategyTimeframe');
    console.log(`[Symbol Change] Reset refs for ${currentSymbol.id}`);
  }, [currentSymbol.id]);

  // 현재 타임프레임의 kline 가져오기
  const kline = getKline(timeframe);

  // 실시간 캔들 업데이트 (차트 시리즈에 직접 업데이트)
  useEffect(() => {
    if (!kline || isChartDisposedRef.current) return;

    const newCandleTime = kline.timestamp / 1000;
    const newCandle: CandlestickData = {
      time: newCandleTime as Time,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
    };

    // 새 캔들 시작 감지 (기존 캔들 시간과 다르면 새 캔들)
    const isNewCandle =
      lastCandleTimeRef.current > 0 &&
      newCandleTime > lastCandleTimeRef.current;

    // 캔들 확정 시 또는 새 캔들 시작 시 백테스트 재실행 (hook의 loadBacktestTrades 사용)
    if (selectedStrategy && (isNewCandle || kline.isFinal)) {
      if (isNewCandle) {
        console.log('[Candle] New candle started, refreshing backtest...');
      } else if (kline.isFinal) {
        console.log('[Candle] Candle confirmed (isFinal), refreshing backtest...');
      }
      loadBacktestTrades(selectedStrategy); // from useRealtimeUpdates hook
    }

    lastCandleTimeRef.current = newCandleTime;

    // 포지션 구간인지 확인하여 색상 적용
    let coloredCandle = newCandle;
    if (openPosition) {
      const entryTime = toSeconds(openPosition.entryTime);
      if (newCandleTime >= entryTime) {
        const isLong = openPosition.direction === 'long';
        coloredCandle = {
          ...newCandle,
          color: isLong ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          borderColor: isLong
            ? 'rgba(34, 197, 94, 0.25)'
            : 'rgba(239, 68, 68, 0.25)',
          wickColor: isLong
            ? 'rgba(34, 197, 94, 0.18)'
            : 'rgba(239, 68, 68, 0.18)',
        } as CandlestickData;
      }
    }

    // 차트 시리즈가 있으면 직접 업데이트 (색상 포함)
    if (candleSeriesRef.current) {
      try {
        candleSeriesRef.current.update(coloredCandle);
      } catch {
        // 차트가 이미 disposed된 경우 무시
      }
    }

    // Note: candles state는 useChartData hook에서 관리됨
  }, [kline, openPosition, selectedStrategy, loadBacktestTrades]);

  // 차트 초기 생성 (타임프레임 변경 또는 초기 로드 시에만)
  useEffect(() => {
    if (
      !containerRef.current ||
      candles.length === 0 ||
      !initialCandlesLoaded
    )
      return;

    // 이전 차트 제거
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch {
        // 이미 disposed된 경우 무시
      }
      chartRef.current = null;
      candleSeriesRef.current = null;
    }

    isChartDisposedRef.current = false;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 500,
      layout: {
        background: { color: '#18181b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      crosshair: {
        mode: 1,
        horzLine: {
          color: '#e4e4e7',
          width: 1,
          style: 0, // Solid
          labelBackgroundColor: '#52525b',
        },
        vertLine: {
          color: '#a1a1aa',
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: '#52525b',
        },
      },
      rightPriceScale: {
        borderColor: '#3f3f46',
        scaleMargins: {
          top: 0.1,    // 상단 10% 여백
          bottom: 0.1, // 하단 10% 여백
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#3f3f46',
        timeVisible: true,
        rightOffset: 20, // TP/SL 레이블 공간 (적당히)
        shiftVisibleRangeOnNewBar: true,
      },
      localization: {
        timeFormatter: (time: number) => formatKST(time),  // time은 이미 초 단위
      },
    });

    chartRef.current = chart;

    // 캔들 시리즈 (무채색 + 투명도)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: 'rgba(168, 168, 168, 0.4)',
      downColor: 'rgba(82, 82, 82, 0.4)',
      borderUpColor: 'rgba(200, 200, 200, 0.5)',
      borderDownColor: 'rgba(100, 100, 100, 0.5)',
      wickUpColor: 'rgba(168, 168, 168, 0.3)',
      wickDownColor: 'rgba(82, 82, 82, 0.3)',
      lastValueVisible: true, // 우측 Y축에 현재가 표시
      priceLineVisible: true, // 현재가 가로선 표시
      priceLineWidth: 1,
      priceLineColor: '#71717a',
      priceLineStyle: LineStyle.Dotted,
    });

    candleSeries.setData(candles);
    candleSeriesRef.current = candleSeries;

    // 크로스헤어 이동 시 거래 정보 표시 (툴팁)
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredTrade(null);
        setHoveredSkipped(null);
        setTooltipPos(null);
        return;
      }

      const time = param.time as number;
      // 시간 근처의 거래 찾기 (타임프레임에 따라 범위 조정)
      const tolerance =
        timeframe === '1m'
          ? 60
          : timeframe === '5m'
            ? 300
            : timeframe === '15m'
              ? 900
              : 3600;
      let found: {
        trade?: TradeResult;
        skipped?: SkippedSignal;
        type: 'entry' | 'exit' | 'skipped';
      } | null = null;

      for (const [t, data] of tradeMapRef.current) {
        if (Math.abs(t - time) < tolerance) {
          found = data;
          break;
        }
      }

      if (found) {
        if (found.skipped) {
          setHoveredSkipped(found.skipped);
          setHoveredTrade(null);
        } else if (found.trade) {
          setHoveredTrade(found.trade);
          setHoveredSkipped(null);
        }
        setTooltipPos({ x: param.point.x, y: param.point.y });
      } else {
        setHoveredTrade(null);
        setHoveredSkipped(null);
        setTooltipPos(null);
      }
    });

    // ResizeObserver로 컨테이너 크기 변화 감지 (레이아웃 변경 대응)
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current && chartRef.current) {
          const { width, height } = entry.contentRect;
          chartRef.current.applyOptions({ width, height: height || 500 });
          // 크기 변경 시 가격 스케일 재조정
          chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    // 마지막 캔들 기준으로 스크롤 (rightOffset이 적용됨)
    const lastCandleTime = candles[candles.length - 1].time as number;
    console.log(
      '[Chart] Last candle time:',
      new Date(lastCandleTime * 1000).toLocaleString('ko-KR'),
    );

    // scrollToRealTime() + fitContent로 차트 중앙 정렬
    requestAnimationFrame(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().scrollToRealTime();
        // 가격 스케일 자동 조정으로 세로 중앙 정렬
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        console.log('[Chart] Scrolled to realtime with vertical centering');
      }
    });

    return () => {
      resizeObserver.disconnect();
      isChartDisposedRef.current = true;
      try {
        chart.remove();
      } catch {
        // 이미 disposed된 경우 무시
      }
      chartRef.current = null;
      candleSeriesRef.current = null;
      priceLinesRef.current = [];
      seriesMarkersRef.current = null;
    };
  }, [timeframe, chartKey]);

  // Note: Marker generation (chart markers and candle coloring) is now handled by useMarkerGeneration hook

  // TP/SL/Entry 가로선 업데이트 (Price Line 사용 - 캔들 위에 표시)
  // 주의: ticker?.price를 의존성에서 제거 - 매 틱마다 라인 재생성 방지
  useEffect(() => {
    if (!candleSeriesRef.current || isChartDisposedRef.current) return;

    const candleSeries = candleSeriesRef.current;

    // 기존 price lines 제거
    priceLinesRef.current.forEach((line) => {
      try {
        candleSeries.removePriceLine(line);
      } catch {}
    });
    priceLinesRef.current = [];

    // openPosition이 있을 때만 라인 그리기
    if (openPosition) {
      // Entry 라인 (포지션 방향에 따른 색상)
      const isLong = openPosition.direction === 'long';
      const entryLine = candleSeries.createPriceLine({
        price: openPosition.entryPrice,
        color: isLong ? '#16a34a' : '#dc2626',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: '진입',
      });
      priceLinesRef.current.push(entryLine);

      // TP 라인 (어두운 녹색 점선)
      const tpLine = candleSeries.createPriceLine({
        price: openPosition.tp,
        color: '#16a34a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP',
      });
      priceLinesRef.current.push(tpLine);

      // SL 라인 (어두운 빨간색 점선)
      const slLine = candleSeries.createPriceLine({
        price: openPosition.sl,
        color: '#dc2626',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'SL',
      });
      priceLinesRef.current.push(slLine);
    }
  }, [openPosition?.entryTime, selectedStrategy?.id]); // 포지션 변경 또는 전략 변경 시에만 업데이트

  // 총 포지션 보유시간 계산 (모든 거래의 보유시간 합계)
  const totalHoldingTime = useMemo(
    () => calculateTotalHoldingTime(backtestTrades),
    [backtestTrades]
  );

  // 측정기간 계산 (백테스트 시작~끝)
  const measurementPeriod = useMemo(
    () => calculateMeasurementPeriod(backtestStats, equityCurve, backtestTrades),
    [backtestStats, equityCurve, backtestTrades]
  );

  // 거래 히스토리 정렬 메모이제이션 (매 렌더마다 정렬 방지)
  const sortedTrades = useMemo(() => {
    return [...backtestTrades].sort(
      (a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime()
    );
  }, [backtestTrades]);

  return (
    <div className='flex flex-col gap-4 w-full'>
      {/* 상단: 통계 헤더 (전체 너비) */}
      <StatisticsHeader
        backtestStats={backtestStats}
        selectedStrategy={selectedStrategy}
        leverage={leverage}
        onLeverageChange={setLeverage}
        measurementPeriod={measurementPeriod}
        totalHoldingTime={totalHoldingTime}
        formatDuration={formatDuration}
      />

      <div className='grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px] gap-4 min-h-[calc(100vh-180px)]'>
      {/* 좌측: 메인 차트 영역 */}
      <div className='bg-zinc-900 p-4 rounded-lg min-w-0 flex flex-col overflow-hidden'>
        {/* 1. 헤더: 연결 상태 + 설정 */}
        <ChartHeader
          isConnected={isConnected}
          nextCandleCountdown={nextCandleCountdown}
          isBacktestRunning={isBacktestRunning}
          lastBacktestTime={lastBacktestTime}
          isLoadingAllStrategies={isLoadingAllStrategies}
          selectedStrategy={selectedStrategy}
          backtestStats={backtestStats}
          getStrategyDisplayName={getStrategyDisplayName}
          timeframe={timeframe}
          soundEnabled={soundEnabled}
          isSettingsOpen={isSettingsOpen}
          onSettingsToggle={handleSettingsToggle}
        />

        {/* 설정 패널 */}
        <SettingsPanel
          show={isSettingsOpen}
          timeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          soundEnabled={soundEnabled}
          onSoundToggle={setSoundEnabled}
          soundVolume={soundVolume}
          onVolumeChange={setSoundVolume}
          playAlertSound={playAlertSound}
          playExitSound={playExitSound}
          useWalkForward={useWalkForward}
          onWalkForwardToggle={setUseWalkForward}
        />

        {/* 2. 열린 포지션 카드 */}
        <OpenPositionCard openPosition={openPosition} ticker={ticker} />

        {/* 4. 차트 */}
        {isLoading ? (
          <div className='flex-1 min-h-[400px] flex items-center justify-center'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500'></div>
          </div>
        ) : (
          <div ref={containerRef} className='w-full relative flex-1 min-h-[400px]'>
            {/* 진행 중 포지션 이모지 오버레이 */}
            {openPosition &&
              chartRef.current &&
              candleSeriesRef.current &&
              (() => {
                const entryTime = toSeconds(openPosition.entryTime);
                const isLong = openPosition.direction === 'long';
                const x = chartRef.current
                  .timeScale()
                  .timeToCoordinate(entryTime as any);
                const y = candleSeriesRef.current.priceToCoordinate(
                  openPosition.entryPrice,
                );
                if (x !== null && y !== null) {
                  return (
                    <div
                      className='absolute pointer-events-none z-40 text-2xl'
                      style={{
                        left: x - 12,
                        top: isLong ? y + 10 : y - 40,
                      }}
                    >
                      {isLong ? '🚀' : '🌧️'}
                    </div>
                  );
                }
                return null;
              })()}
            {/* 거래 툴팁 */}
            {hoveredTrade && tooltipPos && (
              <div
                className='absolute z-50 bg-zinc-800 border border-zinc-600 rounded-lg p-3 text-xs shadow-lg pointer-events-none'
                style={{
                  left: Math.min(
                    tooltipPos.x + 10,
                    (containerRef.current?.clientWidth || 400) - 200,
                  ),
                  top: Math.max(tooltipPos.y - 80, 10),
                }}
              >
                <div className='font-semibold mb-2'>
                  <span
                    className={
                      hoveredTrade.direction === 'long'
                        ? 'text-green-400'
                        : 'text-red-400'
                    }
                  >
                    {hoveredTrade.direction.toUpperCase()}
                  </span>
                  {(() => {
                    const isLong = hoveredTrade.direction === 'long';
                    const exitHigher =
                      hoveredTrade.exitPrice > hoveredTrade.entryPrice;
                    const priceWasFavorable = isLong ? exitHigher : !exitHigher;
                    const isFeeLoss =
                      priceWasFavorable && hoveredTrade.pnl <= 0;
                    if (hoveredTrade.pnl > 0) {
                      return <span className='ml-2 text-green-400'>익절</span>;
                    } else if (isFeeLoss) {
                      return (
                        <span className='ml-2 text-yellow-400'>
                          수수료 손실
                        </span>
                      );
                    } else {
                      return <span className='ml-2 text-red-400'>손절</span>;
                    }
                  })()}
                </div>
                <div className='space-y-1 text-zinc-300'>
                  <div>
                    진입:{' '}
                    {formatKST(toSeconds(hoveredTrade.entryTime))}
                  </div>
                  <div>
                    청산: {formatKST(toSeconds(hoveredTrade.exitTime))}
                  </div>
                  <div>진입가: ${hoveredTrade.entryPrice.toFixed(2)}</div>
                  <div>청산가: ${hoveredTrade.exitPrice.toFixed(2)}</div>
                  <div
                    className={
                      hoveredTrade.pnl > 0 ? 'text-green-400' : 'text-red-400'
                    }
                  >
                    PnL: {hoveredTrade.pnl > 0 ? '+' : ''}
                    {hoveredTrade.pnl.toFixed(2)} (
                    {hoveredTrade.pnlPercent.toFixed(2)}%)
                  </div>
                </div>
              </div>
            )}
            {/* 수수료 보호 신호 툴팁 */}
            {hoveredSkipped && tooltipPos && (
              <div
                className={`absolute z-50 bg-zinc-800 border rounded-lg p-3 text-xs shadow-lg pointer-events-none ${
                  hoveredSkipped.direction === 'long'
                    ? 'border-green-600'
                    : 'border-red-600'
                }`}
                style={{
                  left: Math.min(
                    tooltipPos.x + 10,
                    (containerRef.current?.clientWidth || 400) - 200,
                  ),
                  top: Math.max(tooltipPos.y - 80, 10),
                }}
              >
                <div className='font-semibold mb-2'>
                  <span
                    className={
                      hoveredSkipped.direction === 'long'
                        ? 'text-zinc-400'
                        : 'text-zinc-600'
                    }
                  >
                    {hoveredSkipped.direction === 'long' ? '▲ 롱' : '▼ 숏'}
                  </span>
                  <span className='ml-2 text-yellow-400'>수수료 보호</span>
                </div>
                <div className='space-y-1 text-zinc-300'>
                  <div>
                    시간: {formatKST(toSeconds(hoveredSkipped.time))}
                  </div>
                  <div>가격: ${hoveredSkipped.price.toFixed(2)}</div>
                  <div className='text-zinc-400 text-[10px] mt-1'>
                    수수료가 기대수익 초과하여 진입 보류
                  </div>
                  <div className='mt-1 pt-1 border-t border-zinc-700'>
                    <span className='text-yellow-400'>
                      기대: {hoveredSkipped.expectedReturn.toFixed(2)}%
                    </span>
                    <span className='text-zinc-500 mx-1'>vs</span>
                    <span className='text-red-400'>
                      비용: {hoveredSkipped.totalCost.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 최근 신호 */}
        <RecentSignalsPanel
          divergenceData={divergenceData}
          divergenceHistory={divergenceHistory}
        />

        {/* 범례 */}
        <ChartLegend
          totalTrades={backtestTrades.length}
          skippedSignalsCount={skippedSignals.length}
        />
      </div>

      {/* 우측: 전략 리스트 */}
      <div className='flex flex-col gap-2 min-w-0 h-full'>
        <div className='bg-zinc-900 p-3 rounded-lg flex-1 min-h-0 flex flex-col'>
          <h3 className='text-sm font-medium text-zinc-400 mb-2 shrink-0 flex items-center gap-2'>
            전략 목록 ({strategies.length})
            {isLoadingAllStrategies && (
              <span className='text-[10px] text-blue-400 flex items-center gap-1'>
                <span className='w-2 h-2 rounded-full bg-blue-400 animate-pulse' />
                분석중
              </span>
            )}
            <button
              onClick={async () => {
                if (refreshingStrategy === '__all__') return;
                setRefreshingStrategy('__all__');
                try {
                  await refreshAllStrategies(symbolId, timeframe);
                  refetchBacktestData(true, true);
                  refetchStrategies();
                } catch (err) {
                  console.error('전체 갱신 실패:', err);
                } finally {
                  setRefreshingStrategy(null);
                }
              }}
              disabled={refreshingStrategy === '__all__'}
              className={`ml-auto p-1 rounded transition-colors ${
                refreshingStrategy === '__all__'
                  ? 'text-blue-400'
                  : 'text-zinc-500 hover:text-blue-400 hover:bg-zinc-700'
              }`}
              title='전체 전략 캐시 재계산'
            >
              <RefreshCw size={13} className={refreshingStrategy === '__all__' ? 'animate-spin' : ''} />
            </button>
          </h3>

          {/* 최적화 비교 카드 */}
          {proposeResult && (
            <div className='mb-2 shrink-0'>
              <OptimizeComparisonCard
                result={proposeResult}
                isApplying={isApplying}
                onApprove={approveOptimize}
                onReject={rejectOptimize}
              />
            </div>
          )}
          {optimizeError && (
            <div className='mb-2 px-2 py-1 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-400 shrink-0'>
              {optimizeError}
            </div>
          )}
          {applyResult?.success && !proposeResult && (
            <div className='mb-2 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-[10px] text-green-400 shrink-0'>
              {applyResult.strategy} 최적화 적용 완료
            </div>
          )}

          <div className='flex-1 overflow-y-auto space-y-1 min-h-0 custom-scrollbar'>
            {/* 스켈레톤 로딩 표시 */}
            {isLoadingAllStrategies && strategies.length === 0 && (
              <>
                {[...Array(8)].map((_, i) => (
                  <div key={`skeleton-${i}`} className='w-full px-2 py-1.5 bg-zinc-800 rounded animate-pulse'>
                    <div className='flex justify-between items-center'>
                      <div className='h-3 bg-zinc-700 rounded w-24' />
                      <div className='h-3 bg-zinc-700 rounded w-12' />
                    </div>
                    <div className='flex items-center gap-1 mt-1.5'>
                      <div className='h-2.5 bg-zinc-700 rounded w-8' />
                      <div className='h-2.5 bg-zinc-700 rounded w-10' />
                      <div className='h-2.5 bg-zinc-700 rounded w-6' />
                    </div>
                  </div>
                ))}
              </>
            )}
            {/* 평균 롤링 샤프 순으로 정렬 (로딩 완료 후) */}
            {[...strategies].sort((a, b) => {
              if (rollingSharpeData.size > 0) {
                const aData = rollingSharpeData.get(a.strategy || 'rsi_div');
                const bData = rollingSharpeData.get(b.strategy || 'rsi_div');
                const aAvg = aData && aData.length > 0 ? aData.reduce((s, d) => s + d.sharpe, 0) / aData.length : -Infinity;
                const bAvg = bData && bData.length > 0 ? bData.reduce((s, d) => s + d.sharpe, 0) / bData.length : -Infinity;
                return bAvg - aAvg; // 내림차순
              }
              return 0;
            }).slice(0, 30).map((strategy) => {
              const isRollingResult = strategy.id < 0;
              const displayName = getStrategyDisplayName(strategy);
              const isSelected = selectedStrategy?.id === strategy.id;
              const strategyType = strategy.strategy || 'rsi_div';
              // 평균 롤링 샤프 계산 (12주 전체 윈도우 평균)
              const dailySharpeArray = rollingSharpeData.get(strategyType);
              const avgSharpe = dailySharpeArray && dailySharpeArray.length > 0
                ? dailySharpeArray.reduce((sum, d) => sum + d.sharpe, 0) / dailySharpeArray.length
                : null;

              // 최적화 상태에서 TP/SL + 마지막 최적화 시각 가져오기
              const optStatus = optimizeStatuses.find(s => s.strategy === strategyType);
              const tpAtr = optStatus?.currentParams?.tp_atr;
              const slAtr = optStatus?.currentParams?.sl_atr;
              const lastOpt = optStatus?.lastOptimizedAt;
              const lastOptRelative = lastOpt ? (() => {
                const diff = Date.now() - new Date(lastOpt).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 60) return `${mins}m ago`;
                const hours = Math.floor(mins / 60);
                if (hours < 24) return `${hours}h ago`;
                return `${Math.floor(hours / 24)}d ago`;
              })() : null;

              return (
                <div
                  key={strategy.id}
                  className={`w-full px-3 py-2.5 text-left rounded-lg transition-colors relative ${
                    isSelected
                      ? 'bg-blue-600/30 border border-blue-500/50'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}
                >
                  {/* 우측 상단 버튼들 */}
                  <div className='absolute top-1.5 right-1.5 flex items-center gap-1 z-10'>
                    {/* 최적화 버튼 */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        startOptimize(strategyType);
                      }}
                      disabled={!!optimizingStrategy}
                      className={`p-0.5 rounded transition-colors ${
                        optimizingStrategy === strategyType
                          ? 'text-yellow-400 animate-pulse'
                          : optimizingStrategy
                            ? 'text-zinc-600 cursor-not-allowed'
                            : 'text-zinc-500 hover:text-yellow-400 hover:bg-zinc-600/50'
                      }`}
                      title='TP/SL 최적화'
                    >
                      <Zap size={13} />
                    </button>
                    {/* 새로고침 버튼 */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (refreshingStrategy === strategyType) return;
                        setRefreshingStrategy(strategyType);
                        try {
                          await refreshSingleStrategy(symbolId, timeframe, strategyType);
                          refetchBacktestData(true);
                        } catch (err) {
                          console.error('갱신 실패:', err);
                        } finally {
                          setRefreshingStrategy(null);
                        }
                      }}
                      disabled={refreshingStrategy === strategyType}
                      className={`p-0.5 rounded transition-colors ${
                        refreshingStrategy === strategyType
                          ? 'text-blue-400 animate-spin'
                          : 'text-zinc-500 hover:text-blue-400 hover:bg-zinc-600/50'
                      }`}
                      title='전략 캐시 갱신'
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>

                  <button
                    onClick={() => handleStrategyChange(strategy)}
                    className='w-full text-left'
                  >
                    {/* 1행: 전략명 + 포지션 + SR */}
                    <div className='flex justify-between items-center mb-1.5'>
                      <div className='flex items-center gap-1.5 min-w-0'>
                        <span className='text-zinc-200 text-[13px] font-semibold truncate'>
                          {displayName}
                        </span>
                        {(() => {
                          const position = isSelected
                            ? openPosition
                            : allOpenPositions.get(strategyType);
                          if (!position) return null;
                          return (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                              position.direction === 'long'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                              {position.direction === 'long' ? '롱' : '숏'}
                            </span>
                          );
                        })()}
                      </div>
                      {avgSharpe !== null && (
                        <span className={`text-[13px] font-bold shrink-0 ${
                          avgSharpe >= 2 ? 'text-green-400' :
                          avgSharpe >= 0 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          Avg SR {avgSharpe.toFixed(1)}
                        </span>
                      )}
                    </div>

                    {/* 2행: WR | PnL | 거래수 + 미니차트 */}
                    <div className='flex items-center justify-between mb-1'>
                      <div className='flex items-center gap-1.5'>
                        {(() => {
                          const stats = allStrategyStats.get(strategyType);
                          if (!stats || stats.totalTrades === 0) {
                            return <span className='text-zinc-600 text-[10px]'>—</span>;
                          }
                          return (
                            <>
                              <span className={`text-[11px] font-medium ${stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                {stats.winRate.toFixed(0)}%
                              </span>
                              <span className='text-zinc-600 text-[10px]'>|</span>
                              <span className={`text-[11px] font-medium ${stats.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {stats.totalPnlPercent >= 0 ? '+' : ''}{stats.totalPnlPercent.toFixed(1)}%
                              </span>
                              <span className='text-zinc-600 text-[10px]'>|</span>
                              <span className='text-zinc-400 text-[11px]'>
                                {stats.totalTrades}회
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      <div className='w-12 shrink-0'>
                        <StrategyMiniChart equityCurve={allStrategiesEquityCurves.get(strategy.id) || []} />
                      </div>
                    </div>

                    {/* 3행: TP/SL + 마지막 최적화 시각 */}
                    <div className='flex items-center gap-1.5 text-[10px]'>
                      {tpAtr != null && slAtr != null && (
                        <span className='text-zinc-500'>
                          TP:{tpAtr} SL:{slAtr}
                        </span>
                      )}
                      {lastOptRelative && (
                        <span className='text-zinc-600'>
                          {lastOptRelative}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* 전략 비교 차트 탭 */}
      <div className="bg-zinc-900 rounded-lg overflow-hidden">
        {/* 탭 헤더 */}
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

        {/* 탭 콘텐츠 - 선택된 탭만 렌더링 */}
        {strategyChartTab === 'equity' && (
          (isLoadingAllStrategies || isLoadingEquityCurves) ? (
            <div className="p-4 animate-pulse">
              <div className="w-full h-[400px] bg-zinc-800 rounded flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <div className="text-sm text-zinc-400">차트 로딩 중...</div>
                </div>
              </div>
            </div>
          ) : allStrategiesEquityCurves.size > 0 ? (
            <MultiStrategyEquityChart
              strategies={chartStrategies}
              highlightedStrategyId={highlightedStrategy}
              leverage={leverage}
              onStrategyClick={handleStrategyClickMemo}
            />
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              전략 데이터가 없습니다
            </div>
          )
        )}

        {strategyChartTab === 'sharpe' && (
          (isLoadingAllStrategies || isLoadingEquityCurves) ? (
            <div className="p-4 animate-pulse">
              <div className="w-full h-[300px] bg-zinc-800 rounded flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <div className="text-sm text-zinc-400">샤프 계산 중...</div>
                </div>
              </div>
            </div>
          ) : allStrategiesEquityCurves.size > 0 ? (
            <WeeklySharpeTimeline
              strategies={chartStrategies}
              highlightedStrategyId={highlightedStrategy}
              leverage={leverage}
              onStrategyClick={handleStrategyClickMemo}
            />
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              전략 데이터가 없습니다
            </div>
          )
        )}

        {strategyChartTab === 'avg-sharpe' && (
          (isLoadingAllStrategies || isLoadingEquityCurves) ? (
            <div className="p-4 animate-pulse">
              <div className="w-full h-[300px] bg-zinc-800 rounded flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <div className="text-sm text-zinc-400">평균 샤프 계산 중...</div>
                </div>
              </div>
            </div>
          ) : allStrategiesEquityCurves.size > 0 ? (
            <AvgSharpeChart
              strategies={chartStrategies}
              highlightedStrategyId={highlightedStrategy}
              onStrategyClick={handleStrategyClickMemo}
            />
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              전략 데이터가 없습니다
            </div>
          )
        )}

        {/* 탭 미선택시 안내 */}
        {!strategyChartTab && (
          <div className="p-4 text-center text-zinc-600 text-xs">
            위 탭을 클릭하여 전략 비교 차트를 확인하세요
          </div>
        )}
      </div>

      {/* 하단: 자산곡선 + 거래 히스토리 */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-4'>
        {/* 자산 곡선 (레버리지 적용) */}
        <div className='bg-zinc-900 p-4 rounded-lg'>
          <div className='flex justify-between items-center mb-2'>
            <h3 className='text-sm font-medium text-zinc-400'>자산 곡선</h3>
            {isBacktestRunning ? (
              <div className='w-16 h-4 bg-zinc-700 rounded animate-pulse' />
            ) : equityCurve.length > 0 ? (
              (() => {
                const initialCapital = 1000;
                const rawFinalEquity =
                  equityCurve[equityCurve.length - 1]?.equity || initialCapital;
                const rawPnl = rawFinalEquity - initialCapital;
                const leveragedPnl = rawPnl * leverage;
                const finalEquity = initialCapital + leveragedPnl;
                const pnlPercent = (leveragedPnl / initialCapital) * 100;
                return (
                  <span
                    className={`text-xs font-medium ${leveragedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    ${finalEquity.toFixed(0)} ({pnlPercent >= 0 ? '+' : ''}
                    {pnlPercent.toFixed(1)}%)
                  </span>
                );
              })()
            ) : null}
          </div>
          {/* SVG 자산 곡선 */}
          {isBacktestRunning ? (
            <div className='h-24 w-full bg-zinc-800 rounded animate-pulse' />
          ) : equityCurve.length > 0 ? (
            <div className='h-24 w-full relative'>
              {/* X축 시간 레이블 */}
              {totalHoldingTime > 0 && (
                <div className='absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-zinc-600 px-1'>
                  {(() => {
                    const hours = totalHoldingTime / (1000 * 60 * 60);
                    const startTs = equityCurve[0]?.timestamp;
                    const endTs = equityCurve[equityCurve.length - 1]?.timestamp;
                    const startTime = typeof startTs === 'number' ? startTs : Date.now() - totalHoldingTime;
                    const endTime = typeof endTs === 'number' ? endTs : Date.now();

                    // 시간 포맷 함수
                    const formatTime = (ts: number) => {
                      const d = new Date(ts);
                      if (hours < 24) {
                        return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                      } else {
                        return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
                      }
                    };

                    // 중간 시간 계산
                    const midTime = startTime + (endTime - startTime) / 2;

                    return (
                      <>
                        <span>{formatTime(startTime)}</span>
                        <span>{formatTime(midTime)}</span>
                        <span>{formatTime(endTime)}</span>
                      </>
                    );
                  })()}
                </div>
              )}
              <svg
                viewBox='0 0 105 40'
                className='w-full h-[calc(100%-12px)]'
                preserveAspectRatio='none'
              >
                {/* 기준선 */}
                <line
                  x1='0'
                  y1='20'
                  x2='100'
                  y2='20'
                  stroke='#52525b'
                  strokeWidth='0.5'
                  strokeDasharray='2,2'
                />
                {/* 곡선 (레버리지 적용) */}
                {equityCurve.length > 1 &&
                  (() => {
                    const initialCapital = 1000;
                    // 레버리지 적용된 자산 값 계산
                    const leveragedValues = equityCurve.map((p) => {
                      const pnl = p.equity - initialCapital;
                      return initialCapital + (pnl * leverage);
                    });
                    const dataMin = Math.min(...leveragedValues);
                    const dataMax = Math.max(...leveragedValues);
                    // 실제 데이터 범위에 5% 패딩만 추가 (더 가파르게 보임)
                    const padding = (dataMax - dataMin) * 0.05 || 1;
                    const min = dataMin - padding;
                    const max = dataMax + padding;
                    const range = max - min || 1;

                    const points = leveragedValues
                      .map((val, i) => {
                        const x = (i / (leveragedValues.length - 1)) * 100;
                        const y = 40 - ((val - min) / range) * 40;
                        return `${x},${y}`;
                      })
                      .join(' ');

                    const finalEquity = leveragedValues[leveragedValues.length - 1] || initialCapital;
                    const isProfit = finalEquity >= initialCapital;

                    // 마지막 점 좌표
                    const lastX = 100;
                    const lastY = 40 - ((finalEquity - min) / range) * 40;

                    return (
                      <>
                        {/* 글로우 필터 및 그라디언트 정의 */}
                        <defs>
                          <filter
                            id='glow'
                            x='-50%'
                            y='-50%'
                            width='200%'
                            height='200%'
                          >
                            <feGaussianBlur
                              stdDeviation='2'
                              result='coloredBlur'
                            />
                            <feMerge>
                              <feMergeNode in='coloredBlur' />
                              <feMergeNode in='SourceGraphic' />
                            </feMerge>
                          </filter>
                          <linearGradient
                            id='areaGradientGreen'
                            x1='0'
                            y1='0'
                            x2='0'
                            y2='1'
                          >
                            <stop
                              offset='0%'
                              stopColor='rgba(34, 197, 94, 0.3)'
                            />
                            <stop
                              offset='100%'
                              stopColor='rgba(34, 197, 94, 0)'
                            />
                          </linearGradient>
                          <linearGradient
                            id='areaGradientRed'
                            x1='0'
                            y1='0'
                            x2='0'
                            y2='1'
                          >
                            <stop
                              offset='0%'
                              stopColor='rgba(239, 68, 68, 0.3)'
                            />
                            <stop
                              offset='100%'
                              stopColor='rgba(239, 68, 68, 0)'
                            />
                          </linearGradient>
                        </defs>
                        <polyline
                          fill='none'
                          stroke={isProfit ? '#22c55e' : '#ef4444'}
                          strokeWidth='1'
                          points={points}
                        />
                        {/* 영역 채우기 (그라디언트) */}
                        <polygon
                          fill={
                            isProfit
                              ? 'url(#areaGradientGreen)'
                              : 'url(#areaGradientRed)'
                          }
                          points={`0,40 ${points} 100,40`}
                        />
                        {/* 끝점 반짝이는 글로우 */}
                        <circle
                          cx={lastX}
                          cy={lastY}
                          r='2'
                          fill={isProfit ? '#22c55e' : '#ef4444'}
                          filter='url(#glow)'
                          className='animate-pulse'
                        />
                      </>
                    );
                  })()}
              </svg>
            </div>
          ) : (
            <div className='h-24 w-full flex items-center justify-center text-zinc-600 text-xs'>
              전략을 선택하세요
            </div>
          )}
        </div>

        {/* 예상 자산 곡선 */}
        <div className='bg-zinc-900 p-4 rounded-lg'>
          <div className='flex justify-between items-center mb-2'>
            <h3 className='text-sm font-medium text-zinc-400'>예상 자산 곡선</h3>
            {isBacktestRunning ? (
              <div className='w-12 h-3 bg-zinc-700 rounded animate-pulse' />
            ) : (
              <span className='text-[10px] text-zinc-600'>30일 예측</span>
            )}
          </div>
          {isBacktestRunning ? (
            <div className='h-24 w-full bg-zinc-800 rounded animate-pulse' />
          ) : equityCurve.length > 1 && totalHoldingTime > 0 && backtestStats ? (
            <>
            {/* X축 기간 레이블 */}
            <div className='h-24 w-full relative'>
              <div className='absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-zinc-600 px-1'>
                {(() => {
                  const hoursTraded = totalHoldingTime / (1000 * 60 * 60);
                  const endTs = equityCurve[equityCurve.length - 1]?.timestamp;
                  const currentDate = typeof endTs === 'number' ? new Date(endTs) : new Date();
                  const futureDate = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                  const midDate = new Date(currentDate.getTime() + 15 * 24 * 60 * 60 * 1000);

                  const formatDate = (d: Date) => {
                    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
                  };

                  // 시작점 레이블 (거래 시작일 또는 기간)
                  const startTs = equityCurve[0]?.timestamp;
                  const startDate = typeof startTs === 'number' ? new Date(startTs) : new Date(Date.now() - totalHoldingTime);
                  const startLabel = hoursTraded < 24
                    ? startDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                    : formatDate(startDate);

                  return (
                    <>
                      <span>{startLabel}</span>
                      <span className='text-zinc-500'>현재</span>
                      <span>{formatDate(midDate)}</span>
                      <span>{formatDate(futureDate)}</span>
                    </>
                  );
                })()}
              </div>
              <svg
                viewBox='0 0 105 44'
                className='w-full h-[calc(100%-12px)]'
                preserveAspectRatio='none'
              >
                {(() => {
                  const initialCapital = 1000;
                  const hoursTraded = totalHoldingTime / (1000 * 60 * 60);
                  const monthlyHours = 30 * 24;

                  // 현재 자산 곡선 데이터 (레버리지 적용)
                  const currentValues = equityCurve.map(p => {
                    const pnlFromStart = p.equity - initialCapital;
                    return initialCapital + (pnlFromStart * leverage);
                  });
                  const finalEquity = currentValues[currentValues.length - 1] || initialCapital;

                  // 단순 선형 계산: 월간 예상 수익률
                  const leveragedPnlPercent = backtestStats.totalPnlPercent * leverage;
                  const monthlyProjectionPercent = leveragedPnlPercent * (monthlyHours / hoursTraded);
                  // 월간 예상 최종 자산 (선형)
                  const targetFutureEquity = finalEquity * (1 + monthlyProjectionPercent / 100);
                  // 포인트당 증가량 (선형 보간)
                  const totalGain = targetFutureEquity - finalEquity;

                  // 실제 시간 비율 계산 (현재 / 30일)
                  const totalHours = hoursTraded + monthlyHours;
                  const currentRatio = Math.max(hoursTraded / totalHours, 0.08); // 최소 8% 보장 (보이게)
                  const currentWidth = currentRatio * 100; // X좌표 비율

                  // 미래 예측 포인트 수 (30일을 세분화)
                  const futurePointsCount = 50;

                  // MDD 기반 (실제 최대 손실폭)
                  const mdd = Math.abs(backtestStats.maxDrawdown) / 100;

                  // seeded random
                  const seed = Math.floor(finalEquity * 100) % 1000;
                  const seededRandom = (i: number) => {
                    const x = Math.sin(seed + i * 12.9898) * 43758.5453;
                    return x - Math.floor(x);
                  };

                  // 엘리어트 파동 스타일 시뮬레이션 (누적 방식 + 큰 변동)
                  // 현재 자산에서 시작해서 파동 패턴으로 목표까지 도달
                  const futureValues: number[] = [finalEquity];
                  let equity = finalEquity;

                  // 30일을 여러 사이클로 분할
                  const cycleLength = Math.floor(futurePointsCount / 5); // 5개 구간 (더 길게)

                  // 목표 수익률을 포인트당 기본 증가로 변환
                  const avgGainPerPoint = totalGain / futurePointsCount;

                  for (let i = 1; i <= futurePointsCount; i++) {
                    const cyclePhase = Math.floor((i - 1) / cycleLength) % 5;
                    const posInCycle = ((i - 1) % cycleLength) / cycleLength;

                    // 랜덤 노이즈 (더 큰 변동)
                    const noise = (seededRandom(i) - 0.5) * 0.03;

                    // 기본 증가량
                    let gain = avgGainPerPoint;

                    // 각 페이즈별 변동 (더 극적으로)
                    switch (cyclePhase) {
                      case 0: // Wave 1-3: 강한 상승 구간
                        // 사인파 패턴으로 자연스러운 상승
                        const wave1 = Math.sin(posInCycle * Math.PI) * 0.5 + 0.5;
                        gain = avgGainPerPoint * (2 + wave1) + noise * finalEquity;
                        break;
                      case 1: // Wave 2: 조정 (되돌림)
                        // 하락 후 약간 회복
                        const wave2 = Math.cos(posInCycle * Math.PI);
                        gain = avgGainPerPoint * (-0.5 + wave2 * 0.3) + noise * finalEquity;
                        break;
                      case 2: // Wave 3: 가장 강한 상승
                        const wave3 = Math.sin(posInCycle * Math.PI * 0.5);
                        gain = avgGainPerPoint * (3 + wave3 * 2) + noise * finalEquity;
                        break;
                      case 3: // Wave 4: MDD 드로다운 구간
                        // 연속 손절 시뮬레이션
                        if (posInCycle < 0.6) {
                          // 급락
                          gain = -Math.abs(avgGainPerPoint) * (2 + mdd * 5) + noise * finalEquity;
                        } else {
                          // 회복 시작
                          gain = avgGainPerPoint * 1.5 + noise * finalEquity;
                        }
                        break;
                      case 4: // Wave 5 + ABC: 마무리
                        // 상승 후 횡보
                        const wave5 = Math.sin((posInCycle - 0.5) * Math.PI * 2);
                        gain = avgGainPerPoint * (1 + wave5 * 0.8) + noise * finalEquity;
                        break;
                      default:
                        gain = avgGainPerPoint + noise * finalEquity;
                    }

                    equity = equity + gain;
                    // 최소값 보장 (0 이하 방지)
                    equity = Math.max(equity, finalEquity * 0.5);
                    futureValues.push(equity);
                  }

                  // 마지막 값을 목표값에 가깝게 조정 (부드럽게)
                  const lastIdx = futureValues.length - 1;
                  const diff = targetFutureEquity - futureValues[lastIdx];
                  // 마지막 30% 구간에서 점진적으로 목표에 수렴
                  const adjustStart = Math.floor(lastIdx * 0.7);
                  for (let j = adjustStart; j <= lastIdx; j++) {
                    const progress = (j - adjustStart) / (lastIdx - adjustStart);
                    futureValues[j] += diff * progress * 0.5;
                  }

                  // 전체 값 합쳐서 통합 스케일 계산 (부드러운 J커브)
                  const allValues = [...currentValues, ...futureValues].filter(v => Number.isFinite(v));
                  if (allValues.length === 0) return null;
                  const globalMin = Math.min(...allValues);
                  const globalMax = Math.max(...allValues);
                  const padding = (globalMax - globalMin) * 0.1 || 1;
                  const rangeMin = globalMin - padding;
                  const rangeMax = globalMax + padding;
                  const range = rangeMax - rangeMin || 1;

                  // 통합 Y좌표 계산 함수
                  const getY = (val: number) => 40 - ((val - rangeMin) / range) * 36;

                  // 현재 곡선 포인트
                  const currentPoints = currentValues
                    .map((val, i) => {
                      const x = (i / (currentValues.length - 1)) * currentWidth;
                      return `${x},${getY(val)}`;
                    })
                    .join(' ');

                  // 미래 곡선 포인트 (현재 끝에서 시작)
                  const futurePointsStr = futureValues
                    .map((val, i) => {
                      const x = currentWidth + (i / futurePointsCount) * (100 - currentWidth);
                      return `${x},${getY(val)}`;
                    })
                    .join(' ');

                  const isProfit = finalEquity >= initialCapital;
                  const junctionY = Number.isFinite(getY(finalEquity)) ? getY(finalEquity) : 20;
                  const futureLastVal = futureValues[futureValues.length - 1];
                  const futureLastY = Number.isFinite(futureLastVal) ? getY(futureLastVal) : 20;

                  return (
                    <>
                      <defs>
                        <linearGradient id='futureGradient' x1='0' y1='0' x2='0' y2='1'>
                          <stop offset='0%' stopColor='rgba(161, 161, 170, 0.15)' />
                          <stop offset='100%' stopColor='rgba(161, 161, 170, 0)' />
                        </linearGradient>
                        <linearGradient id='currentGradientGreen' x1='0' y1='0' x2='0' y2='1'>
                          <stop offset='0%' stopColor='rgba(34, 197, 94, 0.2)' />
                          <stop offset='100%' stopColor='rgba(34, 197, 94, 0)' />
                        </linearGradient>
                        <linearGradient id='currentGradientRed' x1='0' y1='0' x2='0' y2='1'>
                          <stop offset='0%' stopColor='rgba(239, 68, 68, 0.2)' />
                          <stop offset='100%' stopColor='rgba(239, 68, 68, 0)' />
                        </linearGradient>
                      </defs>
                      {/* 현재/미래 구분선 */}
                      <line
                        x1={currentWidth}
                        y1='2'
                        x2={currentWidth}
                        y2='42'
                        stroke='#3f3f46'
                        strokeWidth='0.5'
                        strokeDasharray='2,2'
                      />
                      {/* 현재 영역 채우기 */}
                      <polygon
                        fill={isProfit ? 'url(#currentGradientGreen)' : 'url(#currentGradientRed)'}
                        points={`0,40 ${currentPoints} ${currentWidth},40`}
                      />
                      {/* 현재 자산 곡선 (실선) */}
                      <polyline
                        fill='none'
                        stroke={isProfit ? '#22c55e' : '#ef4444'}
                        strokeWidth='1.5'
                        points={currentPoints}
                      />
                      {/* 미래 영역 채우기 */}
                      <polygon
                        fill='url(#futureGradient)'
                        points={`${currentWidth},40 ${futurePointsStr} 100,40`}
                      />
                      {/* 미래 예측 곡선 (점선) - 현재 끝점에서 자연스럽게 연결 */}
                      <polyline
                        fill='none'
                        stroke='#a1a1aa'
                        strokeWidth='1'
                        strokeDasharray='3,2'
                        points={futurePointsStr}
                      />
                      {/* 연결점 (현재-미래 경계) */}
                      <circle
                        cx={currentWidth}
                        cy={junctionY}
                        r='2.5'
                        fill={isProfit ? '#22c55e' : '#ef4444'}
                      />
                      {/* 미래 끝점 (점선 원) */}
                      <circle
                        cx='100'
                        cy={futureLastY}
                        r='2'
                        fill='#27272a'
                        stroke='#a1a1aa'
                        strokeWidth='1'
                      />
                    </>
                  );
                })()}
              </svg>
            </div>
            {/* 예상 수익 표시 (레버리지 적용, 단순 선형 계산) */}
            {(() => {
              const initialCapital = 1000;
              const hoursTraded = totalHoldingTime / (1000 * 60 * 60);
              const monthlyHours = 30 * 24;

              // 단순 선형 계산: 현재 수익률 × (30일 / 거래기간)
              const leveragedPnlPercent = backtestStats.totalPnlPercent * leverage;
              const monthlyProjection = leveragedPnlPercent * (monthlyHours / hoursTraded);

              const rawFinalEquity = equityCurve[equityCurve.length - 1]?.equity || initialCapital;
              const pnlFromStart = rawFinalEquity - initialCapital;
              const finalEquity = initialCapital + (pnlFromStart * leverage);
              const futureEquity = finalEquity * (1 + monthlyProjection / 100);

              return (
                <div className='mt-2 flex flex-col gap-1'>
                  <div className='flex justify-between items-center text-[10px]'>
                    <span className='text-zinc-500'>
                      ${finalEquity.toFixed(0)} → ${futureEquity.toFixed(0)}
                    </span>
                    <span className={`font-medium ${monthlyProjection >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {monthlyProjection >= 0 ? '+' : ''}{monthlyProjection.toFixed(1)}%
                    </span>
                  </div>
                  <div className='text-[9px] text-zinc-600'>
                    {leveragedPnlPercent >= 0 ? '+' : ''}{leveragedPnlPercent.toFixed(2)}% × {(monthlyHours / hoursTraded).toFixed(1)}배
                  </div>
                </div>
              );
            })()}
            </>
          ) : (
            <div className='h-24 w-full flex items-center justify-center text-zinc-600 text-xs'>
              전략을 선택하세요
            </div>
          )}
        </div>

        {/* 거래 히스토리 */}
        <div className='bg-zinc-900 p-4 rounded-lg'>
          <h3 className='text-sm font-medium text-zinc-400 mb-3'>
            거래 히스토리 {isBacktestRunning ? '' : `(${backtestTrades.length})`}
          </h3>
          <div className='max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar'>
            {isBacktestRunning ? (
              <div className='space-y-2'>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className='flex items-center justify-between p-2 bg-zinc-800 rounded'>
                    <div className='flex items-center gap-2'>
                      <div className='w-6 h-5 bg-zinc-700 rounded animate-pulse' />
                      <div className='flex flex-col gap-1'>
                        <div className='w-24 h-3 bg-zinc-700 rounded animate-pulse' />
                        <div className='w-12 h-2 bg-zinc-700 rounded animate-pulse' />
                      </div>
                    </div>
                    <div className='w-12 h-4 bg-zinc-700 rounded animate-pulse' />
                  </div>
                ))}
              </div>
            ) : sortedTrades.length > 0 ? (
              sortedTrades.map((trade, idx) => {
                  const isWin = trade.pnl > 0;
                  const isSelected =
                    selectedTrade?.entryTime === trade.entryTime;
                  const pnlPercent =
                    ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) *
                    100 *
                    (trade.direction === 'long' ? 1 : -1);
                  const entryDate = new Date(trade.entryTime + 'Z');
                  const exitDate = new Date(trade.exitTime + 'Z');
                  const durationMs = exitDate.getTime() - entryDate.getTime();
                  const durationHours = Math.floor(
                    durationMs / (1000 * 60 * 60),
                  );
                  const durationMins = Math.floor(
                    (durationMs % (1000 * 60 * 60)) / (1000 * 60),
                  );
                  const durationStr =
                    durationHours > 0
                      ? `${durationHours}h ${durationMins}m`
                      : `${durationMins}m`;
                  const formatDate = (d: Date) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const h = String(d.getHours()).padStart(2, '0');
                    const min = String(d.getMinutes()).padStart(2, '0');
                    return `${y}-${m}-${day} ${h}:${min}`;
                  };
                  return (
                    <div
                      key={idx}
                      onClick={() => handleTradeClick(trade)}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-zinc-700'
                          : 'bg-zinc-800 hover:bg-zinc-750'
                      }`}
                    >
                      <div className='flex items-center gap-2'>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            trade.direction === 'long'
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-red-900/50 text-red-400'
                          }`}
                        >
                          {trade.direction === 'long' ? 'L' : 'S'}
                        </span>
                        <div className='flex flex-col'>
                          <span className='text-xs text-zinc-400'>
                            {formatDate(exitDate)}
                          </span>
                          <span className='text-[10px] text-zinc-500'>
                            {durationStr}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium ${isWin ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {isWin ? '+' : ''}
                        {pnlPercent.toFixed(2)}%
                      </span>
                    </div>
                  );
                })
            ) : (
              <div className='text-center text-zinc-500 text-xs py-4'>
                거래 내역이 없습니다
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// React.memo 적용: RealtimeChart는 props가 없고 Context에서 데이터를 가져오므로
// React.memo는 효과가 제한적입니다. Context 값 변경은 여전히 리렌더를 유발합니다.
export default React.memo(RealtimeChart);
