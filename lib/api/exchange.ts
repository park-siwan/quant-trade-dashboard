import { ApiResponse } from '@/lib/types/index';

const API_BASE_URL = 'http://localhost:3000';
const BYBIT_API_URL = 'https://api.bybit.com';

interface FetchCandlesParams {
  symbol: string;
  timeframe: string;
  limit?: number;
}

export async function fetchCandles({
  symbol,
  timeframe,
  limit = 1000,
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

// Long/Short Ratio 타입
export interface LongShortRatioData {
  symbol: string;
  buyRatio: string; // 롱 비율 (0~1)
  sellRatio: string; // 숏 비율 (0~1)
  timestamp: string;
}

export interface LongShortRatioResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: LongShortRatioData[];
  };
}

// Bybit Long/Short Ratio API
export async function fetchLongShortRatio(
  symbol: string = 'BTCUSDT',
  period: string = '1h'
): Promise<LongShortRatioResponse> {
  const params = new URLSearchParams({
    category: 'linear',
    symbol: symbol.replace('/', '').toUpperCase(),
    period,
    limit: '1', // 최신 데이터 1개만
  });

  const response = await fetch(
    `${BYBIT_API_URL}/v5/market/account-ratio?${params}`
  );

  if (!response.ok) {
    throw new Error(`Bybit API 요청 실패: ${response.statusText}`);
  }

  return response.json();
}
