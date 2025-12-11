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
      <div className='backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-2xl p-6 shadow-2xl h-full flex items-center justify-center'>
        <div className='text-center'>
          <p className='text-red-400 mb-2'>오더북 연결 실패</p>
          <p className='text-sm text-gray-400'>{error.message}</p>
        </div>
      </div>
    );
  }

  // 로딩 상태
  if (!isConnected || (orderBook.bids.length === 0 && orderBook.asks.length === 0)) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl h-full flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 mx-auto mb-3'></div>
          <p className='text-gray-400 text-sm'>오더북 연결 중...</p>
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

      <div className='flex flex-col'>
        {/* 매도 호가 (위에서부터 역순) */}
        <div className='flex flex-col-reverse'>
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
        <div>
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

      {/* 푸터 - 총 매수/매도량 + 매수/매도 비율 */}
      <div className='flex-1 mt-4 pt-4 border-t border-white/10 flex flex-col justify-center'>
        <div className='grid grid-cols-2 gap-6 text-sm mb-6'>
          <div className='text-center'>
            <p className='text-gray-400 mb-2 text-xs'>총 매수량</p>
            <p className='text-lime-400 font-mono font-bold text-lg'>
              {orderBook.bids.reduce((sum, bid) => sum + bid.quantity, 0).toFixed(2)} BTC
            </p>
          </div>
          <div className='text-center'>
            <p className='text-gray-400 mb-2 text-xs'>총 매도량</p>
            <p className='text-red-400 font-mono font-bold text-lg'>
              {orderBook.asks.reduce((sum, ask) => sum + ask.quantity, 0).toFixed(2)} BTC
            </p>
          </div>
        </div>

        {/* 매수/매도 비율 바 */}
        {(() => {
          const totalBid = orderBook.bids.reduce((sum, bid) => sum + bid.quantity, 0);
          const totalAsk = orderBook.asks.reduce((sum, ask) => sum + ask.quantity, 0);
          const total = totalBid + totalAsk;
          const bidPercent = total > 0 ? (totalBid / total) * 100 : 50;
          return (
            <div>
              <div className='flex justify-between text-xs text-gray-400 mb-2'>
                <span className='font-semibold'>매수 {bidPercent.toFixed(1)}%</span>
                <span className='font-semibold'>매도 {(100 - bidPercent).toFixed(1)}%</span>
              </div>
              <div className='h-3 rounded-full overflow-hidden bg-red-500/30 flex'>
                <div
                  className='h-full bg-lime-500 transition-all duration-300'
                  style={{ width: `${bidPercent}%` }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      {/* 오더북 보는 법 설명 */}
      <div className='mt-4 pt-3 border-t border-white/10'>
        <details className='group'>
          <summary className='text-xs text-orange-400 font-semibold cursor-pointer hover:text-orange-300 flex items-center gap-1'>
            <span>📚 오더북 보는 법</span>
            <span className='text-gray-500 group-open:rotate-180 transition-transform'>▼</span>
          </summary>
          <div className='mt-3 space-y-3 text-[10px] text-gray-300'>
            {/* 기본 구조 */}
            <div>
              <p className='text-gray-400 font-semibold mb-1'>기본 구조</p>
              <p><span className='text-red-400'>빨간색 (위)</span> = 매도 호가 (팔려는 물량)</p>
              <p><span className='text-lime-400'>초록색 (아래)</span> = 매수 호가 (사려는 물량)</p>
            </div>

            {/* 스프레드 */}
            <div>
              <p className='text-gray-400 font-semibold mb-1'>스프레드</p>
              <p>최우선 매도가 - 최우선 매수가</p>
              <p className='text-gray-500'>좁으면 유동성 좋음, 넓으면 슬리피지 주의</p>
            </div>

            {/* 매수/매도 비율 해석 */}
            <div>
              <p className='text-gray-400 font-semibold mb-1'>비율 해석</p>
              <p><span className='text-lime-400'>매수 &gt; 매도</span> → 지지력 강함, 상승 가능성</p>
              <p><span className='text-red-400'>매도 &gt; 매수</span> → 저항력 강함, 하락 가능성</p>
            </div>

            {/* 벽 (Wall) */}
            <div>
              <p className='text-gray-400 font-semibold mb-1'>벽 (Wall)</p>
              <p>특정 가격에 큰 물량이 쌓인 것</p>
              <p className='text-lime-400'>매수벽 뚫림 → 급락 신호</p>
              <p className='text-red-400'>매도벽 뚫림 → 급등 신호</p>
            </div>

            {/* 주의사항 */}
            <div className='bg-yellow-500/10 border border-yellow-500/30 rounded p-2'>
              <p className='text-yellow-400 font-semibold mb-1'>⚠️ 주의</p>
              <p>• 스푸핑: 큰 주문 후 취소 (페이크)</p>
              <p>• 오더북만 보고 매매 금지</p>
              <p>• 차트 + 오더북 조합해서 판단</p>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
