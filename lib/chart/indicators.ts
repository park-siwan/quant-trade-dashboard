import {
  IChartApi,
  LineSeries,
  AreaSeries,
  LineData,
  ISeriesApi,
  SeriesMarker,
  Time,
  createSeriesMarkers,
} from 'lightweight-charts';
import {
  DivergenceSignal,
  EmaData,
  CrossoverEvent,
  MarketSignal,
} from '@/lib/types/index';

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
  // RSI 라인 (메인) - 황금색
  const rsiSeries = chart.addSeries(
    LineSeries,
    {
      color: '#fbbe2449', // 황금색 (비트코인 테마)
      lineWidth: 2,
      priceScaleId: 'rsi',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      title: 'RSI',
      lastValueVisible: true,
    },
    1, // paneIndex: 1 (별도 패널)
  );

  rsiSeries.setData(rsiData);

  // 과매수 기준선 (70)
  rsiSeries.createPriceLine({
    price: 70,
    color: 'rgba(239, 68, 68, 0.4)', // 빨간색 (투명도)
    lineWidth: 1,
    lineStyle: 2, // dashed
    axisLabelVisible: true,
    title: '과매수',
  });

  // 중심선 (50)
  rsiSeries.createPriceLine({
    price: 50,
    color: 'rgba(161, 161, 170, 0.25)', // 부드러운 회색
    lineWidth: 1,
    lineStyle: 2, // dashed
    axisLabelVisible: true,
    title: '',
  });

  // 과매도 기준선 (30)
  rsiSeries.createPriceLine({
    price: 30,
    color: 'rgba(163, 230, 53, 0.4)', // 초록색 (투명도)
    lineWidth: 1,
    lineStyle: 2, // dashed
    axisLabelVisible: true,
    title: '과매도',
  });

  // RSI 패널 스케일 설정
  rsiSeries.priceScale().applyOptions({
    scaleMargins: {
      top: 0.05,
      bottom: 0.05,
    },
    borderVisible: false,
  });

  return rsiSeries;
}

/**
 * OBV 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param obvData - OBV 데이터 배열
 * @returns OBV 시리즈 인스턴스
 */
export function addObvIndicator(
  chart: IChartApi,
  obvData: LineData[],
): ISeriesApi<'Line'> {
  // OBV 라인 - 노란계열 (복숭아빛 오렌지)
  const obvSeries = chart.addSeries(
    LineSeries,
    {
      color: '#fdbb7442', // 복숭아빛 오렌지 (orange-300)
      lineWidth: 2,
      priceScaleId: 'obv',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      title: 'OBV',
      lastValueVisible: true,
    },
    2, // paneIndex: 2 (세 번째 패널)
  );

  obvSeries.setData(obvData);

  // OBV 패널 스케일 설정 (1:1:1 비율을 위해 여백 최소화)
  obvSeries.priceScale().applyOptions({
    scaleMargins: {
      top: 0.05,
      bottom: 0.05,
    },
    borderVisible: false,
  });

  return obvSeries;
}

/**
 * CVD (Cumulative Volume Delta) 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param cvdData - CVD 데이터 배열
 * @returns CVD 시리즈 인스턴스
 */
export function addCvdIndicator(
  chart: IChartApi,
  cvdData: LineData[],
): ISeriesApi<'Line'> {
  // CVD 라인 - 파란계열 (하늘색)
  const cvdSeries = chart.addSeries(
    LineSeries,
    {
      color: '#60a5fa', // 하늘색 (blue-400)
      lineWidth: 2,
      priceScaleId: 'cvd',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      title: 'CVD',
      lastValueVisible: true,
    },
    3, // paneIndex: 3 (네 번째 패널)
  );

  cvdSeries.setData(cvdData);

  // CVD 패널 스케일 설정
  cvdSeries.priceScale().applyOptions({
    autoScale: true, // Y축 자동 스케일링
    scaleMargins: {
      top: 0.1,
      bottom: 0.1,
    },
    borderVisible: false,
  });

  return cvdSeries;
}

/**
 * OI (Open Interest) 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param oiData - OI 데이터 배열
 * @returns OI 시리즈 인스턴스
 */
export function addOiIndicator(
  chart: IChartApi,
  oiData: LineData[],
): ISeriesApi<'Line'> {
  // OI 라인 - 보라계열 (자주색)
  const oiSeries = chart.addSeries(
    LineSeries,
    {
      color: '#c084fc', // 자주색 (purple-400)
      lineWidth: 2,
      priceScaleId: 'oi',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      title: 'OI',
      lastValueVisible: true,
    },
    4, // paneIndex: 4 (다섯 번째 패널)
  );

  oiSeries.setData(oiData);

  // OI 패널 스케일 설정
  oiSeries.priceScale().applyOptions({
    autoScale: true, // Y축 자동 스케일링 (작은 변화도 확대)
    scaleMargins: {
      top: 0.1,
      bottom: 0.1,
    },
    borderVisible: false,
  });

  return oiSeries;
}

