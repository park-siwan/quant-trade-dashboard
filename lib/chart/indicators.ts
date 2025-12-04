import { IChartApi, LineSeries, LineData, ISeriesApi } from 'lightweight-charts';

/**
 * RSI 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param rsiData - RSI 데이터 배열
 * @returns RSI 시리즈 인스턴스
 */
export function addRsiIndicator(
  chart: IChartApi,
  rsiData: LineData[]
): ISeriesApi<'Line'> {
  const rsiSeries = chart.addSeries(
    LineSeries,
    {
      color: '#a855eb',
      lineWidth: 2,
      priceScaleId: 'rsi',
    },
    1 // paneIndex: 1 (별도 패널)
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
  obvData: LineData[]
): ISeriesApi<'Line'> {
  // TODO: OBV 구현
  throw new Error('Not implemented yet');
}
