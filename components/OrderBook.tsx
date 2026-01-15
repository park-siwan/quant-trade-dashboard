'use client';

import { useOrderBook, OrderBookLevel, RatioHistoryPoint } from '@/hooks/useOrderBook';
import { calculateSMA } from '@/lib/utils/math';
import { ORDERBOOK_COLORS } from '@/lib/colors';

interface OrderBookProps {
  symbol?: string;
  limit?: number;
}

// 미니 차트 컴포넌트
function RatioChart({ data }: { data: RatioHistoryPoint[] }) {
  if (data.length < 2) {
    return (
      <div className='h-16 flex items-center justify-center text-gray-500 text-xs'>
        데이터 수집 중...
      </div>
    );
  }

  const width = 260;
  const height = 60;
  const padding = { top: 5, bottom: 5, left: 0, right: 0 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 20개 포인트 이동평균으로 스무딩 (60초 평균)
  const rawRatios = data.map(d => d.bidRatio);
  const smoothedRatios = calculateSMA(rawRatios, 20);

  // Y축 범위: 35~65% (스무딩 후 더 좁은 범위)
  const minY = 35;
  const maxY = 65;
  const yRange = maxY - minY;

  // 데이터 포인트를 SVG 좌표로 변환 (스무딩된 값 사용)
  const points = smoothedRatios.map((ratio, index) => {
    const x = padding.left + (index / (smoothedRatios.length - 1)) * chartWidth;
    const clampedRatio = Math.max(minY, Math.min(maxY, ratio));
    const y = padding.top + chartHeight - ((clampedRatio - minY) / yRange) * chartHeight;
    return { x, y, ratio };
  });

  // SVG path 생성
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // 영역 채우기를 위한 path (50% 라인 기준)
  const baseY = padding.top + chartHeight - ((50 - minY) / yRange) * chartHeight;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;

  // 현재 비율 (스무딩된 값)
  const currentRatio = smoothedRatios[smoothedRatios.length - 1] ?? 50;
  // 2분 전 대비 (40개 포인트 = 120초)
  const trendDirection = smoothedRatios.length > 40
    ? currentRatio - smoothedRatios[smoothedRatios.length - 40]
    : 0;

  // 색상 결정 (매수 우세: 초록, 매도 우세: 빨강)
  const isAbove50 = currentRatio > 50;
  const strokeColor = isAbove50 ? ORDERBOOK_COLORS.CHART_BID : ORDERBOOK_COLORS.CHART_ASK;
  const fillColor = isAbove50 ? ORDERBOOK_COLORS.CHART_BID_FILL : ORDERBOOK_COLORS.CHART_ASK_FILL;

  return (
    <div className='relative'>
      {/* 헤더 */}
      <div className='flex items-center justify-between mb-1'>
        <span className='text-[10px] text-gray-400'>매수/매도 비율 추이 (15분)</span>
        <div className='flex items-center gap-1'>
          <span className={`text-xs font-mono font-bold ${isAbove50 ? 'text-lime-400' : 'text-red-400'}`}>
            {currentRatio.toFixed(1)}%
          </span>
          {trendDirection !== 0 && (
            <span className={`text-[10px] ${trendDirection > 0 ? 'text-lime-400' : 'text-red-400'}`}>
              {trendDirection > 0 ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {/* 차트 */}
      <svg width={width} height={height} className='overflow-visible'>
        {/* 50% 기준선 */}
        <line
          x1={padding.left}
          y1={baseY}
          x2={width - padding.right}
          y2={baseY}
          stroke={ORDERBOOK_COLORS.GRID}
          strokeDasharray='4,4'
        />

        {/* 영역 채우기 */}
        <path d={areaPath} fill={fillColor} />

        {/* 라인 */}
        <path d={linePath} fill='none' stroke={strokeColor} strokeWidth='2' />

        {/* 현재 포인트 */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r='4'
          fill={strokeColor}
        />

        {/* Y축 레이블 */}
        <text x={width - 2} y={padding.top + 8} fontSize='8' fill={ORDERBOOK_COLORS.TEXT_MUTED} textAnchor='end'>
          {maxY}%
        </text>
        <text x={width - 2} y={baseY + 3} fontSize='8' fill={ORDERBOOK_COLORS.TEXT_MUTED} textAnchor='end'>
          50%
        </text>
        <text x={width - 2} y={height - padding.bottom} fontSize='8' fill={ORDERBOOK_COLORS.TEXT_MUTED} textAnchor='end'>
          {minY}%
        </text>
      </svg>

      {/* 범례 */}
      <div className='flex justify-between text-[9px] text-gray-500 mt-1'>
        <span>15분 전</span>
        <span>현재</span>
      </div>
    </div>
  );
}

export default function OrderBook({ symbol = 'BTCUSDT', limit = 20 }: OrderBookProps) {
  const { orderBook, ratioHistory, isConnected, error } = useOrderBook({ symbol, limit });

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
    <div className='backdrop-blur-sm bg-white/[0.1] border border-white/10 rounded-2xl p-4 shadow-2xl h-full flex flex-col'>
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
                {/* 백그라운드 바 (매도 = 빨강) + 글로우 */}
                <div
                  className='absolute right-0 top-0 h-full transition-all duration-300'
                  style={{
                    width: `${widthPercent}%`,
                    background: ORDERBOOK_COLORS.ASK_GRADIENT,
                    boxShadow: ORDERBOOK_COLORS.ASK_GLOW
                  }}
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
        {(() => {
          // 스프레드 상태 판단
          const getSpreadStatus = () => {
            if (spreadPercent < 0.005) return { level: 'good', color: 'text-lime-400', bg: 'bg-lime-500/20', label: '좋음', advice: '시장가 OK' };
            if (spreadPercent < 0.01) return { level: 'normal', color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '보통', advice: '지정가 권장' };
            if (spreadPercent < 0.03) return { level: 'wide', color: 'text-orange-400', bg: 'bg-orange-500/20', label: '넓음', advice: '지정가 필수' };
            return { level: 'danger', color: 'text-red-400', bg: 'bg-red-500/20', label: '위험', advice: '매매 자제' };
          };
          const status = getSpreadStatus();

          return (
            <div className='py-2 px-2 bg-gradient-to-r from-red-500/5 via-purple-500/10 to-lime-500/5 border-y border-white/10 my-1 group relative'>
              <div className='flex items-center justify-between text-xs'>
                <div className='flex items-center gap-1'>
                  <span className='text-gray-400'>스프레드</span>
                  <span className={`${status.bg} ${status.color} px-1.5 py-0.5 rounded text-[10px] font-semibold`}>
                    {status.label}
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='text-purple-400 font-mono font-semibold'>${spread.toFixed(1)}</span>
                  <span className='text-gray-400'>({spreadPercent.toFixed(4)}%)</span>
                </div>
              </div>
              {/* 툴팁 */}
              <div className='absolute left-0 right-0 top-full mt-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none'>
                <div className='bg-gray-900/95 border border-white/20 rounded-lg p-3 shadow-xl text-[10px]'>
                  <p className='text-gray-300 font-semibold mb-2'>스프레드 = 최우선 매도가 - 최우선 매수가</p>
                  <div className='space-y-1.5'>
                    <div className='flex justify-between'>
                      <span className='text-lime-400'>● 0.005% 미만</span>
                      <span className='text-gray-400'>유동성 좋음, 시장가 가능</span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-yellow-400'>● 0.005~0.01%</span>
                      <span className='text-gray-400'>보통, 지정가 권장</span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-orange-400'>● 0.01~0.03%</span>
                      <span className='text-gray-400'>넓음, 지정가 필수</span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-red-400'>● 0.03% 이상</span>
                      <span className='text-gray-400'>위험, 슬리피지 큼</span>
                    </div>
                  </div>
                  <div className='mt-2 pt-2 border-t border-white/10'>
                    <p className='text-yellow-400'>💡 현재: {status.advice}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 매수 호가 */}
        <div>
          {orderBook.bids.slice(0, limit).map((bid, index) => {
            const widthPercent = maxTotal > 0 ? (bid.total / maxTotal) * 100 : 0;
            return (
              <div key={`bid-${index}`} className='relative px-2 py-0.5 hover:bg-white/5 transition-colors'>
                {/* 백그라운드 바 (매수 = 초록) + 글로우 */}
                <div
                  className='absolute right-0 top-0 h-full transition-all duration-300'
                  style={{
                    width: `${widthPercent}%`,
                    background: ORDERBOOK_COLORS.BID_GRADIENT,
                    boxShadow: ORDERBOOK_COLORS.BID_GLOW
                  }}
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
              <div
                className='relative h-3 rounded-full'
                style={{
                  background: ORDERBOOK_COLORS.ASK_BAR_GRADIENT,
                  boxShadow: ORDERBOOK_COLORS.ASK_BAR_GLOW
                }}
              >
                {/* 초록 (매수) - 빨강 배경 위에 덮음 */}
                <div
                  className='absolute left-0 top-0 h-full rounded-l-full transition-all duration-300'
                  style={{
                    width: `${bidPercent}%`,
                    background: ORDERBOOK_COLORS.BID_BAR_GRADIENT,
                    boxShadow: ORDERBOOK_COLORS.BID_BAR_GLOW
                  }}
                />
              </div>
            </div>
          );
        })()}

        {/* 비율 추이 차트 */}
        <div className='mt-4 pt-4 border-t border-white/10'>
          <RatioChart data={ratioHistory} />
        </div>
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
