import { memo, useState, useEffect, useCallback } from 'react';
import { API_CONFIG } from '@/lib/config';

interface NotificationSettings {
  telegram: boolean;
  twilio: boolean;
}

interface SettingsPanelProps {
  show: boolean;
  soundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
  soundVolume: number;
  onVolumeChange: (vol: number) => void;
  playAlertSound: (direction: 'bullish' | 'bearish', forcePlay?: boolean) => void;
  playExitSound: (isProfit: boolean, forcePlay?: boolean) => void;
}

function useNotificationSettings(show: boolean) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    if (!show) return;
    fetch(`${API_CONFIG.BASE_URL}/notification/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, [show]);

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
      const data = await res.json();
      setSettings(data);
    } catch {
      setSettings(s => s ? { ...s, [key]: !newVal } : s);
    }
  }, [settings]);

  return { settings, toggle };
}

export const SettingsPanel: React.FC<SettingsPanelProps> = memo(
  ({
    show,
    soundEnabled,
    onSoundToggle,
    soundVolume,
    onVolumeChange,
    playAlertSound,
    playExitSound,
  }) => {
    const { settings, toggle } = useNotificationSettings(show);

    if (!show) return null;

    return (
      <div className='absolute top-full right-0 mt-2 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 p-4'>
        {/* 사운드 설정 */}
        <div className='text-xs text-zinc-400 mb-2'>사운드 알림</div>
        <div className='flex items-center gap-3'>
          <button
            onClick={() => onSoundToggle(!soundEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
              soundEnabled
                ? 'bg-green-600/30 text-green-400'
                : 'bg-zinc-700 text-zinc-500'
            }`}
          >
            {soundEnabled ? '🔊 켜짐' : '🔇 꺼짐'}
          </button>
          <div className='flex-1 flex items-center gap-2'>
            <input
              type='range'
              min='0'
              max='100'
              value={soundVolume * 100}
              onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
              className='flex-1 h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500'
              disabled={!soundEnabled}
            />
            <span className='text-zinc-500 text-xs w-8'>
              {Math.round(soundVolume * 100)}%
            </span>
          </div>
        </div>
        {/* 테스트 버튼 */}
        <div className='flex gap-1 mt-2'>
          <button
            onClick={() => playAlertSound('bullish', true)}
            className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-green-600/30 text-green-400 text-xs rounded transition-colors'
          >
            🚀 롱
          </button>
          <button
            onClick={() => playAlertSound('bearish', true)}
            className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-red-600/30 text-red-400 text-xs rounded transition-colors'
          >
            🌧 숏
          </button>
          <button
            onClick={() => playExitSound(true, true)}
            className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-green-600/30 text-green-400 text-xs rounded transition-colors'
          >
            🪙 익절
          </button>
          <button
            onClick={() => playExitSound(false, true)}
            className='flex-1 px-2 py-1 bg-zinc-700 hover:bg-red-600/30 text-red-400 text-xs rounded transition-colors'
          >
            💸 손절
          </button>
        </div>

        {/* 알림 채널 설정 */}
        {settings && (
          <>
            <div className='border-t border-zinc-700 my-3' />
            <div className='text-xs text-zinc-400 mb-2'>알림 채널</div>
            <div className='flex gap-2'>
              <button
                onClick={() => toggle('telegram')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors ${
                  settings.telegram
                    ? 'bg-blue-600/30 text-blue-400'
                    : 'bg-zinc-700 text-zinc-500'
                }`}
              >
                💬 텔레그램 {settings.telegram ? '켜짐' : '꺼짐'}
              </button>
              <button
                onClick={() => toggle('twilio')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors ${
                  settings.twilio
                    ? 'bg-purple-600/30 text-purple-400'
                    : 'bg-zinc-700 text-zinc-500'
                }`}
              >
                📞 전화 {settings.twilio ? '켜짐' : '꺼짐'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
);

SettingsPanel.displayName = 'SettingsPanel';
