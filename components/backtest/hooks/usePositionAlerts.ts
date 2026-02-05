import { useEffect, useRef } from 'react';
import {
  OpenPosition,
  SavedOptimizeResult,
} from '@/lib/backtest-api';
import { RealtimeDivergenceData } from '@/contexts/SocketContext';

interface UsePositionAlertsProps {
  divergenceData: RealtimeDivergenceData | null;
  openPosition: OpenPosition | null;
  ticker: any;
  selectedStrategy: SavedOptimizeResult | null;
  soundEnabled: boolean;
  playAlertSound: (direction: 'bullish' | 'bearish', forcePlay?: boolean) => void;
  playExitSound: (isProfit: boolean, forcePlay?: boolean) => void;
  loadBacktestTrades: (strategy: SavedOptimizeResult) => Promise<void>;
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
  selectedStrategy,
  soundEnabled,
  playAlertSound,
  playExitSound,
  loadBacktestTrades,
}: UsePositionAlertsProps) {
  const lastSignalIdRef = useRef<string | null>(null);
  const lastExitAlertRef = useRef<string | null>(null);
  const lastEntryAlertRef = useRef<string | null>(null);

  // 브라우저 알림 헬퍼 함수
  const showNotification = (title: string, body: string) => {
    if (typeof Notification === 'undefined') return;

    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    } else if (Notification.permission === 'default') {
      // 권한 요청 후 알림
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        }
      });
    }
  };

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission();
    }
  }, []);

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

    // 브라우저 알림
    const title =
      divergenceData.direction === 'bullish'
        ? '🚀 롱 신호 발생!'
        : '🌧 숏 신호 발생!';
    const body = `가격: $${divergenceData.currentPrice.toLocaleString()}${divergenceData.rsiValue ? ` | RSI: ${divergenceData.rsiValue.toFixed(1)}` : ''}`;
    showNotification(title, body);

    // 새 신호 발생 시 백테스트 재실행하여 openPosition 업데이트
    if (selectedStrategy) {
      console.log('[Signal] New divergence signal, refreshing backtest...');
      loadBacktestTrades(selectedStrategy);
    }
  }, [divergenceData, soundEnabled, playAlertSound, selectedStrategy, loadBacktestTrades]);

  // 2. TP/SL 도달 감지 및 알림 (실시간 가격 모니터링)
  useEffect(() => {
    if (!openPosition || !ticker) return;

    const currentPrice = ticker.price;
    const { tp, sl, direction, entryPrice } = openPosition;
    const isLong = direction === 'long';

    // TP/SL 도달 확인
    let exitType: 'tp' | 'sl' | null = null;

    if (isLong) {
      // 롱 포지션: 가격이 TP 이상이면 익절, SL 이하면 손절
      if (currentPrice >= tp) {
        exitType = 'tp';
      } else if (currentPrice <= sl) {
        exitType = 'sl';
      }
    } else {
      // 숏 포지션: 가격이 TP 이하면 익절, SL 이상이면 손절
      if (currentPrice <= tp) {
        exitType = 'tp';
      } else if (currentPrice >= sl) {
        exitType = 'sl';
      }
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

      // 브라우저 알림
      const directionText = isLong ? '롱' : '숏';
      const exitText = isProfit ? '익절' : '손절';
      const emoji = isProfit ? '🪙' : '💸';
      const pnlText =
        openPosition.unrealizedPnl >= 0
          ? `+$${openPosition.unrealizedPnl.toFixed(2)}`
          : `-$${Math.abs(openPosition.unrealizedPnl).toFixed(2)}`;

      showNotification(
        `${emoji} ${directionText} ${exitText}!`,
        `가격: $${currentPrice.toLocaleString()} | PnL: ${pnlText} (${openPosition.unrealizedPnlPercent.toFixed(2)}%)`,
      );

      console.log(
        `[Exit Alert] ${direction.toUpperCase()} ${exitType.toUpperCase()} @ $${currentPrice}`,
      );

      // TP/SL 도달 후 백테스트 재실행하여 포지션 상태 갱신
      if (selectedStrategy) {
        setTimeout(() => loadBacktestTrades(selectedStrategy), 1000);
      }
    }
  }, [ticker?.price, openPosition, soundEnabled, playExitSound, selectedStrategy, loadBacktestTrades]);

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

    // 브라우저 알림
    const directionText = isLong ? '롱' : '숏';
    const emoji = isLong ? '🟢' : '🔴';
    showNotification(
      `${emoji} ${directionText} 진입!`,
      `진입가: $${openPosition.entryPrice.toLocaleString()} | TP: $${openPosition.tp.toLocaleString()} | SL: $${openPosition.sl.toLocaleString()}`,
    );

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
