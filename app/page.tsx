import ChartAdapter from '@/components/ChartAdapter';
import OrderBook from '@/components/OrderBook';

export default function Home() {
  return (
    <div className='min-h-screen p-8 bg-gradient-to-br from-amber-950 via-orange-950 to-yellow-950 relative overflow-hidden'>
      {/* 배경 장식 - 글래스모피즘 효과를 위한 그라데이션 원들 */}
      <div className='absolute top-0 left-0 w-96 h-96 bg-orange-500/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2'></div>
      <div className='absolute bottom-0 right-0 w-96 h-96 bg-amber-500/25 rounded-full blur-3xl translate-x-1/2 translate-y-1/2'></div>
      <div className='absolute top-1/2 left-1/2 w-96 h-96 bg-yellow-500/15 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2'></div>

      {/* 메인 콘텐츠 */}
      <div className='relative z-10 space-y-6'>
        {/* <div className='backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl mb-6'>
          <h1 className='text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2'>
            Quant Trade Dashboard
          </h1>
          <p className='text-gray-300'>실시간 암호화폐 차트 대시보드</p>
        </div> */}

        {/* 그리드 레이아웃: 차트(좌) + 오더북(우) */}
        <div className='grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-stretch'>
          {/* 메인 차트 */}
          <ChartAdapter symbol='BTC/USDT' initialTimeframe='5m' limit={1000} />

          {/* 오더북 사이드바 - 차트와 동일한 높이 */}
          <OrderBook symbol='BTCUSDT' limit={10} />
        </div>

        {/* 초보자를 위한 용어 설명 - 스크롤 시 보임 */}
        <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4'>
          <h3 className='text-sm font-bold text-orange-400 mb-3'>
            📚 차트 용어 설명
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs'>
            <div>
              <span className='text-lime-400 font-semibold'>X (초록)</span>
              <span className='text-gray-300'>
                {' '}
                - 골든크로스. EMA 20이 EMA 50 상향돌파. 롱 신호
              </span>
            </div>
            <div>
              <span className='text-red-400 font-semibold'>X (빨강)</span>
              <span className='text-gray-300'>
                {' '}
                - 데드크로스. EMA 20이 EMA 50 하향돌파. 숏 신호
              </span>
            </div>
            <div>
              <span className='font-semibold'>
                EMA:{' '}
                <span className='text-red-400'>20</span>
                <span className='text-gray-500'>/</span>
                <span className='text-blue-400'>50</span>
                <span className='text-gray-500'>/</span>
                <span className='text-green-400'>200</span>
              </span>
              <span className='text-gray-300'>
                {' '}
                - 이동평균선. 숫자가 클수록 장기 추세
              </span>
            </div>
            <div>
              <span className='text-amber-400 font-semibold'>
                RSI (상대강도지수)
              </span>
              <span className='text-gray-300'>
                {' '}
                - 0~100 범위. 70 이상 과매수, 30 이하 과매도
              </span>
            </div>
            <div>
              <span className='text-purple-400 font-semibold'>다이버전스</span>
              <span className='text-gray-300'>
                {' '}
                - 가격과 지표의 방향이 반대. 추세 전환 가능성 신호
              </span>
            </div>
            <div>
              <span className='text-lime-400 font-semibold'>강세 다이버전스</span>
              <span className='text-gray-300'>
                {' '}
                - 가격 하락, RSI 상승. 상승 반전 가능성
              </span>
            </div>
            <div>
              <span className='text-orange-400 font-semibold'>
                약세 다이버전스
              </span>
              <span className='text-gray-300'>
                {' '}
                - 가격 상승, RSI 하락. 하락 반전 가능성
              </span>
            </div>
            <div>
              <span className='text-gray-400 font-semibold'>필터링된 신호</span>
              <span className='text-gray-300'>
                {' '}
                - 신뢰도가 낮아 회색 점선으로 표시
              </span>
            </div>
            <div>
              <span className='text-yellow-400 font-semibold'>목표(POC) 노란선</span>
              <span className='text-gray-300'>
                {' '}
                - 가장 많이 거래된 가격. 가격이 여기로 돌아옴
              </span>
            </div>
            <div>
              <span className='text-orange-400 font-semibold'>숏(VAH) 주황 점선</span>
              <span className='text-gray-300'>
                {' '}
                - 저항 구간. 여기서 숏 진입 고려
              </span>
            </div>
            <div>
              <span className='text-lime-400 font-semibold'>롱(VAL) 초록 점선</span>
              <span className='text-gray-300'>
                {' '}
                - 지지 구간. 여기서 롱 진입 고려
              </span>
            </div>
            <div>
              <span className='text-yellow-400 font-semibold'>롱 비율</span>
              <span className='text-gray-300'>
                {' '}
                - 롱 포지션 보유자 비율. 높으면 하락 주의
              </span>
            </div>
            <div>
              <span className='text-teal-400 font-semibold'>숏 비율</span>
              <span className='text-gray-300'>
                {' '}
                - 숏 포지션 보유자 비율. 높으면 상승 주의
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
