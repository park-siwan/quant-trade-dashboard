// 중앙화된 API 설정
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  BYBIT_API_URL: 'https://api.bybit.com',
} as const;

// 폴링 간격 설정
export const POLLING_INTERVALS = {
  LIQUIDATIONS: 3000,   // 3초
  WHALES: 5000,         // 5초
  FUNDING_RATE: 30000,  // 30초
  COINGLASS: 60000,     // 1분
  LONG_SHORT_RATIO: 60000, // 1분
} as const;
