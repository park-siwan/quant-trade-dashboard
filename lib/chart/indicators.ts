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
  ConsolidationZone,
} from '@/lib/types/index';

// 중복 타임스탬프 제거 유틸리티 (lightweight-charts 요구사항)
function dedupeByTime<T extends { time: Time }>(data: T[]): T[] {
  return data.filter((item, index, arr) => {
    if (index === 0) return true;
    return item.time !== arr[index - 1].time;
  });
}

/**
 * RSI 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param rsiData - RSI 데이터 배열
 * @returns RSI 시리즈 인스턴스
 */
export function addRsiIndicator(
  chart: IChartApi,
  rsiData: LineData[],
  paneIndex: number = 1,
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
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: 0,
          maxValue: 100,
        },
      }),
    },
    paneIndex,
  );

  rsiSeries.setData(dedupeByTime(rsiData));

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
  paneIndex: number = 2,
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
    paneIndex,
  );

  obvSeries.setData(dedupeByTime(obvData));

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
  paneIndex: number = 3,
): ISeriesApi<'Line'> {
  // CVD 라인 - 파란계열 (하늘색, 투명도 50%)
  const cvdSeries = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(96, 165, 250, 0.5)', // 하늘색 (blue-400) 투명도 50%
      lineWidth: 2,
      priceScaleId: 'cvd',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      title: 'CVD',
      lastValueVisible: true,
    },
    paneIndex,
  );

  cvdSeries.setData(dedupeByTime(cvdData));

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
 * ATR (Average True Range) 지표를 차트에 추가합니다
 * @param chart - lightweight-charts 인스턴스
 * @param atrData - ATR 데이터 배열
 * @returns ATR 시리즈 인스턴스
 */
export function addAtrIndicator(
  chart: IChartApi,
  atrData: LineData[],
  paneIndex: number = 2,
): ISeriesApi<'Line'> {
  // ATR 라인 - 주황계열 (변동폭 시각화)
  const atrSeries = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(251, 146, 60, 0.7)', // orange-400 투명도 70%
      lineWidth: 2,
      priceScaleId: 'atr',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      title: '변동폭(ATR)',
      lastValueVisible: true,
    },
    paneIndex,
  );

  atrSeries.setData(dedupeByTime(atrData));

  // ATR 패널 스케일 설정
  atrSeries.priceScale().applyOptions({
    autoScale: true, // Y축 자동 스케일링
    scaleMargins: {
      top: 0.1,
      bottom: 0.1,
    },
    borderVisible: false,
  });

  return atrSeries;
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
  paneIndex: number = 4,
): ISeriesApi<'Line'> {
  // OI 라인 - 보라계열 (자주색, 투명도 50%)
  const oiSeries = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(192, 132, 252, 0.5)', // 자주색 (purple-400) 투명도 50%
      lineWidth: 2,
      priceScaleId: 'oi',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      title: 'OI',
      lastValueVisible: true,
    },
    paneIndex,
  );

  oiSeries.setData(dedupeByTime(oiData));

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
      color: 'rgba(239, 68, 68, 0.25)', // 빨간색 (투명도 25%)
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    },
    0, // 메인 패널
  );
  ema20Series.setData(dedupeByTime(ema20LineData));

  // EMA 50 시리즈 추가 (파란색 - 중간 속도, 중간 두께)
  const ema50Series = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(59, 130, 246, 0.25)', // 파란색 (투명도 25%)
      lineWidth: 3,
      lastValueVisible: false,
      priceLineVisible: false,
    },
    0, // 메인 패널
  );
  ema50Series.setData(dedupeByTime(ema50LineData));

  // EMA 200 시리즈 추가 (초록색 - 가장 느린 이평선, 가장 두꺼움)
  const ema200Series = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(34, 197, 94, 0.25)', // 초록색 (투명도 25%)
      lineWidth: 4,
      lastValueVisible: false,
      priceLineVisible: false,
    },
    0, // 메인 패널
  );
  ema200Series.setData(dedupeByTime(ema200LineData));

  return {
    ema20: ema20Series,
    ema50: ema50Series,
    ema200: ema200Series,
  };
}

