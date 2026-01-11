import ChartAdapter from '@/components/ChartAdapter';
import MTFOverview from '@/components/MTFOverview';

export default function Home() {
  return (
    <div className='min-h-screen p-8 bg-[#0a0a0a] bg-pattern relative overflow-hidden'>
      {/* 배경 장식 - 무채색 블러 글로우 */}
      <div className='absolute top-0 left-0 w-[500px] h-[500px] bg-gray-500/10 rounded-full blur-[120px] -translate-x-1/3 -translate-y-1/3'></div>
      <div className='absolute bottom-0 right-0 w-[400px] h-[400px] bg-gray-600/8 rounded-full blur-[100px] translate-x-1/4 translate-y-1/4'></div>
      <div className='absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gray-400/5 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2'></div>

      {/* 메인 콘텐츠 */}
      <div className='relative z-10 space-y-6'>
        {/* 메인 차트 (오더북 플로팅 포함) */}
        <ChartAdapter symbol='BTC/USDT' initialTimeframe='5m' limit={1000} />

        {/* MTF Overview - 멀티 타임프레임 상태 */}
        <MTFOverview symbol='BTC/USDT' />

        {/* 용어 설명 - 카테고리별 정리 */}
        <div className='backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-4'>
          <h3 className='text-sm font-bold text-gray-400 mb-3'>📚 용어 설명</h3>

          {/* 추세 지표 */}
          <div className='border border-cyan-500/20 rounded-lg p-3'>
            <h4 className='text-xs font-bold text-cyan-400 mb-2 border border-cyan-400/50 px-1.5 py-0.5 rounded inline-block'>추세</h4>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs mt-2'>
              <div><span className='text-lime-400 font-semibold'>↑상승</span><span className='text-gray-400'> - 가격이 EMA 200 위. 롱 우세</span></div>
              <div><span className='text-red-400 font-semibold'>↓하락</span><span className='text-gray-400'> - 가격이 EMA 200 아래. 숏 우세</span></div>
              <div><span className='text-lime-400 font-semibold'>✕골든</span><span className='text-gray-400'> - EMA 50이 200 상향돌파. 롱 신호</span></div>
              <div><span className='text-red-400 font-semibold'>✕데드</span><span className='text-gray-400'> - EMA 50이 200 하향돌파. 숏 신호</span></div>
              <div><span className='text-gray-300 font-semibold'>펀비</span><span className='text-gray-400'> - 롱:숏 비율. 반대매매 참고</span></div>
              <div><span className='text-yellow-400 font-semibold'>목표(POC)</span><span className='text-gray-400'> - 가격이 돌아오는 지점</span></div>
            </div>
          </div>

          {/* 역추세 지표 */}
          <div className='border border-amber-500/20 rounded-lg p-3'>
            <h4 className='text-xs font-bold text-amber-400 mb-2 border border-amber-400/50 px-1.5 py-0.5 rounded inline-block'>역추세</h4>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs mt-2'>
              <div><span className='text-amber-300 font-semibold'>횡보</span><span className='text-gray-400'> - 가격이 일정 범위 유지. 돌파 대기</span></div>
              <div><span className='text-lime-400 font-semibold'>다이버전스 ↑</span><span className='text-gray-400'> - 가격↓ 지표↑. 반등 가능</span></div>
              <div><span className='text-red-400 font-semibold'>다이버전스 ↓</span><span className='text-gray-400'> - 가격↑ 지표↓. 하락 가능</span></div>
              <div><span className='text-orange-400 font-semibold'>변동폭(ATR)</span><span className='text-gray-400'> - Average True Range. 2% 이상 = 고변동성</span></div>
            </div>
          </div>

          {/* 고래/기관 */}
          <div className='border border-purple-500/20 rounded-lg p-3'>
            <h4 className='text-xs font-bold text-purple-400 mb-2 border border-purple-400/50 px-1.5 py-0.5 rounded inline-block'>고래/기관</h4>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs mt-2'>
              <div><span className='text-lime-400 font-semibold'>고래 매수</span><span className='text-gray-400'> - $50K+ 대량 매수. 상승 압력</span></div>
              <div><span className='text-red-400 font-semibold'>고래 매도</span><span className='text-gray-400'> - $50K+ 대량 매도. 하락 압력</span></div>
              <div><span className='text-red-400 font-semibold'>청산 ↓</span><span className='text-gray-400'> - 롱 청산 가격대. 하락 시 청산</span></div>
              <div><span className='text-lime-400 font-semibold'>청산 ↑</span><span className='text-gray-400'> - 숏 청산 가격대. 상승 시 청산</span></div>
              <div><span className='text-purple-400 font-semibold'>기관 기준선(VWAP)</span><span className='text-gray-400'> - Volume Weighted Average Price. 위=롱, 아래=숏</span></div>
            </div>
          </div>

          {/* 차트 라인 */}
          <div className='border border-white/10 rounded-lg p-3'>
            <h4 className='text-xs font-bold text-gray-400 mb-2 border border-gray-400/50 px-1.5 py-0.5 rounded inline-block'>차트 라인</h4>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs mt-2'>
              <div><span className='text-red-400'>━</span><span className='text-blue-400'>━</span><span className='text-green-400'>━</span><span className='text-gray-400'> EMA 20/50/200</span></div>
              <div><span className='text-yellow-400 font-semibold'>━ 목표(POC)</span><span className='text-gray-400'> - 최대 거래량 가격</span></div>
              <div><span className='text-red-400 font-semibold'>┄ 숏(VAH)</span><span className='text-gray-400'> - 저항/숏 진입 구간</span></div>
              <div><span className='text-lime-400 font-semibold'>┄ 롱(VAL)</span><span className='text-gray-400'> - 지지/롱 진입 구간</span></div>
              <div><span className='text-purple-400 font-semibold'>━ 기관 기준선(VWAP)</span><span className='text-gray-400'> - 거래량 가중 평균</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
