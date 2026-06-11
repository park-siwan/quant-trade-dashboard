'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  CandlestickData,
  CandlestickSeries,
  LineSeries,
  SeriesMarker,
  Time,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts';
import {
  computeBollingerBands,
  computeRSI,
  computeBreakoutLevels,
  computeZScore,
  detectDivergencesMulti,
  type DivergenceParams,
} from '@/lib/chart/strategyIndicators';
import { formatKST } from '@/lib/utils/timestamp';
import type { TradeResult, SkippedSignal } from '@/lib/backtest-api';

interface UseChartInitParams {
  candles: CandlestickData[];
  initialCandlesLoaded: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  rsiContainerRef: React.RefObject<HTMLDivElement | null>;
  zscoreContainerRef: React.RefObject<HTMLDivElement | null>;
  timeframe: string;
  chartKey: number;
  /** RSI 패널·다이버전스 오버레이에 사용할 전략 파라미터 (실제 진입 로직과 표시 일치) */
  divergenceParams: DivergenceParams;
  tradeMapRef: React.MutableRefObject<Map<number, {
    trade?: TradeResult;
    skipped?: SkippedSignal;
    type: 'entry' | 'exit' | 'skipped';
  }>>;
  setHoveredTrade: React.Dispatch<React.SetStateAction<TradeResult | null>>;
  setHoveredSkipped: React.Dispatch<React.SetStateAction<SkippedSignal | null>>;
  setTooltipPos: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
}

export interface ChartRefs {
  chartRef: React.MutableRefObject<IChartApi | null>;
  candleSeriesRef: React.MutableRefObject<any>;
  bbUpperRef: React.MutableRefObject<any>;
  bbMiddleRef: React.MutableRefObject<any>;
  bbLowerRef: React.MutableRefObject<any>;
  boHighRef: React.MutableRefObject<any>;
  boLowRef: React.MutableRefObject<any>;
  rsiChartRef: React.MutableRefObject<IChartApi | null>;
  rsiSeriesRef: React.MutableRefObject<any>;
  isChartDisposedRef: React.MutableRefObject<boolean>;
  seriesMarkersRef: React.MutableRefObject<any>;
  priceLinesRef: React.MutableRefObject<any[]>;
}

