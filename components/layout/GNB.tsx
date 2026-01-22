'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bitcoin } from 'lucide-react';
import { useBTCPrice } from '@/hooks/useBTCPrice';
import { AnimatedPrice } from '@/components/shared';

const tabs = [
  { href: '/', label: '분석' },
  { href: '/chart', label: '차트' },
  { href: '/strategy', label: '전략' },
  { href: '/glossary', label: '용어' },
];

export default function GNB() {
  const btcPrice = useBTCPrice();
  const pathname = usePathname();

  return (
    <div className='sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/10'>
      <div className='flex items-center justify-between p-2'>
        {/* 좌측: BTC 가격 */}
        <div className='flex items-center gap-2 px-3 min-w-[200px]'>
          <span className='w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0'>
            <Bitcoin className='w-3.5 h-3.5 text-black' strokeWidth={2.5} />
          </span>
          <span className='text-xs text-gray-400 font-medium leading-none'>BTC/USDT</span>
          {btcPrice ? (
            <>
              <span className='text-lg font-bold font-mono text-white'>
                <AnimatedPrice value={btcPrice.price} />
              </span>
              {btcPrice.changePercent24h !== 0 && (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded transition-all duration-300 ${btcPrice.changePercent24h >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {btcPrice.changePercent24h >= 0 ? '+' : ''}{btcPrice.changePercent24h.toFixed(2)}%
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
