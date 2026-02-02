// Strategy Parameter Types and Utilities
// JSON Single Source of Truth: API에서 기본값 로드, 정적 값은 fallback

import { getCachedStrategyDefaults } from './backtest-api';

// ===== 공통 파라미터 타입 =====
export interface CommonParams {
  tpAtr?: number;  // Take Profit ATR 배수
  slAtr?: number;  // Stop Loss ATR 배수
}

// ===== RSI Divergence 파라미터 =====
export interface RsiDivergenceParams extends CommonParams {
  rsiPeriod?: number;  // RSI 계산 기간
  pivotLeft?: number;  // 좌측 피봇 바 수
  pivotRight?: number;  // 우측 피봇 바 수
  minDistance?: number;  // 피봇 간 최소 거리
  maxDistance?: number;  // 피봇 간 최대 거리
  minRsiDiff?: number;  // 최소 RSI 차이
  rsiOversold?: number;  // RSI 과매도 기준
  rsiOverbought?: number;  // RSI 과매수 기준
  regimeFilter?: number;  // 마켓 레짐 필터 (0=OFF, 1=ON)
  volumeConfirm?: number;  // 볼륨 확인 필터 (0=OFF, 1=ON)
}

// ===== BB Reversion 파라미터 =====
export interface BbReversionParams extends CommonParams {
  lookback?: number;  // Z-Score 계산 기간
  entryZ?: number;  // 진입 Z-Score 임계값
  exitZ?: number;  // 청산 Z-Score 임계값
  stopZ?: number;  // 손절 Z-Score 임계값
  volFilter?: number;  // 변동성 필터 (0=OFF, 1=ON)
  volThreshold?: number;  // 변동성 임계값 (ATR 배수)
  rsiConfirm?: number;  // RSI 확인 필터 (0=OFF, 1=ON)
}

// ===== EMA ADX 파라미터 =====
export interface EmaAdxParams extends CommonParams {
  smaPeriod?: number;  // 추세 확인 SMA 기간
  atrPeriod?: number;  // ATR 계산 기간
  compressionMult?: number;  // 변동성 압축 배수
  breakoutPeriod?: number;  // 브레이크아웃 확인 기간
  rocPeriod?: number;  // ROC 계산 기간
  rocThreshold?: number;  // ROC 임계값 (%)
}

// ===== 통합 파라미터 타입 =====
export type StrategyParams = RsiDivergenceParams | BbReversionParams | EmaAdxParams;

// ===== snake_case → camelCase 변환 매핑 =====
export const snakeToCamelMap: Record<string, string> = {
  'tp_atr': 'tpAtr',
  'sl_atr': 'slAtr',
  'rsi_period': 'rsiPeriod',
  'pivot_left': 'pivotLeft',
  'pivot_right': 'pivotRight',
  'min_distance': 'minDistance',
  'max_distance': 'maxDistance',
  'min_rsi_diff': 'minRsiDiff',
  'rsi_oversold': 'rsiOversold',
  'rsi_overbought': 'rsiOverbought',
  'regime_filter': 'regimeFilter',
  'volume_confirm': 'volumeConfirm',
  'lookback': 'lookback',
  'entry_z': 'entryZ',
  'exit_z': 'exitZ',
  'stop_z': 'stopZ',
  'vol_filter': 'volFilter',
  'vol_threshold': 'volThreshold',
  'rsi_confirm': 'rsiConfirm',
  'sma_period': 'smaPeriod',
  'atr_period': 'atrPeriod',
  'compression_mult': 'compressionMult',
  'breakout_period': 'breakoutPeriod',
  'roc_period': 'rocPeriod',
  'roc_threshold': 'rocThreshold',
  // Trend Reversal Combo 파라미터
  'volume_mult': 'volumeMult',
  'adx_threshold': 'adxThreshold',
  'cooldown_bars': 'cooldownBars',
  // v6: bb_reversion 추세 필터 파라미터
  'block_in_trend': 'blockInTrend',
  'adx_trend_threshold': 'adxTrendThreshold',
  'use_ema_trend_filter': 'useEmaTrendFilter',
  'ema_period': 'emaPeriod',
  'ema_distance_pct': 'emaDistancePct',
  'use_volume_confirm': 'useVolumeConfirm',
  'low_vol_entry_z': 'lowVolEntryZ',
  'high_vol_entry_z': 'highVolEntryZ',
  'use_stoch_confirm': 'useStochConfirm',
  'stoch_threshold': 'stochThreshold',
  'use_rsi_confirm': 'useRsiConfirm',
  'rsi_threshold': 'rsiThreshold',
  'use_mini_sideways': 'useMiniSideways',
  'bb_bandwidth_threshold': 'bbBandwidthThreshold',
  'use_channel_detection': 'useChannelDetection',
  'channel_r2_threshold': 'channelR2Threshold',
  'channel_only_mode': 'channelOnlyMode',
  // HMM Orchestrator v2 파라미터
  'bb_lookback': 'bbLookback',
  'bb_volume_mult': 'bbVolumeMult',
};

