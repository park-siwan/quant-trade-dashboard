'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  CandlestickData,
  SeriesMarker,
  Time,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts';
import { useChartInit } from './hooks/useChartInit';
import { computeRSI } from '@/lib/chart/strategyIndicators';
import { TradeHistoryPanel } from './ui/TradeHistoryPanel';
import { useSocket, tickerSharedRef } from '@/contexts/SocketContext';
import { isConnectedAtom, divergenceDataAtom, divergenceHistoryAtom, wakeUpCounterAtom, tradingStatusAtom, indicatorSnapshotAtom } from '@/stores/socketAtoms';
import {
  SavedOptimizeResult,
  RollingParamResult,
  runBacktest,
  TradeResult,
  SkippedSignal,
  refreshSingleStrategy,
  refreshAllStrategies,
  getCachedStrategyDisplayName,
  StrategyType,
} from '@/lib/backtest-api';
import { RefreshCw, Zap } from 'lucide-react';
import { convertApiParams, getDefaultParams } from '@/lib/strategy-params';
import { ChartLegend } from './ui/ChartLegend';
import { OpenPositionCard } from './ui/OpenPositionCard';
import { RecentSignalsPanel } from './ui/RecentSignalsPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { useStrategyOptimize } from '@/hooks/useStrategyOptimize';
import { StatisticsHeader, BalanceHeader } from './ui/StatisticsHeader';
import { SignalThresholdMonitor } from './ui/SignalThresholdMonitor';
import { StrategyListPanel } from './ui/StrategyListPanel';
import { StrategyComparisonPanel } from './ui/StrategyComparisonPanel';
import { symbolAtom, symbolIdAtom } from '@/stores/symbolAtom';
import { toSeconds, formatKST } from '@/lib/utils/timestamp';
import { usePerformanceMonitor } from '@/lib/performance-monitor';
import {
  timeframeAtom,
  selectedStrategyAtom,
  selectedTradeAtom,
  highlightedStrategyAtom,
  hoveredTradeAtom,
  hoveredSkippedAtom,
  tooltipPosAtom,
  isSettingsOpenAtom,
  leverageAtom,
  nextCandleCountdownAtom,
} from '@/stores/strategyAtoms';

// ✅ Custom Hooks
import { useChartData } from './hooks/useChartData';
import { useStrategyList } from './hooks/useStrategyList';
import { useBacktestRunner } from './hooks/useBacktestRunner';
import { useRealtimeUpdates } from './hooks/useRealtimeUpdates';
import { useSoundAlerts } from './hooks/useSoundAlerts';
import { usePositionAlerts } from './hooks/usePositionAlerts';
import { useMarkerGeneration } from './hooks/useMarkerGeneration';
// import { useWhyDidYouUpdate } from './hooks/useWhyDidYouUpdate'; // 비활성화

const getOrchestratorDefaults = () => getDefaultParams('orchestrator');

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


