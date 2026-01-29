'use client';

import { useState } from 'react';
import { StrategyLNB, type StrategySubTab } from '@/components/layout';
import RealtimeChart from '@/components/backtest/RealtimeChart';
import WalkForward from '@/components/backtest/WalkForward';

export default function StrategyPage() {
  const [strategySubTab, setStrategySubTab] = useState<StrategySubTab>('realtime');

  return (
    <div className='p-4 md:p-8'>
      <StrategyLNB activeSubTab={strategySubTab} onSubTabChange={setStrategySubTab} />
      {strategySubTab === 'realtime' && <RealtimeChart />}
      {strategySubTab === 'walk-forward' && <WalkForward />}
    </div>
  );
}
