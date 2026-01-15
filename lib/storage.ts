/**
 * localStorage 유틸리티
 * SSR 안전성, 에러 핸들링, 데이터 정리 기능 제공
 */

/**
 * SSR 환경인지 확인
 */
export const isServer = typeof window === 'undefined';

/**
 * localStorage에서 JSON 데이터 로드
 * @param key - 저장소 키
 * @param defaultValue - 기본값
 * @param cleanup - 선택적 데이터 정리 함수
 */
export function loadFromStorage<T>(
  key: string,
  defaultValue: T,
  cleanup?: (data: T) => T
): T {
  if (isServer) return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    let data: T = JSON.parse(stored);
    if (cleanup) {
      data = cleanup(data);
    }
    return data;
  } catch {
    return defaultValue;
  }
}

/**
 * localStorage에 JSON 데이터 저장
 * @param key - 저장소 키
 * @param data - 저장할 데이터
 * @param cleanup - 선택적 데이터 정리 함수 (저장 전 실행)
 */
export function saveToStorage<T>(
  key: string,
  data: T,
  cleanup?: (data: T) => T
): void {
  if (isServer) return;

  try {
    const toSave = cleanup ? cleanup(data) : data;
    localStorage.setItem(key, JSON.stringify(toSave));
  } catch {
    // localStorage 용량 초과 등 에러 무시
  }
}

/**
 * localStorage에서 항목 삭제
 * @param key - 저장소 키
 */
export function removeFromStorage(key: string): void {
  if (isServer) return;

  try {
    localStorage.removeItem(key);
  } catch {
    // 에러 무시
  }
}

/**
 * 타임스탬프 기반 레코드 정리 (TTL 적용)
 * @param data - Record<string, number> 형태의 타임스탬프 맵
 * @param ttlMs - 유효 기간 (밀리초)
 */
export function cleanupTimestampRecord(
  data: Record<string, number>,
  ttlMs: number
): Record<string, number> {
  const now = Date.now();
  const cleaned: Record<string, number> = {};

  for (const [key, timestamp] of Object.entries(data)) {
    if (now - timestamp < ttlMs) {
      cleaned[key] = timestamp;
    }
  }

  return cleaned;
}

/**
 * 배열 항목 정리 (TTL 적용)
 * @param items - timestamp 필드를 가진 배열
 * @param ttlMs - 유효 기간 (밀리초)
 */
export function cleanupArrayByTimestamp<T extends { timestamp: number }>(
  items: T[],
  ttlMs: number
): T[] {
  const now = Date.now();
  return items.filter(item => now - item.timestamp < ttlMs);
}

/**
 * 스토리지 매니저 팩토리
 * 특정 키에 대한 load/save/remove 메서드를 제공하는 객체 생성
 */
export function createStorageManager<T>(
  key: string,
  defaultValue: T,
  options?: {
    loadCleanup?: (data: T) => T;
    saveCleanup?: (data: T) => T;
  }
) {
  return {
    load: () => loadFromStorage(key, defaultValue, options?.loadCleanup),
    save: (data: T) => saveToStorage(key, data, options?.saveCleanup),
    remove: () => removeFromStorage(key),
  };
}
