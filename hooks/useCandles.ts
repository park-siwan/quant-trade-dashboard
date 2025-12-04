import { useQuery } from '@tanstack/react-query';
import { fetchCandles } from '@/lib/api/exchange';

interface UseCandlesParams {
  symbol: string;
  timeframe: string;
  limit?: number;
  enableAutoRefresh?: boolean;
}

// 타임프레임에 맞춘 폴링 간격
const getRefreshInterval = (timeframe: string) => {
  const map: Record<string, number> = {
    '1m': 60_000,      // 1분
    '5m': 300_000,     // 5분
    '15m': 900_000,    // 15분
    '1h': 3_600_000,   // 1시간
    '4h': 14_400_000,  // 4시간
    '1d': 86_400_000,  // 1일
  };
  return map[timeframe] || 300_000; // 기본값 5분
};

export function useCandles({
  symbol,
  timeframe,
  limit = 500,
  enableAutoRefresh = true,
}: UseCandlesParams) {
  return useQuery({
    queryKey: ['candles', symbol, timeframe, limit],
    queryFn: () => fetchCandles({ symbol, timeframe, limit }),
    refetchInterval: enableAutoRefresh ? getRefreshInterval(timeframe) : false,
    staleTime: 10_000, // 10초 동안 fresh
  });
}
