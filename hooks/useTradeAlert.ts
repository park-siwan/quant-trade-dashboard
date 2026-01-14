'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTTS } from './useTTS';
import { SignalScore } from '@/lib/scoring';
import { MTFDivergenceInfo } from '@/lib/types';

const COOLDOWN_STORAGE_KEY = 'trade-alert-cooldowns';

// 알림 발생 시 콜백 타입
export interface AlertEvent {
  type: 'entry' | 'strong_signal' | 'divergence';
  direction: 'long' | 'short' | 'bullish' | 'bearish';
  message: string;
  timeframe?: string;
  score?: number;
  riskReward?: number;
}

interface TradeAlertOptions {
  enabled?: boolean;
  // 점수 임계값
  strongSignalThreshold?: number;  // 강한 신호 (기본 60)
  entryThreshold?: number;         // 진입 타점 (기본 50)
  // 쿨다운 (중복 알림 방지)
  cooldownMs?: number;             // 기본 60초
  // 알림 발생 시 콜백
  onAlert?: (event: AlertEvent) => void;
}

interface ScoreState {
  longScore: number;
  shortScore: number;
  dominantDirection: 'long' | 'short' | 'neutral';  // 우세 방향
  timestamp: number;
}

interface DivergenceState {
  timeframe: string;
  type: string;
  direction: string;
  timestamp: number;
}

// localStorage에서 쿨다운 로드
const loadCooldowns = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch {
    return {};
  }
};

// localStorage에 쿨다운 저장
const saveCooldowns = (cooldowns: Record<string, number>) => {
  if (typeof window === 'undefined') return;
  try {
    // 1시간 지난 쿨다운은 제거
    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [key, time] of Object.entries(cooldowns)) {
      if (now - time < 60 * 60 * 1000) {
        cleaned[key] = time;
      }
    }
    localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    // 에러 무시
  }
};

