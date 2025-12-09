import ChartAdapter from '@/components/ChartAdapter';

export default function Home() {
  return (
    <div className='min-h-screen p-8'>
      {/* <h1 className='text-4xl font-bold mb-6'>Quant Trade Dashboard</h1>
      <p className='text-gray-400 mb-8'>실시간 암호화폐 차트 대시보드</p> */}

      <div className='space-y-6'>
        <ChartAdapter symbol='BTC/USDT' initialTimeframe='5m' limit={1000} />
      </div>
    </div>
  );
}
