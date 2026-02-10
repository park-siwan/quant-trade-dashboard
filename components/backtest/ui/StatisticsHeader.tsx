import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { useSocket, useSocketTicker, type TradingStatus } from '@/contexts/SocketContext';
import { API_CONFIG } from '@/lib/config';
import type { OpenPosition } from '@/lib/backtest-api';

interface StatisticsHeaderProps {
  leverage: number;
  onLeverageChange: (value: number) => void;
  timeframe: string;
  onTimeframeChange: (value: string) => void;
  soundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
  isSettingsOpen: boolean;
  onSettingsToggle: () => void;
  isConnected: boolean;
  nextCandleCountdown: number;
}

interface NotificationSettings {
  telegram: boolean;
  twilio: boolean;
}

function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    fetch(`${API_CONFIG.BASE_URL}/notification/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  const toggle = useCallback(async (key: keyof NotificationSettings) => {
    if (!settings) return;
    const newVal = !settings[key];
    setSettings(s => s ? { ...s, [key]: newVal } : s);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/notification/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: newVal }),
      });
      setSettings(await res.json());
    } catch {
      setSettings(s => s ? { ...s, [key]: !newVal } : s);
    }
  }, [settings]);

  return { settings, toggle };
}

const TIMEFRAMES = [
  { value: '5m', label: '5M' },
  { value: '15m', label: '15M' },
  { value: '1h', label: '1H' },
];

export const StatisticsHeader: React.FC<StatisticsHeaderProps> = memo(
  ({ leverage, onLeverageChange, timeframe, onTimeframeChange, soundEnabled, onSoundToggle, isSettingsOpen, onSettingsToggle, isConnected, nextCandleCountdown }) => {
    const { settings, toggle } = useNotificationSettings();

    return (
      <div className='flex items-center justify-between px-4 py-1.5 bg-zinc-900 rounded-lg'>
        <div className='flex items-center gap-3'>
          {/* 연결 상태 */}
          <div className='flex items-center gap-1.5'>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className='text-xs text-zinc-400'>
              {isConnected ? '실시간' : '끊김'}
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 다음 캔들 카운트다운 */}
          <div className='flex items-center gap-1'>
            <span className='text-xs text-zinc-500'>캔들</span>
            <span className={`text-xs font-mono ${nextCandleCountdown <= 10 ? 'text-yellow-400' : 'text-zinc-300'}`}>
              {Math.floor(nextCandleCountdown / 60)}:{(nextCandleCountdown % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 분봉 선택 */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>분봉</span>
            <div className='flex gap-0.5'>
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => onTimeframeChange(tf.value)}
                  className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                    timeframe === tf.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 레버리지 슬라이더 + 직접 입력 */}
          <div className='flex items-center gap-1.5'>
            <span className='text-zinc-500 text-xs'>레버리지</span>
            <input
              type='range'
              min={1}
              max={125}
              step={0.1}
              value={leverage}
              onChange={(e) => onLeverageChange(Number(e.target.value))}
              className='w-36 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer'
            />
            <div className='flex items-center gap-0.5'>
              <input
                type='number'
                min={1}
                max={125}
                step={0.1}
                value={leverage}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(125, Math.round((Number(e.target.value) || 1) * 10) / 10));
                  onLeverageChange(v);
                }}
                className='w-12 bg-zinc-800 text-zinc-200 text-xs font-bold text-center rounded border border-zinc-700 focus:border-blue-500 focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
              />
              <span className='text-zinc-400 text-xs'>x</span>
            </div>
          </div>
        </div>

        {/* 우측: 알림 + 사운드 + 설정 */}
        <div className='flex items-center gap-1'>
          {settings && (
            <>
              <button
                onClick={() => toggle('telegram')}
                className={`px-2 py-1 rounded text-sm transition-colors ${
                  settings.telegram ? 'bg-blue-600/25 hover:bg-blue-600/40' : 'bg-zinc-800 opacity-40 hover:opacity-70'
                }`}
                title={`텔레그램 ${settings.telegram ? '켜짐' : '꺼짐'}`}
              >
                <svg className='w-4 h-4' viewBox='0 0 24 24' fill='currentColor'><path d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'/></svg>
              </button>
              <button
                onClick={() => toggle('twilio')}
                className={`px-2 py-1 rounded text-sm transition-colors ${
                  settings.twilio ? 'bg-purple-600/25 hover:bg-purple-600/40' : 'bg-zinc-800 opacity-40 hover:opacity-70'
                }`}
                title={`전화 알림 ${settings.twilio ? '켜짐' : '꺼짐'}`}
              >
                📞
              </button>
            </>
          )}
          <button
            onClick={() => onSoundToggle(!soundEnabled)}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              soundEnabled ? 'bg-green-600/25 hover:bg-green-600/40' : 'bg-zinc-800 opacity-40 hover:opacity-70'
            }`}
            title={`사운드 ${soundEnabled ? '켜짐' : '꺼짐'}`}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button
            onClick={onSettingsToggle}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              isSettingsOpen ? 'bg-zinc-600/40 hover:bg-zinc-600/60' : 'bg-zinc-800 opacity-40 hover:opacity-70'
            }`}
            title='설정'
          >
            ⚙️
          </button>
        </div>
      </div>
    );
  }
);

StatisticsHeader.displayName = 'StatisticsHeader';

function useAutoTradeSettings() {
  const [settings, setSettings] = useState<TradingStatus | null>(null);

  useEffect(() => {
    fetch(`${API_CONFIG.BASE_URL}/trading/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  const toggle = useCallback(async () => {
    if (!settings) return;
    const newVal = !settings.enabled;
    setSettings(s => s ? { ...s, enabled: newVal } : s);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/trading/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newVal }),
      });
      setSettings(await res.json());
    } catch {
      setSettings(s => s ? { ...s, enabled: !newVal } : s);
    }
  }, [settings]);

  return { settings, setSettings, toggle };
}

