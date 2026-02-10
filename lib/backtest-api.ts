const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============== 전략 타입 ==============
// 전략 목록은 서버(StrategyConfigService)가 Single Source of Truth
// fetchAllStrategyDefaults() 또는 fetchStrategyPreviews()로 동적 로드
export type StrategyType = string;

// 서버에서 로드된 전략 목록 (preloadStrategyDefaults 호출 후 사용 가능)
export function getActiveStrategyIds(): string[] {
  if (_strategyDefaultsCache) {
    return Array.from(_strategyDefaultsCache.keys());
  }
  return [];
}

export interface BacktestParams {
  strategy?: StrategyType;
  symbol: string;
  timeframe: string;
  candleCount: number;
  indicators?: string[];
  // RSI Divergence 파라미터
  rsiPeriod?: number;
  pivotLeftBars?: number;
  pivotRightBars?: number;
  minDistance?: number;
  maxDistance?: number;
  takeProfitAtr?: number;
  stopLossAtr?: number;
  initialCapital?: number;
  positionSizePercent?: number;
  slippage?: number;  // 슬리피지 (0.02% = 0.0002)
  minDivergencePct?: number;  // 최소 다이버전스 강도 (%)
  // 필터 파라미터 (최적화 결과에서 가져옴)
  trendFilter?: string;
  volatilityFilter?: string;
  rsiExtremeFilter?: string;
  indicatorPreset?: string;
  // BB Reversion 파라미터
  lookback?: number;
  entryZ?: number;
  exitZ?: number;
  stopZ?: number;
  volFilter?: number;
  volThreshold?: number;
  rsiConfirm?: number;
  // v6: BB Reversion 추세 필터 파라미터
  blockInTrend?: number;
  adxTrendThreshold?: number;
  useEmaTrendFilter?: number;
  emaPeriod?: number;
  emaDistancePct?: number;
  useVolumeConfirm?: number;
  lowVolEntryZ?: number;
  highVolEntryZ?: number;
  useStochConfirm?: number;
  stochThreshold?: number;
  useRsiConfirm?: number;
  rsiThreshold?: number;
  useMiniSideways?: number;
  bbBandwidthThreshold?: number;
  useChannelDetection?: number;
  channelR2Threshold?: number;
  channelOnlyMode?: number;
  // EMA+ADX (Momentum Breakout) 파라미터
  smaPeriod?: number;
  atrPeriod?: number;
  compressionMult?: number;
  breakoutPeriod?: number;
  rocPeriod?: number;
  rocThreshold?: number;
  volumeConfirm?: number;
  // Trend Reversal Combo 파라미터
  volumeMult?: number;
  adxThreshold?: number;
  cooldownBars?: number;
  // HMM Orchestrator 파라미터
  bbLookback?: number;
  bbVolumeMult?: number;
  breakoutVolumeMult?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
  minRsiDiff?: number;
  pivotLeft?: number;
  pivotRight?: number;
  tpAtr?: number;
  slAtr?: number;
  // 리얼타임 차트용: 캐시 대신 API에서 데이터 가져오기
  useLiveData?: boolean;
}

export interface TradeResult {
  entryTime: string;
  exitTime: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  indicator: string;
  divergenceStrength: number;
  exitReason?: 'TP' | 'SL';  // 청산 사유
  signalType?: 'default' | 'breakout' | 'divergence' | 'mean_reversion';
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdown: number;
}

export interface SkippedSignal {
  time: string;
  direction: 'long' | 'short';
  price: number;
  reason: 'fee';  // 수수료 커버 불가로 스킵
  expectedReturn: number;  // 기대 수익률 (%)
  totalCost: number;  // 총 비용 (%)
  tp: number;  // 예상 익절가
  sl: number;  // 예상 손절가
}

// 열린 포지션 (아직 청산되지 않은)
export interface SignalInfo {
  signalType: 'default' | 'breakout' | 'divergence' | 'mean_reversion';
  signalCount: string;   // "1x", "2x" etc
  strength: number;      // divergence strength %
  regime: string;        // "Bullish" | "Sideways" | "Bearish" | "N/A"
  atr: number;           // ATR at entry
  tpAtr: number;         // TP ATR multiplier
  slAtr: number;         // SL ATR multiplier
}

export interface OpenPosition {
  entryTime: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  tp: number;
  sl: number;
  size: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  signalInfo?: SignalInfo;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  totalCandles: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  trades: TradeResult[];
  equityCurve: EquityPoint[];
  skippedSignals?: SkippedSignal[];  // 수수료 때문에 스킵된 신호
  openPosition?: OpenPosition | null;  // 열린 포지션 (청산 안 된)
}

export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  // 30초 타임아웃 설정 (5000 캔들 백테스트는 시간이 걸릴 수 있음)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${API_BASE}/backtest/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Backtest failed');
    }

    return response.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Backtest timeout: 서버 응답이 너무 느립니다');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkBacktestHealth(): Promise<{ valid: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/backtest/health`);
  return response.json();
}

