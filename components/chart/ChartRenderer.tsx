'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  CandlestickData,
  LineData,
} from 'lightweight-charts';
import {
  addRsiIndicator,
  addObvIndicator,
  addDivergenceLines,
  addEmaIndicators,
  addCrossoverMarkers,
} from '@/lib/chart/indicators';
import {
  DivergenceSignal,
  EmaData,
  TrendAnalysis,
  CrossoverEvent,
} from '@/lib/types/index';
import ChartTooltip from './ChartTooltip';

interface ChartRendererProps {
  data: CandlestickData[];
  rsiData?: LineData[];
  obvData?: LineData[];
  emaData?: EmaData;
  divergenceSignals?: DivergenceSignal[];
  trendAnalysis?: TrendAnalysis;
  crossoverEvents?: CrossoverEvent[];
}

export default function ChartRenderer({
  data,
  rsiData,
  obvData,
  emaData,
  divergenceSignals,
  trendAnalysis,
  crossoverEvents,
}: ChartRendererProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    rsi: number | null;
    filterReason: string | null;
    crossover: { type: 'golden_cross' | 'dead_cross'; analysis: string } | null;
    divergences: Array<{ type: string; direction: string; analysis: string }>;
  } | null>(null);
  const isFirstRenderRef = useRef(true); // 첫 렌더링인지 추적
  const savedVisibleLogicalRangeRef = useRef<{
    from: number;
    to: number;
  } | null>(null); // 논리적 스크롤 범위 저장 (바 인덱스 기반)

  // 캔들 투명도 설정
  const CANDLE_OPACITY = 0.3;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 차트 생성 (패널 개수에 따라 높이 조정 - 1:1:1 비율)
    const hasRsi = rsiData && rsiData.length > 0;
    const hasObv = obvData && obvData.length > 0;
    const panelCount = 1 + (hasRsi ? 1 : 0) + (hasObv ? 1 : 0); // 메인 + RSI + OBV
    const panelHeight = 200; // 각 패널당 동일한 높이 (한 화면에 맞춤)
    const chartHeight = panelCount * panelHeight; // 1:1:1 비율

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#1a1410' }, // 황금빛 도는 다크 블랙
        textColor: '#d1d5db',
        panes: {
          separatorColor: '#3754bc70', // 패널 구분선 제거
          separatorHoverColor: 'transparent', // 호버 시에도 표시 안함
          enableResize: false, // 패널 크기 조절 비활성화
        },
      },
      grid: {
        vertLines: { color: 'rgba(58, 48, 38, 0.3)' }, // 황금빛 도는 그리드
        horzLines: { color: 'rgba(58, 48, 38, 0.3)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 20, // 우측 여백
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.05,
          bottom: 0.05,
        },
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

    // 캔들스틱 시리즈 추가 (메인 패널 - paneIndex: 0)
    const candlestickSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: `rgba(163, 230, 53, ${CANDLE_OPACITY})`, // 연두색 캔들 (lime-400)
        downColor: `rgba(251, 146, 60, ${CANDLE_OPACITY})`, // 주황색 캔들 (orange-400)
        borderUpColor: `rgba(163, 230, 53, ${CANDLE_OPACITY})`, // 연두색 테두리
        borderDownColor: `rgba(251, 146, 60, ${CANDLE_OPACITY})`, // 주황색 테두리
        wickUpColor: `rgba(163, 230, 53, ${CANDLE_OPACITY})`, // 연두색 꼬리
        wickDownColor: `rgba(251, 146, 60, ${CANDLE_OPACITY})`, // 주황색 꼬리
      },
      0,
    );

    candlestickSeries.setData(data);

    // EMA 지표 추가
    if (emaData) {
      const candleData = data.map((candle) => ({
        time: candle.time as number,
      }));
      addEmaIndicators(chart, emaData, candleData);
    }

    // RSI 지표 추가
    let rsiSeries = null;
    if (rsiData && rsiData.length > 0) {
      rsiSeries = addRsiIndicator(chart, rsiData);
    }

    // OBV 지표 추가
    let obvSeries = null;
    if (obvData && obvData.length > 0) {
      obvSeries = addObvIndicator(chart, obvData);
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
        divergenceSignals,
        candleData,
        rsiData || [],
        obvData || [],
      );
    }

    // 크로스오버 마커 추가
    if (crossoverEvents && crossoverEvents.length > 0) {
      addCrossoverMarkers(candlestickSeries, crossoverEvents);
    }

    // 패널 높이를 2:1:1로 설정 (v5.0.8+ API)
    // setStretchFactor를 사용하여 메인 패널은 2, RSI/OBV는 1로 설정
    setTimeout(() => {
      const panes = chart.panes();

      if (panes.length > 0) {
        panes.forEach((pane, index) => {
          if (index === 0) {
            // 메인 패널 (캔들스틱)은 2배 크기
            pane.setStretchFactor(4);
            console.log(`패널 ${index} (메인) stretch factor 설정: 2`);
          } else {
            // RSI, OBV 패널은 절반 크기
            pane.setStretchFactor(1);
            console.log(`패널 ${index} (지표) stretch factor 설정: 1`);
          }
        });

        console.log(`✅ ${panes.length}개 패널 2:1:1 비율 설정 완료`);
      }
    }, 100);

    // 첫 렌더링에만 자동 맞춤, 이후에는 스크롤 위치 유지
    if (isFirstRenderRef.current) {
      chart.timeScale().fitContent();
      isFirstRenderRef.current = false;
    } else if (savedVisibleLogicalRangeRef.current) {
      // 이전에 저장된 논리적 범위 복원 (바 인덱스 기반)
      try {
        chart
          .timeScale()
          .setVisibleLogicalRange(savedVisibleLogicalRangeRef.current);
      } catch (e) {
        // 복원 실패 시 fitContent 호출
        console.warn('논리적 범위 복원 실패:', e);
        chart.timeScale().fitContent();
      }
    }

    // 통합 툴팁 (RSI 값 + 필터링 사유 + 크로스오버 + 다이버전스)
    if (rsiSeries) {
      chart.subscribeCrosshairMove((param) => {
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
        }> = [];

        // RSI 값 가져오기
        if (param.seriesData.has(rsiSeries)) {
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
                    if (signal.direction === 'bullish') {
                      divergenceInfos.push({
                        type: signal.type,
                        direction: 'bullish',
                        analysis: `가격은 하락하는 반면 ${signal.type.toUpperCase()}는 상승하고 있습니다. 이는 매도 압력이 약해지고 있음을 나타내며, 곧 상승 반전할 가능성이 있습니다. 매수 진입을 고려할 수 있는 시점입니다.`,
                      });
                    } else {
                      divergenceInfos.push({
                        type: signal.type,
                        direction: 'bearish',
                        analysis: `가격은 상승하는 반면 ${signal.type.toUpperCase()}는 하락하고 있습니다. 이는 매수 압력이 약해지고 있음을 의미하며, 하락 반전 가능성이 있습니다. 매도 또는 익절을 고려하세요.`,
                      });
                    }
                  }
                  // break 제거 - 모든 다이버전스를 찾기 위해
                }
              }
            }
          }
        }

        // 툴팁 표시 조건: RSI, 필터링, 크로스오버, 다이버전스 중 하나라도 있으면 표시
        if (
          rsiValue !== null ||
          filterReason !== null ||
          crossoverInfo !== null ||
          divergenceInfos.length > 0
        ) {
          setTooltip({
            x: param.point.x,
            y: param.point.y,
            rsi: rsiValue,
            filterReason,
            crossover: crossoverInfo,
            divergences: divergenceInfos,
          });
        } else {
          setTooltip(null);
        }
      });
    }

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 클린업
    return () => {
      // 현재 보이는 논리적 범위 저장 (다음 렌더링에서 복원하기 위해)
      try {
        const logicalRange = chart.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          savedVisibleLogicalRangeRef.current = {
            from: logicalRange.from,
            to: logicalRange.to,
          };
        }
      } catch (e) {
        console.warn('논리적 범위 저장 실패:', e);
      }

      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [
    data,
    rsiData,
    obvData,
    emaData,
    divergenceSignals,
    trendAnalysis,
    crossoverEvents,
  ]);

  return (
    <div className='w-full relative'>
      {/* 추세 인디케이터 (좌측 상단) */}
      {trendAnalysis && (
        <div className='absolute top-4 left-4 z-10 flex gap-2'>
          {trendAnalysis.trend === 'bullish' && (
            <div className='backdrop-blur-md bg-lime-500/20 text-lime-400 border border-lime-400/50 px-3 py-1 rounded-lg text-sm font-medium shadow-lg shadow-lime-500/10'>
              ↑ 상승 추세
            </div>
          )}
          {trendAnalysis.trend === 'bearish' && (
            <div className='backdrop-blur-md bg-orange-500/20 text-orange-400 border border-orange-400/50 px-3 py-1 rounded-lg text-sm font-medium shadow-lg shadow-orange-500/10'>
              ↓ 하락 추세
            </div>
          )}
          {trendAnalysis.trend === 'neutral' && (
            <div className='backdrop-blur-md bg-gray-500/20 text-gray-300 border border-gray-400/50 px-3 py-1 rounded-lg text-sm font-medium shadow-lg shadow-gray-500/10'>
              → 중립
            </div>
          )}
          {trendAnalysis.crossover === 'golden_cross' && (
            <div className='backdrop-blur-md bg-lime-500/20 text-lime-400 border border-lime-400/50 px-3 py-1 rounded-lg text-sm font-medium shadow-lg shadow-lime-500/10'>
              🟢 골든크로스
            </div>
          )}
          {trendAnalysis.crossover === 'dead_cross' && (
            <div className='backdrop-blur-md bg-orange-500/20 text-orange-400 border border-orange-400/50 px-3 py-1 rounded-lg text-sm font-medium shadow-lg shadow-orange-500/10'>
              🟠 데드크로스
            </div>
          )}
        </div>
      )}
      <div
        ref={chartContainerRef}
        className='rounded-xl overflow-hidden shadow-inner'
      />

      {/* 통합 툴팁 (RSI + 필터링 정보 + 크로스오버 + 다이버전스) */}
      {tooltip && (
        <ChartTooltip
          x={tooltip.x}
          y={tooltip.y}
          rsi={tooltip.rsi}
          filterReason={tooltip.filterReason}
          crossover={tooltip.crossover}
          divergences={tooltip.divergences}
        />
      )}
    </div>
  );
}
