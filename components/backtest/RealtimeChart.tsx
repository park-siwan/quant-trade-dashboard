'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { useSocket, RealtimeDivergenceData } from '@/contexts/SocketContext';
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
} from '@/lib/backtest-api';
import { X } from 'lucide-react';
import {
  convertApiParams,
  getDefaultParams,
} from '@/lib/strategy-params';
import MultiStrategyEquityChart from './MultiStrategyEquityChart';
import WeeklySharpeTimeline from './WeeklySharpeTimeline';

// JSON Single Source of Truth: API 캐시에서 로드된 기본값 사용
const getTrendReversalComboDefaults = () => getDefaultParams('trend_reversal_combo');
const getBbReversionDefaults = () => getDefaultParams('z_score');
const getHmmOrchestratorDefaults = () => getDefaultParams('hmm_orchestrator');
import { preloadStrategyDefaults, getCachedStrategyDisplayName, fetchStrategyPreviews, StrategyPreview, fetchRollingSharpe, RollingSharpeResult } from '@/lib/backtest-api';
import { CHART } from '@/lib/constants';
import { useAtomValue } from 'jotai';
import { symbolAtom, symbolIdAtom } from '@/stores/symbolAtom';
import { toSeconds, formatKST, getTimeframeSeconds } from '@/lib/utils/timestamp';
import { useAutoOptimize } from '@/hooks/useAutoOptimize';
import { usePerformanceMonitor, performanceMonitor } from '@/lib/performance-monitor';

