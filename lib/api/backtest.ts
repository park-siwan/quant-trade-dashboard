import { API_CONFIG } from '@/lib/config';
import type { WalkForwardWindow, WalkForwardSummary, MonthlyParam, MonthlyParamsStats } from '@/lib/types';

export interface WalkForwardParams {
  symbol: string;
  timeframe: string;
  trainCandles?: number;
  testCandles?: number;
  strategy?: string;
  indicators?: string[];
}

export type WalkForwardEvent =
  | { type: 'status'; message: string }
  | { type: 'progress'; current: number; total: number; message: string }
  | { type: 'window'; data: WalkForwardWindow }
  | { type: 'summary'; data: WalkForwardSummary }
  | { type: 'complete'; message: string }
  | { type: 'error'; message: string };

/**
 * Walk-Forward 최적화 SSE 스트리밍
 * 백엔드에서 각 윈도우 결과를 실시간으로 전송
 */
export async function* streamWalkForward(
  params: WalkForwardParams
): AsyncGenerator<WalkForwardEvent> {
  const response = await fetch(`${API_CONFIG.BASE_URL}/backtest/optimize/rolling`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: params.symbol,
      timeframe: params.timeframe,
      trainCandles: params.trainCandles || 34560, // 4개월 (5분봉)
      testCandles: params.testCandles || 8640,   // 1개월 (5분봉)
      strategy: params.strategy || 'rsi_divergence',
      indicators: params.indicators || ['rsi'],
    }),
  });

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body reader를 생성할 수 없습니다');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data as WalkForwardEvent;
          } catch {
            // JSON 파싱 실패 시 무시
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 현재 저장된 Rolling 파라미터 목록 조회
 */
export async function fetchRollingParams(timeframe?: string) {
  const params = timeframe ? `?timeframe=${timeframe}` : '';
  const response = await fetch(
    `${API_CONFIG.BASE_URL}/backtest/strategy/rolling-params${params}`
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}

/**
 * 최적화 결과를 DB에 저장
 */
export async function saveRollingParams(data: {
  symbol: string;
  timeframe: string;
  strategy: string;
  params: Record<string, number>;
  trainSharpe: number;
  testSharpe: number;
  degradationRatio: number;
  totalWindows: number;
}) {
  const response = await fetch(
    `${API_CONFIG.BASE_URL}/backtest/strategy/save-params`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}

// ============== Monthly Params API ==============

/**
 * 월별 파라미터 조회
 */
export async function fetchMonthlyParams(
  symbol: string,
  timeframe: string
): Promise<MonthlyParam[]> {
  const response = await fetch(
    `${API_CONFIG.BASE_URL}/backtest/monthly-params?symbol=${symbol}&timeframe=${timeframe}`
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}

/**
 * 월별 파라미터 통계 조회
 */
export async function fetchMonthlyParamsStats(
  symbol: string,
  timeframe: string
): Promise<MonthlyParamsStats> {
  const response = await fetch(
    `${API_CONFIG.BASE_URL}/backtest/monthly-params/stats?symbol=${symbol}&timeframe=${timeframe}`
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}

/**
 * 사용 가능한 심볼/타임프레임 조합 조회
 */
export async function fetchMonthlyParamsPairs(): Promise<
  { symbol: string; timeframe: string; count: number }[]
> {
  const response = await fetch(
    `${API_CONFIG.BASE_URL}/backtest/monthly-params/pairs`
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}

/**
 * 월별 파라미터 저장
 */
export async function saveMonthlyParams(data: {
  symbol: string;
  timeframe: string;
  results: Array<{
    testMonth: string;
    trainStart: string;
    trainEnd: string;
    params: { pl: number; pr: number; tp: number; sl: number };
    trainSharpe: number;
    testSharpe: number;
    testPnlPct: number;
    trades: number;
  }>;
}): Promise<{ success: boolean; count: number }> {
  const response = await fetch(
    `${API_CONFIG.BASE_URL}/backtest/monthly-params/save`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}
