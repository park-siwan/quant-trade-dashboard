import { useQuery } from '@tanstack/react-query';
import { fetchLongShortRatio, LongShortRatioData } from '@/lib/api/exchange';

interface UseLongShortRatioParams {
  symbol?: string;
  period?: string;
  enabled?: boolean;
}

export interface LongShortRatio {
  longRatio: number; // 0~1 (예: 0.52 = 52% 롱)
  shortRatio: number; // 0~1 (예: 0.48 = 48% 숏)
  dominant: 'long' | 'short' | 'neutral'; // 우세한 쪽
  dominance: number; // 우세 정도 (0~0.5, 클수록 한쪽으로 치우침)
  timestamp: number;
}

export function useLongShortRatio({
  symbol = 'BTCUSDT',
  period = '1h',
  enabled = true,
}: UseLongShortRatioParams = {}) {
  const query = useQuery({
    queryKey: ['longShortRatio', symbol, period],
    queryFn: () => fetchLongShortRatio(symbol, period),
    refetchInterval: 60_000, // 1분마다 갱신
    staleTime: 30_000, // 30초 동안 fresh
    enabled,
  });

  // 데이터 가공
  const ratio: LongShortRatio | null = (() => {
    if (!query.data?.result?.list?.[0]) return null;

    const data = query.data.result.list[0];
    const longRatio = parseFloat(data.buyRatio);
    const shortRatio = parseFloat(data.sellRatio);

    // 우세한 쪽 판단
    const diff = longRatio - shortRatio;
    let dominant: 'long' | 'short' | 'neutral';
    if (diff > 0.02) {
      dominant = 'long';
    } else if (diff < -0.02) {
      dominant = 'short';
    } else {
      dominant = 'neutral';
    }

    return {
      longRatio,
      shortRatio,
      dominant,
      dominance: Math.abs(diff) / 2, // 0~0.5 범위로 정규화
      timestamp: parseInt(data.timestamp),
    };
  })();

  return {
    ...query,
    ratio,
  };
}
