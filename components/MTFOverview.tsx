'use client';

import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { useMTFSocket, getSecondsUntilClose, CANDLE_INTERVALS_SEC } from '@/hooks/useMTFSocket';
import { MTFStatus, MTFStrength, MTFTimeframeData, MTFAction, MTFActionInfo, OrderBlock } from '@/lib/types/index';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Clock, Activity, Zap, Target, BarChart3, ArrowUpDown, Layers, AlertTriangle } from 'lucide-react';
import ScoreCard from './ScoreCard';
import RecommendationCard from './RecommendationCard';
import { calculateSignalScore, MarketStructureData, calculateTimeframeDivergencesScore } from '@/lib/scoring';
import { generateRecommendation } from '@/lib/recommendation';
import { useCoinglass } from '@/hooks/useCoinglass';
import SignalChip from './SignalChip';
import { AnimatedValue, AnimatedCell } from '@/components/shared';
import { directionText } from '@/lib/classnames';
import { ANIMATION } from '@/lib/constants';

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
      const timer = setTimeout(() => setIsAnimating(false), ANIMATION.COLOR_FADE);
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
      <AnimatedValue value={rsi} decimals={1} className={`text-xs font-mono ${textColor}`} />
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
    color = directionText(isUp);
  } else if (strength === 'medium') {
    arrows = arrow + arrow;          // ↑↑ or ↓↓
    color = isUp ? 'text-teal-400' : 'text-orange-400';
  } else {
    arrows = arrow;                  // ↑ or ↓
    color = isUp ? 'text-cyan-400' : 'text-amber-400';
  }

  return <span className={`text-xs font-bold ${color}`}>{arrows}</span>;
};

