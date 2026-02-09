import { useEffect, useRef } from 'react';
import {
  OpenPosition,
  SavedOptimizeResult,
} from '@/lib/backtest-api';
import { KlineData, RealtimeDivergenceData } from '@/contexts/SocketContext';

interface UsePositionAlertsProps {
  divergenceData: RealtimeDivergenceData | null;
  openPosition: OpenPosition | null;
  ticker: any;
  kline: KlineData | null; // 현재 캔들 고가/저가 기준 TP/SL 체크
  selectedStrategy: SavedOptimizeResult | null;
  soundEnabled: boolean;
  playAlertSound: (direction: 'bullish' | 'bearish', forcePlay?: boolean) => void;
  playExitSound: (isProfit: boolean, forcePlay?: boolean) => void;
  loadBacktestTrades: (strategy: SavedOptimizeResult, retryCount?: number, forceRun?: boolean) => Promise<void>;
  onPositionExit?: (exitType: 'tp' | 'sl', exitPrice: number) => void;  // TP/SL 도달 시 포지션 청산 콜백
}

/**
 * 포지션 관련 알림을 통합 관리하는 Hook
 * - Divergence 신호 감지 및 알림
 * - TP/SL 청산 감지 및 알림
 * - 포지션 진입 알림
 */
export function usePositionAlerts({
  divergenceData,
  openPosition,
  ticker,
  kline,
  selectedStrategy,
  soundEnabled,
  playAlertSound,
  playExitSound,
  loadBacktestTrades,
  onPositionExit,
}: UsePositionAlertsProps) {
  const lastSignalIdRef = useRef<string | null>(null);
  const lastExitAlertRef = useRef<string | null>(null);
  const lastEntryAlertRef = useRef<string | null>(null);

  // 1. 실시간 다이버전스 신호 알림 + 백테스트 재실행
  useEffect(() => {
    if (!divergenceData) return;

    // 고유 신호 ID 생성 (시간 + 방향)
    const signalId = `${divergenceData.timestamp}-${divergenceData.direction}`;

    // 이미 알림한 신호면 스킵
    if (lastSignalIdRef.current === signalId) return;

    lastSignalIdRef.current = signalId;

    // 소리 알림
    playAlertSound(divergenceData.direction as 'bullish' | 'bearish');

    // 새 신호 발생 시 백테스트 재실행하여 openPosition 업데이트
    if (selectedStrategy) {
      console.log('[Signal] New divergence signal, refreshing backtest...');
      loadBacktestTrades(selectedStrategy);
    }
  }, [divergenceData, soundEnabled, playAlertSound, selectedStrategy, loadBacktestTrades]);

  // 2. TP/SL 도달 감지 및 알림 (현재 캔들 고가/저가 + ticker 모니터링)
  useEffect(() => {
    if (!openPosition || !ticker) return;

    const currentPrice = ticker.price;
    const { tp, sl, direction } = openPosition;
    const isLong = direction === 'long';

    // 캔들 고가/저가 사용 (잠깐 터치하고 돌아와도 감지)
    const high = kline?.high ?? currentPrice;
    const low = kline?.low ?? currentPrice;

    // TP/SL 도달 확인
    let exitType: 'tp' | 'sl' | null = null;

    if (isLong) {
      if (high >= tp) exitType = 'tp';
      else if (low <= sl) exitType = 'sl';
    } else {
      if (low <= tp) exitType = 'tp';
      else if (high >= sl) exitType = 'sl';
    }

    if (exitType) {
      // 고유 알림 ID (진입시간 + TP/SL 타입)
      const alertId = `${openPosition.entryTime}-${exitType}`;

      // 이미 알림한 경우 스킵
      if (lastExitAlertRef.current === alertId) return;

      lastExitAlertRef.current = alertId;
      const isProfit = exitType === 'tp';

      // 소리 알림
      playExitSound(isProfit);

      console.log(
        `[Exit Alert] ${direction.toUpperCase()} ${exitType.toUpperCase()} @ $${currentPrice}`,
      );

      // TP/SL 도달 시 즉시 포지션 청산 콜백 호출
      if (onPositionExit) {
        onPositionExit(exitType, currentPrice);
      }

      // TP/SL 도달 후 백테스트 재실행 — 캔들 닫힘 후 반영되도록 60초 대기
      if (selectedStrategy) {
        setTimeout(() => loadBacktestTrades(selectedStrategy, 0, true), 60000);
      }
    }
  }, [ticker?.price, kline?.high, kline?.low, openPosition, soundEnabled, playExitSound, selectedStrategy, loadBacktestTrades, onPositionExit]);

  // 3. 새 포지션 진입 알림
  useEffect(() => {
    if (!openPosition) return;

    // 고유 알림 ID (진입시간 + 방향)
    const entryId = `${openPosition.entryTime}-${openPosition.direction}`;

    // 이미 알림한 경우 스킵
    if (lastEntryAlertRef.current === entryId) return;

    // 30분 이내 진입만 알림 (페이지 새로고침 시 오래된 포지션 알림 방지)
    const ENTRY_ALERT_WINDOW_MS = 30 * 60 * 1000; // 30분
    const entryTime = new Date(openPosition.entryTime).getTime();
    const timeSinceEntry = Date.now() - entryTime;
    if (timeSinceEntry > ENTRY_ALERT_WINDOW_MS) {
      console.log(
        `[Entry Alert] Skipped - entry too old (${Math.round(timeSinceEntry / 60000)}min ago)`,
      );
      lastEntryAlertRef.current = entryId; // 마킹하여 재시도 방지
      return;
    }

    lastEntryAlertRef.current = entryId;
    const isLong = openPosition.direction === 'long';

    // 진입 소리 알림 (다이버전스 신호와 동일한 사운드)
    playAlertSound(isLong ? 'bullish' : 'bearish');

    console.log(
      `[Entry Alert] ${openPosition.direction.toUpperCase()} @ $${openPosition.entryPrice} (${Math.round(timeSinceEntry / 60000)}min ago)`,
    );
  }, [openPosition, soundEnabled, playAlertSound]);

  return {
    lastSignalIdRef,
    lastExitAlertRef,
    lastEntryAlertRef,
  };
}