// ✅ Custom Hooks
import { useChartData } from './hooks/useChartData';
import { useStrategyList } from './hooks/useStrategyList';
import { useBacktestRunner } from './hooks/useBacktestRunner';
import { useRealtimeUpdates } from './hooks/useRealtimeUpdates';
import { useSoundAlerts } from './hooks/useSoundAlerts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// 전략 변경 요청
const changeStrategy = async (strategyId: number) => {
  try {
    await fetch(`${API_BASE}/realtime/strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyId }),
    });
  } catch (err) {
    console.error('Failed to change strategy:', err);
  }
};

export default function RealtimeChart() {
  // Performance monitoring
  usePerformanceMonitor('RealtimeChart');

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]); // TP/SL/Entry price lines
  const seriesMarkersRef = useRef<any>(null); // 마커 인스턴스 재사용 (누적 방지)
  const isChartDisposedRef = useRef(false);
  const {
    isConnected,
    getKline,
    ticker,
    divergenceData,
    divergenceHistory,
    subscribeKline,
  } = useSocket();

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
  const [autoOptimizeEnabled, setAutoOptimizeEnabled] = useState(false);
  const [leverage, setLeverage] = useState(20);
  const [nextCandleCountdown, setNextCandleCountdown] = useState<number>(0);

  // Refs for tracking
  const savedStrategyIdRef = useRef<number | null>(null);
  const lastCandleTimeRef = useRef<number>(0);
  const lastSignalIdRef = useRef<string | null>(null);
  const lastExitAlertRef = useRef<string | null>(null);
  const lastEntryAlertRef = useRef<string | null>(null);
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
    rollingSharpeMap,
    strategyPreviews,
    refetch: refetchStrategies,
  } = useStrategyList(currentSymbol.slashFormat, symbolId, timeframe);

  // 3. Backtest Runner (equity curves + rolling sharpe timeline)
  const {
    equityCurves: allStrategiesEquityCurves,
    isLoading: isLoadingEquityCurves,
    rollingSharpeData,
    backtestCacheRef,
  } = useBacktestRunner(strategies, symbolId, timeframe, useWalkForward);

  // 4. Real-time Updates (selected strategy backtest)
  const {
    backtestTrades,
    skippedSignals,
    openPosition,
    backtestStats,
    equityCurve,
    lastBacktestTime,
    isBacktestRunning,
    loadBacktestTrades,
  } = useRealtimeUpdates(
    selectedStrategy,
    symbolId,
    currentSymbol.slashFormat,
    timeframe,
    candles.length,
    isLoading
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

  // 자동 최적화 훅 (캔들 마감 시 트리거)
  const {
    isOptimizing: isAutoOptimizing,
    lastOptimizeTime,
    lastResult: autoOptimizeResult,
    triggerManual: triggerManualOptimize,
  } = useAutoOptimize({
    symbol: symbolId,
    timeframe,
    enabled: autoOptimizeEnabled,
    strategies: ['orchestrator', 'trend_reversal_combo', 'vol_breakout'],
    candleCount: 3000,
  });

  // ==================== Helper Functions ====================

  // 마커 인스턴스 재사용 유틸 함수 (누적 방지)
  const updateSeriesMarkers = (markers: SeriesMarker<Time>[]) => {
    if (!candleSeriesRef.current) return;

    if (!seriesMarkersRef.current) {
      // 첫 호출: 인스턴스 생성
      seriesMarkersRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
    } else {
      // 이후 호출: 기존 인스턴스에서 마커만 교체
      seriesMarkersRef.current.setMarkers(markers);
    }
  };

  // 브라우저 알림 헬퍼 함수
  const showNotification = (title: string, body: string) => {
    if (typeof Notification === 'undefined') return;

    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    } else if (Notification.permission === 'default') {
      // 권한 요청 후 알림
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        }
      });
    }
  };

  // 실시간 다이버전스 신호 알림 + 백테스트 재실행
  useEffect(() => {
    if (!divergenceData) return;

    // 고유 신호 ID 생성 (시간 + 방향)
    const signalId = `${divergenceData.timestamp}-${divergenceData.direction}`;

    // 이미 알림한 신호면 스킵
    if (lastSignalIdRef.current === signalId) return;

    lastSignalIdRef.current = signalId;

    // 소리 알림
    playAlertSound(divergenceData.direction);

    // 브라우저 알림
    const title =
      divergenceData.direction === 'bullish'
        ? '🚀 롱 신호 발생!'
        : '🌧 숏 신호 발생!';
    const body = `가격: $${divergenceData.price.toLocaleString()} | RSI: ${divergenceData.rsiValue.toFixed(1)}`;
    showNotification(title, body);

    // 새 신호 발생 시 백테스트 재실행하여 openPosition 업데이트
    if (selectedStrategy) {
      console.log('[Signal] New divergence signal, refreshing backtest...');
      loadBacktestTrades(selectedStrategy);
    }
  }, [divergenceData, soundEnabled]);

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission();
    }
  }, []);

  // Note: Sound initialization is now handled by useSoundAlerts hook

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

  // TP/SL 도달 감지 및 알림 (실시간 가격 모니터링)
  useEffect(() => {
    if (!openPosition || !ticker) return;

    const currentPrice = ticker.price;
    const { tp, sl, direction, entryPrice } = openPosition;
    const isLong = direction === 'long';

    // TP/SL 도달 확인
    let exitType: 'tp' | 'sl' | null = null;

    if (isLong) {
      // 롱 포지션: 가격이 TP 이상이면 익절, SL 이하면 손절
      if (currentPrice >= tp) {
        exitType = 'tp';
      } else if (currentPrice <= sl) {
        exitType = 'sl';
      }
    } else {
      // 숏 포지션: 가격이 TP 이하면 익절, SL 이상이면 손절
      if (currentPrice <= tp) {
        exitType = 'tp';
      } else if (currentPrice >= sl) {
        exitType = 'sl';
      }
    }

    if (exitType) {
      // 고유 알림 ID (진입시간 + TP/SL 타입)
      const alertId = `${openPosition.entryTime}-${exitType}`;

      // 이미 알림한 경우 스킵
      if (lastExitAlertRef.current === alertId) return;

      lastExitAlertRef.current = alertId;
      const isProfit = exitType === 'tp';

      // 소리 알림
      playExitSound(isProfit);

      // 브라우저 알림
      const directionText = isLong ? '롱' : '숏';
      const exitText = isProfit ? '익절' : '손절';
      const emoji = isProfit ? '🪙' : '💸';
      const pnlText =
        openPosition.unrealizedPnl >= 0
          ? `+$${openPosition.unrealizedPnl.toFixed(2)}`
          : `-$${Math.abs(openPosition.unrealizedPnl).toFixed(2)}`;

      showNotification(
        `${emoji} ${directionText} ${exitText}!`,
        `가격: $${currentPrice.toLocaleString()} | PnL: ${pnlText} (${openPosition.unrealizedPnlPercent.toFixed(2)}%)`,
      );

      console.log(
        `[Exit Alert] ${direction.toUpperCase()} ${exitType.toUpperCase()} @ $${currentPrice}`,
      );

      // TP/SL 도달 후 백테스트 재실행하여 포지션 상태 갱신
      if (selectedStrategy) {
        setTimeout(() => loadBacktestTrades(selectedStrategy), 1000);
      }
    }
  }, [ticker?.price, openPosition, soundEnabled]);

  // 새 포지션 진입 알림
  useEffect(() => {
    if (!openPosition) return;

    // 고유 알림 ID (진입시간 + 방향)
    const entryId = `${openPosition.entryTime}-${openPosition.direction}`;

    // 이미 알림한 경우 스킵
    if (lastEntryAlertRef.current === entryId) return;

    // 30분 이내 진입만 알림 (페이지 새로고침 시 오래된 포지션 알림 방지)
    const ENTRY_ALERT_WINDOW_MS = 30 * 60 * 1000; // 30분
    const entryTime = new Date(openPosition.entryTime).getTime();
    const timeSinceEntry = Date.now() - entryTime;
    if (timeSinceEntry > ENTRY_ALERT_WINDOW_MS) {
      console.log(`[Entry Alert] Skipped - entry too old (${Math.round(timeSinceEntry / 60000)}min ago)`);
      lastEntryAlertRef.current = entryId; // 마킹하여 재시도 방지
      return;
    }

    lastEntryAlertRef.current = entryId;
    const isLong = openPosition.direction === 'long';

    // 진입 소리 알림 (다이버전스 신호와 동일한 사운드)
    playAlertSound(isLong ? 'bullish' : 'bearish');

    // 브라우저 알림
    const directionText = isLong ? '롱' : '숏';
    const emoji = isLong ? '🟢' : '🔴';
    showNotification(
      `${emoji} ${directionText} 진입!`,
      `진입가: $${openPosition.entryPrice.toLocaleString()} | TP: $${openPosition.tp.toLocaleString()} | SL: $${openPosition.sl.toLocaleString()}`,
    );

    console.log(
      `[Entry Alert] ${openPosition.direction.toUpperCase()} @ $${openPosition.entryPrice} (${Math.round(timeSinceEntry / 60000)}min ago)`,
    );
  }, [openPosition, soundEnabled]);

  // 전략 미리보기 백테스트 실행 (단일 전략)
  // 파라미터를 보내지 않고 Python이 JSON 기본값을 사용하도록 함 (race condition 방지)
  const runPreviewBacktest = async (strategy: SavedOptimizeResult): Promise<{
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
    sharpeRatio: number;
  } | null> => {
    try {
      const strategyType = (strategy.strategy || 'rsi_div') as 'z_score' | 'vol_breakout' | 'ml_hmm' | 'rsi_div' | 'trend_reversal_combo' | 'hmm_orchestrator';

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
    const strategyType = rolling.strategy as 'z_score' | 'vol_breakout' | 'ml_hmm' | 'rsi_div' | 'trend_reversal_combo';

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
    } else if (strategyType === 'z_score') {
      // 적응형 평균회귀 (학술 기반)
      base.lookback = convertedParams.lookback ?? defaults.lookback ?? 20;
      base.entryZ = convertedParams.entryZ ?? defaults.entryZ ?? 1.5;
      base.exitZ = convertedParams.exitZ ?? defaults.exitZ ?? 0.25;
      base.stopZ = convertedParams.stopZ ?? defaults.stopZ ?? 2.5;
      base.volFilter = convertedParams.volFilter ?? defaults.volFilter ?? 0;
      base.volThreshold = convertedParams.volThreshold ?? defaults.volThreshold ?? 1.5;
      base.rsiConfirm = convertedParams.rsiConfirm ?? defaults.rsiConfirm ?? 0;
      // v6: 추세 필터 파라미터
      base.blockInTrend = convertedParams.blockInTrend ?? defaults.blockInTrend ?? 1;
      base.adxTrendThreshold = convertedParams.adxTrendThreshold ?? defaults.adxTrendThreshold ?? 20;
      base.useEmaTrendFilter = convertedParams.useEmaTrendFilter ?? defaults.useEmaTrendFilter ?? 0;
      base.emaPeriod = convertedParams.emaPeriod ?? defaults.emaPeriod ?? 20;
      base.emaDistancePct = convertedParams.emaDistancePct ?? defaults.emaDistancePct ?? 1.0;
      base.useVolumeConfirm = convertedParams.useVolumeConfirm ?? defaults.useVolumeConfirm ?? 1;
      base.volumeMult = convertedParams.volumeMult ?? defaults.volumeMult ?? 0.8;
      base.cooldownBars = convertedParams.cooldownBars ?? defaults.cooldownBars ?? 10;
      base.lowVolEntryZ = convertedParams.lowVolEntryZ ?? defaults.lowVolEntryZ ?? 1.5;
      base.highVolEntryZ = convertedParams.highVolEntryZ ?? defaults.highVolEntryZ ?? 2.5;
      base.useStochConfirm = convertedParams.useStochConfirm ?? defaults.useStochConfirm ?? 0;
      base.stochThreshold = convertedParams.stochThreshold ?? defaults.stochThreshold ?? 25;
      base.useRsiConfirm = convertedParams.useRsiConfirm ?? defaults.useRsiConfirm ?? 0;
      base.rsiThreshold = convertedParams.rsiThreshold ?? defaults.rsiThreshold ?? 35;
      base.useMiniSideways = convertedParams.useMiniSideways ?? defaults.useMiniSideways ?? 0;
      base.bbBandwidthThreshold = convertedParams.bbBandwidthThreshold ?? defaults.bbBandwidthThreshold ?? 0.03;
      base.useChannelDetection = convertedParams.useChannelDetection ?? defaults.useChannelDetection ?? 0;
      base.channelR2Threshold = convertedParams.channelR2Threshold ?? defaults.channelR2Threshold ?? 0.6;
      base.channelOnlyMode = convertedParams.channelOnlyMode ?? defaults.channelOnlyMode ?? 0;
      base.volatilityFilter = base.volFilter ? 'atr' : 'OFF';
      base.rsiExtremeFilter = base.rsiConfirm ? 'extreme' : 'OFF';
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
    } else if (strategyType === 'ml_hmm') {
      // 레짐 적응형 (학술 기반)
      base.tpAtr = convertedParams.tpAtr ?? 2.0;
      base.slAtr = convertedParams.slAtr ?? 1.5;
    } else if (strategyType === 'trend_reversal_combo') {
      // 추세+역추세 콤보 (HMM 레짐 기반)
      base.breakoutPeriod = convertedParams.breakoutPeriod ?? defaults.breakoutPeriod ?? 20;
      base.volumeConfirm = 1;  // 볼륨 확인 활성화 (int)
      base.volumeMult = convertedParams.volumeMult ?? defaults.volumeMult ?? 1.5;
      base.adxThreshold = convertedParams.adxThreshold ?? defaults.adxThreshold ?? 25;
      base.cooldownBars = convertedParams.cooldownBars ?? defaults.cooldownBars ?? 5;
      base.tpAtr = convertedParams.tpAtr ?? 1.7;
      base.slAtr = convertedParams.slAtr ?? 3.5;
    } else if (strategyType === 'hmm_orchestrator') {
      // HMM 오케스트레이터 v2 (횡보=RSI Divergence+평균회귀, 추세=브레이크아웃)
      const hmmDefaults = getHmmOrchestratorDefaults();
      // RSI Divergence 파라미터 (콤보 동일)
      base.pivotLeft = convertedParams.pivotLeft ?? hmmDefaults.pivotLeft ?? 5;
      base.pivotRight = convertedParams.pivotRight ?? hmmDefaults.pivotRight ?? 1;
      base.rsiPeriod = convertedParams.rsiPeriod ?? hmmDefaults.rsiPeriod ?? 14;
      base.minRsiDiff = convertedParams.minRsiDiff ?? hmmDefaults.minRsiDiff ?? 3;
      base.minDistance = convertedParams.minDistance ?? hmmDefaults.minDistance ?? 5;
      base.maxDistance = convertedParams.maxDistance ?? hmmDefaults.maxDistance ?? 100;
      base.rsiOversold = convertedParams.rsiOversold ?? hmmDefaults.rsiOversold ?? 35;
      base.rsiOverbought = convertedParams.rsiOverbought ?? hmmDefaults.rsiOverbought ?? 65;
      // 평균회귀 파라미터
      base.bbLookback = convertedParams.bbLookback ?? hmmDefaults.bbLookback ?? 20;
      base.lowVolEntryZ = convertedParams.lowVolEntryZ ?? hmmDefaults.lowVolEntryZ ?? 1.5;
      base.highVolEntryZ = convertedParams.highVolEntryZ ?? hmmDefaults.highVolEntryZ ?? 2.5;
      base.exitZ = convertedParams.exitZ ?? hmmDefaults.exitZ ?? 0.25;
      base.bbVolumeMult = convertedParams.bbVolumeMult ?? hmmDefaults.bbVolumeMult ?? 0.8;
      // 브레이크아웃 파라미터
      base.breakoutPeriod = convertedParams.breakoutPeriod ?? hmmDefaults.breakoutPeriod ?? 20;
      base.breakoutVolumeMult = convertedParams.breakoutVolumeMult ?? hmmDefaults.breakoutVolumeMult ?? 1.5;
      base.adxThreshold = convertedParams.adxThreshold ?? hmmDefaults.adxThreshold ?? 25;
      base.volumeMult = convertedParams.volumeMult ?? hmmDefaults.volumeMult ?? 1.5;
      // 공통
      base.cooldownBars = convertedParams.cooldownBars ?? hmmDefaults.cooldownBars ?? 5;
      base.tpAtr = convertedParams.tpAtr ?? hmmDefaults.tpAtr ?? 1.7;
      base.slAtr = convertedParams.slAtr ?? hmmDefaults.slAtr ?? 3.5;
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
  const handleStrategyChange = async (strategy: SavedOptimizeResult) => {
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
    await changeStrategy(strategy.id);
    console.log('[Strategy] Manually selected:', strategy.id, 'TF:', strategy.timeframe);
  };

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

  // 마커 업데이트 + 거래 구간 캔들 색상 변경
  useEffect(() => {
    console.log('[Markers] useEffect triggered - strategy:', selectedStrategy?.id, 'trades:', backtestTrades.length, 'openPos:', !!openPosition, 'isBacktestRunning:', isBacktestRunning, 'isChangingStrategy:', isChangingStrategyRef.current);

    if (!candleSeriesRef.current || candles.length === 0) return;

    // 전략 변경 중이거나 백테스트 진행 중이면 마커 클리어 (깔끔한 상태 유지)
    if (isChangingStrategyRef.current || isBacktestRunning) {
      console.log('[Markers] Clearing markers - strategy changing or backtest in progress');
      updateSeriesMarkers([]);
      // 캔들 색상도 원래대로 복구
      candleSeriesRef.current.setData(candles);
      return;
    }

    const markers: SeriesMarker<Time>[] = [];
    const tradeMap = new Map<
      number,
      {
        trade?: TradeResult;
        skipped?: SkippedSignal;
        type: 'entry' | 'exit' | 'skipped';
      }
    >();

    const candleTimes = candles.map((c) => c.time as number);
    const minCandleTime = Math.min(...candleTimes);
    const maxCandleTime = Math.max(...candleTimes);

    // 디버그 로깅 (개발 환경에서만)
    const DEBUG_MARKERS = process.env.NODE_ENV === 'development';
    if (DEBUG_MARKERS && backtestTrades.length > 0) {
      console.log('[Marker Debug] Candle range:', {
        min: new Date(minCandleTime * 1000).toISOString(),
        max: new Date(maxCandleTime * 1000).toISOString(),
        count: candles.length,
      });
      console.log('[Marker Debug] Trades:', backtestTrades.slice(0, 3).map(t => ({
        entry: t.entryTime,
        exit: t.exitTime,
        entrySeconds: toSeconds(t.entryTime),
        exitSeconds: toSeconds(t.exitTime),
      })));
    }

    // 거래 구간별 색상 맵 생성 (캔들 시간 -> 색상)
    const tradeColorMap = new Map<
      number,
      { isLong: boolean; isWin: boolean }
    >();

    // 청산된 거래 구간 색상 설정
    if (backtestTrades.length > 0) {
      backtestTrades.forEach((trade) => {
        const entryTime = toSeconds(trade.entryTime);
        const exitTime = toSeconds(trade.exitTime);
        const isLong = trade.direction === 'long';
        const isWin = trade.pnl > 0;

        // 해당 거래 구간의 모든 캔들에 색상 정보 추가
        candles.forEach((candle) => {
          const candleTime = candle.time as number;
          if (candleTime >= entryTime && candleTime <= exitTime) {
            tradeColorMap.set(candleTime, { isLong, isWin });
          }
        });
      });
    }

    // 열린 포지션 구간 색상 설정
    if (openPosition) {
      const entryTime = toSeconds(openPosition.entryTime);
      const isLong = openPosition.direction === 'long';

      candles.forEach((candle) => {
        const candleTime = candle.time as number;
        if (candleTime >= entryTime) {
          tradeColorMap.set(candleTime, { isLong, isWin: true }); // 진행 중은 일단 수익으로
        }
      });
    }

    // 캔들 데이터에 색상 적용 (연한 색상)
    const coloredCandles = candles.map((candle) => {
      const candleTime = candle.time as number;
      const tradeInfo = tradeColorMap.get(candleTime);

      if (tradeInfo) {
        // 롱: 연한 초록색, 숏: 연한 빨간색
        if (tradeInfo.isLong) {
          return {
            ...candle,
            color: 'rgba(34, 197, 94, 0.12)', // 연한 초록 (롱)
            borderColor: 'rgba(34, 197, 94, 0.25)',
            wickColor: 'rgba(34, 197, 94, 0.18)',
          };
        } else {
          return {
            ...candle,
            color: 'rgba(239, 68, 68, 0.12)', // 연한 빨강 (숏)
            borderColor: 'rgba(239, 68, 68, 0.25)',
            wickColor: 'rgba(239, 68, 68, 0.18)',
          };
        }
      }
      // 거래 구간 외: 기본 무채색
      return candle;
    });

    // 색상이 적용된 캔들 데이터로 업데이트
    candleSeriesRef.current.setData(coloredCandles);

    // 데이터 업데이트 후 가격 스케일 재조정 (세로 중앙 정렬)
    if (chartRef.current) {
      chartRef.current.priceScale('right').applyOptions({ autoScale: true });
    }

    console.log(
      '[Markers] Candle range:',
      new Date(minCandleTime * 1000).toLocaleString('ko-KR'),
      '~',
      new Date(maxCandleTime * 1000).toLocaleString('ko-KR'),
    );
    console.log('[Markers] Colored candles:', tradeColorMap.size);

    // 투명 스페이서 마커 생성 헬퍼 (캔들과 간격 확보)
    const createSpacer = (time: number, position: 'aboveBar' | 'belowBar') =>
      ({
        time: time as Time,
        position,
        color: 'transparent',
        shape: 'circle',
        size: CHART.SPACER_SIZE,
      }) as SeriesMarker<Time>;

    // 백테스트 거래 마커 (toSeconds 사용 - BacktestChart와 동일)
    if (backtestTrades.length > 0) {
      // 디버깅: 첫 거래의 시간 매칭 확인
      if (backtestTrades.length > 0) {
        const firstTrade = backtestTrades[0];
        const firstEntryTime = toSeconds(firstTrade.entryTime);
        console.log('[Time Debug] First trade entryTime raw:', firstTrade.entryTime);
        console.log('[Time Debug] First trade entryTime parsed (UTC sec):', firstEntryTime);
        console.log('[Time Debug] First trade entryTime as Date:', new Date(firstEntryTime * 1000).toISOString());
        console.log('[Time Debug] Candle range (UTC sec):', minCandleTime, '-', maxCandleTime);
        console.log('[Time Debug] Candle range as Date:', new Date(minCandleTime * 1000).toISOString(), '-', new Date(maxCandleTime * 1000).toISOString());
      }
      backtestTrades.forEach((trade) => {
        const entryTime = toSeconds(trade.entryTime);
        const exitTime = toSeconds(trade.exitTime);
        const isLong = trade.direction === 'long';
        const isWin = trade.pnl > 0;

        // 진입 마커 (롱: 밝은 초록 화살표, 숏: 밝은 빨강 화살표)
        if (entryTime >= minCandleTime && entryTime <= maxCandleTime) {
          markers.push(createSpacer(entryTime, isLong ? 'belowBar' : 'aboveBar'));
          markers.push({
            time: entryTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: isLong ? '#22c55e' : '#ef4444',
            shape: isLong ? 'arrowUp' : 'arrowDown',
            size: CHART.MARKER_SIZE_ARROW,
          } as SeriesMarker<Time>);
          tradeMap.set(entryTime, { trade, type: 'entry' });
        }

        // 청산 마커 색상 결정
        // 수수료로 인한 손실: 가격은 유리하게 움직였지만 PnL이 마이너스
        const priceMovedFavorably = isLong
          ? trade.exitPrice > trade.entryPrice
          : trade.exitPrice < trade.entryPrice;
        const isFeeLoss = priceMovedFavorably && trade.pnl <= 0;

        const alpha = CHART.MARKER_CIRCLE_OPACITY;
        let exitColor = `rgba(34, 197, 94, ${alpha})`; // 익절: 초록
        if (!isWin) {
          exitColor = isFeeLoss ? `rgba(156, 163, 175, ${alpha})` : `rgba(250, 204, 21, ${alpha})`; // 수수료 손실: 회색, 진짜 손절: 노랑
        }

        // 청산 마커
        if (exitTime >= minCandleTime && exitTime <= maxCandleTime) {
          markers.push(createSpacer(exitTime, isLong ? 'aboveBar' : 'belowBar'));
          markers.push({
            time: exitTime as Time,
            position: isLong ? 'aboveBar' : 'belowBar',
            color: exitColor,
            shape: 'circle',
            size: CHART.MARKER_SIZE_CIRCLE,
          } as SeriesMarker<Time>);
          tradeMap.set(exitTime, { trade, type: 'exit' });
        }
      });
    }

    // 스킵된 신호 마커 (수수료 보호) - 회색 화살표 + 예상 TP 위치 회색 점
    if (skippedSignals.length > 0) {
      skippedSignals.forEach((signal) => {
        const signalTime = toSeconds(signal.time);
        const isLong = signal.direction === 'long';
        if (signalTime >= minCandleTime && signalTime <= maxCandleTime) {
          markers.push(createSpacer(signalTime, isLong ? 'belowBar' : 'aboveBar'));
          // 진입 화살표 마커
          markers.push({
            time: signalTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: '#9ca3af', // gray-400 회색
            shape: isLong ? 'arrowUp' : 'arrowDown',
            size: CHART.MARKER_SIZE_ARROW,
          } as SeriesMarker<Time>);
          tradeMap.set(signalTime, { skipped: signal, type: 'skipped' });

          // 예상 TP 위치 회색 점 (tp 필드가 있을 때만)
          if (signal.tp) {
            markers.push(createSpacer(signalTime, isLong ? 'aboveBar' : 'belowBar'));
            markers.push({
              time: signalTime as Time,
              position: isLong ? 'aboveBar' : 'belowBar',
              color: `rgba(107, 114, 128, ${CHART.MARKER_CIRCLE_OPACITY})`, // gray-500 회색 점
              shape: 'circle',
              size: CHART.MARKER_SIZE_CIRCLE,
            } as SeriesMarker<Time>);
          }
        }
      });
    }

    // 실시간 다이버전스 신호 마커 (전략이 선택되지 않았을 때만 표시)
    // 전략이 선택되면 해당 전략의 백테스트 결과만 표시
    if (!selectedStrategy && divergenceHistory.length > 0) {
      divergenceHistory.forEach((signal) => {
        const signalTime = signal.timestamp / 1000;
        const isLong = signal.direction === 'bullish';
        if (signalTime >= minCandleTime && signalTime <= maxCandleTime) {
          markers.push(createSpacer(signalTime, isLong ? 'belowBar' : 'aboveBar'));
          markers.push({
            time: signalTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: isLong ? '#22c55e' : '#ef4444',
            shape: isLong ? 'arrowUp' : 'arrowDown',
            size: CHART.MARKER_SIZE_ARROW,
          } as SeriesMarker<Time>);
        }
      });
    }

    // 열린 포지션 마커는 DOM 오버레이로 대체 (더 큰 이모지 표시 가능)

    // 마커 정렬 후 추가
    if (markers.length > 0) {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      updateSeriesMarkers(markers);
    } else {
      updateSeriesMarkers([]);
    }

    tradeMapRef.current = tradeMap;
  }, [
    backtestTrades,
    skippedSignals,
    divergenceHistory,
    openPosition,
    candles.length,
    selectedStrategy?.id, // 전략 변경 시 마커 즉시 업데이트
    isBacktestRunning, // 백테스트 완료 시 색상 업데이트 트리거
  ]);

  // TP/SL/Entry 가로선 업데이트 (Price Line 사용 - 캔들 위에 표시)
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
      // 현재 손익 계산 (ticker 가격 기준)
      const currentPrice = ticker?.price ?? openPosition.entryPrice;
      const isLong = openPosition.direction === 'long';
      const isProfit = isLong
        ? currentPrice > openPosition.entryPrice
        : currentPrice < openPosition.entryPrice;

      // Entry 라인 (이익: 초록, 손해: 빨강) - 어두운 톤
      const entryLine = candleSeries.createPriceLine({
        price: openPosition.entryPrice,
        color: isProfit ? '#16a34a' : '#dc2626',
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

      console.log(
        `[Lines] Entry: $${openPosition.entryPrice}, TP: $${openPosition.tp}, SL: $${openPosition.sl}`,
      );
    }
  }, [openPosition, ticker?.price, selectedStrategy?.id]); // 전략 변경 시 라인 즉시 제거/갱신

  // 총 포지션 보유시간 계산 (모든 거래의 보유시간 합계)
  const totalHoldingTime = backtestTrades.reduce((acc, trade) => {
    try {
      const entrySeconds = toSeconds(trade.entryTime);
      const exitSeconds = toSeconds(trade.exitTime);

      // 유효성 검증
      if (isNaN(entrySeconds) || isNaN(exitSeconds) || !isFinite(entrySeconds) || !isFinite(exitSeconds)) {
        console.warn('[totalHoldingTime] Invalid time for trade:', trade);
        return acc;
      }

      const holdingTimeMs = (exitSeconds - entrySeconds) * 1000;

      // 음수 또는 비정상적으로 큰 값 필터링
      if (holdingTimeMs < 0 || holdingTimeMs > 365 * 24 * 60 * 60 * 1000) {
        console.warn('[totalHoldingTime] Abnormal holding time:', holdingTimeMs, trade);
        return acc;
      }

      return acc + holdingTimeMs;
    } catch (error) {
      console.error('[totalHoldingTime] Error calculating holding time:', error, trade);
      return acc;
    }
  }, 0);

  // 디버그: DISABLED to prevent console flooding during excessive re-rendering
  // Bug confirmed: statsTradesCount: 39, backtestTradesLength: 0
  // Root cause: API returns stats with totalTrades but trades array is empty
  // if (backtestTrades.length === 0 && backtestStats && backtestStats.totalTrades > 0) {
  //   console.error('🚨 [BUG] Stats shows trades but trades array is empty!', {
  //     statsTradesCount: backtestStats.totalTrades,
  //     backtestTradesLength: backtestTrades.length,
  //   });
  // }

  // 측정기간 계산 (백테스트 시작~끝)
  const measurementPeriod = (() => {
    if (!backtestStats) {
      return 0;
    }

    // 1순위: startDate/endDate 사용
    if (backtestStats.startDate && backtestStats.endDate) {
      const startTime = new Date(backtestStats.startDate).getTime();
      const endTime = new Date(backtestStats.endDate).getTime();
      if (!isNaN(startTime) && !isNaN(endTime)) {
        return endTime - startTime;
      }
    }

    // 2순위: equityCurve 첫/마지막 타임스탬프 사용
    if (equityCurve && equityCurve.length >= 2) {
      const firstTime = (typeof equityCurve[0].timestamp === 'number'
        ? equityCurve[0].timestamp
        : new Date(equityCurve[0].timestamp).getTime()) as number;
      const lastTime = (typeof equityCurve[equityCurve.length - 1].timestamp === 'number'
        ? equityCurve[equityCurve.length - 1].timestamp
        : new Date(equityCurve[equityCurve.length - 1].timestamp).getTime()) as number;

      if (!isNaN(firstTime) && !isNaN(lastTime)) {
        return lastTime - firstTime;
      }
    }

    // 3순위: backtestTrades 첫/마지막 거래 시간 사용
    if (backtestTrades && backtestTrades.length >= 1) {
      const entryTimes = backtestTrades.map(t => toSeconds(t.entryTime) * 1000);
      const exitTimes = backtestTrades.map(t => toSeconds(t.exitTime) * 1000);
      const allTimes = [...entryTimes, ...exitTimes];
      const minTime = Math.min(...allTimes);
      const maxTime = Math.max(...allTimes);

      if (isFinite(minTime) && isFinite(maxTime)) {
        return maxTime - minTime;
      }
    }

    console.warn('[measurementPeriod] No valid data source found', {
      hasBacktestStats: !!backtestStats,
      hasEquityCurve: !!equityCurve && equityCurve.length > 0,
      hasBacktestTrades: !!backtestTrades && backtestTrades.length > 0,
    });
    return 0;
  })();

  // 로그 제거: 과도한 재렌더링으로 콘솔 flood 방지

  const formatDuration = (ms: number, short = false) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0) {
      return short ? `${days}일` : `${days}일 ${remainingHours}시간`;
    }
    return `${hours}시간`;
  };

  return (
    <div className='flex flex-col gap-4 w-full'>
      {/* 상단: 통계 헤더 (전체 너비) */}
      {backtestStats ? (
        <div className='flex items-center gap-3 px-4 py-2 bg-zinc-900 rounded-lg flex-wrap'>
          {/* 레버리지 설정 */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>레버리지</span>
            <select
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className='bg-zinc-800 text-zinc-200 text-xs font-bold px-2 py-0.5 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500'
            >
              {[1, 2, 3, 5, 10, 15, 20, 25, 30, 50, 75, 100, 125].map((lev) => (
                <option key={lev} value={lev}>{lev}x</option>
              ))}
            </select>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 수익 (레버리지 적용) */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>수익</span>
            <span className={`text-sm font-bold ${backtestStats.totalPnlPercent * leverage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {backtestStats.totalPnlPercent * leverage >= 0 ? '+' : ''}{(backtestStats.totalPnlPercent * leverage).toFixed(1)}%
            </span>
            {leverage > 1 && (
              <span className='text-zinc-600 text-[10px]'>({backtestStats.totalPnlPercent >= 0 ? '+' : ''}{backtestStats.totalPnlPercent.toFixed(1)}% × {leverage})</span>
            )}
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 승률 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>승률</span>
            <span className={`text-sm font-bold ${backtestStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {backtestStats.winRate.toFixed(0)}%
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 측정기간 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>측정</span>
            <span className='text-zinc-300 text-sm font-bold'>{formatDuration(measurementPeriod, true)}</span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 포지션 보유시간 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>보유</span>
            <span className='text-cyan-400 text-sm font-bold'>{formatDuration(totalHoldingTime)}</span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 거래 횟수 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>거래</span>
            <span className={`text-sm font-bold ${backtestStats.totalTrades === 0 ? 'text-yellow-500' : 'text-zinc-300'}`}>
              {backtestStats.totalTrades}회
            </span>
            {backtestStats.totalTrades === 0 && selectedStrategy && (
              <span className='text-yellow-500 text-[10px]' title={`필터: ${selectedStrategy.rsiExtremeFilter || 'OFF'} / 지표: ${selectedStrategy.indicators}`}>
                ⚠ 필터 확인
              </span>
            )}
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 샤프 비율 (위험 대비 수익) */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>샤프</span>
            <span className='text-zinc-600 text-[10px]'>(위험대비)</span>
            <span className='text-zinc-300 text-sm font-bold'>{backtestStats.sharpeRatio.toFixed(2)}</span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 손익비 (Profit Factor) */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>손익비</span>
            <span className='text-zinc-600 text-[10px]'>(익절/손절)</span>
            <span className='text-zinc-300 text-sm font-bold'>{(backtestStats.profitFactor ?? 0).toFixed(2)}</span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* MDD (최대 낙폭) - 레버리지 적용 */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>MDD</span>
            <span className='text-zinc-600 text-[10px]'>(최대손실)</span>
            <span className={`text-sm font-bold ${(backtestStats.maxDrawdownPercent ?? 0) * leverage >= 100 ? 'text-red-500' : 'text-zinc-300'}`}>
              -{((backtestStats.maxDrawdownPercent ?? 0) * leverage).toFixed(1)}%
            </span>
            {(backtestStats.maxDrawdownPercent ?? 0) * leverage >= 100 && (
              <span className='text-red-500 text-[10px]'>⚠ 청산</span>
            )}
          </div>
        </div>
      ) : selectedStrategy && (
        /* 스켈레톤 로더: 전략 선택됨 + 백테스트 결과 로딩 중 */
        <div className='flex items-center gap-3 px-4 py-2 bg-zinc-900 rounded-lg animate-pulse'>
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>레버리지</span>
            <div className='w-12 h-5 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>수익</span>
            <div className='w-16 h-4 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>승률</span>
            <div className='w-10 h-4 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>측정</span>
            <div className='w-12 h-4 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>보유</span>
            <div className='w-12 h-4 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>거래</span>
            <div className='w-10 h-4 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>샤프</span>
            <div className='w-10 h-4 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>손익비</span>
            <div className='w-10 h-4 bg-zinc-800 rounded' />
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>MDD</span>
            <div className='w-12 h-4 bg-zinc-800 rounded' />
          </div>
        </div>
      )}

      <div className='grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px] gap-4 min-h-[calc(100vh-180px)]'>
      {/* 좌측: 메인 차트 영역 */}
      <div className='bg-zinc-900 p-4 rounded-lg min-w-0 flex flex-col overflow-hidden'>
        {/* 1. 헤더: 연결 상태 + 설정 */}
        <div className='flex items-center justify-between mb-3'>
          {/* 좌측: 연결 상태 + 백테스트 상태 */}
          <div className='flex items-center gap-4'>
            <div className='flex items-center gap-2'>
              <span
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className='text-xs text-zinc-400'>
                {isConnected ? '실시간' : '연결 끊김'}
              </span>
            </div>
            {/* 다음 캔들 카운트다운 */}
            <div className='flex items-center gap-2 px-2 py-1 bg-zinc-800 rounded'>
              <span className='text-xs text-zinc-500'>다음 캔들</span>
              <span
                className={`text-xs font-mono ${nextCandleCountdown <= 10 ? 'text-yellow-400' : 'text-zinc-300'}`}
              >
                {Math.floor(nextCandleCountdown / 60)}:
                {(nextCandleCountdown % 60).toString().padStart(2, '0')}
              </span>
            </div>
            {/* 백테스트 상태 */}
            <div className='flex items-center gap-2'>
              {isBacktestRunning ? (
                <span className='flex items-center gap-1 text-xs text-blue-400'>
                  <span className='w-2 h-2 rounded-full bg-blue-400 animate-pulse' />
                  분석중...
                </span>
              ) : lastBacktestTime ? (
                <span className='text-xs text-zinc-500'>
                  마지막 분석:{' '}
                  {lastBacktestTime.toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              ) : null}
            </div>
          </div>

          {/* 우측: 현재 전략 + 타임프레임 + 사운드 + 설정 버튼 */}
          <div className='flex items-center gap-2'>
            {/* 현재 선택된 전략 표시 (하단 패널에서 선택) */}
            <div className='px-3 py-1.5 bg-zinc-800 rounded text-xs min-w-[180px]'>
              {isLoadingAllStrategies ? (
                <div className='flex items-center gap-2'>
                  <div className='w-3 h-3 rounded-full bg-blue-400 animate-pulse' />
                  <span className='text-zinc-400'>전략 분석중...</span>
                </div>
              ) : selectedStrategy ? (
                <span className='text-white'>
                  {getStrategyDisplayName(selectedStrategy)}
                  {backtestStats && (
                    <span className={`ml-2 ${backtestStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      {backtestStats.winRate.toFixed(0)}%
                    </span>
                  )}
                </span>
              ) : (
                <span className='text-zinc-500'>전략 없음</span>
              )}
            </div>

            {/* 타임프레임 표시 */}
            <div className='size-9 flex items-center justify-center p-2 bg-zinc-800 rounded text-xs text-zinc-400 leading-10'>
              {timeframe}
            </div>
            {/* 사운드 상태 */}
            <div className='p-2 bg-zinc-800 rounded text-sm'>
              {soundEnabled ? '🔊' : '🔇'}
            </div>
            {/* 설정 버튼 */}
            <div className='relative'>
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`p-2 rounded transition-colors ${
                  isSettingsOpen
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
                title='설정'
              >
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
                  />
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                  />
                </svg>
              </button>

              {/* 설정 패널 */}
              {isSettingsOpen && (
                <div className='absolute top-full right-0 mt-2 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 p-4 space-y-4'>
                  {/* 타임프레임 */}
                  <div>
                    <div className='text-xs text-zinc-400 mb-2'>타임프레임</div>
                    <div className='flex items-center gap-1'>
                      {['1m', '5m', '15m', '1h'].map((tf) => (
                        <button
                          key={tf}
                          onClick={() => {
                            if (tf !== timeframe) {
                              manuallySelectedRef.current = false; // 타임프레임 변경 시 수동 선택 플래그 리셋
                              savedStrategyIdRef.current = null;
                              localStorage.removeItem('selectedStrategyId');
                              localStorage.removeItem('selectedStrategyTimeframe');
                            }
                            setTimeframe(tf);
                          }}
                          className={`flex-1 px-2 py-1.5 text-xs rounded ${
                            timeframe === tf
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-700 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 사운드 설정 */}
                  <div>
                    <div className='text-xs text-zinc-400 mb-2'>
                      사운드 알림
                    </div>
                    <div className='flex items-center gap-3'>
                      <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
                          soundEnabled
                            ? 'bg-green-600/30 text-green-400'
                            : 'bg-zinc-700 text-zinc-500'
                        }`}
                      >
                        {soundEnabled ? '🔊 켜짐' : '🔇 꺼짐'}
                      </button>
                      <div className='flex-1 flex items-center gap-2'>
                        <input
                          type='range'
                          min='0'
                          max='100'
                          value={soundVolume * 100}
                          onChange={(e) =>
                            setSoundVolume(Number(e.target.value) / 100)
                          }
                          className='flex-1 h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500'
                          disabled={!soundEnabled}
                        />
                        <span className='text-zinc-500 text-xs w-8'>
                          {Math.round(soundVolume * 100)}%
                        </span>
                      </div>
                    </div>
                    {/* 테스트 버튼 */}
                    <div className='flex gap-1 mt-2'>
                      <button
                        onClick={() => playAlertSound('bullish', true)}
                        className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-green-600/30 text-green-400 text-xs rounded transition-colors'
                      >
                        🚀 롱
                      </button>
                      <button
                        onClick={() => playAlertSound('bearish', true)}
                        className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-red-600/30 text-red-400 text-xs rounded transition-colors'
                      >
                        🌧 숏
                      </button>
                      <button
                        onClick={() => playExitSound(true, true)}
                        className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-green-600/30 text-green-400 text-xs rounded transition-colors'
                      >
                        🪙 익절
                      </button>
                      <button
                        onClick={() => playExitSound(false, true)}
                        className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-red-600/30 text-red-400 text-xs rounded transition-colors'
                      >
                        💸 손절
                      </button>
                    </div>
                  </div>

                  {/* 자동 최적화 설정 */}
                  <div>
                    <div className='text-xs text-zinc-400 mb-2'>
                      자동 파라미터 최적화
                    </div>
                    <div className='flex items-center gap-3'>
                      <button
                        onClick={() => setAutoOptimizeEnabled(!autoOptimizeEnabled)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
                          autoOptimizeEnabled
                            ? 'bg-blue-600/30 text-blue-400'
                            : 'bg-zinc-700 text-zinc-500'
                        }`}
                      >
                        {autoOptimizeEnabled ? '⚡ 활성화' : '⏸ 비활성화'}
                      </button>
                      <button
                        onClick={() => triggerManualOptimize()}
                        disabled={isAutoOptimizing}
                        className='flex-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors disabled:opacity-50'
                      >
                        {isAutoOptimizing ? '최적화 중...' : '수동 실행'}
                      </button>
                    </div>
                    {/* 상태 표시 */}
                    <div className='mt-2 text-xs text-zinc-500'>
                      {isAutoOptimizing && (
                        <span className='text-blue-400'>⚡ 최적화 진행 중...</span>
                      )}
                      {lastOptimizeTime && !isAutoOptimizing && (
                        <span>
                          마지막 실행: {new Date(lastOptimizeTime).toLocaleTimeString()}
                        </span>
                      )}
                      {autoOptimizeResult && !isAutoOptimizing && (
                        <div className='mt-1'>
                          {autoOptimizeResult.results.map((r) => (
                            <div key={r.strategy} className={r.updated ? 'text-green-400' : 'text-zinc-500'}>
                              {r.strategy}: SR {r.bestSharpe} {r.updated && '✓'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Walk-Forward 백테스트 설정 */}
                  <div>
                    <div className='text-xs text-zinc-400 mb-2'>
                      Walk-Forward 백테스트
                    </div>
                    <button
                      onClick={() => setUseWalkForward(!useWalkForward)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-xs transition-colors ${
                        useWalkForward
                          ? 'bg-purple-600/30 text-purple-400 ring-1 ring-purple-500/50'
                          : 'bg-zinc-700 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span>{useWalkForward ? '🔬 활성화' : '📊 비활성화'}</span>
                      <span className='text-[10px] opacity-70'>
                        {useWalkForward ? 'Out-of-Sample' : '전체 기간'}
                      </span>
                    </button>
                    <div className='mt-2 text-[10px] text-zinc-500'>
                      {useWalkForward
                        ? '각 주마다 과거 데이터로 최적화된 파라미터 사용 (실전 시뮬레이션)'
                        : '전체 기간 동일한 파라미터 사용 (백테스트)'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. 열린 포지션 카드 */}
        {openPosition && (
          <div
            className={`mb-3 p-3 rounded-lg border ${
              openPosition.direction === 'long'
                ? 'bg-green-900/20 border-green-500/50'
                : 'bg-red-900/20 border-red-500/50'
            }`}
          >
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <span
                  className={`text-xl font-bold ${openPosition.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}
                >
                  {openPosition.direction === 'long'
                    ? '🟢 롱 진행중'
                    : '🔴 숏 진행중'}
                </span>
                <div className='flex items-center gap-2 text-sm'>
                  <span className='text-zinc-400'>진입</span>
                  <span className='text-white font-medium'>
                    ${openPosition.entryPrice.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className='flex items-center gap-4'>
                {/* 실시간 PnL */}
                {(() => {
                  const currentPrice =
                    ticker?.price || openPosition.currentPrice;
                  const isLong = openPosition.direction === 'long';
                  const pnlPercent = isLong
                    ? ((currentPrice - openPosition.entryPrice) /
                        openPosition.entryPrice) *
                      100
                    : ((openPosition.entryPrice - currentPrice) /
                        openPosition.entryPrice) *
                      100;
                  const pnl =
                    (pnlPercent / 100) *
                    openPosition.size *
                    openPosition.entryPrice;
                  const isProfit = pnl >= 0;

                  return (
                    <div
                      className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {isProfit ? '+' : ''}
                      {pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                    </div>
                  );
                })()}
                {/* TP/SL */}
                <div className='flex gap-3 text-xs'>
                  <div className='text-center'>
                    <div className='text-green-400'>TP</div>
                    <div className='text-white'>
                      ${openPosition.tp.toFixed(0)}
                    </div>
                  </div>
                  <div className='text-center'>
                    <div className='text-red-400'>SL</div>
                    <div className='text-white'>
                      ${openPosition.sl.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
        {divergenceData && (
          <div className='mt-4 p-3 bg-zinc-800 rounded-lg'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <span
                  className={`text-lg ${divergenceData.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}
                >
                  {divergenceData.direction === 'bullish'
                    ? '🚀 롱 신호'
                    : '🌧 숏 신호'}
                </span>
                <span className='text-zinc-400 text-sm'>
                  @ ${divergenceData.price.toLocaleString()}
                </span>
              </div>
              <div className='text-right'>
                <div className='text-sm text-zinc-400'>
                  RSI: {divergenceData.rsiValue.toFixed(1)} | 강도:{' '}
                  {divergenceData.strength}
                </div>
                <div className='text-xs text-zinc-500'>
                  {formatKST(toSeconds(divergenceData.timestamp))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 신호 히스토리 */}
        {divergenceHistory.length > 0 && (
          <div className='mt-4'>
            <h3 className='text-sm font-medium text-zinc-400 mb-2'>
              최근 신호 ({divergenceHistory.length})
            </h3>
            <div className='max-h-40 overflow-y-auto space-y-1 custom-scrollbar'>
              {[...divergenceHistory]
                .reverse()
                .slice(0, 10)
                .map((signal, idx) => (
                  <div
                    key={idx}
                    className='flex items-center justify-between text-xs p-2 bg-zinc-800 rounded'
                  >
                    <span
                      className={
                        signal.direction === 'bullish'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }
                    >
                      {signal.direction === 'bullish' ? '🚀 롱' : '🌧 숏'}
                    </span>
                    <span className='text-zinc-300'>
                      ${signal.price.toLocaleString()}
                    </span>
                    <span className='text-zinc-500'>
                      {formatKST(toSeconds(signal.timestamp))}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 범례 */}
        <div className='mt-3 flex flex-wrap gap-4 text-xs text-zinc-400'>
          <span className='flex items-center gap-1'>
            <span className='text-green-400'>▲</span> 롱 진입
          </span>
          <span className='flex items-center gap-1'>
            <span className='text-red-400'>▼</span> 숏 진입
          </span>
          <span className='flex items-center gap-1'>
            <span className='text-green-400'>●</span> 익절
          </span>
          <span className='flex items-center gap-1'>
            <span className='text-yellow-300'>●</span> 손절
          </span>
          <span className='flex items-center gap-1'>
            <span className='text-gray-400'>●</span> 수수료 손실
          </span>
          <span className='flex items-center gap-1'>
            <span className='text-gray-400'>▲▼</span> 스킵
          </span>
          <span className='flex items-center gap-1'>
            <span>🚀</span> 롱 진행중
          </span>
          <span className='flex items-center gap-1'>
            <span>🌧️</span> 숏 진행중
          </span>
          {backtestTrades.length > 0 && (
            <span className='text-zinc-500'>
              | 거래: {backtestTrades.length}건
            </span>
          )}
          {skippedSignals.length > 0 && (
            <span className='text-gray-400'>
              | 스킵: {skippedSignals.length}건
            </span>
          )}
        </div>
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
          </h3>
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
            {strategies.slice(0, 30).map((strategy, idx) => {
              const preview = strategyPreviews.get(strategy.id);
              const isRollingResult = strategy.id < 0;
              const displayName = getStrategyDisplayName(strategy);
              const isSelected = selectedStrategy?.id === strategy.id;

              const strategyType = strategy.strategy || 'rsi_div';
              const rollingSharpe = rollingSharpeMap.get(strategyType);

              return (
                <div
                  key={strategy.id}
                  className={`w-full px-2 py-2 text-left text-xs rounded transition-colors relative ${
                    isSelected
                      ? 'bg-blue-600/30 border border-blue-500/50'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}
                >
                  {/* 삭제 버튼 (우측 상단) */}
                  {!isRollingResult && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm('이 전략을 삭제하시겠습니까?')) return;
                        try {
                          await deleteSavedResult(strategy.id);
                          refetchStrategies(); // Refetch strategies from hook
                          if (selectedStrategy?.id === strategy.id) {
                            setSelectedStrategy(null);
                          }
                        } catch (err) {
                          console.error('삭제 실패:', err);
                        }
                      }}
                      className='absolute top-1 right-1 p-0.5 text-zinc-500 hover:text-red-400 transition-colors z-10'
                      title='전략 삭제'
                    >
                      <X size={12} />
                    </button>
                  )}

                  <button
                    onClick={() => handleStrategyChange(strategy)}
                    className='w-full text-left'
                  >
                    <div className='flex gap-2'>
                      {/* 왼쪽: 정보 */}
                      <div className='flex-1 min-w-0'>
                        {/* 상단: 전략명 + 포지션 + 최근 Sharpe */}
                        <div className='flex justify-between items-start mb-1'>
                          <div className='flex items-center gap-1.5 min-w-0'>
                            <span className='text-zinc-300 text-[11px] font-medium truncate'>
                              {displayName}
                            </span>
                            {/* 현재 포지션 칩 (모든 전략의 캐시된 포지션 표시) */}
                            {(() => {
                              // 선택된 전략이면 현재 state 사용, 아니면 캐시 확인
                              const position = isSelected
                                ? openPosition
                                : backtestCacheRef.current.get(`${strategy.id}_${currentSymbol.id}_${timeframe}`)?.openPosition;

                              if (!position) return null;

                              return (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 ${
                                  position.direction === 'long'
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}>
                                  {position.direction === 'long' ? '롱' : '숏'}
                                </span>
                              );
                            })()}
                          </div>
                          {rollingSharpe && rollingSharpe.periods && rollingSharpe.periods.length > 0 && (
                            <div className={`text-[10px] font-bold shrink-0 ${
                              (rollingSharpe.periods[0].sharpe ?? 0) >= 1 ? 'text-green-400' :
                              (rollingSharpe.periods[0].sharpe ?? 0) >= 0 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              SR {rollingSharpe.periods[0].sharpe?.toFixed(1) ?? '—'}
                            </div>
                          )}
                        </div>

                        {/* 중간: 승률 | 수익률 | 거래수 */}
                        <div className='flex items-center gap-1'>
                          {preview?.loading ? (
                            <span className='text-zinc-500 text-[8px]'>분석중...</span>
                          ) : preview && preview.totalTrades > 0 ? (
                            <>
                              <span className={`text-[9px] ${preview.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                {preview.winRate.toFixed(0)}%
                              </span>
                              <span className='text-zinc-600 text-[9px]'>|</span>
                              <span className={`text-[9px] ${preview.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {preview.totalPnlPercent >= 0 ? '+' : ''}{preview.totalPnlPercent.toFixed(1)}%
                              </span>
                              <span className='text-zinc-600 text-[9px]'>|</span>
                              <span className='text-zinc-400 text-[9px]'>
                                {preview.totalTrades}회
                              </span>
                            </>
                          ) : (
                            <span className='text-zinc-600 text-[8px]'>—</span>
                          )}
                        </div>
                      </div>

                      {/* 오른쪽: Equity Curve 차트 (최근 12주 수익률) */}
                      <div className='w-11 shrink-0'>
                        {(() => {
                          const equityCurve = allStrategiesEquityCurves.get(strategy.id);
                          if (!equityCurve || equityCurve.length === 0) {
                            return (
                              <div className='w-full h-8 flex items-center justify-center text-[7px] text-zinc-600'>
                                -
                              </div>
                            );
                          }

                          // 최근 12주 데이터 필터링
                          const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
                          const WEEKS_TO_SHOW = 12;
                          const lastPoint = equityCurve[equityCurve.length - 1];
                          const endTime = typeof lastPoint.timestamp === 'number'
                            ? lastPoint.timestamp
                            : new Date(lastPoint.timestamp).getTime();
                          const startTime = endTime - WEEKS_TO_SHOW * WEEK_MS;

                          const filteredCurve = equityCurve.filter((point) => {
                            const timestamp = typeof point.timestamp === 'number'
                              ? point.timestamp
                              : new Date(point.timestamp).getTime();
                            return timestamp >= startTime;
                          });

                          if (filteredCurve.length < 2) {
                            return (
                              <div className='w-full h-8 flex items-center justify-center text-[7px] text-zinc-600'>
                                -
                              </div>
                            );
                          }

                          // 12주 시작점 기준 수익률 계산
                          const startEquity = filteredCurve[0].equity;
                          const returns = filteredCurve.map(p => ((p.equity - startEquity) / startEquity) * 100);

                          const finalReturn = returns[returns.length - 1];
                          const color = finalReturn >= 0 ? '#22c55e' : '#ef4444';

                          // 실제 데이터 범위 계산 (고정값 대신)
                          const actualMax = Math.max(...returns);
                          const actualMin = Math.min(...returns);
                          const max = Math.max(actualMax, 0.1); // 최소 범위 보장
                          const min = Math.min(actualMin, -0.1);
                          const range = max - min || 0.2;

                          // 점들의 좌표 계산
                          const points = returns.map((val, i) => {
                            const x = 2 + (i / (returns.length - 1)) * 36;
                            const y = 18 - ((val - min) / range) * 14;
                            return { x, y, val };
                          });

                          // 선 그리기
                          const pathD = points.map((p, i) =>
                            `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
                          ).join(' ');

                          return (
                            <div className='w-full'>
                              <svg width="100%" height="20" viewBox="0 0 40 20" className="w-full">
                                {/* 0선 */}
                                <line
                                  x1="2"
                                  y1={18 - ((0 - min) / range) * 14}
                                  x2="38"
                                  y2={18 - ((0 - min) / range) * 14}
                                  stroke="#52525b"
                                  strokeWidth="0.3"
                                  strokeDasharray="1,1"
                                />

                                {/* 데이터 선 */}
                                <path d={pathD} stroke={color} strokeWidth="1" fill="none" />

                                {/* 끝점 표시 */}
                                <circle
                                  cx={points[points.length - 1].x}
                                  cy={points[points.length - 1].y}
                                  r="1"
                                  fill={color}
                                />
                              </svg>
                              {/* 수익률 표시 */}
                              <div className='text-center text-[8px] -mt-0.5' style={{ color }}>
                                {finalReturn >= 0 ? '+' : ''}{finalReturn.toFixed(1)}%
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* 멀티 전략 비교 차트 */}
      {(isLoadingAllStrategies || isLoadingEquityCurves) ? (
        <div className="bg-zinc-900 p-4 rounded-lg animate-pulse">
          <div className="flex justify-between items-center mb-4">
            <div className="h-4 w-32 bg-zinc-800 rounded"></div>
            <div className="h-3 w-24 bg-zinc-800 rounded"></div>
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-6 w-32 bg-zinc-800 rounded"></div>
            ))}
          </div>
          <div className="w-full h-[500px] bg-zinc-800 rounded flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
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
      ) : null}

      {/* 주별 Sharpe Ratio 타임라인 */}
      {(isLoadingAllStrategies || isLoadingEquityCurves) ? (
        <div className="bg-zinc-900 p-4 rounded-lg animate-pulse">
          <div className="flex justify-between items-center mb-4">
            <div className="h-4 w-48 bg-zinc-800 rounded"></div>
            <div className="h-3 w-20 bg-zinc-800 rounded"></div>
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 w-40 bg-zinc-800 rounded"></div>
            ))}
          </div>
          <div className="w-full h-[400px] bg-zinc-800 rounded flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <div className="text-sm text-zinc-400">주별 Sharpe 계산 중...</div>
            </div>
          </div>
          <div className="mt-2 h-3 w-full bg-zinc-800 rounded"></div>
        </div>
      ) : allStrategiesEquityCurves.size > 0 ? (
        <WeeklySharpeTimeline
          strategies={chartStrategies}
          highlightedStrategyId={highlightedStrategy}
          leverage={leverage}
          onStrategyClick={handleStrategyClickMemo}
        />
      ) : null}

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
                  const allValues = [...currentValues, ...futureValues];
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
                  const junctionY = getY(finalEquity);
                  const futureLastY = getY(futureValues[futureValues.length - 1]);

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
            ) : backtestTrades.length > 0 ? (
              [...backtestTrades]
                .sort(
                  (a, b) =>
                    new Date(b.exitTime).getTime() -
                    new Date(a.exitTime).getTime(),
                )
                .map((trade, idx) => {
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
                      onClick={() =>
                        setSelectedTrade(isSelected ? null : trade)
                      }
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