export async function getTimeframes(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/backtest/timeframes`);
  return response.json();
}

// ============== Strategy Defaults API (JSON Single Source of Truth) ==============

export interface StrategyDefaultsResult {
  strategy: string;
  displayName?: string;
  params: Record<string, any>;
}

// 캐시 (API 호출 최소화)
let _strategyDefaultsCache: Map<string, StrategyDefaultsResult> | null = null;
let _allDefaultsCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

/**
 * 단일 전략 기본값 가져오기 (API에서 로드)
 */
export async function fetchStrategyDefaults(strategy: string): Promise<StrategyDefaultsResult | null> {
  try {
    // 캐시 확인
    if (_strategyDefaultsCache && _strategyDefaultsCache.has(strategy)) {
      return _strategyDefaultsCache.get(strategy)!;
    }

    const response = await fetch(`${API_BASE}/backtest/strategy/defaults/${strategy}`);
    if (!response.ok) return null;

    const data = await response.json();

    // 캐시 저장
    if (!_strategyDefaultsCache) _strategyDefaultsCache = new Map();
    _strategyDefaultsCache.set(strategy, data);

    return data;
  } catch (err) {
    console.error(`Failed to fetch strategy defaults for ${strategy}:`, err);
    return null;
  }
}

/**
 * 모든 전략 기본값 가져오기 (API에서 로드)
 */
export async function fetchAllStrategyDefaults(): Promise<StrategyDefaultsResult[]> {
  try {
    // 캐시 확인
    if (_strategyDefaultsCache && _allDefaultsCacheTime > Date.now() - CACHE_TTL) {
      return Array.from(_strategyDefaultsCache.values());
    }

    const response = await fetch(`${API_BASE}/backtest/strategy/defaults`);
    if (!response.ok) return [];

    const data: StrategyDefaultsResult[] = await response.json();

    // 캐시 저장
    _strategyDefaultsCache = new Map();
    for (const item of data) {
      _strategyDefaultsCache.set(item.strategy, item);
    }
    _allDefaultsCacheTime = Date.now();

    return data;
  } catch (err) {
    console.error('Failed to fetch all strategy defaults:', err);
    return [];
  }
}

/**
 * 전략 기본값 캐시 초기화 (앱 시작시 호출)
 */
export async function preloadStrategyDefaults(): Promise<void> {
  await fetchAllStrategyDefaults();
}

/**
 * 모든 전략 미리보기 가져오기 (백엔드에서 JSON 기본값으로 백테스트)
 * 프론트엔드에서 파라미터 구성 불필요 - race condition 없음
 */
export interface StrategyPreview {
  strategy: string;
  displayName: string;
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
  sharpeRatio: number;
  openPosition?: OpenPosition | null;
}

export async function fetchStrategyPreviews(
  symbol: string = 'BTCUSDT',
  timeframe: string = '5m',
  candleCount: number = 5000,
): Promise<StrategyPreview[]> {
  try {
    const response = await fetch(
      `${API_BASE}/backtest/strategy/previews?symbol=${symbol}&timeframe=${timeframe}&candleCount=${candleCount}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch strategy previews:', err);
    return [];
  }
}

/**
 * 연도별 Sharpe Ratio 결과
 */
export interface YearlySharpeResult {
  strategy: string;
  displayName: string;
  yearlySharpe: Record<string, number | null>;  // { "2023": -0.5, "2024": 1.2, ... }
  avgSharpe: number;
}

/**
 * 연도별 Sharpe Ratio 가져오기
 * 데이터는 Python 스크립트로 미리 계산됨:
 *   python scripts/calc_yearly_sharpe.py --symbol BTCUSDT --timeframe 5m
 */
