'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, CandlestickData, CandlestickSeries, SeriesMarker, Time, createSeriesMarkers } from 'lightweight-charts';
import { BacktestResult, TradeResult, SkippedSignal } from '@/lib/backtest-api';

interface BacktestChartProps {
  result: BacktestResult;
  candles: CandlestickData[];
  onTradeClick?: (trade: TradeResult) => void;
  selectedTrade?: TradeResult | null;
}

// 거래 시간 문자열을 UTC timestamp(초)로 변환
const parseTradeTime = (timeStr: string): number => {
  // 백테스트 API에서 오는 시간은 UTC (Z 없이)
  // 캔들 데이터도 UTC
  const utcStr = timeStr.endsWith('Z') ? timeStr : timeStr + 'Z';
  return new Date(utcStr).getTime() / 1000;
};

// KST 시간 포맷 (YYYY-MM-DD HH:mm)
const formatKST = (utcTimestamp: number): string => {
  const date = new Date(utcTimestamp * 1000);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export default function BacktestChart({ result, candles, onTradeClick, selectedTrade }: BacktestChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const [hoveredTrade, setHoveredTrade] = useState<TradeResult | null>(null);
  const [hoveredSkipped, setHoveredSkipped] = useState<SkippedSignal | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    // 차트 생성
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
        barSpacing: 6, // 확대된 상태
        minBarSpacing: 0.5,
      },
      localization: {
        timeFormatter: (time: number) => formatKST(time),
      },
    });

    chartRef.current = chart;

    // 캔들 시리즈 (무채색 - 마커 강조용)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#52525b',
      downColor: '#3f3f46',
      borderUpColor: '#71717a',
      borderDownColor: '#52525b',
      wickUpColor: '#71717a',
      wickDownColor: '#52525b',
    });

    candleSeries.setData(candles);
    candleSeriesRef.current = candleSeries;

    // 마커 생성: 실제 가격 위치에 표시
    const markers: SeriesMarker<Time>[] = [];

    // 거래 시간 -> timestamp 맵 (툴팁용)
    const tradeMap = new Map<number, { trade: TradeResult; type: 'entry' | 'exit'; feeLoss?: boolean; skipped?: SkippedSignal }>();

    // 수수료 보호 신호 마커 추가 (롱/숏 구분)
    if (result.skippedSignals && result.skippedSignals.length > 0) {
      result.skippedSignals.forEach(skipped => {
        const time = parseTradeTime(skipped.time) as Time;
        const isLong = skipped.direction === 'long';

        markers.push({
          time,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: isLong ? '#a1a1aa' : '#52525b',  // 롱: zinc-400 연한 회색, 숏: zinc-600 진한 회색
          shape: isLong ? 'arrowUp' : 'arrowDown',
          size: 1.5,  // 캔들에 파묻히지 않도록 크기 키움
        } as SeriesMarker<Time>);

        // 맵에 저장 (툴팁용)
        tradeMap.set(time as number, { trade: null as any, type: 'entry', skipped });
      });
    }

    result.trades.forEach(trade => {
      const entryTime = parseTradeTime(trade.entryTime) as Time;
      const exitTime = parseTradeTime(trade.exitTime) as Time;
      const isLong = trade.direction === 'long';
      const isProfit = trade.pnl > 0;

      // 청산가가 진입가보다 높은지 (차트상 위치 결정용)
      const exitHigherThanEntry = trade.exitPrice > trade.entryPrice;

      // 가격 방향상 유리했는지 (수수료 제외)
      const priceWasFavorable = isLong ? exitHigherThanEntry : !exitHigherThanEntry;

      // 수수료로 인한 손실: 가격은 유리했지만 PnL은 마이너스
      const feeLoss = priceWasFavorable && !isProfit;

      // 진입 마커: 롱=아래(위 화살표), 숏=위(아래 화살표)
      markers.push({
        time: entryTime,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isLong ? '#22c55e' : '#ef4444',  // 롱: 초록, 숏: 빨강
        shape: isLong ? 'arrowUp' : 'arrowDown',
        size: 1.5,
      } as SeriesMarker<Time>);

      // 청산 마커: 청산가가 진입가보다 높으면 위, 낮으면 아래
      let exitColor: string;
      let exitText: string;
      if (isProfit) {
        exitColor = '#ffffff';  // 이모티콘 자체 색상 사용
        exitText = '🪙';
      } else if (feeLoss) {
        exitColor = '#eab308';  // 수수료 손실: 노랑
        exitText = '⚡';
      } else {
        exitColor = '#ffffff';  // 이모티콘 자체 색상 사용
        exitText = '🗡';
      }

      markers.push({
        time: exitTime,
        position: exitHigherThanEntry ? 'aboveBar' : 'belowBar',
        color: exitColor,
        shape: 'text',
        text: exitText,
        size: 0.5,
      } as unknown as SeriesMarker<Time>);

      // 맵에 저장 (수수료 손실 여부 포함)
      tradeMap.set(entryTime as number, { trade, type: 'entry', feeLoss });
      tradeMap.set(exitTime as number, { trade, type: 'exit', feeLoss });
    });

    // 마커를 시간순으로 정렬
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(candleSeries, markers);

    // 크로스헤어 이동 시 거래 정보 표시
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredTrade(null);
        setHoveredSkipped(null);
        setTooltipPos(null);
        return;
      }

      const time = param.time as number;
      // 시간 근처의 거래 찾기 (5분 = 300초 범위)
      let found: { trade: TradeResult; type: 'entry' | 'exit'; skipped?: SkippedSignal } | null = null;
      for (const [t, data] of tradeMap) {
        if (Math.abs(t - time) < 300) {
          found = data;
          break;
        }
      }

      if (found) {
        if (found.skipped) {
          setHoveredSkipped(found.skipped);
          setHoveredTrade(null);
        } else {
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
    // 최근 150개 캔들만 표시 (확대 상태)
    const visibleBars = 150;
    const totalBars = candles.length;
    if (totalBars > visibleBars) {
      chart.timeScale().setVisibleLogicalRange({
        from: totalBars - visibleBars,
        to: totalBars,
      });
    } else {
      chart.timeScale().fitContent();
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, result.trades]);

  // 선택된 거래로 이동
  useEffect(() => {
    if (selectedTrade && chartRef.current) {
      const entryTime = new Date(selectedTrade.entryTime).getTime() / 1000;
      chartRef.current.timeScale().setVisibleRange({
        from: (entryTime - 3600 * 12) as any,
        to: (entryTime + 3600 * 12) as any,
      });
    }
  }, [selectedTrade]);

  // 통계 계산
  const longTrades = result.trades.filter(t => t.direction === 'long');
  const shortTrades = result.trades.filter(t => t.direction === 'short');
  const profitTrades = result.trades.filter(t => t.pnl > 0);

  // 수수료 손실 계산: 가격은 유리했지만 PnL은 마이너스
  const feeLossTrades = result.trades.filter(t => {
    const isLong = t.direction === 'long';
    const exitHigher = t.exitPrice > t.entryPrice;
    const priceWasFavorable = isLong ? exitHigher : !exitHigher;
    return priceWasFavorable && t.pnl <= 0;
  });
  const realLossTrades = result.trades.filter(t => {
    const isLong = t.direction === 'long';
    const exitHigher = t.exitPrice > t.entryPrice;
    const priceWasFavorable = isLong ? exitHigher : !exitHigher;
    return !priceWasFavorable && t.pnl <= 0;
  });

  return (
    <div className="bg-zinc-900 p-4 rounded-lg relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">거래 차트</h2>
        <div className="flex gap-4 text-xs">
          <span className="text-zinc-400">
            롱 <span className="text-green-400">{longTrades.length}</span> |
            숏 <span className="text-red-400">{shortTrades.length}</span>
          </span>
          <span className="text-zinc-400">
            익절 <span className="text-green-400">{profitTrades.length}</span> |
            손절 <span className="text-red-400">{realLossTrades.length}</span> |
            수수료 <span className="text-yellow-400">{feeLossTrades.length}</span> |
            스킵 <span className="text-gray-400">{result.skippedSignals?.length || 0}</span>
          </span>
        </div>
      </div>
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
              <div>진입: {formatKST(parseTradeTime(hoveredTrade.entryTime))}</div>
              <div>청산: {formatKST(parseTradeTime(hoveredTrade.exitTime))}</div>
              <div>진입가: ${hoveredTrade.entryPrice.toFixed(2)}</div>
              <div>청산가: ${hoveredTrade.exitPrice.toFixed(2)}</div>
              <div className={hoveredTrade.pnl > 0 ? 'text-green-400' : 'text-red-400'}>
                PnL: {hoveredTrade.pnl > 0 ? '+' : ''}{hoveredTrade.pnl.toFixed(2)}
              </div>
            </div>
          </div>
        )}
        {/* 수수료 보호 신호 툴팁 */}
        {hoveredSkipped && tooltipPos && (
          <div
            className={`absolute z-50 bg-zinc-800 border rounded-lg p-3 text-xs shadow-lg pointer-events-none ${
              hoveredSkipped.direction === 'long' ? 'border-green-600' : 'border-red-600'
            }`}
            style={{
              left: Math.min(tooltipPos.x + 10, (containerRef.current?.clientWidth || 400) - 200),
              top: Math.max(tooltipPos.y - 80, 10),
            }}
          >
            <div className="font-semibold mb-2">
              <span className={hoveredSkipped.direction === 'long' ? 'text-zinc-400' : 'text-zinc-600'}>
                {hoveredSkipped.direction === 'long' ? '▲ 롱' : '▼ 숏'}
              </span>
              <span className="ml-2 text-yellow-400">수수료 보호</span>
            </div>
            <div className="space-y-1 text-zinc-300">
              <div>시간: {formatKST(parseTradeTime(hoveredSkipped.time))}</div>
              <div>가격: ${hoveredSkipped.price.toFixed(2)}</div>
              <div className="text-zinc-400 text-[10px] mt-1">
                수수료가 기대수익 초과하여 진입 보류
              </div>
              <div className="mt-1 pt-1 border-t border-zinc-700">
                <span className="text-yellow-400">기대: {hoveredSkipped.expectedReturn.toFixed(2)}%</span>
                <span className="text-zinc-500 mx-1">vs</span>
                <span className="text-red-400">비용: {hoveredSkipped.totalCost.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="text-green-400 text-[10px]">↑</span> 롱
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-400 text-[10px]">↓</span> 숏
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">🪙</span> 익절
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px]">💸</span> 손절
        </span>
        <span className="flex items-center gap-1">
          <span className="text-yellow-400 text-[10px]">⚡</span> 수수료 손실
        </span>
        <span className="flex items-center gap-1">
          <span className="text-zinc-400 text-[10px]">↑</span>/<span className="text-zinc-600 text-[10px]">↓</span> 수수료 보호
        </span>
      </div>
    </div>
  );
}