// ===== camelCase → snake_case 변환 매핑 =====
export const camelToSnakeMap: Record<string, string> = {
  'tpAtr': 'tp_atr',
  'slAtr': 'sl_atr',
  'rsiPeriod': 'rsi_period',
  'pivotLeft': 'pivot_left',
  'pivotRight': 'pivot_right',
  'minDistance': 'min_distance',
  'maxDistance': 'max_distance',
  'minRsiDiff': 'min_rsi_diff',
  'rsiOversold': 'rsi_oversold',
  'rsiOverbought': 'rsi_overbought',
  'regimeFilter': 'regime_filter',
  'volumeConfirm': 'volume_confirm',
  'lookback': 'lookback',
  'entryZ': 'entry_z',
  'exitZ': 'exit_z',
  'stopZ': 'stop_z',
  'volFilter': 'vol_filter',
  'volThreshold': 'vol_threshold',
  'rsiConfirm': 'rsi_confirm',
  'smaPeriod': 'sma_period',
  'atrPeriod': 'atr_period',
  'compressionMult': 'compression_mult',
  'breakoutPeriod': 'breakout_period',
  'rocPeriod': 'roc_period',
  'rocThreshold': 'roc_threshold',
  // Trend Reversal Combo 파라미터
  'volumeMult': 'volume_mult',
  'adxThreshold': 'adx_threshold',
  'cooldownBars': 'cooldown_bars',
  // v6: bb_reversion 추세 필터 파라미터
  'blockInTrend': 'block_in_trend',
  'adxTrendThreshold': 'adx_trend_threshold',
  'useEmaTrendFilter': 'use_ema_trend_filter',
  'emaPeriod': 'ema_period',
  'emaDistancePct': 'ema_distance_pct',
  'useVolumeConfirm': 'use_volume_confirm',
  'lowVolEntryZ': 'low_vol_entry_z',
  'highVolEntryZ': 'high_vol_entry_z',
  'useStochConfirm': 'use_stoch_confirm',
  'stochThreshold': 'stoch_threshold',
  'useRsiConfirm': 'use_rsi_confirm',
  'rsiThreshold': 'rsi_threshold',
  'useMiniSideways': 'use_mini_sideways',
  'bbBandwidthThreshold': 'bb_bandwidth_threshold',
  'useChannelDetection': 'use_channel_detection',
  'channelR2Threshold': 'channel_r2_threshold',
  'channelOnlyMode': 'channel_only_mode',
  // HMM Orchestrator v2 파라미터
  'bbLookback': 'bb_lookback',
  'bbVolumeMult': 'bb_volume_mult',
};

// ===== 전략별 기본값 =====
export const RsiDivergenceDefaults: Record<string, number> = {
  tpAtr: 2.5,
  slAtr: 1.5,
  rsiPeriod: 14,
  pivotLeft: 5,
  pivotRight: 2,
  minDistance: 8,
  maxDistance: 60,
  minRsiDiff: 3.0,
  rsiOversold: 30,
  rsiOverbought: 70,
  regimeFilter: 0,
  volumeConfirm: 0,
};

export const BbReversionDefaults: Record<string, number> = {
  tpAtr: 1.7,
  slAtr: 3.5,
  lookback: 20,
  entryZ: 1.5,
  exitZ: 0.25,
  stopZ: 2.5,
  volFilter: 0,
  volThreshold: 1.5,
  rsiConfirm: 0,
  // v6: 추세 필터 파라미터
  blockInTrend: 1,
  adxTrendThreshold: 20,
  useEmaTrendFilter: 0,
  emaPeriod: 20,
  emaDistancePct: 1.0,
  useVolumeConfirm: 1,
  volumeMult: 0.8,
  cooldownBars: 10,
  lowVolEntryZ: 1.5,
  highVolEntryZ: 2.5,
  useStochConfirm: 0,
  stochThreshold: 25,
  useRsiConfirm: 0,
  rsiThreshold: 35,
  useMiniSideways: 0,
  bbBandwidthThreshold: 0.03,
  useChannelDetection: 0,
  channelR2Threshold: 0.6,
  channelOnlyMode: 0,
};

