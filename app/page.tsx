'use client';

import MTFOverview from '@/components/MTFOverview';
import { GNB } from '@/components/layout';

export default function Home() {
  return (
    <div className='min-h-screen bg-[#0a0a0a] bg-pattern relative overflow-hidden'>
      {/* 배경 장식 */}
      <div className='absolute top-0 left-0 w-125 h-125 bg-gray-500/10 rounded-full blur-[120px] -translate-x-1/3 -translate-y-1/3'></div>
      <div className='absolute bottom-0 right-0 w-100 h-100 bg-gray-600/8 rounded-full blur-[100px] translate-x-1/4 translate-y-1/4'></div>
      <div className='absolute top-1/2 left-1/2 w-75 h-75 bg-gray-400/5 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2'></div>

      {/* GNB */}
      <GNB />

      {/* 메인 콘텐츠 */}
      <div className='relative z-10 p-4 md:p-8'>
        <MTFOverview symbol='BTC/USDT' />
      </div>
    </div>
  );
}
