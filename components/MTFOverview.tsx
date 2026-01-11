'use client';

import { useState, useEffect } from 'react';
import { useMTF, getSecondsUntilClose, CANDLE_INTERVALS_SEC } from '@/hooks/useMTF';
import { MTFStatus, MTFTimeframeData } from '@/lib/types/index';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Clock } from 'lucide-react';

interface MTFOverviewProps {
  symbol: string;
}

// 상태별 아이콘 컴포넌트
const StatusIcon = ({ status }: { status: MTFStatus }) => {
  switch (status) {
    case 'bullish':
      return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
    case 'bearish':
      return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Minus className="w-3.5 h-3.5 text-gray-400" />;
  }
};

// 상태별 배경색
const getStatusBg = (status: MTFStatus) => {
  switch (status) {
    case 'bullish':
      return 'bg-green-500/20 border-green-500/30';
    case 'bearish':
      return 'bg-red-500/20 border-red-500/30';
    default:
      return 'bg-gray-500/20 border-gray-500/30';
  }
};

// RSI 색상
const getRsiColor = (rsi: number | null) => {
  if (rsi === null) return 'text-gray-400';
  if (rsi <= 30) return 'text-green-400'; // 과매도
  if (rsi >= 70) return 'text-red-400'; // 과매수
  if (rsi <= 40) return 'text-lime-400';
  if (rsi >= 60) return 'text-orange-400';
  return 'text-gray-300';
};

// 다이버전스 표시
const DivergenceDisplay = ({ divergence }: { divergence: MTFTimeframeData['divergence'] }) => {
  if (!divergence) {
    return <span className="text-gray-500">-</span>;
  }

  const isBullish = divergence.direction === 'bullish';
  const typeLabel = divergence.type?.toUpperCase() || '';

  return (
    <span className={`text-xs font-medium ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
      {isBullish ? '↑' : '↓'} {typeLabel}
    </span>
  );
};

// 카운트다운 포맷 (캔들 마감까지)
const formatCountdown = (seconds: number): string => {
  if (seconds <= 0) return '마감';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
};

// 카운트다운 컴포넌트 (캔들 마감 기준)
const CandleCountdown = ({
  timeframe,
  onRefresh
}: {
  timeframe: string;
  onRefresh: () => void;
}) => {
  const [remaining, setRemaining] = useState(() => getSecondsUntilClose(timeframe));

  useEffect(() => {
    const updateRemaining = () => {
      setRemaining(getSecondsUntilClose(timeframe));
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [timeframe]);

  const totalSeconds = CANDLE_INTERVALS_SEC[timeframe] || 300;
  const progress = remaining / totalSeconds;

  // 마감 임박 시 색상 변경
  const isNearClose = remaining <= 30;
  const progressColor = isNearClose ? 'text-red-400' : 'text-orange-400';

  return (
    <button
      onClick={onRefresh}
      className={`flex items-center gap-1 text-[10px] transition-colors ${
        isNearClose ? 'text-red-400' : 'text-gray-500 hover:text-gray-300'
      }`}
      title={`캔들 마감까지 ${formatCountdown(remaining)} (클릭하여 갱신)`}
    >
      <div className="relative w-3 h-3">
        <svg className="w-3 h-3 -rotate-90" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.2"
          />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${progress * 37.7} 37.7`}
            className={progressColor}
          />
        </svg>
      </div>
      <span className="font-mono">{formatCountdown(remaining)}</span>
    </button>
  );
};

