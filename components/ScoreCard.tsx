'use client';

import { useMemo, useState } from 'react';
import { MTFOverviewData } from '@/lib/types';
import { calculateSignalScore, confidenceLabels, SignalScore } from '@/lib/scoring';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

interface ScoreCardProps {
  mtfData: MTFOverviewData;
  fundingRate?: number;
}

// 프로그레스 바 컴포넌트
const ScoreBar = ({ score, maxScore, color }: { score: number; maxScore: number; color: string }) => {
  const percentage = (score / maxScore) * 100;

  return (
    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

// 카테고리 상세 컴포넌트
const CategoryDetail = ({
  label,
  score,
  maxScore,
  details,
  color,
}: {
  label: string;
  score: number;
  maxScore: number;
  details: string[];
  color: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {label}
        </button>
        <span className="text-xs font-mono text-gray-300">
          {score}/{maxScore}
        </span>
      </div>
      <ScoreBar score={score} maxScore={maxScore} color={color} />
      {isOpen && details.length > 0 && (
        <ul className="text-[10px] text-gray-500 pl-4 space-y-0.5">
          {details.map((detail, i) => (
            <li key={i}>- {detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default function ScoreCard({ mtfData, fundingRate }: ScoreCardProps) {
  const [direction, setDirection] = useState<'bullish' | 'bearish'>('bullish');

  const score = useMemo(() => {
    return calculateSignalScore(mtfData, direction, fundingRate);
  }, [mtfData, direction, fundingRate]);

  const confidenceInfo = confidenceLabels[score.confidence];

  // 전체 점수 색상
  const getTotalScoreColor = (total: number) => {
    if (total >= 80) return 'text-green-400';
    if (total >= 65) return 'text-lime-400';
    if (total >= 50) return 'text-yellow-400';
    if (total >= 35) return 'text-orange-400';
    return 'text-red-400';
  };

  // 카테고리별 바 색상
  const getCategoryBarColor = (score: number, maxScore: number) => {
    const ratio = score / maxScore;
    if (ratio >= 0.8) return 'bg-green-400';
    if (ratio >= 0.6) return 'bg-lime-400';
    if (ratio >= 0.4) return 'bg-yellow-400';
    if (ratio >= 0.2) return 'bg-orange-400';
    return 'bg-red-400';
  };

  return (
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-400">Signal Score</h3>

        {/* 방향 토글 */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setDirection('bullish')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
              direction === 'bullish'
                ? 'bg-green-500/20 text-green-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            롱
          </button>
          <button
            onClick={() => setDirection('bearish')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
              direction === 'bearish'
                ? 'bg-red-500/20 text-red-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <TrendingDown className="w-3 h-3" />
            숏
          </button>
        </div>
      </div>

      {/* 전체 점수 */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold font-mono ${getTotalScoreColor(score.total)}`}>
            {score.total}
          </span>
          <span className="text-gray-500 text-sm">/ {score.maxTotal}</span>
        </div>
        <div className={`px-3 py-1 rounded-lg border ${
          score.confidence === 'skip'
            ? 'bg-red-500/20 border-red-500/30'
            : score.confidence === 'highest'
            ? 'bg-green-500/20 border-green-500/30'
            : 'bg-gray-500/20 border-gray-500/30'
        }`}>
          <span className={`text-sm font-semibold ${confidenceInfo.color}`}>
            {confidenceInfo.label}
          </span>
        </div>
      </div>

      {/* 카테고리별 점수 */}
      <div className="space-y-3 mb-4">
        <CategoryDetail
          label="MTF 정렬"
          score={score.mtfAlignment.score}
          maxScore={score.mtfAlignment.maxScore}
          details={score.mtfAlignment.details}
          color={getCategoryBarColor(score.mtfAlignment.score, score.mtfAlignment.maxScore)}
        />
        <CategoryDetail
          label="다이버전스"
          score={score.divergence.score}
          maxScore={score.divergence.maxScore}
          details={score.divergence.details}
          color={getCategoryBarColor(score.divergence.score, score.divergence.maxScore)}
        />
        <CategoryDetail
          label="시장 구조"
          score={score.marketStructure.score}
          maxScore={score.marketStructure.maxScore}
          details={score.marketStructure.details}
          color={getCategoryBarColor(score.marketStructure.score, score.marketStructure.maxScore)}
        />
        <CategoryDetail
          label="외부 요인"
          score={score.externalFactors.score}
          maxScore={score.externalFactors.maxScore}
          details={score.externalFactors.details}
          color={getCategoryBarColor(score.externalFactors.score, score.externalFactors.maxScore)}
        />
      </div>

      {/* 추천 */}
      {score.recommendation.action !== 'wait' ? (
        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">추천:</span>
              <span className={direction === 'bullish' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {direction === 'bullish' ? '롱' : '숏'} 진입
              </span>
            </div>
            <div className="flex items-center gap-3 text-gray-400">
              <span>레버리지: <span className="text-white">{score.recommendation.leverage}</span></span>
              <span>시드: <span className="text-white">{score.recommendation.seedRatio}</span></span>
            </div>
          </div>
        </div>
      ) : (
        <div className="pt-3 border-t border-white/10">
          <div className="text-center text-xs text-red-400">
            진입 금지 - 명확한 신호를 기다리세요
          </div>
        </div>
      )}
    </div>
  );
}
