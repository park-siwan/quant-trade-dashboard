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
