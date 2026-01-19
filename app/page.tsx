'use client';

import { useState, useEffect } from 'react';
import ChartAdapter from '@/components/ChartAdapter';
import MTFOverview from '@/components/MTFOverview';
import { BarChart3, Table2, BookOpen, Bitcoin } from 'lucide-react';
import { useBTCPrice } from '@/hooks/useBTCPrice';
import { AnimatedPrice } from '@/components/shared';

type TabType = 'chart' | 'mtf' | 'glossary';

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'mtf', label: '분석', icon: <Table2 className="w-4 h-4" /> },
  { id: 'chart', label: '차트', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'glossary', label: '용어', icon: <BookOpen className="w-4 h-4" /> },
];

const TAB_STORAGE_KEY = 'active-tab';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('mtf');
  const [isTabLoaded, setIsTabLoaded] = useState(false);
  const btcPrice = useBTCPrice();

  // localStorage에서 탭 상태 복원
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem(TAB_STORAGE_KEY) as TabType | null;
      if (savedTab && ['chart', 'mtf', 'glossary'].includes(savedTab)) {
        setActiveTab(savedTab);
      }
      setIsTabLoaded(true);
    }
  }, []);

  // 탭 변경 시 저장
  useEffect(() => {
    if (isTabLoaded && typeof window !== 'undefined') {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }
  }, [activeTab, isTabLoaded]);

  return (
    <div className='min-h-screen bg-[#0a0a0a] bg-pattern relative overflow-hidden'>
      {/* 배경 장식 - 무채색 블러 글로우 */}
      <div className='absolute top-0 left-0 w-[500px] h-[500px] bg-gray-500/10 rounded-full blur-[120px] -translate-x-1/3 -translate-y-1/3'></div>
      <div className='absolute bottom-0 right-0 w-[400px] h-[400px] bg-gray-600/8 rounded-full blur-[100px] translate-x-1/4 translate-y-1/4'></div>
      <div className='absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gray-400/5 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2'></div>

      {/* 탭 네비게이션 - 상단 고정 */}
      <div className='sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/10'>
        <div className='flex items-center justify-between p-2'>
          {/* 실시간 BTC 가격 - 좌측 (로딩 시 플레이스홀더) */}
          <div className='flex items-center gap-2 px-3 min-w-[200px]'>
            <span className='w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0'>
              <Bitcoin className='w-3.5 h-3.5 text-black' strokeWidth={2.5} />
            </span>
            <span className='text-xs text-gray-400 font-medium leading-none'>BTC/USDT</span>
            {btcPrice ? (
              <>
                <span className='text-lg font-bold font-mono text-white'>
                  <AnimatedPrice value={btcPrice.price} />
                </span>
                {btcPrice.changePercent24h !== 0 && (
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded transition-all duration-300 ${btcPrice.changePercent24h >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {btcPrice.changePercent24h >= 0 ? '+' : ''}{btcPrice.changePercent24h.toFixed(2)}%
                  </span>
                )}
              </>
            ) : (
              <span className='text-lg font-mono text-gray-500 animate-pulse'>$---,---</span>
            )}
          </div>
          {/* 탭 메뉴 + 알림 버튼 - 우측 */}
          <div className='flex items-center gap-1'>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className='relative z-10 p-4 md:p-8'>
        {/* 차트 탭 - 모든 타임프레임 그리드 */}
        {activeTab === 'chart' && (
          <div className='flex flex-col h-[calc(100vh-120px)]'>
            {/* 차트 범례 스크롤 티커 */}
            <div className='overflow-hidden border-b border-white/5 pb-2 mb-2'>
              <div className='flex animate-ticker whitespace-nowrap text-[11px]'>
                {[0, 1].map((repeat) => (
                  <div key={repeat} className='flex items-center gap-6 px-4 text-gray-400'>
                    <span><span className='text-blue-400 font-bold'>━</span> EMA 50 (단기 추세)</span>
                    <span><span className='text-green-400 font-bold'>━</span> EMA 200 (장기 추세)</span>
                    <span className='text-gray-500'>│</span>
                    <span><span className='text-green-400'>✕</span> 골든크로스 - EMA50이 200 상향돌파 (롱 신호)</span>
                    <span><span className='text-red-400'>✕</span> 데드크로스 - EMA50이 200 하향돌파 (숏 신호)</span>
                    <span className='text-gray-500'>│</span>
                    <span><span className='text-green-400'>━━</span> 상승 다이버전스 (롱 타점)</span>
                    <span><span className='text-red-400'>━━</span> 하락 다이버전스 (숏 타점)</span>
                    <span><span className='text-gray-500'>┈┈</span> 필터링된 다이버전스 (ADX 상승 중)</span>
                    <span className='text-gray-500'>│</span>
                    <span className='inline-flex items-center gap-1'><span className='text-green-400 relative -top-[3px]'>︿</span><span className='text-red-400 relative top-[3px]'>﹀</span> CHoCH (추세전환) - 고점/저점 돌파로 추세 방향이 바뀌는 신호</span>
                    <span className='text-gray-500'>│</span>
                    <span>📈 실선=유효신호 | 점선=필터링됨 | 선이 굵을수록 강한 신호</span>
                  </div>
                ))}
              </div>
            </div>
            {/* 차트 그리드 */}
            <div className='grid grid-cols-2 md:grid-cols-3 grid-rows-2 gap-2 flex-1'>
              {['5m', '15m', '30m', '1h', '4h', '1d'].map((tf) => (
                <ChartAdapter key={tf} symbol='BTC/USDT' initialTimeframe={tf} limit={500} mini />
              ))}
            </div>
          </div>
        )}

        {/* MTF 탭 */}
        {activeTab === 'mtf' && (
          <MTFOverview symbol='BTC/USDT' />
        )}

        {/* 용어 설명 탭 */}
        {activeTab === 'glossary' && (
          <div className='backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-4'>
            <h3 className='text-sm font-bold text-gray-400 mb-3'>용어 설명</h3>

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
                <div><span className='text-red-400 font-semibold'>┄ 단기고점</span><span className='text-gray-400'> - 저항/숏 진입 구간</span></div>
                <div><span className='text-lime-400 font-semibold'>┄ 단기저점</span><span className='text-gray-400'> - 지지/롱 진입 구간</span></div>
                <div><span className='text-purple-400 font-semibold'>━ 기관 기준선(VWAP)</span><span className='text-gray-400'> - 거래량 가중 평균</span></div>
              </div>
            </div>

            {/* CVD/OI 방향 */}
            <div className='border border-green-500/20 rounded-lg p-3'>
              <h4 className='text-xs font-bold text-green-400 mb-2 border border-green-400/50 px-1.5 py-0.5 rounded inline-block'>CVD/OI 방향</h4>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs mt-2'>
                <div><span className='text-green-400 font-semibold'>↑↑↑</span><span className='text-gray-400'> - 강한 상승 (8%+ 증가)</span></div>
                <div><span className='text-teal-400 font-semibold'>↑↑</span><span className='text-gray-400'> - 상승 (4~8% 증가)</span></div>
                <div><span className='text-cyan-400 font-semibold'>↑</span><span className='text-gray-400'> - 약한 상승 (2~4% 증가)</span></div>
                <div><span className='text-gray-400 font-semibold'>→</span><span className='text-gray-400'> - 횡보 (2% 미만 변동)</span></div>
                <div><span className='text-amber-400 font-semibold'>↓</span><span className='text-gray-400'> - 약한 하락 (2~4% 감소)</span></div>
                <div><span className='text-orange-400 font-semibold'>↓↓</span><span className='text-gray-400'> - 하락 (4~8% 감소)</span></div>
                <div><span className='text-red-400 font-semibold'>↓↓↓</span><span className='text-gray-400'> - 강한 하락 (8%+ 감소)</span></div>
              </div>
            </div>

            {/* ADX/ATR 기준 */}
            <div className='border border-orange-500/20 rounded-lg p-3'>
              <h4 className='text-xs font-bold text-orange-400 mb-2 border border-orange-400/50 px-1.5 py-0.5 rounded inline-block'>ADX/ATR</h4>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs mt-2'>
                <div><span className='text-orange-400 font-semibold'>ADX 25+🔥</span><span className='text-gray-400'> - 강한 추세. 역추세 진입 위험</span></div>
                <div><span className='text-gray-400 font-semibold'>ADX 25 미만</span><span className='text-gray-400'> - 약한 추세. 횡보 가능성</span></div>
                <div><span className='text-red-400 font-semibold'>ATR 1.5x+</span><span className='text-gray-400'> - 고변동. 손절 넓게, 포지션 작게</span></div>
                <div><span className='text-blue-400 font-semibold'>ATR 0.8x↓</span><span className='text-gray-400'> - 저변동. 브레이크아웃 대기</span></div>
              </div>
            </div>

            {/* MTF Action 설명 추가 */}
            <div className='border border-blue-500/20 rounded-lg p-3'>
              <h4 className='text-xs font-bold text-blue-400 mb-2 border border-blue-400/50 px-1.5 py-0.5 rounded inline-block'>MTF Action</h4>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs mt-2'>
                <div><span className='text-green-400 font-semibold'>🟢 롱 OK</span><span className='text-gray-400'> - 추세+다이버전스 일치. 롱 진입 가능</span></div>
                <div><span className='text-red-400 font-semibold'>🔴 숏 OK</span><span className='text-gray-400'> - 추세+다이버전스 일치. 숏 진입 가능</span></div>
                <div><span className='text-amber-400 font-semibold'>⚠️ 반전주의</span><span className='text-gray-400'> - 역추세 다이버전스 또는 RSI 과열</span></div>
                <div><span className='text-blue-400 font-semibold'>→ 추세유지</span><span className='text-gray-400'> - 상승/하락추세 유지. 눌림목 대기</span></div>
                <div><span className='text-gray-400 font-semibold'>⏸ 대기</span><span className='text-gray-400'> - 명확한 신호 없음. 관망</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