// 타임프레임 행 컴포넌트
const TimeframeRow = ({
  data,
  onRefresh
}: {
  data: MTFTimeframeData;
  onRefresh: () => void;
}) => {
  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      <td className="px-3 py-2 text-xs font-mono font-semibold text-gray-300">
        {data.timeframe}
      </td>
      <td className="px-3 py-2">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${getStatusBg(data.trend)}`}>
          <StatusIcon status={data.trend} />
          <span className={`text-xs ${
            data.trend === 'bullish' ? 'text-green-400' :
            data.trend === 'bearish' ? 'text-red-400' : 'text-gray-400'
          }`}>
            {data.trend === 'bullish' ? '상승' :
             data.trend === 'bearish' ? '하락' : '중립'}
          </span>
        </div>
      </td>
      <td className={`px-3 py-2 text-xs font-mono ${getRsiColor(data.rsi)}`}>
        {data.rsi !== null ? data.rsi.toFixed(0) : '-'}
      </td>
      <td className="px-3 py-2">
        <StatusIcon status={data.cvdDirection} />
      </td>
      <td className="px-3 py-2">
        <StatusIcon status={data.oiDirection} />
      </td>
      <td className="px-3 py-2">
        <DivergenceDisplay divergence={data.divergence} />
      </td>
      <td className="px-3 py-2">
        <CandleCountdown
          timeframe={data.timeframe}
          onRefresh={onRefresh}
        />
      </td>
    </tr>
  );
};

// 강도 레벨 텍스트
const getStrengthLabel = (score: number): { label: string; color: string } => {
  if (score >= 0.83) return { label: '매우 강함', color: 'text-green-400' };
  if (score >= 0.67) return { label: '강함', color: 'text-lime-400' };
  if (score >= 0.5) return { label: '보통', color: 'text-yellow-400' };
  return { label: '약함', color: 'text-gray-400' };
};

export default function MTFOverview({ symbol }: MTFOverviewProps) {
  const { data, isLoading, isError, refetch, refetchTimeframe } = useMTF({ symbol });

  if (isLoading) {
    return (
      <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-gray-400">MTF Overview</h3>
          <RefreshCw className="w-3.5 h-3.5 text-gray-500 animate-spin" />
        </div>
        <div className="h-32 flex items-center justify-center">
          <div className="animate-pulse text-gray-500 text-xs">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="backdrop-blur-sm bg-white/[0.02] border border-red-500/20 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-400">MTF Overview</h3>
          <button onClick={() => refetch()} className="text-xs text-gray-500 hover:text-gray-300">
            다시 시도
          </button>
        </div>
        <div className="h-32 flex items-center justify-center">
          <div className="text-red-400 text-xs">데이터 로딩 실패</div>
        </div>
      </div>
    );
  }

  const strengthInfo = getStrengthLabel(data.alignmentScore);

  return (
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-400">MTF Overview</h3>
          {/* 전체 추세 표시 */}
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${getStatusBg(data.overallTrend)}`}>
            <StatusIcon status={data.overallTrend} />
            <span className={`text-xs font-semibold ${
              data.overallTrend === 'bullish' ? 'text-green-400' :
              data.overallTrend === 'bearish' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {data.overallTrend === 'bullish' ? '불리시' :
               data.overallTrend === 'bearish' ? '베어리시' : '중립'}
            </span>
          </div>
          {/* 강도 표시 */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>강도:</span>
            <span className={`font-semibold ${strengthInfo.color}`}>
              {strengthInfo.label}
            </span>
            <span className="font-mono text-gray-400">
              ({data.timeframes.filter(t => t.trend === data.overallTrend).length}/{data.timeframes.length})
            </span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded hover:bg-white/10 transition-colors"
          title="전체 새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">TF</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">Trend</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">RSI</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">CVD</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">OI</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">Div</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase" title="캔들 마감까지">
                <Clock className="w-3 h-3 inline" />
              </th>
            </tr>
          </thead>
          <tbody>
            {data.timeframes.map((tf) => (
              <TimeframeRow
                key={tf.timeframe}
                data={tf}
                onRefresh={() => refetchTimeframe(tf.timeframe)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-4 text-[10px] text-gray-500">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-green-400" />
          <span>상승</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-red-400" />
          <span>하락</span>
        </div>
        <div className="flex items-center gap-1">
          <Minus className="w-3 h-3 text-gray-400" />
          <span>중립</span>
        </div>
        <div className="ml-auto text-gray-600">
          <Clock className="w-3 h-3 inline mr-1" />
          캔들 마감 시 자동 갱신 (UTC 기준)
        </div>
      </div>
    </div>
  );
}
