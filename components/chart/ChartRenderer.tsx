'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  CandlestickData,
  LineData,
  LineSeries,
  IChartApi,
  ISeriesApi,
  IPriceLine,
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
} from '@/lib/types/index';
import ChartTooltip from './ChartTooltip';
import { LongShortRatio } from '@/hooks/useLongShortRatio';

// 타임프레임을 분 단위로 변환
function timeframeToMinutes(timeframe: string): number {
  const value = parseInt(timeframe.slice(0, -1));
  const unit = timeframe.slice(-1);
  switch (unit) {
    case 'm': return value;
    case 'h': return value * 60;
    case 'd': return value * 24 * 60;
    case 'w': return value * 7 * 24 * 60;
    default: return value;
  }
}

// 분을 "X일 X시간 X분" 형식으로 변환
function formatTimeRange(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}일`);
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);

  return parts.length > 0 ? parts.join(' ') : '0분';
}

// 캔들 개수와 타임프레임으로 시간 범위 계산
function calculateTimeRange(candleCount: number, timeframe: string): string {
  const totalMinutes = candleCount * timeframeToMinutes(timeframe);
  if (totalMinutes < 60) return `${totalMinutes}분`;
  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
}

// Volume Profile 타입
export interface VolumeProfileData {
  buckets: Array<{ price: number; volume: number; buyVolume: number; sellVolume: number }>;
  maxVolume: number;
  poc: number; // Point of Control (최대 거래량 가격)
  vah: number; // Value Area High
  val: number; // Value Area Low
  minPrice: number;
  maxPrice: number;
}

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
  realtimeCandle?: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isFinal: boolean;
  } | null;
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
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const isFirstRenderRef = useRef(true); // 첫 렌더링인지 추적
  const savedVisibleLogicalRangeRef = useRef<{
    from: number;
    to: number;
  } | null>(null); // 논리적 스크롤 범위 저장 (바 인덱스 기반)
  const chartRef = useRef<IChartApi | null>(null);
  const measureLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeProfileLinesRef = useRef<IPriceLine[]>([]); // Volume Profile 라인 ref (Y축 라벨용)
  const limitedLinesRef = useRef<ISeriesApi<'Line'>[]>([]); // 제한된 가로선 시리즈 ref

  // Volume Profile 표시 토글 (useEffect보다 먼저 선언해야 함)
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);

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
    if (!realtimeCandle || !candlestickSeriesRef.current || realtimeCandle.isFinal || !chartRef.current) {
      return;
    }

    const isUp = realtimeCandle.close >= realtimeCandle.open;
    const candleColor = isUp ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)'; // 최신 캔들은 투명도 100%

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

    try {
      // 차트가 dispose되지 않았는지 확인
      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.update(candleUpdate);

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
        console.warn('⚠️ 차트가 재생성 중입니다.');
      } else {
        console.error('❌ 캔들 업데이트 에러:', err);
      }
    }
  }, [realtimeCandle]);

  // 차트 스케일 변경 감지를 위한 state (줌/스크롤 시 박스 위치 업데이트용)
  const [scaleUpdateTrigger, setScaleUpdateTrigger] = useState(0);

  // 캔들 투명도 설정
  const CANDLE_OPACITY = 0.3;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 차트 생성 (패널 개수에 따라 높이 조정)
    const hasOi = oiData && oiData.length > 0;
    const hasAtr = vwapAtrData?.atr && vwapAtrData.atr.length > 0;
    const panelCount = 1 + (hasOi ? 1 : 0) + (hasAtr ? 1 : 0); // 메인 + OI + ATR
    const panelHeight = 320; // 각 패널당 높이 (더 큰 차트)
    const chartHeight = panelCount * panelHeight;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#0c0908' }, // 따뜻한 블랙
        textColor: '#d1d5db',
        panes: {
          separatorColor: 'rgba(255, 255, 255, 0.3)', // 연한 회색 구분선
          separatorHoverColor: 'rgba(255, 255, 255, 0.5)', // 호버 시 더 밝게
          enableResize: false, // 패널 크기 조절 비활성화
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
        vertLines: { color: 'rgba(45, 38, 32, 0.25)' }, // 어두운 배경에 맞춘 미세한 그리드
        horzLines: { color: 'rgba(45, 38, 32, 0.25)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 20, // 우측 여백
        lockVisibleTimeRangeOnResize: true, // 리사이즈 시 시간 범위 유지
      },
      kineticScroll: {
        touch: false, // 터치 스크롤 비활성화 (들썩임 방지)
        mouse: false, // 마우스 스크롤 비활성화 (들썩임 방지)
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        autoScale: true, // 자동 스케일 활성화
        mode: 0, // Normal price scale mode
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

    // 캔들스틱 시리즈 추가 (메인 패널 - paneIndex: 0)
    const candlestickSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: `rgba(34, 197, 94, ${CANDLE_OPACITY})`, // 초록색 캔들 (green-500)
        downColor: `rgba(239, 68, 68, ${CANDLE_OPACITY})`, // 빨간색 캔들 (red-500)
        borderUpColor: `rgba(34, 197, 94, ${CANDLE_OPACITY})`, // 초록색 테두리
        borderDownColor: `rgba(239, 68, 68, ${CANDLE_OPACITY})`, // 빨간색 테두리
        wickUpColor: `rgba(34, 197, 94, ${CANDLE_OPACITY})`, // 초록색 꼬리
        wickDownColor: `rgba(239, 68, 68, ${CANDLE_OPACITY})`, // 빨간색 꼬리
      },
      0,
    );

    // 최근 60개 캔들은 투명도 없이, 나머지는 CANDLE_OPACITY로 표시
    const recentThreshold = data.length - 60;
    const RECENT_OPACITY = 1.0; // 최근 캔들 투명도 (완전 불투명)
    const candleDataWithColors = data.map((candle, index) => {
      const isRecent = index >= recentThreshold;
      const opacity = isRecent ? RECENT_OPACITY : CANDLE_OPACITY;
      const isUp = candle.close >= candle.open;

      return {
        ...candle,
        color: isUp
          ? `rgba(34, 197, 94, ${opacity})` // 초록색
          : `rgba(239, 68, 68, ${opacity})`, // 빨간색
        borderColor: isUp
          ? `rgba(34, 197, 94, ${opacity})`
          : `rgba(239, 68, 68, ${opacity})`,
        wickColor: isUp
          ? `rgba(34, 197, 94, ${opacity})`
          : `rgba(239, 68, 68, ${opacity})`,
      };
    });

    candlestickSeries.setData(candleDataWithColors);
    candlestickSeriesRef.current = candlestickSeries;

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

    // RSI, OBV, CVD 지표 숨김 (패널 비활성화)
    const rsiSeries = null;
    const rsiPaneIndex = 0;
    const obvSeries = null;
    const obvPaneIndex = 0;
    const cvdSeries = null;
    const cvdPaneIndex = 0;

    // OI 지표 추가
    let oiSeries = null;
    let oiPaneIndex = 0;
    if (oiData && oiData.length > 0) {
      oiPaneIndex = currentPaneIndex++;
      oiSeries = addOiIndicator(chart, oiData, oiPaneIndex);
    }

    // ATR 지표 추가
    let atrSeries = null;
    let atrPaneIndex = 0;
    console.log('🔍 ATR 데이터 확인:', {
      hasVwapAtrData: !!vwapAtrData,
      atrLength: vwapAtrData?.atr?.length,
      atrSample: vwapAtrData?.atr?.slice(-5),
    });
    if (vwapAtrData?.atr && vwapAtrData.atr.length > 0) {
      atrPaneIndex = currentPaneIndex++;
      // ATR 데이터를 LineData 형식으로 변환
      const atrLineData: LineData[] = [];
      vwapAtrData.atr.forEach((atrValue, index) => {
        if (atrValue !== null && data[index]) {
          atrLineData.push({
            time: data[index].time,
            value: atrValue,
          });
        }
      });
      console.log('✅ ATR 패널 추가:', { paneIndex: atrPaneIndex, dataCount: atrLineData.length });
      atrSeries = addAtrIndicator(chart, atrLineData, atrPaneIndex);
    }

    // 다이버전스 선 추가
    if (divergenceSignals && divergenceSignals.length > 0) {
      // 캔들 데이터에서 시간, 고가, 저가 추출
      const candleData = data.map((candle) => ({
        time: candle.time as number,
        high: candle.high,
        low: candle.low,
      }));

      addDivergenceLines(
        chart,
        candlestickSeries,
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
      );
    }

    // 크로스오버 마커 추가
    if (crossoverEvents && crossoverEvents.length > 0) {
      addCrossoverMarkers(candlestickSeries, crossoverEvents);
    }

    // CVD + OI 신호 마커 - 커스텀 오버레이 방식으로 변경 (아래 JSX에서 처리)
    // if (marketSignals && marketSignals.length > 0) {
    //   addCvdOiMarkers(candlestickSeries, marketSignals);
    // }

    // 최근 20개 캔들 범위 계산 (가로선 제한용)
    const lineStartIndex = Math.max(0, data.length - 20);
    const lineStartTime = data[lineStartIndex]?.time;
    const lineEndTime = data[data.length - 1]?.time;

    // 제한된 가로선 시리즈 초기화
    limitedLinesRef.current = [];

    // 가로선을 LineSeries로 그리는 헬퍼 함수 (Volume Profile용)
    const createLimitedPriceLine = (
      price: number,
      color: string,
      lineWidth: 1 | 2 | 3 | 4,
      lineStyle: 0 | 1 | 2 | 3 | 4,
      visible: boolean = true,
      isVolumeProfile: boolean = false, // Volume Profile 라인인지 여부
    ) => {
      if (!visible || !lineStartTime || !lineEndTime) return null;
      const series = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth,
          lineStyle,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        },
        0,
      );
      series.setData([
        { time: lineStartTime, value: price },
        { time: lineEndTime, value: price },
      ]);
      // Volume Profile 라인은 ref에 저장하여 토글 가능하게
      if (isVolumeProfile) {
        limitedLinesRef.current.push(series);
      }
      return series;
    };

    // Volume Profile 라인 (목표가, 상단저항, 하단지지) - ref에 저장하여 토글 가능하게
    volumeProfileLinesRef.current = []; // 초기화
    if (volumeProfile) {
      // 목표가 (POC) - 가장 많이 거래된 가격
      const pocLine = candlestickSeries.createPriceLine({
        price: volumeProfile.poc,
        color: 'rgba(250, 204, 21, 0.9)',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: showVolumeProfile,
        title: '목표(POC)',
        axisLabelColor: 'rgba(250, 204, 21, 1)',
        axisLabelTextColor: '#000',
        lineVisible: false, // 전체 가로선 숨김
      });
      volumeProfileLinesRef.current.push(pocLine);
      createLimitedPriceLine(volumeProfile.poc, 'rgba(250, 204, 21, 0.9)', 2, 0, showVolumeProfile, true);

      // 상단저항 (VAH)
      const vahLine = candlestickSeries.createPriceLine({
        price: volumeProfile.vah,
        color: 'rgba(248, 113, 113, 0.7)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: showVolumeProfile,
        title: '숏(VAH)',
        axisLabelColor: 'rgba(248, 113, 113, 0.9)',
        axisLabelTextColor: '#000',
        lineVisible: false,
      });
      volumeProfileLinesRef.current.push(vahLine);
      createLimitedPriceLine(volumeProfile.vah, 'rgba(248, 113, 113, 0.7)', 1, 2, showVolumeProfile, true);

      // 하단지지 (VAL)
      const valLine = candlestickSeries.createPriceLine({
        price: volumeProfile.val,
        color: 'rgba(163, 230, 53, 0.7)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: showVolumeProfile,
        title: '롱(VAL)',
        axisLabelColor: 'rgba(163, 230, 53, 0.9)',
        axisLabelTextColor: '#000',
        lineVisible: false,
      });
      volumeProfileLinesRef.current.push(valLine);
      createLimitedPriceLine(volumeProfile.val, 'rgba(163, 230, 53, 0.7)', 1, 2, showVolumeProfile, true);
    }

    // VWAP 라인 표시 (기관 트레이딩 기준선)
    if (vwapAtrData && vwapAtrData.currentVwap > 0) {
      candlestickSeries.createPriceLine({
        price: vwapAtrData.currentVwap,
        color: 'rgba(168, 85, 247, 0.9)',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: '기관(VWAP)',
        axisLabelColor: 'rgba(168, 85, 247, 1)',
        axisLabelTextColor: '#fff',
        lineVisible: false,
      });
      createLimitedPriceLine(vwapAtrData.currentVwap, 'rgba(168, 85, 247, 0.9)', 2, 0);
    }

    // ATR 기반 손절가 라인 표시
    if (vwapAtrData?.suggestedStopLoss) {
      // 롱 손절가 (현재가 - 2*ATR)
      candlestickSeries.createPriceLine({
        price: vwapAtrData.suggestedStopLoss.long,
        color: 'rgba(239, 68, 68, 0.6)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '변동폭(ATR)↓',
        axisLabelColor: 'rgba(239, 68, 68, 0.9)',
        axisLabelTextColor: '#000',
        lineVisible: false,
      });
      createLimitedPriceLine(vwapAtrData.suggestedStopLoss.long, 'rgba(239, 68, 68, 0.6)', 1, 2);

      // 숏 손절가 (현재가 + 2*ATR)
      candlestickSeries.createPriceLine({
        price: vwapAtrData.suggestedStopLoss.short,
        color: 'rgba(34, 197, 94, 0.6)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '변동폭(ATR)↑',
        axisLabelColor: 'rgba(34, 197, 94, 0.9)',
        axisLabelTextColor: '#000',
        lineVisible: false,
      });
      createLimitedPriceLine(vwapAtrData.suggestedStopLoss.short, 'rgba(34, 197, 94, 0.6)', 1, 2);
    }

    // 오더블록 표시 (현재가 근처 최대 3개만)
    if (orderBlockData?.activeBlocks && orderBlockData.activeBlocks.length > 0) {
      const currentPrice = data[data.length - 1]?.close || 0;

      orderBlockData.activeBlocks.forEach((block) => {
        const midPrice = (block.high + block.low) / 2;
        const isSupport = midPrice < currentPrice;

        const color = isSupport
          ? 'rgba(34, 197, 94, 0.8)'
          : 'rgba(239, 68, 68, 0.8)';

        candlestickSeries.createPriceLine({
          price: midPrice,
          color: color,
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          title: isSupport ? 'OB지지' : 'OB저항',
          axisLabelColor: color,
          axisLabelTextColor: '#000',
          lineVisible: false,
        });
        createLimitedPriceLine(midPrice, color, 2, 1);
      });

      console.log(`✅ ${orderBlockData.activeBlocks.length}개의 오더블록 표시됨`);
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
    isFirstRenderRef.current = false;

    // 통합 툴팁 (RSI 값 + 필터링 사유 + 크로스오버 + 다이버전스)
    chart.subscribeCrosshairMove((param) => {
        // 첫 번째 점만 설정된 상태: 미리보기 박스 그리기
        const currentMeasurePoints = measurePointsRef.current;
        if (currentMeasurePoints.start && !currentMeasurePoints.end && param.point) {
          const currentX = param.point.x;
          const currentY = param.point.y;

          const currentTime = chart.timeScale().coordinateToTime(currentX);
          const currentPrice = candlestickSeries.coordinateToPrice(currentY);

          if (currentTime !== null && currentPrice !== null) {
            const startX = chart.timeScale().timeToCoordinate(currentMeasurePoints.start.time as any);
            const startY = candlestickSeries.priceToCoordinate(currentMeasurePoints.start.price);

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
        if (param.seriesData.has(candlestickSeries)) {
          const candleData = param.seriesData.get(candlestickSeries);
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
                analysis: `단기 이동평균선(EMA 20)이 장기 이동평균선(EMA 50)을 상향 돌파했습니다. 이는 강력한 상승 신호로 해석되며, 매수 기회로 볼 수 있습니다. 거래량과 함께 확인하면 신뢰도가 높아집니다.`,
              };
            } else {
              crossoverInfo = {
                type: 'dead_cross',
                analysis: `단기 이동평균선(EMA 20)이 장기 이동평균선(EMA 50)을 하향 돌파했습니다. 이는 하락 추세 전환 신호로, 매도 또는 관망이 권장됩니다. 추가 하락 가능성을 염두에 두세요.`,
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
                        analysis: `가격은 하락하는 반면 ${signal.type.toUpperCase()}는 상승하고 있습니다. 이는 매도 압력이 약해지고 있음을 나타내며, 곧 상승 반전할 가능성이 있습니다. 매수 진입을 고려할 수 있는 시점입니다.`,
                        isFiltered,
                        startTime,
                        endTime,
                      });
                    } else {
                      divergenceInfos.push({
                        type: signal.type,
                        direction: 'bearish',
                        analysis: `가격은 상승하는 반면 ${signal.type.toUpperCase()}는 하락하고 있습니다. 이는 매수 압력이 약해지고 있음을 의미하며, 하락 반전 가능성이 있습니다. 매도 또는 익절을 고려하세요.`,
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
        const currentPrice = candlestickSeries.coordinateToPrice(clickY);
        if (currentPrice === null) return prev;

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
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleScaleChange);
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [
    data.length, // 캔들 개수만 체크 (데이터 내용 변경은 무시)
    oiData?.length,
    emaData !== undefined,
    divergenceSignals?.length,
    trendAnalysis !== undefined,
    crossoverEvents?.length,
    marketSignals?.length,
    volumeProfile?.poc, // Volume Profile 변경 시 재렌더링
    vwapAtrData?.currentVwap, // VWAP 변경 시 재렌더링
    vwapAtrData?.atr?.length, // ATR 변경 시 재렌더링
    orderBlockData?.activeBlocks?.length, // 오더블록 변경 시 재렌더링
  ]);

  // Volume Profile 라인 토글 (차트 재생성 없이 라인만 숨김/표시)
  useEffect(() => {
    // Y축 라벨만 토글 (전체 가로선은 항상 숨김)
    volumeProfileLinesRef.current.forEach((line) => {
      line.applyOptions({
        lineVisible: false, // 전체 가로선은 항상 숨김
        axisLabelVisible: showVolumeProfile,
      });
    });
    // 제한된 가로선 시리즈 토글
    limitedLinesRef.current.forEach((series) => {
      series.applyOptions({
        visible: showVolumeProfile,
      });
    });
  }, [showVolumeProfile]);

  // 크로스오버 X 마커 좌표 상태
  const [crossoverMarkers, setCrossoverMarkers] = useState<Array<{
    x: number;
    y: number;
    type: 'golden_cross' | 'dead_cross';
    isFiltered?: boolean; // 볼륨 낮으면 true
  }>>([]);

  // CVD+OI 신호 마커 좌표 상태
  const [signalMarkers, setSignalMarkers] = useState<Array<{
    x: number;
    y: number;
    type: string;
    label: string;
    color: string;
    position: 'above' | 'below';
  }>>([]);

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

  // 측정 박스를 위한 상태 (화면 좌표)
  const [measureBox, setMeasureBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    priceDiff: number;
    pricePercent: number;
    bars: number;
    timeRange: string; // "X일 X시간 X분" 형식
    isPreview?: boolean; // 미리보기인지 확정인지 구분
  } | null>(null);

  // 측정 박스 업데이트 (확정된 박스)
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;
    if (!measurePoints.start || !measurePoints.end) {
      // 끝점이 없으면 박스 제거 (미리보기는 crosshairMove에서 처리)
      setMeasureBox(null);
      return;
    }

    // 두 점의 화면 좌표 계산
    const startX = chartRef.current.timeScale().timeToCoordinate(measurePoints.start.time as any);
    const endX = chartRef.current.timeScale().timeToCoordinate(measurePoints.end.time as any);
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

    // 차트 렌더링 완료 후 좌표 계산
    const timeoutId = setTimeout(() => {
      if (!chartRef.current || !candlestickSeriesRef.current) return;

      const markers: Array<{ x: number; y: number; type: 'golden_cross' | 'dead_cross'; isFiltered?: boolean }> = [];

      crossoverEvents.forEach((event) => {
        if (event.type === 'none') return;

        const time = (event.timestamp / 1000) as any;
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
    }, 150);

    return () => clearTimeout(timeoutId);
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
      REAL_BULL: { label: '↑매수세', color: 'rgba(163, 230, 53, 0.9)', position: 'below' },
      SHORT_TRAP: { label: '⚠숏탈출', color: 'rgba(163, 230, 53, 0.9)', position: 'above' },
      PUMP_DUMP: { label: '⚠고점', color: 'rgba(251, 146, 60, 0.9)', position: 'above' },
      MORE_DROP: { label: '↓매도세', color: 'rgba(248, 113, 113, 0.9)', position: 'above' },
      LONG_ENTRY: { label: '★롱타점', color: 'rgba(34, 211, 238, 0.9)', position: 'below' },
    };

    const timeoutId = setTimeout(() => {
      if (!chartRef.current || !candlestickSeriesRef.current) return;

      const markers: Array<{ x: number; y: number; type: string; label: string; color: string; position: 'above' | 'below' }> = [];

      marketSignals.forEach((signal) => {
        const config = signalConfig[signal.type];
        if (!config) return;

        const time = (signal.timestamp / 1000) as any;
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
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [scaleUpdateTrigger]);

  // BOS/CHoCH 마커 좌표 계산
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !marketStructureData) {
      setStructureMarkers([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!chartRef.current || !candlestickSeriesRef.current) return;

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
        const x = chartRef.current!.timeScale().timeToCoordinate(timeValue as any);
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
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [scaleUpdateTrigger, marketStructureData]);

  // 오더북 깊이 바 계산 (scaleUpdateTrigger 변경 시)
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !orderBookData) {
      setOrderBookBars([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!chartRef.current || !candlestickSeriesRef.current) return;

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
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [scaleUpdateTrigger, orderBookData]);

  return (
    <div className='w-full'>

      {/* 측정 결과 표시 */}
      {measureBox && (
        <div className='mb-2 backdrop-blur-md bg-blue-500/20 text-blue-300 border border-blue-400/50 px-3 py-2 rounded-lg text-sm font-medium'>
          <span style={{ color: measureBox.pricePercent >= 0 ? '#a3e635' : '#fb923c' }}>
            {measureBox.pricePercent >= 0 ? '▲' : '▼'} {Math.abs(measureBox.pricePercent).toFixed(2)}%
          </span>
          <span className='ml-2 text-gray-300'>
            (${Math.abs(measureBox.priceDiff).toFixed(2)})
          </span>
        </div>
      )}

      {/* 추세 지표 Row - EMA, 크로스, 펀비, 목표가 */}
      <div className='flex items-center justify-between mb-2 backdrop-blur-md bg-black/40 px-3 py-2 rounded-lg border border-cyan-500/20'>
        <div className='flex items-center gap-3'>
          <span className='text-cyan-400 text-xs font-bold border border-cyan-400/50 px-1.5 py-0.5 rounded'>추세</span>

          {/* EMA 추세 */}
          {trendAnalysis && (
            <>
              {trendAnalysis.trend === 'bullish' && (
                <span className='text-lime-400 text-sm font-bold'>↑상승</span>
              )}
              {trendAnalysis.trend === 'bearish' && (
                <span className='text-red-400 text-sm font-bold'>↓하락</span>
              )}
              {trendAnalysis.trend === 'neutral' && (
                <span className='text-gray-400 text-sm font-bold'>→중립</span>
              )}
              {trendAnalysis.crossover === 'golden_cross' && (
                <span className='text-lime-400 text-sm font-bold'>✕골든</span>
              )}
              {trendAnalysis.crossover === 'dead_cross' && (
                <span className='text-red-400 text-sm font-bold'>✕데드</span>
              )}
            </>
          )}

          <span className='text-gray-600'>|</span>

          {/* 펀딩비 */}
          {longShortRatio && (() => {
            const recommendLong = longShortRatio.dominant === 'short';
            const isNeutral = longShortRatio.dominant === 'neutral';
            const textColor = isNeutral ? 'text-gray-400' : recommendLong ? 'text-lime-400' : 'text-red-400';
            return (
              <div className={`flex items-center gap-1 text-sm font-mono ${textColor}`}>
                <span className='text-gray-500'>펀비</span>
                <span className='font-bold'>{(longShortRatio.longRatio * 100).toFixed(0)}:{(longShortRatio.shortRatio * 100).toFixed(0)}</span>
              </div>
            );
          })()}

          <span className='text-gray-600'>|</span>

          {/* 목표가 */}
          {showVolumeProfile && volumeProfile && (() => {
            const currentPrice = realtimeCandle?.close ?? data[data.length - 1]?.close ?? 0;
            const isLongSignal = currentPrice < volumeProfile.poc;
            const diffPercent = ((volumeProfile.poc - currentPrice) / currentPrice * 100).toFixed(1);
            return (
              <div className={`flex items-center gap-1 text-sm font-mono ${isLongSignal ? 'text-lime-400' : 'text-red-400'}`}>
                <span className='text-gray-500'>목표</span>
                <span className='font-bold'>{(volumeProfile.poc / 1000).toFixed(1)}K</span>
                <span className='text-xs opacity-70'>({isLongSignal ? '+' : ''}{diffPercent}%)</span>
              </div>
            );
          })()}

          <span className='text-gray-600'>|</span>

          {/* ADX 추세 강도 */}
          {adxData ? (() => {
            const { currentAdx, trendStrength, trendDirection, recommendation } = adxData;

            // 추세 강도별 색상
            const strengthColor = {
              none: 'text-gray-400',
              forming: 'text-yellow-400',
              strong: 'text-cyan-400',
              very_strong: 'text-blue-400',
              extreme: 'text-purple-400',
            }[trendStrength];

            // 추세 강도별 텍스트
            const strengthText = {
              none: '횡보',
              forming: '형성중',
              strong: '강함',
              very_strong: '매우강함',
              extreme: '극단',
            }[trendStrength];

            // 매매 추천별 배지 색상
            const recBadge = {
              trend_follow: { text: '추세추종', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' },
              counter_trend: { text: '역추세', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50' },
              wait: { text: '관망', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' },
            }[recommendation];

            // 방향 아이콘
            const dirIcon = trendDirection === 'bullish' ? '↑' : trendDirection === 'bearish' ? '↓' : '→';
            const dirColor = trendDirection === 'bullish' ? 'text-lime-400' : trendDirection === 'bearish' ? 'text-red-400' : 'text-gray-400';

            return (
              <div className='flex items-center gap-2'>
                <span className='text-gray-500 text-sm'>ADX</span>
                <span className={`font-mono font-bold text-sm ${strengthColor}`}>
                  {currentAdx?.toFixed(0) ?? '-'}
                </span>
                <span className={`text-xs font-medium ${strengthColor}`}>
                  {strengthText}
                </span>
                <span className={`text-sm font-bold ${dirColor}`}>{dirIcon}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${recBadge.color}`}>
                  {recBadge.text}
                </span>
              </div>
            );
          })() : (
            <span className='text-gray-600 text-sm'>ADX -</span>
          )}
        </div>
      </div>

      {/* 역추세 지표 Row - 횡보, 다이버전스, ATR */}
      <div className='flex items-center justify-between mb-2 backdrop-blur-md bg-black/40 px-3 py-2 rounded-lg border border-amber-500/20'>
        <div className='flex items-center gap-3'>
          <span className='text-amber-400 text-xs font-bold border border-amber-400/50 px-1.5 py-0.5 rounded'>역추세</span>

          {/* 횡보 */}
          {consolidationData?.isCurrentlyConsolidating && consolidationData.currentZone ? (() => {
            const zone = consolidationData.currentZone;
            const totalMinutes = zone.candleCount * timeframeToMinutes(timeframe);
            const timeRange = formatTimeRange(totalMinutes);
            return (
              <span className='text-amber-300 text-sm font-bold animate-pulse'>
                ⚠️횡보 {timeRange} ({zone.rangePercent.toFixed(1)}%)
              </span>
            );
          })() : (
            <span className='text-gray-600 text-sm'>횡보 없음</span>
          )}

          <span className='text-gray-600'>|</span>

          {/* 다이버전스 */}
          {divergenceSignals && divergenceSignals.length > 0 ? (() => {
            const bullishCount = divergenceSignals.filter(s => s.direction === 'bullish').length;
            const bearishCount = divergenceSignals.filter(s => s.direction === 'bearish').length;
            const isBullishDominant = bullishCount >= bearishCount;
            return (
              <div className={`text-sm font-bold ${isBullishDominant ? 'text-lime-400' : 'text-red-400'}`}>
                다이버전스 {bullishCount}↑ {bearishCount}↓
              </div>
            );
          })() : (
            <span className='text-gray-600 text-sm'>다이버전스 없음</span>
          )}
        </div>

        {/* 우측: ATR (평균 대비 비율 표시) */}
        {vwapAtrData?.atrPercent ? (() => {
          const ratio = vwapAtrData.atrRatio || 1;
          const isHigh = ratio > 1.3; // 평균 대비 30% 이상
          const isLow = ratio < 0.7; // 평균 대비 30% 이하
          const colorClass = isHigh ? 'text-orange-400' : isLow ? 'text-blue-400' : 'text-gray-400';
          const ratioPercent = ((ratio - 1) * 100).toFixed(0);
          const ratioText = ratio >= 1 ? `+${ratioPercent}%` : `${ratioPercent}%`;
          return (
            <div className={`text-sm font-mono font-bold flex items-center gap-1 ${colorClass}`}>
              <span>변동폭(ATR) {vwapAtrData.atrPercent.toFixed(2)}%</span>
              <span className='text-xs opacity-70'>({ratioText})</span>
            </div>
          );
        })() : (
          <span className='text-gray-600 text-sm'>변동폭(ATR) -</span>
        )}
      </div>

      {/* 고래/기관 Row - 고래 프로그레스바 + 청산 */}
      <div className='flex items-center gap-3 mb-2 backdrop-blur-md bg-black/40 px-3 py-2 rounded-lg border border-purple-500/20'>
        <span className='text-purple-400 text-xs font-bold border border-purple-400/50 px-1.5 py-0.5 rounded'>고래/기관</span>

        {/* 고래 프로그레스바 */}
        {(() => {
          const stats = whaleData?.stats?.last5m;
          const buyVol = stats?.buyVolume || 0;
          const sellVol = stats?.sellVolume || 0;
          const totalVol = buyVol + sellVol;

          const formatUsd = (value: number) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
            return '0';
          };

          const buyPercent = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;

          return (
            <>
              <span className='text-lime-400 text-sm font-mono font-bold min-w-[50px]'>{formatUsd(buyVol)}</span>
              <div className='flex-1 h-3 bg-red-500/40 rounded-full overflow-hidden'>
                <div
                  className='h-full bg-lime-500/80 rounded-full transition-all'
                  style={{ width: `${buyPercent}%` }}
                />
              </div>
              <span className='text-red-400 text-sm font-mono font-bold min-w-[50px] text-right'>{formatUsd(sellVol)}</span>
            </>
          );
        })()}

        <span className='text-gray-600'>|</span>

        {/* 청산 */}
        {(() => {
          const recentLiqs = liquidationData?.recentLiquidations || [];
          const now = Date.now();
          const fiveMinAgo = now - 5 * 60 * 1000;
          const recentFiveMin = recentLiqs.filter(l => l.timestamp >= fiveMinAgo);

          const longLiqs = recentFiveMin.filter(l => l.side === 'Sell');
          const shortLiqs = recentFiveMin.filter(l => l.side === 'Buy');

          const avgLongPrice = longLiqs.length > 0
            ? longLiqs.reduce((sum, l) => sum + l.price, 0) / longLiqs.length
            : null;
          const avgShortPrice = shortLiqs.length > 0
            ? shortLiqs.reduce((sum, l) => sum + l.price, 0) / shortLiqs.length
            : null;

          const formatPrice = (price: number) => {
            if (price >= 1000) return `${(price / 1000).toFixed(1)}K`;
            return price.toFixed(0);
          };

          return (
            <div className='flex items-center gap-2 text-sm font-mono'>
              <span className='text-gray-500'>청산</span>
              {avgLongPrice ? (
                <span className='text-red-400 font-bold'>↓{formatPrice(avgLongPrice)}</span>
              ) : (
                <span className='text-gray-600'>-</span>
              )}
              <span className='text-gray-600'>|</span>
              {avgShortPrice ? (
                <span className='text-lime-400 font-bold'>↑{formatPrice(avgShortPrice)}</span>
              ) : (
                <span className='text-gray-600'>-</span>
              )}
            </div>
          );
        })()}
      </div>

      {/* 차트 컨테이너 */}
      <div className='relative'>
      <div
        ref={chartContainerRef}
        className='rounded-xl overflow-hidden shadow-inner'
        style={{ position: 'relative' }}
      >
        {/* 차트 정보 오버레이 (왼쪽 상단) - 시간 범위, 가격, 변화율 */}
        <div className='absolute top-2 left-2 z-10 backdrop-blur-md bg-black/40 px-2 py-1 rounded-lg text-xs font-mono border border-white/10 flex items-center gap-3'>
          {/* 시간 범위 (visible range 기반) */}
          <span className='text-gray-300'>
            {visibleRange ? calculateTimeRange(visibleRange.to - visibleRange.from, timeframe) : '-'}
          </span>
          {/* 현재가 및 변화율 */}
          {currentPriceInfo && (
            <>
              <span className='text-gray-500'>|</span>
              <span style={{ color: currentPriceInfo.changePercent >= 0 ? '#a3e635' : '#f87171' }}>
                ${currentPriceInfo.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ color: currentPriceInfo.changePercent >= 0 ? '#a3e635' : '#f87171' }}>
                {currentPriceInfo.changePercent >= 0 ? '▲' : '▼'} {Math.abs(currentPriceInfo.changePercent).toFixed(2)}%
              </span>
            </>
          )}
        </div>

        {/* 측정 박스 오버레이 (트레이딩뷰 스타일) */}
        {measureBox && (() => {
          const isPositive = measureBox.pricePercent >= 0;
          const boxColor = isPositive ? '163, 230, 53' : '251, 146, 60'; // lime-400 : orange-400

          // 툴팁이 차트 밖으로 나가는지 확인
          const TOOLTIP_HEIGHT = 40; // 대략적인 툴팁 높이
          const hasSpaceAbove = measureBox.top > TOOLTIP_HEIGHT + 10;
          const hasSpaceBelow = chartContainerRef.current
            ? (chartContainerRef.current.clientHeight - (measureBox.top + measureBox.height)) > TOOLTIP_HEIGHT + 10
            : true;

          // 툴팁 위치 결정
          let tooltipPosition;
          if (isPositive) {
            // 플러스: 위에 공간있으면 위에, 없으면 박스 안쪽 상단
            tooltipPosition = hasSpaceAbove
              ? { bottom: '100%', marginBottom: '4px' }
              : { top: '4px' };
          } else {
            // 마이너스: 아래 공간있으면 아래, 없으면 박스 안쪽 하단
            tooltipPosition = hasSpaceBelow
              ? { top: '100%', marginTop: '4px' }
              : { bottom: '4px' };
          }

          return (
            <div
              style={{
                position: 'absolute',
                left: `${measureBox.left}px`,
                top: `${measureBox.top}px`,
                width: `${measureBox.width}px`,
                height: `${measureBox.height}px`,
                backgroundColor: measureBox.isPreview ? `rgba(${boxColor}, 0.05)` : `rgba(${boxColor}, 0.1)`,
                border: measureBox.isPreview ? `1px dashed rgba(${boxColor}, 0.4)` : `1px solid rgba(${boxColor}, 0.5)`,
                pointerEvents: 'none',
                zIndex: 15, // 점 마커(11)와 툴팁(12)보다 높게 설정
              }}
            >
              {/* 측정 정보 텍스트 (공간에 따라 동적 위치) */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  ...tooltipPosition,
                  transform: 'translateX(-50%)',
                  backgroundColor: `rgba(${boxColor}, 0.9)`,
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  zIndex: 12, // 점 마커(zIndex 11)보다 위에 표시
                }}
              >
                <div style={{ color: 'white' }}>
                  {Math.abs(measureBox.priceDiff).toFixed(2)} ({isPositive ? '+' : ''}{measureBox.pricePercent.toFixed(2)}%)
                </div>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                  {measureBox.bars} 봉, {measureBox.timeRange}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 측정 시작점 마커 */}
        {measurePoints.start && chartRef.current && candlestickSeriesRef.current && (() => {
          const startX = chartRef.current!.timeScale().timeToCoordinate(measurePoints.start.time as any);
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
                  backgroundColor: 'rgba(59, 130, 246, 0.9)',
                  border: '2px solid white',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 11,
                  boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)',
                }}
              />
            );
          }
          return null;
        })()}

        {/* 측정 끝점 마커 */}
        {measurePoints.end && chartRef.current && candlestickSeriesRef.current && (() => {
          const endX = chartRef.current!.timeScale().timeToCoordinate(measurePoints.end.time as any);
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
                  backgroundColor: 'rgba(59, 130, 246, 0.9)',
                  border: '2px solid white',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 11,
                  boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)',
                }}
              />
            );
          }
          return null;
        })()}

        {/* 크로스오버 X 마커 (커스텀 오버레이) */}
        {crossoverMarkers.map((marker, index) => (
          <div
            key={`crossover-${index}`}
            style={{
              position: 'absolute',
              left: `${marker.x}px`,
              top: `${marker.y}px`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 20,
              fontSize: '16px',
              fontWeight: 'bold',
              // 필터링된 신호는 회색, 아니면 골든=초록/데드=빨강
              color: marker.isFiltered
                ? '#9ca3af' // gray-400
                : marker.type === 'golden_cross'
                ? '#a3e635' // lime-400
                : '#f87171', // red-400
              textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)',
              opacity: marker.isFiltered ? 0.6 : 1, // 필터링된 신호는 투명도
            }}
          >
            ✕
          </div>
        ))}

        {/* CVD+OI 신호 마커 (세련된 칩 스타일) */}
        {signalMarkers.map((marker, index) => (
          <div
            key={`signal-${index}`}
            style={{
              position: 'absolute',
              left: `${marker.x}px`,
              top: `${marker.y}px`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 20,
              backgroundColor: marker.color,
              color: '#000',
              fontSize: '10px',
              fontWeight: 'bold',
              padding: '2px 6px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
          >
            {marker.label}
          </div>
        ))}

        {/* BOS/CHoCH 마커 */}
        {structureMarkers.map((marker, index) => {
          // CHoCH 과열 여부에 따른 스타일 결정
          const isValidChoch = marker.type === 'CHoCH' && marker.isOverheated;
          const isInvalidChoch = marker.type === 'CHoCH' && !marker.isOverheated;

          // 과열 CHoCH = 밝고 강조, 비과열 CHoCH = 흐리게
          const getBackgroundColor = () => {
            if (marker.type === 'BOS') {
              return marker.direction === 'bullish'
                ? 'rgba(34, 197, 94, 0.6)'
                : 'rgba(239, 68, 68, 0.6)';
            }
            if (isValidChoch) {
              // 과열 CHoCH - 밝고 강조
              return marker.direction === 'bullish'
                ? 'rgba(34, 197, 94, 0.95)'
                : 'rgba(239, 68, 68, 0.95)';
            }
            // 비과열 CHoCH - 흐리게 (참고용)
            return marker.direction === 'bullish'
              ? 'rgba(34, 197, 94, 0.3)'
              : 'rgba(239, 68, 68, 0.3)';
          };

          return (
            <div
              key={`structure-${index}`}
              style={{
                position: 'absolute',
                left: `${marker.x}px`,
                top: `${marker.y}px`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 18,
                fontSize: isValidChoch ? '10px' : '8px',
                fontWeight: 'bold',
                padding: isValidChoch ? '2px 6px' : '1px 4px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                backgroundColor: getBackgroundColor(),
                color: isInvalidChoch ? 'rgba(0,0,0,0.5)' : '#000',
                border: isValidChoch ? '2px solid rgba(255,255,255,0.6)' : 'none',
                boxShadow: isValidChoch ? '0 2px 8px rgba(0,0,0,0.5)' : 'none',
                opacity: isInvalidChoch ? 0.5 : 1,
              }}
              title={marker.rsiAtBreak ? `RSI: ${marker.rsiAtBreak.toFixed(1)}` : undefined}
            >
              {marker.type}{marker.direction === 'bullish' ? '↑' : '↓'}
              {isValidChoch && (
                <span style={{ fontSize: '8px', marginLeft: '2px' }}>
                  ★
                </span>
              )}
            </div>
          );
        })}

        {/* 오더북 DOM 스타일 (최신 캔들 우측, 세로 스택) */}
        {orderBookData && chartRef.current && candlestickSeriesRef.current && data.length > 0 && (() => {
          // 최신 캔들의 X 좌표 구하기
          const latestCandle = data[data.length - 1];
          const latestX = chartRef.current!.timeScale().timeToCoordinate(latestCandle.time);
          if (latestX === null) return null;

          // 현재가 Y 좌표 (기준점)
          const currentPrice = latestCandle.close;
          const midY = candlestickSeriesRef.current!.priceToCoordinate(currentPrice);
          if (midY === null) return null;

          const barStartX = latestX + 12;
          const maxBarWidth = 70;
          const barHeight = 10; // 각 바 높이
          const barGap = 1; // 바 간격

          const asks = orderBookData.asks.slice(0, 8);
          const bids = orderBookData.bids.slice(0, 8);

          const allSizes = [...asks.map(a => a.size), ...bids.map(b => b.size)];
          const maxSize = Math.max(...allSizes);
          const avgSize = allSizes.reduce((a, b) => a + b, 0) / allSizes.length;

          return (
            <div
              style={{
                position: 'absolute',
                left: `${barStartX}px`,
                top: `${midY - (asks.length * (barHeight + barGap))}px`,
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
                      backgroundColor: isLargeWall ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.5)',
                      borderRadius: '2px',
                      borderLeft: isLargeWall ? '2px solid #ef4444' : 'none',
                    }}
                  />
                );
              })}

              {/* 스프레드 구분선 */}
              <div
                style={{
                  width: `${maxBarWidth}px`,
                  height: '2px',
                  backgroundColor: 'rgba(250, 204, 21, 0.6)',
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
                      backgroundColor: isLargeWall ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.5)',
                      borderRadius: '2px',
                      borderLeft: isLargeWall ? '2px solid #22c55e' : 'none',
                    }}
                  />
                );
              })}
            </div>
          );
        })()}

      </div>

      {/* 통합 툴팁 (RSI + 필터링 정보 + 크로스오버 + 다이버전스 + CVD+OI) */}
      {tooltip && (
        <ChartTooltip
          x={tooltip.x}
          y={tooltip.y}
          rsi={tooltip.rsi}
          filterReason={tooltip.filterReason}
          crossover={tooltip.crossover}
          divergences={tooltip.divergences}
          marketSignal={tooltip.marketSignal}
        />
      )}
      </div>
    </div>
  );
}
