'use client';

import { ChevronUp } from 'lucide-react';
import {
  timeframeToMinutes,
  formatMinutesToDuration as formatTimeRange,
} from '@/lib/timeframe';
import {
  TrendAnalysis,
  DivergenceSignal,
  ConsolidationData,
  VwapAtrData,
  AdxData,
  LiquidationSummary,
  WhaleSummary,
} from '@/lib/types/index';
import { LongShortRatio } from '@/hooks/useLongShortRatio';
import { VolumeProfileData, RealtimeCandle } from './chartTypes';

interface TrendIndicatorsBarProps {
  trendAnalysis?: TrendAnalysis;
  longShortRatio?: LongShortRatio | null;
  showVolumeProfile: boolean;
  volumeProfile?: VolumeProfileData | null;
  realtimeCandle?: RealtimeCandle | null;
  currentPrice: number;
  adxData?: AdxData | null;
  consolidationData?: ConsolidationData | null;
  timeframe: string;
  divergenceSignals?: DivergenceSignal[];
  vwapAtrData?: VwapAtrData | null;
  whaleData?: WhaleSummary | null;
  liquidationData?: LiquidationSummary | null;
}

export default function TrendIndicatorsBar({
  trendAnalysis,
  longShortRatio,
  showVolumeProfile,
  volumeProfile,
  realtimeCandle,
  currentPrice,
  adxData,
  consolidationData,
  timeframe,
  divergenceSignals,
  vwapAtrData,
  whaleData,
  liquidationData,
}: TrendIndicatorsBarProps) {
  return (
    <>
      {/* 추세 지표 Row */}
      <div className='flex items-center justify-between mb-2 backdrop-blur-md bg-black/40 px-3 py-2 rounded-lg border border-cyan-500/20'>
        <div className='flex items-center gap-3'>
          <span className='text-cyan-400 text-xs font-bold border border-cyan-400/50 px-1.5 py-0.5 rounded'>추세</span>

          {/* EMA 추세 */}
          {trendAnalysis && (
            <>
              {trendAnalysis.trend === 'bullish' && (
                <span className='text-lime-400 text-sm font-bold'>↑상승</span>
              )}
              {trendAnalysis.trend === 'bearish' && (
                <span className='text-red-400 text-sm font-bold'>↓하락</span>
              )}
              {trendAnalysis.trend === 'neutral' && (
                <span className='text-gray-400 text-sm font-bold'>→중립</span>
              )}
              {trendAnalysis.crossover === 'golden_cross' && (
                <span className='text-lime-400 text-sm font-bold'>✕골든</span>
              )}
              {trendAnalysis.crossover === 'dead_cross' && (
                <span className='text-red-400 text-sm font-bold'>✕데드</span>
              )}
            </>
          )}

          <span className='text-gray-600'>|</span>

          {/* 펀딩비 */}
          {longShortRatio && (() => {
            const recommendLong = longShortRatio.dominant === 'short';
            const isNeutral = longShortRatio.dominant === 'neutral';
            const textColor = isNeutral ? 'text-gray-400' : recommendLong ? 'text-lime-400' : 'text-red-400';
            return (
              <div className={`flex items-center gap-1 text-sm font-mono ${textColor}`}>
                <span className='text-gray-500'>펀비</span>
                <span className='font-bold'>{(longShortRatio.longRatio * 100).toFixed(0)}:{(longShortRatio.shortRatio * 100).toFixed(0)}</span>
              </div>
            );
          })()}

          <span className='text-gray-600'>|</span>

          {/* 목표가 */}
          {showVolumeProfile && volumeProfile && (() => {
            const price = realtimeCandle?.close ?? currentPrice;
            const isLongSignal = price < volumeProfile.poc;
            const diffPercent = ((volumeProfile.poc - price) / price * 100).toFixed(1);
            return (
              <div className={`flex items-center gap-1 text-sm font-mono ${isLongSignal ? 'text-lime-400' : 'text-red-400'}`}>
                <span className='text-gray-500'>목표</span>
                <span className='font-bold'>{(volumeProfile.poc / 1000).toFixed(1)}K</span>
                <span className='text-xs opacity-70'>({isLongSignal ? '+' : ''}{diffPercent}%)</span>
              </div>
            );
          })()}

          <span className='text-gray-600'>|</span>

          {/* ADX 추세 강도 */}
          {adxData ? (() => {
            const { currentAdx, trendStrength, trendDirection, recommendation } = adxData;

            const strengthColor = {
              none: 'text-gray-400',
              forming: 'text-yellow-400',
              strong: 'text-cyan-400',
              very_strong: 'text-blue-400',
              extreme: 'text-purple-400',
            }[trendStrength];

            const strengthChevrons = {
              none: 0,
              forming: 1,
              strong: 2,
              very_strong: 3,
              extreme: 4,
            }[trendStrength];

            const recBadge = {
              trend_follow: { text: '추세추종', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' },
              counter_trend: { text: '역추세', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50' },
              wait: { text: '관망', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' },
            }[recommendation];

            const dirIcon = trendDirection === 'bullish' ? '↑' : trendDirection === 'bearish' ? '↓' : '→';
            const dirColor = trendDirection === 'bullish' ? 'text-lime-400' : trendDirection === 'bearish' ? 'text-red-400' : 'text-gray-400';

            return (
              <div className='flex items-center gap-2'>
                <span className='text-gray-500 text-sm'>ADX</span>
                <span className={`font-mono font-bold text-sm ${strengthColor}`}>
                  {currentAdx?.toFixed(0) ?? '-'}
                </span>
                <span className='inline-flex -space-x-1.5'>
                  {Array.from({ length: strengthChevrons }).map((_, i) => (
                    <ChevronUp key={i} className={`w-4 h-4 ${strengthColor}`} />
                  ))}
                </span>
                <span className={`text-sm font-bold ${dirColor}`}>{dirIcon}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${recBadge.color}`}>
                  {recBadge.text}
                </span>
              </div>
            );
          })() : (
            <span className='text-gray-600 text-sm'>ADX -</span>
          )}
        </div>
      </div>

      {/* 역추세 지표 Row */}
      <div className='flex items-center justify-between mb-2 backdrop-blur-md bg-black/40 px-3 py-2 rounded-lg border border-amber-500/20'>
        <div className='flex items-center gap-3'>
          <span className='text-amber-400 text-xs font-bold border border-amber-400/50 px-1.5 py-0.5 rounded'>역추세</span>

          {/* 횡보 */}
          {consolidationData?.isCurrentlyConsolidating && consolidationData.currentZone ? (() => {
            const zone = consolidationData.currentZone;
            const totalMinutes = zone.candleCount * timeframeToMinutes(timeframe);
            const timeRange = formatTimeRange(totalMinutes);
            return (
              <span className='text-amber-300 text-sm font-bold animate-pulse'>
                ⚠️횡보 {timeRange} ({zone.rangePercent.toFixed(1)}%)
              </span>
            );
          })() : (
            <span className='text-gray-600 text-sm'>횡보 없음</span>
          )}

          <span className='text-gray-600'>|</span>

          {/* 다이버전스 */}
          {divergenceSignals && divergenceSignals.length > 0 ? (() => {
            const bullishCount = divergenceSignals.filter(s => s.direction === 'bullish').length;
            const bearishCount = divergenceSignals.filter(s => s.direction === 'bearish').length;
            const isBullishDominant = bullishCount >= bearishCount;
            return (
              <div className={`text-sm font-bold ${isBullishDominant ? 'text-lime-400' : 'text-red-400'}`}>
                다이버전스 {bullishCount}↑ {bearishCount}↓
              </div>
            );
          })() : (
            <span className='text-gray-600 text-sm'>다이버전스 없음</span>
          )}
        </div>

        {/* 우측: ATR */}
        {vwapAtrData?.atrPercent ? (() => {
          const ratio = vwapAtrData.atrRatio || 1;
          const isHigh = ratio > 1.3;
          const isLow = ratio < 0.7;
          const colorClass = isHigh ? 'text-orange-400' : isLow ? 'text-blue-400' : 'text-gray-400';
          const ratioPercent = ((ratio - 1) * 100).toFixed(0);
          const ratioText = ratio >= 1 ? `+${ratioPercent}%` : `${ratioPercent}%`;
          return (
            <div className={`text-sm font-mono font-bold flex items-center gap-1 ${colorClass}`}>
              <span>변동폭(ATR) {vwapAtrData.atrPercent.toFixed(2)}%</span>
              <span className='text-xs opacity-70'>({ratioText})</span>
            </div>
          );
        })() : (
          <span className='text-gray-600 text-sm'>변동폭(ATR) -</span>
        )}
      </div>

      {/* 고래/기관 Row */}
      <div className='flex items-center gap-3 mb-2 backdrop-blur-md bg-black/40 px-3 py-2 rounded-lg border border-purple-500/20'>
        <span className='text-purple-400 text-xs font-bold border border-purple-400/50 px-1.5 py-0.5 rounded'>고래/기관</span>

        {/* 고래 프로그레스바 */}
        {(() => {
          const stats = whaleData?.stats?.last5m;
          const buyVol = stats?.buyVolume || 0;
          const sellVol = stats?.sellVolume || 0;
          const totalVol = buyVol + sellVol;

          const formatUsd = (value: number) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
            return '0';
          };

          const buyPercent = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;

          return (
            <>
              <span className='text-lime-400 text-sm font-mono font-bold min-w-[50px]'>{formatUsd(buyVol)}</span>
              <div className='flex-1 h-3 bg-red-500/40 rounded-full overflow-hidden'>
                <div
                  className='h-full bg-lime-500/80 rounded-full transition-all'
                  style={{ width: `${buyPercent}%` }}
                />
              </div>
              <span className='text-red-400 text-sm font-mono font-bold min-w-[50px] text-right'>{formatUsd(sellVol)}</span>
            </>
          );
        })()}

        <span className='text-gray-600'>|</span>

        {/* 청산 */}
        {(() => {
          const recentLiqs = liquidationData?.recentLiquidations || [];
          const now = Date.now();
          const fiveMinAgo = now - 5 * 60 * 1000;
          const recentFiveMin = recentLiqs.filter(l => l.timestamp >= fiveMinAgo);

          const longLiqs = recentFiveMin.filter(l => l.side === 'Sell');
          const shortLiqs = recentFiveMin.filter(l => l.side === 'Buy');

          const avgLongPrice = longLiqs.length > 0
            ? longLiqs.reduce((sum, l) => sum + l.price, 0) / longLiqs.length
            : null;
          const avgShortPrice = shortLiqs.length > 0
            ? shortLiqs.reduce((sum, l) => sum + l.price, 0) / shortLiqs.length
            : null;

          const formatPrice = (price: number) => {
            if (price >= 1000) return `${(price / 1000).toFixed(1)}K`;
            return price.toFixed(0);
          };

          return (
            <div className='flex items-center gap-2 text-sm font-mono'>
              <span className='text-gray-500'>청산</span>
              {avgLongPrice ? (
                <span className='text-red-400 font-bold'>↓{formatPrice(avgLongPrice)}</span>
              ) : (
                <span className='text-gray-600'>-</span>
              )}
              <span className='text-gray-600'>|</span>
              {avgShortPrice ? (
                <span className='text-lime-400 font-bold'>↑{formatPrice(avgShortPrice)}</span>
              ) : (
                <span className='text-gray-600'>-</span>
              )}
            </div>
          );
        })()}
      </div>
    </>
  );
}
