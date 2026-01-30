'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  ComposedChart,
  Area,
  Line,
} from 'recharts';
import { RefreshCw, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { fetchCurrentRegime, type CurrentRegimeStatus, type RegimeHistoryPoint } from '@/lib/api/backtest';

interface RegimeStats {
  regime: string;
  count: number;
  avgPnl: number;
  winRate: number;
  trades: number;
  color: string;
}

interface TransitionMatrix {
  from: string;
  toBullish: number;
  toSideways: number;
  toBearish: number;
}

interface RegimeAnalysisProps {
  symbol?: string;
  timeframe?: string;
  regimeData?: {
    distribution: { regime: string; count: number; percentage: number }[];
    performance: { regime: string; avgPnl: number; winRate: number; trades: number }[];
    transitionMatrix: number[][];
    accuracy: number;
  };
}

// 기본값 (API 로딩 전)
const DEFAULT_REGIME: CurrentRegimeStatus = {
  regime: 'Sideways',
  regimeNum: 1,
  confidence: 0,
  price: 0,
  sma50: 0,
  sma200: 0,
  timestamp: '',
  recommendedAction: '로딩 중...',
  nextLikelyRegime: 'Sideways',
  nextLikelyProbability: 70,
  distribution: [],
  transitionMatrix: null,
  symbol: 'BTCUSDT',
  timeframe: '5m',
};

// 샘플 데이터 (API 연동 전 테스트용)
const SAMPLE_DATA = {
  distribution: [
    { regime: 'Bullish', count: 4, percentage: 31 },
    { regime: 'Sideways', count: 6, percentage: 46 },
    { regime: 'Bearish', count: 3, percentage: 23 },
  ],
  performance: [
    { regime: 'Bullish', avgPnl: -0.45, winRate: 25, trades: 18 },
    { regime: 'Sideways', avgPnl: 0.82, winRate: 67, trades: 42 },
    { regime: 'Bearish', avgPnl: -0.31, winRate: 33, trades: 15 },
  ],
  transitionMatrix: [
    [0.72, 0.18, 0.10],  // Bullish → [Bull, Side, Bear]
    [0.15, 0.70, 0.15],  // Sideways → [Bull, Side, Bear]
    [0.08, 0.22, 0.70],  // Bearish → [Bull, Side, Bear]
  ],
  accuracy: 68,
};

const REGIME_COLORS = {
  Bullish: '#22c55e',
  Sideways: '#f59e0b',
  Bearish: '#ef4444',
};

// 기간 옵션 정의
const PERIOD_OPTIONS = [
  { label: '1주', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
  { label: '5개월', days: 150 },
];

export default function RegimeAnalysis({ symbol = 'BTCUSDT', timeframe = '5m', regimeData }: RegimeAnalysisProps) {
  const [currentRegime, setCurrentRegime] = useState<CurrentRegimeStatus>(DEFAULT_REGIME);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMethodInfo, setShowMethodInfo] = useState(false);
  const [periodDays, setPeriodDays] = useState(150); // 기본 5개월

  // API에서 현재 레짐 가져오기
  const fetchRegime = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCurrentRegime(symbol, timeframe, periodDays);
      setCurrentRegime(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '레짐 조회 실패');
      console.error('Regime fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, periodDays]);

  // 마운트 시 + 1분마다 자동 갱신
  useEffect(() => {
    fetchRegime();
    const interval = setInterval(fetchRegime, 60000); // 1분마다 갱신
    return () => clearInterval(interval);
  }, [fetchRegime]);

  const data = regimeData || SAMPLE_DATA;

  // API에서 가져온 distribution 사용 (있으면)
  const pieData = useMemo(() => {
    const dist = currentRegime.distribution?.length > 0
      ? currentRegime.distribution
      : data.distribution;
    return dist.map((d) => ({
      name: d.regime,
      value: d.count,
      percentage: d.percentage,
      color: REGIME_COLORS[d.regime as keyof typeof REGIME_COLORS] || '#71717a',
    }));
  }, [currentRegime.distribution, data.distribution]);

  const performanceData = useMemo(() => {
    return data.performance.map((p) => ({
      ...p,
      color: REGIME_COLORS[p.regime as keyof typeof REGIME_COLORS] || '#71717a',
    }));
  }, [data.performance]);

  // API에서 가져온 transitionMatrix 사용 (있으면)
  const transitionData: TransitionMatrix[] = useMemo(() => {
    const labels = ['Bullish', 'Sideways', 'Bearish'];
    const matrix = currentRegime.transitionMatrix || data.transitionMatrix;
    return labels.map((from, i) => ({
      from,
      toBullish: Math.round(matrix[i][0] * 100),
      toSideways: Math.round(matrix[i][1] * 100),
      toBearish: Math.round(matrix[i][2] * 100),
    }));
  }, [currentRegime.transitionMatrix, data.transitionMatrix]);

  // 레짐 히스토리 차트 데이터
  const regimeHistoryData = useMemo(() => {
    const history = currentRegime.regimeHistory || [];
    return history.map((point) => ({
      ...point,
      // 차트에서 영역 표시를 위해 regimeNum을 변환
      bullishArea: point.regimeNum === 2 ? 3 : null,
      sidewaysArea: point.regimeNum === 1 ? 2 : null,
      bearishArea: point.regimeNum === 0 ? 1 : null,
      // 시간 포맷팅
      time: new Date(point.timestamp).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));
  }, [currentRegime.regimeHistory]);

  // 현재 레짐에 따른 스타일 및 텍스트
  const getRegimeStyle = (regime: string) => {
    switch (regime) {
      case 'Bullish':
        return {
          bg: 'bg-gradient-to-r from-green-900/60 to-green-800/40',
          border: 'border-green-500',
          text: 'text-green-400',
          icon: '📈',
          description: '상승 추세 구간',
        };
      case 'Bearish':
        return {
          bg: 'bg-gradient-to-r from-red-900/60 to-red-800/40',
          border: 'border-red-500',
          text: 'text-red-400',
          icon: '📉',
          description: '하락 추세 구간',
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-amber-900/60 to-amber-800/40',
          border: 'border-amber-500',
          text: 'text-amber-400',
          icon: '📊',
          description: '횡보/조정 구간',
        };
    }
  };

  const currentStyle = getRegimeStyle(currentRegime.regime);
  const priceVsSma50 = currentRegime.sma50 > 0
    ? ((currentRegime.price / currentRegime.sma50 - 1) * 100).toFixed(2)
    : '0.00';
  const priceVsSma200 = currentRegime.sma200 > 0
    ? ((currentRegime.price / currentRegime.sma200 - 1) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-4">
      {/* 현재 레짐 상태 (최상단) */}
      <div className={`${currentStyle.bg} p-5 rounded-lg border-2 ${currentStyle.border} relative`}>
        {/* 로딩/에러 표시 */}
        {loading && (
          <div className="absolute top-2 right-2 flex items-center gap-2 text-xs text-zinc-400">
            <RefreshCw size={14} className="animate-spin" />
            로딩 중...
          </div>
        )}
        {error && (
          <div className="absolute top-2 right-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* 새로고침 버튼 */}
        <button
          onClick={fetchRegime}
          disabled={loading}
          className="absolute top-2 right-2 p-2 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw size={16} className={`text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* 메인 레짐 표시 */}
          <div className="flex items-center gap-4">
            <div className="text-5xl">{currentStyle.icon}</div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">현재 시장 레짐 ({currentRegime.symbol} {currentRegime.timeframe})</div>
              <div className={`text-3xl font-bold ${currentStyle.text}`}>
                {currentRegime.regime}
              </div>
              <div className="text-sm text-zinc-300">{currentStyle.description}</div>
            </div>
          </div>

          {/* 신뢰도 및 다음 예측 */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="text-center px-4 py-2 bg-black/30 rounded-lg">
              <div className="text-xs text-zinc-500">신뢰도</div>
              <div className={`text-2xl font-bold ${currentStyle.text}`}>
                {currentRegime.confidence}%
              </div>
            </div>
            <div className="text-center px-4 py-2 bg-black/30 rounded-lg">
              <div className="text-xs text-zinc-500">다음 유지 확률</div>
              <div className="text-2xl font-bold text-white">
                {currentRegime.nextLikelyProbability}%
              </div>
            </div>
          </div>

          {/* 가격 vs SMA */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="px-3 py-2 bg-black/30 rounded">
              <div className="text-xs text-zinc-500">vs SMA50</div>
              <div className={Number(priceVsSma50) >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {Number(priceVsSma50) >= 0 ? '+' : ''}{priceVsSma50}%
              </div>
            </div>
            <div className="px-3 py-2 bg-black/30 rounded">
              <div className="text-xs text-zinc-500">vs SMA200</div>
              <div className={Number(priceVsSma200) >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {Number(priceVsSma200) >= 0 ? '+' : ''}{priceVsSma200}%
              </div>
            </div>
            <div className="px-3 py-2 bg-black/30 rounded col-span-2">
              <div className="text-xs text-zinc-500">현재가</div>
              <div className="text-white font-semibold">
                ${(currentRegime.price ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* 추천 액션 */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">추천 액션:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${currentStyle.bg} ${currentStyle.text} border ${currentStyle.border}`}>
                {currentRegime.recommendedAction}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {currentRegime.method && (
                <span className={`px-2 py-0.5 rounded ${currentRegime.method === 'HMM' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}`}>
                  {currentRegime.method}
                </span>
              )}
              <span>업데이트: {currentRegime.timestamp}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 헤더 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white mb-2">
            {currentRegime.method === 'HMM' ? 'HMM' : 'GMM'} 레짐 분석
            {currentRegime.method === 'GMM' && (
              <span className="ml-2 text-xs font-normal text-zinc-500">(HMM 미설치로 GMM 사용)</span>
            )}
          </h3>
          <button
            onClick={() => setShowMethodInfo(!showMethodInfo)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-300"
          >
            <Info size={14} />
            HMM vs GMM 설명
            {showMethodInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          시장 상태를 Bullish/Sideways/Bearish로 분류하고, Sideways에서만 RSI 다이버전스 진입
        </p>
      </div>

      {/* 레짐 추세 차트 */}
      {regimeHistoryData.length > 0 && (
        <div className="bg-zinc-900 p-4 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-white">
              레짐 추세 (최근 {PERIOD_OPTIONS.find(p => p.days === periodDays)?.label || `${periodDays}일`})
            </h4>
            {/* 기간 선택 버튼 */}
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => setPeriodDays(opt.days)}
                  disabled={loading}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    periodDays === opt.days
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  } disabled:opacity-50`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            시간에 따른 레짐 변화와 가격 흐름. 색상 영역은 해당 시점의 레짐을 나타냅니다.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={regimeHistoryData}>
              <defs>
                <linearGradient id="bullishGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="sidewaysGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="bearishGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#71717a', fontSize: 9 }}
                axisLine={{ stroke: '#3f3f46' }}
                interval="preserveStartEnd"
                tickCount={8}
              />
              <YAxis
                yAxisId="regime"
                domain={[0, 3.5]}
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: '#3f3f46' }}
                ticks={[1, 2, 3]}
                tickFormatter={(v) => {
                  if (v === 1) return 'Bear';
                  if (v === 2) return 'Side';
                  if (v === 3) return 'Bull';
                  return '';
                }}
                width={40}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                domain={['dataMin * 0.995', 'dataMax * 1.005']}
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(value: number | null, name: string) => {
                  if (name === 'price') return [`$${value?.toLocaleString()}`, '가격'];
                  if (name === 'bullishArea' && value) return ['Bullish', '레짐'];
                  if (name === 'sidewaysArea' && value) return ['Sideways', '레짐'];
                  if (name === 'bearishArea' && value) return ['Bearish', '레짐'];
                  return [null, null];
                }}
              />
              {/* 레짐 영역 */}
              <Area
                yAxisId="regime"
                type="stepAfter"
                dataKey="bullishArea"
                fill="url(#bullishGradient)"
                stroke="#22c55e"
                strokeWidth={0}
                connectNulls={false}
              />
              <Area
                yAxisId="regime"
                type="stepAfter"
                dataKey="sidewaysArea"
                fill="url(#sidewaysGradient)"
                stroke="#f59e0b"
                strokeWidth={0}
                connectNulls={false}
              />
              <Area
                yAxisId="regime"
                type="stepAfter"
                dataKey="bearishArea"
                fill="url(#bearishGradient)"
                stroke="#ef4444"
                strokeWidth={0}
                connectNulls={false}
              />
              {/* 가격 라인 */}
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded" style={{ background: 'linear-gradient(to bottom, rgba(34,197,94,0.6), rgba(34,197,94,0.1))' }} />
              <span className="text-zinc-400">Bullish</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded" style={{ background: 'linear-gradient(to bottom, rgba(245,158,11,0.6), rgba(245,158,11,0.1))' }} />
              <span className="text-zinc-400">Sideways</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded" style={{ background: 'linear-gradient(to bottom, rgba(239,68,68,0.6), rgba(239,68,68,0.1))' }} />
              <span className="text-zinc-400">Bearish</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-blue-400" />
              <span className="text-zinc-400">Price</span>
            </div>
          </div>
        </div>
      )}

      {/* HMM vs GMM 상세 설명 */}
      {showMethodInfo && (
        <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-700 space-y-4">
          <h4 className="text-md font-semibold text-white flex items-center gap-2">
            <Info size={18} className="text-blue-400" />
            레짐 감지 알고리즘 비교: HMM vs GMM
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* HMM 설명 */}
            <div className="p-4 bg-blue-950/30 border border-blue-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded bg-blue-900/50 text-blue-400 text-xs font-semibold">HMM</span>
                <span className="text-white font-medium">Hidden Markov Model</span>
                <span className="text-green-400 text-xs">(권장)</span>
              </div>
              <p className="text-sm text-zinc-300 mb-3">
                <strong className="text-blue-400">은닉 마르코프 모델</strong>은 시계열 데이터에서 관측할 수 없는 &quot;숨겨진 상태&quot;를 추정하는 확률적 모델입니다.
              </p>

              <div className="space-y-2 text-xs text-zinc-400">
                <div className="p-2 bg-black/30 rounded">
                  <strong className="text-zinc-200">핵심 원리:</strong>
                  <ul className="mt-1 ml-3 space-y-1">
                    <li>• 시장은 &quot;숨겨진 상태&quot;(레짐)를 가진다고 가정</li>
                    <li>• 현재 상태는 이전 상태에 의존 (마르코프 속성)</li>
                    <li>• 상태 간 &quot;전이 확률&quot;을 학습하여 다음 상태 예측</li>
                  </ul>
                </div>

                <div className="p-2 bg-black/30 rounded">
                  <strong className="text-zinc-200">장점:</strong>
                  <ul className="mt-1 ml-3 space-y-1">
                    <li>• <span className="text-green-400">시간 순서 고려</span> - 과거→현재 흐름 반영</li>
                    <li>• <span className="text-green-400">전이 확률 제공</span> - 다음 상태 예측 가능</li>
                    <li>• <span className="text-green-400">노이즈에 강함</span> - 급격한 상태 변화 억제</li>
                    <li>• 금융 시계열에 적합 (추세 지속성 모델링)</li>
                  </ul>
                </div>

                <div className="p-2 bg-black/30 rounded">
                  <strong className="text-zinc-200">단점:</strong>
                  <ul className="mt-1 ml-3 space-y-1">
                    <li>• <span className="text-red-400">설치 복잡</span> - C++ 컴파일러 필요</li>
                    <li>• 계산 비용이 GMM보다 높음</li>
                    <li>• 초기화에 따라 결과 달라질 수 있음</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* GMM 설명 */}
            <div className="p-4 bg-purple-950/30 border border-purple-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded bg-purple-900/50 text-purple-400 text-xs font-semibold">GMM</span>
                <span className="text-white font-medium">Gaussian Mixture Model</span>
                <span className="text-amber-400 text-xs">(대체)</span>
              </div>
              <p className="text-sm text-zinc-300 mb-3">
                <strong className="text-purple-400">가우시안 혼합 모델</strong>은 데이터가 여러 개의 가우시안(정규) 분포의 혼합으로 구성된다고 가정하는 클러스터링 방식입니다.
              </p>

              <div className="space-y-2 text-xs text-zinc-400">
                <div className="p-2 bg-black/30 rounded">
                  <strong className="text-zinc-200">핵심 원리:</strong>
                  <ul className="mt-1 ml-3 space-y-1">
                    <li>• 각 데이터 포인트를 독립적으로 분류</li>
                    <li>• K개의 가우시안 분포 중 하나에 할당</li>
                    <li>• 변동성, 수익률 등 특성 기반 클러스터링</li>
                  </ul>
                </div>

                <div className="p-2 bg-black/30 rounded">
                  <strong className="text-zinc-200">장점:</strong>
                  <ul className="mt-1 ml-3 space-y-1">
                    <li>• <span className="text-green-400">설치 간단</span> - scikit-learn만 필요</li>
                    <li>• <span className="text-green-400">빠른 계산</span> - 실시간 처리 용이</li>
                    <li>• 구현이 단순하고 직관적</li>
                    <li>• 소프트 클러스터링 (확률적 할당)</li>
                  </ul>
                </div>

                <div className="p-2 bg-black/30 rounded">
                  <strong className="text-zinc-200">단점:</strong>
                  <ul className="mt-1 ml-3 space-y-1">
                    <li>• <span className="text-red-400">시간 순서 무시</span> - 각 시점 독립 처리</li>
                    <li>• <span className="text-red-400">전이 확률 없음</span> - 다음 상태 예측 불가</li>
                    <li>• 레짐 변화가 빈번할 수 있음 (노이즈에 민감)</li>
                    <li>• 추세 지속성 모델링 어려움</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 비교 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left py-2 px-3">비교 항목</th>
                  <th className="text-center py-2 px-3 text-blue-400">HMM</th>
                  <th className="text-center py-2 px-3 text-purple-400">GMM</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                <tr className="border-b border-zinc-800/50">
                  <td className="py-2 px-3 text-zinc-400">시간 순서</td>
                  <td className="py-2 px-3 text-center text-green-400">고려함 ✓</td>
                  <td className="py-2 px-3 text-center text-red-400">무시함 ✗</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-2 px-3 text-zinc-400">전이 확률</td>
                  <td className="py-2 px-3 text-center text-green-400">제공 ✓</td>
                  <td className="py-2 px-3 text-center text-red-400">없음 ✗</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-2 px-3 text-zinc-400">레짐 안정성</td>
                  <td className="py-2 px-3 text-center text-green-400">높음</td>
                  <td className="py-2 px-3 text-center text-amber-400">보통</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-2 px-3 text-zinc-400">설치 난이도</td>
                  <td className="py-2 px-3 text-center text-amber-400">어려움</td>
                  <td className="py-2 px-3 text-center text-green-400">쉬움</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-2 px-3 text-zinc-400">트레이딩 적합성</td>
                  <td className="py-2 px-3 text-center text-green-400">높음 ★</td>
                  <td className="py-2 px-3 text-center text-amber-400">보통</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 실제 사용 예시 */}
          <div className="p-3 bg-zinc-800/50 rounded-lg">
            <strong className="text-white text-sm">실제 적용 예시:</strong>
            <div className="mt-2 text-xs text-zinc-400 space-y-2">
              <div>
                <span className="text-blue-400">HMM:</span> &quot;어제 Sideways였고, 전이 확률이 70%이므로 오늘도 Sideways일 가능성이 높다&quot;<br />
                → 시간 흐름과 과거 상태를 고려하여 현재 상태 추정
              </div>
              <div>
                <span className="text-purple-400">GMM:</span> &quot;오늘 변동성이 낮고 수익률이 작으므로 Sideways 클러스터에 속한다&quot;<br />
                → 현재 시점의 특성만으로 분류 (어제 상태 무관)
              </div>
            </div>
          </div>

          {/* 현재 상태 */}
          <div className={`p-3 rounded-lg ${currentRegime.method === 'HMM' ? 'bg-blue-900/20 border border-blue-800/50' : 'bg-purple-900/20 border border-purple-800/50'}`}>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${currentRegime.method === 'HMM' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}`}>
                현재 사용 중
              </span>
              <span className="text-white font-medium">{currentRegime.method === 'HMM' ? 'Hidden Markov Model' : 'Gaussian Mixture Model'}</span>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {currentRegime.method === 'HMM'
                ? 'hmmlearn 라이브러리가 설치되어 HMM을 사용 중입니다. 전이 확률 기반의 안정적인 레짐 감지가 가능합니다.'
                : 'hmmlearn이 설치되지 않아 scikit-learn의 GMM을 대체 사용 중입니다. HMM 사용을 권장하며, 설치하려면 C++ 컴파일러(Visual Studio Build Tools)가 필요합니다.'
              }
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 레짐 분포 (파이 차트) */}
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h4 className="text-sm font-semibold text-white mb-4">레짐 분포 (13개월)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, payload }) => `${name} ${payload?.percentage ?? 0}%`}
                labelLine={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                }}
                formatter={(value) => [`${value}개월`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2 text-xs">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: d.color }} />
                <span className="text-zinc-400">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 레짐별 성과 */}
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h4 className="text-sm font-semibold text-white mb-4">레짐별 평균 수익</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={performanceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                type="number"
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="regime"
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: '#3f3f46' }}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                }}
                formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Avg PnL']}
              />
              <Bar dataKey="avgPnl" radius={[0, 4, 4, 0]}>
                {performanceData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.avgPnl >= 0 ? '#22c55e' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 text-center text-xs text-zinc-500">
            Sideways에서만 진입 시 평균 수익 향상
          </div>
        </div>
      </div>

      {/* 전이 확률 행렬 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-white mb-4">전이 확률 행렬 (Transition Matrix)</h4>
        <p className="text-xs text-zinc-500 mb-4">
          각 행은 현재 상태에서 다음 상태로 전환할 확률 (%). 대각선이 높을수록 상태 유지 경향.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-800">
                <th className="text-left py-2 px-3">현재 상태</th>
                <th className="text-center py-2 px-3">
                  <span className="text-green-400">→ Bullish</span>
                </th>
                <th className="text-center py-2 px-3">
                  <span className="text-amber-400">→ Sideways</span>
                </th>
                <th className="text-center py-2 px-3">
                  <span className="text-red-400">→ Bearish</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {transitionData.map((row) => (
                <tr key={row.from} className="border-b border-zinc-800/50">
                  <td className="py-2 px-3 font-medium" style={{ color: REGIME_COLORS[row.from as keyof typeof REGIME_COLORS] }}>
                    {row.from}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-1 rounded ${row.toBullish >= 50 ? 'bg-green-900/50 text-green-400' : 'text-zinc-400'}`}>
                      {row.toBullish}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-1 rounded ${row.toSideways >= 50 ? 'bg-amber-900/50 text-amber-400' : 'text-zinc-400'}`}>
                      {row.toSideways}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-1 rounded ${row.toBearish >= 50 ? 'bg-red-900/50 text-red-400' : 'text-zinc-400'}`}>
                      {row.toBearish}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-zinc-800/50 rounded text-xs text-zinc-400">
          <strong className="text-white">해석:</strong> Sideways → Sideways가 70%로 높음.
          한 번 횡보 구간에 들어가면 유지되는 경향이 있어 RSI 다이버전스 전략에 적합.
        </div>
      </div>

      {/* 핵심 인사이트 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-white mb-4">핵심 인사이트</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="text-xs text-zinc-500 mb-1">Sideways 진입 효과</div>
            <div className="text-xl font-bold text-green-400">+0.82%</div>
            <div className="text-xs text-zinc-500">vs Bullish -0.45%, Bearish -0.31%</div>
          </div>
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="text-xs text-zinc-500 mb-1">레짐 유지 확률</div>
            <div className="text-xl font-bold text-amber-400">70%</div>
            <div className="text-xs text-zinc-500">Sideways 상태 지속 경향</div>
          </div>
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="text-xs text-zinc-500 mb-1">거래 필터링</div>
            <div className="text-xl font-bold text-blue-400">56%</div>
            <div className="text-xs text-zinc-500">42/75 거래만 Sideways에서 진입</div>
          </div>
        </div>
      </div>

      {/* 레짐별 전략 가이드 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-white mb-4">레짐별 전략 가이드</h4>
        <div className="space-y-4">
          {/* Bullish 전략 */}
          <div className="p-4 border border-green-900/50 rounded-lg bg-green-950/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="font-semibold text-green-400">Bullish 레짐 (22.6%)</span>
            </div>
            <div className="text-sm text-zinc-300 mb-2">
              <strong>추천 전략:</strong> 추세추종 롱
            </div>
            <ul className="text-xs text-zinc-400 space-y-1 ml-4">
              <li>• 200일선 위에서만 롱 진입</li>
              <li>• 눌림목 매수 (50일선 지지 확인)</li>
              <li>• 72% 확률로 상승 추세 유지</li>
              <li>• SMA + HMM 조합 시 +2.69% 개선</li>
            </ul>
          </div>

          {/* Sideways 전략 */}
          <div className="p-4 border border-amber-900/50 rounded-lg bg-amber-950/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="font-semibold text-amber-400">Sideways 레짐 (59.2%)</span>
            </div>
            <div className="text-sm text-zinc-300 mb-2">
              <strong>추천 전략:</strong> 평균회귀 (RSI 다이버전스)
            </div>
            <ul className="text-xs text-zinc-400 space-y-1 ml-4">
              <li>• 가장 많은 비중 (약 60%)</li>
              <li>• 70% 확률로 횡보 유지</li>
              <li>• RSI 다이버전스 전략 최적</li>
              <li>• HMM 필터 적용 시 +1.30% 개선</li>
            </ul>
          </div>

          {/* Bearish 전략 */}
          <div className="p-4 border border-red-900/50 rounded-lg bg-red-950/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="font-semibold text-red-400">Bearish 레짐 (18.2%)</span>
            </div>
            <div className="text-sm text-zinc-300 mb-2">
              <strong>추천 전략:</strong> 추세추종 숏
            </div>
            <ul className="text-xs text-zinc-400 space-y-1 ml-4">
              <li>• 50일선 아래에서만 숏 진입</li>
              <li>• 반등 시 저항 확인 후 숏</li>
              <li>• 70% 확률로 하락 추세 유지</li>
              <li>• 하락 후 바로 상승보다 횡보 경유 (22%)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 트레이딩 인사이트 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-white mb-4">트레이딩 인사이트</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 모멘텀 지속성 */}
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="text-xs text-zinc-500 mb-2">모멘텀 지속성</div>
            <div className="text-sm text-zinc-300 mb-2">
              각 레짐은 평균 70% 확률로 유지됩니다.
            </div>
            <div className="text-xs text-zinc-400">
              → 추세가 한번 형성되면 역전보다 지속될 가능성이 높음<br />
              → 추세 방향으로 진입하면 승률 상승
            </div>
          </div>

          {/* V자 반등은 드묾 */}
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="text-xs text-zinc-500 mb-2">하락 후 경로</div>
            <div className="text-sm text-zinc-300 mb-2">
              Bearish → Bullish 직행은 8%에 불과
            </div>
            <div className="text-xs text-zinc-400">
              → V자 반등보다 바닥 다지기(Sideways) 경유가 많음<br />
              → 급락 후 즉시 롱보다 횡보 확인 후 진입이 유리
            </div>
          </div>

          {/* SMA 조합 효과 */}
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="text-xs text-zinc-500 mb-2">SMA + HMM 조합 효과</div>
            <div className="text-sm text-zinc-300 mb-2">
              200선/50선 룰 + HMM 레짐 필터
            </div>
            <div className="text-xs text-zinc-400">
              → SMA만 사용: -2.91%<br />
              → SMA + HMM: <span className="text-green-400">+3.55%</span> (개선 +6.46%)
            </div>
          </div>

          {/* 최적 전략 조합 */}
          <div className="p-3 bg-zinc-800/50 rounded">
            <div className="text-xs text-zinc-500 mb-2">최적 전략 조합</div>
            <div className="text-sm text-zinc-300 mb-2">
              레짐별 전략 스위칭
            </div>
            <div className="text-xs text-zinc-400">
              • Bullish + 200선 위 → 롱<br />
              • Sideways → RSI 다이버전스<br />
              • Bearish + 50선 아래 → 숏
            </div>
          </div>
        </div>
      </div>

      {/* 요약 */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-4 rounded-lg border border-blue-800/30">
        <h4 className="text-sm font-semibold text-white mb-2">요약: HMM 레짐 필터의 효과</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-xs text-zinc-500">RSI 다이버전스</div>
            <div className="text-lg font-bold text-green-400">+1.30%</div>
            <div className="text-xs text-zinc-500">HMM vs None</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">모멘텀 롱</div>
            <div className="text-lg font-bold text-green-400">+2.69%</div>
            <div className="text-xs text-zinc-500">Bullish 필터</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">SMA 전략</div>
            <div className="text-lg font-bold text-green-400">+6.46%</div>
            <div className="text-xs text-zinc-500">HMM 조합</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">레짐 유지율</div>
            <div className="text-lg font-bold text-amber-400">~70%</div>
            <div className="text-xs text-zinc-500">평균</div>
          </div>
        </div>
      </div>
    </div>
  );
}
