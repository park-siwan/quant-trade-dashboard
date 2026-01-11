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

// 프로그레스 바 컴포넌트
const ScoreBar = ({ score, maxScore, color }: { score: number; maxScore: number; color: string }) => {
  const percentage = (score / maxScore) * 100;

  return (
    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

// 카테고리 상세 컴포넌트 (상단 박스와 50/50 정렬)
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
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        {/* 라벨 행 */}
        <div className="flex items-center gap-1 mb-1">
          {isOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          <span>{label}</span>
        </div>

        {/* 프로그레스바 - 상단 박스와 동일한 grid-cols-2 gap-4 */}
        <div className="grid grid-cols-2 gap-4">
          <ScoreBar score={longScore} maxScore={maxScore} color={getBarColor(longScore)} />
          <ScoreBar score={shortScore} maxScore={maxScore} color={getBarColor(shortScore)} />
        </div>
      </button>
      {isOpen && (
        <div className="grid grid-cols-2 gap-4 text-[9px] text-gray-600 pt-1">
          <div>
            <span className="text-green-400/80 font-mono">{longScore}/{maxScore}점</span>
            <ul className="space-y-0.5 mt-1">
              {longDetails.map((d, i) => <li key={i}>• {d}</li>)}
            </ul>
          </div>
          <div>
            <span className="text-red-400/80 font-mono">{shortScore}/{maxScore}점</span>
            <ul className="space-y-0.5 mt-1">
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
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4">
      {/* 헤더 */}
      <div className="mb-3">
        <h3 className="text-sm font-bold text-gray-400">Signal Score</h3>
      </div>

      {/* 롱/숏 전체 점수 비교 */}
      <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-white/10">
        {/* 롱 점수 */}
        <div className={`p-3 rounded-lg border relative ${betterDirection === 'long' ? 'border-green-500/30 bg-green-500/5' : 'border-white/5 bg-white/[0.01]'}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400 font-semibold">롱</span>
            {betterDirection === 'long' && <span className="text-[9px] text-green-400/60 ml-auto">추천</span>}
          </div>
          <div className="text-3xl font-bold font-mono text-green-400">
            {longScore.total}
          </div>
          {longScore.recommendation.action !== 'wait' ? (
            <div className="mt-2 text-[10px] text-gray-500">
              {longScore.recommendation.leverage} · {longScore.recommendation.seedRatio}
            </div>
          ) : (
            <div className="absolute bottom-2 right-2">
              <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getConfidenceBadgeStyle(longScore.confidence)}`}>
                {longConfidence.label}
              </span>
            </div>
          )}
        </div>

        {/* 숏 점수 */}
        <div className={`p-3 rounded-lg border relative ${betterDirection === 'short' ? 'border-red-500/30 bg-red-500/5' : 'border-white/5 bg-white/[0.01]'}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400 font-semibold">숏</span>
            {betterDirection === 'short' && <span className="text-[9px] text-red-400/60 ml-auto">추천</span>}
          </div>
          <div className="text-3xl font-bold font-mono text-red-400">
            {shortScore.total}
          </div>
          {shortScore.recommendation.action !== 'wait' ? (
            <div className="mt-2 text-[10px] text-gray-500">
              {shortScore.recommendation.leverage} · {shortScore.recommendation.seedRatio}
            </div>
          ) : (
            <div className="absolute bottom-2 right-2">
              <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getConfidenceBadgeStyle(shortScore.confidence)}`}>
                {shortConfidence.label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 카테고리별 점수 비교 */}
      <div className="space-y-2 mb-3">
        <CategoryRow
          label="MTF 정렬"
          longScore={longScore.mtfAlignment.score}
          shortScore={shortScore.mtfAlignment.score}
          maxScore={30}
          longDetails={longScore.mtfAlignment.details}
          shortDetails={shortScore.mtfAlignment.details}
        />
        <CategoryRow
          label="다이버전스"
          longScore={longScore.divergence.score}
          shortScore={shortScore.divergence.score}
          maxScore={30}
          longDetails={longScore.divergence.details}
          shortDetails={shortScore.divergence.details}
        />
        <CategoryRow
          label="시장 구조"
          longScore={longScore.marketStructure.score}
          shortScore={shortScore.marketStructure.score}
          maxScore={20}
          longDetails={longScore.marketStructure.details}
          shortDetails={shortScore.marketStructure.details}
        />
        <CategoryRow
          label="외부 요인"
          longScore={longScore.externalFactors.score}
          shortScore={shortScore.externalFactors.score}
          maxScore={20}
          longDetails={longScore.externalFactors.details}
          shortDetails={shortScore.externalFactors.details}
        />
      </div>

      {/* 디버그 정보 (접이식) */}
      <details className="text-[10px]">
        <summary className="text-gray-600 cursor-pointer hover:text-gray-400">디버그 정보</summary>
        <div className="mt-2 p-2 bg-gray-900/50 rounded text-gray-500 space-y-1">
          <div>추세: {mtfData.timeframes.map(tf => `${tf.timeframe}:${tf.trend === 'bullish' ? '↑' : tf.trend === 'bearish' ? '↓' : '-'}`).join(', ')}</div>
          <div>
            다이버전스:{' '}
            {mtfData.timeframes.filter(tf => tf.divergence).length === 0 ? (
              <span>없음</span>
            ) : (
              mtfData.timeframes.filter(tf => tf.divergence).map((tf, i) => (
                <span key={tf.timeframe}>
                  {i > 0 && ', '}
                  <span className={tf.divergence?.isExpired ? 'text-gray-700' : ''}>
                    {tf.timeframe}:{tf.divergence?.direction === 'bullish' ? '↑' : '↓'}{tf.divergence?.type}
                    {tf.divergence?.isExpired && <span className="text-gray-700">(만료)</span>}
                  </span>
                </span>
              ))
            )}
          </div>
          <div>현재가: {currentPrice ? `$${currentPrice.toLocaleString()}` : 'N/A'}</div>
          <div>POC: {poc ? `$${poc.toLocaleString()}` : '-'} | VAH: {vah ? `$${vah.toLocaleString()}` : '-'} | VAL: {val ? `$${val.toLocaleString()}` : '-'}</div>
        </div>
      </details>
    </div>
  );
}
