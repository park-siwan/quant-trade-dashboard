/**
 * Tailwind 클래스 유틸리티
 * 방향성(롱/숏) 기반 조건부 클래스 생성
 */

type Direction = 'long' | 'short' | 'bullish' | 'bearish' | 'up' | 'down' | boolean;

/**
 * 방향성을 boolean으로 정규화
 */
function isPositiveDirection(direction: Direction): boolean {
  if (typeof direction === 'boolean') return direction;
  return direction === 'long' || direction === 'bullish' || direction === 'up';
}

/**
 * 텍스트 색상 클래스
 */
export function directionText(direction: Direction, muted = false): string {
  const isPositive = isPositiveDirection(direction);
  if (muted) {
    return isPositive ? 'text-green-400/80' : 'text-red-400/80';
  }
  return isPositive ? 'text-green-400' : 'text-red-400';
}

/**
 * 배경 색상 클래스
 */
export function directionBg(direction: Direction, opacity: 10 | 20 | 30 = 20): string {
  const isPositive = isPositiveDirection(direction);
  return isPositive ? `bg-green-500/${opacity}` : `bg-red-500/${opacity}`;
}

/**
 * 테두리 색상 클래스
 */
export function directionBorder(direction: Direction, opacity: 30 | 50 = 30): string {
  const isPositive = isPositiveDirection(direction);
  return isPositive ? `border-green-500/${opacity}` : `border-red-500/${opacity}`;
}

/**
 * 텍스트 + 배경 조합 클래스
 */
export function directionTextBg(direction: Direction, bgOpacity: 10 | 20 | 30 = 20): string {
  return `${directionBg(direction, bgOpacity)} ${directionText(direction)}`;
}

/**
 * 전체 방향성 스타일 클래스 (텍스트 + 배경 + 테두리)
 */
export function directionFull(
  direction: Direction,
  options?: { bgOpacity?: 10 | 20 | 30; borderOpacity?: 30 | 50 }
): string {
  const { bgOpacity = 20, borderOpacity = 30 } = options || {};
  return `${directionText(direction)} ${directionBg(direction, bgOpacity)} ${directionBorder(direction, borderOpacity)}`;
}

/**
 * lime/red 색상 (다이버전스, 크로스오버용)
 */
export function signalText(direction: Direction): string {
  const isPositive = isPositiveDirection(direction);
  return isPositive ? 'text-lime-400' : 'text-red-400';
}

/**
 * 조건부 클래스 결합 유틸리티
 * falsy 값은 무시됨
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
