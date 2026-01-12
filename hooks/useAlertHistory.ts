'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AlertItem } from '@/components/AlertSnackbar';

interface UseAlertHistoryOptions {
  maxAlerts?: number; // 최대 알림 개수
  reminderInterval?: number; // 재알림 간격 (ms), 기본 5분
  enabled?: boolean;
}

export function useAlertHistory(options: UseAlertHistoryOptions = {}) {
  const {
    maxAlerts = 20,
    reminderInterval = 5 * 60 * 1000, // 5분
    enabled = true,
  } = options;

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const reminderCallbackRef = useRef<(() => void) | null>(null);

  // 알림 추가
  const addAlert = useCallback((
    type: AlertItem['type'],
    direction: AlertItem['direction'],
    message: string,
    extra?: { timeframe?: string; score?: number; riskReward?: number }
  ) => {
    const newAlert: AlertItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      direction,
      message,
      timestamp: Date.now(),
      read: false,
      ...extra,
    };

    setAlerts(prev => {
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
