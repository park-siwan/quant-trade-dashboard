'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  CandlestickData,
  LineData,
  LineSeries,
  AreaSeries,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  Time,
} from 'lightweight-charts';
import {
  addRsiIndicator,
  addObvIndicator,
  addCvdIndicator,
  addOiIndicator,
  addAtrIndicator,
  addDivergenceLines,
  addEmaIndicators,
  addCrossoverMarkers,
  addCvdOiMarkers,
} from '@/lib/chart/indicators';
import {
  createChartOptions,
  calculateChartHeight,
  getCandlestickOptions,
  getAreaSeriesOptions,
  PANEL_CONFIG,
} from '@/lib/chart/chartConfig';
import { debug } from '@/lib/debug';
import { COLORS, CHART_COLORS, INDICATOR_COLORS, MARKER_COLORS, MEASURE_COLORS, WALL_COLORS, GLOW_DOT_COLORS, GRAY_UP, GRAY_DOWN, rgba } from '@/lib/colors';
import {
  DivergenceSignal,
  EmaData,
  TrendAnalysis,
  CrossoverEvent,
  MarketSignal,
  ConsolidationData,
  VwapAtrData,
  OrderBlockData,
  OrderBookData,
  LiquidationSummary,
  WhaleSummary,
  MarketStructureData,
  AdxData,
  MTFAction,
  BlendedZone,
  SupportResistanceZone,
} from '@/lib/types/index';
import { createZonesFromData, mergeOverlappingZones } from '@/lib/chart/zoneUtils';
import SupportResistanceZones from './SupportResistanceZones';
import ZoneLegend from './ZoneLegend';
import ChartTooltip from './ChartTooltip';
import MeasurementBox, { MeasureBoxData } from './MeasurementBox';
import { CrossoverMarkers, SignalMarkers, CrossoverMarkerData, SignalMarkerData, SIGNAL_CONFIG } from './ChartMarkers';
import TrendIndicatorsBar from './TrendIndicatorsBar';
import { VolumeProfileData, RealtimeCandle } from './chartTypes';
import { ChevronUp } from 'lucide-react';
import { LongShortRatio } from '@/hooks/useLongShortRatio';
import {
  timeframeToMinutes,
  formatMinutesToDuration as formatTimeRange,
  calculateTimeRange,
} from '@/lib/timeframe';
import { getChartColor, SIGNAL_STYLES, getDivergenceFreshnessColors, calculateDivergenceFreshness, ChartColorType } from '@/lib/signal';
import { DIVERGENCE_EXPIRY_CANDLES, timeframeToMs } from '@/lib/timeframe';

// VolumeProfileData는 chartTypes.ts에서 re-export
export type { VolumeProfileData } from './chartTypes';

interface ChartRendererProps {
  data: CandlestickData[];
  rsiData?: LineData[];
  obvData?: LineData[];
  cvdData?: LineData[];
  oiData?: LineData[];
  emaData?: EmaData;
  divergenceSignals?: DivergenceSignal[];
  trendAnalysis?: TrendAnalysis;
  crossoverEvents?: CrossoverEvent[];
  marketSignals?: MarketSignal[]; // CVD + OI 신호
  timeframe?: string; // 타임프레임 정보 (5m, 15m, 1h 등)
  realtimeCandle?: RealtimeCandle | null;
  longShortRatio?: LongShortRatio | null; // 롱/숏 비율 (Bybit API)
  volumeProfile?: VolumeProfileData | null; // 가격대별 거래량
  consolidationData?: ConsolidationData | null; // 횡보 구간 데이터
  vwapAtrData?: VwapAtrData | null; // VWAP + ATR 데이터
  orderBlockData?: OrderBlockData | null; // 오더블록 데이터
  orderBookData?: OrderBookData | null; // 오더북 매수/매도벽 데이터
  liquidationData?: LiquidationSummary | null; // 청산 데이터
  whaleData?: WhaleSummary | null; // 고래 거래 데이터
  marketStructureData?: MarketStructureData | null; // 시장 구조 (BOS/CHoCH)
  adxData?: AdxData | null; // ADX 추세 강도 데이터
  mini?: boolean; // 미니 차트 모드
  actionInfo?: { action: string; reason: string } | null; // MTF 신호 정보 (미니 차트용)
}

