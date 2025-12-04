import { ApiResponse } from '@/lib/types/index';

const API_BASE_URL = 'http://localhost:3000';

interface FetchCandlesParams {
  symbol: string;
  timeframe: string;
  limit?: number;
}

export async function fetchCandles({
  symbol,
  timeframe,
  limit = 500,
}: FetchCandlesParams): Promise<ApiResponse> {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    limit: limit.toString(),
  });

  const response = await fetch(
    `${API_BASE_URL}/exchange/candles/analyze?${params}`
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}
