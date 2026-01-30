'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, Suspense } from 'react';
import { StrategyLNB, type StrategySubTab } from '@/components/layout';
import RealtimeChart from '@/components/backtest/RealtimeChart';
import RegimeAnalysis from '@/components/backtest/RegimeAnalysis';
import WalkForward from '@/components/backtest/WalkForward';

function StrategyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') as StrategySubTab) || 'realtime';

  const handleTabChange = useCallback((newTab: StrategySubTab) => {
    router.push(`/strategy?tab=${newTab}`);
  }, [router]);

  return (
    <div className='p-4 md:p-8'>
      <StrategyLNB activeSubTab={tab} onSubTabChange={handleTabChange} />
      {tab === 'realtime' && <RealtimeChart />}
      {tab === 'regime' && <RegimeAnalysis />}
      {tab === 'walk-forward' && <WalkForward />}
    </div>
  );
}

export default function StrategyPage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-8">로딩 중...</div>}>
      <StrategyContent />
    </Suspense>
  );
}