export function useTradeAlert(options: TradeAlertOptions = {}) {
  const {
    enabled = true,
    strongSignalThreshold = 70,  // 강한 신호 70점으로 상향
    entryThreshold = 60,         // 진입 타점 60점으로 상향 (기존 50점)
    cooldownMs = 300000,         // 5분 쿨다운 (기존 1분)
    onAlert,
  } = options;

  const tts = useTTS({ enabled });

  // 이전 상태 저장
  const prevScoreRef = useRef<ScoreState | null>(null);
  const prevDivergenceRef = useRef<DivergenceState | null>(null);
  const lastAlertTimeRef = useRef<Record<string, number>>({});
  const isInitializedRef = useRef(false);
  const lastAlertMessageRef = useRef<string>('');  // 마지막 알림 메시지 (중복 방지)

  // 초기 로드
  useEffect(() => {
    if (!isInitializedRef.current) {
      lastAlertTimeRef.current = loadCooldowns();
      isInitializedRef.current = true;
    }
  }, []);

  // 쿨다운 체크
  const canAlert = useCallback((alertType: string): boolean => {
    const now = Date.now();
    const lastTime = lastAlertTimeRef.current[alertType] || 0;
    if (now - lastTime < cooldownMs) return false;
    lastAlertTimeRef.current[alertType] = now;
    // localStorage에 저장
    saveCooldowns(lastAlertTimeRef.current);
    return true;
  }, [cooldownMs]);

  // 점수 변화 감지 및 알림 (신호 변화 기반)
  const checkScoreAlert = useCallback((
    longScore: SignalScore,
    shortScore: SignalScore,
    riskReward?: { long: number; short: number }
  ) => {
    if (!enabled) return;

    const currentLong = longScore.total;
    const currentShort = shortScore.total;
    const prevState = prevScoreRef.current;
    const prevLong = prevState?.longScore ?? 0;
    const prevShort = prevState?.shortScore ?? 0;
    const prevDirection = prevState?.dominantDirection ?? 'neutral';

    // 현재 우세 방향 결정 (10점 이상 차이나야 방향 확정)
    const scoreDiff = currentLong - currentShort;
    let currentDirection: 'long' | 'short' | 'neutral' = 'neutral';
    if (scoreDiff >= 10) currentDirection = 'long';
    else if (scoreDiff <= -10) currentDirection = 'short';

    // 점수 변화량
    const longChange = currentLong - prevLong;
    const shortChange = currentShort - prevShort;
    const SIGNIFICANT_CHANGE = 10; // 10점 이상 변화시 의미있는 변화

    // 중복 알림 방지 헬퍼
    const triggerAlert = (alertKey: string, message: string, alertFn: () => void) => {
      // 같은 메시지가 1초 이내 반복되면 무시
      if (lastAlertMessageRef.current === message) return;
      if (!canAlert(alertKey)) return;

      lastAlertMessageRef.current = message;
      setTimeout(() => { lastAlertMessageRef.current = ''; }, 1000); // 1초 후 초기화
      alertFn();
    };

    // 1. 방향 전환 감지 (가장 중요한 신호)
    if (prevDirection !== 'neutral' && currentDirection !== 'neutral' && prevDirection !== currentDirection) {
      const newDir = currentDirection;
      const score = newDir === 'long' ? currentLong : currentShort;
      const rr = newDir === 'long' ? (riskReward?.long ?? 2) : (riskReward?.short ?? 2);
      const message = `⚡ ${newDir === 'long' ? '롱' : '숏'} 전환! (${Math.round(score)}점)`;

      triggerAlert(`direction_change_${newDir}`, message, () => {
        tts.playStrongSignal(newDir);
        onAlert?.({
          type: 'strong_signal',
          direction: newDir,
          message,
          score: Math.round(score),
          riskReward: rr,
        });
      });
    }
    // 2. 강한 신호 강화 (이미 우세한 방향이 더 강해짐)
    else if (currentDirection === 'long' && longChange >= SIGNIFICANT_CHANGE && currentLong >= strongSignalThreshold) {
      const rr = riskReward?.long ?? 2;
      const message = `📈 롱 강화 ${Math.round(currentLong)}점 (+${Math.round(longChange)})`;

      triggerAlert('strengthen_long', message, () => {
        tts.playEntryAlert('long', Math.round(currentLong), rr);
        onAlert?.({
          type: 'entry',
          direction: 'long',
          message,
          score: Math.round(currentLong),
          riskReward: rr,
        });
      });
    }
    else if (currentDirection === 'short' && shortChange >= SIGNIFICANT_CHANGE && currentShort >= strongSignalThreshold) {
      const rr = riskReward?.short ?? 2;
      const message = `📉 숏 강화 ${Math.round(currentShort)}점 (+${Math.round(shortChange)})`;

      triggerAlert('strengthen_short', message, () => {
        tts.playEntryAlert('short', Math.round(currentShort), rr);
        onAlert?.({
          type: 'entry',
          direction: 'short',
          message,
          score: Math.round(currentShort),
          riskReward: rr,
        });
      });
    }
    // 3. 새로운 진입 신호 (중립 → 방향 확정, 임계값 이상)
    else if (prevDirection === 'neutral' && currentDirection !== 'neutral') {
      const newDir = currentDirection;
      const score = newDir === 'long' ? currentLong : currentShort;

      if (score >= entryThreshold) {
        const rr = newDir === 'long' ? (riskReward?.long ?? 2) : (riskReward?.short ?? 2);
        const message = `🎯 ${newDir === 'long' ? '롱' : '숏'} 타점 ${Math.round(score)}점`;

        triggerAlert(`new_signal_${newDir}`, message, () => {
          tts.playEntryAlert(newDir, Math.round(score), rr);
          onAlert?.({
            type: 'entry',
            direction: newDir,
            message,
            score: Math.round(score),
            riskReward: rr,
          });
        });
      }
    }

    // 상태 업데이트
    prevScoreRef.current = {
      longScore: currentLong,
      shortScore: currentShort,
      dominantDirection: currentDirection,
      timestamp: Date.now(),
    };
  }, [enabled, strongSignalThreshold, entryThreshold, canAlert, tts, onAlert]);

  // 다이버전스 감지 및 알림
  const checkDivergenceAlert = useCallback((
    timeframe: string,
    divergence: MTFDivergenceInfo | null
  ) => {
    if (!enabled || !divergence || divergence.isExpired) return;

    // 확정되지 않은 다이버전스는 알림 안함 (종가 미확정 시 리페인팅 방지)
    if (divergence.confirmed === false) {
      console.log(`⏳ [${timeframe}] 다이버전스 미확정 - 알림 대기:`, {
        type: divergence.type,
        direction: divergence.direction,
      });
      return;
    }

    // 디버그: 다이버전스 알림 체크
    console.log(`🔔 [${timeframe}] 다이버전스 알림 체크:`, {
      type: divergence.type,
      direction: divergence.direction,
      candlesAgo: divergence.candlesAgo,
      isExpired: divergence.isExpired,
      confirmed: divergence.confirmed,
      timestamp: new Date(divergence.timestamp).toLocaleString(),
    });

    // 새로운 다이버전스인지 확인
    const prev = prevDivergenceRef.current;
    const isNew = !prev ||
      prev.timeframe !== timeframe ||
      prev.type !== divergence.type ||
      prev.direction !== divergence.direction ||
      divergence.timestamp > prev.timestamp;

    if (isNew && divergence.candlesAgo <= 3) { // 최근 3캔들 이내만
      const alertKey = `div_${timeframe}_${divergence.direction}`;
      if (canAlert(alertKey)) {
        console.log(`🚨 [${timeframe}] 다이버전스 알림 발생!`, {
          type: divergence.type,
          direction: divergence.direction,
        });
        const tfMap: Record<string, '5m' | '15m' | '1h' | '4h'> = {
          '5m': '5m',
          '15m': '15m',
          '30m': '15m', // 30분은 15분으로
          '1h': '1h',
          '4h': '4h',
          '1d': '4h', // 1일은 4시간으로
        };
        const tf = tfMap[timeframe] || '1h';
        tts.playDivergenceAlert(tf, divergence.direction);

        const dirLabel = divergence.direction === 'bullish' ? '상승' : '하락';
        onAlert?.({
          type: 'divergence',
          direction: divergence.direction,
          message: `${timeframe} ${dirLabel} 다이버전스 (${divergence.type.toUpperCase()})`,
          timeframe: tf,
        });
      }

      // 상태 업데이트
      prevDivergenceRef.current = {
        timeframe,
        type: divergence.type,
        direction: divergence.direction,
        timestamp: divergence.timestamp,
      };
    }
  }, [enabled, canAlert, tts, onAlert]);

  // 수동 알림 (테스트용)
  const triggerEntryAlert = useCallback((
    direction: 'long' | 'short',
    score: number,
    riskReward: number
  ) => {
    tts.playEntryAlert(direction, score, riskReward);
  }, [tts]);

  const triggerStrongSignal = useCallback((direction: 'long' | 'short') => {
    tts.playStrongSignal(direction);
  }, [tts]);

  const triggerDivergenceAlert = useCallback((
    timeframe: '5m' | '15m' | '1h' | '4h',
    direction: 'bullish' | 'bearish'
  ) => {
    tts.playDivergenceAlert(timeframe, direction);
  }, [tts]);

  return {
    isPlaying: tts.isPlaying,
    isUnlocked: tts.isUnlocked, // 오디오 활성화 여부
    checkScoreAlert,
    checkDivergenceAlert,
    // 수동 트리거
    triggerEntryAlert,
    triggerStrongSignal,
    triggerDivergenceAlert,
    stop: tts.stop,
  };
}
