import { memo } from 'react';
import { SavedOptimizeResult, BacktestResult } from '@/lib/backtest-api';

interface ChartHeaderProps {
  isConnected: boolean;
  nextCandleCountdown: number;
  isBacktestRunning: boolean;
  lastBacktestTime: Date | null;
  isLoadingAllStrategies: boolean;
  selectedStrategy: SavedOptimizeResult | null;
  backtestStats: BacktestResult | null;
  getStrategyDisplayName: (strategy: SavedOptimizeResult) => string;
  timeframe: string;
  soundEnabled: boolean;
  isSettingsOpen: boolean;
  onSettingsToggle: () => void;
}

export const ChartHeader: React.FC<ChartHeaderProps> = memo(
  ({
    isConnected,
    nextCandleCountdown,
    isBacktestRunning,
    lastBacktestTime,
    isLoadingAllStrategies,
    selectedStrategy,
    backtestStats,
    getStrategyDisplayName,
    timeframe,
    soundEnabled,
    isSettingsOpen,
    onSettingsToggle,
  }) => {
    return (
      <div className='flex items-center justify-between mb-3'>
        {/* 좌측: 연결 상태 + 백테스트 상태 */}
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-2'>
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className='text-xs text-zinc-400'>
              {isConnected ? '실시간' : '연결 끊김'}
            </span>
          </div>
          {/* 다음 캔들 카운트다운 */}
          <div className='flex items-center gap-2 px-2 py-1 bg-zinc-800 rounded'>
            <span className='text-xs text-zinc-500'>다음 캔들</span>
            <span
              className={`text-xs font-mono ${nextCandleCountdown <= 10 ? 'text-yellow-400' : 'text-zinc-300'}`}
            >
              {Math.floor(nextCandleCountdown / 60)}:
              {(nextCandleCountdown % 60).toString().padStart(2, '0')}
            </span>
          </div>
          {/* 백테스트 상태 */}
          <div className='flex items-center gap-2'>
            {isBacktestRunning ? (
              <span className='flex items-center gap-1 text-xs text-blue-400'>
                <span className='w-2 h-2 rounded-full bg-blue-400 animate-pulse' />
                분석중...
              </span>
            ) : lastBacktestTime ? (
              <span className='text-xs text-zinc-500'>
                마지막 분석:{' '}
                {lastBacktestTime.toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            ) : null}
          </div>
        </div>

        {/* 우측: 현재 전략 + 타임프레임 + 사운드 + 설정 버튼 */}
        <div className='flex items-center gap-2'>
          {/* 현재 선택된 전략 표시 (하단 패널에서 선택) */}
          <div className='px-3 py-1.5 bg-zinc-800 rounded text-xs min-w-[180px]'>
            {isLoadingAllStrategies ? (
              <div className='flex items-center gap-2'>
                <div className='w-3 h-3 rounded-full bg-blue-400 animate-pulse' />
                <span className='text-zinc-400'>전략 분석중...</span>
              </div>
            ) : selectedStrategy ? (
              <span className='text-white'>
                {getStrategyDisplayName(selectedStrategy)}
                {backtestStats && (
                  <span
                    className={`ml-2 ${backtestStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {backtestStats.winRate.toFixed(0)}%
                  </span>
                )}
              </span>
            ) : (
              <span className='text-zinc-500'>전략 없음</span>
            )}
          </div>

          {/* 타임프레임 표시 */}
          <div className='size-9 flex items-center justify-center p-2 bg-zinc-800 rounded text-xs text-zinc-400 leading-10'>
            {timeframe}
          </div>
          {/* 사운드 상태 */}
          <div className='p-2 bg-zinc-800 rounded text-sm'>
            {soundEnabled ? '🔊' : '🔇'}
          </div>
          {/* 설정 버튼 */}
          <div className='relative'>
            <button
              onClick={onSettingsToggle}
              className={`p-2 rounded transition-colors ${
                isSettingsOpen
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
              title='설정'
            >
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
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
      </div>
    );
  }
);

ChartHeader.displayName = 'ChartHeader';
