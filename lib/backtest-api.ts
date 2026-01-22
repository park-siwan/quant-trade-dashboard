const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface BacktestParams {
  symbol: string;
  timeframe: string;
  candleCount: number;
  indicators?: string[];
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
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdown: number;
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
}

export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const response = await fetch(`${API_BASE}/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Backtest failed');
  }

  return response.json();
}

export async function checkBacktestHealth(): Promise<{ valid: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/backtest/health`);
  return response.json();
}

export async function getTimeframes(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/backtest/timeframes`);
  return response.json();
}

// 최적화 관련 타입
export interface OptimizeParams {
  symbol: string;
  timeframe: string;
  candleCount: number;
  indicators?: string[];
  initialCapital?: number;
  positionSizePercent?: number;
  metric?: 'sharpe' | 'profit' | 'winrate' | 'profitfactor';
  topResults?: number;
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
  indicators: string;
  metric: string;
  optimizeMethod: 'grid' | 'bayesian';
  rsiPeriod: number;
  pivotLeft: number;
  pivotRight: number;
  minDistance: number;
  maxDistance: number;
  tpAtr: number;
  slAtr: number;
  minDivPct?: number;
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
  candleCount: number;
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
  candleCount: number;
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
