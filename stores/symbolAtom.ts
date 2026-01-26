'use client';

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { SYMBOLS, DEFAULT_SYMBOL, getSymbolBySlug, SymbolInfo } from '@/lib/symbols';

// URL searchParams 대신 localStorage 사용 (SSR 호환성)
// Next.js App Router에서 URL 동기화는 useSearchParams로 별도 처리
export const symbolSlugAtom = atomWithStorage<string>('symbol', DEFAULT_SYMBOL.slug);

// 파생 atom: slug -> 전체 심볼 정보
export const symbolAtom = atom<SymbolInfo>((get) => {
  const slug = get(symbolSlugAtom);
  return getSymbolBySlug(slug) || DEFAULT_SYMBOL;
});

// 파생 atom: 심볼 ID (BTCUSDT)
export const symbolIdAtom = atom<string>((get) => {
  return get(symbolAtom).id;
});

// 파생 atom: 슬래시 포맷 (BTC/USDT)
export const symbolSlashAtom = atom<string>((get) => {
  return get(symbolAtom).slashFormat;
});

// 파생 atom: 소문자 (btcusdt) - WebSocket용
export const symbolLowerAtom = atom<string>((get) => {
  return get(symbolAtom).id.toLowerCase();
});

// 사용 가능한 심볼 목록
export const symbolListAtom = atom<SymbolInfo[]>(() => SYMBOLS);
