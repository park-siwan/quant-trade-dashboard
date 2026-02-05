import { useEffect, useRef, MutableRefObject } from 'react';
import {
  CandlestickData,
  SeriesMarker,
  Time,
  IChartApi,
} from 'lightweight-charts';
import {
  TradeResult,
  SkippedSignal,
  OpenPosition,
  SavedOptimizeResult,
} from '@/lib/backtest-api';
import { RealtimeDivergenceData } from '@/contexts/SocketContext';
import { toSeconds } from '@/lib/utils/timestamp';
import {
  createTradeColorMap,
  colorizeCandles,
  generateBacktestMarkers,
  generateSkippedSignalMarkers,
  generateDivergenceMarkers,
  sortAndMergeMarkers,
  mergeTradeMaps,
} from '@/lib/chart/markerUtils';

interface UseMarkerGenerationProps {
  backtestTrades: TradeResult[];
  skippedSignals: SkippedSignal[];
  openPosition: OpenPosition | null;
  candles: CandlestickData[];
  divergenceHistory: RealtimeDivergenceData[];
  selectedStrategy: SavedOptimizeResult | null;
  isBacktestRunning: boolean;
  candleSeriesRef: MutableRefObject<any>;
  chartRef: MutableRefObject<IChartApi | null>;
  isChangingStrategyRef: MutableRefObject<boolean>;
  updateSeriesMarkers: (markers: SeriesMarker<Time>[]) => void;
  tradeMapRef: MutableRefObject<Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>>;
}

/**
 * 차트 마커 생성 및 캔들 색상 관리 Hook
 * - 백테스트 거래 마커 (Entry/Exit)
 * - 스킵된 신호 마커
 * - 실시간 다이버전스 신호 마커
 * - 거래 구간 캔들 색상 변경
 */
export function useMarkerGeneration({
  backtestTrades,
  skippedSignals,
  openPosition,
  candles,
  divergenceHistory,
  selectedStrategy,
  isBacktestRunning,
  candleSeriesRef,
  chartRef,
  isChangingStrategyRef,
  updateSeriesMarkers,
  tradeMapRef,
}: UseMarkerGenerationProps) {
  // 이전 상태 추적 (불필요한 차트 업데이트 방지)
  const prevCandlesLengthRef = useRef<number>(0);
  const prevTradesCountRef = useRef<number>(0);
  const prevOpenPositionRef = useRef<OpenPosition | null>(null);
  const prevIsBacktestRunningRef = useRef<boolean>(false);
  const prevSkippedCountRef = useRef<number>(0);
  const prevDivergenceCountRef = useRef<number>(0);

  // 마커 업데이트 + 거래 구간 캔들 색상 변경
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    // 전략 변경 중이거나 백테스트 진행 중이면 마커 클리어 (깔끔한 상태 유지)
    if (isChangingStrategyRef.current || isBacktestRunning) {
      // 백테스트 상태가 실제로 변경되었을 때만 차트 초기화
      if (isBacktestRunning !== prevIsBacktestRunningRef.current) {
        updateSeriesMarkers([]);
        candleSeriesRef.current.setData(candles);
        prevIsBacktestRunningRef.current = isBacktestRunning;
      }
      return;
    }

    prevIsBacktestRunningRef.current = isBacktestRunning;

    const candleTimes = candles.map((c) => c.time as number);
    const minCandleTime = Math.min(...candleTimes);
    const maxCandleTime = Math.max(...candleTimes);

    // 1. 거래 구간별 색상 맵 생성
    const tradeColorMap = createTradeColorMap(
      backtestTrades,
      openPosition,
      candles
    );

    // 2. 캔들 데이터에 색상 적용 (연한 색상)
    const coloredCandles = colorizeCandles(candles, tradeColorMap);

    // 3. 색상이 적용된 캔들 데이터로 업데이트 (캔들 개수 변경 시에만)
    const candlesChanged = candles.length !== prevCandlesLengthRef.current;
    const tradesChanged = backtestTrades.length !== prevTradesCountRef.current;
    const positionChanged = openPosition?.entryTime !== prevOpenPositionRef.current?.entryTime;

    // 중요: setData()는 캔들 개수가 변경될 때만 호출 (실시간 업데이트와 충돌 방지)
    if (candlesChanged) {
      candleSeriesRef.current.setData(coloredCandles);
      prevCandlesLengthRef.current = candles.length;

      // 데이터 업데이트 후 가격 스케일 재조정
      if (chartRef.current) {
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      }

      // console.log('[Markers] Chart data updated - candles:', candles.length);
    }

    // 거래/포지션 변경 시 ref만 업데이트 (setData 호출 안 함)
    if (tradesChanged) {
      prevTradesCountRef.current = backtestTrades.length;
    }
    if (positionChanged) {
      prevOpenPositionRef.current = openPosition;
    }

    // 5. 백테스트 거래 마커 생성
    const { markers: tradeMarkers, tradeMap: tradeMapFromTrades } =
      backtestTrades.length > 0
        ? generateBacktestMarkers(backtestTrades, minCandleTime, maxCandleTime)
        : { markers: [], tradeMap: new Map() };

    // 6. 스킵된 신호 마커 생성
    const { markers: skippedMarkers, tradeMap: tradeMapFromSkipped } =
      skippedSignals.length > 0
        ? generateSkippedSignalMarkers(
            skippedSignals,
            minCandleTime,
            maxCandleTime
          )
        : { markers: [], tradeMap: new Map() };

    // 7. 실시간 다이버전스 신호 마커 (전략이 선택되지 않았을 때만 표시)
    const divergenceMarkers =
      !selectedStrategy && divergenceHistory.length > 0
        ? generateDivergenceMarkers(
            divergenceHistory,
            minCandleTime,
            maxCandleTime
          )
        : [];

    // 8. 모든 마커 병합 및 정렬
    const allMarkers = sortAndMergeMarkers(
      tradeMarkers,
      skippedMarkers,
      divergenceMarkers
    );

    // 9. tradeMap 병합
    const mergedTradeMap = mergeTradeMaps(
      tradeMapFromTrades,
      tradeMapFromSkipped
    );

    // 10. 마커 추가 (변경된 경우에만)
    const markersChanged =
      backtestTrades.length !== prevTradesCountRef.current ||
      skippedSignals.length !== prevSkippedCountRef.current ||
      (!selectedStrategy && divergenceHistory.length !== prevDivergenceCountRef.current);

    if (markersChanged) {
      if (allMarkers.length > 0) {
        updateSeriesMarkers(allMarkers);
      } else {
        updateSeriesMarkers([]);
      }

      prevSkippedCountRef.current = skippedSignals.length;
      prevDivergenceCountRef.current = divergenceHistory.length;
    }

    tradeMapRef.current = mergedTradeMap;
  }, [
    // 원시 값만 의존 (배열/객체 재생성으로 인한 불필요한 재실행 방지)
    backtestTrades.length,
    skippedSignals.length,
    divergenceHistory.length,
    openPosition?.entryTime,
    candles.length,
    selectedStrategy?.id,
    isBacktestRunning,
    // 함수/ref는 안정적이므로 재실행 유발하지 않음
    candleSeriesRef,
    chartRef,
    isChangingStrategyRef,
    updateSeriesMarkers,
    tradeMapRef,
    // 주의: 실제 배열 데이터(backtestTrades, candles 등)는 의존성에서 제외
    // -> 길이/특정 속성 변화만 추적하여 불필요한 재실행 방지
    // -> 하지만 effect 내부에서는 props를 통해 최신 데이터 접근 가능
  ]);
}