export default function ChartRenderer({
  data,
  rsiData,
  obvData,
  cvdData,
  oiData,
  emaData,
  divergenceSignals,
  trendAnalysis,
  crossoverEvents,
  marketSignals,
  timeframe = '5m',
  realtimeCandle,
  longShortRatio,
  volumeProfile,
  consolidationData,
  vwapAtrData,
  orderBlockData,
  orderBookData,
  liquidationData,
  whaleData,
  marketStructureData,
  adxData,
  mini = false,
  actionInfo,
}: ChartRendererProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    rsi: number | null;
    filterReason: string | null;
    crossover: { type: 'golden_cross' | 'dead_cross'; analysis: string } | null;
    divergences: Array<{ type: string; direction: string; analysis: string; isFiltered: boolean; startTime: number; endTime: number }>;
    marketSignal?: MarketSignal | null;
    choch?: {
      direction: 'bullish' | 'bearish';
      strength: 'strong' | 'medium' | 'weak';
      isOverheated: boolean;
      rsiAtBreak?: number;
    } | null;
  } | null>(null);
  const [trendTooltip, setTrendTooltip] = useState<string | null>(null); // 추세 툴팁
  const [currentPriceInfo, setCurrentPriceInfo] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePercent: number;
  } | null>(null);
  // 측정 모드는 항상 활성화
  const [measurePoints, setMeasurePoints] = useState<{
    start: { time: number; price: number; x: number; y: number } | null;
    end: { time: number; price: number; x: number; y: number } | null;
  }>({ start: null, end: null });
  const measurePointsRef = useRef(measurePoints); // ref로도 관리하여 closure 문제 해결
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);
  const isFirstRenderRef = useRef(true); // 첫 렌더링인지 추적
  const savedVisibleLogicalRangeRef = useRef<{
    from: number;
    to: number;
  } | null>(null); // 논리적 스크롤 범위 저장 (바 인덱스 기반)
  const chartRef = useRef<IChartApi | null>(null);
  const measureLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeProfileLinesRef = useRef<IPriceLine[]>([]); // Volume Profile 라인 ref (Y축 라벨용)
  const isChartDisposedRef = useRef<boolean>(false); // 차트 dispose 상태 추적

  // Volume Profile 표시 토글 (useEffect보다 먼저 선언해야 함)
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);

  // 지지/저항 영역 라벨 표시 토글
  const [showZoneLabels, setShowZoneLabels] = useState(true);

  // Visible range 상태 (차트에 보이는 캔들 범위)
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);

  // measurePoints가 변경될 때마다 ref도 업데이트
  useEffect(() => {
    measurePointsRef.current = measurePoints;
  }, [measurePoints]);

  // 데이터가 변경되면 측정 도구 초기화 (타임프레임 변경 등)
  useEffect(() => {
    setMeasurePoints({ start: null, end: null });
  }, [data]);

  // 실시간 캔들 업데이트 (update 방식으로 뷰 유지)
  useEffect(() => {
    // 차트가 아직 준비되지 않았거나, realtimeCandle이 없거나, 캔들이 닫힌 경우 스킵
    if (!realtimeCandle) {
      debug.chart('⚠️ realtimeCandle 없음');
      return;
    }
    if (!candlestickSeriesRef.current) {
      debug.chart('⚠️ candlestickSeriesRef 없음');
      return;
    }
    if (realtimeCandle.isFinal) {
      debug.chart('⚠️ 캔들 종료됨, 업데이트 스킵');
      return;
    }
    if (!chartRef.current) {
      debug.chart('⚠️ chartRef 없음');
      return;
    }
    // dispose 상태 체크
    if (isChartDisposedRef.current) {
      debug.chart('⚠️ 차트가 dispose됨, 업데이트 스킵');
      return;
    }

    debug.chart('📈 차트 업데이트:', realtimeCandle.close.toFixed(2));

    try {
      // 차트가 dispose되지 않았는지 확인
      if (candlestickSeriesRef.current && !isChartDisposedRef.current) {
        // 미니 모드 (AreaSeries)와 일반 모드 (CandlestickSeries) 구분
        if (mini) {
          // AreaSeries는 { time, value } 형식 사용
          const areaUpdate = {
            time: (realtimeCandle.timestamp / 1000) as LineData['time'],
            value: realtimeCandle.close,
          };
          (candlestickSeriesRef.current as ISeriesApi<'Area'>).update(areaUpdate);
        } else {
          // CandlestickSeries는 전체 OHLC 데이터 사용 - 무채색
          const isUp = realtimeCandle.close >= realtimeCandle.open;
          const candleColor = isUp ? GRAY_UP : GRAY_DOWN;

          const candleUpdate: CandlestickData = {
            time: (realtimeCandle.timestamp / 1000) as CandlestickData['time'],
            open: realtimeCandle.open,
            high: realtimeCandle.high,
            low: realtimeCandle.low,
            close: realtimeCandle.close,
            color: candleColor,
            borderColor: candleColor,
            wickColor: candleColor,
          };
          (candlestickSeriesRef.current as ISeriesApi<'Candlestick'>).update(candleUpdate);
        }

        // 가격 정보 업데이트
        const change = realtimeCandle.close - realtimeCandle.open;
        const changePercent = (change / realtimeCandle.open) * 100;

        setCurrentPriceInfo({
          open: realtimeCandle.open,
          high: realtimeCandle.high,
          low: realtimeCandle.low,
          close: realtimeCandle.close,
          change,
          changePercent,
        });
      }
    } catch (err) {
      // disposed 에러는 무시 (차트가 재생성 중)
      if (err instanceof Error && err.message.includes('disposed')) {
        debug.chart('⚠️ 차트가 재생성 중입니다.');
      } else {
        debug.chart('❌ 캔들 업데이트 에러:', err);
      }
    }
  }, [realtimeCandle, mini]);

  // 차트 스케일 변경 감지를 위한 state (줌/스크롤 시 박스 위치 업데이트용)
  const [scaleUpdateTrigger, setScaleUpdateTrigger] = useState(0);

  // 캔들 투명도 설정
  const CANDLE_OPACITY = 0.3;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 차트 생성 (패널 개수에 따라 높이 조정)
    // 미니 모드에서는 지표 패널 숨김
    const hasRsi = mini ? false : (rsiData && rsiData.length > 0);
    const hasObv = mini ? false : (obvData && obvData.length > 0);
    const hasCvd = mini ? false : (cvdData && cvdData.length > 0);
    const hasOi = mini ? false : (oiData && oiData.length > 0);
    const hasAtr = mini ? false : (vwapAtrData?.atr && vwapAtrData.atr.length > 0);

    // 미니 모드: 컨테이너 높이 사용, 일반 모드: 패널별 고정 높이
    let chartHeight: number;
    if (mini) {
      chartHeight = chartContainerRef.current.clientHeight || 200;
    } else {
      const panelCount = 1 + (hasRsi ? 1 : 0) + (hasObv ? 1 : 0) + (hasCvd ? 1 : 0) + (hasOi ? 1 : 0) + (hasAtr ? 1 : 0); // 메인 + 지표들
      const panelHeight = 280; // 각 패널당 높이
      chartHeight = panelCount * panelHeight;
    }

    // 차트 생성 전 dispose 플래그 초기화
    isChartDisposedRef.current = false;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.CHART_BG },
        textColor: COLORS.TEXT_SECONDARY,
        fontSize: mini ? 9 : 12,
        panes: {
          separatorColor: CHART_COLORS.SEPARATOR,
          separatorHoverColor: CHART_COLORS.SEPARATOR_HOVER,
          enableResize: false,
        },
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      grid: {
        vertLines: { color: CHART_COLORS.GRID },
        horzLines: { color: CHART_COLORS.GRID },
      },
      timeScale: {
        timeVisible: !mini, // 미니 모드에서 시간 숨김
        secondsVisible: false,
        rightOffset: mini ? 70 : 20, // 우측 여백 (미니 차트는 더 넓게)
        lockVisibleTimeRangeOnResize: true, // 리사이즈 시 시간 범위 유지
        barSpacing: mini ? 3 : 8, // 초기 캔들 간격 (크게 확대)
        minBarSpacing: 0.5, // 최소 간격
      },
      kineticScroll: {
        touch: false, // 터치 스크롤 비활성화 (들썩임 방지)
        mouse: false, // 마우스 스크롤 비활성화 (들썩임 방지)
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: mini ? 0.15 : 0.1,
          bottom: mini ? 0.15 : 0.1,
        },
        autoScale: true, // 자동 스케일 활성화
        mode: 0, // Normal price scale mode
        minimumWidth: mini ? 50 : 80, // 미니 모드에서 가격축 너비 축소
      },
      localization: {
        timeFormatter: (time: number) => {
          // UTC timestamp를 서울 시간(UTC+9)으로 변환
          const date = new Date(time * 1000);
          const seoulDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

          const year = seoulDate.getUTCFullYear();
          const month = String(seoulDate.getUTCMonth() + 1).padStart(2, '0');
          const day = String(seoulDate.getUTCDate()).padStart(2, '0');
          const hours = String(seoulDate.getUTCHours()).padStart(2, '0');
          const minutes = String(seoulDate.getUTCMinutes()).padStart(2, '0');

          return `${year}-${month}-${day} ${hours}:${minutes}`;
        },
      },
    });

    // 차트 참조 저장
    chartRef.current = chart;

    // 중복 타임스탬프 제거 (lightweight-charts 요구사항: 시간 오름차순, 중복 불가)
    const uniqueData = data.filter((candle, index, arr) => {
      if (index === 0) return true;
      return candle.time !== arr[index - 1].time;
    });

    // 미니 모드: 영역 차트 (그라데이션 채우기)
    // 일반 모드: 캔들스틱 차트
    if (mini) {
      // 글로우 점 색상 - 무채색 통일
      setChartColor('gray');

      // 영역 시리즈 추가 (무채색 - 다이버전스 라인 강조용)
      const areaSeries = chart.addSeries(
        AreaSeries,
        {
          lineColor: CHART_COLORS.MINI_LINE,
          lineWidth: 1,
          topColor: CHART_COLORS.MINI_TOP,
          bottomColor: CHART_COLORS.MINI_BOTTOM,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: COLORS.WHITE,
          crosshairMarkerBackgroundColor: COLORS.NEUTRAL,
          lastValueVisible: true,
          priceLineVisible: false,
        },
        0,
      );

      // 종가 데이터로 변환
      const lineData: LineData[] = uniqueData.map(candle => ({
        time: candle.time,
        value: candle.close,
      }));

      areaSeries.setData(lineData);
      candlestickSeriesRef.current = areaSeries;
    } else {
      // 캔들스틱 시리즈 추가 (메인 패널 - paneIndex: 0) - 무채색
      const candlestickSeries = chart.addSeries(
        CandlestickSeries,
        {
          upColor: rgba(GRAY_UP, CANDLE_OPACITY),
          downColor: rgba(GRAY_DOWN, CANDLE_OPACITY),
          borderUpColor: rgba(GRAY_UP, CANDLE_OPACITY),
          borderDownColor: rgba(GRAY_DOWN, CANDLE_OPACITY),
          wickUpColor: rgba(GRAY_UP, CANDLE_OPACITY),
          wickDownColor: rgba(GRAY_DOWN, CANDLE_OPACITY),
        },
        0,
      );

      // 최근 60개 캔들은 투명도 없이, 나머지는 CANDLE_OPACITY로 표시
      const recentThreshold = uniqueData.length - 60;
      const RECENT_OPACITY = 1.0; // 최근 캔들 투명도 (완전 불투명)
      const candleDataWithColors = uniqueData.map((candle, index) => {
        const isRecent = index >= recentThreshold;
        const opacity = isRecent ? RECENT_OPACITY : CANDLE_OPACITY;
        const isUp = candle.close >= candle.open;

        return {
          ...candle,
          color: rgba(isUp ? GRAY_UP : GRAY_DOWN, opacity),
          borderColor: rgba(isUp ? GRAY_UP : GRAY_DOWN, opacity),
          wickColor: rgba(isUp ? GRAY_UP : GRAY_DOWN, opacity),
        };
      });

      candlestickSeries.setData(candleDataWithColors);
      candlestickSeriesRef.current = candlestickSeries;
    }

    // 뷰 상태 설정은 scrollToRealTime 이후에 처리
    // 가격 스케일 자동 맞춤
    chart.priceScale('right').applyOptions({ autoScale: true });

    // 초기 가격 정보 설정 (최신 캔들)
    if (data.length > 0) {
      const latestCandle = data[data.length - 1];
      if ('open' in latestCandle && 'close' in latestCandle) {
        const open = latestCandle.open;
        const high = latestCandle.high;
        const low = latestCandle.low;
        const close = latestCandle.close;
        const change = close - open;
        const changePercent = (change / open) * 100;

        setCurrentPriceInfo({
          open,
          high,
          low,
          close,
          change,
          changePercent,
        });
      }
    }

    // EMA 지표 추가
    if (emaData) {
      const candleData = data.map((candle) => ({
        time: candle.time as number,
      }));
      addEmaIndicators(chart, emaData, candleData);
    }

    // 동적 paneIndex 계산 (데이터가 있는 지표만 순차적으로 패널 배치)
    let currentPaneIndex = 1; // 메인 패널은 0, 지표는 1부터 시작

    // RSI 지표 추가
    let rsiSeries = null;
    let rsiPaneIndex = 0;
    if (hasRsi) {
      rsiPaneIndex = currentPaneIndex++;
      rsiSeries = addRsiIndicator(chart, rsiData!, rsiPaneIndex);
    }

    // OBV 지표 추가
    let obvSeries = null;
    let obvPaneIndex = 0;
    if (hasObv) {
      obvPaneIndex = currentPaneIndex++;
      obvSeries = addObvIndicator(chart, obvData!, obvPaneIndex);
    }

    // CVD 지표 추가
    let cvdSeries = null;
    let cvdPaneIndex = 0;
    if (hasCvd) {
      cvdPaneIndex = currentPaneIndex++;
      cvdSeries = addCvdIndicator(chart, cvdData!, cvdPaneIndex);
    }

    // OI 지표 추가 (미니 모드에서는 숨김)
    let oiSeries = null;
    let oiPaneIndex = 0;
    if (hasOi) {
      oiPaneIndex = currentPaneIndex++;
      oiSeries = addOiIndicator(chart, oiData!, oiPaneIndex);
    }

    // ATR 지표 추가 (미니 모드에서는 숨김)
    let atrSeries = null;
    let atrPaneIndex = 0;
    if (hasAtr) {
      atrPaneIndex = currentPaneIndex++;
      // ATR 데이터를 LineData 형식으로 변환
      const atrLineData: LineData[] = [];
      vwapAtrData!.atr!.forEach((atrValue, index) => {
        if (atrValue !== null && data[index]) {
          atrLineData.push({
            time: data[index].time,
            value: atrValue,
          });
        }
      });
      atrSeries = addAtrIndicator(chart, atrLineData, atrPaneIndex);
    }

    // 메인 시리즈 참조 (candlestick 또는 line)
    const mainSeries = candlestickSeriesRef.current;

    // 다이버전스 선 추가
    if (divergenceSignals && divergenceSignals.length > 0 && mainSeries) {
      // 캔들 데이터에서 시간, 고가, 저가, 종가 추출
      const candleData = data.map((candle) => ({
        time: candle.time as number,
        high: candle.high,
        low: candle.low,
        close: candle.close, // 라인 차트용 종가
      }));

      addDivergenceLines(
        chart,
        mainSeries as ISeriesApi<'Candlestick'>,
        rsiSeries,
        obvSeries,
        cvdSeries,
        oiSeries,
        divergenceSignals,
        candleData,
        rsiData || [],
        obvData || [],
        cvdData || [],
        oiData || [],
        {
          rsi: rsiPaneIndex || undefined,
          obv: obvPaneIndex || undefined,
          cvd: cvdPaneIndex || undefined,
          oi: oiPaneIndex || undefined,
        },
        mini, // 미니 모드(라인 차트)면 종가 기준으로 선 그림
      );
    }

    // 크로스오버 마커 추가 (미니 모드에서는 스킵)
    if (crossoverEvents && crossoverEvents.length > 0 && mainSeries && !mini) {
      addCrossoverMarkers(mainSeries as ISeriesApi<'Candlestick'>, crossoverEvents);
    }

    // CVD + OI 신호 마커 - 커스텀 오버레이 방식으로 변경 (아래 JSX에서 처리)
    // if (marketSignals && marketSignals.length > 0) {
    //   addCvdOiMarkers(candlestickSeries, marketSignals);
    // }

    // Volume Profile 라인 - Y축 라벨 숨김 (영역으로 표시됨)
    volumeProfileLinesRef.current = []; // 초기화
    if (volumeProfile && mainSeries) {
      // 목표가 (POC) - 가장 많이 거래된 가격 (Y축 라벨 숨김)
      const pocLine = mainSeries.createPriceLine({
        price: volumeProfile.poc,
        color: INDICATOR_COLORS.POC,
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: false, // Y축 라벨 숨김 (영역 라벨로 대체)
        title: 'POC',
        axisLabelColor: INDICATOR_COLORS.POC_LABEL,
        axisLabelTextColor: COLORS.BLACK,
        lineVisible: false,
      });
      volumeProfileLinesRef.current.push(pocLine);

      // 상단 (VAH) - 빨간색 (숏) (Y축 라벨 숨김)
      const vahLine = mainSeries.createPriceLine({
        price: volumeProfile.vah,
        color: INDICATOR_COLORS.VAH,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false, // Y축 라벨 숨김 (영역 라벨로 대체)
        title: 'VAH',
        axisLabelColor: INDICATOR_COLORS.VAH_LABEL,
        axisLabelTextColor: COLORS.BLACK,
        lineVisible: false,
      });
      volumeProfileLinesRef.current.push(vahLine);

      // 하단 (VAL) - 초록색 (롱) (Y축 라벨 숨김)
      const valLine = mainSeries.createPriceLine({
        price: volumeProfile.val,
        color: INDICATOR_COLORS.VAL,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false, // Y축 라벨 숨김 (영역 라벨로 대체)
        title: 'VAL',
        axisLabelColor: INDICATOR_COLORS.VAL_LABEL,
        axisLabelTextColor: COLORS.BLACK,
        lineVisible: false,
      });
      volumeProfileLinesRef.current.push(valLine);
    }

    // VWAP 라인 - Y축 라벨 숨김 (가로선은 DOM으로 렌더링)
    if (vwapAtrData && vwapAtrData.currentVwap > 0 && mainSeries) {
      mainSeries.createPriceLine({
        price: vwapAtrData.currentVwap,
        color: INDICATOR_COLORS.VWAP,
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: false, // Y축 라벨 숨김
        title: '기관(VWAP)',
        axisLabelColor: INDICATOR_COLORS.VWAP_LABEL,
        axisLabelTextColor: COLORS.WHITE,
        lineVisible: false,
      });
    }

    // ATR 기반 변동폭 라인 - Y축 라벨 숨김 (가로선은 DOM으로 렌더링)
    if (vwapAtrData?.suggestedStopLoss && mainSeries) {
      // 하단 (현재가 - 2*ATR) = 롱 진입 유리 구간
      mainSeries.createPriceLine({
        price: vwapAtrData.suggestedStopLoss.long,
        color: INDICATOR_COLORS.ATR_LONG,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false, // Y축 라벨 숨김
        title: '롱(ATR)↓',
        axisLabelColor: INDICATOR_COLORS.ATR_LONG_LABEL,
        axisLabelTextColor: COLORS.BLACK,
        lineVisible: false,
      });

      // 상단 (현재가 + 2*ATR) = 숏 진입 유리 구간
      mainSeries.createPriceLine({
        price: vwapAtrData.suggestedStopLoss.short,
        color: INDICATOR_COLORS.ATR_SHORT,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false, // Y축 라벨 숨김
        title: '숏(ATR)↑',
        axisLabelColor: INDICATOR_COLORS.ATR_SHORT_LABEL,
        axisLabelTextColor: COLORS.BLACK,
        lineVisible: false,
      });
    }

    // 오더블록 표시 - Y축 라벨 숨김 (영역으로 표시됨)
    if (orderBlockData?.activeBlocks && orderBlockData.activeBlocks.length > 0 && mainSeries) {
      const currentPrice = data[data.length - 1]?.close || 0;

      orderBlockData.activeBlocks.forEach((block) => {
        const midPrice = (block.high + block.low) / 2;
        const isSupport = midPrice < currentPrice;

        const color = isSupport
          ? INDICATOR_COLORS.SUPPORT
          : INDICATOR_COLORS.RESISTANCE;

        mainSeries.createPriceLine({
          price: midPrice,
          color: color,
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: false, // Y축 라벨 숨김 (영역 라벨로 대체)
          title: isSupport ? 'OB지지' : 'OB저항',
          axisLabelColor: color,
          axisLabelTextColor: COLORS.BLACK,
          lineVisible: false,
        });
        // 가로선은 DOM으로 렌더링 (priceLines state)
      });
    }

    // 패널 높이를 4:1:1:1 비율로 설정 (즉시 실행)
    const panes = chart.panes();
    if (panes.length > 0) {
      panes.forEach((pane, index) => {
        if (index === 0) {
          pane.setStretchFactor(4); // 메인 패널 4배
        } else {
          pane.setStretchFactor(1); // 지표 패널 1배
        }
      });
    }

    // 항상 최신 캔들(오른쪽 끝)을 보여주도록 설정
    chart.timeScale().scrollToRealTime();

    // 모든 차트: 최근 N개 캔들만 표시 (확대 상태)
    // 미니 차트: 50개, 메인 차트: 150개
    // 줌이 적용될 때까지 반복 시도
    const targetVisibleBars = mini ? 50 : 150;
    const totalBars = data.length;
    const targetFrom = Math.max(0, totalBars - targetVisibleBars);
    const targetTo = totalBars;
    let retryCount = 0;
    const maxRetries = 20;

    const applyZoomWithRetry = () => {
      if (isChartDisposedRef.current) return;
      if (retryCount >= maxRetries) {
        console.log(`[Chart${mini ? '-mini' : ''}] 줌 적용 최대 재시도 초과`);
        return;
      }

      try {
        // 현재 범위 확인
        const currentRange = chart.timeScale().getVisibleLogicalRange();
        const currentVisibleBars = currentRange ? (currentRange.to - currentRange.from) : 0;

        // 목표 범위와 다르면 다시 적용
        if (!currentRange || currentVisibleBars > targetVisibleBars + 10) {
          chart.timeScale().setVisibleLogicalRange({
            from: targetFrom,
            to: targetTo,
          });
          retryCount++;
          // 다음 프레임에서 다시 확인
          requestAnimationFrame(applyZoomWithRetry);
        } else {
          console.log(`[Chart${mini ? '-mini' : ''}] 줌 적용 완료 (${retryCount}회 시도, ${Math.round(currentVisibleBars)}개 캔들 표시)`);
        }
      } catch {
        // disposed 상태면 무시
      }
    };

    // 3프레임 대기 후 줌 적용 시작
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyZoomWithRetry();
        });
      });
    });

    isFirstRenderRef.current = false;

    // 통합 툴팁 (RSI 값 + 필터링 사유 + 크로스오버 + 다이버전스)
    chart.subscribeCrosshairMove((param) => {
        // 첫 번째 점만 설정된 상태: 미리보기 박스 그리기
        const currentMeasurePoints = measurePointsRef.current;
        if (currentMeasurePoints.start && !currentMeasurePoints.end && param.point) {
          const currentX = param.point.x;
          const currentY = param.point.y;

          const currentTime = chart.timeScale().coordinateToTime(currentX);
          const currentPrice = mainSeries?.coordinateToPrice(currentY);

          if (currentTime !== null && currentPrice !== null) {
            const startX = chart.timeScale().timeToCoordinate(currentMeasurePoints.start.time as Time);
            const startY = mainSeries?.priceToCoordinate(currentMeasurePoints.start.price);

            if (startX !== null && startY !== null) {
              const left = Math.min(startX, currentX);
              const top = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              const priceDiff = currentPrice - currentMeasurePoints.start.price;
              const pricePercent = (priceDiff / currentMeasurePoints.start.price) * 100;

              // 시간 계산
              const timeframeMinutes = timeframeToMinutes(timeframe);
              const timeDiffSeconds = Math.abs(Number(currentTime) - currentMeasurePoints.start.time);
              const bars = Math.round(timeDiffSeconds / (timeframeMinutes * 60));
              const totalMinutes = bars * timeframeMinutes;
              const timeRange = formatTimeRange(totalMinutes);

              setMeasureBox({
                left,
                top,
                width,
                height,
                priceDiff,
                pricePercent,
                bars,
                timeRange,
                isPreview: true, // 미리보기 박스
              });
            }
          }
        } else if (!currentMeasurePoints.start || currentMeasurePoints.end) {
          // 측정 중이 아니면 미리보기 박스 제거 (단, 확정 박스는 유지)
          setMeasureBox((prev) => {
            if (prev?.isPreview) {
              return null;
            }
            return prev;
          });
        }

        if (
          !param.time ||
          !param.point ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          setTooltip(null);
          return;
        }

        const currentTime = param.time as number;
        const currentTimestamp = currentTime * 1000;
        let rsiValue: number | null = null;
        let filterReason: string | null = null;
        let crossoverInfo: {
          type: 'golden_cross' | 'dead_cross';
          analysis: string;
        } | null = null;
        const divergenceInfos: Array<{
          type: string;
          direction: string;
          analysis: string;
          isFiltered: boolean;
          startTime: number;
          endTime: number;
        }> = [];
        let marketSignalInfo: MarketSignal | null = null;

        // 가격 정보 가져오기 (헤더 표시용)
        if (mainSeries && param.seriesData.has(mainSeries)) {
          const candleData = param.seriesData.get(mainSeries);
          if (candleData && 'open' in candleData && 'close' in candleData) {
            const open = candleData.open;
            const high = candleData.high;
            const low = candleData.low;
            const close = candleData.close;
            const change = close - open;
            const changePercent = (change / open) * 100;

            // 헤더 가격 정보 업데이트
            setCurrentPriceInfo({
              open,
              high,
              low,
              close,
              change,
              changePercent,
            });
          }
        }

        // RSI 값 가져오기 (RSI 패널이 활성화된 경우에만)
        if (rsiSeries && param.seriesData.has(rsiSeries)) {
          const rsi = param.seriesData.get(rsiSeries);
          if (rsi && 'value' in rsi) {
            rsiValue = rsi.value;
          }
        }

        // 크로스오버 이벤트 확인 (±10분 범위 내)
        if (crossoverEvents && crossoverEvents.length > 0) {
          const nearbyEvent = crossoverEvents.find((event) => {
            const timeDiff = Math.abs(event.timestamp - currentTimestamp);
            return timeDiff < 10 * 60 * 1000; // 10분 이내
          });

          if (nearbyEvent) {
            if (nearbyEvent.type === 'golden_cross') {
              crossoverInfo = {
                type: 'golden_cross',
                analysis: `EMA 50이 EMA 200을 상향 돌파했습니다 (골든크로스). 중장기 상승 추세 전환 신호로, 강력한 매수 기회입니다. 거래량과 함께 확인하면 신뢰도가 높아집니다.`,
              };
            } else {
              crossoverInfo = {
                type: 'dead_cross',
                analysis: `EMA 50이 EMA 200을 하향 돌파했습니다 (데드크로스). 중장기 하락 추세 전환 신호로, 매도 또는 관망이 권장됩니다. 추가 하락 가능성을 염두에 두세요.`,
              };
            }
          }
        }

        // 다이버전스 신호 확인
        if (divergenceSignals && divergenceSignals.length > 0) {
          for (let i = 0; i < divergenceSignals.length; i++) {
            const signal = divergenceSignals[i];
            if (signal.phase === 'start') {
              const endSignal = divergenceSignals.find(
                (s, idx) =>
                  idx > i &&
                  s.phase === 'end' &&
                  s.type === signal.type &&
                  s.direction === signal.direction,
              );

              if (endSignal) {
                const startTime = signal.timestamp / 1000;
                const endTime = endSignal.timestamp / 1000;

                if (currentTime >= startTime && currentTime <= endTime) {
                  // 필터링 사유 체크
                  if (signal.isFiltered || endSignal.isFiltered) {
                    filterReason = signal.reason || endSignal.reason || null;
                  }

                  // 다이버전스 분석 정보 (중복 체크 후 추가)
                  const alreadyExists = divergenceInfos.some(
                    (d) =>
                      d.type === signal.type &&
                      d.direction === signal.direction,
                  );

                  if (!alreadyExists) {
                    const isFiltered = Boolean(signal.isFiltered || endSignal.isFiltered);
                    if (signal.direction === 'bullish') {
                      divergenceInfos.push({
                        type: signal.type,
                        direction: 'bullish',
                        analysis: `가격은 하락하지만 ${signal.type.toUpperCase()}는 상승하고 있습니다. 매도 압력이 약해지고 있어 상승 반전 가능성이 있습니다. 매수 진입을 고려할 수 있는 시점입니다.`,
                        isFiltered,
                        startTime,
                        endTime,
                      });
                    } else {
                      divergenceInfos.push({
                        type: signal.type,
                        direction: 'bearish',
                        analysis: `가격은 상승하지만 ${signal.type.toUpperCase()}는 하락하고 있습니다. 매수 압력이 약해지고 있어 하락 반전 가능성이 있습니다. 매도 또는 익절을 고려하세요.`,
                        isFiltered,
                        startTime,
                        endTime,
                      });
                    }
                  }
                  // break 제거 - 모든 다이버전스를 찾기 위해
                }
              }
            }
          }
        }

        // CVD+OI 시장 신호 확인 (±10분 범위 내)
        if (marketSignals && marketSignals.length > 0) {
          const nearbySignal = marketSignals.find((signal) => {
            const timeDiff = Math.abs(signal.timestamp - currentTimestamp);
            return timeDiff < 10 * 60 * 1000; // 10분 이내
          });

          if (nearbySignal) {
            marketSignalInfo = nearbySignal;
          }
        }

        // CHoCH 신호 확인 (±2캔들 범위 내) - 다이버전스 배열에 추가
        if (marketStructureData && marketStructureData.structureBreaks.length > 0) {
          // 타임프레임에 따른 감지 범위 (2캔들 = 타임프레임 * 2)
          const tfMinutes = timeframeToMinutes(timeframe);
          const detectionRangeSeconds = tfMinutes * 60 * 2; // 2캔들 범위

          marketStructureData.structureBreaks.forEach((brk) => {
            if (brk.type !== 'CHoCH') return;
            // breakTime은 밀리초 단위, currentTime은 초 단위이므로 변환 필요
            const breakTimeSeconds = brk.breakTime / 1000;
            const timeDiff = Math.abs(breakTimeSeconds - currentTime);
            if (timeDiff < detectionRangeSeconds) {
              // 중복 체크: 같은 방향의 CHoCH가 이미 있으면 추가하지 않음
              const alreadyExists = divergenceInfos.some(
                (d) => d.type === 'choch' && d.direction === brk.direction
              );
              if (alreadyExists) return;

              const strengthText = brk.strength === 'strong' ? '강함' : brk.strength === 'medium' ? '중간' : '약함';
              const confidenceText = brk.isOverheated ? '높음 (RSI 확인)' : '낮음';
              const rsiText = brk.rsiAtBreak ? ` RSI: ${brk.rsiAtBreak.toFixed(1)}` : '';

              divergenceInfos.push({
                type: 'choch',
                direction: brk.direction,
                analysis: `CHoCH (Change of Character) - ${brk.direction === 'bullish' ? '상승' : '하락'} 전환 감지\n강도: ${strengthText} | 신뢰도: ${confidenceText}${rsiText}\n${brk.isOverheated ? '쉐브론 글로우: RSI 극단값으로 신뢰도 높음' : '쉐브론 투명: RSI 조건 미충족'}`,
                isFiltered: !brk.isOverheated,
                startTime: breakTimeSeconds,
                endTime: breakTimeSeconds,
              });
            }
          });
        }

        // 툴팁 표시 조건: RSI, 필터링, 크로스오버, 다이버전스, CVD+OI 중 하나라도 있으면 표시
        if (
          rsiValue !== null ||
          filterReason !== null ||
          crossoverInfo !== null ||
          divergenceInfos.length > 0 ||
          marketSignalInfo !== null
        ) {
          setTooltip({
            x: param.point.x,
            y: param.point.y,
            rsi: rsiValue,
            filterReason,
            crossover: crossoverInfo,
            divergences: divergenceInfos,
            marketSignal: marketSignalInfo,
          });
        } else {
          setTooltip(null);
        }
      });

    // 측정 클릭 이벤트 (항상 활성화)
    chart.subscribeClick((param) => {
      if (!param.point) return;

      const clickX = param.point.x;
      const clickY = param.point.y;

      // 먼저 현재 상태 확인 (세 번째 클릭인지)
      setMeasurePoints((prev) => {
        // 세 번째 클릭 (박스가 이미 그려진 상태): 완전히 초기화 (좌표 체크 없이)
        if (prev.start && prev.end) {
          return {
            start: null,
            end: null,
          };
        }

        // X 좌표를 시간으로 변환 (허공에서도 측정 가능)
        const currentTime = chart.timeScale().coordinateToTime(clickX);
        if (currentTime === null) return prev;

        // Y 좌표를 가격으로 변환 (허공에서도 측정 가능)
        const currentPrice = mainSeries?.coordinateToPrice(clickY);
        if (currentPrice === null || currentPrice === undefined) return prev;

        if (!prev.start) {
          // 첫 번째 클릭: 시작점 설정
          return {
            start: { time: currentTime as number, price: currentPrice, x: clickX, y: clickY },
            end: null,
          };
        } else if (!prev.end) {
          // 두 번째 클릭: 끝점 설정 (박스 완성)
          return {
            ...prev,
            end: { time: currentTime as number, price: currentPrice, x: clickX, y: clickY },
          };
        }

        return prev;
      });
    });

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 차트 스케일 변경 감지 (줌/스크롤 시 측정 박스 위치 업데이트 + visible range 저장)
    const handleScaleChange = (newRange: { from: number; to: number } | null) => {
      setScaleUpdateTrigger((prev) => prev + 1);
      if (newRange) {
        setVisibleRange({ from: Math.floor(newRange.from), to: Math.ceil(newRange.to) });
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleScaleChange);

    // 차트 렌더링 완료 후 마커 좌표 업데이트 트리거 + 초기 visible range 설정
    // requestAnimationFrame을 두 번 사용하여 차트가 완전히 렌더링된 후 실행
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setScaleUpdateTrigger((prev) => prev + 1);
        // 초기 visible range 설정
        const initialRange = chart.timeScale().getVisibleLogicalRange();
        if (initialRange) {
          setVisibleRange({ from: Math.floor(initialRange.from), to: Math.ceil(initialRange.to) });
        }
      });
    });

    // 클린업
    return () => {
      // dispose 플래그 설정 (먼저 설정하여 다른 콜백이 접근 못하게)
      isChartDisposedRef.current = true;

      // 뷰 상태 저장 (재생성 시 복원용)
      try {
        const currentRange = chart.timeScale().getVisibleLogicalRange();
        if (currentRange) {
          savedVisibleLogicalRangeRef.current = {
            from: currentRange.from,
            to: currentRange.to,
          };
        }
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleScaleChange);
      } catch {
        // disposed 상태에서 접근 시 무시
      }
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch {
        // 이미 제거된 경우 무시
      }
    };
  }, [
    data.length, // 캔들 개수만 체크 (데이터 내용 변경은 무시)
    // 지표 데이터는 존재 여부만 체크 (length 변경으로 인한 불필요한 재생성 방지)
    oiData != null && oiData.length > 0,
    emaData !== undefined,
    divergenceSignals != null && divergenceSignals.length > 0,
    trendAnalysis !== undefined,
    crossoverEvents != null && crossoverEvents.length > 0,
    marketSignals != null && marketSignals.length > 0,
    volumeProfile != null, // POC 값 변경은 무시, 존재 여부만 체크
    vwapAtrData != null, // VWAP/ATR 존재 여부만 체크
    orderBlockData != null && (orderBlockData.activeBlocks?.length ?? 0) > 0,
    marketStructureData != null && (marketStructureData.structureBreaks?.length ?? 0) > 0,
    timeframe, // 타임프레임 변경 시 재렌더링
    mini, // 미니 모드 변경 시 재렌더링
  ]);

  // Volume Profile 라인 - Y축 라벨 항상 숨김 (영역 라벨로 대체됨)
  useEffect(() => {
    if (isChartDisposedRef.current) return;
    try {
      volumeProfileLinesRef.current.forEach((line) => {
        line.applyOptions({
          lineVisible: false, // 전체 가로선은 항상 숨김 (DOM으로 렌더링)
          axisLabelVisible: false, // Y축 라벨 항상 숨김 (영역 라벨로 대체)
        });
      });
    } catch {
      // disposed 상태에서 접근 시 무시
    }
  }, [showVolumeProfile]);

  // 크로스오버 X 마커 좌표 상태
  const [crossoverMarkers, setCrossoverMarkers] = useState<CrossoverMarkerData[]>([]);

  // CVD+OI 신호 마커 좌표 상태
  const [signalMarkers, setSignalMarkers] = useState<SignalMarkerData[]>([]);

  // BOS/CHoCH 마커 좌표 상태
  const [structureMarkers, setStructureMarkers] = useState<Array<{
    x: number;
    y: number;
    type: 'BOS' | 'CHoCH';
    direction: 'bullish' | 'bearish';
    strength: 'strong' | 'medium' | 'weak';
    isOverheated?: boolean; // CHoCH 과열 여부
    rsiAtBreak?: number;
    breakIndex?: number; // 투명도 조절용 인덱스
  }>>([]);

  // 오더북 깊이 시각화를 위한 상태
  const [orderBookBars, setOrderBookBars] = useState<Array<{
    y: number;
    width: number; // 상대적 너비 (0-100%)
    price: number;
    size: number;
    type: 'bid' | 'ask';
  }>>([]);

  // 가로선 좌표 상태 (DOM 렌더링용)
  const [priceLines, setPriceLines] = useState<Array<{
    y: number;
    startX: number;
    label: string;
    color: string;
  }>>([]);

  // 마지막 점 좌표 및 색상 (미니 모드 글로우 점용)
  const [lastPointCoord, setLastPointCoord] = useState<{ x: number; y: number } | null>(null);
  const [chartColor, setChartColor] = useState<'green' | 'red' | 'gray'>('gray');

  // 측정 박스를 위한 상태 (화면 좌표)
  const [measureBox, setMeasureBox] = useState<MeasureBoxData | null>(null);

  // 측정 박스 업데이트 (확정된 박스)
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;
    if (!measurePoints.start || !measurePoints.end) {
      // 끝점이 없으면 박스 제거 (미리보기는 crosshairMove에서 처리)
      setMeasureBox(null);
      return;
    }

    // 두 점의 화면 좌표 계산
    const startX = chartRef.current.timeScale().timeToCoordinate(measurePoints.start.time as Time);
    const endX = chartRef.current.timeScale().timeToCoordinate(measurePoints.end.time as Time);
    const startY = candlestickSeriesRef.current.priceToCoordinate(measurePoints.start.price);
    const endY = candlestickSeriesRef.current.priceToCoordinate(measurePoints.end.price);

    if (startX === null || endX === null || startY === null || endY === null) {
      setMeasureBox(null);
      return;
    }

    // 박스 위치와 크기 계산
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    // 가격 차이 계산
    const priceDiff = measurePoints.end.price - measurePoints.start.price;
    const pricePercent = (priceDiff / measurePoints.start.price) * 100;

    // 캔들 개수 및 시간 계산
    const timeframeMinutes = timeframeToMinutes(timeframe);
    const timeDiffSeconds = Math.abs(measurePoints.end.time - measurePoints.start.time);
    const bars = Math.round(timeDiffSeconds / (timeframeMinutes * 60));
    const totalMinutes = bars * timeframeMinutes;
    const timeRange = formatTimeRange(totalMinutes);

    setMeasureBox({
      left,
      top,
      width,
      height,
      priceDiff,
      pricePercent,
      bars,
      timeRange,
      isPreview: false, // 확정된 박스
    });
  }, [measurePoints, scaleUpdateTrigger, timeframe]);

  // 데이터 변경 시 마커 숨기기 (로딩 중 이상한 위치 방지)
  useEffect(() => {
    setCrossoverMarkers([]);
  }, [crossoverEvents, data]);

  // 차트 준비 완료 후 마커 표시 (scaleUpdateTrigger로 감지)
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !crossoverEvents || crossoverEvents.length === 0) {
      return;
    }

    const updateCrossoverMarkers = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      const markers: Array<{ x: number; y: number; type: 'golden_cross' | 'dead_cross'; isFiltered?: boolean }> = [];

      crossoverEvents.forEach((event) => {
        if (event.type === 'none') return;

        const time = (event.timestamp / 1000) as Time;
        const x = chartRef.current!.timeScale().timeToCoordinate(time);

        if (x === null || x < 0 || x > 5000) return;

        const candleData = data.find((c) => c.time === time);
        if (!candleData) return;

        const price = event.type === 'golden_cross' ? candleData.low : candleData.high;
        const y = candlestickSeriesRef.current!.priceToCoordinate(price);

        if (y === null || y < 0 || y > 2000) return;

        markers.push({
          x,
          y: event.type === 'golden_cross' ? y + 15 : y - 15,
          type: event.type,
          isFiltered: event.isFiltered,
        });
      });

      setCrossoverMarkers(markers);
    };

    const rafId = requestAnimationFrame(updateCrossoverMarkers);
    return () => cancelAnimationFrame(rafId);
  }, [scaleUpdateTrigger]);

  // 데이터 변경 시 CVD+OI 마커 숨기기
  useEffect(() => {
    setSignalMarkers([]);
  }, [marketSignals, data]);

  // 차트 준비 완료 후 CVD+OI 마커 표시
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !marketSignals || marketSignals.length === 0) {
      return;
    }

    const signalConfig: Record<string, { label: string; color: string; position: 'above' | 'below' }> = {
      REAL_BULL: { label: '↑매수세', color: MARKER_COLORS.REAL_BULL, position: 'below' },
      SHORT_TRAP: { label: '⚠숏탈출', color: MARKER_COLORS.SHORT_TRAP, position: 'above' },
      PUMP_DUMP: { label: '⚠고점', color: MARKER_COLORS.PUMP_DUMP, position: 'above' },
      MORE_DROP: { label: '↓매도세', color: MARKER_COLORS.MORE_DROP, position: 'above' },
      LONG_ENTRY: { label: '★롱타점', color: MARKER_COLORS.LONG_ENTRY, position: 'below' },
    };

    const updateSignalMarkers = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      const markers: Array<{ x: number; y: number; type: string; label: string; color: string; position: 'above' | 'below' }> = [];

      marketSignals.forEach((signal) => {
        const config = signalConfig[signal.type];
        if (!config) return;

        const time = (signal.timestamp / 1000) as Time;
        const x = chartRef.current!.timeScale().timeToCoordinate(time);

        if (x === null || x < 0 || x > 5000) return;

        const candleData = data.find((c) => c.time === time);
        if (!candleData) return;

        const price = config.position === 'below' ? candleData.low : candleData.high;
        const y = candlestickSeriesRef.current!.priceToCoordinate(price);

        if (y === null || y < 0 || y > 2000) return;

        markers.push({
          x,
          y: config.position === 'below' ? y + 18 : y - 18,
          type: signal.type,
          label: config.label,
          color: config.color,
          position: config.position,
        });
      });

      setSignalMarkers(markers);
    };

    const rafId = requestAnimationFrame(updateSignalMarkers);
    return () => cancelAnimationFrame(rafId);
  }, [scaleUpdateTrigger]);

  // BOS/CHoCH 마커 좌표 계산
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !marketStructureData) {
      setStructureMarkers([]);
      return;
    }

    const updateStructureMarkers = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      const markers: Array<{
        x: number;
        y: number;
        type: 'BOS' | 'CHoCH';
        direction: 'bullish' | 'bearish';
        strength: 'strong' | 'medium' | 'weak';
        isOverheated?: boolean;
        rsiAtBreak?: number;
        breakIndex?: number;
      }> = [];

      // 최근 20개 구조 돌파 표시 (BOS + CHoCH)
      const recentBreaks = marketStructureData.structureBreaks.slice(-20);

      recentBreaks.forEach((breakEvent) => {
        const timeValue = breakEvent.breakTime / 1000;
        const x = chartRef.current!.timeScale().timeToCoordinate(timeValue as Time);
        let y = candlestickSeriesRef.current!.priceToCoordinate(breakEvent.breakPrice);

        if (x === null || y === null || x < 0 || x > 2000 || y < 0 || y > 1000) return;

        // 방향에 따라 Y 오프셋 적용 (bullish는 아래, bearish는 위)
        // CHoCH는 더 큰 오프셋으로 BOS와 겹침 방지
        const baseOffset = breakEvent.type === 'CHoCH' ? 25 : 12;
        const yOffset = breakEvent.direction === 'bullish' ? baseOffset : -baseOffset;
        const adjustedY = (y as number) + yOffset;

        markers.push({
          x,
          y: adjustedY,
          type: breakEvent.type,
          direction: breakEvent.direction,
          strength: breakEvent.strength,
          isOverheated: breakEvent.isOverheated,
          rsiAtBreak: breakEvent.rsiAtBreak,
          breakIndex: breakEvent.breakIndex,
        });
      });

      setStructureMarkers(markers);
    };

    const rafId = requestAnimationFrame(updateStructureMarkers);
    return () => cancelAnimationFrame(rafId);
  }, [scaleUpdateTrigger, marketStructureData]);

  // 오더북 깊이 바 계산 (scaleUpdateTrigger 변경 시)
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !orderBookData) {
      setOrderBookBars([]);
      return;
    }

    const updateOrderBookBars = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      const bars: Array<{
        y: number;
        width: number;
        price: number;
        size: number;
        type: 'bid' | 'ask';
      }> = [];

      // 최대 물량 찾기 (정규화용)
      const allSizes = [
        ...orderBookData.bids.slice(0, 15).map(b => b.size),
        ...orderBookData.asks.slice(0, 15).map(a => a.size),
      ];
      const maxSize = Math.max(...allSizes);

      // 매수 호가 (상위 15개)
      orderBookData.bids.slice(0, 15).forEach((level) => {
        const y = candlestickSeriesRef.current!.priceToCoordinate(level.price);
        if (y === null || y < 0 || y > 2000) return;

        bars.push({
          y,
          width: (level.size / maxSize) * 100,
          price: level.price,
          size: level.size,
          type: 'bid',
        });
      });

      // 매도 호가 (상위 15개)
      orderBookData.asks.slice(0, 15).forEach((level) => {
        const y = candlestickSeriesRef.current!.priceToCoordinate(level.price);
        if (y === null || y < 0 || y > 2000) return;

        bars.push({
          y,
          width: (level.size / maxSize) * 100,
          price: level.price,
          size: level.size,
          type: 'ask',
        });
      });

      setOrderBookBars(bars);
    };

    const rafId = requestAnimationFrame(updateOrderBookBars);
    return () => cancelAnimationFrame(rafId);
  }, [scaleUpdateTrigger, orderBookData]);

  // 가로선 좌표 계산 (scaleUpdateTrigger 변경 시 실시간 업데이트)
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || data.length === 0) {
      setPriceLines([]);
      return;
    }

    const updatePriceLines = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      const lines: Array<{ y: number; startX: number; label: string; color: string }> = [];

      // 마지막 캔들의 X 좌표 (가로선 시작점)
      const lastCandle = data[data.length - 1];
      const lastX = chartRef.current!.timeScale().timeToCoordinate(lastCandle.time);
      if (lastX === null) return;

      const startX = lastX + 15; // 마지막 캔들 오른쪽

      // POC 라인
      if (volumeProfile && showVolumeProfile) {
        const pocY = candlestickSeriesRef.current!.priceToCoordinate(volumeProfile.poc);
        if (pocY !== null) {
          lines.push({ y: pocY, startX, label: 'POC', color: INDICATOR_COLORS.POC });
        }

        // VAH 라인
        const vahY = candlestickSeriesRef.current!.priceToCoordinate(volumeProfile.vah);
        if (vahY !== null) {
          lines.push({ y: vahY, startX, label: 'VAH', color: INDICATOR_COLORS.VAH });
        }

        // VAL 라인
        const valY = candlestickSeriesRef.current!.priceToCoordinate(volumeProfile.val);
        if (valY !== null) {
          lines.push({ y: valY, startX, label: 'VAL', color: INDICATOR_COLORS.VAL });
        }
      }

      // VWAP 라인
      if (vwapAtrData && vwapAtrData.currentVwap > 0) {
        const vwapY = candlestickSeriesRef.current!.priceToCoordinate(vwapAtrData.currentVwap);
        if (vwapY !== null) {
          lines.push({ y: vwapY, startX, label: 'VWAP', color: INDICATOR_COLORS.VWAP });
        }
      }

      // ATR 라인
      if (vwapAtrData?.suggestedStopLoss) {
        const atrLongY = candlestickSeriesRef.current!.priceToCoordinate(vwapAtrData.suggestedStopLoss.long);
        if (atrLongY !== null) {
          lines.push({ y: atrLongY, startX, label: '롱ATR', color: INDICATOR_COLORS.ATR_LONG });
        }

        const atrShortY = candlestickSeriesRef.current!.priceToCoordinate(vwapAtrData.suggestedStopLoss.short);
        if (atrShortY !== null) {
          lines.push({ y: atrShortY, startX, label: '숏ATR', color: INDICATOR_COLORS.ATR_SHORT });
        }
      }

      // 오더블록 라인
      if (orderBlockData?.activeBlocks && orderBlockData.activeBlocks.length > 0) {
        const currentPrice = data[data.length - 1]?.close || 0;
        orderBlockData.activeBlocks.forEach((block) => {
          const midPrice = (block.high + block.low) / 2;
          const isSupport = midPrice < currentPrice;
          const color = isSupport ? INDICATOR_COLORS.SUPPORT : INDICATOR_COLORS.RESISTANCE;
          const y = candlestickSeriesRef.current!.priceToCoordinate(midPrice);
          if (y !== null) {
            lines.push({ y, startX, label: isSupport ? 'OB지지' : 'OB저항', color });
          }
        });
      }

      setPriceLines(lines);
    };

    const rafId = requestAnimationFrame(updatePriceLines);
    return () => cancelAnimationFrame(rafId);
  }, [scaleUpdateTrigger, volumeProfile, vwapAtrData, showVolumeProfile, data, orderBlockData]);

  // 마지막 점 좌표 계산 (미니 모드 글로우 점용)
  useEffect(() => {
    if (!mini || !chartRef.current || !candlestickSeriesRef.current || data.length === 0) {
      setLastPointCoord(null);
      return;
    }

    const updateLastPoint = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      // 실시간 캔들이 있으면 실시간 가격 사용, 없으면 마지막 히스토리 캔들 사용
      const useRealtime = realtimeCandle && !realtimeCandle.isFinal;
      const price = useRealtime ? realtimeCandle.close : data[data.length - 1].close;
      const time = useRealtime
        ? (realtimeCandle.timestamp / 1000) as typeof data[0]['time']
        : data[data.length - 1].time;

      const x = chartRef.current!.timeScale().timeToCoordinate(time);
      const y = candlestickSeriesRef.current!.priceToCoordinate(price);

      if (x !== null && y !== null) {
        setLastPointCoord({ x, y });
      }
    };

    const rafId = requestAnimationFrame(updateLastPoint);
    return () => cancelAnimationFrame(rafId);
  }, [mini, scaleUpdateTrigger, data, realtimeCandle]);

  // 지지/저항 영역 계산 (useMemo)
  // 원본 영역 (개별 렌더링용 - 투명도 겹침 효과)
  const rawZones = useMemo(() => {
    if (!volumeProfile && !orderBlockData) return [];
    const currentPrice = data[data.length - 1]?.close || 0;
    return createZonesFromData(volumeProfile, orderBlockData, currentPrice);
  }, [volumeProfile, orderBlockData, data]);

  // 병합된 영역 (라벨 표시용)
  const blendedZones = useMemo(() => {
    return mergeOverlappingZones(rawZones);
  }, [rawZones]);

  // 지지/저항 영역 렌더 데이터 계산
  const [rawZoneRenderData, setRawZoneRenderData] = useState<Array<{
    zone: SupportResistanceZone;
    topY: number;
    bottomY: number;
    startX: number;
  }>>([]);
  const [blendedZoneRenderData, setBlendedZoneRenderData] = useState<Array<{
    zone: BlendedZone;
    topY: number;
    bottomY: number;
    startX: number;
  }>>([]);

  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || data.length === 0) {
      setRawZoneRenderData([]);
      setBlendedZoneRenderData([]);
      return;
    }

    const updateZoneCoords = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      // 마지막 캔들의 X 좌표 (영역 시작점)
      const lastCandle = data[data.length - 1];
      const lastX = chartRef.current!.timeScale().timeToCoordinate(lastCandle.time);
      if (lastX === null) return;

      const startX = lastX + 15; // 마지막 캔들 오른쪽

      // 개별 영역 좌표 계산 (박스 렌더링용) - POC 포함
      const rawRenderData = rawZones.map((zone) => {
        const topY = candlestickSeriesRef.current!.priceToCoordinate(zone.priceTop);
        const bottomY = candlestickSeriesRef.current!.priceToCoordinate(zone.priceBottom);
        return {
          zone,
          topY: topY ?? 0,
          bottomY: bottomY ?? 0,
          startX,
        };
      }).filter((item) => item.topY !== null && item.bottomY !== null);
      setRawZoneRenderData(rawRenderData);

      // 병합된 영역 좌표 계산 (라벨 표시용)
      const blendedRenderData = blendedZones.map((zone) => {
        const topY = candlestickSeriesRef.current!.priceToCoordinate(zone.priceTop);
        const bottomY = candlestickSeriesRef.current!.priceToCoordinate(zone.priceBottom);
        return {
          zone,
          topY: topY ?? 0,
          bottomY: bottomY ?? 0,
          startX,
        };
      }).filter((item) => item.topY !== null && item.bottomY !== null);
      setBlendedZoneRenderData(blendedRenderData);
    };

    const rafId = requestAnimationFrame(updateZoneCoords);
    return () => cancelAnimationFrame(rafId);
  }, [scaleUpdateTrigger, rawZones, blendedZones, volumeProfile, data]);

  // 다이버전스 라벨 렌더 데이터
  const [divergenceLabelData, setDivergenceLabelData] = useState<Array<{
    x: number;
    y: number;
    text: string;
    color: string;
    bgColor: string;
    direction: 'bullish' | 'bearish';
  }>>([]);

  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !divergenceSignals || divergenceSignals.length === 0) {
      setDivergenceLabelData([]);
      return;
    }

    const updateDivergenceLabels = () => {
      if (!chartRef.current || !candlestickSeriesRef.current || isChartDisposedRef.current) return;

      const typeLabels: Record<string, string> = {
        rsi: 'RSI',
        obv: 'OBV',
        cvd: 'CVD',
        oi: 'OI',
      };

      // 임시 라벨 데이터 (병합 전)
      const tempLabels: Array<{
        x: number;
        y: number;
        type: string;
        direction: 'bullish' | 'bearish';
        freshness: number;
        color: string;
        isFiltered: boolean;
      }> = [];

      // 화면 범위 체크용
      const chartWidth = chartContainerRef.current?.clientWidth || 800;

      // start-end 쌍 찾기
      for (let i = 0; i < divergenceSignals.length; i++) {
        const signal = divergenceSignals[i];
        if (signal.phase !== 'start') continue;

        const endSignal = divergenceSignals.find(
          (s, idx) =>
            idx > i &&
            s.phase === 'end' &&
            s.type === signal.type &&
            s.direction === signal.direction,
        );

        if (!endSignal) continue;

        // start와 end 모두 좌표 계산
        const startTimeSec = signal.timestamp / 1000;
        const endTimeSec = endSignal.timestamp / 1000;
        const startTime = startTimeSec as Time;
        const endTime = endTimeSec as Time;

        // 캔들 데이터 존재 여부 확인 (선분이 실제로 그려지는지 검증)
        // 타임프레임 기반 허용 범위 (캔들 1개 시간)
        const tfSeconds = timeframeToMs(timeframe || '5m') / 1000;
        const findCandle = (targetTime: number) => {
          return data.find(c => Math.abs((c.time as number) - targetTime) <= tfSeconds);
        };
        const startCandle = findCandle(startTimeSec);
        const endCandle = findCandle(endTimeSec);

        // 끝 캔들은 필수, 시작 캔들은 없어도 OK (선분이 잘려도 표시)
        if (!endCandle) continue;

        const startX = chartRef.current!.timeScale().timeToCoordinate(startTime);
        const endX = chartRef.current!.timeScale().timeToCoordinate(endTime);
        const y = endSignal.priceValue ? candlestickSeriesRef.current!.priceToCoordinate(endSignal.priceValue) : null;

        // endX와 y 필수
        if (endX === null || y === null) continue;

        // end가 화면에 보이는 경우 라벨 표시 (라벨은 end 위치에 표시됨)
        const isEndVisible = endX >= 0 && endX <= chartWidth - 80;
        if (!isEndVisible) continue; // end가 안 보이면 스킵

        // 신선도 계산 (timeframe 기반 만료 시간)
        const tf = timeframe || '15m';
        const expiryCandles = DIVERGENCE_EXPIRY_CANDLES[tf] || 20;
        const expiryMs = expiryCandles * timeframeToMs(tf);
        const freshness = calculateDivergenceFreshness(endSignal.timestamp, expiryMs);

        // 지표별 색상 가져오기
        const freshnessColors = getDivergenceFreshnessColors(
          signal.direction,
          freshness,
          signal.type as 'rsi' | 'obv' | 'cvd' | 'oi'
        );

        // 중복 라벨 방지: 이 끝점이 다른 다이버전스의 시작점인지 확인
        // 같은 지표, 같은 방향의 다른 다이버전스가 이 끝점을 시작점으로 사용하면 스킵
        const isIntermediatePivot = divergenceSignals.some(
          (s) =>
            s.phase === 'start' &&
            s.type === signal.type &&
            s.direction === signal.direction &&
            Math.abs(s.timestamp - endSignal.timestamp) < tfSeconds * 1000 // 같은 캔들 허용
        );

        if (isIntermediatePivot) continue; // 중간 피봇이면 라벨 스킵

        tempLabels.push({
          x: endX,
          y: y + (signal.direction === 'bullish' ? 15 : -15),
          type: signal.type,
          direction: signal.direction,
          freshness,
          color: freshnessColors.lineColor,
          isFiltered: signal.isFiltered || endSignal.isFiltered || false,
        });
      }

      // 위치가 가까운 라벨들 병합 (50px 이내)
      const mergedLabels: Array<{
        x: number;
        y: number;
        text: string;
        color: string;
        bgColor: string;
        direction: 'bullish' | 'bearish';
      }> = [];

      const processed = new Set<number>();
      const MERGE_THRESHOLD = 50; // px - 병합 범위 확대

      for (let i = 0; i < tempLabels.length; i++) {
        if (processed.has(i)) continue;

        const current = tempLabels[i];
        const group = [current];
        processed.add(i);

        // 같은 위치의 라벨 찾기
        for (let j = i + 1; j < tempLabels.length; j++) {
          if (processed.has(j)) continue;
          const other = tempLabels[j];

          // 같은 방향이고 위치가 가까우면 병합
          // 단, 필터링 상태가 같아야 함 (필터링된 것끼리, 안된 것끼리만 병합)
          if (
            current.direction === other.direction &&
            current.isFiltered === other.isFiltered &&
            Math.abs(current.x - other.x) < MERGE_THRESHOLD &&
            Math.abs(current.y - other.y) < MERGE_THRESHOLD
          ) {
            group.push(other);
            processed.add(j);
          }
        }

        // 그룹 라벨 생성
        const types = [...new Set(group.map(g => g.type))].sort();
        const arrow = current.direction === 'bullish' ? '↑' : '↓';
        const text = types.map(t => typeLabels[t] || t.toUpperCase()).join('+') + arrow;

        // 각 지표별 색상 수집 (중복 제거)
        const uniqueColors = [...new Set(group.map(g => g.color))];
        const avgX = group.reduce((sum, g) => sum + g.x, 0) / group.length;
        const avgY = group.reduce((sum, g) => sum + g.y, 0) / group.length;

        // 모든 항목이 필터링되었는지 확인
        const allFiltered = group.every(g => g.isFiltered);

        // 색상에서 투명도 적용 (hex to rgba)
        const hexToRgba = (hex: string, alpha: number) => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        // 가장 신선한 항목의 신선도 사용
        const freshestItem = group.reduce((a, b) => a.freshness > b.freshness ? a : b);
        const opacity = allFiltered ? 0.6 : (0.5 + freshestItem.freshness * 0.5);

        // 병합된 경우 그라데이션, 단일이면 단색
        let bgColor: string;
        if (allFiltered) {
          bgColor = hexToRgba('#6b7280', opacity); // 필터링된 경우 회색
        } else if (uniqueColors.length === 1) {
          bgColor = hexToRgba(uniqueColors[0], opacity); // 단일 색상
        } else {
          // 여러 색상 그라데이션 (왼쪽에서 오른쪽으로)
          const colorStops = uniqueColors.map((c, i) => {
            const percent = (i / (uniqueColors.length - 1)) * 100;
            return `${hexToRgba(c, opacity)} ${percent}%`;
          }).join(', ');
          bgColor = `linear-gradient(to right, ${colorStops})`;
        }

        mergedLabels.push({
          x: avgX,
          y: avgY,
          text,
          color: allFiltered ? '#9ca3af' : '#fff', // 필터링된 경우 회색 텍스트
          bgColor,
          direction: current.direction,
        });
      }

      // 겹치는 라벨들을 세로로 스택 (방향 무관하게 모든 겹침 해소)
      const LABEL_HEIGHT = 16; // 라벨 높이 + 간격
      const X_THRESHOLD = 80; // x 좌표가 이 범위 내면 겹침으로 판단 (넓게)
      const Y_THRESHOLD = 14; // y 좌표가 이 범위 내면 겹침으로 판단

      // x 좌표로 먼저 정렬, 같으면 y 좌표로 정렬
      mergedLabels.sort((a, b) => {
        if (Math.abs(a.x - b.x) < X_THRESHOLD) {
          return a.y - b.y; // 같은 x 그룹이면 y로 정렬
        }
        return a.x - b.x;
      });

      // 여러 번 반복해서 겹침 해소
      for (let iter = 0; iter < 20; iter++) {
        let hasOverlap = false;

        for (let i = 0; i < mergedLabels.length; i++) {
          for (let j = i + 1; j < mergedLabels.length; j++) {
            const a = mergedLabels[i];
            const b = mergedLabels[j];

            // x, y 모두 가까우면 겹침 (방향 무관)
            if (Math.abs(a.x - b.x) < X_THRESHOLD && Math.abs(a.y - b.y) < Y_THRESHOLD) {
              hasOverlap = true;
              // b를 아래로 밀어냄 (a 바로 아래에 배치)
              b.y = a.y + LABEL_HEIGHT;
            }
          }
        }

        if (!hasOverlap) break;
      }

      setDivergenceLabelData(mergedLabels);
    };

    const rafId = requestAnimationFrame(updateDivergenceLabels);
    return () => cancelAnimationFrame(rafId);
  }, [scaleUpdateTrigger, divergenceSignals, data, timeframe]);

  return (
    <div className='w-full' style={mini ? { height: '100%' } : undefined}>


      {/* 추세/역추세 지표 Rows (미니 모드에서 숨김) */}
      {!mini && (
        <TrendIndicatorsBar
          trendAnalysis={trendAnalysis}
          longShortRatio={longShortRatio}
          showVolumeProfile={showVolumeProfile}
          volumeProfile={volumeProfile}
          realtimeCandle={realtimeCandle}
          currentPrice={data[data.length - 1]?.close || 0}
          adxData={adxData}
          consolidationData={consolidationData}
          timeframe={timeframe}
          divergenceSignals={divergenceSignals}
          vwapAtrData={vwapAtrData}
          whaleData={whaleData}
          liquidationData={liquidationData}
        />
      )}

      {/* 차트 컨테이너 */}
      <div className='relative' style={mini ? { height: '100%' } : undefined}>
      <div
        ref={chartContainerRef}
        className='rounded-xl overflow-hidden shadow-inner'
        style={mini ? { position: 'relative', height: '100%' } : { position: 'relative' }}
      >
        {/* 차트 정보 오버레이 (왼쪽 상단) - 시간 범위, 가격, 변화율 (미니 모드에서 숨김) */}
        {!mini && (
        <div className='absolute top-2 left-2 z-10 backdrop-blur-md bg-black/40 px-2 py-1 rounded-lg text-xs font-mono border border-white/10 flex items-center gap-3'>
          {/* 시간 범위 (visible range 기반) */}
          <span className='text-gray-300'>
            {visibleRange ? calculateTimeRange(visibleRange.to - visibleRange.from, timeframe) : '-'}
          </span>
          {/* 현재가 및 변화율 */}
          {currentPriceInfo && (
            <>
              <span className='text-gray-500'>|</span>
              <span style={{ color: currentPriceInfo.changePercent >= 0 ? COLORS.BULLISH : COLORS.BEARISH }}>
                ${currentPriceInfo.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ color: currentPriceInfo.changePercent >= 0 ? COLORS.BULLISH : COLORS.BEARISH }}>
                {currentPriceInfo.changePercent >= 0 ? '▲' : '▼'} {Math.abs(currentPriceInfo.changePercent).toFixed(2)}%
              </span>
            </>
          )}
        </div>
        )}

        {/* 지지/저항 영역 범례 (미니 모드에서 숨김) */}
        {!mini && rawZoneRenderData.length > 0 && (
          <ZoneLegend
            showLabels={showZoneLabels}
            onToggleLabels={() => setShowZoneLabels((prev) => !prev)}
          />
        )}

        {/* 측정 박스 오버레이 (트레이딩뷰 스타일) */}
        <MeasurementBox measureBox={measureBox} containerRef={chartContainerRef} />

        {/* 측정 시작점 마커 */}
        {measurePoints.start && chartRef.current && candlestickSeriesRef.current && (() => {
          const startX = chartRef.current!.timeScale().timeToCoordinate(measurePoints.start.time as Time);
          const startY = candlestickSeriesRef.current!.priceToCoordinate(measurePoints.start.price);
          if (startX !== null && startY !== null) {
            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${startX}px`,
                  top: `${startY}px`,
                  width: '8px',
                  height: '8px',
                  backgroundColor: MEASURE_COLORS.BG,
                  border: '2px solid white',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 11,
                  boxShadow: MEASURE_COLORS.GLOW,
                }}
              />
            );
          }
          return null;
        })()}

        {/* 측정 끝점 마커 */}
        {measurePoints.end && chartRef.current && candlestickSeriesRef.current && (() => {
          const endX = chartRef.current!.timeScale().timeToCoordinate(measurePoints.end.time as Time);
          const endY = candlestickSeriesRef.current!.priceToCoordinate(measurePoints.end.price);
          if (endX !== null && endY !== null) {
            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${endX}px`,
                  top: `${endY}px`,
                  width: '8px',
                  height: '8px',
                  backgroundColor: MEASURE_COLORS.BG,
                  border: '2px solid white',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 11,
                  boxShadow: MEASURE_COLORS.GLOW,
                }}
              />
            );
          }
          return null;
        })()}

        {/* 크로스오버 X 마커 (커스텀 오버레이) */}
        <CrossoverMarkers markers={crossoverMarkers} />

        {/* CVD+OI 신호 마커 - 숨김 (매매에 큰 도움 안됨) */}
        {/* signalMarkers (매수세/매도세) 숨김 */}

        {/* CHoCH 마커만 쉐브론으로 표시 (BOS 숨김) */}
        {structureMarkers
          .filter(marker => marker.type === 'CHoCH')
          .map((marker, index) => {
            const isOverheated = marker.isOverheated;
            // 강도에 따라 쉐브론 개수 결정 (1-3개)
            const chevronCount = marker.strength === 'strong' ? 3 : marker.strength === 'medium' ? 2 : 1;
            const color = marker.direction === 'bullish' ? COLORS.LONG : COLORS.SHORT;

            return (
              <div
                key={`choch-${index}`}
                style={{
                  position: 'absolute',
                  left: `${marker.x}px`,
                  top: `${marker.y}px`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '-4px',
                }}
              >
                {Array.from({ length: chevronCount }).map((_, i) => (
                  <ChevronUp
                    key={i}
                    style={{
                      width: '16px',
                      height: '16px',
                      marginTop: i > 0 ? '-10px' : '0',
                      color: color,
                      opacity: isOverheated ? 1 : 0.5,
                      filter: isOverheated ? `drop-shadow(0 0 4px ${color})` : 'none',
                      transform: marker.direction === 'bearish' ? 'rotate(180deg)' : 'none',
                    }}
                  />
                ))}
              </div>
            );
          })}

