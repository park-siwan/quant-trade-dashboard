import { memo, useState, useEffect, useCallback } from 'react';
import { API_CONFIG } from '@/lib/config';

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
                💬
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
              <div className='w-px h-4 bg-zinc-700' />
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
            className={`p-1.5 rounded transition-colors ${
              isSettingsOpen
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title='설정'
          >
            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
              />
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }
);

StatisticsHeader.displayName = 'StatisticsHeader';