// 다이버전스 표시 (타입 + 시간 + 만료/필터링 여부)
const DivergenceDisplay = ({ divergence, timeframe }: {
  divergence: MTFTimeframeData['divergence'];
  timeframe: string;
}) => {
  // 미확정 다이버전스는 표시하지 않음 (차트/알림과 일관성)
  if (!divergence || !divergence.confirmed) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  const isBullish = divergence.direction === 'bullish';
  const typeLabel = divergence.type.toUpperCase();
  const isExpired = divergence.isExpired;
  const isFiltered = divergence.isFiltered;

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

  // 필터링된 경우 회색 + 필터링 배지
  if (isFiltered) {
    return (
      <div className="flex flex-col items-start">
        <span className="text-xs font-semibold text-gray-500">
          {isBullish ? '↑' : '↓'} {typeLabel}
        </span>
        <span className="text-[10px] px-1 py-0.5 bg-gray-700 text-gray-400 rounded">필터링 {timeAgo}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <span className={`text-xs font-semibold ${directionText(isBullish)}`}>
        {isBullish ? '↑' : '↓'} {typeLabel}
      </span>
      <span className="text-[11px] text-gray-500">{timeAgo} ago</span>
    </div>
  );
};

// 액션 표시 컴포넌트 (공통 SignalChip 사용)
const ActionDisplay = ({ actionInfo }: { actionInfo: MTFActionInfo }) => (
  <SignalChip action={actionInfo.action} reason={actionInfo.reason} size="md" />
);

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
      const timer = setTimeout(() => setIsAnimating(false), ANIMATION.COLOR_FADE);
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
      <AnimatedValue value={adx} decimals={1} className={`text-xs font-mono ${textColor}`} />
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
      const timer = setTimeout(() => setIsAnimating(false), ANIMATION.COLOR_FADE);
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
  // 신호 표시 (확정 + 유효한 다이버전스만, 필터링된 것 제외)
  const getSignalIndicator = () => {
    if (data.divergence && data.divergence.confirmed && !data.divergence.isExpired && !data.divergence.isFiltered) {
      const isBullish = data.divergence.direction === 'bullish';
      return (
        <span className={`text-[10px] font-bold ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
          {isBullish ? '▲' : '▼'}
        </span>
      );
    }
    return null;
  };

  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      {/* 시간 */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-mono font-black text-gray-200 bg-white/10 px-1.5 py-0.5 rounded">
            {data.timeframe}
          </span>
          {getSignalIndicator()}
        </div>
      </td>
      {/* 다이버전스 점수 (여러 다이버전스 합산) */}
      <td className="px-2 py-1.5 text-center">
        {(() => {
          // divergences 배열 사용, 없으면 단일 divergence를 배열로
          const divergences = data.divergences && data.divergences.length > 0
            ? data.divergences
            : data.divergence ? [data.divergence] : [];

          // 롱/숏 각각 계산
          const bullishResult = calculateTimeframeDivergencesScore(data.timeframe, divergences, 'bullish');
          const bearishResult = calculateTimeframeDivergencesScore(data.timeframe, divergences, 'bearish');

          // 둘 다 없으면 0
          if (bullishResult.totalScore === 0 && bearishResult.totalScore === 0) {
            return <span className="text-xs font-mono text-gray-600">0</span>;
          }

          // 점수가 있는 방향 표시 (둘 다 있으면 모두 표시)
          return (
            <div className="flex flex-col items-center gap-0.5">
              {bullishResult.totalScore > 0 && (
                <span className="text-xs font-mono font-bold text-green-400">
                  +{bullishResult.totalScore}
                  {bullishResult.count > 1 && <span className="text-[9px] text-gray-500 ml-0.5">x{bullishResult.count}</span>}
                </span>
              )}
              {bearishResult.totalScore > 0 && (
                <span className="text-xs font-mono font-bold text-red-400">
                  -{bearishResult.totalScore}
                  {bearishResult.count > 1 && <span className="text-[9px] text-gray-500 ml-0.5">x{bearishResult.count}</span>}
                </span>
              )}
            </div>
          );
        })()}
      </td>
      {/* 신호 */}
      <td className="px-2 py-1.5">
        <ActionDisplay actionInfo={data.actionInfo} />
      </td>
      {/* 추세 */}
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
      {/* 추세력(ADX) */}
      <td className="px-2 py-1.5">
        <AdxDisplay adx={data.adx} isStrongTrend={data.isStrongTrend} />
      </td>
      {/* RSI */}
      <td className="px-2 py-1.5">
        <RsiDisplay rsi={data.rsi} />
      </td>
      {/* 괴리(DIV) */}
      <td className="px-2 py-1.5">
        <DivergenceDisplay divergence={data.divergence} timeframe={data.timeframe} />
      </td>
      {/* 매수세(CVD) */}
      <td className="px-2 py-1.5 text-center">
        <DirectionStrengthDisplay
          direction={data.cvdDirection}
          strength={data.cvdStrength}
        />
      </td>
      {/* 변동성(ATR) */}
      <td className="px-2 py-1.5">
        <AtrRatioDisplay atrRatio={data.atrRatio} />
      </td>
      {/* 포지션(OI) */}
      <td className="px-2 py-1.5 text-center">
        <DirectionStrengthDisplay
          direction={data.oiDirection}
          strength={data.oiStrength}
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

export default function MTFOverview({
  symbol,
  currentPrice,
  poc: propPoc,
  vah: propVah,
  val: propVal,
  fundingRate,
  orderBlocks: propOrderBlocks,
}: MTFOverviewProps) {
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

  // 데이터에서 파생된 값들 (메모이제이션) - 모든 Hook은 조건부 return 전에 호출해야 함
  const derivedData = useMemo(() => {
    if (!data) return null;

    const strengthInfo = getStrengthLabel(data.alignmentScore);
    const bullishCount = data.timeframes.filter(t => t.trend === 'bullish').length;
    const bearishCount = data.timeframes.filter(t => t.trend === 'bearish').length;
    const totalCount = data.timeframes.length;
    const alignmentPercent = Math.round(data.alignmentScore * 100);

    // 실제 현재가 (MTF 데이터에서 5m 기준)
    const actualPrice = currentPrice || data.timeframes.find(t => t.timeframe === '5m')?.currentPrice || 0;

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

    // 다이버전스 정보 (유효한 것만 = 만료 안 됨 + 필터링 안 됨)
    const activeDivergences = data.timeframes.filter(
      tf => tf.divergence && !tf.divergence.isExpired && !tf.divergence.isFiltered
    );
    const bullishDivs = activeDivergences.filter(tf => tf.divergence?.direction === 'bullish');
    const bearishDivs = activeDivergences.filter(tf => tf.divergence?.direction === 'bearish');

    return {
      strengthInfo,
      bullishCount,
      bearishCount,
      totalCount,
      alignmentPercent,
      actualPrice,
      overboughtTFs,
      oversoldTFs,
      strongTrendTFs,
      avgATR,
      cvdBullish,
      cvdBearish,
      oiBullish,
      oiBearish,
      activeDivergences,
      bullishDivs,
      bearishDivs,
    };
  }, [data, currentPrice]);

  // 점수 계산 (메모이제이션)
  const marketData: MarketStructureData | undefined = useMemo(() =>
    derivedData?.actualPrice ? { currentPrice: derivedData.actualPrice, orderBlocks, poc, vah, val } : undefined,
    [derivedData?.actualPrice, orderBlocks, poc, vah, val]
  );

  const { longScore, shortScore, recommendation } = useMemo(() => {
    if (!data || !derivedData) {
      return {
        longScore: null,
        shortScore: null,
        recommendation: {
          status: 'wait' as const,
          direction: null,
          conditions: [],
          reasoning: ['데이터 로딩 중...'],
        },
      };
    }

    const long = calculateSignalScore(data, 'bullish', fundingRate, marketData, fearGreedIndex);
    const short = calculateSignalScore(data, 'bearish', fundingRate, marketData, fearGreedIndex);

    // 평균 ATR 계산 (달러 단위)
    const atrRatiosCalc = data.timeframes
      .map((tf) => tf.atrRatio)
      .filter((r): r is number => r !== null);
    const avgATRRatio = atrRatiosCalc.length > 0
      ? atrRatiosCalc.reduce((sum, r) => sum + r, 0) / atrRatiosCalc.length
      : 0.01;
    const avgATRValue = derivedData.actualPrice * avgATRRatio * 0.01;

    const rec = generateRecommendation({
      longScore: long,
      shortScore: short,
      currentPrice: derivedData.actualPrice,
      poc,
      vah,
      val,
      orderBlocks,
      avgATR: avgATRValue,
    });

    return { longScore: long, shortScore: short, recommendation: rec };
  }, [data, derivedData, fundingRate, marketData, fearGreedIndex, poc, vah, val, orderBlocks]);

  // 조건부 렌더링 (모든 Hook 호출 후)
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

  if (isError || !data || !derivedData) {
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

  // derivedData에서 추출
  const {
    strengthInfo,
    bullishCount,
    bearishCount,
    totalCount,
    alignmentPercent,
    actualPrice,
    overboughtTFs,
    oversoldTFs,
    strongTrendTFs,
    avgATR,
    cvdBullish,
    cvdBearish,
    oiBullish,
    oiBearish,
    activeDivergences,
    bullishDivs,
    bearishDivs,
  } = derivedData;

  // EMA 위치 체크 (일봉 기준)
  const tf1d = data.timeframes.find(tf => tf.timeframe === '1d');
  const aboveEMA200 = tf1d && tf1d.ema200 && actualPrice > tf1d.ema200;
  const belowEMA200 = tf1d && tf1d.ema200 && actualPrice < tf1d.ema200;

  // 현재 시간
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // 티커 콘텐츠 배열 (lucide 아이콘 + 심플 무채색)
  const tickerItems: React.ReactNode[] = [
    <><Clock className="w-3 h-3 inline mr-1" />{timeStr}</>,
    data.overallTrend === 'bullish' ? <><TrendingUp className="w-3 h-3 inline mr-1" />추세 {bullishCount}/{totalCount} ({alignmentPercent}%)</> :
    data.overallTrend === 'bearish' ? <><TrendingDown className="w-3 h-3 inline mr-1" />추세 {bearishCount}/{totalCount} ({alignmentPercent}%)</> :
    <><Minus className="w-3 h-3 inline mr-1" />추세 {Math.max(bullishCount, bearishCount)}/{totalCount} ({alignmentPercent}%)</>,
    fundingRate !== undefined && <><ArrowUpDown className="w-3 h-3 inline mr-1" />펀딩 {fundingRate > 0 ? '+' : ''}{fundingRate.toFixed(4)}%{fundingRate > 0.01 ? ' [롱과열]' : fundingRate < -0.01 ? ' [숏과열]' : ''}</>,
    aboveEMA200 && <><TrendingUp className="w-3 h-3 inline mr-1" />EMA200 상승구조</>,
    belowEMA200 && <><TrendingDown className="w-3 h-3 inline mr-1" />EMA200 하락구조</>,
    vah && <><Target className="w-3 h-3 inline mr-1" />고점 ${formatPrice(vah)} ({((vah - actualPrice) / actualPrice * 100).toFixed(1)}%)</>,
    val && <><Target className="w-3 h-3 inline mr-1" />저점 ${formatPrice(val)} ({((actualPrice - val) / actualPrice * 100).toFixed(1)}%)</>,
    poc && <><Target className="w-3 h-3 inline mr-1" />POC ${formatPrice(poc)} ({Math.abs((poc - actualPrice) / actualPrice * 100).toFixed(1)}%)</>,
    overboughtTFs.length > 0 && <><Activity className="w-3 h-3 inline mr-1" />RSI 과매수 {overboughtTFs.map(tf => tf.timeframe).join(',')}</>,
    oversoldTFs.length > 0 && <><Activity className="w-3 h-3 inline mr-1" />RSI 과매도 {oversoldTFs.map(tf => tf.timeframe).join(',')}</>,
    strongTrendTFs.length > 0 && <><Zap className="w-3 h-3 inline mr-1" />ADX25+ {strongTrendTFs.length}개 TF</>,
    avgATR && avgATR > 1.5 && <><AlertTriangle className="w-3 h-3 inline mr-1" />ATR {avgATR.toFixed(1)}x 고변동</>,
    avgATR && avgATR < 0.8 && <><Minus className="w-3 h-3 inline mr-1" />ATR {avgATR.toFixed(1)}x 저변동</>,
    cvdBullish > cvdBearish + 2 && <><BarChart3 className="w-3 h-3 inline mr-1" />CVD 매수 {cvdBullish}/{totalCount}</>,
    cvdBearish > cvdBullish + 2 && <><BarChart3 className="w-3 h-3 inline mr-1" />CVD 매도 {cvdBearish}/{totalCount}</>,
    oiBullish > oiBearish + 2 && <><Layers className="w-3 h-3 inline mr-1" />OI 증가 {oiBullish}/{totalCount}</>,
    oiBearish > oiBullish + 2 && <><Layers className="w-3 h-3 inline mr-1" />OI 감소 {oiBearish}/{totalCount}</>,
    bullishDivs.length > 0 && <><Activity className="w-3 h-3 inline mr-1" />다이버전스↑ {bullishDivs.map(tf => tf.timeframe).join(',')}</>,
    bearishDivs.length > 0 && <><Activity className="w-3 h-3 inline mr-1" />다이버전스↓ {bearishDivs.map(tf => tf.timeframe).join(',')}</>,
    orderBlocks && orderBlocks.filter(ob => ob.type === 'bullish').length > 0 && <><Layers className="w-3 h-3 inline mr-1" />지지구간 {orderBlocks.filter(ob => ob.type === 'bullish').length}개</>,
    orderBlocks && orderBlocks.filter(ob => ob.type === 'bearish').length > 0 && <><Layers className="w-3 h-3 inline mr-1" />저항구간 {orderBlocks.filter(ob => ob.type === 'bearish').length}개</>,
    alignmentPercent >= 80 && <><Zap className="w-3 h-3 inline mr-1" />추세일치 강함</>,
    alignmentPercent < 40 && <><AlertTriangle className="w-3 h-3 inline mr-1" />추세혼조 관망</>,
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

      {/* 스코어 카드 (디버깅용 전체 너비) */}
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
      {/* 추천 타점 - 디버깅 위해 주석 처리
      <RecommendationCard recommendation={recommendation} />
      */}

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
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 text-center relative group cursor-help">
                점수
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">다이버전스 가중치 (시간 비례)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">신호</th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">추세</th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 relative group cursor-help">
                추세력<span className="text-gray-600">(ADX)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">추세 강도 (25+ 강한 추세🔥)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500">RSI</th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 relative group cursor-help">
                괴리<span className="text-gray-600">(DIV)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">가격↔지표 다이버전스</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 text-center relative group cursor-help">
                매수세<span className="text-gray-600">(CVD)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">누적 거래량 델타 (매수-매도 차이)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 relative group cursor-help">
                변동성<span className="text-gray-600">(ATR)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">평균 변동폭 대비 (1.0x = 평균)</span>
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-gray-500 text-center relative group cursor-help">
                포지션<span className="text-gray-600">(OI)</span>
                <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-gray-200 text-[10px] rounded whitespace-nowrap z-10">미결제약정 (포지션 증감)</span>
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
            <div key={repeat} className="flex items-center gap-6 px-4 text-gray-400">
              <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /><span className="text-green-400 font-bold">↑↑↑</span> 강한상승</span>
              <span className="flex items-center gap-1"><span className="text-teal-400 font-bold">↑↑</span> 상승</span>
              <span className="flex items-center gap-1"><span className="text-cyan-400 font-bold">↑</span> 약상승</span>
              <span className="flex items-center gap-1"><span>→</span> 횡보</span>
              <span className="flex items-center gap-1"><span className="text-amber-400 font-bold">↓</span> 약하락</span>
              <span className="flex items-center gap-1"><span className="text-orange-400 font-bold">↓↓</span> 하락</span>
              <span className="flex items-center gap-1"><span className="text-red-400 font-bold">↓↓↓</span> 강한하락</span>
              <span className="text-gray-600">│</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-orange-400" /> ADX25+ 강한추세</span>
              <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400" /> ATR1.5x+ 고변동</span>
              <span className="flex items-center gap-1"><Minus className="w-3 h-3 text-blue-400" /> ATR0.8x↓ 저변동</span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