/**
 * EMA 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param emaData - EMA 데이터 (배열 형태)
 * @param candles - 캔들 데이터 (타임스탬프 매핑용)
 * @returns EMA 시리즈 객체
 */
export function addEmaIndicators(
  chart: IChartApi,
  emaData: EmaData,
  candles: Array<{ time: number }>,
): {
  ema20: ISeriesApi<'Line'>;
  ema50: ISeriesApi<'Line'>;
  ema200: ISeriesApi<'Line'>;
} {
  // EMA 데이터를 LineData 형식으로 변환
  const ema20LineData: LineData[] = [];
  const ema50LineData: LineData[] = [];
  const ema200LineData: LineData[] = [];

  candles.forEach((candle, index) => {
    const time = candle.time as Time;

    // EMA 20
    const ema20Value = emaData.ema20?.[index];
    if (
      ema20Value !== null &&
      ema20Value !== undefined &&
      !isNaN(ema20Value) &&
      typeof ema20Value === 'number'
    ) {
      ema20LineData.push({ time, value: ema20Value });
    }

    // EMA 50
    const ema50Value = emaData.ema50?.[index];
    if (
      ema50Value !== null &&
      ema50Value !== undefined &&
      !isNaN(ema50Value) &&
      typeof ema50Value === 'number'
    ) {
      ema50LineData.push({ time, value: ema50Value });
    }

    // EMA 200
    const ema200Value = emaData.ema200?.[index];
    if (
      ema200Value !== null &&
      ema200Value !== undefined &&
      !isNaN(ema200Value) &&
      typeof ema200Value === 'number'
    ) {
      ema200LineData.push({ time, value: ema200Value });
    }
  });

  // EMA 20 시리즈 추가 (빨간색 - 가장 빠른 이평선, 가장 얇음)
  const ema20Series = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(239, 68, 68, 0.8)', // 빨간색 (투명도 80%)
      lineWidth: 2,
      title: 'EMA 20',
      lastValueVisible: false,
      priceLineVisible: false,
    },
    0, // 메인 패널
  );
  ema20Series.setData(ema20LineData);

  // EMA 50 시리즈 추가 (파란색 - 중간 속도, 중간 두께)
  const ema50Series = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(59, 130, 246, 0.8)', // 파란색 (투명도 80%)
      lineWidth: 3,
      title: 'EMA 50',
      lastValueVisible: false,
      priceLineVisible: false,
    },
    0, // 메인 패널
  );
  ema50Series.setData(ema50LineData);

  // EMA 200 시리즈 추가 (초록색 - 가장 느린 이평선, 가장 두꺼움)
  const ema200Series = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(34, 197, 94, 0.8)', // 초록색 (투명도 80%)
      lineWidth: 4,
      title: 'EMA 200',
      lastValueVisible: false,
      priceLineVisible: false,
    },
    0, // 메인 패널
  );
  ema200Series.setData(ema200LineData);

  return {
    ema20: ema20Series,
    ema50: ema50Series,
    ema200: ema200Series,
  };
}

/**
 * 다이버전스를 선으로 그립니다 (가격 패널 + RSI/OBV/CVD/OI 패널)
 */
