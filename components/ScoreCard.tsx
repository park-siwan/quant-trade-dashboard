'use client';

import { useMemo, useState } from 'react';
import { MTFOverviewData, OrderBlock } from '@/lib/types';
import { calculateSignalScore, confidenceLabels, SignalScore, MarketStructureData } from '@/lib/scoring';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

interface ScoreCardProps {
  mtfData: MTFOverviewData;
  fundingRate?: number;
  currentPrice?: number;
  orderBlocks?: OrderBlock[];
  poc?: number;
  vah?: number;
  val?: number;
}

// 프로그레스 바 컴포넌트 (컴팩트)
const ScoreBar = ({ score, maxScore, color }: { score: number; maxScore: number; color: string }) => {
  const percentage = (score / maxScore) * 100;

  return (
    <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

// 카테고리 상세 컴포넌트 (컴팩트)
const CategoryRow = ({
  label,
  longScore,
  shortScore,
  maxScore,
  longDetails,
  shortDetails,
}: {
  label: string;
  longScore: number;
  shortScore: number;
  maxScore: number;
  longDetails: string[];
  shortDetails: string[];
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const getBarColor = (score: number) => {
    const ratio = score / maxScore;
    if (ratio >= 0.8) return 'bg-green-400';
    if (ratio >= 0.6) return 'bg-lime-400';
    if (ratio >= 0.4) return 'bg-yellow-400';
    if (ratio >= 0.2) return 'bg-orange-400';
    return 'bg-red-400';
  };

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        {/* 라벨 행 */}
        <div className="flex items-center gap-1 mb-0.5">
          {isOpen ? <ChevronUp className="w-2 h-2" /> : <ChevronDown className="w-2 h-2" />}
          <span>{label}</span>
        </div>

        {/* 프로그레스바 */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreBar score={longScore} maxScore={maxScore} color={getBarColor(longScore)} />
          <ScoreBar score={shortScore} maxScore={maxScore} color={getBarColor(shortScore)} />
        </div>
      </button>
      {isOpen && (
        <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-600 pt-0.5">
          <div>
            <span className="text-green-400/80 font-mono">{longScore}/{maxScore}</span>
            <ul className="space-y-0">
              {longDetails.map((d, i) => <li key={i}>• {d}</li>)}
            </ul>
          </div>
          <div>
            <span className="text-red-400/80 font-mono">{shortScore}/{maxScore}</span>
            <ul className="space-y-0">
              {shortDetails.map((d, i) => <li key={i}>• {d}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// 신뢰도 배지 스타일
const getConfidenceBadgeStyle = (confidence: SignalScore['confidence']) => {
  switch (confidence) {
    case 'highest':
      return 'bg-green-500/20 border-green-500/30 text-green-400';
    case 'high':
      return 'bg-lime-500/20 border-lime-500/30 text-lime-400';
    case 'medium':
      return 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400';
    case 'low':
      return 'bg-orange-500/20 border-orange-500/30 text-orange-400';
    case 'skip':
    default:
      return 'bg-red-500/20 border-red-500/30 text-red-400';
  }
};

export default function ScoreCard({ mtfData, fundingRate, currentPrice, orderBlocks, poc, vah, val }: ScoreCardProps) {
  // 롱/숏 둘 다 계산
  const { longScore, shortScore } = useMemo(() => {
    const marketData: MarketStructureData | undefined = currentPrice
      ? { currentPrice, orderBlocks, poc, vah, val }
      : undefined;
    return {
      longScore: calculateSignalScore(mtfData, 'bullish', fundingRate, marketData),
      shortScore: calculateSignalScore(mtfData, 'bearish', fundingRate, marketData),
    };
  }, [mtfData, fundingRate, currentPrice, orderBlocks, poc, vah, val]);

  const longConfidence = confidenceLabels[longScore.confidence];
  const shortConfidence = confidenceLabels[shortScore.confidence];

  // 더 높은 점수 방향 확인
  const betterDirection = longScore.total > shortScore.total ? 'long' : longScore.total < shortScore.total ? 'short' : 'neutral';

  return (
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-3 h-full">
      {/* 헤더 */}
      <div className="mb-2">
        <h3 className="text-xs font-bold text-gray-400">신호 점수</h3>
      </div>

      {/* 롱/숏 전체 점수 비교 */}
      <div className="grid grid-cols-2 gap-3 mb-3 pb-3 border-b border-white/10">
        {/* 롱 점수 */}
        <div className={`p-2 rounded-lg border relative ${betterDirection === 'long' ? 'border-green-500/30 bg-green-500/5' : 'border-white/5 bg-white/[0.01]'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-[10px] text-green-400 font-semibold">롱</span>
            {betterDirection === 'long' && <span className="text-[10px] text-green-400/60 ml-auto">추천</span>}
          </div>
          <div className="text-2xl font-bold font-mono text-green-400">
            {longScore.total}
          </div>
          {longScore.recommendation.action !== 'wait' ? (
            <div className="mt-1 text-[11px] text-gray-500">
              {longScore.recommendation.leverage} · {longScore.recommendation.seedRatio}
            </div>
          ) : (
            <div className="absolute bottom-1.5 right-1.5">
              <span className={`text-[10px] px-1 py-0.5 rounded border ${getConfidenceBadgeStyle(longScore.confidence)}`}>
                {longConfidence.label}
              </span>
            </div>
          )}
        </div>

        {/* 숏 점수 */}
        <div className={`p-2 rounded-lg border relative ${betterDirection === 'short' ? 'border-red-500/30 bg-red-500/5' : 'border-white/5 bg-white/[0.01]'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-red-400 font-semibold">숏</span>
            {betterDirection === 'short' && <span className="text-[10px] text-red-400/60 ml-auto">추천</span>}
          </div>
          <div className="text-2xl font-bold font-mono text-red-400">
            {shortScore.total}
          </div>
          {shortScore.recommendation.action !== 'wait' ? (
            <div className="mt-1 text-[11px] text-gray-500">
              {shortScore.recommendation.leverage} · {shortScore.recommendation.seedRatio}
            </div>
          ) : (
            <div className="absolute bottom-1.5 right-1.5">
              <span className={`text-[10px] px-1 py-0.5 rounded border ${getConfidenceBadgeStyle(shortScore.confidence)}`}>
                {shortConfidence.label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 카테고리별 점수 비교 */}
      <div className="space-y-1.5 mb-2">
        <CategoryRow
          label="추세 종합"
          longScore={longScore.mtfAlignment.score}
          shortScore={shortScore.mtfAlignment.score}
          maxScore={30}
          longDetails={longScore.mtfAlignment.details}
          shortDetails={shortScore.mtfAlignment.details}
        />
        <CategoryRow
          label="다이버전스 (가격↔지표 괴리)"
          longScore={longScore.divergence.score}
          shortScore={shortScore.divergence.score}
          maxScore={30}
          longDetails={longScore.divergence.details}
          shortDetails={shortScore.divergence.details}
        />
        <CategoryRow
          label="시장 구조 (지지/저항·목표가·변동성)"
          longScore={longScore.marketStructure.score}
          shortScore={shortScore.marketStructure.score}
          maxScore={20}
          longDetails={longScore.marketStructure.details}
          shortDetails={shortScore.marketStructure.details}
        />
        <CategoryRow
          label="외부 요인 (펀딩비·매수세·포지션)"
          longScore={longScore.externalFactors.score}
          shortScore={shortScore.externalFactors.score}
          maxScore={20}
          longDetails={longScore.externalFactors.details}
          shortDetails={shortScore.externalFactors.details}
        />
      </div>
    </div>
  );
}
