import { memo } from 'react';
import { BacktestResult, SavedOptimizeResult } from '@/lib/backtest-api';

interface StatisticsHeaderProps {
  backtestStats: BacktestResult | null;
  selectedStrategy: SavedOptimizeResult | null;
  leverage: number;
  onLeverageChange: (value: number) => void;
  measurementPeriod: number;
  totalHoldingTime: number;
  formatDuration: (ms: number, short?: boolean) => string;
}

export const StatisticsHeader: React.FC<StatisticsHeaderProps> = memo(
  ({
    backtestStats,
    selectedStrategy,
    leverage,
    onLeverageChange,
    measurementPeriod,
    totalHoldingTime,
    formatDuration,
  }) => {
    if (!backtestStats && !selectedStrategy) return null;

    if (backtestStats) {
      return (
        <div className='flex items-center gap-3 px-4 py-2 bg-zinc-900 rounded-lg flex-wrap'>
          {/* 레버리지 설정 */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>레버리지</span>
            <select
              value={leverage}
              onChange={(e) => onLeverageChange(Number(e.target.value))}
              className='bg-zinc-800 text-zinc-200 text-xs font-bold px-2 py-0.5 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500'
            >
              {[1, 2, 3, 5, 10, 15, 20, 25, 30, 50, 75, 100, 125].map((lev) => (
                <option key={lev} value={lev}>
                  {lev}x
                </option>
              ))}
            </select>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 수익 (레버리지 적용) */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>수익</span>
            <span
              className={`text-sm font-bold ${backtestStats.totalPnlPercent * leverage >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {backtestStats.totalPnlPercent * leverage >= 0 ? '+' : ''}
              {(backtestStats.totalPnlPercent * leverage).toFixed(1)}%
            </span>
            {leverage > 1 && (
              <span className='text-zinc-600 text-[10px]'>
                ({backtestStats.totalPnlPercent >= 0 ? '+' : ''}
                {backtestStats.totalPnlPercent.toFixed(1)}% × {leverage})
              </span>
            )}
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 승률 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>승률</span>
            <span
              className={`text-sm font-bold ${backtestStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}
            >
              {backtestStats.winRate.toFixed(0)}%
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 측정기간 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>측정</span>
            <span className='text-zinc-300 text-sm font-bold'>
              {formatDuration(measurementPeriod, true)}
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 포지션 보유시간 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>보유</span>
            <span className='text-cyan-400 text-sm font-bold'>
              {formatDuration(totalHoldingTime)}
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 거래 횟수 */}
          <div className='flex items-center gap-2'>
            <span className='text-zinc-500 text-xs'>거래</span>
            <span
              className={`text-sm font-bold ${backtestStats.totalTrades === 0 ? 'text-yellow-500' : 'text-zinc-300'}`}
            >
              {backtestStats.totalTrades}회
            </span>
            {backtestStats.totalTrades === 0 && selectedStrategy && (
              <span
                className='text-yellow-500 text-[10px]'
                title={`필터: ${(selectedStrategy as any).rsiExtremeFilter || 'OFF'} / 지표: ${selectedStrategy.indicators}`}
              >
                ⚠ 필터 확인
              </span>
            )}
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 샤프 비율 (위험 대비 수익) */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>샤프</span>
            <span className='text-zinc-600 text-[10px]'>(위험대비)</span>
            <span className='text-zinc-300 text-sm font-bold'>
              {backtestStats.sharpeRatio.toFixed(2)}
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* 손익비 (Profit Factor) */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>손익비</span>
            <span className='text-zinc-600 text-[10px]'>(익절/손절)</span>
            <span className='text-zinc-300 text-sm font-bold'>
              {(backtestStats.profitFactor ?? 0).toFixed(2)}
            </span>
          </div>
          <div className='w-px h-4 bg-zinc-700' />
          {/* MDD (최대 낙폭) - 레버리지 적용 */}
          <div className='flex items-center gap-1'>
            <span className='text-zinc-500 text-xs'>MDD</span>
            <span className='text-zinc-600 text-[10px]'>(최대손실)</span>
            <span
              className={`text-sm font-bold ${(backtestStats.maxDrawdownPercent ?? 0) * leverage >= 100 ? 'text-red-500' : 'text-zinc-300'}`}
            >
              -{((backtestStats.maxDrawdownPercent ?? 0) * leverage).toFixed(1)}%
            </span>
            {(backtestStats.maxDrawdownPercent ?? 0) * leverage >= 100 && (
              <span className='text-red-500 text-[10px]'>⚠ 청산</span>
            )}
          </div>
        </div>
      );
    }

    // Skeleton loader
    return (
      <div className='flex items-center gap-3 px-4 py-2 bg-zinc-900 rounded-lg animate-pulse'>
        <div className='flex items-center gap-1'>
          <span className='text-zinc-500 text-xs'>레버리지</span>
          <div className='w-12 h-5 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>수익</span>
          <div className='w-16 h-4 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>승률</span>
          <div className='w-10 h-4 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>측정</span>
          <div className='w-12 h-4 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>보유</span>
          <div className='w-12 h-4 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>거래</span>
          <div className='w-10 h-4 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>샤프</span>
          <div className='w-10 h-4 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>손익비</span>
          <div className='w-10 h-4 bg-zinc-800 rounded' />
        </div>
        <div className='w-px h-4 bg-zinc-700' />
        <div className='flex items-center gap-2'>
          <span className='text-zinc-500 text-xs'>MDD</span>
          <div className='w-12 h-4 bg-zinc-800 rounded' />
        </div>
      </div>
    );
  }
);

StatisticsHeader.displayName = 'StatisticsHeader';