// Comfort-Kelly 추천 레버리지
const COMFORT_MAX_DD = 0.20;
const COMFORT_CONSEC = 3;

function calcRecLev(
  openPosition: OpenPosition | null, winRate?: number, maxConsecLoss?: number
): number {
  if (!openPosition) return 1;
  const tpDist = Math.abs(openPosition.tp - openPosition.entryPrice) / openPosition.entryPrice;
  const slDist = Math.abs(openPosition.sl - openPosition.entryPrice) / openPosition.entryPrice;
  if (slDist <= 0) return 1;

  // Half-Kelly
  const p = (winRate || 50) / 100;
  const q = 1 - p;
  const mu = p * tpDist - q * slDist;
  let halfKelly = 1;
  if (mu > 0) {
    const variance = p * tpDist * tpDist + q * slDist * slDist - mu * mu;
    if (variance > 0) halfKelly = Math.max(1, Math.floor((mu / variance) / 2));
  }

  // Comfort
  const consecN = maxConsecLoss && maxConsecLoss > COMFORT_CONSEC ? maxConsecLoss : COMFORT_CONSEC;
  const comfortOnly = Math.floor((1 - Math.pow(1 - COMFORT_MAX_DD, 1 / consecN)) / slDist);

  return Math.max(1, Math.min(Math.min(halfKelly, comfortOnly), 125));
}

interface BalanceHeaderProps {
  openPosition?: OpenPosition | null;
  winRate?: number;
  maxConsecLoss?: number;
}

