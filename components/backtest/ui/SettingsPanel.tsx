import { memo } from 'react';

interface SettingsPanelProps {
  show: boolean;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  soundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
  soundVolume: number;
  onVolumeChange: (vol: number) => void;
  playAlertSound: (direction: 'bullish' | 'bearish', forcePlay?: boolean) => void;
  playExitSound: (isProfit: boolean, forcePlay?: boolean) => void;
  useWalkForward: boolean;
  onWalkForwardToggle: (enabled: boolean) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = memo(
  ({
    show,
    timeframe,
    onTimeframeChange,
    soundEnabled,
    onSoundToggle,
    soundVolume,
    onVolumeChange,
    playAlertSound,
    playExitSound,
    useWalkForward,
    onWalkForwardToggle,
  }) => {
    if (!show) return null;

    return (
      <div className='absolute top-full right-0 mt-2 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 p-4 space-y-4'>
        {/* 타임프레임 */}
        <div>
          <div className='text-xs text-zinc-400 mb-2'>타임프레임</div>
          <div className='flex items-center gap-1'>
            {['1m', '5m', '15m', '1h'].map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`flex-1 px-2 py-1.5 text-xs rounded ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-700 text-zinc-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* 사운드 설정 */}
        <div>
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
        </div>

        {/* Walk-Forward 백테스트 설정 */}
        <div>
          <div className='text-xs text-zinc-400 mb-2'>Walk-Forward 백테스트</div>
          <button
            onClick={() => onWalkForwardToggle(!useWalkForward)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-xs transition-colors ${
              useWalkForward
                ? 'bg-purple-600/30 text-purple-400 ring-1 ring-purple-500/50'
                : 'bg-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            <span>{useWalkForward ? '🔬 활성화' : '📊 비활성화'}</span>
            <span className='text-[10px] opacity-70'>
              {useWalkForward ? 'Out-of-Sample' : '전체 기간'}
            </span>
          </button>
          <div className='mt-2 text-[10px] text-zinc-500'>
            {useWalkForward
              ? '각 주마다 과거 데이터로 최적화된 파라미터 사용 (실전 시뮬레이션)'
              : '전체 기간 동일한 파라미터 사용 (백테스트)'}
          </div>
        </div>
      </div>
    );
  }
);

SettingsPanel.displayName = 'SettingsPanel';