/**
 * 다이버전스를 선으로 그립니다 (가격 패널 + RSI/OBV/CVD/OI 패널)
 * @param useClosePrice - true면 종가 기준으로 선 그림 (라인 차트용)
 */
export function addDivergenceLines(
  chart: IChartApi,
  candlestickSeries: ISeriesApi<'Candlestick'>,
  rsiSeries: ISeriesApi<'Line'> | null,
  obvSeries: ISeriesApi<'Line'> | null,
  cvdSeries: ISeriesApi<'Line'> | null,
  oiSeries: ISeriesApi<'Line'> | null,
  signals: DivergenceSignal[],
  candleData: Array<{ time: number; high: number; low: number; close?: number }>,
  rsiData: LineData[],
  obvData: LineData[],
  cvdData: LineData[],
  oiData: LineData[],
  paneIndices?: { rsi?: number; obv?: number; cvd?: number; oi?: number },
  useClosePrice: boolean = false,
): void {
  // start와 end를 쌍으로 그룹화
  const divergencePairs: Array<{
    start: DivergenceSignal;
    end: DivergenceSignal;
    direction: 'bullish' | 'bearish';
    isFiltered: boolean;
    confirmed: boolean; // 피봇 확정 여부
  }> = [];

  // 매칭된 end 신호 추적
  const matchedEndIndices = new Set<number>();

  // 1단계: start → end 매칭
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    if (signal.phase === 'start') {
      // 다음 end 찾기
      const endIdx = signals.findIndex(
        (s, idx) =>
          idx > i &&
          s.phase === 'end' &&
          s.type === signal.type &&
          s.direction === signal.direction,
      );

      if (endIdx !== -1) {
        const endSignal = signals[endIdx];
        matchedEndIndices.add(endIdx);

        // start나 end 중 하나라도 필터링되었으면 전체 쌍을 필터링으로 처리
        const isFiltered = !!(signal.isFiltered || endSignal.isFiltered);
        // 둘 다 confirmed여야 confirmed (하나라도 false면 미확정)
        const confirmed = signal.confirmed !== false && endSignal.confirmed !== false;

        divergencePairs.push({
          start: signal,
          end: endSignal,
          direction: signal.direction,
          isFiltered,
          confirmed,
        });
      }
    }
  }

  // 2단계: 매칭되지 않은 end 신호에 대해 가상의 start 생성
  // (index를 기준으로 10캔들 전을 start로 설정)
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    if (signal.phase === 'end' && !matchedEndIndices.has(i)) {
      // 10캔들 전의 타임스탬프 계산 (5분봉 기준 = 300초 * 10 = 3000초)
      const estimatedStartTimestamp = signal.timestamp - (300 * 10 * 1000); // 10캔들 전
      const estimatedStartIndex = Math.max(0, signal.index - 10);

      const syntheticStart: DivergenceSignal = {
        ...signal,
        phase: 'start',
        timestamp: estimatedStartTimestamp,
        index: estimatedStartIndex,
      };

      divergencePairs.push({
        start: syntheticStart,
        end: signal,
        direction: signal.direction,
        isFiltered: signal.isFiltered || false,
        confirmed: signal.confirmed !== false,
      });

      console.log(`🔧 ${signal.type} ${signal.direction} 다이버전스: end만 있어서 start 자동 생성`, {
        type: signal.type,
        direction: signal.direction,
        endTimestamp: new Date(signal.timestamp).toLocaleString(),
        syntheticStartTimestamp: new Date(estimatedStartTimestamp).toLocaleString(),
      });
    }
  }

  // 디버깅: 원본 시그널 및 매칭된 쌍 출력
  console.log('📊 다이버전스 시그널 원본:', signals);
  console.log('📊 CVD 시그널만:', signals.filter(s => s.type === 'cvd'));
  console.log('📊 CVD start 시그널:', signals.filter(s => s.type === 'cvd' && s.phase === 'start'));
  console.log('📊 CVD end 시그널:', signals.filter(s => s.type === 'cvd' && s.phase === 'end'));
  console.log('🔗 매칭된 다이버전스 쌍:', divergencePairs);
  console.log('📈 타입별 다이버전스:', {
    rsi: divergencePairs.filter(p => p.start.type === 'rsi').length,
    obv: divergencePairs.filter(p => p.start.type === 'obv').length,
    cvd: divergencePairs.filter(p => p.start.type === 'cvd').length,
    oi: divergencePairs.filter(p => p.start.type === 'oi').length,
  });

  // CVD 쌍 상세 디버깅
  const cvdPairs = divergencePairs.filter(p => p.start.type === 'cvd');
  if (cvdPairs.length > 0) {
    console.log('🔍 CVD 다이버전스 쌍 상세:', cvdPairs.map(p => ({
      direction: p.direction,
      startTimestamp: p.start.timestamp,
      endTimestamp: p.end.timestamp,
      startPriceValue: p.start.priceValue,
      endPriceValue: p.end.priceValue,
    })));
  }

  // 다이버전스 라벨 마커 수집
  const divergenceMarkers: SeriesMarker<Time>[] = [];

  // 타입별 라벨 매핑
  const typeLabels: Record<string, string> = {
    rsi: 'RSI',
    obv: 'OBV',
    cvd: 'CVD',
    oi: 'OI',
  };

  // 각 다이버전스 쌍에 대해 선 그리기
  divergencePairs.forEach((pair) => {
    // 미확정(confirmed=false) 다이버전스는 표시하지 않음 (리페인팅 방지)
    if (!pair.confirmed) {
      console.log(`⏳ ${pair.start.type} ${pair.direction} 다이버전스 미확정 - 차트 표시 대기`);
      return;
    }

    // 필터링된 신호는 회색, 정상 신호는 오더북 색상 기준
    const color = pair.isFiltered
      ? 'rgba(156, 163, 175, 0.7)' // gray-400 (투명도 70%)
      : pair.direction === 'bullish'
      ? 'rgba(163, 230, 53, 0.9)' // lime-400 (롱 타점 - 투명도 90%)
      : 'rgba(248, 113, 113, 0.9)'; // red-400 (숏 타점 - 투명도 90%)

    // 1. 가격 패널에 선 그리기
    // useClosePrice=true면 종가 기준 (라인 차트용)
    // priceValue가 있으면 직접 사용 (백엔드에서 계산된 정확한 가격)
    // 없으면 캔들 데이터에서 찾기 (폴백)
    let startPrice: number | undefined;
    let endPrice: number | undefined;

    // 캔들 데이터에서 찾기 (±300초 허용 - 5분봉 기준)
    const startTimeSec = pair.start.timestamp / 1000;
    const endTimeSec = pair.end.timestamp / 1000;

    // 퍼지 매칭: ±300초 범위 내에서 가장 가까운 캔들 찾기
    const findClosestCandle = (targetTime: number) => {
      let closest: { time: number; high: number; low: number; close?: number } | null = null;
      let minDiff = Infinity;
      for (const c of candleData) {
        const diff = Math.abs(c.time - targetTime);
        if (diff < minDiff && diff <= 300) {
          minDiff = diff;
          closest = c;
        }
      }
      return closest;
    };

    const startCandle = findClosestCandle(startTimeSec);
    const endCandle = findClosestCandle(endTimeSec);

    if (useClosePrice && startCandle?.close !== undefined && endCandle?.close !== undefined) {
      // 라인 차트: 종가 기준
      startPrice = startCandle.close;
      endPrice = endCandle.close;
    } else if (pair.start.priceValue !== undefined && pair.end.priceValue !== undefined && !useClosePrice) {
      // 캔들 차트: 백엔드에서 전달된 정확한 가격 사용 (고점/저점)
      startPrice = pair.start.priceValue;
      endPrice = pair.end.priceValue;
    } else if (startCandle && endCandle) {
      // 폴백: 캔들 데이터에서 고점/저점 찾기
      // bearish: 고점 연결, bullish: 저점 연결
      startPrice =
        pair.direction === 'bearish' ? startCandle.high : startCandle.low;
      endPrice =
        pair.direction === 'bearish' ? endCandle.high : endCandle.low;
    } else {
      console.warn(`⚠️ ${pair.start.type} 다이버전스 캔들 매칭 실패:`, {
        startTimeSec,
        endTimeSec,
        candleDataRange: candleData.length > 0
          ? `${candleData[0].time} ~ ${candleData[candleData.length - 1].time}`
          : 'empty',
      });
    }

    if (startPrice !== undefined && endPrice !== undefined) {
      const startTime = pair.start.timestamp / 1000;
      const endTime = pair.end.timestamp / 1000;
      console.log(`✅ ${pair.start.type.toUpperCase()} 다이버전스 가격선:`, {
        type: pair.start.type,
        direction: pair.direction,
        startPrice: startPrice.toFixed(2),
        endPrice: endPrice.toFixed(2),
        startTime: new Date(startTime * 1000).toLocaleString(),
        endTime: new Date(endTime * 1000).toLocaleString(),
        isFiltered: pair.isFiltered,
        color,
      });

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

      // 다이버전스 끝점에 라벨 마커 추가
      const label = typeLabels[pair.start.type] || pair.start.type.toUpperCase();
      const arrow = pair.direction === 'bullish' ? '↑' : '↓';
      const markerColor = pair.isFiltered
        ? '#9ca3af' // gray-400
        : pair.direction === 'bullish'
        ? '#a3e635' // lime-400
        : '#f87171'; // red-400

      divergenceMarkers.push({
        time: (pair.end.timestamp / 1000) as Time,
        position: 'inBar', // 캔들/라인 정중앙에 표시
        color: markerColor,
        shape: 'circle',
        text: `${label}${arrow}`,
      });
    }

    // 2. RSI 패널에 선 그리기
    if (rsiSeries && pair.start.type === 'rsi') {
      const startTimeSec = pair.start.timestamp / 1000;
      const endTimeSec = pair.end.timestamp / 1000;

      // 퍼지 매칭: ±300초 범위 내에서 가장 가까운 데이터 찾기
      const findClosestRsi = (targetTime: number) => {
        let closest: LineData | null = null;
        let minDiff = Infinity;
        for (const r of rsiData) {
          const diff = Math.abs((r.time as number) - targetTime);
          if (diff < minDiff && diff <= 300) {
            minDiff = diff;
            closest = r;
          }
        }
        return closest;
      };

      const startRsi = findClosestRsi(startTimeSec);
      const endRsi = findClosestRsi(endTimeSec);

      console.log('🔍 RSI 선 그리기:', {
        startTimeSec,
        endTimeSec,
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
          paneIndices?.rsi ?? 1,
        ); // RSI 패널

        rsiLineSeries.setData([
          { time: startRsi.time, value: startRsi.value },
          { time: endRsi.time, value: endRsi.value },
        ]);
      } else {
        console.warn('⚠️ RSI 데이터를 찾을 수 없음:', {
          startTimeSec,
          endTimeSec,
          rsiDataLength: rsiData.length,
        });
      }
    }

    // 3. OBV 패널에 선 그리기
    if (obvSeries && pair.start.type === 'obv') {
      const startTimeSec = pair.start.timestamp / 1000;
      const endTimeSec = pair.end.timestamp / 1000;

      // 퍼지 매칭: ±300초 범위 내에서 가장 가까운 데이터 찾기
      const findClosestObv = (targetTime: number) => {
        let closest: LineData | null = null;
        let minDiff = Infinity;
        for (const o of obvData) {
          const diff = Math.abs((o.time as number) - targetTime);
          if (diff < minDiff && diff <= 300) {
            minDiff = diff;
            closest = o;
          }
        }
        return closest;
      };

      const startObv = findClosestObv(startTimeSec);
      const endObv = findClosestObv(endTimeSec);

      console.log('🔍 OBV 선 그리기:', {
        startTimeSec,
        endTimeSec,
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
          paneIndices?.obv ?? 2,
        ); // OBV 패널

        obvLineSeries.setData([
          { time: startObv.time, value: startObv.value },
          { time: endObv.time, value: endObv.value },
        ]);
      } else {
        console.warn('⚠️ OBV 데이터를 찾을 수 없음:', {
          startTimeSec,
          endTimeSec,
          obvDataLength: obvData.length,
        });
      }
    }

    // 4. CVD 패널에 선 그리기
    if (cvdSeries && pair.start.type === 'cvd') {
      const startTimeSec = pair.start.timestamp / 1000;
      const endTimeSec = pair.end.timestamp / 1000;

      // 퍼지 매칭: ±300초 (5분) 범위 내에서 가장 가까운 데이터 찾기
      const findClosestCvd = (targetTime: number) => {
        let closest: LineData | null = null;
        let minDiff = Infinity;
        for (const c of cvdData) {
          const diff = Math.abs((c.time as number) - targetTime);
          if (diff < minDiff && diff <= 300) {
            minDiff = diff;
            closest = c;
          }
        }
        return closest;
      };

      const startCvd = findClosestCvd(startTimeSec);
      const endCvd = findClosestCvd(endTimeSec);

      console.log('🔍 CVD 선 그리기:', {
        startTimeSec,
        endTimeSec,
        startCvd,
        endCvd,
        cvdDataRange: cvdData.length > 0
          ? `${cvdData[0].time} ~ ${cvdData[cvdData.length - 1].time}`
          : 'empty',
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
          paneIndices?.cvd ?? 3,
        ); // CVD 패널

        cvdLineSeries.setData([
          { time: startCvd.time, value: startCvd.value },
          { time: endCvd.time, value: endCvd.value },
        ]);
      } else {
        console.warn('⚠️ CVD 데이터를 찾을 수 없음:', {
          startTimeSec,
          endTimeSec,
          cvdDataLength: cvdData.length,
        });
      }
    }

    // 5. OI 패널에 선 그리기
    if (oiSeries && pair.start.type === 'oi') {
      const startTimeSec = pair.start.timestamp / 1000;
      const endTimeSec = pair.end.timestamp / 1000;

      // 퍼지 매칭: ±300초 범위 내에서 가장 가까운 데이터 찾기
      const findClosestOi = (targetTime: number) => {
        let closest: LineData | null = null;
        let minDiff = Infinity;
        for (const o of oiData) {
          const diff = Math.abs((o.time as number) - targetTime);
          if (diff < minDiff && diff <= 300) {
            minDiff = diff;
            closest = o;
          }
        }
        return closest;
      };

      const startOi = findClosestOi(startTimeSec);
      const endOi = findClosestOi(endTimeSec);

      console.log('🔍 OI 선 그리기:', {
        startTimeSec,
        endTimeSec,
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
          paneIndices?.oi ?? 4,
        ); // OI 패널

        oiLineSeries.setData([
          { time: startOi.time, value: startOi.value },
          { time: endOi.time, value: endOi.value },
        ]);
      } else {
        console.warn('⚠️ OI 데이터를 찾을 수 없음:', {
          startTimeSec,
          endTimeSec,
          oiDataLength: oiData.length,
        });
      }
    }
  });

  // 수집된 다이버전스 마커를 캔들스틱 시리즈에 추가
  if (divergenceMarkers.length > 0) {
    // 시간순 정렬 (lightweight-charts 요구사항)
    divergenceMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(candlestickSeries, divergenceMarkers);
    console.log(`✅ ${divergenceMarkers.length}개의 다이버전스 라벨 마커 추가됨`);
  }
}