export async function fetchYearlySharpe(
  symbol: string = 'BTCUSDT',
  timeframe: string = '5m',
): Promise<YearlySharpeResult[]> {
  try {
    const response = await fetch(
      `${API_BASE}/backtest/strategy/yearly-sharpe?symbol=${symbol}&timeframe=${timeframe}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch yearly Sharpe:', err);
    return [];
  }
}

/**
 * 캐시된 전략 기본값 가져오기 (동기, 캐시가 없으면 빈 객체)
 */
export function getCachedStrategyDefaults(strategy: string): Record<string, any> {
  if (_strategyDefaultsCache && _strategyDefaultsCache.has(strategy)) {
    return _strategyDefaultsCache.get(strategy)!.params;
  }
  return {};
}

/**
 * 캐시된 전략 표시 이름 가져오기 (JSON Single Source of Truth)
 * 마이그레이션은 서버(StrategyConfigService.migrateId)가 처리
 */
export function getCachedStrategyDisplayName(strategy: string): string {
  if (_strategyDefaultsCache && _strategyDefaultsCache.has(strategy)) {
    return _strategyDefaultsCache.get(strategy)!.displayName || strategy;
  }
  return strategy;
}

// 최적화 관련 타입
export interface OptimizeParams {
  symbol: string;
  timeframe: string;
  candleCount?: number;  // 레거시 지원
  // 날짜 기반 데이터 범위 (캐시 연동)
  startDate?: string;    // YYYY-MM-DD (예: 2025-01-01)
  endDate?: string;      // YYYY-MM-DD (예: 2025-09-30)
  year?: number;         // 단일 연도 지정 (startDate/endDate 대신 사용 가능)
  indicators?: string[];
  initialCapital?: number;
  positionSizePercent?: number;
  metric?: 'sharpe' | 'profit' | 'winrate' | 'profitfactor';
  topResults?: number;
  // 파라미터 탐색 범위 설정 (그리드/베이지안 공통)
  pivotLeftRange?: number[];     // 예: [3, 5, 7]
  pivotRightRange?: number[];    // 예: [2, 3, 4]
  rsiPeriodRange?: number[];     // 예: [10, 14, 21]
  minDistanceRange?: number[];   // 예: [5, 10, 15]
  maxDistanceRange?: number[];   // 예: [100, 150, 200]
  tpAtrRange?: number[];         // 예: [1.5, 2.0, 2.5, 3.0]
  slAtrRange?: number[];         // 예: [0.5, 1.0, 1.5]
  minDivPctRange?: number[];     // 예: [10, 20, 30, 40]
  // 추가 필터 (고정 사용)
  useTrendFilter?: boolean;      // EMA 트렌드 필터
  trendEmaPeriod?: number;       // EMA 기간 (기본: 50)
  useVolatilityFilter?: boolean; // ATR 변동성 필터
  useRsiExtremeFilter?: boolean; // RSI 극단값 필터
  rsiOversold?: number;          // RSI 과매도 (기본: 30)
  rsiOverbought?: number;        // RSI 과매수 (기본: 70)
  // 필터/지표 파라미터 탐색 모드 (Optuna가 최적 조합 탐색)
  searchFilters?: boolean;       // 필터 조합을 파라미터로 탐색
  searchIndicators?: boolean;    // 지표 조합을 파라미터로 탐색
  minTrades?: number;            // 최소 거래 수 (기본: 50)
  // Out-of-Sample 검증
  useOosValidation?: boolean;    // OOS 검증 사용
  oosRatio?: number;             // 검증 데이터 비율 (기본: 30%)
}

export interface OptimizeResultItem {
  params: {
    rsi_period: number;
    pivot_left: number;
    pivot_right: number;
    min_distance: number;
    max_distance: number;
    tp_atr: number;
    sl_atr: number;
    min_div_pct?: number;  // 최소 다이버전스 강도 (%)
    // 필터/지표 파라미터 (탐색 모드에서만)
    trend_filter?: string;      // 'OFF', 'EMA20', 'EMA50', 'EMA100'
    volatility_filter?: string; // 'OFF', 'ATR_AVG', 'ATR_AVG_1_5'
    rsi_extreme_filter?: string; // 'OFF', 'RSI_30_70', 'RSI_25_75', 'RSI_20_80'
    indicator_preset?: string;  // 'A', 'B', 'C', 'D', 'E', 'F'
  };
  result: {
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
    flipCount?: number;  // 갈아타기 횟수
  };
}

export interface OptimizeResult {
  totalCombinations: number;
  validResults: number;
  metric: string;
  topResults: OptimizeResultItem[];
}

export async function runOptimization(params: OptimizeParams): Promise<OptimizeResult> {
  const response = await fetch(`${API_BASE}/backtest/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Optimization failed');
  }

  return response.json();
}

export interface OptimizeProgress {
  type: 'progress' | 'status' | 'complete' | 'error';
  current?: number;
  total?: number;
  percent?: number;
  elapsed?: number;
  remaining?: number;
  message?: string;
  best?: OptimizeResultItem;
  result?: OptimizeResult;
}

export async function runOptimizationWithProgress(
  params: OptimizeParams,
  onProgress: (progress: OptimizeProgress) => void,
): Promise<OptimizeResult> {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/backtest/optimize/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(response => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        reject(new Error('No reader available'));
        return;
      }

      let buffer = '';

      const read = (): void => {
        reader.read().then(({ done, value }) => {
          if (done) {
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: OptimizeProgress = JSON.parse(line.substring(6));
                onProgress(data);

                if (data.type === 'complete' && data.result) {
                  resolve(data.result);
                } else if (data.type === 'error') {
                  reject(new Error(data.message || 'Optimization failed'));
                }
              } catch {
                // ignore parse errors
              }
            }
          }

          read();
        }).catch(reject);
      };

      read();
    }).catch(reject);
  });
}

// 베이지안 최적화 파라미터
export interface BayesianOptimizeParams extends OptimizeParams {
  nTrials?: number;
  usePriorResults?: boolean;
  // pivotLeftRange, pivotRightRange는 OptimizeParams에서 상속
}

// 베이지안 최적화 결과
export interface BayesianOptimizeResult extends OptimizeResult {
  totalTrials: number;
  elapsed: number;
  method: 'bayesian';
}

/**
 * 베이지안 최적화 (Optuna) 실행 - SSE 스트리밍
 */