export function addDivergenceLines(
  chart: IChartApi,
  candlestickSeries: ISeriesApi<'Candlestick'>,
  rsiSeries: ISeriesApi<'Line'> | null,
  obvSeries: ISeriesApi<'Line'> | null,
  cvdSeries: ISeriesApi<'Line'> | null,
  oiSeries: ISeriesApi<'Line'> | null,
  signals: DivergenceSignal[],
  candleData: Array<{ time: number; high: number; low: number }>,
  rsiData: LineData[],
  obvData: LineData[],
  cvdData: LineData[],
  oiData: LineData[],
): void {
  // start와 end를 쌍으로 그룹화
  const divergencePairs: Array<{
    start: DivergenceSignal;
    end: DivergenceSignal;
    direction: 'bullish' | 'bearish';
    isFiltered: boolean;
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
        // start나 end 중 하나라도 필터링되었으면 전체 쌍을 필터링으로 처리
        const isFiltered = !!(signal.isFiltered || endSignal.isFiltered);

        divergencePairs.push({
          start: signal,
          end: endSignal,
          direction: signal.direction,
          isFiltered,
        });
      }
    }
  }

  // 디버깅: 매칭된 쌍 출력
  console.log('🔗 매칭된 다이버전스 쌍:', divergencePairs);

  // 각 다이버전스 쌍에 대해 선 그리기
  divergencePairs.forEach((pair) => {
    // 필터링된 신호는 회색, 정상 신호는 새로운 색상
    const color = pair.isFiltered
      ? '#9CA3AF' // gray-400
      : pair.direction === 'bullish'
      ? '#a3e635' // lime (연두색)
      : '#fb923c'; // orange (주황색)

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
          lineWidth: pair.isFiltered ? 1 : 2, // 필터링된 신호는 얇은 선
          lastValueVisible: false,
          priceLineVisible: false,
          lineStyle: pair.isFiltered ? 2 : 0, // 필터링된 신호는 점선 (2 = dashed)
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
      const startTime = (pair.start.timestamp / 1000) as Time;
      const endTime = (pair.end.timestamp / 1000) as Time;

      const startRsi = rsiData.find((r) => r.time === startTime);
      const endRsi = rsiData.find((r) => r.time === endTime);

      console.log('🔍 RSI 선 그리기:', {
        startTime,
        endTime,
        startRsi,
        endRsi,
      });

      if (startRsi && endRsi) {
        const rsiLineSeries = chart.addSeries(
          LineSeries,
          {
            color: color,
            lineWidth: pair.isFiltered ? 1 : 2, // 필터링된 신호는 얇은 선
            lastValueVisible: false,
            priceLineVisible: false,
            priceScaleId: 'rsi', // RSI 스케일 사용 (중요!)
            lineStyle: pair.isFiltered ? 2 : 0, // 필터링된 신호는 점선 (2 = dashed)
          },
          1,
        ); // RSI 패널

        rsiLineSeries.setData([
          { time: startRsi.time, value: startRsi.value },
          { time: endRsi.time, value: endRsi.value },
        ]);
      } else {
        console.warn('⚠️ RSI 데이터를 찾을 수 없음:', {
          startTime,
          endTime,
          rsiDataLength: rsiData.length,
        });
      }
    }

    // 3. OBV 패널에 선 그리기
    if (obvSeries && pair.start.type === 'obv') {
      const startTime = (pair.start.timestamp / 1000) as Time;
      const endTime = (pair.end.timestamp / 1000) as Time;

      const startObv = obvData.find((o) => o.time === startTime);
      const endObv = obvData.find((o) => o.time === endTime);

      console.log('🔍 OBV 선 그리기:', {
        startTime,
        endTime,
        startObv,
        endObv,
      });

      if (startObv && endObv) {
        const obvLineSeries = chart.addSeries(
          LineSeries,
          {
            color: color,
            lineWidth: pair.isFiltered ? 1 : 2, // 필터링된 신호는 얇은 선
            lastValueVisible: false,
            priceLineVisible: false,
            priceScaleId: 'obv', // OBV 스케일 사용 (중요!)
            lineStyle: pair.isFiltered ? 2 : 0, // 필터링된 신호는 점선 (2 = dashed)
          },
          2,
        ); // OBV 패널

        obvLineSeries.setData([
          { time: startObv.time, value: startObv.value },
          { time: endObv.time, value: endObv.value },
        ]);
      } else {
        console.warn('⚠️ OBV 데이터를 찾을 수 없음:', {
          startTime,
          endTime,
          obvDataLength: obvData.length,
        });
      }
    }

    // 4. CVD 패널에 선 그리기
    if (cvdSeries && pair.start.type === 'cvd') {
      const startTime = (pair.start.timestamp / 1000) as Time;
      const endTime = (pair.end.timestamp / 1000) as Time;

      const startCvd = cvdData.find((c) => c.time === startTime);
      const endCvd = cvdData.find((c) => c.time === endTime);

      console.log('🔍 CVD 선 그리기:', {
        startTime,
        endTime,
        startCvd,
        endCvd,
      });

      if (startCvd && endCvd) {
        const cvdLineSeries = chart.addSeries(
          LineSeries,
          {
            color: color,
            lineWidth: pair.isFiltered ? 1 : 2,
            lastValueVisible: false,
            priceLineVisible: false,
            priceScaleId: 'cvd', // CVD 스케일 사용
            lineStyle: pair.isFiltered ? 2 : 0,
          },
          3,
        ); // CVD 패널

        cvdLineSeries.setData([
          { time: startCvd.time, value: startCvd.value },
          { time: endCvd.time, value: endCvd.value },
        ]);
      } else {
        console.warn('⚠️ CVD 데이터를 찾을 수 없음:', {
          startTime,
          endTime,
          cvdDataLength: cvdData.length,
        });
      }
    }

    // 5. OI 패널에 선 그리기
    if (oiSeries && pair.start.type === 'oi') {
      const startTime = (pair.start.timestamp / 1000) as Time;
      const endTime = (pair.end.timestamp / 1000) as Time;

      const startOi = oiData.find((o) => o.time === startTime);
      const endOi = oiData.find((o) => o.time === endTime);

      console.log('🔍 OI 선 그리기:', {
        startTime,
        endTime,
        startOi,
        endOi,
      });

      if (startOi && endOi) {
        const oiLineSeries = chart.addSeries(
          LineSeries,
          {
            color: color,
            lineWidth: pair.isFiltered ? 1 : 2,
            lastValueVisible: false,
            priceLineVisible: false,
            priceScaleId: 'oi', // OI 스케일 사용
            lineStyle: pair.isFiltered ? 2 : 0,
          },
          4,
        ); // OI 패널

        oiLineSeries.setData([
          { time: startOi.time, value: startOi.value },
          { time: endOi.time, value: endOi.value },
        ]);
      } else {
        console.warn('⚠️ OI 데이터를 찾을 수 없음:', {
          startTime,
          endTime,
          oiDataLength: oiData.length,
        });
      }
    }
  });
}

