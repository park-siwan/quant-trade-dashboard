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
} from 'lightweight-charts';
import { useSocket, RealtimeDivergenceData } from '@/contexts/SocketContext';
import { getTopSavedResults, SavedOptimizeResult, runBacktest, TradeResult, SkippedSignal, OpenPosition } from '@/lib/backtest-api';

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
  const isChartDisposedRef = useRef(false);
  const { isConnected, kline, ticker, divergenceData, divergenceHistory, subscribeKline } = useSocket();

  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [timeframe, setTimeframe] = useState('5m');
  const [isLoading, setIsLoading] = useState(true);
  const [strategies, setStrategies] = useState<SavedOptimizeResult[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<SavedOptimizeResult | null>(null);
  const [isStrategyOpen, setIsStrategyOpen] = useState(false);
  const [backtestTrades, setBacktestTrades] = useState<TradeResult[]>([]);
  const [skippedSignals, setSkippedSignals] = useState<SkippedSignal[]>([]);
  const [openPosition, setOpenPosition] = useState<OpenPosition | null>(null);

  // 툴팁 관련 상태
  const [hoveredTrade, setHoveredTrade] = useState<TradeResult | null>(null);
  const [hoveredSkipped, setHoveredSkipped] = useState<SkippedSignal | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const tradeMapRef = useRef<Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>>(new Map());
  const initialCandlesLoadedRef = useRef(false);
  const [chartKey, setChartKey] = useState(0); // 차트 재생성 트리거

  // 알림 관련 상태
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(1); // 0 ~ 1 (기본 100%)
  const lastSignalIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastExitAlertRef = useRef<string | null>(null); // TP/SL 알림 중복 방지

  // 8bit 스타일 소리 알림 함수 (Web Audio API)
  const playAlertSound = (direction: 'bullish' | 'bearish', forcePlay = false) => {
    if (!soundEnabled && !forcePlay) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
        playNote(523.25, t, 0.08);         // C5
        playNote(659.25, t + 0.08, 0.08);  // E5
        playNote(783.99, t + 0.16, 0.08);  // G5
        playNote(1046.50, t + 0.24, 0.12); // C6
        playNote(1318.51, t + 0.36, 0.12); // E6
        playNote(1567.98, t + 0.48, 0.25); // G6 (높게 마무리)
      } else {
        // 숏 신호: 신비롭고 쿨한 하강 멜로디 (보물 발견 느낌)
        playNote(1046.50, t, 0.08);        // C6
        playNote(932.33, t + 0.08, 0.08);  // Bb5
        playNote(783.99, t + 0.16, 0.08);  // G5
        playNote(622.25, t + 0.24, 0.12);  // Eb5
        playNote(523.25, t + 0.36, 0.12);  // C5
        playNote(392.00, t + 0.48, 0.25);  // G4 (낮게 마무리)
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
        audio.play().catch(err => {
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
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;

      const playNote = (freq: number, startTime: number, duration: number, type: OscillatorType = 'square') => {
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
        playNote(523.25, t, 0.08);         // C5
        playNote(659.25, t + 0.08, 0.08);  // E5
        playNote(783.99, t + 0.16, 0.08);  // G5
        playNote(1046.50, t + 0.24, 0.15); // C6
        playNote(783.99, t + 0.4, 0.08);   // G5
        playNote(1046.50, t + 0.48, 0.08); // C6
        playNote(1318.51, t + 0.56, 0.25); // E6 (길게)
        playNote(1567.98, t + 0.82, 0.35); // G6 (더 길게, 마무리)
      } else {
        // 손절: 8bit 실패/데미지 사운드 (팩맨 죽음 느낌)
        playNote(493.88, t, 0.12, 'sawtooth');        // B4
        playNote(440.00, t + 0.12, 0.12, 'sawtooth'); // A4
        playNote(392.00, t + 0.24, 0.12, 'sawtooth'); // G4
        playNote(349.23, t + 0.36, 0.12, 'sawtooth'); // F4
        playNote(329.63, t + 0.48, 0.15, 'sawtooth'); // E4
        playNote(293.66, t + 0.64, 0.15, 'sawtooth'); // D4
        playNote(261.63, t + 0.8, 0.2, 'sawtooth');   // C4
        playNote(196.00, t + 1.0, 0.35, 'sawtooth');  // G3 (낮게 마무리)
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
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        }
      });
    }
  };

  // 실시간 다이버전스 신호 알림
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
    const title = divergenceData.direction === 'bullish' ? '🚀 롱 신호 발생!' : '🌧 숏 신호 발생!';
    const body = `가격: $${divergenceData.price.toLocaleString()} | RSI: ${divergenceData.rsiValue.toFixed(1)}`;
    showNotification(title, body);
  }, [divergenceData, soundEnabled]);

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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
      const emoji = isProfit ? '💰' : '💸';
      const pnlText = openPosition.unrealizedPnl >= 0
        ? `+$${openPosition.unrealizedPnl.toFixed(2)}`
        : `-$${Math.abs(openPosition.unrealizedPnl).toFixed(2)}`;

      showNotification(
        `${emoji} ${directionText} ${exitText}!`,
        `가격: $${currentPrice.toLocaleString()} | PnL: ${pnlText} (${openPosition.unrealizedPnlPercent.toFixed(2)}%)`
      );

      console.log(`[Exit Alert] ${direction.toUpperCase()} ${exitType.toUpperCase()} @ $${currentPrice}`);
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
    // 선택된 전략으로 백테스트 실행하여 과거 거래 내역 로드
    loadBacktestTrades(strategy);
  };

  // 선택된 전략으로 백테스트 실행 (재시도 포함)
  const loadBacktestTrades = async (strategy: SavedOptimizeResult, retryCount = 0) => {
    try {
      const indicators = strategy.indicators ? strategy.indicators.split(',').filter(Boolean) : ['rsi'];
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
    }
  };

  // 전략 선택 시 백테스트 실행 (candles 로드 완료 후 약간의 지연)
  useEffect(() => {
    if (selectedStrategy && candles.length > 0 && !isLoading) {
      // 백엔드에서 캔들 데이터 준비 시간 확보
      const timer = setTimeout(() => {
        loadBacktestTrades(selectedStrategy);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [selectedStrategy, timeframe, candles.length, isLoading]);

  // 초기 캔들 데이터 로드
  useEffect(() => {
    const loadCandles = async () => {
      setIsLoading(true);
      initialCandlesLoadedRef.current = false;
      try {
        const response = await fetch(
          `${API_BASE}/exchange/candles?symbol=${encodeURIComponent('BTC/USDT')}&timeframe=${timeframe}&limit=500`
        );
        const data = await response.json();
        const candlesArray = data.data?.candles || data.candles;

        if (candlesArray && candlesArray.length > 0) {
          const formattedCandles: CandlestickData[] = candlesArray.map((c: number[]) => ({
            time: (c[0] / 1000) as Time,
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
          }));

          // 디버그 로그
          const firstTs = candlesArray[0][0];
          const lastTs = candlesArray[candlesArray.length - 1][0];
          console.log('[Candles] Loaded:', candlesArray.length);
          console.log('[Candles] First:', new Date(firstTs).toLocaleString('ko-KR'));
          console.log('[Candles] Last:', new Date(lastTs).toLocaleString('ko-KR'));
          console.log('[Candles] Now:', new Date().toLocaleString('ko-KR'));

          setCandles(formattedCandles);
          initialCandlesLoadedRef.current = true;
          // 차트 재생성 트리거
          setChartKey(prev => prev + 1);
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
    if (!kline || kline.timeframe !== timeframe || isChartDisposedRef.current) return;

    const newCandle: CandlestickData = {
      time: (kline.timestamp / 1000) as Time,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
    };

    // 차트 시리즈가 있으면 직접 업데이트
    if (candleSeriesRef.current) {
      try {
        candleSeriesRef.current.update(newCandle);
      } catch {
        // 차트가 이미 disposed된 경우 무시
      }
    }

    // candles state도 업데이트 (마지막 캔들만 갱신, 차트 재생성 방지)
    setCandles(prev => {
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
  }, [kline, timeframe]);

  // 차트 초기 생성 (타임프레임 변경 또는 초기 로드 시에만)
  useEffect(() => {
    if (!containerRef.current || candles.length === 0 || !initialCandlesLoadedRef.current) return;

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
        rightOffset: 12,
        shiftVisibleRangeOnNewBar: true,
      },
      localization: {
        timeFormatter: (time: number) => formatKST(time * 1000),
      },
    });

    chartRef.current = chart;

    // 캔들 시리즈 (무채색 + 투명도)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: 'rgba(168, 168, 168, 0.8)',
      downColor: 'rgba(82, 82, 82, 0.8)',
      borderUpColor: 'rgba(200, 200, 200, 0.9)',
      borderDownColor: 'rgba(100, 100, 100, 0.9)',
      wickUpColor: 'rgba(168, 168, 168, 0.6)',
      wickDownColor: 'rgba(82, 82, 82, 0.6)',
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
      const tolerance = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : timeframe === '15m' ? 900 : 3600;
      let found: { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' } | null = null;

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

    // 마지막 캔들 기준으로 visible range 설정 (렌더링 완료 후)
    const lastCandleTime = candles[candles.length - 1].time as number;
    const timeframeSeconds = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : timeframe === '15m' ? 900 : 3600;
    const visibleBars = 100; // 화면에 보일 캔들 수
    const fromTime = lastCandleTime - (visibleBars * timeframeSeconds);

    console.log('[Chart] Last candle time:', new Date(lastCandleTime * 1000).toLocaleString('ko-KR'));
    console.log('[Chart] Setting visible range from:', new Date(fromTime * 1000).toLocaleString('ko-KR'));

    // 차트 렌더링 완료 후 visible range 설정
    requestAnimationFrame(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().setVisibleRange({
          from: fromTime as Time,
          to: (lastCandleTime + timeframeSeconds * 10) as Time,
        });
        console.log('[Chart] Visible range set successfully');
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
    };
  }, [timeframe, chartKey]);

  // 마커 업데이트 (백테스트 결과, 스킵 신호, 다이버전스 신호 변경 시)
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const markers: SeriesMarker<Time>[] = [];
    const tradeMap = new Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>();

    const candleTimes = candles.map(c => c.time as number);
    const minCandleTime = Math.min(...candleTimes);
    const maxCandleTime = Math.max(...candleTimes);

    console.log('[Markers] Candle range:', new Date(minCandleTime * 1000).toLocaleString('ko-KR'), '~', new Date(maxCandleTime * 1000).toLocaleString('ko-KR'));
    console.log('[Markers] Backtest trades:', backtestTrades.length, 'Skipped:', skippedSignals.length, 'Divergence history:', divergenceHistory.length, 'Open position:', openPosition ? 'YES' : 'NO');
    if (backtestTrades.length > 0) {
      const last = backtestTrades[backtestTrades.length - 1];
      const lastEntryParsed = parseTradeTime(last.entryTime);
      console.log('[Markers] Last trade entry:', last.entryTime, '-> parsed:', new Date(lastEntryParsed * 1000).toLocaleString('ko-KR'));
      console.log('[Markers] Is in range?', lastEntryParsed >= minCandleTime && lastEntryParsed <= maxCandleTime);
    }
    if (openPosition) {
      const openEntryParsed = parseTradeTime(openPosition.entryTime);
      console.log('[Markers] Open position entry:', openPosition.entryTime, '-> parsed:', new Date(openEntryParsed * 1000).toLocaleString('ko-KR'));
      console.log('[Markers] Open in range?', openEntryParsed >= minCandleTime && openEntryParsed <= maxCandleTime);
    }

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
            color: '#ffffff',
            shape: 'text',
            text: isLong ? '🚀' : '🌧',
            size: 0.5,
          } as SeriesMarker<Time>);
          tradeMap.set(entryTime, { trade, type: 'entry' });
        }

        if (exitTime >= minCandleTime && exitTime <= maxCandleTime) {
          markers.push({
            time: exitTime as Time,
            position: isLong ? 'aboveBar' : 'belowBar',
            color: '#ffffff',
            shape: 'text',
            text: isWin ? '💰' : '💸',
            size: 0.5,
          } as SeriesMarker<Time>);
          tradeMap.set(exitTime, { trade, type: 'exit' });
        }
      });
    }

    // 스킵된 신호 마커 (parseTradeTime 사용)
    if (skippedSignals.length > 0) {
      skippedSignals.forEach((signal) => {
        const signalTime = parseTradeTime(signal.time);
        const isLong = signal.direction === 'long';
        if (signalTime >= minCandleTime && signalTime <= maxCandleTime) {
          markers.push({
            time: signalTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: '#6b7280',
            shape: 'text',
            text: '⏸️',
            size: 0.5,
          } as SeriesMarker<Time>);
          tradeMap.set(signalTime, { skipped: signal, type: 'skipped' });
        }
      });
    }

    // 실시간 다이버전스 신호 마커
    if (divergenceHistory.length > 0) {
      divergenceHistory.forEach(signal => {
        const signalTime = signal.timestamp / 1000;
        const isLong = signal.direction === 'bullish';
        if (signalTime >= minCandleTime && signalTime <= maxCandleTime) {
          markers.push({
            time: signalTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: '#ffffff',
            shape: 'text',
            text: isLong ? '🚀' : '🌧',
            size: 0.5,
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
          color: '#fbbf24',  // 노란색 (진행 중)
          shape: 'text',
          text: isLong ? '🟢' : '🔴',  // 진행 중인 포지션
          size: 0.5,
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
  }, [backtestTrades, skippedSignals, divergenceHistory, openPosition, candles.length]);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      {/* 상단 헤더: 전략 + 알림 */}
      <div className="flex justify-between items-center mb-3 pb-3 border-b border-zinc-800">
        {/* 전략 선택 */}
        <div className="relative">
          <button
            onClick={() => setIsStrategyOpen(!isStrategyOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs transition-colors"
          >
            {selectedStrategy ? (
              <>
                <span className="text-zinc-400">전략:</span>
                <span className="text-blue-400">RSI {selectedStrategy.rsiPeriod}</span>
                <span className="text-zinc-500">|</span>
                <span className="text-zinc-300">Pvt {selectedStrategy.pivotLeft}/{selectedStrategy.pivotRight}</span>
                <span className="text-zinc-500">|</span>
                <span className="text-green-400">SR {selectedStrategy.sharpeRatio.toFixed(2)}</span>
              </>
            ) : (
              <span className="text-zinc-400">전략 선택...</span>
            )}
            <svg className={`w-3 h-3 text-zinc-400 transition-transform ${isStrategyOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 드롭다운 메뉴 */}
          {isStrategyOpen && strategies.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
              {strategies.map((strategy, idx) => (
                <button
                  key={strategy.id}
                  onClick={() => handleStrategyChange(strategy)}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-zinc-700 transition-colors flex items-center justify-between ${
                    selectedStrategy?.id === strategy.id ? 'bg-zinc-700' : ''
                  } ${idx === 0 ? 'rounded-t-lg' : ''} ${idx === strategies.length - 1 ? 'rounded-b-lg' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 w-4">#{idx + 1}</span>
                    <span className="text-blue-400">RSI {strategy.rsiPeriod}</span>
                    <span className="text-zinc-500">|</span>
                    <span className="text-zinc-300">Pvt {strategy.pivotLeft}/{strategy.pivotRight}</span>
                    <span className="text-zinc-500">|</span>
                    <span className="text-zinc-300">TP/SL {strategy.tpAtr}/{strategy.slAtr}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-medium">SR {strategy.sharpeRatio.toFixed(2)}</span>
                    <span className={`${strategy.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {strategy.totalPnlPercent >= 0 ? '+' : ''}{strategy.totalPnlPercent.toFixed(0)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 알림 컨트롤 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-l text-xs transition-colors ${
              soundEnabled
                ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
            }`}
            title={soundEnabled ? '알림 끄기' : '알림 켜기'}
          >
            {soundEnabled ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
          <button onClick={() => playAlertSound('bullish', true)} className="px-2 py-1 bg-zinc-800 hover:bg-green-600/30 text-green-400 text-xs transition-colors" title="롱 신호">🚀</button>
          <button onClick={() => playAlertSound('bearish', true)} className="px-2 py-1 bg-zinc-800 hover:bg-red-600/30 text-red-400 text-xs transition-colors" title="숏 신호">🌧</button>
          <button onClick={() => playExitSound(true, true)} className="px-2 py-1 bg-zinc-800 hover:bg-green-600/30 text-green-400 text-xs transition-colors" title="익절">💰</button>
          <button onClick={() => playExitSound(false, true)} className="px-2 py-1 bg-zinc-800 hover:bg-red-600/30 text-red-400 text-xs transition-colors" title="손절">💸</button>
          <div className="flex items-center gap-1 px-2 bg-zinc-800 rounded-r">
            <input
              type="range"
              min="0"
              max="100"
              value={soundVolume * 100}
              onChange={(e) => setSoundVolume(Number(e.target.value) / 100)}
              className="w-12 h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
              title={`볼륨: ${Math.round(soundVolume * 100)}%`}
            />
            <span className="text-zinc-500 text-[10px] w-6">{Math.round(soundVolume * 100)}%</span>
          </div>
        </div>
      </div>

      {/* 차트 헤더: 가격 + 타임프레임 */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-3">
          {/* 가격 + 등락 */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <h2 className="text-lg font-bold text-white">
              BTC/USDT
              {ticker && (
                <>
                  <span className="ml-2">${ticker.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span className={`ml-2 text-sm ${ticker.changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {ticker.changePercent24h >= 0 ? '+' : ''}{ticker.changePercent24h.toFixed(2)}%
                  </span>
                </>
              )}
            </h2>
          </div>
        </div>

        {/* 타임프레임 선택 */}
        <div className="flex gap-1 bg-zinc-800 p-1 rounded">
          {['1m', '5m', '15m', '1h'].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-1 text-xs rounded ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 */}
      {isLoading ? (
        <div className="h-[500px] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div ref={containerRef} className="w-full relative">
          {/* 거래 툴팁 */}
          {hoveredTrade && tooltipPos && (
            <div
              className="absolute z-50 bg-zinc-800 border border-zinc-600 rounded-lg p-3 text-xs shadow-lg pointer-events-none"
              style={{
                left: Math.min(tooltipPos.x + 10, (containerRef.current?.clientWidth || 400) - 200),
                top: Math.max(tooltipPos.y - 80, 10),
              }}
            >
              <div className="font-semibold mb-2">
                <span className={hoveredTrade.direction === 'long' ? 'text-green-400' : 'text-red-400'}>
                  {hoveredTrade.direction.toUpperCase()}
                </span>
                {(() => {
                  const isLong = hoveredTrade.direction === 'long';
                  const exitHigher = hoveredTrade.exitPrice > hoveredTrade.entryPrice;
                  const priceWasFavorable = isLong ? exitHigher : !exitHigher;
                  const isFeeLoss = priceWasFavorable && hoveredTrade.pnl <= 0;
                  if (hoveredTrade.pnl > 0) {
                    return <span className="ml-2 text-green-400">익절</span>;
                  } else if (isFeeLoss) {
                    return <span className="ml-2 text-yellow-400">수수료 손실</span>;
                  } else {
                    return <span className="ml-2 text-red-400">손절</span>;
                  }
                })()}
              </div>
              <div className="space-y-1 text-zinc-300">
                <div>진입: {formatKST(new Date(hoveredTrade.entryTime).getTime())}</div>
                <div>청산: {formatKST(new Date(hoveredTrade.exitTime).getTime())}</div>
                <div>진입가: ${hoveredTrade.entryPrice.toFixed(2)}</div>
                <div>청산가: ${hoveredTrade.exitPrice.toFixed(2)}</div>
                <div className={hoveredTrade.pnl > 0 ? 'text-green-400' : 'text-red-400'}>
                  PnL: {hoveredTrade.pnl > 0 ? '+' : ''}{hoveredTrade.pnl.toFixed(2)} ({hoveredTrade.pnlPercent.toFixed(2)}%)
                </div>
              </div>
            </div>
          )}
          {/* 스킵된 신호 툴팁 */}
          {hoveredSkipped && tooltipPos && (
            <div
              className="absolute z-50 bg-zinc-800 border border-gray-500 rounded-lg p-3 text-xs shadow-lg pointer-events-none"
              style={{
                left: Math.min(tooltipPos.x + 10, (containerRef.current?.clientWidth || 400) - 200),
                top: Math.max(tooltipPos.y - 80, 10),
              }}
            >
              <div className="font-semibold mb-2">
                <span className={hoveredSkipped.direction === 'long' ? 'text-green-400' : 'text-red-400'}>
                  {hoveredSkipped.direction.toUpperCase()}
                </span>
                <span className="ml-2 text-gray-400">⏸️ 스킵</span>
              </div>
              <div className="space-y-1 text-zinc-300">
                <div>시간: {formatKST(new Date(hoveredSkipped.time).getTime())}</div>
                <div>가격: ${hoveredSkipped.price.toFixed(2)}</div>
                <div className="text-gray-400">
                  사유: ATR 범위 내 수수료 손실 우려
                </div>
                <div className="text-yellow-400">
                  기대 수익: {hoveredSkipped.expectedReturn.toFixed(2)}%
                </div>
                <div className="text-red-400">
                  예상 비용: {hoveredSkipped.totalCost.toFixed(2)}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 최근 신호 */}
      {divergenceData && (
        <div className="mt-4 p-3 bg-zinc-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-lg ${divergenceData.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
                {divergenceData.direction === 'bullish' ? '🚀 롱 신호' : '🌧 숏 신호'}
              </span>
              <span className="text-zinc-400 text-sm">
                @ ${divergenceData.price.toLocaleString()}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm text-zinc-400">
                RSI: {divergenceData.rsiValue.toFixed(1)} | 강도: {divergenceData.strength}
              </div>
              <div className="text-xs text-zinc-500">
                {formatKST(divergenceData.timestamp)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 신호 히스토리 */}
      {divergenceHistory.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">최근 신호 ({divergenceHistory.length})</h3>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {[...divergenceHistory].reverse().slice(0, 10).map((signal, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-2 bg-zinc-800 rounded"
              >
                <span className={signal.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                  {signal.direction === 'bullish' ? '🚀 롱' : '🌧 숏'}
                </span>
                <span className="text-zinc-300">${signal.price.toLocaleString()}</span>
                <span className="text-zinc-500">{formatKST(signal.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="text-[10px]">🚀</span> 롱 진입
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">🌧</span> 숏 진입
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">💰</span> 수익 청산
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">💸</span> 손실 청산
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">⏸️</span> 스킵 (수수료)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">🟢</span> 롱 진행중
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">🔴</span> 숏 진행중
        </span>
        {backtestTrades.length > 0 && (
          <span className="text-zinc-500">| 거래: {backtestTrades.length}건</span>
        )}
        {skippedSignals.length > 0 && (
          <span className="text-gray-500">| 스킵: {skippedSignals.length}건</span>
        )}
      </div>

      {/* 열린 포지션 정보 */}
      {openPosition && (
        <div className="mt-3 p-3 bg-zinc-800 rounded-lg border border-yellow-500/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-lg ${openPosition.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                {openPosition.direction === 'long' ? '🟢 롱 진행중' : '🔴 숏 진행중'}
              </span>
              <span className="text-zinc-400 text-sm">
                @ ${openPosition.entryPrice.toFixed(2)}
              </span>
            </div>
            <div className="text-right">
              <div className={`text-sm font-medium ${openPosition.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {openPosition.unrealizedPnl >= 0 ? '+' : ''}{openPosition.unrealizedPnl.toFixed(2)} ({openPosition.unrealizedPnlPercent.toFixed(2)}%)
              </div>
              <div className="text-xs text-zinc-500">
                TP: ${openPosition.tp.toFixed(2)} | SL: ${openPosition.sl.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