export async function runBayesianOptimization(
  params: BayesianOptimizeParams,
  onProgress: (progress: OptimizeProgress) => void,
): Promise<BayesianOptimizeResult> {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/backtest/optimize/bayesian`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(response => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        reject(new Error('No reader available'));
        return;
      }

      let buffer = '';

      const read = (): void => {
        reader.read().then(({ done, value }) => {
          if (done) {
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: OptimizeProgress = JSON.parse(line.substring(6));
                onProgress(data);

                if (data.type === 'complete' && data.result) {
                  resolve(data.result as BayesianOptimizeResult);
                } else if (data.type === 'error') {
                  reject(new Error(data.message || 'Bayesian optimization failed'));
                }
              } catch {
                // ignore parse errors
              }
            }
          }

          read();
        }).catch(reject);
      };

      read();
    }).catch(reject);
  });
}

// ============== 저장된 결과 관리 API ==============

export interface SavedOptimizeResult {
  id: number;
  createdAt: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  startDate?: string;
  endDate?: string;
  indicators: string;
  metric: string;
  optimizeMethod: 'grid' | 'bayesian';
  strategy?: StrategyType; // 전략 타입
  // RSI Divergence 파라미터
  rsiPeriod: number;
  pivotLeft: number;
  pivotRight: number;
  minDistance: number;
  maxDistance: number;
  tpAtr: number;
  slAtr: number;
  minDivPct?: number;
  trendFilter?: string;
  volatilityFilter?: string;
  rsiExtremeFilter?: string;
  indicatorPreset?: string;
  // BB Reversion 파라미터
  lookback?: number;
  entryZ?: number;
  exitZ?: number;
  stopZ?: number;
  volFilter?: number;      // 변동성 필터 (0=OFF, 1=ON)
  volThreshold?: number;   // 변동성 임계값
  rsiConfirm?: number;     // RSI 확인 필터 (0=OFF, 1=ON)
  // v6: BB Reversion 추세 필터 파라미터
  blockInTrend?: number;           // 추세 시 거래 차단 (0=OFF, 1=ON)
  adxTrendThreshold?: number;      // ADX 추세 임계값
  useEmaTrendFilter?: number;      // EMA 추세 필터 (0=OFF, 1=ON)
  emaPeriod?: number;              // EMA 기간
  emaDistancePct?: number;         // EMA 거리 임계값 (%)
  useVolumeConfirm?: number;       // 볼륨 확인 (0=OFF, 1=ON)
  lowVolEntryZ?: number;           // 저변동성 진입 Z-Score
  highVolEntryZ?: number;          // 고변동성 진입 Z-Score
  useStochConfirm?: number;        // 스토캐스틱 확인 (0=OFF, 1=ON)
  stochThreshold?: number;         // 스토캐스틱 임계값
  useRsiConfirm?: number;          // RSI 확인 v6 (0=OFF, 1=ON)
  rsiThreshold?: number;           // RSI 임계값
  useMiniSideways?: number;        // 미니횡보 감지 (0=OFF, 1=ON)
  bbBandwidthThreshold?: number;   // BB 밴드폭 임계값
  useChannelDetection?: number;    // 채널 감지 (0=OFF, 1=ON)
  channelR2Threshold?: number;     // 채널 R² 임계값
  channelOnlyMode?: number;        // 채널 전용 모드 (0=OFF, 1=ON)
  // EMA+ADX (Momentum Breakout) 파라미터
  smaPeriod?: number;
  atrPeriod?: number;
  compressionMult?: number;
  breakoutPeriod?: number;
  rocPeriod?: number;
  rocThreshold?: number;
  volumeConfirm?: number;  // 볼륨 확인 필터 (0=OFF, 1=ON)
  // Trend Reversal Combo 파라미터
  adxThreshold?: number;   // ADX 임계값 (추세/횡보 판단)
  volumeMult?: number;     // 볼륨 배수
  cooldownBars?: number;   // 쿨다운 바 수
  // HMM Orchestrator 파라미터
  bbLookback?: number;           // BB 룩백 기간
  bbVolumeMult?: number;         // BB 볼륨 배수
  breakoutVolumeMult?: number;   // 브레이크아웃 볼륨 배수
  rsiOversold?: number;          // RSI 과매도 임계값
  rsiOverbought?: number;        // RSI 과매수 임계값
  minRsiDiff?: number;           // 최소 RSI 차이
  // 공통 결과
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  flipCount?: number;
  rank: number;
  note?: string;
}

export interface SaveOptimizeRequest {
  symbol: string;
  timeframe: string;
  candleCount?: number;  // 레거시 지원
  startDate?: string;    // YYYY-MM-DD (날짜 기반)
  endDate?: string;      // YYYY-MM-DD
  indicators: string[];
  metric: string;
  optimizeMethod: 'grid' | 'bayesian';
  params: OptimizeResultItem['params'];
  result: OptimizeResultItem['result'];
  rank: number;
  note?: string;
}

export interface SaveMultipleRequest {
  symbol: string;
  timeframe: string;
  candleCount?: number;  // 레거시 지원
  startDate?: string;    // YYYY-MM-DD (날짜 기반)
  endDate?: string;      // YYYY-MM-DD
  indicators: string[];
  metric: string;
  optimizeMethod: 'grid' | 'bayesian';
  results: OptimizeResultItem[];
}

export interface OptimizeStats {
  totalCount: number;
  avgSharpe: number;
  avgProfit: number;
  bestSharpe: number;
  bestProfit: number;
}

/**
 * 최적화 결과 저장 (단일)
 */
export async function saveOptimizeResult(dto: SaveOptimizeRequest): Promise<SavedOptimizeResult> {
  const response = await fetch(`${API_BASE}/backtest/optimize/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Save failed');
  }

  return response.json();
}

/**
 * 최적화 결과 저장 (여러 개)
 */
