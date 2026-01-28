'use client';

import RollingOptimizePanel from '@/components/backtest/RollingOptimizePanel';

export default function RollingPage() {
  return (
    <div className='p-4 md:p-8'>
      <div className='max-w-7xl mx-auto'>
        <RollingOptimizePanel />
      </div>
    </div>
  );
}
