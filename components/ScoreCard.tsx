'use client';

import { useMemo, useState, useEffect } from 'react';
import { MTFOverviewData, OrderBlock } from '@/lib/types';
import { calculateSignalScore, confidenceLabels, SignalScore, MarketStructureData } from '@/lib/scoring';
import { TrendingUp, TrendingDown, Activity, BarChart3, Layers, ArrowUpDown, Zap, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AnimatedNumber } from '@/components/shared';
import { useScoreHistory } from '@/hooks/useScoreHistory';

const ScoreLineChart = dynamic(() => import('./RadarScoreChart'), { ssr: false });
const ScoreSparkline = dynamic(() => import('./ScoreSparkline'), { ssr: false });

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

// 5개 카테고리 라벨 + 아이콘
const categoryConfig: { key: string; name: string; icon: React.ElementType }[] = [
  { key: 'divergence', name: '다이버전스', icon: Activity },
  { key: 'momentum', name: '모멘텀', icon: Zap },
  { key: 'volume', name: '거래량', icon: BarChart3 },
  { key: 'levels', name: '지지/저항', icon: Layers },
  { key: 'sentiment', name: '시장심리', icon: ArrowUpDown },
];

export default function ScoreCard({ mtfData, fundingRate, currentPrice, orderBlocks, poc, vah, val, fearGreedIndex }: ScoreCardProps) {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { history, saveScore, isLoading: historyLoading } = useScoreHistory({ limit: 60, saveInterval: 60000 });

  const { longScore, shortScore } = useMemo(() => {
    const marketData: MarketStructureData | undefined = currentPrice
      ? { currentPrice, orderBlocks, poc, vah, val }
      : undefined;
    return {
      longScore: calculateSignalScore(mtfData, 'bullish', fundingRate, marketData, fearGreedIndex),
      shortScore: calculateSignalScore(mtfData, 'bearish', fundingRate, marketData, fearGreedIndex),
    };
  }, [mtfData, fundingRate, currentPrice, orderBlocks, poc, vah, val, fearGreedIndex]);

  // 점수 변경 시 저장
  useEffect(() => {
    setLastUpdate(new Date());

    // 점수 히스토리 저장
    saveScore({
      longTotal: longScore.total,
      shortTotal: shortScore.total,
      longDivergence: longScore.divergence.score,
      shortDivergence: shortScore.divergence.score,
      longMomentum: longScore.momentum.score,
      shortMomentum: shortScore.momentum.score,
      longVolume: longScore.volume.score,
      shortVolume: shortScore.volume.score,
      longLevels: longScore.levels.score,
      shortLevels: shortScore.levels.score,
      longSentiment: longScore.sentiment.score,
      shortSentiment: shortScore.sentiment.score,
    });
  }, [longScore.total, shortScore.total, saveScore]);

  const betterDirection = longScore.total > shortScore.total ? 'long' : longScore.total < shortScore.total ? 'short' : 'neutral';
  const commonMax = Math.max(longScore.maxTotal, shortScore.maxTotal);

  const getScoreData = (score: SignalScore, key: string) => {
    return score[key as keyof SignalScore] as { score: number; maxScore: number; details: string[] };
  };

  return (
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-3">
      {/* 헤더 + 총점 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400">신호 점수</h3>
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-live-pulse" />
            {lastUpdate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* 총점 표시 */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1 ${betterDirection === 'long' ? 'text-green-400' : 'text-green-400/60'}`}>
            <TrendingUp className="w-4 h-4" />
            <span className="text-xl font-bold font-mono">
              <AnimatedNumber value={longScore.total} />
            </span>
            <span className="text-[10px] text-gray-500">/{commonMax}</span>
          </div>
          <div className={`flex items-center gap-1 ${betterDirection === 'short' ? 'text-red-400' : 'text-red-400/60'}`}>
            <TrendingDown className="w-4 h-4" />
            <span className="text-xl font-bold font-mono">
              <AnimatedNumber value={shortScore.total} />
            </span>
            <span className="text-[10px] text-gray-500">/{commonMax}</span>
          </div>
        </div>
      </div>

      {/* 2컬럼: 신호점수 차트 + 점수 추이 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 왼쪽: 신호점수 차트 */}
        <div>
          <div className="text-[10px] text-gray-500 mb-2">카테고리별 점수</div>
          <ScoreLineChart
            longScores={{
              divergence: longScore.divergence.score,
              momentum: longScore.momentum.score,
              volume: longScore.volume.score,
              levels: longScore.levels.score,
              sentiment: longScore.sentiment.score,
            }}
            shortScores={{
              divergence: shortScore.divergence.score,
              momentum: shortScore.momentum.score,
              volume: shortScore.volume.score,
              levels: shortScore.levels.score,
              sentiment: shortScore.sentiment.score,
            }}
            size="normal"
          />
        </div>

        {/* 오른쪽: 점수 추이 */}
        <div>
          <div className="text-[10px] text-gray-500 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              점수 추이
            </span>
            <span>{historyLoading ? '로딩...' : `${history.length}개`}</span>
          </div>
          <ScoreSparkline history={history} height={120} showBoth={true} />
        </div>
      </div>

      {/* 상세 점수 아코디언 */}
      <div className="mt-3 border-t border-white/10 pt-2">
        <button
          onClick={() => setIsDetailOpen(!isDetailOpen)}
          className="w-full flex items-center justify-between text-[11px] text-gray-500 hover:text-gray-300 py-1"
        >
          <span className="flex items-center gap-1">
            {isDetailOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            상세 점수 분석
          </span>
          <span className="text-[10px]">
            {isDetailOpen ? '접기' : '펼치기'}
          </span>
        </button>

        {isDetailOpen && (
          <div className="mt-2 space-y-2">
            {categoryConfig.map(({ key, name, icon: Icon }) => {
              const longData = getScoreData(longScore, key);
              const shortData = getScoreData(shortScore, key);
              const maxScore = Math.max(longData.maxScore || 0, shortData.maxScore || 0);
              const longBetter = longData.score > shortData.score;
              const shortBetter = shortData.score > longData.score;

              return (
                <div key={key} className="bg-white/[0.02] rounded-lg p-2">
                  {/* 카테고리 헤더 */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-gray-300 text-[11px]">
                      <Icon className="w-3 h-3 text-gray-500" />
                      <span>{name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className={longBetter ? 'text-green-400 font-bold' : 'text-green-400/60'}>
                        롱 {longData.score}/{maxScore}
                      </span>
                      <span className={shortBetter ? 'text-red-400 font-bold' : 'text-red-400/60'}>
                        숏 {shortData.score}/{maxScore}
                      </span>
                    </div>
                  </div>

                  {/* 상세 내용 */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="space-y-0.5">
                      {longData.details.map((detail, i) => (
                        <div
                          key={i}
                          className={
                            detail.includes('+') ? 'text-green-400/80' :
                            detail.includes('-') ? 'text-red-400/80' : 'text-gray-500'
                          }
                        >
                          {detail}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-0.5">
                      {shortData.details.map((detail, i) => (
                        <div
                          key={i}
                          className={
                            detail.includes('+') ? 'text-green-400/80' :
                            detail.includes('-') ? 'text-red-400/80' : 'text-gray-500'
                          }
                        >
                          {detail}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