export async function saveMultipleOptimizeResults(dto: SaveMultipleRequest): Promise<SavedOptimizeResult[]> {
  const response = await fetch(`${API_BASE}/backtest/optimize/save-multiple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Save failed');
  }

  return response.json();
}

/**
 * 저장된 결과 조회 (전체)
 */
export async function getSavedResults(limit = 100, offset = 0): Promise<SavedOptimizeResult[]> {
  const response = await fetch(
    `${API_BASE}/backtest/optimize/saved?limit=${limit}&offset=${offset}`
  );
  return response.json();
}

/**
 * 저장된 결과 조회 (심볼/타임프레임별)
 */
export async function getSavedResultsByFilter(
  symbol: string,
  timeframe: string,
  limit = 50
): Promise<SavedOptimizeResult[]> {
  const response = await fetch(
    `${API_BASE}/backtest/optimize/saved/filter?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`
  );
  return response.json();
}

/**
 * 최고 성과 조회
 */
export async function getTopSavedResults(
  metric: 'sharpe' | 'profit' = 'sharpe',
  limit = 10
): Promise<SavedOptimizeResult[]> {
  const response = await fetch(
    `${API_BASE}/backtest/optimize/saved/top?metric=${metric}&limit=${limit}`
  );
  return response.json();
}

/**
 * 통계 정보 조회
 */
export async function getOptimizeStats(): Promise<OptimizeStats> {
  const response = await fetch(`${API_BASE}/backtest/optimize/saved/stats`);
  return response.json();
}

/**
 * 결과 삭제 (단일)
 */
export async function deleteSavedResult(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/backtest/optimize/saved/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Delete failed');
  }
}

/**
 * 결과 삭제 (여러 개)
 */
export async function deleteMultipleSavedResults(ids: number[]): Promise<{ deletedCount: number }> {
  const response = await fetch(`${API_BASE}/backtest/optimize/saved/delete-multiple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Delete failed');
  }

  return response.json();
}

/**
 * 메모 업데이트
 */
export async function updateResultNote(id: number, note: string): Promise<void> {
  const response = await fetch(`${API_BASE}/backtest/optimize/saved/${id}/note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Update failed');
  }
}

// ============== 백테스트 결과 저장 API ==============

export interface SavedBacktestSummary {
  id: number;
  createdAt: string;
  name: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  startDate: string;
  endDate: string;
  rsiPeriod: number;
  pivotLeft: number;
  pivotRight: number;
  minDistance: number;
  maxDistance: number;
  tpAtr: number;
  slAtr: number;
  initialCapital: number;
  positionSizePercent: number;
  indicators: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  note?: string;
}

export interface SavedBacktestFull extends SavedBacktestSummary {
  trades: TradeResult[];
  equityCurve: EquityPoint[];
}

export interface SaveBacktestRequest {
  name?: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  startDate: string;
  endDate: string;
  params: {
    rsiPeriod: number;
    pivotLeftBars: number;
    pivotRightBars: number;
    minDistance: number;
    maxDistance: number;
    takeProfitAtr: number;
    stopLossAtr: number;
    initialCapital: number;
    positionSizePercent: number;
    indicators: string[];
  };
  result: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnl: number;
    totalPnlPercent: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    trades: TradeResult[];
    equityCurve: EquityPoint[];
  };
  note?: string;
}

/**
 * 백테스트 결과 저장
 */
export async function saveBacktestResult(dto: SaveBacktestRequest): Promise<SavedBacktestSummary> {
  const response = await fetch(`${API_BASE}/backtest/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Save failed');
  }

  return response.json();
}

/**
 * 저장된 백테스트 목록 조회
 */
export async function getSavedBacktests(limit = 50, offset = 0): Promise<SavedBacktestSummary[]> {
  const response = await fetch(
    `${API_BASE}/backtest/saved?limit=${limit}&offset=${offset}`
  );
  return response.json();
}

/**
 * 저장된 백테스트 상세 조회
 */
export async function getSavedBacktestById(id: number): Promise<SavedBacktestFull> {
  const response = await fetch(`${API_BASE}/backtest/saved/${id}`);
  if (!response.ok) {
    throw new Error('Backtest not found');
  }
  return response.json();
}

/**
 * 저장된 백테스트 삭제
 */
export async function deleteSavedBacktest(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/backtest/saved/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Delete failed');
  }
}

/**
 * 백테스트 이름 변경
 */
export async function updateBacktestName(id: number, name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/backtest/saved/${id}/name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Update failed');
  }
}

// ============== 데이터 캐시 관리 API ==============

export interface CacheItem {
  symbol: string;
  timeframe: string;
  year: number;
  candleCount: number;
  oiCount: number;
  lastUpdated: string;
}

export interface CacheStatus {
  cached: CacheItem[];
  symbols: string[];
  timeframes: string[];
}

export interface CacheDownloadProgress {
  type: 'status' | 'complete' | 'error';
  message?: string;
}

/**
 * 캐시 상태 조회
 */
export async function getCacheStatus(): Promise<CacheStatus> {
  const response = await fetch(`${API_BASE}/backtest/cache/status`);
  if (!response.ok) {
    throw new Error('Failed to get cache status');
  }
  return response.json();
}

/**
 * 데이터 다운로드 (SSE 스트리밍)
 */
export async function downloadCacheData(
  symbol: string,
  timeframe: string,
  year: number,
  force: boolean,
  onProgress: (data: CacheDownloadProgress) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/backtest/cache/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, timeframe, year, force }),
  });

  if (!response.ok) {
    throw new Error('Failed to start download');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise((resolve, reject) => {
    const read = (): void => {
      reader.read().then(({ done, value }) => {
        if (done) {
          resolve();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: CacheDownloadProgress = JSON.parse(line.substring(6));
              onProgress(data);

              if (data.type === 'complete') {
                resolve();
                return;
              } else if (data.type === 'error') {
                reject(new Error(data.message || 'Download failed'));
                return;
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        read();
      }).catch(reject);
    };

    read();
  });
}

/**
 * 캐시 삭제
 */
export async function deleteCache(
  symbol: string,
  timeframe: string,
  year: number,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE}/backtest/cache/${symbol}/${timeframe}/${year}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Delete failed');
  }

  return response.json();
}

