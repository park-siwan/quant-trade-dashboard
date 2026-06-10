'use client';

import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_CONFIG } from '@/lib/config';

export interface ScoreHistoryEntry {
  id?: number;
  timestamp: number;
  longTotal: number;
  shortTotal: number;
  longDivergence: number;
  shortDivergence: number;
  longMomentum: number;
  shortMomentum: number;
  longVolume: number;
  shortVolume: number;
  longLevels: number;
  shortLevels: number;
  longSentiment: number;
  shortSentiment: number;
}

interface UseScoreHistoryOptions {
  limit?: number;
  saveInterval?: number;
}

export function useScoreHistory(options: UseScoreHistoryOptions = {}) {
  const { limit = 60, saveInterval = 60000 } = options;
  const lastSaveRef = useRef<number>(0);
  const queryClient = useQueryClient();

  const { data: history = [], isLoading, refetch } = useQuery<ScoreHistoryEntry[]>({
    queryKey: ['score-history', limit],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/score-history?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch score history');
      return res.json();
    },
  });

  const { mutateAsync } = useMutation<
    ScoreHistoryEntry,
    Error,
    Omit<ScoreHistoryEntry, 'id' | 'timestamp'>
  >({
    mutationFn: (entry) =>
      fetch(`${API_CONFIG.BASE_URL}/score-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).then(r => r.json()),
    onSuccess: (saved) => {
      queryClient.setQueryData<ScoreHistoryEntry[]>(['score-history', limit], prev =>
        [saved, ...(prev ?? [])].slice(0, limit)
      );
    },
  });

  const saveScore = async (entry: Omit<ScoreHistoryEntry, 'id' | 'timestamp'>) => {
    const now = Date.now();
    if (now - lastSaveRef.current < saveInterval) return;
    lastSaveRef.current = now;
    await mutateAsync(entry);
  };

  return { history, isLoading, saveScore, refetch };
}
