// 지원 심볼 목록
export interface SymbolInfo {
  id: string;       // 'BTCUSDT' - API/WebSocket용
  slug: string;     // 'btc' - URL용
  label: string;    // 'BTC' - 짧은 표시용
  name: string;     // 'Bitcoin' - 전체 이름
  slashFormat: string; // 'BTC/USDT' - REST API용
  decimals: number; // 가격 소수점 자릿수
}

export const SYMBOLS: SymbolInfo[] = [
  { id: 'BTCUSDT', slug: 'btc', label: 'BTC', name: 'Bitcoin', slashFormat: 'BTC/USDT', decimals: 1 },
  { id: 'ETHUSDT', slug: 'eth', label: 'ETH', name: 'Ethereum', slashFormat: 'ETH/USDT', decimals: 2 },
  { id: 'SOLUSDT', slug: 'sol', label: 'SOL', name: 'Solana', slashFormat: 'SOL/USDT', decimals: 2 },
  { id: 'XRPUSDT', slug: 'xrp', label: 'XRP', name: 'Ripple', slashFormat: 'XRP/USDT', decimals: 4 },
];

export const DEFAULT_SYMBOL = SYMBOLS[0];

/**
 * slug로 심볼 정보 가져오기
 * @param slug - 'btc', 'eth' 등
 */
export function getSymbolBySlug(slug: string): SymbolInfo | undefined {
  return SYMBOLS.find((s) => s.slug === slug.toLowerCase());
}

/**
 * id로 심볼 정보 가져오기
 * @param id - 'BTCUSDT', 'ETHUSDT' 등
 */
export function getSymbolById(id: string): SymbolInfo | undefined {
  return SYMBOLS.find((s) => s.id === id.toUpperCase());
}

/**
 * slashFormat으로 심볼 정보 가져오기
 * @param slashFormat - 'BTC/USDT', 'ETH/USDT' 등
 */
export function getSymbolBySlashFormat(slashFormat: string): SymbolInfo | undefined {
  return SYMBOLS.find((s) => s.slashFormat === slashFormat.toUpperCase());
}

/**
 * 심볼 ID를 소문자로 변환 (WebSocket URL용)
 * @param id - 'BTCUSDT' -> 'btcusdt'
 */
export function toLowerSymbol(id: string): string {
  return id.toLowerCase();
}

/**
 * 심볼을 슬래시 포맷으로 변환
 * @param id - 'BTCUSDT' -> 'BTC/USDT'
 */
export function toSlashFormat(id: string): string {
  const symbol = getSymbolById(id);
  return symbol?.slashFormat || `${id.slice(0, -4)}/${id.slice(-4)}`;
}