function StrategyDashboard() {
  // Performance monitoring
  usePerformanceMonitor('RealtimeChart');

  // 🔍 리렌더 원인 추적 (디버깅용) - 비활성화
  // const renderCountRef = useRef(0);
  // renderCountRef.current += 1;
  // useEffect(() => {
  //   console.log(`🔄 [RealtimeChart] Render #${renderCountRef.current}`);
  // });

  const containerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const zscoreContainerRef = useRef<HTMLDivElement>(null);
  // 🎯 핵심 최적화: Context 분리로 불필요한 리렌더 방지
  // - tickerSharedRef: ticker는 re-render 없이 ref로만 접근 (500ms 절약)
  // - KlineContext: kline 데이터만 구독
  // - SocketContext: stable + infrequent data (market data 분리로 3s 절약)
  const { subscribeKline, getKline } = useSocket();
  const isConnected = useAtomValue(isConnectedAtom);
  const divergenceData = useAtomValue(divergenceDataAtom);
  const divergenceHistory = useAtomValue(divergenceHistoryAtom);
  const wakeUpCounter = useAtomValue(wakeUpCounterAtom);
  const tradingStatus = useAtomValue(tradingStatusAtom);
  const indicatorSnapshot = useAtomValue(indicatorSnapshotAtom);

  // ticker 접근용 프록시 객체 (tickerSharedRef를 통해 최신 값 반환, re-render 없음)
  const ticker = useMemo(() => ({
    get price() { return tickerSharedRef.current?.price; },
    get timestamp() { return tickerSharedRef.current?.timestamp; }
  }), []); // 빈 deps = 객체 참조 안정화

  // 현재 선택된 심볼
  const currentSymbol = useAtomValue(symbolAtom);
  const symbolId = useAtomValue(symbolIdAtom); // 문자열 심볼 ID (BTCUSDT)

  // ==================== Local UI State (atoms) ====================
  const [timeframe, setTimeframe] = useAtom(timeframeAtom);
  const [selectedStrategy, setSelectedStrategy] = useAtom(selectedStrategyAtom);
  const [selectedTrade, setSelectedTrade] = useAtom(selectedTradeAtom);
  const [highlightedStrategy, setHighlightedStrategy] = useAtom(highlightedStrategyAtom);

  // Tooltip 상태
  const [hoveredTrade, setHoveredTrade] = useAtom(hoveredTradeAtom);
  const [hoveredSkipped, setHoveredSkipped] = useAtom(hoveredSkippedAtom);
  const [tooltipPos, setTooltipPos] = useAtom(tooltipPosAtom);
  const tradeMapRef = useRef<Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>>(new Map());

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useAtom(isSettingsOpenAtom);
  const [leverage, setLeverage] = useAtom(leverageAtom);
  const leverageAutoSetRef = useRef(false);
  const [nextCandleCountdown, setNextCandleCountdown] = useAtom(nextCandleCountdownAtom);

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
  } = useChartData(symbolId, timeframe, subscribeKline, wakeUpCounter);

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
  } = useBacktestRunner(strategies, symbolId, timeframe, false);

  // 4. Real-time Updates (selected strategy backtest)
  // 미리 로드된 trades/openPositions를 우선 사용 → runBacktest 호출 최소화
  const {
    backtestTrades,
    skippedSignals,
    openPosition,
    lastBacktestTime,
    isBacktestRunning,
    loadBacktestTrades,
    clearOpenPosition,
    closePositionWithTrade,
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
    kline: getKline(timeframe),
    selectedStrategy,
    soundEnabled,
    playAlertSound,
    playExitSound,
    loadBacktestTrades,
    onPositionExit: (exitType, exitPrice) => {
      console.log(`[Position Exit] ${exitType.toUpperCase()} @ $${exitPrice}`);
      closePositionWithTrade(exitType, exitPrice);  // 완료된 거래를 히스토리에 추가하며 청산
    },
  });

  // 백엔드 포지션 청산 감지 → 프론트 openPosition도 정리
  const prevActivePositionRef = useRef(tradingStatus?.activePosition);
  useEffect(() => {
    const prev = prevActivePositionRef.current;
    const curr = tradingStatus?.activePosition;
    prevActivePositionRef.current = curr;

    if (!openPosition) return;

    // Case 1: non-null → null 전환 (실시간 포지션 청산)
    if (prev && !curr) {
      console.log('[Trading] Bybit position closed, clearing strategy openPosition');
      // 현재 가격으로 청산 처리 (TP/SL 판별은 가격 비교로)
      const currentPrice = ticker?.price || openPosition.currentPrice;
      const { tp, sl, direction, entryPrice } = openPosition;
      const isLong = direction === 'long';
      // 현재가 vs TP/SL 거리로 판별 (정확하지 않을 수 있지만 마커 표시용으로 충분)
      const exitType = isLong
        ? (currentPrice >= tp || (currentPrice - entryPrice) > 0 ? 'tp' : 'sl')
        : (currentPrice <= tp || (entryPrice - currentPrice) > 0 ? 'tp' : 'sl');
      closePositionWithTrade(exitType, currentPrice);
      return;
    }

    // Case 2: 페이지 로드 후 tradingStatus 도착 — 백엔드에 포지션 없으면
    // kline high/low 기반 TP/SL 감지가 다음 틱에서 처리함
  }, [tradingStatus?.activePosition, openPosition, clearOpenPosition, closePositionWithTrade, ticker]);

  // 전략 최적화 (Propose → Approve/Reject)
  const {
    strategies: optimizeStatuses,
    optimizingStrategy,
    proposeResult,
    isApplying,
    applyResult,
    error: optimizeError,
    optimizeAllProgress,
    startOptimize,
    startOptimizeAll,
    approve: approveOptimize,
    reject: rejectOptimize,
  } = useStrategyOptimize();

  // approve 성공 시 차트 데이터 갱신
  useEffect(() => {
    if (applyResult?.success) {
      refetchBacktestData(true, true);
    }
  }, [applyResult, refetchBacktestData]);

  // ==================== Chart Init ====================
  const {
    chartRef,
    candleSeriesRef,
    bbUpperRef,
    bbMiddleRef,
    bbLowerRef,
    boHighRef,
    boLowRef,
    rsiChartRef,
    rsiSeriesRef,
    isChartDisposedRef,
    seriesMarkersRef,
    priceLinesRef,
  } = useChartInit({
    candles,
    initialCandlesLoaded,
    containerRef,
    rsiContainerRef,
    zscoreContainerRef,
    timeframe,
    chartKey,
    tradeMapRef,
    setHoveredTrade,
    setHoveredSkipped,
    setTooltipPos,
  });

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
  //     backtestTrades count above,
  //     isBacktestRunning,

  //     // Local state
  //     timeframe,
  //     selectedStrategy: selectedStrategy?.id,
  //     highlightedStrategy,

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
  }, [timeframe, setTimeframe]);

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
    chartKey,
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
  }, [timeframe, setNextCandleCountdown]);

  // Auto-leverage: Comfort-Kelly 공식 (OpenPositionCard와 동일)
  // NOTE: FIXED_LEVERAGE=20 모드 — 자동 레버리지 계산 비활성화
  // 백엔드 FIXED_LEVERAGE와 동일하게 고정, auto로 돌리려면 아래 주석 해제
  // useEffect(() => { ... Comfort-Kelly auto leverage ... }, [...]);
  // useEffect(() => { ... Position-based leverage ... }, [...]);

  // Auto-select: 첫 로딩 시 orchestrator 자동 선택 (localStorage 저장 없으면)
  useEffect(() => {
    if (manuallySelectedRef.current) return; // 사용자가 이미 선택함
    if (selectedStrategy) return; // 이미 선택됨
    if (strategies.length === 0) return;

    // localStorage에 저장된 전략이 있으면 복원
    if (savedStrategyIdRef.current !== null) {
      const saved = strategies.find(s => s.id === savedStrategyIdRef.current);
      if (saved) {
        setSelectedStrategy(saved);
        console.log('[AutoSelect] Restored saved strategy:', saved.strategy, 'id:', saved.id);
        return;
      }
    }

    // orchestrator 우선, 없으면 첫 번째 전략
    const orchestrator = strategies.find(s => s.strategy === 'orchestrator');
    const target = orchestrator || strategies[0];
    if (target) {
      setSelectedStrategy(target);
      console.log('[AutoSelect] Auto-selected:', target.strategy, 'id:', target.id);
    }
  }, [strategies, selectedStrategy, setSelectedStrategy]);

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
  }, [highlightedStrategy, strategies, handleStrategyChange, setHighlightedStrategy]);

  // 설정 토글 핸들러
  const handleSettingsToggle = useCallback(() => {
    setIsSettingsOpen(prev => !prev);
  }, [setIsSettingsOpen]);

  // 타임프레임 변경 핸들러
  const handleTimeframeChange = useCallback((tf: string) => {
    if (tf !== timeframe) {
      manuallySelectedRef.current = false;
      savedStrategyIdRef.current = null;
      localStorage.removeItem('selectedStrategyId');
      localStorage.removeItem('selectedStrategyTimeframe');
    }
    setTimeframe(tf);
  }, [timeframe, setTimeframe]);

  // 거래 선택 핸들러
  const handleTradeClick = useCallback((trade: TradeResult) => {
    setSelectedTrade(prev => (prev === trade ? null : trade));
  }, [setSelectedTrade]);

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

    // 캔들 확정 시 또는 새 캔들 시작 시 데이터 갱신 (silent refetch → 마커 깜빡임 방지)
    if (selectedStrategy && (isNewCandle || kline.isFinal)) {
      if (isNewCandle) {
        console.log('[Candle] New candle started, silent refetch...');
      } else if (kline.isFinal) {
        console.log('[Candle] Candle confirmed (isFinal), silent refetch...');
      }
      refetchBacktestData(true); // silent=true: 로딩 표시 없이 preloaded 데이터 갱신
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
          color: isLong ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
          borderColor: isLong
            ? 'rgba(34, 197, 94, 0.4)'
            : 'rgba(239, 68, 68, 0.4)',
          wickColor: isLong
            ? 'rgba(34, 197, 94, 0.3)'
            : 'rgba(239, 68, 68, 0.3)',
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

    // candlesRef를 실시간 kline으로 갱신 (BB/돈치안 계산에 사용)
    if (candlesRef.current.length > 0) {
      const arr = candlesRef.current;
      const lastTime = (arr[arr.length - 1] as any).time;
      const rtCandle = { ...newCandle, volume: kline.volume ?? 0 };
      if (newCandleTime === lastTime) {
        // 같은 봉 → 마지막 캔들 교체
        arr[arr.length - 1] = rtCandle as CandlestickData;
      } else if (newCandleTime > lastTime) {
        // 새 봉 → 추가
        arr.push(rtCandle as CandlestickData);
      }
    }

    // BB 실시간 업데이트: 최근 20개 캔들로 현재 봉의 BB 값 계산
    if (bbUpperRef.current && candlesRef.current.length >= 20) {
      const recent = candlesRef.current.slice(-20);
      let sum = 0;
      for (const c of recent) sum += (c as any).close;
      const sma = sum / 20;
      let sqSum = 0;
      for (const c of recent) sqSum += ((c as any).close - sma) ** 2;
      const std = Math.sqrt(sqSum / 20);
      const t = newCandle.time;
      try {
        bbUpperRef.current.update({ time: t, value: sma + 2 * std });
        bbMiddleRef.current.update({ time: t, value: sma });
        bbLowerRef.current.update({ time: t, value: sma - 2 * std });
      } catch { /* disposed */ }
    }

    // 돌파 레벨 실시간 업데이트: 최근 20봉 고/저점
    if (boHighRef.current && candlesRef.current.length >= 20) {
      const recent = candlesRef.current.slice(-21, -1); // 현재 봉 제외, 직전 20봉
      if (recent.length >= 20) {
        let maxH = -Infinity;
        let minL = Infinity;
        for (const c of recent) {
          if ((c as any).high > maxH) maxH = (c as any).high;
          if ((c as any).low < minL) minL = (c as any).low;
        }
        const t = newCandle.time;
        try {
          boHighRef.current.update({ time: t, value: maxH });
          boLowRef.current.update({ time: t, value: minL });
        } catch { /* disposed */ }
      }
    }

    // RSI 실시간 업데이트
    if (rsiSeriesRef.current && candlesRef.current.length >= 15) {
      const rsiUpdate = computeRSI(candlesRef.current.slice(-30));
      if (rsiUpdate.length > 0) {
        const last = rsiUpdate[rsiUpdate.length - 1];
        try {
          rsiSeriesRef.current.update({ time: newCandle.time, value: last.value });
        } catch { /* disposed */ }
      }
    }

    // Note: candles state는 useChartData hook에서 관리됨
  }, [kline, openPosition, selectedStrategy, refetchBacktestData]);
  // Note: Marker generation (chart markers and candle coloring) is now handled by useMarkerGeneration hook

  // BB/돈치안 라인 밝기: 신호 조건 충족도에 따라 굵기+투명도 조절
  useEffect(() => {
    const snap = indicatorSnapshot?.timeframe === timeframe ? indicatorSnapshot : null;
    if (!snap) return;

    const { adx, atrPct, ema200, volumeRatio, regime } = snap;
    const price = tickerSharedRef.current?.price ?? snap.price;

    // 평균회귀 조건 (BB): ATR 낮음 + 횡보
    const mrAtr = atrPct !== null && atrPct < 76;
    const mrRegime = regime === 'SIDEWAYS';
    const mrScore = [mrAtr, mrRegime].filter(Boolean).length; // 0~2

    // 돌파 조건 (돈치안): 거래량 + ADX + EMA거리 + 추세레짐
    const emaDist = price && ema200 ? Math.abs((price - ema200) / ema200 * 100) : null;
    const vbVol = volumeRatio !== null && volumeRatio >= 2.5;
    const vbAdx = adx !== null && adx >= 25;
    const vbEma = emaDist !== null && emaDist <= 1;
    const vbRegime = regime !== 'SIDEWAYS';
    const vbScore = [vbVol, vbAdx, vbEma, vbRegime].filter(Boolean).length; // 0~4

    // BB 스타일: 0조건=희미, 1=보통, 2(전부)=밝고 굵게
    const bbOpacity = mrScore === 2 ? 0.7 : mrScore === 1 ? 0.35 : 0.12;
    const bbWidth = mrScore === 2 ? 2 : 1;
    if (bbUpperRef.current) {
      bbUpperRef.current.applyOptions({ color: `rgba(239, 68, 68, ${bbOpacity})`, lineWidth: bbWidth });
    }
    if (bbMiddleRef.current) {
      bbMiddleRef.current.applyOptions({ color: `rgba(161, 161, 170, ${bbOpacity})`, lineWidth: bbWidth });
    }
    if (bbLowerRef.current) {
      bbLowerRef.current.applyOptions({ color: `rgba(59, 130, 246, ${bbOpacity})`, lineWidth: bbWidth });
    }

    // 돈치안 스타일: per-point color 사용 중이므로 lineWidth만 조절
    // (applyOptions의 color는 per-point color를 덮어쓰므로 제거)
    const dcWidth = vbScore >= 4 ? 2 : 1;
    if (boHighRef.current) {
      boHighRef.current.applyOptions({ lineWidth: dcWidth });
    }
    if (boLowRef.current) {
      boLowRef.current.applyOptions({ lineWidth: dcWidth });
    }
  }, [indicatorSnapshot, timeframe]);

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

    // 백테스트 openPosition 라인
    if (openPosition) {
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

      const tpLine = candleSeries.createPriceLine({
        price: openPosition.tp,
        color: '#16a34a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP',
      });
      priceLinesRef.current.push(tpLine);

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

    // 실시간 Bybit 포지션 라인 (항상 표시)
    const realPos = tradingStatus?.activePosition;
    if (realPos) {
      const entryLine = candleSeries.createPriceLine({
        price: realPos.entryPrice,
        color: '#eab308',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: '실거래',
      });
      priceLinesRef.current.push(entryLine);

      if (realPos.tp > 0) {
        const tpLine = candleSeries.createPriceLine({
          price: realPos.tp,
          color: '#16a34a',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP',
        });
        priceLinesRef.current.push(tpLine);
      }
      if (realPos.sl > 0) {
        const slLine = candleSeries.createPriceLine({
          price: realPos.sl,
          color: '#dc2626',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SL',
        });
        priceLinesRef.current.push(slLine);
      }
    }

  }, [openPosition?.entryTime, selectedStrategy?.id, chartKey, tradingStatus?.activePosition?.entryPrice]);

  // 거래 히스토리 정렬 메모이제이션 (매 렌더마다 정렬 방지)
  const sortedTrades = useMemo(() => {
    return [...backtestTrades].sort(
      (a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime()
    );
  }, [backtestTrades]);

  return (
    <div className='flex flex-col gap-4 w-full'>
      {/* 상단: 분봉 + 레버리지 설정 */}
      <div className='relative'>
        <StatisticsHeader
          leverage={leverage}
          onLeverageChange={setLeverage}
          timeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          soundEnabled={soundEnabled}
          onSoundToggle={setSoundEnabled}
          isSettingsOpen={isSettingsOpen}
          onSettingsToggle={handleSettingsToggle}
          isConnected={isConnected}
          nextCandleCountdown={nextCandleCountdown}
        />
        <BalanceHeader
          openPosition={openPosition}
          winRate={allStrategyStats.get(selectedStrategy?.strategy || '')?.winRate}
          maxConsecLoss={(() => {
            const trades = allTradesMap.get(selectedStrategy?.strategy || '') || [];
            let max = 0, cur = 0;
            for (const t of trades) { if (t.pnlPercent < 0) { cur++; max = Math.max(max, cur); } else { cur = 0; } }
            return max;
          })()}
        />
        <SignalThresholdMonitor timeframe={timeframe} trades={allTradesMap.get('orchestrator')} />
        {/* 설정 패널 (헤더 아래 드롭다운) */}
        <SettingsPanel
          show={isSettingsOpen}
          soundEnabled={soundEnabled}
          onSoundToggle={setSoundEnabled}
          soundVolume={soundVolume}
          onVolumeChange={setSoundVolume}
          playAlertSound={playAlertSound}
          playExitSound={playExitSound}
        />
      </div>

      <div className='grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px] gap-4 min-h-[calc(100vh-180px)]'>
      {/* 좌측: 메인 차트 영역 */}
      <div className='bg-zinc-900 p-4 rounded-lg min-w-0 flex flex-col overflow-hidden'>

        {/* 2. 열린 포지션 카드 */}
        <OpenPositionCard
          openPosition={openPosition}
          currentPrice={tickerSharedRef.current?.price}
          leverage={leverage}
          winRate={allStrategyStats.get(selectedStrategy?.strategy || '')?.winRate}
          maxConsecLoss={(() => {
            const trades = allTradesMap.get(selectedStrategy?.strategy || '') || [];
            let max = 0, cur = 0;
            for (const t of trades) { if (t.pnlPercent < 0) { cur++; max = Math.max(max, cur); } else { cur = 0; } }
            return max;
          })()}
        />

        {/* 4. 차트 */}
        {isLoading ? (
          <div className='flex-1 min-h-[400px] flex items-center justify-center'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500'></div>
          </div>
        ) : (
          <div ref={containerRef} className='w-full relative flex-1 min-h-[400px]'>
            {/* 차트 범례 */}
            <div className='absolute top-2 left-2 z-30 flex flex-col gap-0.5 bg-zinc-900/70 rounded px-2 py-1.5 text-[10px] pointer-events-none select-none'>
              <div className='flex items-center gap-1.5'>
                <span className='inline-block w-5 border-t border-dashed' style={{ borderColor: 'rgba(239,68,68,0.6)' }} />
                <span className='text-zinc-400'>BB Upper</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <span className='inline-block w-5 border-t border-dotted' style={{ borderColor: 'rgba(161,161,170,0.6)' }} />
                <span className='text-zinc-400'>BB Mid (SMA20)</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <span className='inline-block w-5 border-t border-dashed' style={{ borderColor: 'rgba(59,130,246,0.6)' }} />
                <span className='text-zinc-400'>BB Lower</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <span className='inline-block w-5 border-t border-solid' style={{ borderColor: 'rgba(34,197,94,0.6)' }} />
                <span className='text-zinc-400'>BO High (20봉)</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <span className='inline-block w-5 border-t border-solid' style={{ borderColor: 'rgba(239,68,68,0.6)' }} />
                <span className='text-zinc-400'>BO Low (20봉)</span>
              </div>
            </div>
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

        {/* RSI 서브 패널 */}
        {!isLoading && (
          <div className='w-full relative' style={{ height: 120 }}>
            <div ref={rsiContainerRef} className='w-full h-full' />
            <span className='absolute top-1 left-2 text-[10px] text-zinc-500 z-10 pointer-events-none'>RSI(14)</span>
          </div>
        )}

        {/* Z-Score 서브 패널 */}
        {!isLoading && (
          <div className='w-full relative' style={{ height: 100 }}>
            <div ref={zscoreContainerRef} className='w-full h-full' />
            <span className='absolute top-1 left-2 text-[10px] text-zinc-500 z-10 pointer-events-none'>Z-Score(20)</span>
            <span className='absolute top-1 right-10 text-[9px] text-zinc-600 z-10 pointer-events-none'>±1.5 / ±2.5</span>
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
      <StrategyListPanel
        strategies={strategies}
        rollingSharpeData={rollingSharpeData}
        allStrategyStats={allStrategyStats}
        allStrategiesEquityCurves={allStrategiesEquityCurves}
        allOpenPositions={allOpenPositions}
        allTradesMap={allTradesMap}
        openPosition={openPosition}
        isLoadingAllStrategies={isLoadingAllStrategies}
        optimizeStatuses={optimizeStatuses}
        proposeResult={proposeResult}
        isApplying={isApplying}
        optimizeError={optimizeError}
        applyResult={applyResult}
        optimizingStrategy={optimizingStrategy}
        optimizeAllProgress={optimizeAllProgress}
        onStrategyChange={handleStrategyChange}
        startOptimize={startOptimize}
        startOptimizeAll={startOptimizeAll}
        approveOptimize={approveOptimize}
        rejectOptimize={rejectOptimize}
        refetchBacktestData={refetchBacktestData}
        refetchStrategies={refetchStrategies}
      />
      </div>

      <StrategyComparisonPanel
        chartStrategies={chartStrategies}
        isLoadingAllStrategies={isLoadingAllStrategies}
        isLoadingEquityCurves={isLoadingEquityCurves}
        hasData={allStrategiesEquityCurves.size > 0}
        onStrategyClick={handleStrategyClickMemo}
      />

      <TradeHistoryPanel
        trades={sortedTrades}
        isBacktestRunning={isBacktestRunning}
        leverage={leverage}
        selectedTrade={selectedTrade}
        onTradeClick={handleTradeClick}
      />
    </div>
  );
}

// React.memo 적용: RealtimeChart는 props가 없고 Context에서 데이터를 가져오므로
// React.memo는 효과가 제한적입니다. Context 값 변경은 여전히 리렌더를 유발합니다.
export default React.memo(StrategyDashboard);
