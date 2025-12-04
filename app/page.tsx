import CandleChart from '@/components/CandleChart';

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-6">Quant Trade Dashboard</h1>
      <p className="text-gray-400 mb-8">
        실시간 암호화폐 차트 대시보드
      </p>

      <div className="space-y-6">
        <CandleChart symbol="BTC/USDT" timeframe="5m" limit={500} />
      </div>
    </div>
  );
}
