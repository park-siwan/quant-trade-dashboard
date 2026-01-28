'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useAtom, useAtomValue } from 'jotai';
import { symbolSlugAtom, symbolAtom, symbolListAtom } from '@/stores/symbolAtom';
import { usePrice } from '@/hooks/usePrice';
import { AnimatedPrice } from '@/components/shared';
import { useState, useRef, useEffect } from 'react';

const tabs = [
  { href: '/', label: '분석' },
  { href: '/chart', label: '차트' },
  { href: '/strategy', label: '전략' },
  { href: '/rolling', label: '롤링' },
  { href: '/glossary', label: '용어' },
];

// 심볼별 아이콘 색상
const SYMBOL_COLORS: Record<string, string> = {
  btc: 'bg-yellow-500',
  eth: 'bg-blue-500',
  sol: 'bg-purple-500',
  xrp: 'bg-gray-400',
};

export default function GNB() {
  const [symbolSlug, setSymbolSlug] = useAtom(symbolSlugAtom);
  const currentSymbol = useAtomValue(symbolAtom);
  const symbolList = useAtomValue(symbolListAtom);
  const priceData = usePrice();
  const pathname = usePathname();

  // 드롭다운 상태
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSymbolChange = (slug: string) => {
    setSymbolSlug(slug);
    setIsDropdownOpen(false);
  };

  return (
    <div className='sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/10'>
      <div className='flex items-center justify-between p-2'>
        {/* 좌측: 심볼 선택 + 가격 */}
        <div className='flex items-center gap-2 px-3 min-w-50'>
          {/* 심볼 선택 드롭다운 */}
          <div className='relative' ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className='flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors'
            >
              <span className={`w-5 h-5 rounded-full ${SYMBOL_COLORS[currentSymbol.slug] || 'bg-gray-500'} flex items-center justify-center shrink-0`}>
                <span className='text-[10px] font-bold text-black'>{currentSymbol.label.charAt(0)}</span>
              </span>
              <span className='text-xs text-gray-400 font-medium leading-none'>{currentSymbol.label}/USDT</span>
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* 드롭다운 메뉴 */}
            {isDropdownOpen && (
              <div className='absolute top-full left-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[140px] z-50'>
                {symbolList.map((symbol) => (
                  <button
                    key={symbol.slug}
                    onClick={() => handleSymbolChange(symbol.slug)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors ${
                      symbol.slug === symbolSlug ? 'bg-white/5' : ''
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full ${SYMBOL_COLORS[symbol.slug] || 'bg-gray-500'} flex items-center justify-center`}>
                      <span className='text-[8px] font-bold text-black'>{symbol.label.charAt(0)}</span>
                    </span>
                    <span className='text-sm text-white'>{symbol.label}</span>
                    <span className='text-xs text-gray-500'>{symbol.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 가격 표시 */}
          {priceData ? (
            <>
              <span className='text-lg font-bold font-mono text-white'>
                <AnimatedPrice value={priceData.price} decimals={currentSymbol.decimals} />
              </span>
              {priceData.changePercent24h !== 0 && (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded transition-all duration-300 ${priceData.changePercent24h >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {priceData.changePercent24h >= 0 ? '+' : ''}{priceData.changePercent24h.toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className='text-lg font-mono text-gray-500 animate-pulse'>$---,---</span>
          )}
        </div>

        {/* 우측: 네비게이션 링크 */}
        <div className='flex items-center gap-1'>
          {tabs.map((tab) => {
            const isActive = pathname === tab.href ||
              (tab.href !== '/' && pathname.startsWith(tab.href));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
