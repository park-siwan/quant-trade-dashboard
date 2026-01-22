'use client';

import ChartAdapter from '@/components/ChartAdapter';
import { GNB } from '@/components/layout';

export default function ChartPage() {
  return (
    <div className='min-h-screen bg-[#0a0a0a] bg-pattern relative overflow-hidden'>
      {/* 배경 장식 */}
      <div className='absolute top-0 left-0 w-[500px] h-[500px] bg-gray-500/10 rounded-full blur-[120px] -translate-x-1/3 -translate-y-1/3'></div>
      <div className='absolute bottom-0 right-0 w-[400px] h-[400px] bg-gray-600/8 rounded-full blur-[100px] translate-x-1/4 translate-y-1/4'></div>

      {/* GNB */}
      <GNB />

      {/* 메인 콘텐츠 */}
      <div className='relative z-10 p-4 md:p-8'>
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
          {/* 차트 그리드 */}
          <div className='grid grid-cols-2 md:grid-cols-3 grid-rows-2 gap-2 flex-1'>
            {['5m', '15m', '30m', '1h', '4h', '1d'].map((tf) => (
              <ChartAdapter key={tf} symbol='BTC/USDT' initialTimeframe={tf} limit={500} mini />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
