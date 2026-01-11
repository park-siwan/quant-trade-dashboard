/**
 * 타임프레임 관련 유틸리티 (중앙 집중화)
 */

export const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/**
 * 타임프레임을 분 단위로 변환
 */
export function timeframeToMinutes(timeframe: string): number {
  const value = parseInt(timeframe.slice(0, -1));
  const unit = timeframe.slice(-1);
  switch (unit) {
    case 'm': return value;
    case 'h': return value * 60;
    case 'd': return value * 24 * 60;
    case 'w': return value * 7 * 24 * 60;
    default: return value;
  }
}

/**
 * 타임프레임을 밀리초 단위로 변환
 */
export function timeframeToMs(timeframe: string): number {
  return timeframeToMinutes(timeframe) * 60 * 1000;
}

/**
 * 타임프레임을 초 단위로 변환
 */
export function timeframeToSeconds(timeframe: string): number {
  return timeframeToMinutes(timeframe) * 60;
}

/**
 * 타임프레임을 Bybit WebSocket 형식으로 변환
 * Bybit 형식: 1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, W, M
 */
export function timeframeToBybit(timeframe: string): string {
  const map: Record<string, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
  };
  return map[timeframe] || '5';
}

/**
 * 폴링 간격 (밀리초) - 타임프레임에 맞춘 간격
 */
export function getRefreshInterval(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
  };
  return map[timeframe] || 300_000;
}

/**
 * 다음 캔들 종료 시간 (밀리초 타임스탬프)
 */
export function getNextCandleClose(timeframe: string): number {
  const now = Date.now();
  const interval = timeframeToMs(timeframe);
  const currentCandleStart = Math.floor(now / interval) * interval;
  return currentCandleStart + interval;
}

/**
 * 다음 캔들 종료까지 남은 초
 */
export function getSecondsUntilClose(timeframe: string): number {
  const nextClose = getNextCandleClose(timeframe);
  return Math.max(0, Math.floor((nextClose - Date.now()) / 1000));
}

/**
 * 분을 "X일 X시간 X분" 형식으로 변환
 */
export function formatMinutesToDuration(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}일`);
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);

  return parts.length > 0 ? parts.join(' ') : '0분';
}

/**
 * 캔들 개수와 타임프레임으로 시간 범위 문자열 생성
 */
export function calculateTimeRange(candleCount: number, timeframe: string): string {
  const totalMinutes = candleCount * timeframeToMinutes(timeframe);
  if (totalMinutes < 60) return `${totalMinutes}분`;
  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
  return remainingHours > 0 ? `${days}일 ${remainingHours}시간` : `${days}일`;
}

/**
 * 다이버전스 유효기간 (캔들 수 기준)
 */
export const DIVERGENCE_EXPIRY_CANDLES: Record<string, number> = {
  '5m': 24,
  '15m': 24,
  '30m': 48,
  '1h': 72,
  '4h': 42,
  '1d': 14,
};