// ============== 롤링 최적화 (Walk-Forward Analysis) ==============

export type DegradationGrade = 'ROBUST' | 'GOOD' | 'WARNING' | 'OVERFIT';

export interface RollingOptimizeParams {
  strategy?: StrategyType;  // 전략 선택
  symbol: string;
  timeframe: string;
  trainCandles?: number;  // 학습 윈도우 (기본 5000)
  testCandles?: number;   // 테스트 윈도우 (기본 1000)
  stepCandles?: number;   // 롤링 스텝 (기본 1000)
  year?: string;          // 연도
  startDate?: string;
  endDate?: string;
  indicators?: string[];
  nTrials?: number;       // Optuna 트라이얼 수
  metric?: string;
  // RSI Divergence 파라미터 범위
  pivotLeftRange?: number[];
  pivotRightRange?: number[];
  rsiPeriodRange?: number[];
  minDistanceRange?: number[];
  maxDistanceRange?: number[];
  tpAtrRange?: number[];
  slAtrRange?: number[];
  minDivPctRange?: number[];
  searchFilters?: boolean;
  initialCapital?: number;
  positionSizePercent?: number;
}

export interface RollingWindowResult {
  windowId: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  bestParams: Record<string, number | string>;
  trainSharpe: number;
  trainTrades: number;
  trainWinRate: number;
  trainPnl: number;
  testSharpe: number;
  testTrades: number;
  testWinRate: number;
  testPnl: number;
}

export interface RollingSummary {
  totalWindows: number;
  avgTrainSharpe: number;
  avgTestSharpe: number;
  degradationRatio: number;
  totalTrades: number;
  totalPnl: number;
  overallSharpe: number;
  paramStability: number;
  bestWindowId: number;
  worstWindowId: number;
  degradationGrade: DegradationGrade;
  degradationDescription: string;
}

export interface RollingOptimizeResult {
  windows: RollingWindowResult[];
  summary: RollingSummary;
}

export interface RollingProgress {
  type: 'status' | 'progress' | 'final' | 'error';
  message?: string;
  windowId?: number;
  trainSharpe?: number;
  testSharpe?: number;
  testTrades?: number;
  testWinRate?: number;
  testPnl?: number;
  params?: Record<string, number | string>;
  windows?: RollingWindowResult[];
  summary?: RollingSummary;
}

/**
 * 롤링 최적화 (Walk-Forward Analysis) 실행 - SSE 스트리밍
 */
export async function runRollingOptimization(
  params: RollingOptimizeParams,
  onProgress: (progress: RollingProgress) => void,
): Promise<RollingOptimizeResult> {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/backtest/optimize/rolling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(response => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        reject(new Error('No reader available'));
        return;
      }

      let buffer = '';

      const read = (): void => {
        reader.read().then(({ done, value }) => {
          if (done) {
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: RollingProgress = JSON.parse(line.substring(6));
                onProgress(data);

                if (data.type === 'final' && data.windows && data.summary) {
                  resolve({ windows: data.windows, summary: data.summary });
                } else if (data.type === 'error') {
                  reject(new Error(data.message || 'Rolling optimization failed'));
                }
              } catch {
                // ignore parse errors
              }
            }
          }

          read();
        }).catch(reject);
      };

      read();
    }).catch(reject);
  });
}

/**
 * Degradation Ratio 해석
 */
export function getDegradationInterpretation(ratio: number): {
  grade: DegradationGrade;
  description: string;
  emoji: string;
  color: string;
} {
  // 기준 완화: 실전에서는 50% 이상이면 양호한 편
  // 헤지펀드 기준 Sharpe 1~2가 우수, 테스트에서 절반 이상 유지되면 OK
  if (ratio >= 0.5) {
    return {
      grade: 'ROBUST',
      description: '로버스트 - 과최적화 없음, 실전 적용 우수',
      emoji: '🟢',
      color: 'text-green-500',
    };
  } else if (ratio >= 0.25) {
    return {
      grade: 'GOOD',
      description: '양호 - 실전 적용 가능',
      emoji: '🟡',
      color: 'text-yellow-500',
    };
  } else if (ratio >= 0) {
    return {
      grade: 'WARNING',
      description: '주의 - 과최적화 의심, 신중히 검토',
      emoji: '🟠',
      color: 'text-orange-500',
    };
  } else if (ratio >= -0.5) {
    return {
      grade: 'OVERFIT',
      description: '과최적화 - 테스트 성과 역전',
      emoji: '🔴',
      color: 'text-red-500',
    };
  } else {
    return {
      grade: 'OVERFIT',
      description: '심각한 과최적화 - 실전 적용 불가',
      emoji: '🔴',
      color: 'text-red-500',
    };
  }
}

// ============== 현재 활성 파라미터 API ==============

export interface CurrentParams {
  params: Record<string, number | string>;
  optimizedAt: string;
  validUntil: string;
  trainSharpe: number;
  confidence: 'high' | 'medium' | 'low';
  degradationRatio: number;
  source?: 'rolling' | 'bayesian' | 'default';
}

/**
 * 현재 활성 파라미터 조회 (롤링 최적화 결과 기반)
 */
