'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTTS } from './useTTS';
import { SignalScore } from '@/lib/scoring';
import { MTFDivergenceInfo } from '@/lib/types';

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
  timestamp: number;
}

interface DivergenceState {
  timeframe: string;
  type: string;
  direction: string;
  timestamp: number;
}

export function useTradeAlert(options: TradeAlertOptions = {}) {
  const {
    enabled = true,
    strongSignalThreshold = 60,
    entryThreshold = 50,
    cooldownMs = 60000, // 60초
    onAlert,
  } = options;

  const tts = useTTS({ enabled });

  // 이전 상태 저장
  const prevScoreRef = useRef<ScoreState | null>(null);
  const prevDivergenceRef = useRef<DivergenceState | null>(null);
  const lastAlertTimeRef = useRef<Record<string, number>>({});

  // 쿨다운 체크
  const canAlert = useCallback((alertType: string): boolean => {
    const now = Date.now();
    const lastTime = lastAlertTimeRef.current[alertType] || 0;
    if (now - lastTime < cooldownMs) return false;
    lastAlertTimeRef.current[alertType] = now;
    return true;
  }, [cooldownMs]);

  // 점수 변화 감지 및 알림
  const checkScoreAlert = useCallback((
    longScore: SignalScore,
    shortScore: SignalScore,
    riskReward?: { long: number; short: number }
  ) => {
    if (!enabled) return;

    const currentLong = longScore.total;
    const currentShort = shortScore.total;
    const prevLong = prevScoreRef.current?.longScore ?? 0;
    const prevShort = prevScoreRef.current?.shortScore ?? 0;

    // 강한 롱 신호 (60점 이상 돌파)
    if (currentLong >= strongSignalThreshold && prevLong < strongSignalThreshold) {
      if (canAlert('strong_long')) {
        tts.playStrongSignal('long');
        onAlert?.({
          type: 'strong_signal',
          direction: 'long',
          message: `강한 롱 신호 (${Math.round(currentLong)}점)`,
          score: Math.round(currentLong),
        });
      }
    }
    // 강한 숏 신호
    else if (currentShort >= strongSignalThreshold && prevShort < strongSignalThreshold) {
      if (canAlert('strong_short')) {
        tts.playStrongSignal('short');
        onAlert?.({
          type: 'strong_signal',
          direction: 'short',
          message: `강한 숏 신호 (${Math.round(currentShort)}점)`,
          score: Math.round(currentShort),
        });
      }
    }
    // 롱 진입 타점 (50점 이상 돌파)
    else if (currentLong >= entryThreshold && prevLong < entryThreshold) {
      if (canAlert('entry_long')) {
        const rr = riskReward?.long ?? 2;
        tts.playEntryAlert('long', Math.round(currentLong), rr);
        onAlert?.({
          type: 'entry',
          direction: 'long',
          message: `롱 타점 ${Math.round(currentLong)}점, 손익비 1:${Math.round(rr)}`,
          score: Math.round(currentLong),
          riskReward: rr,
        });
      }
    }
    // 숏 진입 타점
    else if (currentShort >= entryThreshold && prevShort < entryThreshold) {
      if (canAlert('entry_short')) {
        const rr = riskReward?.short ?? 2;
        tts.playEntryAlert('short', Math.round(currentShort), rr);
        onAlert?.({
          type: 'entry',
          direction: 'short',
          message: `숏 타점 ${Math.round(currentShort)}점, 손익비 1:${Math.round(rr)}`,
          score: Math.round(currentShort),
          riskReward: rr,
        });
      }
    }

    // 상태 업데이트
    prevScoreRef.current = {
      longScore: currentLong,
      shortScore: currentShort,
      timestamp: Date.now(),
    };
  }, [enabled, strongSignalThreshold, entryThreshold, canAlert, tts, onAlert]);

  // 다이버전스 감지 및 알림
  const checkDivergenceAlert = useCallback((
    timeframe: string,
    divergence: MTFDivergenceInfo | null
  ) => {
    if (!enabled || !divergence || divergence.isExpired) return;

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
