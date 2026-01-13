'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AlertItem } from '@/components/AlertSnackbar';

const STORAGE_KEY = 'trade-alerts';
const ALERT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24시간 후 자동 삭제

interface UseAlertHistoryOptions {
  maxAlerts?: number; // 최대 알림 개수
  reminderInterval?: number; // 재알림 간격 (ms), 기본 5분
  enabled?: boolean;
}

// localStorage에서 알림 로드
const loadAlerts = (): AlertItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const alerts: AlertItem[] = JSON.parse(stored);
    // 24시간 지난 알림 필터링
    const now = Date.now();
    return alerts.filter(a => now - a.timestamp < ALERT_EXPIRY_MS);
  } catch {
    return [];
  }
};

// localStorage에 알림 저장
const saveAlerts = (alerts: AlertItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // localStorage 용량 초과 등 에러 무시
  }
};

export function useAlertHistory(options: UseAlertHistoryOptions = {}) {
  const {
    maxAlerts = 20,
    reminderInterval = 5 * 60 * 1000, // 5분
    enabled = true,
  } = options;

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const reminderCallbackRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);

  // 초기 로드
  useEffect(() => {
    if (!isInitializedRef.current) {
      const loaded = loadAlerts();
      if (loaded.length > 0) {
        setAlerts(loaded);
      }
      isInitializedRef.current = true;
    }
  }, []);

  // 알림 변경 시 저장
  useEffect(() => {
    if (isInitializedRef.current) {
      saveAlerts(alerts);
    }
  }, [alerts]);

  // 탭 간 동기화 (storage 이벤트 리스너)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const newAlerts: AlertItem[] = JSON.parse(e.newValue);
          // 24시간 지난 알림 필터링
          const now = Date.now();
          const filtered = newAlerts.filter(a => now - a.timestamp < ALERT_EXPIRY_MS);
          setAlerts(filtered);
        } catch {
          // 파싱 에러 무시
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 알림 추가 (중복 방지)
  const addAlert = useCallback((
    type: AlertItem['type'],
    direction: AlertItem['direction'],
    message: string,
    extra?: { timeframe?: string; score?: number; riskReward?: number }
  ) => {
    const now = Date.now();

    setAlerts(prev => {
      // 중복 체크: 같은 메시지가 30초 이내에 있으면 추가하지 않음
      const isDuplicate = prev.some(a =>
        a.message === message && now - a.timestamp < 30000
      );
      if (isDuplicate) {
        console.log('[AlertHistory] 중복 알림 무시:', message);
        return prev;
      }

      const newAlert: AlertItem = {
        id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        direction,
        message,
        timestamp: now,
        read: false,
        ...extra,
      };

      const updated = [newAlert, ...prev];
      // 최대 개수 제한
      return updated.slice(0, maxAlerts);
    });
  }, [maxAlerts]);

  // 알림 삭제
  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // 모든 알림 삭제
  const dismissAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // 알림 읽음 처리
  const markRead = useCallback((id: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === id ? { ...a, read: true } : a
    ));
  }, []);

  // 모든 알림 읽음 처리
  const markAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);

  // 읽지 않은 알림 개수
  const unreadCount = alerts.filter(a => !a.read).length;

  // 가장 최근 읽지 않은 알림
  const latestUnread = alerts.find(a => !a.read);

  // 재알림 콜백 설정
  const setReminderCallback = useCallback((callback: () => void) => {
    reminderCallbackRef.current = callback;
  }, []);

  // 5분마다 재알림 (읽지 않은 알림이 있을 때)
  useEffect(() => {
    if (!enabled || unreadCount === 0) return;

    const interval = setInterval(() => {
      if (reminderCallbackRef.current && unreadCount > 0) {
        console.log(`[AlertHistory] ${unreadCount}개의 읽지 않은 알림 재알림`);
        reminderCallbackRef.current();
      }
    }, reminderInterval);

    return () => clearInterval(interval);
  }, [enabled, unreadCount, reminderInterval]);

  return {
    alerts,
    unreadCount,
    latestUnread,
    addAlert,
    dismissAlert,
    dismissAllAlerts,
    markRead,
    markAllRead,
    setReminderCallback,
  };
}