export async function getCurrentParams(
  symbol: string = 'BTCUSDT',
  timeframe: string = '5m',
): Promise<CurrentParams> {
  const response = await fetch(
    `${API_BASE}/backtest/strategy/current-params?symbol=${symbol}&timeframe=${timeframe}`,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get current params');
  }

  return response.json();
}

/**
 * 최적화 결과 DB에 저장
 */
export interface SaveOptimizationParams {
  symbol: string;
  timeframe: string;
  strategy: string;
  params: Record<string, unknown>;
  trainSharpe: number;
  testSharpe: number;
  degradationRatio: number;
  totalWindows: number;
}

export async function saveOptimizationResult(data: SaveOptimizationParams): Promise<void> {
  const response = await fetch(`${API_BASE}/backtest/strategy/save-params`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to save optimization result');
  }
}

/**
 * 롤링 최적화 저장 결과 목록 조회
 */
export interface RollingParamResult {
  id: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  params: Record<string, unknown>;
  trainSharpe: number;
  testSharpe: number;
  degradationRatio: number;
  savedAt: string;
  validUntil: string;
  isValid: boolean;
  source: 'rolling' | 'bayesian' | 'manual';
}

export async function getRollingParams(timeframe?: string): Promise<RollingParamResult[]> {
  const url = timeframe
    ? `${API_BASE}/backtest/strategy/rolling-params?timeframe=${timeframe}`
    : `${API_BASE}/backtest/strategy/rolling-params`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get rolling params');
  }

  return response.json();
}

// ============== Auto Optimization API ==============

export interface AutoOptimizeParams {
  symbol?: string;
  timeframe?: string;
  candleCount?: number;
  strategies?: string[];
}

export interface AutoOptimizeResult {
  success: boolean;
  results: Array<{
    strategy: string;
    bestSharpe: number;
    bestParams: Record<string, any>;
    updated: boolean;
  }>;
  duration: number;
}

/**
 * 자동 파라미터 최적화 트리거
 * 새 캔들 마감 시 호출하여 최적 파라미터 탐색 및 적용
 */
