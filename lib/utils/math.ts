/**
 * 수학/통계 유틸리티 함수
 */

/**
 * 단순이동평균 (Simple Moving Average) 계산
 * @param data 숫자 배열
 * @param period 평균 기간
 * @returns SMA 값 배열
 */
export function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      // 초기 데이터는 가능한 범위로 평균
      const slice = data.slice(0, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

/**
 * 지수이동평균 (Exponential Moving Average) 계산
 * @param data 숫자 배열
 * @param period 평균 기간
 * @returns EMA 값 배열
 */
export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]);
    } else {
      result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
    }
  }
  return result;
}

/**
 * 배열의 최소/최대값 범위 계산
 * @param data 숫자 배열
 * @returns { min, max, range }
 */
export function getRange(data: number[]): { min: number; max: number; range: number } {
  const min = Math.min(...data);
  const max = Math.max(...data);
  return { min, max, range: max - min };
}

/**
 * 숫자를 지정된 범위로 클램프
 * @param value 입력값
 * @param min 최소값
 * @param max 최대값
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
