/**
 * 개발 환경 전용 디버그 유틸리티
 * 프로덕션에서는 자동으로 비활성화됨
 */

const isDev = process.env.NODE_ENV === 'development';

// 디버그 카테고리 (필요에 따라 개별 활성화 가능)
const DEBUG_CATEGORIES = {
  socket: false,      // WebSocket 연결 로그
  divergence: false,  // 다이버전스 분석 로그
  chart: false,       // 차트 렌더링 로그
  alert: false,       // 알림 시스템 로그
  tts: false,         // TTS 로그
} as const;

type DebugCategory = keyof typeof DEBUG_CATEGORIES;

// 개발 환경에서만 로그 출력
function createLogger(category: DebugCategory) {
  return (...args: unknown[]) => {
    if (isDev && DEBUG_CATEGORIES[category]) {
      console.log(`[${category.toUpperCase()}]`, ...args);
    }
  };
}

// 카테고리별 로거
export const debug = {
  socket: createLogger('socket'),
  divergence: createLogger('divergence'),
  chart: createLogger('chart'),
  alert: createLogger('alert'),
  tts: createLogger('tts'),
};

// 항상 출력되는 경고/에러 (프로덕션 포함)
export const warn = (...args: unknown[]) => {
  console.warn(...args);
};

export const error = (...args: unknown[]) => {
  console.error(...args);
};

// 개발 환경에서만 출력되는 일회성 로그
export const devLog = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args);
  }
};
