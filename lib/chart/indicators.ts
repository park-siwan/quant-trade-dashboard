import {
  IChartApi,
  LineSeries,
  LineData,
  ISeriesApi,
  SeriesMarker,
  Time,
  createSeriesMarkers,
} from 'lightweight-charts';
import { DivergenceSignal } from '@/lib/types/index';

/**
 * RSI 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param rsiData - RSI 데이터 배열
 * @returns RSI 시리즈 인스턴스
 */
export function addRsiIndicator(
  chart: IChartApi,
  rsiData: LineData[],
): ISeriesApi<'Line'> {
  const rsiSeries = chart.addSeries(
    LineSeries,
    {
      color: '#a855eb',
      lineWidth: 2,
      priceScaleId: 'rsi',
    },
    1, // paneIndex: 1 (별도 패널)
  );

  rsiSeries.setData(rsiData);

  // 과매수 기준선 (70)
  rsiSeries.createPriceLine({
    price: 70,
    color: '#ef4444',
    lineWidth: 1,
    lineStyle: 2, // dashed
    axisLabelVisible: true,
    title: '과매수',
  });

  // 과매도 기준선 (30)
  rsiSeries.createPriceLine({
    price: 30,
    color: '#22c55e',
    lineWidth: 1,
    lineStyle: 2, // dashed
    axisLabelVisible: true,
    title: '과매도',
  });

  // RSI 패널 스케일 설정
  rsiSeries.priceScale().applyOptions({
    scaleMargins: {
      top: 0.1,
      bottom: 0.1,
    },
    borderVisible: false,
  });

  return rsiSeries;
}

/**
 * OBV 지표를 차트에 추가합니다 (향후 구현)
 */
export function addObvIndicator(
  chart: IChartApi,
  obvData: LineData[],
): ISeriesApi<'Line'> {
  // TODO: OBV 구현
  throw new Error('Not implemented yet');
}

/**
 * 다이버전스를 선으로 그립니다 (가격 패널 + RSI 패널)
 */
export function addDivergenceLines(
  chart: IChartApi,
  candlestickSeries: ISeriesApi<'Candlestick'>,
  rsiSeries: ISeriesApi<'Line'> | null,
  signals: DivergenceSignal[],
  candleData: Array<{ time: number; high: number; low: number }>,
  rsiData: LineData[],
): void {
  // start와 end를 쌍으로 그룹화
  const divergencePairs: Array<{
    start: DivergenceSignal;
    end: DivergenceSignal;
    direction: 'bullish' | 'bearish';
  }> = [];

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    if (signal.phase === 'start') {
      // 다음 end 찾기
      const endSignal = signals.find(
        (s, idx) =>
          idx > i &&
          s.phase === 'end' &&
          s.type === signal.type &&
          s.direction === signal.direction,
      );

      if (endSignal) {
        divergencePairs.push({
          start: signal,
          end: endSignal,
          direction: signal.direction,
        });
      }
    }
  }

  // 디버깅: 매칭된 쌍 출력
  console.log('🔗 매칭된 다이버전스 쌍:', divergencePairs);

  // 각 다이버전스 쌍에 대해 선 그리기
  divergencePairs.forEach((pair) => {
    const color = pair.direction === 'bullish' ? '#22c55e' : '#ef4444';

    // 1. 가격 패널에 선 그리기
    const startCandle = candleData.find(
      (c) => c.time === pair.start.timestamp / 1000,
    );
    const endCandle = candleData.find(
      (c) => c.time === pair.end.timestamp / 1000,
    );

    if (startCandle && endCandle) {
      // bearish: 고점 연결, bullish: 저점 연결
      const startPrice =
        pair.direction === 'bearish' ? startCandle.high : startCandle.low;
      const endPrice =
        pair.direction === 'bearish' ? endCandle.high : endCandle.low;

      // 가격 라인 시리즈로 선 그리기
      const priceLineSeries = chart.addSeries(
        LineSeries,
        {
          color: color,
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
        },
        0,
      ); // 메인 패널

      priceLineSeries.setData([
        { time: (pair.start.timestamp / 1000) as Time, value: startPrice },
        { time: (pair.end.timestamp / 1000) as Time, value: endPrice },
      ]);
    }

    // 2. RSI 패널에 선 그리기
    if (rsiSeries && pair.start.type === 'rsi') {
      const startRsi = rsiData.find(
        (r) => r.time === ((pair.start.timestamp / 1000) as Time),
      );
      const endRsi = rsiData.find(
        (r) => r.time === ((pair.end.timestamp / 1000) as Time),
      );

      if (startRsi && endRsi) {
        const rsiLineSeries = chart.addSeries(
          LineSeries,
          {
            color: color,
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
          },
          1,
        ); // RSI 패널

        rsiLineSeries.setData([
          { time: startRsi.time, value: startRsi.value },
          { time: endRsi.time, value: endRsi.value },
        ]);
      }
    }
  });
}
