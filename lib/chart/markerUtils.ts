import {
  SeriesMarker,
  Time,
  CandlestickData,
} from 'lightweight-charts';
import {
  TradeResult,
  SkippedSignal,
  OpenPosition,
} from '../backtest-api';
import { RealtimeDivergenceData } from '@/contexts/SocketContext';
import { toSeconds } from '../utils/timestamp';
import { CHART } from '../constants';

/**
 * 투명 스페이서 마커 생성 (캔들과 간격 확보)
 */
export function createSpacer(
  time: number,
  position: 'aboveBar' | 'belowBar'
): SeriesMarker<Time> {
  return {
    time: time as Time,
    position,
    color: 'transparent',
    shape: 'circle',
    size: CHART.SPACER_SIZE,
  } as SeriesMarker<Time>;
}

/**
 * 거래 구간별 색상 맵 생성
 */
export function createTradeColorMap(
  backtestTrades: TradeResult[],
  openPosition: OpenPosition | null,
  candles: CandlestickData[]
): Map<number, { isLong: boolean; isWin: boolean }> {
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

  return tradeColorMap;
}

/**
 * 캔들에 색상 적용
 */
export function colorizeCandles(
  candles: CandlestickData[],
  tradeColorMap: Map<number, { isLong: boolean; isWin: boolean }>
): CandlestickData[] {
  return candles.map((candle) => {
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
}

// 신호 타입별 마커 텍스트
const SIGNAL_TYPE_TEXT: Record<string, string> = {
  breakout: '⚡',
  divergence: '↩',
  mean_reversion: '♻',
};

/**
 * 백테스트 거래 마커 생성
 */
export function generateBacktestMarkers(
  backtestTrades: TradeResult[],
  minCandleTime: number,
  maxCandleTime: number
): {
  markers: SeriesMarker<Time>[];
  tradeMap: Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>;
} {
  const markers: SeriesMarker<Time>[] = [];
  const tradeMap = new Map<
    number,
    {
      trade?: TradeResult;
      skipped?: SkippedSignal;
      type: 'entry' | 'exit' | 'skipped';
    }
  >();

  backtestTrades.forEach((trade) => {
    const entryTime = toSeconds(trade.entryTime);
    const exitTime = toSeconds(trade.exitTime);
    const isLong = trade.direction === 'long';
    const isWin = trade.pnl > 0;

    // 진입 마커 (롱: 밝은 초록 화살표, 숏: 밝은 빨강 화살표)
    if (entryTime >= minCandleTime && entryTime <= maxCandleTime) {
      const signalText = SIGNAL_TYPE_TEXT[trade.signalType || ''] || '';
      markers.push(createSpacer(entryTime, isLong ? 'belowBar' : 'aboveBar'));
      markers.push({
        time: entryTime as Time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isLong ? '#22c55e' : '#ef4444',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        size: CHART.MARKER_SIZE_ARROW,
        ...(signalText && { text: signalText }),
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
      exitColor = isFeeLoss
        ? `rgba(156, 163, 175, ${alpha})`
        : `rgba(250, 204, 21, ${alpha})`; // 수수료 손실: 회색, 진짜 손절: 노랑
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

  return { markers, tradeMap };
}

/**
 * 스킵된 신호 마커 생성 (수수료 보호)
 */
export function generateSkippedSignalMarkers(
  skippedSignals: SkippedSignal[],
  minCandleTime: number,
  maxCandleTime: number
): {
  markers: SeriesMarker<Time>[];
  tradeMap: Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>;
} {
  const markers: SeriesMarker<Time>[] = [];
  const tradeMap = new Map<
    number,
    {
      trade?: TradeResult;
      skipped?: SkippedSignal;
      type: 'entry' | 'exit' | 'skipped';
    }
  >();

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

  return { markers, tradeMap };
}

/**
 * 실시간 다이버전스 신호 마커 생성
 */
export function generateDivergenceMarkers(
  divergenceHistory: RealtimeDivergenceData[],
  minCandleTime: number,
  maxCandleTime: number
): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];

  divergenceHistory.forEach((signal) => {
    const signalTime = toSeconds(signal.timestamp);
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

  return markers;
}

/**
 * 마커 정렬 및 병합
 */
export function sortAndMergeMarkers(
  ...markerGroups: (SeriesMarker<Time>[] | { markers: SeriesMarker<Time>[] })[]
): SeriesMarker<Time>[] {
  const allMarkers: SeriesMarker<Time>[] = [];

  markerGroups.forEach((group) => {
    if (Array.isArray(group)) {
      allMarkers.push(...group);
    } else {
      allMarkers.push(...group.markers);
    }
  });

  return allMarkers.sort((a, b) => (a.time as number) - (b.time as number));
}

/**
 * tradeMap 병합
 */
export function mergeTradeMaps(
  ...maps: Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }>[]
): Map<number, { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }> {
  const mergedMap = new Map<
    number,
    { trade?: TradeResult; skipped?: SkippedSignal; type: 'entry' | 'exit' | 'skipped' }
  >();

  maps.forEach((map) => {
    map.forEach((value, key) => {
      mergedMap.set(key, value);
    });
  });

  return mergedMap;
}

/**
 * 캔들 시리즈에 마커 적용
 */
export function updateSeriesMarkers(
  updateMarkersFunc: (markers: SeriesMarker<Time>[]) => void,
  markers: SeriesMarker<Time>[]
): void {
  updateMarkersFunc(markers);
}