export function useChartInit({
  candles,
  initialCandlesLoaded,
  containerRef,
  rsiContainerRef,
  zscoreContainerRef,
  timeframe,
  chartKey,
  divergenceParams,
  tradeMapRef,
  setHoveredTrade,
  setHoveredSkipped,
  setTooltipPos,
}: UseChartInitParams): ChartRefs {
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const seriesMarkersRef = useRef<any>(null);
  const bbUpperRef = useRef<any>(null);
  const bbMiddleRef = useRef<any>(null);
  const bbLowerRef = useRef<any>(null);
  const boHighRef = useRef<any>(null);
  const boLowRef = useRef<any>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<any>(null);
  const zscoreChartRef = useRef<IChartApi | null>(null);
  const zscoreSeriesRef = useRef<any>(null);
  const isChartDisposedRef = useRef(false);

  // 다이버전스 파라미터 변경 감지용 안정 키
  const divKey = JSON.stringify(divergenceParams);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0 || !initialCandlesLoaded) return;

    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
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
        horzLine: { color: '#e4e4e7', width: 1, style: 0, labelBackgroundColor: '#52525b' },
        vertLine: { color: '#a1a1aa', width: 1, style: 2, labelBackgroundColor: '#52525b' },
      },
      rightPriceScale: {
        borderColor: '#3f3f46',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#3f3f46',
        timeVisible: true,
        rightOffset: 10,
        shiftVisibleRangeOnNewBar: true,
      },
      localization: {
        timeFormatter: (time: number) => formatKST(time),
      },
    });

    chartRef.current = chart;

    // ── 캔들 시리즈 ──
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: 'rgba(168, 168, 168, 0.4)',
      downColor: 'rgba(82, 82, 82, 0.4)',
      borderUpColor: 'rgba(200, 200, 200, 0.5)',
      borderDownColor: 'rgba(100, 100, 100, 0.5)',
      wickUpColor: 'rgba(168, 168, 168, 0.3)',
      wickDownColor: 'rgba(82, 82, 82, 0.3)',
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: '#71717a',
      priceLineStyle: LineStyle.Dotted,
    });
    candleSeries.setData(candles);
    candleSeriesRef.current = candleSeries;

    // ── Bollinger Bands ──
    const bbUpper = chart.addSeries(LineSeries, {
      color: 'rgba(239, 68, 68, 0.25)', lineWidth: 1, lineStyle: LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    });
    const bbMiddle = chart.addSeries(LineSeries, {
      color: 'rgba(161, 161, 170, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    });
    const bbLower = chart.addSeries(LineSeries, {
      color: 'rgba(59, 130, 246, 0.25)', lineWidth: 1, lineStyle: LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    });
    const bb = computeBollingerBands(candles);
    bbUpper.setData(bb.upper);
    bbMiddle.setData(bb.middle);
    bbLower.setData(bb.lower);
    bbUpperRef.current = bbUpper;
    bbMiddleRef.current = bbMiddle;
    bbLowerRef.current = bbLower;

    // ── 돌파 레벨 (20봉 고/저점) ──
    const boHigh = chart.addSeries(LineSeries, {
      color: 'rgba(34, 197, 94, 0.4)', lineWidth: 1, lineStyle: LineStyle.Solid,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      pointMarkersVisible: false,
    });
    const boLow = chart.addSeries(LineSeries, {
      color: 'rgba(239, 68, 68, 0.4)', lineWidth: 1, lineStyle: LineStyle.Solid,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      pointMarkersVisible: false,
    });
    const bo = computeBreakoutLevels(candles);
    boHigh.setData(bo.high);
    boLow.setData(bo.low);
    boHighRef.current = boHigh;
    boLowRef.current = boLow;

    // ── RSI 서브 패널 ──
    if (rsiContainerRef.current) {
      if (rsiChartRef.current) {
        try { rsiChartRef.current.remove(); } catch {}
      }

      const rsiChart = createChart(rsiContainerRef.current, {
        width: rsiContainerRef.current.clientWidth,
        height: 120,
        layout: { background: { color: '#18181b' }, textColor: '#71717a' },
        grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
        crosshair: {
          mode: 1,
          horzLine: { color: '#e4e4e7', width: 1, style: 0, labelBackgroundColor: '#52525b' },
          vertLine: { color: '#a1a1aa', width: 1, style: 2, labelBackgroundColor: '#52525b' },
        },
        rightPriceScale: {
          borderColor: '#3f3f46',
          scaleMargins: { top: 0.05, bottom: 0.05 },
          autoScale: false,
        },
        timeScale: { borderColor: '#3f3f46', timeVisible: true, visible: false, rightOffset: 20 },
      });

      rsiChart.priceScale('right').applyOptions({ autoScale: false });

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#a78bfa', lineWidth: 1,
        lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: true,
      });
      const rsiData = computeRSI(candles, divergenceParams.rsiPeriod);
      rsiSeries.setData(rsiData);
      rsiSeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

      // 과매도/과매수 임계선 (전략 파라미터)
      const thresholdData = (val: number) => {
        if (rsiData.length < 2) return [];
        return [
          { time: rsiData[0].time, value: val },
          { time: rsiData[rsiData.length - 1].time, value: val },
        ];
      };
      const oversoldLine = rsiChart.addSeries(LineSeries, {
        color: 'rgba(34, 197, 94, 0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed,
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      });
      oversoldLine.setData(thresholdData(divergenceParams.rsiOversold));
      oversoldLine.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

      const overboughtLine = rsiChart.addSeries(LineSeries, {
        color: 'rgba(239, 68, 68, 0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed,
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      });
      overboughtLine.setData(thresholdData(divergenceParams.rsiOverbought));
      overboughtLine.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

      // 다이버전스 감지 & 선분 표시 — 실제 전략과 동일한 파라미터/멀티 피봇 길이 사용
      const { pivotLows, pivotHighs, divLines } = detectDivergencesMulti(candles, rsiData, divergenceParams);

      const rsiMarkers: SeriesMarker<Time>[] = [];
      for (const p of pivotLows) {
        rsiMarkers.push({ time: p.time, position: 'belowBar', color: '#22c55e', shape: 'circle', size: 0, text: '◆' } as SeriesMarker<Time>);
      }
      for (const p of pivotHighs) {
        rsiMarkers.push({ time: p.time, position: 'aboveBar', color: '#ef4444', shape: 'circle', size: 0, text: '◆' } as SeriesMarker<Time>);
      }
      rsiMarkers.sort((a, b) => (a.time as number) - (b.time as number));
      if (rsiMarkers.length > 0) createSeriesMarkers(rsiSeries, rsiMarkers);

      for (const div of divLines) {
        const divRsiSeries = rsiChart.addSeries(LineSeries, {
          color: div.type === 'bullish' ? '#22c55e' : '#ef4444',
          lineWidth: 2, lineStyle: LineStyle.Solid,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        });
        divRsiSeries.setData([
          { time: div.p1.time, value: div.p1.rsi },
          { time: div.p2.time, value: div.p2.rsi },
        ]);
        divRsiSeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

        const divPriceSeries = chart.addSeries(LineSeries, {
          color: div.type === 'bullish' ? '#22c55e' : '#ef4444',
          lineWidth: 2, lineStyle: LineStyle.Dashed,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        });
        divPriceSeries.setData([
          { time: div.p1.time, value: div.p1.price },
          { time: div.p2.time, value: div.p2.price },
        ]);
      }

      // 타임스케일 동기화
      const rsiOffset = candles.length - rsiData.length;
      let isSyncing = false;
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing || !range || !rsiChartRef.current) return;
        isSyncing = true;
        rsiChartRef.current.timeScale().setVisibleLogicalRange({ from: range.from - rsiOffset, to: range.to - rsiOffset });
        isSyncing = false;
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing || !range || !chartRef.current) return;
        isSyncing = true;
        chartRef.current.timeScale().setVisibleLogicalRange({ from: range.from + rsiOffset, to: range.to + rsiOffset });
        isSyncing = false;
      });

      // 크로스헤어 동기화 (메인 ↔ RSI)
      let isCrosshairSyncing = false;
      chart.subscribeCrosshairMove((param) => {
        if (isCrosshairSyncing || !rsiChartRef.current || !rsiSeriesRef.current) return;
        isCrosshairSyncing = true;
        if (param.time) {
          const rsiVal = rsiSeriesRef.current.dataByIndex(
            rsiChartRef.current.timeScale().timeToCoordinate(param.time as any) != null
              ? Math.round(rsiChartRef.current.timeScale().coordinateToLogical(
                  rsiChartRef.current.timeScale().timeToCoordinate(param.time as any)!
                ) ?? 0)
              : 0
          );
          rsiChartRef.current.setCrosshairPosition(rsiVal?.value ?? 50, param.time, rsiSeriesRef.current);
        } else {
          rsiChartRef.current.clearCrosshairPosition();
        }
        isCrosshairSyncing = false;
      });
      rsiChart.subscribeCrosshairMove((param) => {
        if (isCrosshairSyncing || !chartRef.current || !candleSeriesRef.current) return;
        isCrosshairSyncing = true;
        if (param.time) {
          chartRef.current.setCrosshairPosition(0, param.time, candleSeriesRef.current);
        } else {
          chartRef.current.clearCrosshairPosition();
        }
        isCrosshairSyncing = false;
      });

      rsiChartRef.current = rsiChart;
      rsiSeriesRef.current = rsiSeries;

      const rsiResizeObs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === rsiContainerRef.current && rsiChartRef.current) {
            rsiChartRef.current.applyOptions({ width: entry.contentRect.width });
          }
        }
      });
      rsiResizeObs.observe(rsiContainerRef.current);
    }

    // ── Z-Score 서브 패널 ──
    if (zscoreContainerRef.current) {
      if (zscoreChartRef.current) {
        try { zscoreChartRef.current.remove(); } catch {}
      }

      const zscoreChart = createChart(zscoreContainerRef.current, {
        width: zscoreContainerRef.current.clientWidth,
        height: 100,
        layout: { background: { color: '#18181b' }, textColor: '#71717a' },
        grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
        crosshair: {
          mode: 1,
          horzLine: { color: '#e4e4e7', width: 1, style: 0, labelBackgroundColor: '#52525b' },
          vertLine: { color: '#a1a1aa', width: 1, style: 2, labelBackgroundColor: '#52525b' },
        },
        rightPriceScale: { borderColor: '#3f3f46', scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: '#3f3f46', timeVisible: true, visible: false, rightOffset: 20 },
      });

      const zscoreData = computeZScore(candles);
      const zOffset = candles.length - zscoreData.length;

      const zSeries = zscoreChart.addSeries(LineSeries, {
        color: '#34d399', lineWidth: 1,
        lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: true,
      });
      zSeries.setData(zscoreData);

      const thresholdZ = (val: number, color: string) => {
        if (zscoreData.length < 2) return;
        const s = zscoreChart.addSeries(LineSeries, {
          color, lineWidth: 1, lineStyle: LineStyle.Dashed,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        });
        s.setData([
          { time: zscoreData[0].time, value: val },
          { time: zscoreData[zscoreData.length - 1].time, value: val },
        ]);
      };
      thresholdZ(2.5, 'rgba(239,68,68,0.5)');
      thresholdZ(-2.5, 'rgba(34,197,94,0.5)');
      thresholdZ(1.5, 'rgba(239,68,68,0.25)');
      thresholdZ(-1.5, 'rgba(34,197,94,0.25)');
      thresholdZ(0, 'rgba(161,161,170,0.3)');

      // 타임스케일 동기화
      let isZSyncing = false;
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isZSyncing || !range || !zscoreChartRef.current) return;
        isZSyncing = true;
        zscoreChartRef.current.timeScale().setVisibleLogicalRange({ from: range.from - zOffset, to: range.to - zOffset });
        isZSyncing = false;
      });
      zscoreChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isZSyncing || !range || !chartRef.current) return;
        isZSyncing = true;
        chartRef.current.timeScale().setVisibleLogicalRange({ from: range.from + zOffset, to: range.to + zOffset });
        isZSyncing = false;
      });

      // 크로스헤어 동기화
      let isZCrosshairSyncing = false;
      chart.subscribeCrosshairMove((param) => {
        if (isZCrosshairSyncing || !zscoreChartRef.current || !zscoreSeriesRef.current) return;
        isZCrosshairSyncing = true;
        if (param.time) {
          zscoreChartRef.current.setCrosshairPosition(0, param.time, zscoreSeriesRef.current);
        } else {
          zscoreChartRef.current.clearCrosshairPosition();
        }
        isZCrosshairSyncing = false;
      });
      zscoreChart.subscribeCrosshairMove((param) => {
        if (isZCrosshairSyncing || !chartRef.current || !candleSeriesRef.current) return;
        isZCrosshairSyncing = true;
        if (param.time) {
          chartRef.current.setCrosshairPosition(0, param.time, candleSeriesRef.current);
        } else {
          chartRef.current.clearCrosshairPosition();
        }
        isZCrosshairSyncing = false;
      });

      zscoreChartRef.current = zscoreChart;
      zscoreSeriesRef.current = zSeries;

      const zResizeObs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === zscoreContainerRef.current && zscoreChartRef.current) {
            zscoreChartRef.current.applyOptions({ width: entry.contentRect.width });
          }
        }
      });
      zResizeObs.observe(zscoreContainerRef.current);
    }

    // ── 크로스헤어 거래 툴팁 ──
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredTrade(null);
        setHoveredSkipped(null);
        setTooltipPos(null);
        return;
      }

      const time = param.time as number;
      const tolerance =
        timeframe === '1m' ? 60
        : timeframe === '5m' ? 300
        : timeframe === '15m' ? 900
        : 3600;

      let found: { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' } | null = null;
      for (const [t, data] of tradeMapRef.current) {
        if (Math.abs(t - time) < tolerance) { found = data; break; }
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

    // ── ResizeObserver ──
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current && chartRef.current) {
          const { width, height } = entry.contentRect;
          chartRef.current.applyOptions({ width, height: height || 500 });
          chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    requestAnimationFrame(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().scrollToRealTime();
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      }
    });

    return () => {
      resizeObserver.disconnect();
      isChartDisposedRef.current = true;
      try { chart.remove(); } catch {}
      try { rsiChartRef.current?.remove(); } catch {}
      chartRef.current = null;
      candleSeriesRef.current = null;
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
      boHighRef.current = null;
      boLowRef.current = null;
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
      priceLinesRef.current = [];
      seriesMarkersRef.current = null;
    };
    // divKey: 전략 변경으로 다이버전스 파라미터가 바뀌면 차트 재생성 (RSI 기간·임계선·피봇 갱신)
  }, [timeframe, chartKey, divKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
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
  };
}