export const BalanceHeader = memo(({ openPosition, winRate, maxConsecLoss }: BalanceHeaderProps) => {
  const { balanceData, tradingStatus } = useSocket();
  const { ticker } = useSocketTicker();
  const { settings, setSettings, toggle } = useAutoTradeSettings();

  const [orderState, setOrderState] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [orderMsg, setOrderMsg] = useState('');

  // WS 상태 업데이트 반영
  useEffect(() => {
    if (tradingStatus) setSettings(tradingStatus);
  }, [tradingStatus, setSettings]);

  const recLev = useMemo(() => calcRecLev(openPosition ?? null, winRate, maxConsecLoss), [openPosition, winRate, maxConsecLoss]);

  const retryInfo = settings?.retryInfo || tradingStatus?.retryInfo;
  const halfCloseInfo = settings?.halfCloseInfo || tradingStatus?.halfCloseInfo;
  const hasRealPosition = !!(settings?.activePosition || tradingStatus?.activePosition);

  const executeOrder = useCallback(async () => {
    if (!openPosition || orderState !== 'confirm') return;
    setOrderState('loading');
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/trading/manual-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: openPosition.direction === 'long' ? 'buy' : 'sell',
          entryPrice: openPosition.entryPrice,
          tp: openPosition.tp,
          sl: openPosition.sl,
          leverage: recLev,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrderState('done');
        setOrderMsg(`PostOnly ${data.order.side.toUpperCase()} 시도 중...`);
      } else {
        setOrderState('error');
        setOrderMsg(data.message || 'Failed');
      }
    } catch (e: any) {
      setOrderState('error');
      setOrderMsg(e.message);
    }
    setTimeout(() => { setOrderState('idle'); setOrderMsg(''); }, 4000);
  }, [openPosition, orderState, recLev]);

  const cancelRetry = useCallback(async () => {
    try { await fetch(`${API_CONFIG.BASE_URL}/trading/cancel`, { method: 'POST' }); } catch {}
    setOrderState('idle');
    setOrderMsg('');
  }, []);

  const closePosition = useCallback(async () => {
    try { await fetch(`${API_CONFIG.BASE_URL}/trading/close`, { method: 'POST' }); } catch {}
  }, []);

  const halfClose = useCallback(async () => {
    try { await fetch(`${API_CONFIG.BASE_URL}/trading/half-close`, { method: 'POST' }); } catch {}
  }, []);

  const cancelHalfClose = useCallback(async () => {
    try { await fetch(`${API_CONFIG.BASE_URL}/trading/half-close/cancel`, { method: 'POST' }); } catch {}
  }, []);

  // 실시간 미실현 PnL 계산 (ticker 가격 기반)
  const liveBalance = useMemo(() => {
    if (!balanceData) return null;
    const pos = settings?.activePosition || tradingStatus?.activePosition;
    if (!pos || !ticker?.price) {
      return { equity: balanceData.totalEquity, pnl: balanceData.unrealisedPnl, pnlPct: 0 };
    }
    const currentPrice = ticker.price;
    const pnl = pos.side === 'buy'
      ? (currentPrice - pos.entryPrice) * pos.amount
      : (pos.entryPrice - currentPrice) * pos.amount;
    const equity = balanceData.totalEquity - balanceData.unrealisedPnl + pnl;
    const im = pos.positionIM > 0 ? pos.positionIM : pos.entryPrice * pos.amount / (pos.leverage > 0 ? pos.leverage : 1);
    const pnlPct = im > 0 ? (pnl / im) * 100 : 0;
    return { equity, pnl, pnlPct };
  }, [balanceData, settings?.activePosition, tradingStatus?.activePosition, ticker?.price]);

  if (!balanceData || !liveBalance) return null;

  const isLong = openPosition?.direction === 'long';

  return (
    <div className='flex items-center justify-between px-4 py-1 bg-zinc-900/60 rounded-lg'>
      <div className='flex items-center gap-4'>
        <span className='text-xs text-zinc-500'>Bybit</span>
        <div className='flex items-center gap-1'>
          <span className='text-xs text-zinc-400'>순자산</span>
          <span className='text-xs font-mono text-yellow-400'>${liveBalance.equity.toFixed(2)}</span>
        </div>
        <div className='flex items-center gap-1'>
          <span className='text-xs text-zinc-400'>가용</span>
          <span className='text-xs font-mono text-zinc-300'>${balanceData.availableBalance.toFixed(2)}</span>
        </div>
        {liveBalance.pnl !== 0 && (
          <div className='flex items-center gap-1'>
            <span className='text-xs text-zinc-400'>미실현</span>
            <span className={`text-xs font-mono ${liveBalance.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {liveBalance.pnl >= 0 ? '+' : ''}{liveBalance.pnl.toFixed(2)}
              <span className='ml-1 opacity-70'>({liveBalance.pnlPct >= 0 ? '+' : ''}{liveBalance.pnlPct.toFixed(1)}%)</span>
            </span>
          </div>
        )}
      </div>

      {/* 우측: 매매 버튼 + 자동매매 */}
      <div className='flex items-center gap-2'>
        {/* 매매 실행 / 진입 상태 */}
        {retryInfo?.active ? (
          <>
            <span className='text-xs text-cyan-400 animate-pulse'>
              {retryInfo.leverage}x 진입 중 ({retryInfo.attempt}/{retryInfo.maxAttempts})
            </span>
            <button onClick={cancelRetry} className='px-1.5 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-400 hover:bg-zinc-600'>취소</button>
          </>
        ) : hasRealPosition ? (
          <>
            <span className='text-xs font-mono text-yellow-400'>
              {settings?.activePosition
                ? `${settings.activePosition.side.toUpperCase()} @$${settings.activePosition.entryPrice.toFixed(0)}`
                : '포지션'}
            </span>
            {halfCloseInfo?.active ? (
              <>
                <span className='text-xs text-cyan-400 animate-pulse'>
                  반익 중 ({halfCloseInfo.attempt}/{halfCloseInfo.maxAttempts})
                </span>
                <button onClick={cancelHalfClose} className='px-1.5 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-400 hover:bg-zinc-600'>취소</button>
              </>
            ) : liveBalance.pnl > 0 && (
              <button onClick={halfClose} className='px-1.5 py-0.5 text-[10px] rounded bg-cyan-900/40 text-cyan-400 hover:bg-cyan-900/60 border border-cyan-800/50'>반익반본</button>
            )}
            <button onClick={closePosition} className='px-1.5 py-0.5 text-[10px] rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 border border-red-800/50'>청산</button>
          </>
        ) : openPosition && (
          <>
            {orderState === 'idle' && (
              <button
                onClick={() => setOrderState('confirm')}
                className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                  isLong
                    ? 'bg-green-600/30 text-green-400 hover:bg-green-600/50 border border-green-600/40'
                    : 'bg-red-600/30 text-red-400 hover:bg-red-600/50 border border-red-600/40'
                }`}
              >
                {isLong ? 'LONG' : 'SHORT'} {recLev}x
              </button>
            )}
            {orderState === 'confirm' && (
              <>
                <span className='text-xs text-yellow-400'>{isLong ? 'LONG' : 'SHORT'} {recLev}x 진입?</span>
                <button onClick={executeOrder} className='px-1.5 py-0.5 text-[10px] font-bold rounded bg-yellow-600/40 text-yellow-300 hover:bg-yellow-600/60 border border-yellow-600/50'>확인</button>
                <button onClick={() => setOrderState('idle')} className='px-1.5 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-400 hover:bg-zinc-600'>취소</button>
              </>
            )}
            {orderState === 'loading' && <span className='text-xs text-zinc-400 animate-pulse'>주문 중...</span>}
            {orderState === 'done' && <span className='text-xs text-green-400'>{orderMsg}</span>}
            {orderState === 'error' && <span className='text-xs text-red-400'>{orderMsg}</span>}
          </>
        )}

        {/* 자동매매 토글 */}
        {settings?.envEnabled && (
          <button
            onClick={toggle}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold transition-colors ${
              settings.enabled
                ? 'bg-green-600/30 text-green-400 hover:bg-green-600/50 border border-green-600/50'
                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 border border-zinc-700'
            }`}
            title={`자동매매 ${settings.enabled ? 'ON' : 'OFF'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${settings.enabled ? 'bg-green-400' : 'bg-zinc-600'}`} />
            자동매매
          </button>
        )}
      </div>
    </div>
  );
});

BalanceHeader.displayName = 'BalanceHeader';
