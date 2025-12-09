import ChartAdapter from '@/components/ChartAdapter';

export default function Home() {
  return (
    <div className='min-h-screen p-8 bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 relative overflow-hidden'>
      {/* 배경 장식 - 글래스모피즘 효과를 위한 그라데이션 원들 */}
      <div className='absolute top-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2'></div>
      <div className='absolute bottom-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2'></div>
      <div className='absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2'></div>

      {/* 메인 콘텐츠 */}
      <div className='relative z-10 space-y-6'>
        <div className='backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl mb-6'>
          <h1 className='text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2'>
            Quant Trade Dashboard
          </h1>
          <p className='text-gray-300'>실시간 암호화폐 차트 대시보드</p>
        </div>
        <ChartAdapter symbol='BTC/USDT' initialTimeframe='5m' limit={1000} />
      </div>
    </div>
  );
}
