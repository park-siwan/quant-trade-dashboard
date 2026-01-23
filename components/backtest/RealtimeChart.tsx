'use client';

import { useEffect, useRef, useState } from 'react';
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
  SavedOptimizeResult,
  runBacktest,
  TradeResult,
  SkippedSignal,
  OpenPosition,
  BacktestResult,
} from '@/lib/backtest-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// 거래 시간 문자열을 UTC timestamp(초)로 변환 (BacktestChart와 동일)
const parseTradeTime = (timeStr: string): number => {
  // 백테스트 API에서 오는 시간은 UTC (Z 없이)
  const utcStr = timeStr.endsWith('Z') ? timeStr : timeStr + 'Z';
  return new Date(utcStr).getTime() / 1000;
};

// KST 시간 포맷
const formatKST = (utcTimestamp: number): string => {
  const date = new Date(utcTimestamp);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export default function RealtimeChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]); // TP/SL/Entry price lines
  const isChartDisposedRef = useRef(false);
  const {
    isConnected,
    kline,
    ticker,
    divergenceData,
    divergenceHistory,
    subscribeKline,
  } = useSocket();

  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [timeframe, setTimeframe] = useState('5m');
  const [isLoading, setIsLoading] = useState(true);
  const [strategies, setStrategies] = useState<SavedOptimizeResult[]>([]);
  const [selectedStrategy, setSelectedStrategy] =
    useState<SavedOptimizeResult | null>(null);
  const [isStrategyOpen, setIsStrategyOpen] = useState(false);
  const [backtestTrades, setBacktestTrades] = useState<TradeResult[]>([]);
  const [skippedSignals, setSkippedSignals] = useState<SkippedSignal[]>([]);
  const [openPosition, setOpenPosition] = useState<OpenPosition | null>(null);
  const [backtestStats, setBacktestStats] = useState<BacktestResult | null>(
    null,
  );

  // 툴팁 관련 상태
  const [hoveredTrade, setHoveredTrade] = useState<TradeResult | null>(null);
  const [hoveredSkipped, setHoveredSkipped] = useState<SkippedSignal | null>(
    null,
  );
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const tradeMapRef = useRef<
    Map<
      number,
      {
        trade?: TradeResult;
        skipped?: SkippedSignal;
        type: 'entry' | 'exit' | 'skipped';
      }
    >
  >(new Map());
  const initialCandlesLoadedRef = useRef(false);
  const [chartKey, setChartKey] = useState(0); // 차트 재생성 트리거

  // 알림 관련 상태
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(1); // 0 ~ 1 (기본 100%)
  const lastSignalIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastExitAlertRef = useRef<string | null>(null); // TP/SL 알림 중복 방지

  // 설정 패널 상태
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 백테스트 갱신 상태
  const [lastBacktestTime, setLastBacktestTime] = useState<Date | null>(null);
  const [nextCandleCountdown, setNextCandleCountdown] = useState<number>(0);
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const lastCandleTimeRef = useRef<number>(0); // 마지막 캔들 시간 (새 캔들 감지용)

  // 백테스트 throttling (중복 호출 방지)
  const lastBacktestCallRef = useRef<{ strategyId: number; timeframe: string; timestamp: number } | null>(null);
  const BACKTEST_THROTTLE_MS = 2000; // 동일 전략/타임프레임으로 2초 내 재호출 방지

  // 8bit 스타일 소리 알림 함수 (Web Audio API)
  const playAlertSound = (
    direction: 'bullish' | 'bearish',
    forcePlay = false,
  ) => {
    if (!soundEnabled && !forcePlay) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      const ctx = audioContextRef.current;

      // 8bit 스타일: square wave 사용
      const playNote = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square'; // 8bit 사운드 특징
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(soundVolume * 0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const t = ctx.currentTime;
      if (direction === 'bullish') {
        // 롱 신호: 밝고 경쾌한 상승 멜로디 (마리오 코인 + 레벨업)
        playNote(523.25, t, 0.08); // C5
        playNote(659.25, t + 0.08, 0.08); // E5
        playNote(783.99, t + 0.16, 0.08); // G5
        playNote(1046.5, t + 0.24, 0.12); // C6
        playNote(1318.51, t + 0.36, 0.12); // E6
        playNote(1567.98, t + 0.48, 0.25); // G6 (높게 마무리)
      } else {
        // 숏 신호: 신비롭고 쿨한 하강 멜로디 (보물 발견 느낌)
        playNote(1046.5, t, 0.08); // C6
        playNote(932.33, t + 0.08, 0.08); // Bb5
        playNote(783.99, t + 0.16, 0.08); // G5
        playNote(622.25, t + 0.24, 0.12); // Eb5
        playNote(523.25, t + 0.36, 0.12); // C5
        playNote(392.0, t + 0.48, 0.25); // G4 (낮게 마무리)
      }
    } catch (err) {
      console.error('Failed to play alert sound:', err);
    }
  };

  // TP/SL 청산 알림 함수 (익절: 캐셔 소리, 손절: 경고음)
  const playExitSound = (isProfit: boolean, forcePlay = false) => {
    if (!soundEnabled && !forcePlay) return;

    try {
      if (isProfit) {
        // 익절: 캐셔 소리 파일 재생
        const audio = new Audio('/sounds/cashier.mp3');
        audio.volume = soundVolume;
        audio.play().catch((err) => {
          console.error('Failed to play cashier sound:', err);
          // 폴백: Web Audio API 사용
          playFallbackExitSound(true);
        });
      } else {
        // 손절: Web Audio API로 경고음 재생
        playFallbackExitSound(false);
      }
    } catch (err) {
      console.error('Failed to play exit sound:', err);
    }
  };

  // 8bit 스타일 폴백 소리 (오디오 파일 재생 실패 시)
  const playFallbackExitSound = (isProfit: boolean) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      const ctx = audioContextRef.current;

      const playNote = (
        freq: number,
        startTime: number,
        duration: number,
        type: OscillatorType = 'square',
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(soundVolume * 0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const t = ctx.currentTime;
      if (isProfit) {
        // 익절: 8bit 승리 팡파레 (젤다 아이템 획득 느낌)
        playNote(523.25, t, 0.08); // C5
        playNote(659.25, t + 0.08, 0.08); // E5
        playNote(783.99, t + 0.16, 0.08); // G5
        playNote(1046.5, t + 0.24, 0.15); // C6
        playNote(783.99, t + 0.4, 0.08); // G5
        playNote(1046.5, t + 0.48, 0.08); // C6
        playNote(1318.51, t + 0.56, 0.25); // E6 (길게)
        playNote(1567.98, t + 0.82, 0.35); // G6 (더 길게, 마무리)
      } else {
        // 손절: 8bit 실패/데미지 사운드 (팩맨 죽음 느낌)
        playNote(493.88, t, 0.12, 'sawtooth'); // B4
        playNote(440.0, t + 0.12, 0.12, 'sawtooth'); // A4
        playNote(392.0, t + 0.24, 0.12, 'sawtooth'); // G4
        playNote(349.23, t + 0.36, 0.12, 'sawtooth'); // F4
        playNote(329.63, t + 0.48, 0.15, 'sawtooth'); // E4
        playNote(293.66, t + 0.64, 0.15, 'sawtooth'); // D4
        playNote(261.63, t + 0.8, 0.2, 'sawtooth'); // C4
        playNote(196.0, t + 1.0, 0.35, 'sawtooth'); // G3 (낮게 마무리)
      }
    } catch (err) {
      console.error('Failed to play fallback exit sound:', err);
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

  // 상위 전략 목록 로드
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const results = await getTopSavedResults('sharpe', 10);
        setStrategies(results);
        if (results.length > 0 && !selectedStrategy) {
          setSelectedStrategy(results[0]);
        }
      } catch (err) {
        console.error('Failed to load strategies:', err);
      }
    };
    loadStrategies();
  }, []);

  // 전략 변경 핸들러
  const handleStrategyChange = async (strategy: SavedOptimizeResult) => {
    setSelectedStrategy(strategy);
    setIsStrategyOpen(false);
    await changeStrategy(strategy.id);
    // 제거: loadBacktestTrades(strategy)
    // useEffect가 selectedStrategy 변경을 감지하여 자동으로 백테스트 실행
    // 중복 호출 방지됨
  };

  // 선택된 전략으로 백테스트 실행 (재시도 포함 + throttling)
  const loadBacktestTrades = async (
    strategy: SavedOptimizeResult,
    retryCount = 0,
    forceRun = false,
  ) => {
    // Throttling: 동일 전략/타임프레임으로 짧은 시간 내 중복 호출 방지
    const now = Date.now();
    if (
      !forceRun &&
      lastBacktestCallRef.current &&
      lastBacktestCallRef.current.strategyId === strategy.id &&
      lastBacktestCallRef.current.timeframe === timeframe &&
      now - lastBacktestCallRef.current.timestamp < BACKTEST_THROTTLE_MS
    ) {
      console.log('[Backtest] Skipped duplicate call (throttled)');
      return;
    }

    lastBacktestCallRef.current = {
      strategyId: strategy.id,
      timeframe,
      timestamp: now,
    };

    setIsBacktestRunning(true);
    try {
      const indicators = strategy.indicators
        ? strategy.indicators.split(',').filter(Boolean)
        : ['rsi'];
      const result = await runBacktest({
        symbol: 'BTC/USDT',
        timeframe: timeframe,
        candleCount: 500,
        rsiPeriod: strategy.rsiPeriod,
        pivotLeftBars: strategy.pivotLeft,
        pivotRightBars: strategy.pivotRight,
        minDistance: strategy.minDistance,
        maxDistance: strategy.maxDistance,
        takeProfitAtr: strategy.tpAtr,
        stopLossAtr: strategy.slAtr,
        minDivergencePct: strategy.minDivPct,
        initialCapital: 1000,
        positionSizePercent: 100,
        indicators,
      });
      setBacktestTrades(result.trades);
      setSkippedSignals(result.skippedSignals || []);
      setOpenPosition(result.openPosition || null);
      setBacktestStats(result);
      setLastBacktestTime(new Date());
      console.log('[Backtest] Open position:', result.openPosition);
    } catch (err) {
      console.error('Failed to load backtest trades:', err);
      // 최대 2번 재시도
      if (retryCount < 2) {
        setTimeout(() => loadBacktestTrades(strategy, retryCount + 1), 1000);
      } else {
        setBacktestTrades([]);
        setSkippedSignals([]);
        setOpenPosition(null);
      }
    } finally {
      setIsBacktestRunning(false);
    }
  };

  // 전략/타임프레임 변경 시 백테스트 실행
  // candles.length > 0 조건만 확인 (length 변화 자체는 의존성에서 제외)
  const hasCandlesRef = useRef(false);
  useEffect(() => {
    hasCandlesRef.current = candles.length > 0;
  }, [candles.length]);

  useEffect(() => {
    if (selectedStrategy && hasCandlesRef.current && !isLoading) {
      // 전략 또는 타임프레임 변경 시 백테스트 실행
      const timer = setTimeout(() => {
        loadBacktestTrades(selectedStrategy);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedStrategy, timeframe, isLoading]);

  // 초기 캔들 데이터 로드
  useEffect(() => {
    const loadCandles = async () => {
      setIsLoading(true);
      initialCandlesLoadedRef.current = false;
      try {
        const response = await fetch(
          `${API_BASE}/exchange/candles?symbol=${encodeURIComponent('BTC/USDT')}&timeframe=${timeframe}&limit=500`,
        );
        const data = await response.json();
        const candlesArray = data.data?.candles || data.candles;

        if (candlesArray && candlesArray.length > 0) {
          const formattedCandles: CandlestickData[] = candlesArray.map(
            (c: number[]) => ({
              time: (c[0] / 1000) as Time,
              open: c[1],
              high: c[2],
              low: c[3],
              close: c[4],
            }),
          );

          // 디버그 로그
          const firstTs = candlesArray[0][0];
          const lastTs = candlesArray[candlesArray.length - 1][0];
          console.log('[Candles] Loaded:', candlesArray.length);
          console.log(
            '[Candles] First:',
            new Date(firstTs).toLocaleString('ko-KR'),
          );
          console.log(
            '[Candles] Last:',
            new Date(lastTs).toLocaleString('ko-KR'),
          );
          console.log('[Candles] Now:', new Date().toLocaleString('ko-KR'));

          setCandles(formattedCandles);
          initialCandlesLoadedRef.current = true;
          // 차트 재생성 트리거
          setChartKey((prev) => prev + 1);
        }
      } catch (err) {
        console.error('Failed to load candles:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCandles();
    subscribeKline(timeframe);
  }, [timeframe, subscribeKline]);

  // 실시간 캔들 업데이트 (차트 시리즈에 직접 업데이트)
  useEffect(() => {
    if (!kline || kline.timeframe !== timeframe || isChartDisposedRef.current)
      return;

    const newCandleTime = kline.timestamp / 1000;
    const newCandle: CandlestickData = {
      time: newCandleTime as Time,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
    };

    // 새 캔들 시작 감지 (기존 캔들 시간과 다르면 새 캔들)
    const isNewCandle = lastCandleTimeRef.current > 0 && newCandleTime > lastCandleTimeRef.current;

    if (isNewCandle && selectedStrategy) {
      // 새 캔들 시작! 백테스트 재실행
      console.log('[Candle] New candle started, refreshing backtest...');
      loadBacktestTrades(selectedStrategy);
    }

    lastCandleTimeRef.current = newCandleTime;

    // 포지션 구간인지 확인하여 색상 적용
    let coloredCandle = newCandle;
    if (openPosition) {
      const entryTime = parseTradeTime(openPosition.entryTime);
      if (newCandleTime >= entryTime) {
        const isLong = openPosition.direction === 'long';
        coloredCandle = {
          ...newCandle,
          color: isLong ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
          borderColor: isLong ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
          wickColor: isLong ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
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

    // candles state도 업데이트 (마지막 캔들만 갱신, 차트 재생성 방지)
    setCandles((prev) => {
      if (prev.length === 0) return prev;

      const lastCandle = prev[prev.length - 1];
      const lastTime = lastCandle.time as number;
      const newTime = newCandle.time as number;

      // 같은 시간의 캔들이면 업데이트
      if (lastTime === newTime) {
        return [...prev.slice(0, -1), newCandle];
      }
      // 새 캔들이 더 최신이면 추가
      else if (newTime > lastTime) {
        // 최대 500개 유지
        const updated = [...prev, newCandle];
        if (updated.length > 500) {
          return updated.slice(-500);
        }
        return updated;
      }
      return prev;
    });
  }, [kline, timeframe, openPosition, selectedStrategy]);

  // 차트 초기 생성 (타임프레임 변경 또는 초기 로드 시에만)
  useEffect(() => {
    if (
      !containerRef.current ||
      candles.length === 0 ||
      !initialCandlesLoadedRef.current
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
      height: 500,
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
      },
      rightPriceScale: {
        borderColor: '#3f3f46',
      },
      timeScale: {
        borderColor: '#3f3f46',
        timeVisible: true,
        rightOffset: 20, // TP/SL 레이블 공간 (적당히)
        shiftVisibleRangeOnNewBar: true,
      },
      localization: {
        timeFormatter: (time: number) => formatKST(time * 1000),
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

    // 리사이즈 핸들러
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // 마지막 캔들 기준으로 스크롤 (rightOffset이 적용됨)
    const lastCandleTime = candles[candles.length - 1].time as number;
    console.log(
      '[Chart] Last candle time:',
      new Date(lastCandleTime * 1000).toLocaleString('ko-KR'),
    );

    // scrollToRealTime()을 사용하면 rightOffset이 적용됨
    requestAnimationFrame(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().scrollToRealTime();
        console.log('[Chart] Scrolled to realtime with rightOffset');
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      isChartDisposedRef.current = true;
      try {
        chart.remove();
      } catch {
        // 이미 disposed된 경우 무시
      }
      chartRef.current = null;
      candleSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [timeframe, chartKey]);

  // 마커 업데이트 + 거래 구간 캔들 색상 변경
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

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

    // 거래 구간별 색상 맵 생성 (캔들 시간 -> 색상)
    const tradeColorMap = new Map<
      number,
      { isLong: boolean; isWin: boolean }
    >();

    // 청산된 거래 구간 색상 설정
    if (backtestTrades.length > 0) {
      backtestTrades.forEach((trade) => {
        const entryTime = parseTradeTime(trade.entryTime);
        const exitTime = parseTradeTime(trade.exitTime);
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
      const entryTime = parseTradeTime(openPosition.entryTime);
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
            color: 'rgba(34, 197, 94, 0.25)', // 연한 초록 (롱)
            borderColor: 'rgba(34, 197, 94, 0.4)',
            wickColor: 'rgba(34, 197, 94, 0.3)',
          };
        } else {
          return {
            ...candle,
            color: 'rgba(239, 68, 68, 0.25)', // 연한 빨강 (숏)
            borderColor: 'rgba(239, 68, 68, 0.4)',
            wickColor: 'rgba(239, 68, 68, 0.3)',
          };
        }
      }
      // 거래 구간 외: 기본 무채색
      return candle;
    });

    // 색상이 적용된 캔들 데이터로 업데이트
    candleSeriesRef.current.setData(coloredCandles);

    console.log(
      '[Markers] Candle range:',
      new Date(minCandleTime * 1000).toLocaleString('ko-KR'),
      '~',
      new Date(maxCandleTime * 1000).toLocaleString('ko-KR'),
    );
    console.log('[Markers] Colored candles:', tradeColorMap.size);

    // 백테스트 거래 마커 (parseTradeTime 사용 - BacktestChart와 동일)
    if (backtestTrades.length > 0) {
      backtestTrades.forEach((trade) => {
        const entryTime = parseTradeTime(trade.entryTime);
        const exitTime = parseTradeTime(trade.exitTime);
        const isLong = trade.direction === 'long';
        const isWin = trade.pnl > 0;

        if (entryTime >= minCandleTime && entryTime <= maxCandleTime) {
          markers.push({
            time: entryTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: isLong ? '#22c55e' : '#ef4444', // 롱: 초록, 숏: 빨강
            shape: isLong ? 'arrowUp' : 'arrowDown',
            size: 1.5,
          } as SeriesMarker<Time>);
          tradeMap.set(entryTime, { trade, type: 'entry' });
        }

        if (exitTime >= minCandleTime && exitTime <= maxCandleTime) {
          markers.push({
            time: exitTime as Time,
            position: isLong ? 'aboveBar' : 'belowBar',
            color: isWin ? '#a1a1aa' : '#71717a', // 무채색 계열
            shape: 'text',
            text: isWin ? '●' : '✕',
            size: 0.3,
          } as SeriesMarker<Time>);
          tradeMap.set(exitTime, { trade, type: 'exit' });
        }
      });
    }

    // 스킵된 신호 마커 (수수료 보호) - 롱: 연한 회색 위, 숏: 진한 회색 아래
    if (skippedSignals.length > 0) {
      skippedSignals.forEach((signal) => {
        const signalTime = parseTradeTime(signal.time);
        const isLong = signal.direction === 'long';
        if (signalTime >= minCandleTime && signalTime <= maxCandleTime) {
          markers.push({
            time: signalTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: isLong ? '#a1a1aa' : '#52525b', // 롱: zinc-400 연한 회색, 숏: zinc-600 진한 회색
            shape: isLong ? 'arrowUp' : 'arrowDown',
            size: 1.5, // 캔들에 파묻히지 않도록 크기 키움
          } as SeriesMarker<Time>);
          tradeMap.set(signalTime, { skipped: signal, type: 'skipped' });
        }
      });
    }

    // 실시간 다이버전스 신호 마커
    if (divergenceHistory.length > 0) {
      divergenceHistory.forEach((signal) => {
        const signalTime = signal.timestamp / 1000;
        const isLong = signal.direction === 'bullish';
        if (signalTime >= minCandleTime && signalTime <= maxCandleTime) {
          markers.push({
            time: signalTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: isLong ? '#22c55e' : '#ef4444', // 롱: 초록, 숏: 빨강
            shape: isLong ? 'arrowUp' : 'arrowDown',
            size: 1.5,
          } as SeriesMarker<Time>);
        }
      });
    }

    // 열린 포지션 마커 (청산 안 된 진입점) - parseTradeTime 사용
    if (openPosition) {
      const entryTime = parseTradeTime(openPosition.entryTime);
      const isLong = openPosition.direction === 'long';
      if (entryTime >= minCandleTime && entryTime <= maxCandleTime) {
        markers.push({
          time: entryTime as Time,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: '#a1a1aa', // 무채색 (진행 중)
          shape: 'text',
          text: isLong ? '◐' : '◑', // 진행 중인 포지션 (반원)
          size: 0.4,
        } as SeriesMarker<Time>);
      }
    }

    // 마커 정렬 후 추가
    if (markers.length > 0) {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candleSeriesRef.current, markers);
    } else {
      createSeriesMarkers(candleSeriesRef.current, []);
    }

    tradeMapRef.current = tradeMap;
  }, [
    backtestTrades,
    skippedSignals,
    divergenceHistory,
    openPosition,
    candles.length,
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
      // Entry 라인 (노란색 실선)
      const entryLine = candleSeries.createPriceLine({
        price: openPosition.entryPrice,
        color: '#fbbf24',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: '진입',
      });
      priceLinesRef.current.push(entryLine);

      // TP 라인 (녹색 실선)
      const tpLine = candleSeries.createPriceLine({
        price: openPosition.tp,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'TP',
      });
      priceLinesRef.current.push(tpLine);

      // SL 라인 (빨간색 실선)
      const slLine = candleSeries.createPriceLine({
        price: openPosition.sl,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'SL',
      });
      priceLinesRef.current.push(slLine);

      console.log(
        `[Lines] Entry: $${openPosition.entryPrice}, TP: $${openPosition.tp}, SL: $${openPosition.sl}`,
      );
    }
  }, [openPosition]);

  return (
    <div className='bg-zinc-900 p-4 rounded-lg'>
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
            <span className={`text-xs font-mono ${nextCandleCountdown <= 10 ? 'text-yellow-400' : 'text-zinc-300'}`}>
              {Math.floor(nextCandleCountdown / 60)}:{(nextCandleCountdown % 60).toString().padStart(2, '0')}
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
                마지막 분석: {lastBacktestTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            ) : null}
          </div>
        </div>

        {/* 우측: 타임프레임 + 사운드 + 설정 버튼 */}
        <div className='flex items-center gap-2'>
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
                        onClick={() => setTimeframe(tf)}
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

                {/* 전략 선택 */}
                <div>
                  <div className='text-xs text-zinc-400 mb-2'>전략</div>
                  <div className='relative'>
                    <button
                      onClick={() => setIsStrategyOpen(!isStrategyOpen)}
                      className='w-full flex items-center justify-between px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs transition-colors'
                    >
                      {selectedStrategy ? (
                        <span className='text-white'>
                          RSI {selectedStrategy.rsiPeriod} | Pvt{' '}
                          {selectedStrategy.pivotLeft}/
                          {selectedStrategy.pivotRight} | SR{' '}
                          {selectedStrategy.sharpeRatio.toFixed(2)}
                        </span>
                      ) : (
                        <span className='text-zinc-400'>전략 선택...</span>
                      )}
                      <svg
                        className={`w-3 h-3 text-zinc-400 transition-transform ${isStrategyOpen ? 'rotate-180' : ''}`}
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M19 9l-7 7-7-7'
                        />
                      </svg>
                    </button>
                    {isStrategyOpen && strategies.length > 0 && (
                      <div className='absolute top-full left-0 right-0 mt-1 bg-zinc-700 border border-zinc-600 rounded-lg shadow-xl max-h-48 overflow-y-auto'>
                        {strategies.map((strategy, idx) => (
                          <button
                            key={strategy.id}
                            onClick={() => {
                              handleStrategyChange(strategy);
                              setIsStrategyOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-xs hover:bg-zinc-600 transition-colors ${
                              selectedStrategy?.id === strategy.id
                                ? 'bg-zinc-600'
                                : ''
                            }`}
                          >
                            <div className='flex justify-between items-center'>
                              <span className='text-zinc-300'>
                                #{idx + 1} RSI {strategy.rsiPeriod} | Pvt{' '}
                                {strategy.pivotLeft}/{strategy.pivotRight}
                              </span>
                              <span className='text-green-400'>
                                SR {strategy.sharpeRatio.toFixed(2)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 사운드 설정 */}
                <div>
                  <div className='text-xs text-zinc-400 mb-2'>사운드 알림</div>
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. 백테스트 통계 카드 */}
      {backtestStats && (
        <div className='grid grid-cols-6 gap-2 mb-3'>
          <div className='bg-zinc-800 rounded p-2 text-center'>
            <div className='text-zinc-500 text-xs'>총 수익</div>
            <div
              className={`text-sm font-bold ${backtestStats.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {backtestStats.totalPnlPercent >= 0 ? '+' : ''}
              {backtestStats.totalPnlPercent.toFixed(1)}%
            </div>
          </div>
          <div className='bg-zinc-800 rounded p-2 text-center'>
            <div className='text-zinc-500 text-xs'>안정성 (Sharpe)</div>
            <div className='text-zinc-300 text-sm font-bold'>
              {backtestStats.sharpeRatio.toFixed(2)}
            </div>
          </div>
          <div className='bg-zinc-800 rounded p-2 text-center'>
            <div className='text-zinc-500 text-xs'>승률</div>
            <div
              className={`text-sm font-bold ${backtestStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}
            >
              {backtestStats.winRate.toFixed(0)}%
            </div>
          </div>
          <div className='bg-zinc-800 rounded p-2 text-center'>
            <div className='text-zinc-500 text-xs'>수익/손실 (PF)</div>
            <div className='text-zinc-300 text-sm font-bold'>
              {backtestStats.profitFactor.toFixed(2)}
            </div>
          </div>
          <div className='bg-zinc-800 rounded p-2 text-center'>
            <div className='text-zinc-500 text-xs'>최대손실 (MDD)</div>
            <div className='text-zinc-300 text-sm font-bold'>
              -{backtestStats.maxDrawdownPercent.toFixed(1)}%
            </div>
          </div>
          <div className='bg-zinc-800 rounded p-2 text-center'>
            <div className='text-zinc-500 text-xs'>총 거래</div>
            <div className='text-zinc-300 text-sm font-bold'>
              {backtestStats.totalTrades}회
            </div>
          </div>
        </div>
      )}

      {/* 3. 열린 포지션 카드 (통계 카드 아래) */}
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
                const currentPrice = ticker?.price || openPosition.currentPrice;
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
        <div className='h-[500px] flex items-center justify-center'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500'></div>
        </div>
      ) : (
        <div ref={containerRef} className='w-full relative'>
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
                  const isFeeLoss = priceWasFavorable && hoveredTrade.pnl <= 0;
                  if (hoveredTrade.pnl > 0) {
                    return <span className='ml-2 text-green-400'>익절</span>;
                  } else if (isFeeLoss) {
                    return (
                      <span className='ml-2 text-yellow-400'>수수료 손실</span>
                    );
                  } else {
                    return <span className='ml-2 text-red-400'>손절</span>;
                  }
                })()}
              </div>
              <div className='space-y-1 text-zinc-300'>
                <div>
                  진입: {formatKST(new Date(hoveredTrade.entryTime).getTime())}
                </div>
                <div>
                  청산: {formatKST(new Date(hoveredTrade.exitTime).getTime())}
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
                  시간: {formatKST(new Date(hoveredSkipped.time).getTime())}
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
                {formatKST(divergenceData.timestamp)}
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
          <div className='max-h-40 overflow-y-auto space-y-1'>
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
                    {formatKST(signal.timestamp)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className='mt-3 flex flex-wrap gap-4 text-xs text-zinc-400'>
        <span className='flex items-center gap-1'>
          <span className='text-green-400 text-[10px]'>↑</span> 롱 진입
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-red-400 text-[10px]'>↓</span> 숏 진입
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-zinc-400 text-[10px]'>●</span> 수익 청산
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-zinc-500 text-[10px]'>✕</span> 손실 청산
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-zinc-400 text-[10px]'>↑</span>/
          <span className='text-zinc-600 text-[10px]'>↓</span> 수수료 보호
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-zinc-400 text-[10px]'>◐</span> 롱 진행중
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-zinc-400 text-[10px]'>◑</span> 숏 진행중
        </span>
        {backtestTrades.length > 0 && (
          <span className='text-zinc-500'>
            | 거래: {backtestTrades.length}건
          </span>
        )}
        {skippedSignals.length > 0 && (
          <span className='text-gray-500'>
            | 스킵: {skippedSignals.length}건
          </span>
        )}
      </div>
    </div>
  );
}