/**
 * 크로스오버 마커를 차트에 추가합니다
 * @param candlestickSeries - 캔들스틱 시리즈 인스턴스
 * @param crossoverEvents - 크로스오버 이벤트 배열
 */
export function addCrossoverMarkers(
  candlestickSeries: ISeriesApi<'Candlestick'>,
  crossoverEvents: CrossoverEvent[],
): void {
  if (crossoverEvents.length === 0) return;

  // 모든 크로스오버 이벤트를 마커로 변환
  const markers: SeriesMarker<Time>[] = crossoverEvents.map((event) => {
    const isGoldenCross = event.type === 'golden_cross';

    return {
      time: (event.timestamp / 1000) as Time,
      position: isGoldenCross ? 'belowBar' : 'aboveBar',
      color: isGoldenCross ? '#a3e635' : '#fb923c', // 연두색 / 주황색
      shape: isGoldenCross ? 'arrowUp' : 'arrowDown',
      text: isGoldenCross ? 'GC' : 'DC',
    };
  });

  // 한 번에 모든 마커 추가
  createSeriesMarkers(candlestickSeries, markers);

  console.log(`✅ ${crossoverEvents.length}개의 크로스오버 마커 추가됨`);
}

/**
 * CVD + OI 신호 마커를 차트에 추가합니다
 * @param candlestickSeries - 캔들스틱 시리즈 인스턴스
 * @param marketSignals - CVD+OI 시장 신호 배열
 */
export function addCvdOiMarkers(
  candlestickSeries: ISeriesApi<'Candlestick'>,
  marketSignals: MarketSignal[],
): void {
  if (marketSignals.length === 0) return;

  // 신호 타입별 색상 및 모양 매핑
  const signalConfig: Record<
    MarketSignal['type'],
    { color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string; position: 'aboveBar' | 'belowBar' }
  > = {
    REAL_BULL: {
      color: '#22c55e', // 초록색 (강한 매수)
      shape: 'arrowUp',
      text: '🚀',
      position: 'belowBar',
    },
    SHORT_TRAP: {
      color: '#f97316', // 주황색
      shape: 'arrowDown',
      text: '📉',
      position: 'aboveBar',
    },
    PUMP_DUMP: {
      color: '#ef4444', // 빨간색 (위험)
      shape: 'arrowDown',
      text: '⚠️',
      position: 'aboveBar',
    },
    MORE_DROP: {
      color: '#dc2626', // 진한 빨간색
      shape: 'arrowDown',
      text: '🔻',
      position: 'aboveBar',
    },
    LONG_ENTRY: {
      color: '#10b981', // 에메랄드 (매수 기회)
      shape: 'arrowUp',
      text: '💎',
      position: 'belowBar',
    },
  };

  // 모든 CVD+OI 신호를 마커로 변환
  const markers: SeriesMarker<Time>[] = marketSignals.map((signal) => {
    const config = signalConfig[signal.type];

    return {
      time: (signal.timestamp / 1000) as Time,
      position: config.position,
      color: config.color,
      shape: config.shape,
      text: config.text,
    };
  });

  // 한 번에 모든 마커 추가
  createSeriesMarkers(candlestickSeries, markers);

  console.log(`✅ ${marketSignals.length}개의 CVD+OI 신호 마커 추가됨`);
}
