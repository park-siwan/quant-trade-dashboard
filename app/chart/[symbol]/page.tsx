'use client';

import { use, useLayoutEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { useSetAtom } from 'jotai';
import { getSymbolBySlug } from '@/lib/symbols';
import { symbolSlugAtom } from '@/stores/symbolAtom';
import ChartAdapter from '@/components/ChartAdapter';

// 타임프레임 모드
const TIMEFRAME_MODES = {
  default: ['5m', '15m', '30m', '1h', '4h', '1d'],
  short: ['1m', '5m', '15m', '30m', '1h', '4h'],
} as const;

interface ChartPageProps {
  params: Promise<{ symbol: string }>;
}

export default function ChartPage({ params }: ChartPageProps) {
  const { symbol: symbolSlug } = use(params);
  const symbolInfo = getSymbolBySlug(symbolSlug);
  const setSymbolSlug = useSetAtom(symbolSlugAtom);
  const [timeframeMode, setTimeframeMode] = useState<'default' | 'short'>('default');

  // URL 심볼을 atom에 동기화 (useLayoutEffect로 paint 전에 설정)
  useLayoutEffect(() => {
    if (symbolInfo) {
      setSymbolSlug(symbolInfo.slug);
    }
  }, [symbolInfo, setSymbolSlug]);

  if (!symbolInfo) {
    notFound();
  }

  const symbol = symbolInfo.slashFormat;
  const timeframes = TIMEFRAME_MODES[timeframeMode];

  return (
    <div className='p-4 md:p-8'>
      <div className='flex flex-col h-[calc(100vh-120px)]'>
        {/* 범례 */}
        <div className='overflow-hidden border-b border-white/5 pb-2 mb-2'>
          <div className='flex animate-ticker whitespace-nowrap text-[11px]'>
            {[0, 1].map((repeat) => (
              <div key={repeat} className='flex items-center gap-6 px-4 text-gray-400'>
                <span><span className='text-blue-400 font-bold'>━</span> EMA 50 (단기 추세)</span>
                <span><span className='text-green-400 font-bold'>━</span> EMA 200 (장기 추세)</span>
                <span className='text-gray-500'>│</span>
                <span><span className='text-green-400'>✕</span> 골든크로스 - EMA50이 200 상향돌파 (롱 신호)</span>
                <span><span className='text-red-400'>✕</span> 데드크로스 - EMA50이 200 하향돌파 (숏 신호)</span>
                <span className='text-gray-500'>│</span>
                <span><span className='text-green-400'>━━</span> 상승 다이버전스 (롱 타점)</span>
                <span><span className='text-red-400'>━━</span> 하락 다이버전스 (숏 타점)</span>
                <span><span className='text-gray-500'>┈┈</span> 필터링된 다이버전스 (ADX 상승 중)</span>
                <span className='text-gray-500'>│</span>
                <span className='inline-flex items-center gap-1'><span className='text-green-400 relative -top-[3px]'>︿</span><span className='text-red-400 relative top-[3px]'>﹀</span> CHoCH (추세전환)</span>
                <span className='text-gray-500'>│</span>
                <span>실선=유효신호 | 점선=필터링됨</span>
              </div>
            ))}
          </div>
        </div>
        {/* 타임프레임 모드 토글 */}
        <div className='flex justify-end mb-2'>
          <button
            onClick={() => setTimeframeMode(prev => prev === 'default' ? 'short' : 'default')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 border ${
              timeframeMode === 'short'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
            }`}
          >
            {timeframeMode === 'short' ? '1m~4h (단기)' : '5m~1d (기본)'}
          </button>
        </div>
        {/* 차트 그리드 */}
        <div className='grid grid-cols-2 md:grid-cols-3 grid-rows-2 gap-2 flex-1'>
          {timeframes.map((tf) => (
            <ChartAdapter key={`${symbolSlug}-${tf}-${timeframeMode}`} symbol={symbol} initialTimeframe={tf} limit={500} mini />
          ))}
        </div>
      </div>
    </div>
  );
}
