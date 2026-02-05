import { memo } from 'react';

interface ChartLegendProps {
  totalTrades: number;
  skippedSignalsCount: number;
}

export const ChartLegend: React.FC<ChartLegendProps> = memo(
  ({ totalTrades, skippedSignalsCount }) => {
    return (
      <div className='mt-3 flex flex-wrap gap-4 text-xs text-zinc-400'>
        <span className='flex items-center gap-1'>
          <span className='text-green-400'>▲</span> 롱 진입
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-red-400'>▼</span> 숏 진입
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-green-400'>●</span> 익절
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-yellow-300'>●</span> 손절
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-gray-400'>●</span> 수수료 손실
        </span>
        <span className='flex items-center gap-1'>
          <span className='text-gray-400'>▲▼</span> 스킵
        </span>
        <span className='flex items-center gap-1'>
          <span>🚀</span> 롱 진행중
        </span>
        <span className='flex items-center gap-1'>
          <span>🌧️</span> 숏 진행중
        </span>
        {totalTrades > 0 && (
          <span className='text-zinc-500'>| 거래: {totalTrades}건</span>
        )}
        {skippedSignalsCount > 0 && (
          <span className='text-gray-400'>| 스킵: {skippedSignalsCount}건</span>
        )}
      </div>
    );
  }
);

ChartLegend.displayName = 'ChartLegend';