/**
 * 크로스오버 마커를 차트에 추가합니다 (비활성화 - 커스텀 오버레이 사용)
 * @deprecated ChartRenderer에서 커스텀 X 마커로 대체됨
 */
export function addCrossoverMarkers(
  candlestickSeries: ISeriesApi<'Candlestick'>,
  crossoverEvents: CrossoverEvent[],
): void {
  // 커스텀 오버레이 방식으로 변경 - ChartRenderer에서 처리
  // 기본 마커는 사용하지 않음
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

  // 신호 타입별 색상 및 모양 매핑 (원형 도형 + 이모지)
  const signalConfig: Record<
    MarketSignal['type'],
    { color: string; shape: 'circle'; text: string; position: 'aboveBar' | 'belowBar' }
  > = {
    REAL_BULL: {
      color: '#22c55e',
      shape: 'circle',
      text: '🚀',
      position: 'belowBar',
    },
    SHORT_TRAP: {
      color: '#f97316',
      shape: 'circle',
      text: '📉',
      position: 'aboveBar',
    },
    PUMP_DUMP: {
      color: '#ef4444',
      shape: 'circle',
      text: '⚠️',
      position: 'aboveBar',
    },
    MORE_DROP: {
      color: '#dc2626',
      shape: 'circle',
      text: '🔻',
      position: 'aboveBar',
    },
    LONG_ENTRY: {
      color: '#10b981',
      shape: 'circle',
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

/**
 * 횡보 구간을 차트에 박스로 표시합니다
 * @param chart - lightweight-charts 인스턴스
 * @param zones - 횡보 구간 배열
 * @returns 생성된 시리즈 배열 (정리용)
 */
export function addConsolidationZones(
  chart: IChartApi,
  zones: ConsolidationZone[],
): ISeriesApi<'Line'>[] {
  const series: ISeriesApi<'Line'>[] = [];

  // 현재 진행 중인 횡보만 표시 (과거 횡보는 스킵)
  const activeZones = zones.filter((zone) => zone.isActive);

  activeZones.forEach((zone) => {
    const color = 'rgba(251, 191, 36, 0.08)'; // amber-400 (현재 횡보 - 아주 연하게)
    const borderColor = 'rgba(251, 191, 36, 0.4)'; // amber-400

    const startTime = (zone.startTimestamp / 1000) as Time;
    const endTime = (zone.endTimestamp / 1000) as Time;

    // 상단 라인
    const topLine = chart.addSeries(
      LineSeries,
      {
        color: borderColor,
        lineWidth: 2,
        lineStyle: 2, // dashed
        lastValueVisible: false,
        priceLineVisible: false,
      },
      0,
    );
    topLine.setData([
      { time: startTime, value: zone.high },
      { time: endTime, value: zone.high },
    ]);
    series.push(topLine);

    // 하단 라인
    const bottomLine = chart.addSeries(
      LineSeries,
      {
        color: borderColor,
        lineWidth: 2,
        lineStyle: 2, // dashed
        lastValueVisible: false,
        priceLineVisible: false,
      },
      0,
    );
    bottomLine.setData([
      { time: startTime, value: zone.low },
      { time: endTime, value: zone.low },
    ]);
    series.push(bottomLine);

    // Area로 채우기 (상단과 하단 사이)
    const fillArea = chart.addSeries(
      AreaSeries,
      {
        topColor: color,
        bottomColor: color,
        lineColor: 'transparent',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      },
      0,
    );
    fillArea.setData([
      { time: startTime, value: zone.high },
      { time: endTime, value: zone.high },
    ]);

    console.log(
      `⚠️ 현재 횡보 중! ${zone.candleCount}캔들, 범위 ${zone.rangePercent.toFixed(2)}% - Breakout 주의!`,
    );
  });

  if (activeZones.length > 0) {
    console.log(`✅ ${activeZones.length}개의 현재 횡보 구간 표시됨`);
  }
  return series;
}
