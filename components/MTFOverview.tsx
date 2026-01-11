'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { useMTFSocket, getSecondsUntilClose, CANDLE_INTERVALS_SEC } from '@/hooks/useMTFSocket';
import { MTFStatus, MTFStrength, MTFTimeframeData, MTFAction, MTFActionInfo, OrderBlock } from '@/lib/types/index';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Clock } from 'lucide-react';
import ScoreCard from './ScoreCard';
import RecommendationCard from './RecommendationCard';
import { calculateSignalScore, MarketStructureData } from '@/lib/scoring';
import { generateRecommendation } from '@/lib/recommendation';
import { useCoinglass } from '@/hooks/useCoinglass';

// 공항 전광판/슬롯 스타일 애니메이션 숫자 (소수점 지원)
const AnimatedValue = memo(({
  value,
  decimals = 0,
  className = '',
  suffix = '',
}: {
  value: number | null;
  decimals?: number;
  className?: string;
  suffix?: string;
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [prevDisplayValue, setPrevDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const previousValue = useRef(value);

  useEffect(() => {
    if (value === null || previousValue.current === null) {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }
    if (previousValue.current === value) return;

    const startValue = previousValue.current;
    const endValue = value;
    const duration = 300;
    const startTime = performance.now();

    const newDirection = endValue > startValue ? 'up' : 'down';
    setDirection(newDirection);
    setPrevDisplayValue(startValue);
    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startValue + (endValue - startValue) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
        setTimeout(() => {
          setIsAnimating(false);
          setDirection(null);
        }, 100);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  if (displayValue === null) return <span className="text-gray-500">-</span>;

  const colorClass = isAnimating
    ? direction === 'up'
      ? 'text-green-400'
      : 'text-red-400'
    : '';

  return (
    <span className={`inline-flex overflow-hidden relative ${className}`}>
      {/* 이전 값 */}
      {isAnimating && prevDisplayValue !== null && (
        <span
          className={`absolute inset-0 flex items-center justify-center ${
            direction === 'up' ? 'animate-slot-out-up' : 'animate-slot-out-down'
          }`}
        >
          {prevDisplayValue.toFixed(decimals)}{suffix}
        </span>
      )}
      {/* 현재 값 */}
      <span
        className={`inline-block ${colorClass} ${
          isAnimating
            ? direction === 'up'
              ? 'animate-slot-in-up'
              : 'animate-slot-in-down'
            : ''
        }`}
      >
        {displayValue.toFixed(decimals)}{suffix}
      </span>
    </span>
  );
});
AnimatedValue.displayName = 'AnimatedValue';

// 셀 업데이트 감지 래퍼
const AnimatedCell = memo(({ children, dataKey }: { children: React.ReactNode; dataKey: string }) => {
  const [isUpdated, setIsUpdated] = useState(false);
  const prevKey = useRef(dataKey);

  useEffect(() => {
    if (prevKey.current !== dataKey) {
      setIsUpdated(true);
      prevKey.current = dataKey;
      const timer = setTimeout(() => setIsUpdated(false), 500);
      return () => clearTimeout(timer);
    }
  }, [dataKey]);

  return (
    <div className={`transition-all duration-300 ${isUpdated ? 'animate-cell-update' : ''}`}>
      {children}
    </div>
  );
});
AnimatedCell.displayName = 'AnimatedCell';

interface MTFOverviewProps {
  symbol: string;
  currentPrice?: number;
  poc?: number;
  vah?: number;
  val?: number;
  fundingRate?: number;
  orderBlocks?: OrderBlock[];
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

// RSI 표시 컴포넌트 (게이지 바 포함) - 토스 스타일
const RsiDisplay = memo(({ rsi }: { rsi: number | null }) => {
  const [barWidth, setBarWidth] = useState(rsi || 0);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevRsi = useRef(rsi);

  useEffect(() => {
    if (rsi === null) return;
    if (prevRsi.current !== rsi) {
      setIsAnimating(true);
      setBarWidth(rsi);
      prevRsi.current = rsi;
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [rsi]);

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
    label = '과매도';
  } else if (rsi >= 70) {
    color = 'bg-red-400';
    textColor = 'text-red-400';
    label = '과매수';
  } else if (rsi <= 40) {
    color = 'bg-lime-400';
    textColor = 'text-lime-400';
  } else if (rsi >= 60) {
    color = 'bg-orange-400';
    textColor = 'text-orange-400';
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-8 h-1.5 bg-gray-700 rounded-full overflow-hidden ${isAnimating ? 'animate-bar-glow' : ''}`}>
        <div
          className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <AnimatedValue value={rsi} decimals={0} className={`text-xs font-mono ${textColor}`} />
      {label && <span className={`text-[11px] ${textColor} ${isAnimating ? 'animate-flash-up' : ''}`}>{label}</span>}
    </div>
  );
});
RsiDisplay.displayName = 'RsiDisplay';

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
    color = isUp ? 'text-teal-400' : 'text-orange-400';
  } else {
    arrows = arrow;                  // ↑ or ↓
    color = isUp ? 'text-cyan-400' : 'text-amber-400';
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

  // 만료된 경우 취소선 + 만료 배지
  if (isExpired) {
    return (
      <div className="flex flex-col items-start">
        <span className="text-xs font-semibold text-gray-500 line-through">
          {isBullish ? '↑' : '↓'} {typeLabel}
        </span>
        <span className="text-[10px] px-1 py-0.5 bg-gray-700 text-gray-400 rounded">만료 {timeAgo}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <span className={`text-xs font-semibold ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
        {isBullish ? '↑' : '↓'} {typeLabel}
      </span>
      <span className="text-[11px] text-gray-500">{timeAgo} ago</span>
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
        // 반등주의는 초록, 반락주의는 빨강
        const isExpired = reason.includes('만료');
        if (reason.includes('반등')) {
          return {
            bg: isExpired ? 'bg-green-500/10 border-green-500/20' : 'bg-green-500/20 border-green-500/30',
            text: isExpired ? 'text-green-400/60' : 'text-green-400',
            icon: '↗',
            label: isExpired ? '반등주의(만료)' : '반등주의',
            hideReason: true,
          };
        } else if (reason.includes('반락')) {
          return {
            bg: isExpired ? 'bg-red-500/10 border-red-500/20' : 'bg-red-500/20 border-red-500/30',
            text: isExpired ? 'text-red-400/60' : 'text-red-400',
            icon: '↘',
            label: isExpired ? '반락주의(만료)' : '반락주의',
            hideReason: true,
          };
        }
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
    <div className="flex items-center gap-2">
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${style.bg}`}>
        <span className={`text-xs ${style.text}`}>{style.icon}</span>
        <span className={`text-xs font-semibold ${style.text}`}>{style.label}</span>
      </div>
      {!style.hideReason && <span className="text-[10px] text-gray-500">{reason}</span>}
    </div>
  );
};

// ADX 표시 컴포넌트 (게이지 바 포함) - 토스 스타일
const AdxDisplay = memo(({ adx, isStrongTrend }: { adx: number | null; isStrongTrend: boolean }) => {
  const [barWidth, setBarWidth] = useState(adx ? Math.min(adx * 2, 100) : 0);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevAdx = useRef(adx);

  useEffect(() => {
    if (adx === null) return;
    if (prevAdx.current !== adx) {
      setIsAnimating(true);
      setBarWidth(Math.min(adx * 2, 100));
      prevAdx.current = adx;
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [adx]);

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

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-6 h-1.5 bg-gray-700 rounded-full overflow-hidden ${isAnimating ? 'animate-bar-glow' : ''}`}>
        <div
          className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <AnimatedValue value={adx} decimals={0} className={`text-xs font-mono ${textColor}`} />
      <span className={`text-[11px] ${textColor} ${isAnimating && isStrongTrend ? 'animate-flash-up' : ''}`}>{label}</span>
    </div>
  );
});
AdxDisplay.displayName = 'AdxDisplay';

// ATR Ratio 표시 컴포넌트 (게이지 바 포함) - 토스 스타일
const AtrRatioDisplay = memo(({ atrRatio }: { atrRatio: number | null }) => {
  const [barWidth, setBarWidth] = useState(atrRatio ? Math.min(atrRatio * 50, 100) : 0);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevAtr = useRef(atrRatio);

  useEffect(() => {
    if (atrRatio === null) return;
    if (prevAtr.current !== atrRatio) {
      setIsAnimating(true);
      setBarWidth(Math.min(atrRatio * 50, 100));
      prevAtr.current = atrRatio;
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [atrRatio]);

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

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-6 h-1.5 bg-gray-700 rounded-full overflow-hidden ${isAnimating ? 'animate-bar-glow' : ''}`}>
        <div
          className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <AnimatedValue value={atrRatio} decimals={1} suffix="x" className={`text-xs font-mono ${textColor}`} />
      <span className={`text-[11px] ${textColor}`}>{label}</span>
    </div>
  );
});
AtrRatioDisplay.displayName = 'AtrRatioDisplay';

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
      <td className="px-2 py-1.5 text-[10px] font-mono font-semibold text-gray-300">
        {data.timeframe}
      </td>
      <td className="px-2 py-1.5">
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${getStatusBg(data.trend)}`}>
          <StatusIcon status={data.trend} />
          <span className={`text-[10px] ${
            data.trend === 'bullish' ? 'text-green-400' :
            data.trend === 'bearish' ? 'text-red-400' : 'text-gray-400'
          }`}>
            {data.trend === 'bullish' ? '상승' :
             data.trend === 'bearish' ? '하락' : '중립'}
          </span>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <RsiDisplay rsi={data.rsi} />
      </td>
      <td className="px-2 py-1.5 text-center">
        <DirectionStrengthDisplay
          direction={data.cvdDirection}
          strength={data.cvdStrength}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <DirectionStrengthDisplay
          direction={data.oiDirection}
          strength={data.oiStrength}
        />
      </td>
      <td className="px-2 py-1.5">
        <AdxDisplay adx={data.adx} isStrongTrend={data.isStrongTrend} />
      </td>
      <td className="px-2 py-1.5">
        <AtrRatioDisplay atrRatio={data.atrRatio} />
      </td>
      <td className="px-2 py-1.5">
        <DivergenceDisplay divergence={data.divergence} timeframe={data.timeframe} />
      </td>
      <td className="px-2 py-1.5">
        <ActionDisplay actionInfo={data.actionInfo} />
      </td>
      <td className="px-2 py-1.5">
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

export default function MTFOverview({ symbol, currentPrice, poc: propPoc, vah: propVah, val: propVal, fundingRate, orderBlocks: propOrderBlocks }: MTFOverviewProps) {
  const { data, isLoading, isError, isConnected, refetch, refetchTimeframe, volumeProfile, orderBlocks: hookOrderBlocks } = useMTFSocket({ symbol });

  // Coinglass 데이터 (공포탐욕지수)
  const { data: coinglassData } = useCoinglass({
    symbol: symbol.replace('/USDT', '').replace('/', ''),
    refreshInterval: 60000,
  });
  const fearGreedIndex = coinglassData?.fearGreed?.value ?? undefined;

  // props 우선, 없으면 useMTF에서 계산/추출된 값 사용
  const poc = propPoc ?? volumeProfile?.poc;
  const vah = propVah ?? volumeProfile?.vah;
  const val = propVal ?? volumeProfile?.val;
  const orderBlocks = propOrderBlocks ?? hookOrderBlocks;

  if (isLoading) {
    return (
      <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-gray-400">시간대별 분석</h3>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] text-gray-500">연결 중...</span>
          </div>
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
          <h3 className="text-sm font-bold text-gray-400">시간대별 분석</h3>
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

  // 추세 방향 텍스트
  const trendText = data.overallTrend === 'bullish'
    ? `📈 상승추세 ${bullishCount}/${totalCount} (${alignmentPercent}%)`
    : data.overallTrend === 'bearish'
    ? `📉 하락추세 ${bearishCount}/${totalCount} (${alignmentPercent}%)`
    : `➡️ 횡보 (${alignmentPercent}%)`;

  // RSI 과매수/과매도 체크
  const overboughtTFs = data.timeframes.filter(tf => tf.rsi && tf.rsi >= 70);
  const oversoldTFs = data.timeframes.filter(tf => tf.rsi && tf.rsi <= 30);

  // 강한 추세 타임프레임 (ADX >= 25)
  const strongTrendTFs = data.timeframes.filter(tf => tf.isStrongTrend);

  // 평균 ATR
  const atrRatios = data.timeframes.map(tf => tf.atrRatio).filter((r): r is number => r !== null);
  const avgATR = atrRatios.length > 0 ? atrRatios.reduce((a, b) => a + b, 0) / atrRatios.length : null;

  // CVD/OI 방향 일치
  const cvdBullish = data.timeframes.filter(tf => tf.cvdDirection === 'bullish').length;
  const cvdBearish = data.timeframes.filter(tf => tf.cvdDirection === 'bearish').length;
  const oiBullish = data.timeframes.filter(tf => tf.oiDirection === 'bullish').length;
  const oiBearish = data.timeframes.filter(tf => tf.oiDirection === 'bearish').length;

  // 다이버전스 정보
  const activeDivergences = data.timeframes.filter(tf => tf.divergence && !tf.divergence.isExpired);
  const bullishDivs = activeDivergences.filter(tf => tf.divergence?.direction === 'bullish');
  const bearishDivs = activeDivergences.filter(tf => tf.divergence?.direction === 'bearish');

  // EMA 위치 체크 (일봉 기준)
  const tf1d = data.timeframes.find(tf => tf.timeframe === '1d');
  const aboveEMA200 = tf1d && tf1d.ema200 && actualPrice > tf1d.ema200;
  const belowEMA200 = tf1d && tf1d.ema200 && actualPrice < tf1d.ema200;

  // 현재 시간
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // 티커 콘텐츠 배열
  const tickerItems = [
    `⏰ ${timeStr} 업데이트`,
    trendText,
    fundingRate !== undefined && `펀딩 ${fundingRate > 0 ? '+' : ''}${fundingRate.toFixed(4)}%${fundingRate > 0.01 ? ' 🔴롱과열' : fundingRate < -0.01 ? ' 🟢숏과열' : ''}`,
    aboveEMA200 && '✅ 일봉 EMA200 위 (상승구조)',
    belowEMA200 && '⛔ 일봉 EMA200 아래 (하락구조)',
    vah && `단기고점 $${formatPrice(vah)} (${((vah - actualPrice) / actualPrice * 100).toFixed(1)}%${vah > actualPrice ? '↑' : '↓'})`,
    val && `단기저점 $${formatPrice(val)} (${((actualPrice - val) / actualPrice * 100).toFixed(1)}%${val < actualPrice ? '↓' : '↑'})`,
    poc && `목표가 $${formatPrice(poc)} (${Math.abs((poc - actualPrice) / actualPrice * 100).toFixed(1)}%${poc > actualPrice ? '↑' : '↓'})`,
    overboughtTFs.length > 0 && `🔴 RSI 과매수 ${overboughtTFs.map(tf => tf.timeframe).join(',')}`,
    oversoldTFs.length > 0 && `🟢 RSI 과매도 ${oversoldTFs.map(tf => tf.timeframe).join(',')}`,
    strongTrendTFs.length > 0 && `🔥 강한추세 ${strongTrendTFs.length}개 TF (ADX 25+)`,
    strongTrendTFs.length === 0 && '😐 약한추세 (ADX 25 미만)',
    avgATR && avgATR > 1.5 && `⚡ 고변동성 ATR ${avgATR.toFixed(1)}x - 손절 넓게`,
    avgATR && avgATR < 0.8 && `😴 저변동성 ATR ${avgATR.toFixed(1)}x - 돌파 대기`,
    avgATR && avgATR >= 0.8 && avgATR <= 1.5 && `📈 정상 변동성 ATR ${avgATR.toFixed(1)}x`,
    cvdBullish > cvdBearish + 2 && `💪 매수세 우위 CVD ${cvdBullish}/${totalCount}`,
    cvdBearish > cvdBullish + 2 && `👎 매도세 우위 CVD ${cvdBearish}/${totalCount}`,
    cvdBullish === cvdBearish && `⚖️ 매수/매도 균형 CVD`,
    oiBullish > oiBearish + 2 && `📊 포지션 증가 OI ${oiBullish}/${totalCount} - 신규 진입`,
    oiBearish > oiBullish + 2 && `📉 포지션 감소 OI ${oiBearish}/${totalCount} - 청산 중`,
    bullishDivs.length > 0 && `🟢 상승 다이버전스 ${bullishDivs.map(tf => tf.timeframe).join(',')} - 반등 가능`,
    bearishDivs.length > 0 && `🔴 하락 다이버전스 ${bearishDivs.map(tf => tf.timeframe).join(',')} - 하락 가능`,
    orderBlocks && orderBlocks.filter(ob => ob.type === 'bullish').length > 0 && `🟩 지지구간 ${orderBlocks.filter(ob => ob.type === 'bullish').length}개`,
    orderBlocks && orderBlocks.filter(ob => ob.type === 'bearish').length > 0 && `🟥 저항구간 ${orderBlocks.filter(ob => ob.type === 'bearish').length}개`,
    bullishCount > bearishCount + 2 && '🚀 롱 우세 환경',
    bearishCount > bullishCount + 2 && '🐻 숏 우세 환경',
    alignmentPercent >= 80 && '⭐ 추세 강력 일치 (80%+)',
    alignmentPercent >= 60 && alignmentPercent < 80 && '👍 추세 일치 양호',
    alignmentPercent < 40 && '⚠️ 추세 혼조 - 관망 권장',
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* 스크롤 배너 - 최상단 */}
      {actualPrice > 0 && tickerItems.length > 0 && (
        <div className="overflow-hidden border-b border-white/5 pb-2">
          <div className="flex animate-ticker whitespace-nowrap text-[11px]">
            {[0, 1].map((repeat) => (
              <div key={repeat} className="flex items-center gap-6 px-4">
                {tickerItems.map((item, i) => (
                  <span key={`${repeat}-${i}`} className="text-gray-300">{item}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 스코어 카드 & 추천 타점 */}
      {(() => {
        // 점수 계산
        const marketData: MarketStructureData | undefined = actualPrice
          ? { currentPrice: actualPrice, orderBlocks, poc, vah, val }
          : undefined;
        const longScore = calculateSignalScore(data, 'bullish', fundingRate, marketData);
        const shortScore = calculateSignalScore(data, 'bearish', fundingRate, marketData);

        // 평균 ATR 계산 (달러 단위)
        const atrRatios = data.timeframes
          .map((tf) => tf.atrRatio)
          .filter((r): r is number => r !== null);
        const avgATRRatio = atrRatios.length > 0
          ? atrRatios.reduce((sum, r) => sum + r, 0) / atrRatios.length
          : 0.01;
        const avgATR = actualPrice * avgATRRatio * 0.01; // ATR ratio를 달러로 변환

        // 추천 생성
        const recommendation = generateRecommendation({
          longScore,
          shortScore,
          currentPrice: actualPrice,
          poc,
          vah,
          val,
          orderBlocks,
          avgATR,
        });

        return (
          <div className="grid grid-cols-3 gap-4">
            <RecommendationCard recommendation={recommendation} />
            <div className="col-span-2 h-full">
              <ScoreCard
                mtfData={data}
                fundingRate={fundingRate}
                currentPrice={actualPrice}
                orderBlocks={orderBlocks}
                poc={poc}
                vah={vah}
                val={val}
                fearGreedIndex={fearGreedIndex}
              />
            </div>
          </div>
        );
      })()}

      {/* 시간대별 분석 테이블 */}
      <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400">시간대별 분석</h3>
          {/* WebSocket 연결 상태 */}
          <div className="flex items-center gap-1" title={isConnected ? '실시간 연결됨' : '연결 끊김'}>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-live-pulse' : 'bg-red-400'}`} />
            <span className="text-[9px] text-gray-500">{isConnected ? 'LIVE' : 'OFF'}</span>
          </div>
          {/* 추세 일치 종합 */}
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${getStatusBg(data.overallTrend)}`}>
            <span className="text-[10px] text-gray-400">추세:</span>
            <span className={`text-[10px] font-bold ${
              data.overallTrend === 'bullish' ? 'text-green-400' :
              data.overallTrend === 'bearish' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {data.overallTrend === 'bullish' ? `${bullishCount}/${totalCount}↑` :
               data.overallTrend === 'bearish' ? `${bearishCount}/${totalCount}↓` :
               `${Math.max(bullishCount, bearishCount)}/${totalCount}`}
            </span>
            <span className={`text-[10px] font-mono ${strengthInfo.color}`}>
              ({alignmentPercent}%)
            </span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="전체 새로고침"
        >
          <RefreshCw className="w-3 h-3 text-gray-500 hover:text-gray-300" />
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">시간</th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">추세</th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">RSI</th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 text-center relative group cursor-help">
                매수세<span className="text-gray-600">(CVD)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">누적 거래량 델타 (매수-매도 차이)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 text-center relative group cursor-help">
                포지션<span className="text-gray-600">(OI)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">미결제약정 (포지션 증감)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 relative group cursor-help">
                추세력<span className="text-gray-600">(ADX)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">추세 강도 (25+ 강한 추세🔥)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 relative group cursor-help">
                변동성<span className="text-gray-600">(ATR)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">평균 변동폭 대비 (1.0x = 평균)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 relative group cursor-help">
                괴리<span className="text-gray-600">(DIV)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">가격↔지표 다이버전스</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">신호</th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">
                <Clock className="w-2.5 h-2.5 inline" />
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

      {/* 범례 (스크롤 티커) */}
      <div className="mt-2 pt-2 border-t border-white/5 overflow-hidden">
        <div className="flex animate-ticker whitespace-nowrap text-[11px]">
          {[0, 1].map((repeat) => (
            <div key={repeat} className="flex items-center gap-6 px-4">
              <span><span className="text-green-400 font-bold">↑↑↑</span> <span className="text-gray-400">강한상승</span></span>
              <span><span className="text-teal-400 font-bold">↑↑</span> <span className="text-gray-400">상승</span></span>
              <span><span className="text-cyan-400 font-bold">↑</span> <span className="text-gray-400">약상승</span></span>
              <span><span className="text-gray-400">→</span> <span className="text-gray-400">횡보</span></span>
              <span><span className="text-amber-400 font-bold">↓</span> <span className="text-gray-400">약하락</span></span>
              <span><span className="text-orange-400 font-bold">↓↓</span> <span className="text-gray-400">하락</span></span>
              <span><span className="text-red-400 font-bold">↓↓↓</span> <span className="text-gray-400">강한하락</span></span>
              <span className="text-gray-600">│</span>
              <span><span className="text-orange-400">ADX25+🔥</span> <span className="text-gray-400">강한추세</span></span>
              <span><span className="text-red-400">ATR1.5x+</span> <span className="text-gray-400">고변동성</span></span>
              <span><span className="text-blue-400">ATR0.8x↓</span> <span className="text-gray-400">저변동성</span></span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
