/**
 * 다이버전스 필터링 공통 정책
 * - 차트 렌더링 (indicators.ts)
 * - 알림 시스템 (useTradeAlert.ts)
 * - MTF 분석 (useMTFSocket.ts)
 * 모두 이 정책을 사용해야 함
 */

import { RSI } from './thresholds';

// timeframe.ts에서 재사용
export { DIVERGENCE_EXPIRY_CANDLES } from './timeframe';

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
    // bullish: RSI < 40 이어야 유효
    return rsiValue >= RSI.FILTER_LOW;
  } else {
    // bearish: RSI > 60 이어야 유효
    return rsiValue <= RSI.FILTER_HIGH;
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
