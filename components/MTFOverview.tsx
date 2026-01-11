'use client';

import { useState, useEffect } from 'react';
import { useMTF, getSecondsUntilClose, CANDLE_INTERVALS_SEC } from '@/hooks/useMTF';
import { MTFStatus, MTFStrength, MTFTimeframeData, MTFAction, MTFActionInfo } from '@/lib/types/index';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Clock } from 'lucide-react';

interface MTFOverviewProps {
  symbol: string;
  currentPrice?: number;
  poc?: number;
  fundingRate?: number;
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

// RSI 표시 컴포넌트 (게이지 바 포함)
const RsiDisplay = ({ rsi }: { rsi: number | null }) => {
  if (rsi === null) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  // 색상 결정
  let color = 'bg-gray-400';
  let textColor = 'text-gray-300';
  let label = '';

  if (rsi <= 30) {
    color = 'bg-green-400';
    textColor = 'text-green-400';
    label = '매도';
  } else if (rsi >= 70) {
    color = 'bg-red-400';
    textColor = 'text-red-400';
    label = '매수';
  } else if (rsi <= 40) {
    color = 'bg-lime-400';
    textColor = 'text-lime-400';
  } else if (rsi >= 60) {
    color = 'bg-orange-400';
    textColor = 'text-orange-400';
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-8 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${rsi}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{rsi.toFixed(0)}</span>
      {label && <span className={`text-[9px] ${textColor}`}>{label}</span>}
    </div>
  );
};

// CVD/OI 강도 표시 (↑↑↑, ↑↑, ↑, →, ↓, ↓↓, ↓↓↓)
const DirectionStrengthDisplay = ({
  direction,
  strength,
}: {
  direction: MTFStatus;
  strength: MTFStrength;
}) => {
  if (direction === 'neutral') {
    return <span className="text-gray-400 text-xs">→</span>;
  }

  const isUp = direction === 'bullish';
  const arrow = isUp ? '↑' : '↓';

  // 강도별 화살표 개수
  let arrows: string;
  let color: string;

  if (strength === 'strong') {
    arrows = arrow + arrow + arrow;  // ↑↑↑ or ↓↓↓
    color = isUp ? 'text-green-400' : 'text-red-400';
  } else if (strength === 'medium') {
    arrows = arrow + arrow;          // ↑↑ or ↓↓
    color = isUp ? 'text-emerald-400' : 'text-orange-400';
  } else {
    arrows = arrow;                  // ↑ or ↓
    color = isUp ? 'text-lime-400' : 'text-amber-400';
  }

  return <span className={`text-xs font-bold ${color}`}>{arrows}</span>;
};

// 다이버전스 표시 (타입 + 시간 + 만료 여부)
const DivergenceDisplay = ({ divergence, timeframe }: {
  divergence: MTFTimeframeData['divergence'];
  timeframe: string;
}) => {
  if (!divergence) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  const isBullish = divergence.direction === 'bullish';
  const typeLabel = divergence.type.toUpperCase();
  const isExpired = divergence.isExpired;

  // 캔들 수로 시간 계산
  const candleIntervalMin = (CANDLE_INTERVALS_SEC[timeframe] || 300) / 60;
  const minutesAgo = divergence.candlesAgo * candleIntervalMin;

  let timeAgo: string;
  if (minutesAgo < 60) {
    timeAgo = `${Math.round(minutesAgo)}m`;
  } else if (minutesAgo < 1440) {
    timeAgo = `${Math.round(minutesAgo / 60)}h`;
  } else {
    timeAgo = `${Math.round(minutesAgo / 1440)}d`;
  }

  // 만료된 경우 회색 처리
  if (isExpired) {
    return (
      <div className="flex flex-col items-start opacity-50">
        <span className="text-xs font-semibold text-gray-500">
          {isBullish ? '↑' : '↓'} {typeLabel}
        </span>
        <span className="text-[9px] text-gray-600">{timeAgo} (만료)</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <span className={`text-xs font-semibold ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
        {isBullish ? '↑' : '↓'} {typeLabel}
      </span>
      <span className="text-[9px] text-gray-500">{timeAgo} ago</span>
    </div>
  );
};

// 액션 표시 컴포넌트
const ActionDisplay = ({ actionInfo }: { actionInfo: MTFActionInfo }) => {
  const { action, reason } = actionInfo;

  const getActionStyle = (action: MTFAction, reason: string) => {
    switch (action) {
      case 'long_ok':
        return {
          bg: 'bg-green-500/20 border-green-500/30',
          text: 'text-green-400',
          icon: '🟢',
          label: '롱 OK',
        };
      case 'short_ok':
        return {
          bg: 'bg-red-500/20 border-red-500/30',
          text: 'text-red-400',
          icon: '🔴',
          label: '숏 OK',
        };
      case 'reversal_warn':
        return {
          bg: 'bg-amber-500/20 border-amber-500/30',
          text: 'text-amber-400',
          icon: '⚠️',
          label: '반전주의',
        };
      case 'trend_hold':
        // 상승추세면 초록, 하락추세면 빨강
        if (reason.includes('상승')) {
          return {
            bg: 'bg-green-500/20 border-green-500/30',
            text: 'text-green-400',
            icon: '↗',
            label: '상승추세 유지',
            hideReason: true,
          };
        } else {
          return {
            bg: 'bg-red-500/20 border-red-500/30',
            text: 'text-red-400',
            icon: '↘',
            label: '하락추세 유지',
            hideReason: true,
          };
        }
      case 'wait':
      default:
        return {
          bg: 'bg-gray-500/20 border-gray-500/30',
          text: 'text-gray-400',
          icon: '⏸',
          label: '대기',
        };
    }
  };

  const style = getActionStyle(action, reason);

  return (
    <div className="flex flex-col items-start">
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${style.bg}`}>
        <span className={`text-xs ${style.text}`}>{style.icon}</span>
        <span className={`text-xs font-semibold ${style.text}`}>{style.label}</span>
      </div>
      {!style.hideReason && <span className="text-[9px] text-gray-500 mt-0.5">{reason}</span>}
    </div>
  );
};

// ADX 표시 컴포넌트 (게이지 바 포함)
const AdxDisplay = ({ adx, isStrongTrend }: { adx: number | null; isStrongTrend: boolean }) => {
  if (adx === null) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  // ADX 강도별 색상 (0-100 스케일, 보통 0-50 범위)
  let color = 'bg-gray-500';
  let textColor = 'text-gray-400';
  let label = '';

  if (adx >= 50) {
    color = 'bg-red-400';
    textColor = 'text-red-400';
    label = '극강';
  } else if (adx >= 25) {
    color = 'bg-orange-400';
    textColor = 'text-orange-400';
    label = '강함';
  } else if (adx >= 20) {
    color = 'bg-yellow-400';
    textColor = 'text-yellow-400';
    label = '형성';
  } else {
    label = '약함';
  }

  // ADX는 보통 0-50 범위이므로 2배로 스케일
  const barWidth = Math.min(adx * 2, 100);

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-6 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{adx.toFixed(0)}</span>
      <span className={`text-[9px] ${textColor}`}>{label}</span>
    </div>
  );
};

// ATR Ratio 표시 컴포넌트 (게이지 바 포함)
const AtrRatioDisplay = ({ atrRatio }: { atrRatio: number | null }) => {
  if (atrRatio === null) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  // 색상 및 라벨: 1.5+ 고변동, 1.2+ 높음, 0.8- 낮음
  let color = 'bg-gray-500';
  let textColor = 'text-gray-400';
  let label = '보통';

  if (atrRatio >= 1.5) {
    color = 'bg-red-400';
    textColor = 'text-red-400';
    label = '고변동';
  } else if (atrRatio >= 1.2) {
    color = 'bg-orange-400';
    textColor = 'text-orange-400';
    label = '높음';
  } else if (atrRatio <= 0.8) {
    color = 'bg-blue-400';
    textColor = 'text-blue-400';
    label = '낮음';
  }

  // ATR ratio는 보통 0.5~2.0 범위, 1.0이 50%로 표시
  const barWidth = Math.min(atrRatio * 50, 100);

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-6 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{atrRatio.toFixed(1)}x</span>
      <span className={`text-[9px] ${textColor}`}>{label}</span>
    </div>
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
      <td className="px-3 py-2">
        <RsiDisplay rsi={data.rsi} />
      </td>
      <td className="px-3 py-2 text-center">
        <DirectionStrengthDisplay
          direction={data.cvdDirection}
          strength={data.cvdStrength}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <DirectionStrengthDisplay
          direction={data.oiDirection}
          strength={data.oiStrength}
        />
      </td>
      <td className="px-3 py-2">
        <AdxDisplay adx={data.adx} isStrongTrend={data.isStrongTrend} />
      </td>
      <td className="px-3 py-2">
        <AtrRatioDisplay atrRatio={data.atrRatio} />
      </td>
      <td className="px-3 py-2">
        <DivergenceDisplay divergence={data.divergence} timeframe={data.timeframe} />
      </td>
      <td className="px-3 py-2">
        <ActionDisplay actionInfo={data.actionInfo} />
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

// 숫자 포맷
const formatPrice = (price: number) => {
  return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export default function MTFOverview({ symbol, currentPrice, poc, fundingRate }: MTFOverviewProps) {
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
  const bullishCount = data.timeframes.filter(t => t.trend === 'bullish').length;
  const bearishCount = data.timeframes.filter(t => t.trend === 'bearish').length;
  const totalCount = data.timeframes.length;
  const alignmentPercent = Math.round(data.alignmentScore * 100);

  // 실제 현재가 (MTF 데이터에서 5m 기준)
  const actualPrice = currentPrice || data.timeframes.find(t => t.timeframe === '5m')?.currentPrice || 0;

  return (
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4">
      {/* 현재가 요약 */}
      {actualPrice > 0 && (
        <div className="flex items-center gap-4 mb-3 pb-3 border-b border-white/10 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Current:</span>
            <span className="font-mono font-bold text-white">${formatPrice(actualPrice)}</span>
          </div>
          {poc && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">POC:</span>
              <span className="font-mono text-yellow-400">${formatPrice(poc)}</span>
            </div>
          )}
          {fundingRate !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Funding:</span>
              <span className={`font-mono ${fundingRate > 0 ? 'text-green-400' : fundingRate < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {fundingRate > 0 ? '+' : ''}{fundingRate.toFixed(4)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-400">MTF Overview</h3>
          {/* MTF 추세 일치 종합 스코어 */}
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border ${getStatusBg(data.overallTrend)}`}>
            <span className="text-xs text-gray-400">추세 일치:</span>
            <span className={`text-sm font-bold ${
              data.overallTrend === 'bullish' ? 'text-green-400' :
              data.overallTrend === 'bearish' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {data.overallTrend === 'bullish' ? `${bullishCount}/${totalCount} 상승` :
               data.overallTrend === 'bearish' ? `${bearishCount}/${totalCount} 하락` :
               `${Math.max(bullishCount, bearishCount)}/${totalCount} 혼조`}
            </span>
            <span className={`text-sm font-mono ${strengthInfo.color}`}>
              ({alignmentPercent}%)
            </span>
            <StatusIcon status={data.overallTrend} />
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
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase text-center" title="CVD 방향/강도">CVD</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase text-center" title="OI 방향/강도">OI</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase" title="추세 강도 (25+ 강한 추세)">ADX</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase" title="평균 대비 변동성">ATR%</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">DIV</th>
              <th className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase" title="추천 액션">Action</th>
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
      <div className="mt-3 pt-3 border-t border-white/5 space-y-2 text-[10px] text-gray-500">
        {/* CVD/OI 방향 */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-green-400 font-bold">↑↑↑</span>
            <span>강한 상승</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-emerald-400 font-bold">↑↑</span>
            <span>상승</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lime-400 font-bold">↑</span>
            <span>약한 상승</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400">→</span>
            <span>횡보</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-amber-400 font-bold">↓</span>
            <span>약한 하락</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-orange-400 font-bold">↓↓</span>
            <span>하락</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-400 font-bold">↓↓↓</span>
            <span>강한 하락</span>
          </div>
        </div>
        {/* ADX / ATR 기준 */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-orange-400 font-bold">ADX 25+🔥</span>
            <span>강한 추세</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-400 font-mono">ATR 1.5x+</span>
            <span>고변동</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-blue-400 font-mono">ATR 0.8x↓</span>
            <span>저변동</span>
          </div>
          <div className="ml-auto text-gray-600">
            <Clock className="w-3 h-3 inline mr-1" />
            캔들 마감 시 자동 갱신
          </div>
        </div>
      </div>
    </div>
  );
}