{/* 다이버전스 라벨 (선 끝점에 배경 박스) */}
        {divergenceLabelData.map((label, index) => (
          <span
            key={`div-label-${index}`}
            style={{
              position: 'absolute',
              left: `${label.x}px`,
              top: `${label.y}px`,
              transform: 'translate(-50%, -50%)',
              fontSize: '9px',
              fontWeight: 700,
              color: label.color,
              background: label.bgColor,
              padding: '2px 5px',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 15,
              boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            {label.text}
          </span>
        ))}

{/* 가로선은 overflow-hidden 밖에서 렌더링 (아래에서 처리) */}

        {/* 오더북 DOM 스타일 (최신 캔들 우측, 세로 스택) - 임시 비활성화 */}
        {false && orderBookData && chartRef.current && candlestickSeriesRef.current && data.length > 0 && (() => {
          // 최신 캔들의 X 좌표 구하기
          const latestCandle = data[data.length - 1];
          const latestX = chartRef.current!.timeScale().timeToCoordinate(latestCandle.time) as number | null;
          if (latestX === null) return null;

          // 현재가 Y 좌표 (기준점)
          const currentPrice = latestCandle.close;
          const midY = candlestickSeriesRef.current!.priceToCoordinate(currentPrice) as number | null;
          if (midY === null) return null;

          const barStartX = (latestX as number) + 12;
          const maxBarWidth = 70;
          const barHeight = 10; // 각 바 높이
          const barGap = 1; // 바 간격

          const asks = orderBookData!.asks.slice(0, 8);
          const bids = orderBookData!.bids.slice(0, 8);

          const allSizes = [...asks.map(a => a.size), ...bids.map(b => b.size)];
          const maxSize = Math.max(...allSizes);
          const avgSize = allSizes.reduce((a, b) => a + b, 0) / allSizes.length;

          return (
            <div
              style={{
                position: 'absolute',
                left: `${barStartX}px`,
                top: `${(midY as number) - (asks.length * (barHeight + barGap))}px`,
                pointerEvents: 'none',
                zIndex: 25,
              }}
            >
              {/* 매도 호가 (위에서 아래로) */}
              {asks.slice().reverse().map((level, index) => {
                const isLargeWall = level.size >= avgSize * 2;
                const widthRatio = level.size / maxSize;
                const barWidth = Math.max(widthRatio * maxBarWidth, 8);

                return (
                  <div
                    key={`ask-${index}`}
                    style={{
                      width: `${barWidth}px`,
                      height: `${barHeight}px`,
                      marginBottom: `${barGap}px`,
                      backgroundColor: isLargeWall ? WALL_COLORS.ASK_LARGE : WALL_COLORS.ASK_NORMAL,
                      borderRadius: '2px',
                      borderLeft: isLargeWall ? `2px solid ${WALL_COLORS.ASK_BORDER}` : 'none',
                    }}
                  />
                );
              })}

              {/* 스프레드 구분선 */}
              <div
                style={{
                  width: `${maxBarWidth}px`,
                  height: '2px',
                  backgroundColor: WALL_COLORS.SPREAD,
                  margin: '2px 0',
                }}
              />

              {/* 매수 호가 (위에서 아래로) */}
              {bids.map((level, index) => {
                const isLargeWall = level.size >= avgSize * 2;
                const widthRatio = level.size / maxSize;
                const barWidth = Math.max(widthRatio * maxBarWidth, 8);

                return (
                  <div
                    key={`bid-${index}`}
                    style={{
                      width: `${barWidth}px`,
                      height: `${barHeight}px`,
                      marginBottom: `${barGap}px`,
                      backgroundColor: isLargeWall ? WALL_COLORS.BID_LARGE : WALL_COLORS.BID_NORMAL,
                      borderRadius: '2px',
                      borderLeft: isLargeWall ? `2px solid ${WALL_COLORS.BID_BORDER}` : 'none',
                    }}
                  />
                );
              })}
            </div>
          );
        })()}

      </div>

      {/* 지지/저항 영역 시각화 (색상 기반) - POC 포함 */}
      <SupportResistanceZones
        rawZones={rawZoneRenderData}
        blendedZones={blendedZoneRenderData}
        mini={mini}
        showLabels={showZoneLabels}
      />

      {/* 가로선 DOM (overflow-hidden 밖에서 렌더링) - VWAP, ATR 등 */}
      {priceLines.filter((line) => !['POC', 'VAH', 'VAL', 'OB지지', 'OB저항', '매수세', '매도세'].includes(line.label)).map((line, index) => (
        <div
          key={`price-line-${index}`}
          style={{
            position: 'absolute',
            left: `${line.startX}px`,
            right: mini ? '55px' : '80px', // 가격 레이블 공간 확보
            top: `${line.y}px`,
            height: '1px',
            background: `linear-gradient(to right, ${line.color}, ${line.color.replace(')', ', 0.3)')})`,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      ))}

      {/* 미니 모드 글로우 점 (마지막 가격 위치) */}
      {mini && lastPointCoord && (() => {
        const dotColor = GLOW_DOT_COLORS[chartColor];
        return (
          <div
            style={{
              position: 'absolute',
              left: `${lastPointCoord.x}px`,
              top: `${lastPointCoord.y}px`,
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: dotColor.bg,
              boxShadow: `0 0 8px ${dotColor.shadow}`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 10,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        );
      })()}

      {/* 통합 툴팁 (RSI + 필터링 정보 + 크로스오버 + 다이버전스 + CVD+OI + CHoCH) */}
      {tooltip && (
        <ChartTooltip
          x={tooltip.x}
          y={tooltip.y}
          rsi={tooltip.rsi}
          filterReason={tooltip.filterReason}
          crossover={tooltip.crossover}
          divergences={tooltip.divergences}
          marketSignal={tooltip.marketSignal}
          choch={tooltip.choch}
        />
      )}
      </div>
    </div>
  );
}
