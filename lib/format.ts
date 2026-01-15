/**
 * 포맷팅 유틸리티 함수
 * 숫자, 가격, 시간 등의 포맷팅
 */

/**
 * 가격 포맷 (K, M 단위 변환)
 */
export function formatPrice(price: number, decimals = 1): string {
  if (price >= 1000000) return `${(price / 1000000).toFixed(decimals)}M`;
  if (price >= 1000) return `${(price / 1000).toFixed(decimals)}K`;
  return price.toFixed(decimals);
}

/**
 * 달러 가격 포맷
 */
export function formatUSD(value: number, decimals = 2): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * 퍼센트 포맷
 */
export function formatPercent(value: number, decimals = 2, showSign = true): string {
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * 큰 숫자 포맷 (K, M 단위)
 */
export function formatLargeNumber(value: number, decimals = 1): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(decimals)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(decimals)}K`;
  return value.toFixed(0);
}

/**
 * 볼륨 포맷
 */
export function formatVolume(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
}

/**
 * RSI 포맷
 */
export function formatRSI(value: number): string {
  return value.toFixed(1);
}

/**
 * 시간 범위 포맷 (분 → 일/시간/분)
 */
export function formatTimeRange(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}일`);
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}분`);

  return parts.join(' ');
}

/**
 * 롱/숏 비율 포맷
 */
export function formatRatio(longRatio: number, shortRatio: number): string {
  return `${(longRatio * 100).toFixed(0)}:${(shortRatio * 100).toFixed(0)}`;
}
