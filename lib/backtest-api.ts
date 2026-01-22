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