export const EmaAdxDefaults: Record<string, number> = {
  tpAtr: 2.5,
  slAtr: 1.5,
  volumeConfirm: 0,
  smaPeriod: 50,
  atrPeriod: 14,
  compressionMult: 0.8,
  breakoutPeriod: 10,
  rocPeriod: 5,
  rocThreshold: 1.0,
};

// ===== 학술 기반 새 전략 기본값 =====

// 레짐 적응형 전략 (Regime Adaptive)
export const HybridRegimeDefaults: Record<string, number> = {
  tpAtr: 2.0,
  slAtr: 1.5,
};

// 다중 지표 확인 전략 (Multi-Indicator Confirmation)
export const StochRsiDefaults: Record<string, number> = {
  tpAtr: 1.5,
  slAtr: 2.0,
};

// 추세+역추세 콤보 전략 (Trend Reversal Combo) - 레거시
export const TrendReversalComboDefaults: Record<string, number> = {
  tpAtr: 1.7,
  slAtr: 3.5,
  volumeMult: 1.5,
  adxThreshold: 25,
  cooldownBars: 5,
  breakoutPeriod: 20,
  volumeConfirm: 1,
};

// HMM Orchestrator 전략 v2 (콤보 + 평균회귀)
export const HmmOrchestratorDefaults: Record<string, number> = {
  // 브레이크아웃 (추세장) - 콤보 동일
  breakoutPeriod: 20,
  volumeMult: 1.5,
  breakoutVolumeMult: 1.5,  // volumeMult alias
  adxThreshold: 25,
  // RSI 다이버전스 (횡보장) - 콤보 동일
  pivotLeft: 5,
  pivotRight: 1,
  rsiPeriod: 14,
  rsiOversold: 35,
  rsiOverbought: 65,
  minRsiDiff: 3,
  minDistance: 5,
  maxDistance: 100,
  // 평균회귀 (횡보장 추가)
  bbLookback: 20,
  lowVolEntryZ: 1.5,
  highVolEntryZ: 2.5,
  exitZ: 0.25,  // 평균회귀 청산 Z-Score
  bbVolumeMult: 0.8,
  // 공통
  cooldownBars: 5,
  tpAtr: 1.7,
  slAtr: 3.5,
};

// ===== 변환 유틸리티 함수 =====

/**
 * API 응답 파라미터 (snake_case) → 프론트엔드 파라미터 (camelCase) 변환
 */
export function convertApiParams(apiParams: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [snakeKey, value] of Object.entries(apiParams)) {
    const camelKey = snakeToCamelMap[snakeKey] || snakeKey;
    result[camelKey] = value;
  }
  return result;
}

/**
 * 프론트엔드 파라미터 (camelCase) → API 요청 파라미터 (snake_case) 변환
 */
export function convertToApiParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [camelKey, value] of Object.entries(params)) {
    const snakeKey = camelToSnakeMap[camelKey] || camelKey;
    result[snakeKey] = value;
  }
  return result;
}

/**
 * 전략별 기본값 가져오기 (JSON Single Source of Truth)
 * 1순위: API 캐시에서 로드된 값
 * 2순위: 정적 fallback (앱 시작 전 또는 API 오류 시)
 */
export function getDefaultParams(strategy: string): Record<string, number> {
  // 1순위: API 캐시에서 로드
  const cached = getCachedStrategyDefaults(strategy);
  if (Object.keys(cached).length > 0) {
    // snake_case → camelCase 변환
    const converted = convertApiParams(cached) as Record<string, number>;
    return converted;
  }

  // 2순위: 정적 fallback (API 로드 전 또는 오류 시)
  switch (strategy) {
    case 'rsi_divergence':
    case 'rsi_div':
      return { ...RsiDivergenceDefaults };
    case 'z_score':
      return { ...BbReversionDefaults };
    case 'vol_breakout':
      return { ...EmaAdxDefaults };
    case 'ml_hmm':
      return { ...HybridRegimeDefaults };
    case 'stoch_rsi':
      return { ...StochRsiDefaults };
    case 'trend_reversal_combo':
      return { ...TrendReversalComboDefaults };
    case 'hmm_orchestrator':
      return { ...HmmOrchestratorDefaults };
    default:
      return { ...RsiDivergenceDefaults };
  }
}