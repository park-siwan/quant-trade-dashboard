import { TradeResult, BacktestResult, EquityPoint } from './backtest-api';
import { toSeconds } from './utils/timestamp';

/**
 * 총 포지션 보유시간 계산 (모든 거래의 보유시간 합계)
 */
export function calculateTotalHoldingTime(backtestTrades: TradeResult[]): number {
  return backtestTrades.reduce((acc, trade) => {
    try {
      const entrySeconds = toSeconds(trade.entryTime);
      const exitSeconds = toSeconds(trade.exitTime);

      // 유효성 검증
      if (
        isNaN(entrySeconds) ||
        isNaN(exitSeconds) ||
        !isFinite(entrySeconds) ||
        !isFinite(exitSeconds)
      ) {
        console.warn('[totalHoldingTime] Invalid time for trade:', trade);
        return acc;
      }

      const holdingTimeMs = (exitSeconds - entrySeconds) * 1000;

      // 음수 또는 비정상적으로 큰 값 필터링
      if (holdingTimeMs < 0 || holdingTimeMs > 365 * 24 * 60 * 60 * 1000) {
        console.warn('[totalHoldingTime] Abnormal holding time:', holdingTimeMs, trade);
        return acc;
      }

      return acc + holdingTimeMs;
    } catch (error) {
      console.error('[totalHoldingTime] Error calculating holding time:', error, trade);
      return acc;
    }
  }, 0);
}

/**
 * 측정기간 계산 (백테스트 시작~끝)
 */
export function calculateMeasurementPeriod(
  backtestStats: BacktestResult | null,
  equityCurve: EquityPoint[],
  backtestTrades: TradeResult[]
): number {
  if (!backtestStats) {
    return 0;
  }

  // 1순위: startDate/endDate 사용
  if (backtestStats.startDate && backtestStats.endDate) {
    const startTime = new Date(backtestStats.startDate).getTime();
    const endTime = new Date(backtestStats.endDate).getTime();
    if (!isNaN(startTime) && !isNaN(endTime)) {
      return endTime - startTime;
    }
  }

  // 2순위: equityCurve 첫/마지막 타임스탬프 사용
  if (equityCurve && equityCurve.length >= 2) {
    // 타임스탬프를 밀리초로 변환 (초 단위 Unix timestamp도 처리)
    const parseTimestamp = (ts: string | number): number => {
      if (typeof ts === 'number') {
        // 초 단위 Unix timestamp인지 확인 (2000년 이후 = 946684800 이상)
        // 밀리초면 946684800000 이상이어야 함
        return ts < 1e12 ? ts * 1000 : ts;
      }
      return new Date(ts).getTime();
    };

    const firstTime = parseTimestamp(equityCurve[0].timestamp);
    const lastTime = parseTimestamp(equityCurve[equityCurve.length - 1].timestamp);

    if (!isNaN(firstTime) && !isNaN(lastTime)) {
      return lastTime - firstTime;
    }
  }

  // 3순위: backtestTrades 첫/마지막 거래 시간 사용
  if (backtestTrades && backtestTrades.length >= 1) {
    const entryTimes = backtestTrades.map((t) => toSeconds(t.entryTime) * 1000);
    const exitTimes = backtestTrades.map((t) => toSeconds(t.exitTime) * 1000);
    const allTimes = [...entryTimes, ...exitTimes];
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);

    if (isFinite(minTime) && isFinite(maxTime)) {
      return maxTime - minTime;
    }
  }

  console.warn('[measurementPeriod] No valid data source found', {
    hasBacktestStats: !!backtestStats,
    hasEquityCurve: !!equityCurve && equityCurve.length > 0,
    hasBacktestTrades: !!backtestTrades && backtestTrades.length > 0,
  });
  return 0;
}

/**
 * 밀리초를 사람이 읽을 수 있는 형식으로 변환
 * @param ms - 밀리초
 * @param short - 짧은 형식 (예: "3일" vs "3일 5시간")
 */
export function formatDuration(ms: number, short = false): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) {
    return short ? `${days}일` : `${days}일 ${remainingHours}시간`;
  }
  return `${hours}시간`;
}
