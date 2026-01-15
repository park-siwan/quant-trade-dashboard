'use client';

import { useMemo, useState, useEffect } from 'react';
import { MTFOverviewData, OrderBlock } from '@/lib/types';
import { calculateSignalScore, confidenceLabels, SignalScore, MarketStructureData } from '@/lib/scoring';
import { TrendingUp, TrendingDown, Activity, BarChart3, Layers, ArrowUpDown, Zap } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AnimatedNumber } from '@/components/shared';

const RadarScoreChart = dynamic(() => import('./RadarScoreChart'), { ssr: false });

interface ScoreCardProps {
  mtfData: MTFOverviewData;
  fundingRate?: number;
  currentPrice?: number;
  orderBlocks?: OrderBlock[];
  poc?: number;
  vah?: number;
  val?: number;
  fearGreedIndex?: number;
}

// 6개 카테고리 라벨 + 아이콘
const categoryLabels: Record<string, { name: string; max: number; icon: React.ElementType }> = {
  trendAlignment: { name: '추세', max: 20, icon: TrendingUp },
  divergence: { name: '다이버전스', max: 20, icon: Activity },
  momentum: { name: '모멘텀', max: 15, icon: Zap },
  volume: { name: '거래량', max: 15, icon: BarChart3 },
  levels: { name: '지지/저항', max: 15, icon: Layers },
  sentiment: { name: '시장심리', max: 15, icon: ArrowUpDown },
};

// 상세 이유 컴포넌트
const ScoreDetails = ({
  score,
  type
}: {
  score: SignalScore;
  type: 'long' | 'short';
}) => {
  const colorClass = type === 'long' ? 'text-green-400' : 'text-red-400';
  const colorClassMuted = type === 'long' ? 'text-green-400/80' : 'text-red-400/80';
  const Icon = type === 'long' ? TrendingUp : TrendingDown;

  // 레이더 차트와 동일한 순서 (대척점: 추세↔다이버전스, 거래량↔지지/저항, 모멘텀↔시장심리)
  const categories = [
    { key: 'trendAlignment', data: score.trendAlignment },
    { key: 'volume', data: score.volume },
    { key: 'momentum', data: score.momentum },
    { key: 'divergence', data: score.divergence },
    { key: 'levels', data: score.levels },
    { key: 'sentiment', data: score.sentiment },
  ];

  return (
    <div className="space-y-2">
      {/* 총점 헤더 */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/10">
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <span className={`text-sm font-bold ${colorClass}`}>
          {type === 'long' ? '롱' : '숏'}
        </span>
        <span className={`text-xl font-bold font-mono ${colorClass} ml-auto`}>
          <AnimatedNumber value={score.total} />
          <span className="text-xs text-gray-500 font-normal">/100</span>
        </span>
      </div>

      {/* 카테고리별 상세 */}
      <div className="space-y-2">
        {categories.map(({ key, data }) => {
          const { name, max, icon: CategoryIcon } = categoryLabels[key];
          const hasDetails = data.details.length > 0;

          return (
            <div key={key} className="text-xs">
              {/* 카테고리 헤더 */}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-gray-300">
                  <CategoryIcon className="w-3 h-3 text-gray-500" />
                  {name}
                </span>
                <span className={`font-mono font-medium ${colorClass}`}>
                  {data.score}/{max}
                </span>
              </div>
              {/* 상세 이유 (1개만 표시) */}
              {hasDetails && (
                <div className="text-[10px] text-gray-400 truncate pl-4">
                  {data.details[0]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function ScoreCard({ mtfData, fundingRate, currentPrice, orderBlocks, poc, vah, val, fearGreedIndex }: ScoreCardProps) {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const { longScore, shortScore } = useMemo(() => {
    const marketData: MarketStructureData | undefined = currentPrice
      ? { currentPrice, orderBlocks, poc, vah, val }
      : undefined;
    return {
      longScore: calculateSignalScore(mtfData, 'bullish', fundingRate, marketData, fearGreedIndex),
      shortScore: calculateSignalScore(mtfData, 'bearish', fundingRate, marketData, fearGreedIndex),
    };
  }, [mtfData, fundingRate, currentPrice, orderBlocks, poc, vah, val, fearGreedIndex]);

  // 점수 변경 시 업데이트 시간 갱신
  useEffect(() => {
    setLastUpdate(new Date());
  }, [longScore.total, shortScore.total]);

  const betterDirection = longScore.total > shortScore.total ? 'long' : longScore.total < shortScore.total ? 'short' : 'neutral';

  return (
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-3 h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400">신호 점수</h3>
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-live-pulse" />
            {lastUpdate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        {betterDirection !== 'neutral' && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            betterDirection === 'long'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {betterDirection === 'long' ? '롱 우세' : '숏 우세'}
          </span>
        )}
      </div>

      {/* 메인 레이아웃: 좌측 레이더 + 우측 상세 */}
      <div className="grid grid-cols-[1fr_1.3fr] gap-4">
        {/* 좌측: 레이더 차트 (육각형) */}
        <div className="flex flex-col">
          <RadarScoreChart
            longScores={{
              trendAlignment: longScore.trendAlignment.score,
              divergence: longScore.divergence.score,
              momentum: longScore.momentum.score,
              volume: longScore.volume.score,
              levels: longScore.levels.score,
              sentiment: longScore.sentiment.score,
            }}
            shortScores={{
              trendAlignment: shortScore.trendAlignment.score,
              divergence: shortScore.divergence.score,
              momentum: shortScore.momentum.score,
              volume: shortScore.volume.score,
              levels: shortScore.levels.score,
              sentiment: shortScore.sentiment.score,
            }}
            size="large"
          />
        </div>

        {/* 우측: 롱/숏 상세 비교 */}
        <div className="grid grid-cols-2 gap-2">
          {/* 롱 상세 */}
          <div className={`p-2 rounded-lg border ${
            betterDirection === 'long'
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-white/5 bg-white/[0.01]'
          }`}>
            <ScoreDetails score={longScore} type="long" />
          </div>

          {/* 숏 상세 */}
          <div className={`p-2 rounded-lg border ${
            betterDirection === 'short'
              ? 'border-red-500/30 bg-red-500/5'
              : 'border-white/5 bg-white/[0.01]'
          }`}>
            <ScoreDetails score={shortScore} type="short" />
          </div>
        </div>
      </div>
    </div>
  );
}
