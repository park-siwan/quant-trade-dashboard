'use client';

import MTFOverview from '@/components/MTFOverview';

export default function Home() {
  return (
    <div className='p-4 md:p-8'>
      <MTFOverview symbol='BTC/USDT' />
    </div>
  );
}
