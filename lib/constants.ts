/**
 * 애플리케이션 전역 상수
 * 타이밍, 설정값 등 하드코딩된 매직넘버 중앙 관리
 */

// ============================================
// 트레이딩 정책 (백엔드 constants.ts와 동일하게 유지)
// ============================================
export const TRADING = {
  /** 고정 레버리지 (0 = auto Comfort-Kelly) */
  FIXED_LEVERAGE: 20,
  CONSEC_LOSSES: 3,
  TARGET_DD: 0.20,
} as const;

// ============================================
// 애니메이션 타이밍 (ms)
// ============================================
export const ANIMATION = {
  // 숫자 슬롯 애니메이션
  DIGIT_SPIN: 400,
  COLOR_FADE: 500,
  VALUE_INTERPOLATE: 300,

  // 셀/UI 업데이트 애니메이션
  CELL_UPDATE: 500,
  TICKER_SCROLL: 400,

  // 캔들 카운트다운
  COUNTDOWN_INTERVAL: 1000,
} as const;

// ============================================
// WebSocket 설정
// ============================================
export const WEBSOCKET = {
  // 업데이트 쓰로틀
  THROTTLE_MS: 500, // UI 업데이트 주기

  // 재연결 설정
  RECONNECT_DELAY: 5000, // 재연결 대기 시간

  // 동기화 설정
  SYNC_INTERVAL: 10, // N캔들마다 전체 동기화

  // 캔들 퍼지 매칭 허용 범위 (초)
  FUZZY_MATCH_SECONDS: 300, // 5분봉 기준
} as const;

// ============================================
// API 설정
// ============================================
export const API = {
  // 타임아웃
  REQUEST_TIMEOUT: 10000, // 10초

  // 캔들 조회 제한
  DEFAULT_CANDLE_LIMIT: 1000,

  // 폴링 기본 주기
  DEFAULT_POLLING_INTERVAL: 5000,

  // 오더북 갱신 주기
  ORDERBOOK_REFRESH: 5000,
} as const;

// ============================================
// TTS/알림 설정
// ============================================
export const TTS = {
  // 중복 방지 (같은 소리)
  DEDUP_WINDOW: 3000, // 3초 이내 같은 소리 스킵

  // 오래된 기록 정리
  CLEANUP_THRESHOLD: 10000, // 10초 이상 지난 기록 삭제

  // 큐 제한
  MAX_QUEUE_SIZE: 3, // 최대 큐 크기 (초과 시 오래된 것 버림)

  // 잠자기 복귀 후 큐 클리어 기준
  SLEEP_THRESHOLD: 30000, // 30초 이상 숨겨졌다 돌아오면 큐 클리어
} as const;

// ============================================
// 실시간 신호 설정
// ============================================
export const SIGNAL = {
  // 오래된 신호 무시 (절전 복귀 등)
  MAX_AGE_MS: 60000, // 1분 이상 된 신호는 무시

  // 잠자기 복귀 기준
  SLEEP_THRESHOLD: 30000, // 30초 이상 숨겨졌다 돌아오면 히스토리 클리어

  // 신호 히스토리 최대 개수
  MAX_HISTORY: 50,
} as const;

// ============================================
// UI 설정
// ============================================
export const UI = {
  // 알림 기록 최대 개수
  MAX_ALERT_HISTORY: 50,

  // 중복 알림 무시 시간
  DUPLICATE_ALERT_WINDOW: 30000, // 30초

  // 재알림 주기
  REMINDER_INTERVAL: 300000, // 5분
} as const;

// ============================================
// 차트 설정
// ============================================
export const CHART = {
  // 다이버전스 표시
  DIVERGENCE_LOOKBACK_CANDLES: 10,

  // 패널 비율
  MAIN_PANE_RATIO: 4,
  INDICATOR_PANE_RATIO: 1,

  // 마커 크기
  MARKER_SIZE_ARROW: 0.5, // 화살표 마커 크기 (0.5 미만시 삼각형으로 변형됨)
  MARKER_SIZE_CIRCLE: 0.1, // 원형 마커 크기
  MARKER_CIRCLE_OPACITY: 0.2, // 원형 마커 투명도
  SPACER_SIZE: 1.5, // 투명 스페이서 크기
} as const;

// ============================================
// 포맷팅 임계값
// ============================================
export const FORMAT = {
  THOUSAND: 1000,
  MILLION: 1000000,
} as const;
