'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  saveInterval?: number; // ms, 저장 주기 (기본 60초)
}

export function useScoreHistory(options: UseScoreHistoryOptions = {}) {
  const { limit = 60, saveInterval = 60000 } = options;
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastSaveRef = useRef<number>(0);

  // 히스토리 조회
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/score-history?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch score history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  // 점수 저장 (쓰로틀 적용)
  const saveScore = useCallback(async (entry: Omit<ScoreHistoryEntry, 'id' | 'timestamp'>) => {
    const now = Date.now();
    if (now - lastSaveRef.current < saveInterval) {
      return; // 저장 주기 미충족
    }
    lastSaveRef.current = now;

    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/score-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      if (res.ok) {
        const saved = await res.json();
        setHistory(prev => [saved, ...prev].slice(0, limit));
      }
    } catch (err) {
      console.error('Failed to save score:', err);
    }
  }, [limit, saveInterval]);

  // 초기 로드
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    isLoading,
    saveScore,
    refetch: fetchHistory,
  };
}
