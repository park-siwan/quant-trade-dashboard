'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { ReactNode, useState } from 'react';
import { SocketProvider } from '@/contexts/SocketContext';
import { useSymbolSubscription } from '@/hooks/useSymbolSubscription';

interface ProvidersProps {
  children: ReactNode;
}

// 심볼 구독을 자동으로 관리하는 내부 컴포넌트
function SymbolSubscriptionManager({ children }: { children: ReactNode }) {
  useSymbolSubscription();
  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1분
            retry: 1,
            refetchOnWindowFocus: false, // 창 포커스시 자동 갱신 비활성화
          },
        },
      })
  );

  return (
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        <SocketProvider>
          <SymbolSubscriptionManager>{children}</SymbolSubscriptionManager>
        </SocketProvider>
      </QueryClientProvider>
    </JotaiProvider>
  );
}
