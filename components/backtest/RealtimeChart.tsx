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
import { getTopSavedResults, SavedOptimizeResult, runBacktest, TradeResult, SkippedSignal } from '@/lib/backtest-api';

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

  // 툴팁 관련 상태
  const [hoveredTrade, setHoveredTrade] = useState<TradeResult | null>(null);
  const [hoveredSkipped, setHoveredSkipped] = useState<SkippedSignal | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const tradeMapRef = useRef<Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>>(new Map());

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
    } catch (err) {
      console.error('Failed to load backtest trades:', err);
      // 최대 2번 재시도
      if (retryCount < 2) {
        setTimeout(() => loadBacktestTrades(strategy, retryCount + 1), 1000);
      } else {
        setBacktestTrades([]);
        setSkippedSignals([]);
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
          setCandles(formattedCandles);
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

  // 실시간 캔들 업데이트
  useEffect(() => {
    if (!kline || !candleSeriesRef.current || kline.timeframe !== timeframe || isChartDisposedRef.current) return;

    const newCandle: CandlestickData = {
      time: (kline.timestamp / 1000) as Time,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
    };

    // 캔들 업데이트
    try {
      candleSeriesRef.current.update(newCandle);
    } catch {
      // 차트가 이미 disposed된 경우 무시
      return;
    }

    // 캔들이 완료되면 목록에 추가
    if (kline.isFinal) {
      setCandles(prev => {
        const last = prev[prev.length - 1];
        if (last && (last.time as number) === newCandle.time) {
          return [...prev.slice(0, -1), newCandle];
        }
        return [...prev, newCandle];
      });
    }
  }, [kline, timeframe]);

  // 차트 생성
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

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

    // 마커 배열 및 거래 맵 (툴팁용)
    const markers: SeriesMarker<Time>[] = [];
    const tradeMap = new Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>();

    // 차트 캔들 시간 범위
    const candleTimes = candles.map(c => c.time as number);
    const minCandleTime = Math.min(...candleTimes);
    const maxCandleTime = Math.max(...candleTimes);

    // 백테스트 과거 거래 마커 추가
    if (backtestTrades.length > 0) {
      backtestTrades.forEach((trade) => {
        const entryTime = new Date(trade.entryTime).getTime() / 1000;
        const exitTime = new Date(trade.exitTime).getTime() / 1000;
        const isLong = trade.direction === 'long';
        const isWin = trade.pnl > 0;

        // 시간이 차트 범위 내인지 확인
        const isEntryInRange = entryTime >= minCandleTime && entryTime <= maxCandleTime;
        const isExitInRange = exitTime >= minCandleTime && exitTime <= maxCandleTime;

        // 진입 마커 (차트 범위 내일 때만)
        if (isEntryInRange) {
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

        // 청산 마커 (차트 범위 내일 때만)
        if (isExitInRange) {
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

    // 스킵된 신호 마커 추가 (수수료 손실 우려)
    if (skippedSignals.length > 0) {
      skippedSignals.forEach((signal) => {
        const signalTime = new Date(signal.time).getTime() / 1000;
        const isLong = signal.direction === 'long';
        const isInRange = signalTime >= minCandleTime && signalTime <= maxCandleTime;

        if (isInRange) {
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

    // 실시간 다이버전스 신호 마커 추가
    if (divergenceHistory.length > 0) {
      divergenceHistory.forEach(signal => {
        const signalTime = signal.timestamp / 1000;
        const isLong = signal.direction === 'bullish';
        const isInRange = signalTime >= minCandleTime && signalTime <= maxCandleTime;

        if (isInRange) {
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

    // 마커 정렬 후 추가
    if (markers.length > 0) {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candleSeries, markers);
    }

    // tradeMap을 ref에 저장 (툴팁용)
    tradeMapRef.current = tradeMap;

    // 크로스헤어 이동 시 거래 정보 표시
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
    chart.timeScale().fitContent();

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
  }, [candles, divergenceHistory, backtestTrades, skippedSignals, timeframe]);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">실시간 차트</h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-zinc-400">
              {isConnected ? '연결됨' : '연결 끊김'}
            </span>
          </div>
          {/* 전략 선택 드롭다운 */}
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
        </div>

        <div className="flex items-center gap-4">
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

          {/* 현재가 */}
          {ticker && (
            <div className="text-right">
              <div className="text-lg font-bold text-white">
                ${ticker.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-xs ${ticker.changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {ticker.changePercent24h >= 0 ? '+' : ''}{ticker.changePercent24h.toFixed(2)}%
              </div>
            </div>
          )}
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
        {backtestTrades.length > 0 && (
          <span className="text-zinc-500">| 거래: {backtestTrades.length}건</span>
        )}
        {skippedSignals.length > 0 && (
          <span className="text-gray-500">| 스킵: {skippedSignals.length}건</span>
        )}
      </div>
    </div>
  );
}
