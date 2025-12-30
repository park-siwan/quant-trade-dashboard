'use client';

import { useEffect, useState } from 'react';
import { OrderBookData } from '@/lib/types';

interface OrderBookDOMProps {
  symbol: string;
}

export default function OrderBookDOM({ symbol }: OrderBookDOMProps) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/exchange/orderbook?symbol=${symbol}`);
        const data = await response.json();
        if (data.success && data.data) {
          setOrderBook(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch order book:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();
    // 5초마다 갱신
    const interval = setInterval(fetchOrderBook, 5000);
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 h-full flex items-center justify-center'>
        <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-orange-400'></div>
      </div>
    );
  }

  if (!orderBook) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 h-full flex items-center justify-center'>
        <span className='text-gray-400 text-sm'>오더북 로딩 실패</span>
      </div>
    );
  }

  const maxSize = Math.max(
    ...orderBook.asks.slice(0, 12).map(a => a.size),
    ...orderBook.bids.slice(0, 12).map(b => b.size)
  );

  const formatPrice = (price: number) => {
    return price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const formatSize = (size: number) => {
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toFixed(1);
  };

  return (
    <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-3 h-full flex flex-col'>
      {/* 헤더 */}
      <div className='flex items-center justify-between mb-2 pb-2 border-b border-white/10'>
        <span className='text-xs font-bold text-gray-300'>오더북</span>
        <span className={`text-xs font-bold ${orderBook.bidAskRatio > 1 ? 'text-green-400' : 'text-red-400'}`}>
          {orderBook.bidAskRatio > 1 ? '▲' : '▼'} {orderBook.bidAskRatio.toFixed(2)}x
        </span>
      </div>

      {/* 컬럼 헤더 */}
      <div className='flex justify-between text-[10px] text-gray-500 mb-1 px-1'>
        <span>가격</span>
        <span>수량</span>
      </div>

      {/* 매도 호가 (역순으로 - 높은 가격이 위) */}
      <div className='flex-1 overflow-hidden'>
        <div className='space-y-[2px]'>
          {orderBook.asks.slice(0, 12).reverse().map((level, index) => {
            const widthPercent = (level.size / maxSize) * 100;
            return (
              <div
                key={`ask-${index}`}
                className='relative flex items-center justify-between px-1 h-[18px] text-[11px]'
              >
                {/* 배경 바 */}
                <div
                  className='absolute right-0 top-0 h-full bg-red-500/20'
                  style={{ width: `${widthPercent}%` }}
                />
                {/* 가격 */}
                <span className='relative z-10 text-red-400 font-mono'>
                  {formatPrice(level.price)}
                </span>
                {/* 수량 */}
                <span className='relative z-10 text-gray-300 font-mono'>
                  {formatSize(level.size)}
                </span>
              </div>
            );
          })}
        </div>

        {/* 스프레드 구분선 */}
        <div className='my-2 py-1 border-y border-white/20 text-center'>
          <span className='text-[10px] text-yellow-400 font-bold'>
            스프레드: {((orderBook.asks[0]?.price - orderBook.bids[0]?.price) || 0).toFixed(1)}
          </span>
        </div>

        {/* 매수 호가 */}
        <div className='space-y-[2px]'>
          {orderBook.bids.slice(0, 12).map((level, index) => {
            const widthPercent = (level.size / maxSize) * 100;
            return (
              <div
                key={`bid-${index}`}
                className='relative flex items-center justify-between px-1 h-[18px] text-[11px]'
              >
                {/* 배경 바 */}
                <div
                  className='absolute right-0 top-0 h-full bg-green-500/20'
                  style={{ width: `${widthPercent}%` }}
                />
                {/* 가격 */}
                <span className='relative z-10 text-green-400 font-mono'>
                  {formatPrice(level.price)}
                </span>
                {/* 수량 */}
                <span className='relative z-10 text-gray-300 font-mono'>
                  {formatSize(level.size)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 푸터 - 총 물량 비교 */}
      <div className='mt-2 pt-2 border-t border-white/10'>
        <div className='flex justify-between text-[10px]'>
          <span className='text-green-400'>매수 {formatSize(orderBook.totalBidVolume)}</span>
          <span className='text-red-400'>매도 {formatSize(orderBook.totalAskVolume)}</span>
        </div>
        {/* 비율 바 */}
        <div className='mt-1 h-2 bg-red-500/30 rounded overflow-hidden'>
          <div
            className='h-full bg-green-500/60'
            style={{ width: `${(orderBook.bidAskRatio / (orderBook.bidAskRatio + 1)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
