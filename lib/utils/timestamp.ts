/**
 * 타임스탬프 유틸리티 모듈
 * 모든 시간 처리를 중앙화하여 초/밀리초 혼동 방지
 * lightweight-charts는 초 단위 Unix timestamp 사용
 */

export const TIMESTAMP_UNIT = {
  SECONDS: 'seconds',
  MILLISECONDS: 'milliseconds',
} as const;

/**
 * 다양한 형식의 타임스탬프를 초 단위로 통일
 * @param timestamp - ISO 문자열, 밀리초 또는 초 단위 숫자
 * @returns 초 단위 Unix timestamp
 */
export function toSeconds(timestamp: number | string): number {
  if (typeof timestamp === 'string') {
    // ISO 문자열 → 초 (Z가 없으면 UTC로 간주)
    const utcStr = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
    return Math.floor(new Date(utcStr).getTime() / 1000);
  }
  // 숫자: 밀리초/초 자동 감지
  // 2001년 이후 초 단위: ~978307200 (약 10자리)
  // 밀리초 단위: ~978307200000 (약 13자리)
  if (timestamp > 1e12) {
    return Math.floor(timestamp / 1000); // 밀리초 → 초
  }
  return Math.floor(timestamp); // 이미 초 단위
}

/**
 * 초 단위 timestamp를 KST 문자열로 변환 (간략 형식)
 * @param timestampSeconds - 초 단위 Unix timestamp
 * @returns "MM/DD HH:mm" 형식
 */
export function formatKST(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * 초 단위 timestamp를 KST 문자열로 변환 (전체 형식)
 * @param timestampSeconds - 초 단위 Unix timestamp
 * @returns "YYYY/MM/DD HH:mm:ss" 형식
 */
export function formatKSTFull(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * 타임프레임 문자열을 초 단위로 변환
 */
export const TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '8h': 28800,
  '12h': 43200,
  '1d': 86400,
};

/**
 * 타임프레임을 초 단위로 변환
 * @param timeframe - "5m", "1h" 등
 * @returns 초 단위 (기본값: 300초 = 5분)
 */
export function getTimeframeSeconds(timeframe: string): number {
  return TIMEFRAME_SECONDS[timeframe] || 300;
}