export async function triggerAutoOptimization(
  params: AutoOptimizeParams = {},
): Promise<AutoOptimizeResult> {
  try {
    const response = await fetch(`${API_BASE}/backtest/optimize/auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Auto optimization failed');
    }

    return response.json();
  } catch (err: any) {
    console.error('[AutoOptimize] Failed:', err);
    throw err;
  }
}

// ============== Strategy Optimization Panel (Propose → Approve/Reject) ==============

export interface OptimizationStatusItem {
  strategy: string;
  displayName: string;
  currentSharpe: number;
  lastOptimizedAt: string | null;
  currentParams: Record<string, any>;
}

export interface ProposeResult {
  strategy: string;
  displayName: string;
  current: {
    params: Record<string, any>;
    sharpeRatio: number;
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
    optimizedAt: string | null;
  };
  proposed: {
    params: Record<string, any>;
    sharpeRatio: number;
    totalTrades: number;
    winRate: number;
    totalPnlPercent: number;
  };
  improvement: {
    sharpeDelta: number;
    pnlDelta: number;
  };
  duration: number;
}

export interface ApplyResult {
  success: boolean;
  message: string;
  strategy: string;
  appliedParams: Record<string, any>;
  refreshed: boolean;
}

/** 전 전략 최적화 상태 조회 */
export async function fetchOptimizationStatus(): Promise<OptimizationStatusItem[]> {
  const res = await fetch(`${API_BASE}/backtest/optimize/status`);
  if (!res.ok) throw new Error('Failed to fetch optimization status');
  return res.json();
}

/** 단일 전략 최적화 제안 (JSON 미수정, 비교 결과 반환) */
export async function proposeOptimization(strategy: string): Promise<ProposeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10분 타임아웃 (Python 84일 그리드 서치)

  try {
    const res = await fetch(`${API_BASE}/backtest/optimize/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Optimization failed');
    }
    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Optimization timed out (10min)');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 승인된 파라미터 적용 (JSON 업데이트 + 캐시 갱신) */
export async function applyOptimization(
  strategy: string,
  params: Record<string, any>,
): Promise<ApplyResult> {
  const res = await fetch(`${API_BASE}/backtest/optimize/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy, params }),
  });
  if (!res.ok) throw new Error('Failed to apply optimization');
  return res.json();
}

// ============== Walk-Forward Optimization ==============

export interface WeeklyOptimizeRecord {
  id: number;
  strategy: string;
  symbol: string;
  timeframe: string;
  weekStart: string;
  weekEnd: string;
  params: Record<string, any>;
  sharpeRatio: number;
  winRate: number;
  totalPnlPercent: number;
  totalTrades: number;
  createdAt: string;
}

/**
 * 주차별 최적화 히스토리 조회
 */
export async function fetchWeeklyOptimizeHistory(
  strategy: string,
  symbol: string = 'BTCUSDT',
  timeframe: string = '5m',
  weeks: number = 12
): Promise<WeeklyOptimizeRecord[]> {
  const response = await fetch(
    `${API_BASE}/backtest/strategy/weekly-optimize-history?strategy=${strategy}&symbol=${symbol}&timeframe=${timeframe}&weeks=${weeks}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch weekly optimize history');
  }

  return response.json();
}

/**
 * Walk-Forward 백테스트 실행
 * 각 주마다 해당 주의 최적화된 파라미터로 백테스트 실행
 */
export async function runWalkForwardBacktest(
  strategy: string,
  symbol: string = 'BTCUSDT',
  timeframe: string = '5m',
  weeks: number = 12
): Promise<{
  weeklyResults: Array<{
    week: number;
    weekStart: string;
    weekEnd: string;
    params: Record<string, any>;
    sharpeRatio: number;
    trades: TradeResult[];
    equityCurve: EquityPoint[];
  }>;
  combinedEquityCurve: EquityPoint[];
}> {
  // 1. 주차별 최적화 히스토리 가져오기
  const weeklyHistory = await fetchWeeklyOptimizeHistory(strategy, symbol, timeframe, weeks);

  if (weeklyHistory.length === 0) {
    throw new Error('No weekly optimize history found');
  }

  // 2. 각 주에 대해 백테스트 실행
  const weeklyResults: Array<{
    week: number;
    weekStart: string;
    weekEnd: string;
    params: Record<string, any>;
    sharpeRatio: number;
    trades: TradeResult[];
    equityCurve: EquityPoint[];
  }> = [];

  let cumulativeEquity = 1000; // 초기 자본

  for (let i = 0; i < weeklyHistory.length; i++) {
    const weekRecord = weeklyHistory[i];

    // 해당 주의 파라미터로 백테스트 실행
    // candleCount를 주 단위로 제한 (5m 기준 1주 = 2016 캔들)
    const candlesPerWeek = timeframe === '5m' ? 2016 : timeframe === '15m' ? 672 : timeframe === '1h' ? 168 : 2016;

    const backtestResult = await runBacktest({
      symbol,
      timeframe,
      candleCount: candlesPerWeek,
      strategy: strategy as StrategyType,
      ...weekRecord.params,
    });

    // Equity curve를 누적 자본에 맞게 조정
    const adjustedEquityCurve = backtestResult.equityCurve.map((point, idx) => {
      if (idx === 0) {
        return { ...point, equity: cumulativeEquity };
      }
      const pnl = point.equity - 1000; // 원래 초기 자본 1000 기준
      return { ...point, equity: cumulativeEquity + pnl };
    });

    // 마지막 equity를 다음 주의 시작 자본으로
    if (adjustedEquityCurve.length > 0) {
      cumulativeEquity = adjustedEquityCurve[adjustedEquityCurve.length - 1].equity;
    }

    weeklyResults.push({
      week: i + 1,
      weekStart: weekRecord.weekStart,
      weekEnd: weekRecord.weekEnd,
      params: weekRecord.params,
      sharpeRatio: backtestResult.sharpeRatio,
      trades: backtestResult.trades,
      equityCurve: adjustedEquityCurve,
    });
  }

  // 3. 모든 주의 equity curve를 하나로 결합
  const combinedEquityCurve: EquityPoint[] = [];
  weeklyResults.forEach((weekResult) => {
    combinedEquityCurve.push(...weekResult.equityCurve);
  });

  return {
    weeklyResults,
    combinedEquityCurve,
  };
}

/**
 * 일별 Rolling Sharpe 타임라인 가져오기 (백엔드에서 계산)
 * WeeklySharpeTimeline 차트용 API
 */
export async function getDailyRollingSharpeTimeline(
  symbol: string = 'BTCUSDT',
  timeframe: string = '5m',
  weeks: number = 12,
  windowDays: number = 14,
): Promise<Array<{
  strategy: string;
  displayName: string;
  rollingSharpe: Array<{ timestamp: number; sharpe: number }>;
  equityCurve: Array<{ timestamp: number | string; equity: number }>;
  openPosition: OpenPosition | null;
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
  trades: TradeResult[];  // 마커 표시용 거래 내역
}>> {
  // 120초 타임아웃 설정 (6개 전략 × 12주 백테스트는 시간이 오래 걸림)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(
      `${API_BASE}/backtest/strategy/daily-rolling-sharpe?symbol=${symbol}&timeframe=${timeframe}&weeks=${weeks}&windowDays=${windowDays}`,
      { signal: controller.signal },
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch daily rolling sharpe: ${res.statusText}`);
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Rolling Sharpe 계산 타임아웃: 백엔드 계산이 너무 오래 걸립니다');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 단일 전략 캐시 갱신 (파라미터 변경 후 사용)
 * 전체 갱신 대비 CPU 부하 1/6
 */
export async function refreshSingleStrategy(
  symbol: string,
  timeframe: string,
  strategy: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(
      `${API_BASE}/backtest/rolling-sharpe/refresh-strategy?symbol=${symbol}&timeframe=${timeframe}&strategy=${strategy}`,
      { method: 'POST' },
    );
    return res.json();
  } catch (err) {
    console.error('Failed to refresh strategy:', err);
    return { success: false, message: 'Failed to refresh strategy' };
  }
}

/**
 * 전체 전략 캐시 강제 갱신
 * JSON 파라미터 변경 후 즉시 반영 필요 시 사용
 */
export async function refreshAllStrategies(
  symbol: string,
  timeframe: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(
      `${API_BASE}/backtest/rolling-sharpe/refresh?symbol=${symbol}&timeframe=${timeframe}`,
      { method: 'POST' },
    );
    return res.json();
  } catch (err) {
    console.error('Failed to refresh all strategies:', err);
    return { success: false, message: 'Failed to refresh all strategies' };
  }
}
