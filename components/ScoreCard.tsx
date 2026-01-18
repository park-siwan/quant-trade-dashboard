'use client';

import { useMemo, useState, useEffect } from 'react';
import { MTFOverviewData, OrderBlock } from '@/lib/types';
import { calculateSignalScore, confidenceLabels, SignalScore, MarketStructureData } from '@/lib/scoring';
import { TrendingUp, TrendingDown, Activity, BarChart3, Layers, ArrowUpDown, Zap, ChevronDown, ChevronRight } from 'lucide-react';
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

// 5개 카테고리 라벨 + 아이콘 (다이버전스는 동적 max)
const categoryConfig: { key: string; name: string; icon: React.ElementType }[] = [
  { key: 'divergence', name: '다이버전스', icon: Activity },
  { key: 'momentum', name: '모멘텀', icon: Zap },
  { key: 'volume', name: '거래량', icon: BarChart3 },
  { key: 'levels', name: '지지/저항', icon: Layers },
  { key: 'sentiment', name: '시장심리', icon: ArrowUpDown },
];

export default function ScoreCard({ mtfData, fundingRate, currentPrice, orderBlocks, poc, vah, val, fearGreedIndex }: ScoreCardProps) {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedRows.size === categoryConfig.length) {
      setExpandedRows(new Set());
    } else {
      setExpandedRows(new Set(categoryConfig.map(c => c.key)));
    }
  };

  const getScoreData = (score: SignalScore, key: string) => {
    return score[key as keyof SignalScore] as { score: number; maxScore: number; details: string[] };
  };

  return (
    <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400">신호 점수</h3>
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-live-pulse" />
            {lastUpdate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <button
          onClick={toggleAll}
          className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded border border-white/10"
        >
          {expandedRows.size === categoryConfig.length ? '모두 접기' : '모두 펼치기'}
        </button>
      </div>

      <div className="flex gap-3">
        {/* 좌측: 레이더 차트 (축소) */}
        <div className="flex-shrink-0 w-[140px]">
          <RadarScoreChart
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
            size="small"
          />
        </div>

        {/* 우측: 테이블 */}
        <div className="flex-1 min-w-0">
          {/* 총점 헤더 */}
          <div className="flex items-center gap-4 mb-2 pb-2 border-b border-white/10">
            <div className="flex-1" />
            {(() => {
              // 공통 분모 (둘 중 큰 값 사용)
              const commonMax = Math.max(longScore.maxTotal, shortScore.maxTotal);
              return (
                <>
                  <div className={`flex items-center gap-1 ${betterDirection === 'long' ? 'text-green-400' : 'text-green-400/60'}`}>
                    <TrendingUp className="w-3 h-3" />
                    <span className="text-lg font-bold font-mono">
                      <AnimatedNumber value={longScore.total} />
                    </span>
                    <span className="text-[10px] text-gray-500">/{commonMax}</span>
                  </div>
                  <div className={`flex items-center gap-1 ${betterDirection === 'short' ? 'text-red-400' : 'text-red-400/60'}`}>
                    <TrendingDown className="w-3 h-3" />
                    <span className="text-lg font-bold font-mono">
                      <AnimatedNumber value={shortScore.total} />
                    </span>
                    <span className="text-[10px] text-gray-500">/{commonMax}</span>
                  </div>
                </>
              );
            })()}
          </div>

          {/* 테이블 */}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left font-normal py-0.5 w-24">카테고리</th>
                <th className="text-right font-normal py-0.5 w-14 text-green-400/70">롱</th>
                <th className="text-right font-normal py-0.5 w-14 text-red-400/70">숏</th>
                <th className="text-left font-normal py-0.5 pl-2">상세</th>
              </tr>
            </thead>
            <tbody>
              {categoryConfig.map(({ key, name, icon: Icon }) => {
                const longData = getScoreData(longScore, key);
                const shortData = getScoreData(shortScore, key);
                const isExpanded = expandedRows.has(key);
                const longBetter = longData.score > shortData.score;
                const shortBetter = shortData.score > longData.score;
                // maxScore는 score 데이터에서 가져옴 (다이버전스는 동적)
                const maxScore = Math.max(longData.maxScore || 0, shortData.maxScore || 0);

                return (
                  <tr
                    key={key}
                    className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => toggleRow(key)}
                  >
                    <td className="py-1">
                      <div className="flex items-center gap-1 text-gray-300">
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-gray-500" />
                        )}
                        <Icon className="w-3 h-3 text-gray-500" />
                        <span>{name}</span>
                      </div>
                    </td>
                    <td className={`text-right font-mono py-1 ${longBetter ? 'text-green-400 font-bold' : 'text-green-400/60'}`}>
                      {longData.score}/{maxScore}
                    </td>
                    <td className={`text-right font-mono py-1 ${shortBetter ? 'text-red-400 font-bold' : 'text-red-400/60'}`}>
                      {shortData.score}/{maxScore}
                    </td>
                    <td className="py-1 pl-2 text-gray-400 truncate max-w-[200px]">
                      {!isExpanded && (
                        <span className="text-[10px]">
                          {longData.details.slice(1, 3).join(' | ')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 펼쳐진 상세 - 테이블 형태 */}
          {expandedRows.size > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left font-normal py-1 w-20">카테고리</th>
                    <th className="text-left font-normal py-1 text-green-400/70">롱 상세</th>
                    <th className="text-left font-normal py-1 text-red-400/70">숏 상세</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryConfig.map(({ key, name }) => {
                    if (!expandedRows.has(key)) return null;
                    const longData = getScoreData(longScore, key);
                    const shortData = getScoreData(shortScore, key);
                    const maxLen = Math.max(longData.details.length, shortData.details.length);

                    return Array.from({ length: maxLen }).map((_, i) => (
                      <tr key={`${key}-${i}`} className={i === 0 ? 'border-t border-white/5' : ''}>
                        <td className="py-0.5 text-gray-400 align-top">
                          {i === 0 ? name : ''}
                        </td>
                        <td className={`py-0.5 align-top ${
                          longData.details[i]?.includes('+') ? 'text-green-400/80' :
                          longData.details[i]?.includes('-') ? 'text-red-400/80' : 'text-gray-400'
                        }`}>
                          {longData.details[i] || ''}
                        </td>
                        <td className={`py-0.5 align-top ${
                          shortData.details[i]?.includes('+') ? 'text-green-400/80' :
                          shortData.details[i]?.includes('-') ? 'text-red-400/80' : 'text-gray-400'
                        }`}>
                          {shortData.details[i] || ''}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
