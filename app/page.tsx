'use client';

import { useAtomValue } from 'jotai';
import { symbolAtom } from '@/stores/symbolAtom';
import MTFOverview from '@/components/MTFOverview';

export default function Home() {
  const symbol = useAtomValue(symbolAtom);

  return (
    <div className='p-4 md:p-8'>
      <MTFOverview symbol={symbol.slashFormat} />
    </div>
  );
}
