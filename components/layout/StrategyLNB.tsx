'use client';

type StrategySubTab = 'realtime' | 'results' | 'optimize' | 'cache';

interface StrategyLNBProps {
  activeSubTab: StrategySubTab;
  onSubTabChange: (tab: StrategySubTab) => void;
}

const subTabs: { id: StrategySubTab; label: string }[] = [
  { id: 'realtime', label: '실시간' },
  { id: 'results', label: '결과 조회' },
  { id: 'optimize', label: '파라미터 최적화' },
  { id: 'cache', label: '데이터 캐시' },
];

export default function StrategyLNB({ activeSubTab, onSubTabChange }: StrategyLNBProps) {
  return (
    <div className='flex gap-1 mb-4'>
      {subTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSubTabChange(tab.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            activeSubTab === tab.id
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export type { StrategySubTab };
