'use client';

import { useOrderBook, OrderBookLevel } from '@/hooks/useOrderBook';

interface OrderBookProps {
  symbol?: string;
  limit?: number;
}

export default function OrderBook({ symbol = 'BTCUSDT', limit = 20 }: OrderBookProps) {
  const { orderBook, isConnected, error } = useOrderBook({ symbol, limit });

  // 최대 총량 계산 (백그라운드 바 너비 비율용)
  const maxBidTotal = orderBook.bids.length > 0
    ? Math.max(...orderBook.bids.map(b => b.total))
    : 0;
  const maxAskTotal = orderBook.asks.length > 0
    ? Math.max(...orderBook.asks.map(a => a.total))
    : 0;
  const maxTotal = Math.max(maxBidTotal, maxAskTotal);

  // 에러 상태
  if (error) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-2xl p-6 shadow-2xl'>
        <div className='text-center'>
          <p className='text-red-400 mb-2'>오더북 연결 실패</p>
          <p className='text-sm text-gray-400'>{error.message}</p>
        </div>
      </div>
    );
  }

  // 스프레드 계산
  const spread = orderBook.asks.length > 0 && orderBook.bids.length > 0
    ? orderBook.asks[0].price - orderBook.bids[0].price
    : 0;
  const spreadPercent = orderBook.bids.length > 0
    ? (spread / orderBook.bids[0].price) * 100
    : 0;

  return (
    <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 shadow-2xl h-full flex flex-col'>
      {/* 헤더 */}
      <div className='flex items-center justify-between mb-3'>
        <div className='flex items-center gap-2'>
          <h3 className='text-sm font-bold text-orange-400'>📖 오더북</h3>
          {isConnected && (
            <div className='flex items-center gap-1'>
              <div className='w-2 h-2 rounded-full bg-lime-400 animate-pulse'></div>
              <span className='text-xs text-gray-400'>실시간</span>
            </div>
          )}
        </div>
        <div className='text-xs text-gray-400'>{symbol}</div>
      </div>

      {/* 컬럼 헤더 */}
      <div className='grid grid-cols-3 gap-2 text-[10px] text-gray-400 font-semibold mb-2 px-2'>
        <div className='text-left'>가격 (USDT)</div>
        <div className='text-right'>수량 (BTC)</div>
        <div className='text-right'>총량</div>
      </div>

      <div className='flex-1 flex flex-col overflow-hidden'>
        {/* 매도 호가 (위에서부터 역순) */}
        <div className='flex-1 flex flex-col-reverse overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent'>
          {orderBook.asks.slice(0, limit).reverse().map((ask, index) => {
            const widthPercent = maxTotal > 0 ? (ask.total / maxTotal) * 100 : 0;
            return (
              <div key={`ask-${index}`} className='relative px-2 py-0.5 hover:bg-white/5 transition-colors'>
                {/* 백그라운드 바 (매도 = 빨강) */}
                <div
                  className='absolute right-0 top-0 h-full bg-red-500/10 transition-all duration-300'
                  style={{ width: `${widthPercent}%` }}
                />
                <div className='relative grid grid-cols-3 gap-2 text-[11px]'>
                  <div className='text-red-400 font-mono font-semibold'>{ask.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className='text-right text-gray-300 font-mono'>{ask.quantity.toFixed(3)}</div>
                  <div className='text-right text-gray-400 font-mono text-[10px]'>{ask.total.toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 스프레드 표시 */}
        <div className='py-2 px-2 bg-gradient-to-r from-red-500/5 via-purple-500/10 to-lime-500/5 border-y border-white/10 my-1'>
          <div className='flex items-center justify-between text-xs'>
            <span className='text-gray-400'>스프레드</span>
            <div className='flex items-center gap-2'>
              <span className='text-purple-400 font-mono font-semibold'>{spread.toFixed(2)}</span>
              <span className='text-gray-400'>({spreadPercent.toFixed(3)}%)</span>
            </div>
          </div>
        </div>

        {/* 매수 호가 */}
        <div className='flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent'>
          {orderBook.bids.slice(0, limit).map((bid, index) => {
            const widthPercent = maxTotal > 0 ? (bid.total / maxTotal) * 100 : 0;
            return (
              <div key={`bid-${index}`} className='relative px-2 py-0.5 hover:bg-white/5 transition-colors'>
                {/* 백그라운드 바 (매수 = 초록) */}
                <div
                  className='absolute right-0 top-0 h-full bg-lime-500/10 transition-all duration-300'
                  style={{ width: `${widthPercent}%` }}
                />
                <div className='relative grid grid-cols-3 gap-2 text-[11px]'>
                  <div className='text-lime-400 font-mono font-semibold'>{bid.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className='text-right text-gray-300 font-mono'>{bid.quantity.toFixed(3)}</div>
                  <div className='text-right text-gray-400 font-mono text-[10px]'>{bid.total.toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 푸터 - 총 매수/매도량 */}
      <div className='mt-3 pt-3 border-t border-white/10'>
        <div className='grid grid-cols-2 gap-4 text-xs'>
          <div>
            <p className='text-gray-400 mb-1'>총 매수량</p>
            <p className='text-lime-400 font-mono font-semibold'>
              {orderBook.bids.reduce((sum, bid) => sum + bid.quantity, 0).toFixed(2)} BTC
            </p>
          </div>
          <div>
            <p className='text-gray-400 mb-1'>총 매도량</p>
            <p className='text-red-400 font-mono font-semibold'>
              {orderBook.asks.reduce((sum, ask) => sum + ask.quantity, 0).toFixed(2)} BTC
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
