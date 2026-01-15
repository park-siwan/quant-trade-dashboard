/**
 * 다이버전스 필터링 공통 정책
 * - 차트 렌더링 (indicators.ts)
 * - 알림 시스템 (useTradeAlert.ts)
 * - MTF 분석 (useMTFSocket.ts)
 * 모두 이 정책을 사용해야 함
 */

// timeframe.ts에서 재사용
export { DIVERGENCE_EXPIRY_CANDLES } from './timeframe';

// RSI 필터링 임계값
export const RSI_FILTER_THRESHOLDS = {
  OVERSOLD: 40,    // bullish 다이버전스: RSI가 이 값 미만이어야 유효
  OVERBOUGHT: 60,  // bearish 다이버전스: RSI가 이 값 초과여야 유효
} as const;

/**
 * 다이버전스가 RSI 조건에 의해 필터링되어야 하는지 확인
 * @param direction - 다이버전스 방향 ('bullish' | 'bearish')
 * @param rsiValue - 다이버전스 발생 시점의 RSI 값
 * @returns true면 필터링됨 (신뢰도 낮음), false면 유효함
 */
export function shouldFilterDivergence(
  direction: 'bullish' | 'bearish',
  rsiValue: number | null | undefined
): boolean {
  if (rsiValue === null || rsiValue === undefined) {
    return false;
  }

  if (direction === 'bullish') {
    return rsiValue >= RSI_FILTER_THRESHOLDS.OVERSOLD;
  } else {
    return rsiValue <= RSI_FILTER_THRESHOLDS.OVERBOUGHT;
  }
}

/**
 * 다이버전스 타입별 우선순위
 * RSI가 가장 신뢰도 높음
 */
export const DIVERGENCE_TYPE_PRIORITY: Record<string, number> = {
  'rsi': 4,
  'cvd': 3,
  'obv': 2,
  'oi': 1,
};
