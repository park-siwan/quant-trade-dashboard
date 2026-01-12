'use client';

import { useState, useEffect, useRef } from 'react';
import { Recommendation, WaitCondition, DirectionRecommendation } from '@/lib/recommendation';
import { TrendingUp, TrendingDown, Ban, Clock, CheckCircle, Target, ShieldAlert, Crosshair, Scale } from 'lucide-react';

interface RecommendationCardProps {
  recommendation: Recommendation;
  currentPrice?: number;
}

// 개별 숫자 슬롯 컴포넌트
const DigitSlot = ({ digit, direction, size = 'normal' }: { digit: string; direction: 'up' | 'down' | null; size?: 'normal' | 'large' }) => {
  const [currentDigit, setCurrentDigit] = useState(digit);
  const [prevDigit, setPrevDigit] = useState(digit);
  const [isSpinning, setIsSpinning] = useState(false);
  const prevDigitRef = useRef(digit);

  useEffect(() => {
    if (prevDigitRef.current !== digit) {
      setPrevDigit(prevDigitRef.current);
      setCurrentDigit(digit);
      setIsSpinning(true);
      prevDigitRef.current = digit;

      const timer = setTimeout(() => setIsSpinning(false), 500);
      return () => clearTimeout(timer);
    }
  }, [digit]);

  const sizeClass = size === 'large' ? 'w-[0.55em] h-[1.2em]' : 'w-[0.5em] h-[1.1em]';

  return (
    <span className={`inline-block ${sizeClass} overflow-hidden relative`}>
      {isSpinning && (
        <span
          className={`absolute inset-0 flex items-center justify-center ${
            direction === 'up' ? 'animate-digit-out-up' : 'animate-digit-out-down'
          }`}
        >
          {prevDigit}
        </span>
      )}
      <span
        className={`flex items-center justify-center ${
          isSpinning
            ? direction === 'up'
              ? 'animate-digit-in-up'
              : 'animate-digit-in-down'
            : ''
        }`}
      >
        {currentDigit}
      </span>
    </span>
  );
};

// 애니메이션 숫자 컴포넌트
const AnimatedPrice = ({ value, prefix = '', suffix = '', className = '' }: { value: number; prefix?: string; suffix?: string; className?: string }) => {
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const previousValue = useRef(value);
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 0 });

  useEffect(() => {
    if (previousValue.current !== value) {
      setDirection(value > previousValue.current ? 'up' : 'down');
      previousValue.current = value;

      const timer = setTimeout(() => setDirection(null), 600);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span className={`flex items-baseline justify-center ${className}`}>
      <span className="h-[1.2em] flex items-center -translate-y-[0.7px]">{prefix}</span>
      {formatted.split('').map((char, i) => (
        char === ',' ? <span key={i} className="h-[1.2em] flex items-center">,</span> : <DigitSlot key={i} digit={char} direction={direction} size="large" />
      ))}
      {suffix && <span className="h-[1.2em] flex items-center">{suffix}</span>}
    </span>
  );
};

// 애니메이션 퍼센트 컴포넌트
const AnimatedPercent = ({ value, showSign = true, className = '' }: { value: number; showSign?: boolean; className?: string }) => {
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const previousValue = useRef(value);
  const formatted = Math.abs(value).toFixed(0);
  const sign = showSign ? (value >= 0 ? '+' : '-') : '';

  useEffect(() => {
    if (previousValue.current !== value) {
      setDirection(value > previousValue.current ? 'up' : 'down');
      previousValue.current = value;

      const timer = setTimeout(() => setDirection(null), 600);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span className={`flex items-baseline justify-center ${className}`}>
      <span className="h-[1.1em] flex items-center">{sign}</span>
      {formatted.split('').map((char, i) => (
        <DigitSlot key={i} digit={char} direction={direction} size="normal" />
      ))}
      <span className="h-[1.1em] flex items-center">%</span>
    </span>
  );
};

// 상태별 스타일
const statusStyles = {
  entry: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    icon: CheckCircle,
    label: '진입 가능',
  },
  wait: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    icon: Clock,
    label: '조건부 대기',
  },
  forbidden: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    icon: Ban,
    label: '진입 금지',
  },
};

// 대기 조건 카드 (컴팩트)
function ConditionCard({ condition, index }: { condition: WaitCondition; index: number }) {
  const isLong = condition.direction === 'long';

  return (
    <div className="bg-white/[0.02] rounded p-2 border border-white/5">
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${
            isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {index + 1}. {isLong ? '롱' : '숏'}
        </span>
        {isLong ? (
          <TrendingUp className="w-3 h-3 text-green-400" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-400" />
        )}
      </div>
      <div className="text-[12px] text-gray-300">
        <span className="font-mono text-white">
          ${condition.triggerPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>{' '}
        {condition.triggerType === 'touch' ? '터치' : condition.triggerType === 'break' ? '돌파' : '접근'}
        {' + '}
        <span className="text-gray-400">{condition.requiredSignal}</span>
      </div>
      <div className="text-[12px] text-gray-500">
        예상{' '}
        <span className={condition.expectedScore >= 50 ? 'text-green-400' : 'text-yellow-400'}>
          {condition.expectedScore}점
        </span>
      </div>
    </div>
  );
}

// 진입 정보 카드 (컴팩트)
function EntryInfo({ recommendation }: { recommendation: Recommendation }) {
  if (!recommendation.entryPrice) return null;

  const isLong = recommendation.direction === 'long';
  const entryPrice = recommendation.entryPrice;
  const takeProfit = recommendation.takeProfit || entryPrice;

  // 익절까지 필요한 % 계산
  const tpPercent = ((takeProfit - entryPrice) / entryPrice) * 100;

  return (
    <div className="space-y-2">
      {/* 방향 표시 */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded ${
            isLong ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}
        >
          {isLong ? (
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
          )}
          <span className={`text-sm font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
            {isLong ? '롱' : '숏'}
          </span>
        </div>
      </div>

      {/* 가격 정보 - 1/3씩 한 줄에 */}
      {(() => {
        const stopLoss = recommendation.stopLoss || entryPrice;
        const slPercent = isLong
          ? ((entryPrice - stopLoss) / entryPrice) * 100
          : ((stopLoss - entryPrice) / entryPrice) * 100;

        return (
          <div className="grid grid-cols-3 gap-1 bg-white/[0.02] rounded p-1.5 border border-white/5">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-[12px] text-gray-500 mb-0.5">
                <Crosshair className="w-3 h-3 text-blue-400" />
                <span>진입가</span>
              </div>
              <div className="font-mono text-gray-300 text-[12px]">
                <AnimatedPrice value={entryPrice} prefix="$" />
              </div>
            </div>
            <div className="text-center border-x border-white/5">
              <div className="flex items-center justify-center gap-1 text-[12px] text-gray-500 mb-0.5">
                <ShieldAlert className="w-3 h-3 text-red-400" />
                <span>손절 (-{Math.abs(slPercent).toFixed(1)}%)</span>
              </div>
              <div className="font-mono text-gray-300 text-[12px]">
                <AnimatedPrice value={stopLoss} prefix="$" />
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-[12px] text-gray-500 mb-0.5">
                <Target className="w-3 h-3 text-green-400" />
                <span>익절 (+{Math.abs(tpPercent).toFixed(1)}%)</span>
              </div>
              <div className="font-mono text-gray-300 text-[12px]">
                <AnimatedPrice value={takeProfit} prefix="$" />
              </div>
            </div>
          </div>
        );
      })()}

      {/* 손익비 + 익절/손절 카드 */}
      {(() => {
        const stopLoss = recommendation.stopLoss || entryPrice;
        const slPercent = isLong
          ? ((entryPrice - stopLoss) / entryPrice) * 100
          : ((stopLoss - entryPrice) / entryPrice) * 100;
        const riskReward = Math.abs(tpPercent) / Math.abs(slPercent);

        return (
          <div className="space-y-2">
            {/* 통합 테이블: 손익비 + 레버리지별 수익/손실 */}
            {(() => {
              const rrRounded = Math.round(riskReward * 10) / 10;
              const rrStyle = rrRounded >= 2
                ? { bg: 'bg-green-500', glow: 'shadow-[0_0_8px_rgba(34,197,94,0.6)]', text: 'text-green-400', label: '좋음' }
                : rrRounded >= 1.5
                ? { bg: 'bg-yellow-500', glow: 'shadow-[0_0_8px_rgba(234,179,8,0.6)]', text: 'text-yellow-400', label: '보통' }
                : { bg: 'bg-red-500', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.6)]', text: 'text-red-400', label: '위험' };

              // 근거별 스타일 (신호등)
              const getReasonStyle = (reason: string) => {
                if (reason.includes('VAH') || reason.includes('VAL')) {
                  return { bg: 'bg-purple-500', glow: 'shadow-[0_0_6px_rgba(168,85,247,0.5)]', text: 'text-purple-300' };
                }
                if (reason.includes('POC')) {
                  return { bg: 'bg-yellow-500', glow: 'shadow-[0_0_6px_rgba(234,179,8,0.5)]', text: 'text-yellow-300' };
                }
                if (reason.includes('보수적')) {
                  return { bg: 'bg-orange-500', glow: 'shadow-[0_0_6px_rgba(249,115,22,0.5)]', text: 'text-orange-300' };
                }
                return { bg: 'bg-blue-500', glow: 'shadow-[0_0_6px_rgba(59,130,246,0.5)]', text: 'text-blue-300' };
              };

              const tpReason = recommendation.takeProfitReason || '4ATR';
              const slReason = recommendation.stopLossReason || '2ATR';
              const tpStyle = getReasonStyle(tpReason);
              const slStyle = getReasonStyle(slReason);

              return (
                <div className="bg-white/[0.02] rounded border border-white/5 overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className="py-1.5 px-2 text-left text-gray-500 font-medium"></th>
                        <th className="py-1.5 px-2 text-center text-gray-500 font-medium">1x</th>
                        {[5, 10, 20].map((lev) => (
                          <th key={lev} className="py-1.5 px-2 text-center text-gray-400 font-medium">{lev}x</th>
                        ))}
                        <th className="py-1.5 px-2 text-right text-gray-500 font-medium">근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-white/5">
                        <td className="py-1.5 px-2 text-gray-400">
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-green-400" />익절
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-gray-500">
                          +{Math.abs(tpPercent).toFixed(1)}%
                        </td>
                        {[5, 10, 20].map((lev) => (
                          <td key={lev} className="py-1.5 px-2 text-center font-mono font-bold text-green-400">
                            <AnimatedPercent value={Math.abs(tpPercent) * lev} />
                          </td>
                        ))}
                        <td className="py-1.5 px-2 text-right">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${tpStyle.text} ${tpStyle.glow}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${tpStyle.bg}`} />
                            {tpReason}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-white/5">
                        <td className="py-1.5 px-2 text-gray-400">
                          <span className="flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-red-400" />손절
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-gray-500">
                          -{Math.abs(slPercent).toFixed(1)}%
                        </td>
                        {[5, 10, 20].map((lev) => (
                          <td key={lev} className="py-1.5 px-2 text-center font-mono font-bold text-red-400">
                            <AnimatedPercent value={-(Math.abs(slPercent) * lev)} />
                          </td>
                        ))}
                        <td className="py-1.5 px-2 text-right">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${slStyle.text} ${slStyle.glow}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${slStyle.bg}`} />
                            {slReason}
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-white/[0.02]">
                        <td className="py-1.5 px-2 text-gray-400">
                          <span className="flex items-center gap-1">
                            <Scale className="w-3 h-3 text-blue-400" />손익비
                          </span>
                        </td>
                        <td colSpan={4} className="py-1.5 px-2 text-center">
                          <span className={`font-mono font-bold ${rrStyle.text}`}>
                            1 : {rrRounded.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${rrStyle.text} ${rrStyle.glow}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${rrStyle.bg} animate-pulse`} />
                            {rrStyle.label}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}

// 롱/숏 비교 카드 (둘 다 표시)
function DirectionCompareCard({ long, short, primaryDirection }: {
  long?: DirectionRecommendation;
  short?: DirectionRecommendation;
  primaryDirection: 'long' | 'short' | null;
}) {
  if (!long || !short) return null;

  const renderDirection = (rec: DirectionRecommendation, isPrimary: boolean) => {
    const isLong = rec.direction === 'long';
    const slPercent = isLong
      ? ((rec.entryPrice - rec.stopLoss) / rec.entryPrice) * 100
      : ((rec.stopLoss - rec.entryPrice) / rec.entryPrice) * 100;
    const tpPercent = isLong
      ? ((rec.takeProfit - rec.entryPrice) / rec.entryPrice) * 100
      : ((rec.entryPrice - rec.takeProfit) / rec.entryPrice) * 100;

    return (
      <div className={`flex-1 p-2 rounded-lg border ${
        isPrimary
          ? isLong
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-red-500/10 border-red-500/30'
          : 'bg-white/[0.02] border-white/5'
      }`}>
        {/* 헤더: 방향 + 점수 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {isLong ? (
              <TrendingUp className={`w-4 h-4 ${isPrimary ? 'text-green-400' : 'text-gray-400'}`} />
            ) : (
              <TrendingDown className={`w-4 h-4 ${isPrimary ? 'text-red-400' : 'text-gray-400'}`} />
            )}
            <span className={`text-sm font-bold ${
              isPrimary
                ? isLong ? 'text-green-400' : 'text-red-400'
                : 'text-gray-400'
            }`}>
              {isLong ? '롱' : '숏'}
            </span>
            {isPrimary && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1 rounded">추천</span>
            )}
          </div>
          <span className={`text-lg font-bold ${
            rec.score >= 50 ? 'text-green-400' : rec.score >= 35 ? 'text-yellow-400' : 'text-gray-400'
          }`}>
            {rec.score}점
          </span>
        </div>

        {/* 가격 정보 */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-500">진입</span>
            <span className="font-mono text-gray-300">${rec.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">손절</span>
            <span className="font-mono text-red-400">
              ${rec.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">익절</span>
            <span className="font-mono text-green-400">
              ${rec.takeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* 레버리지별 손익 테이블 */}
        <div className="mt-2 pt-2 border-t border-white/5">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left font-normal"></th>
                <th className="text-right font-normal">5x</th>
                <th className="text-right font-normal">10x</th>
                <th className="text-right font-normal">20x</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-gray-500 py-0.5">익절</td>
                {[5, 10, 20].map((lev) => (
                  <td key={lev} className="text-right font-mono text-green-400 py-0.5">
                    +{(tpPercent * lev).toFixed(0)}%
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-gray-500 py-0.5">손절</td>
                {[5, 10, 20].map((lev) => (
                  <td key={lev} className="text-right font-mono text-red-400 py-0.5">
                    -{(slPercent * lev).toFixed(0)}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* R:R */}
        <div className="flex justify-between mt-2 pt-1 border-t border-white/5 text-[11px]">
          <span className="text-gray-500">R:R</span>
          <span className={`font-mono font-bold ${
            rec.riskReward >= 2 ? 'text-green-400' : rec.riskReward >= 1.5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            1:{rec.riskReward.toFixed(1)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-2">
      {renderDirection(long, primaryDirection === 'long')}
      {renderDirection(short, primaryDirection === 'short')}
    </div>
  );
}

export default function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const style = statusStyles[recommendation.status];
  const StatusIcon = style.icon;

  return (
    <div className={`backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-3 h-full flex flex-col`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-400">추천 타점</h3>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${style.bg} ${style.border}`}
        >
          <StatusIcon className={`w-3 h-3 ${style.text}`} />
          <span className={`text-[12px] font-semibold ${style.text}`}>{style.label}</span>
        </div>
      </div>

      {/* 롱/숏 비교 카드 (항상 표시) */}
      {(recommendation.long || recommendation.short) && (
        <div className="mb-2">
          <DirectionCompareCard
            long={recommendation.long}
            short={recommendation.short}
            primaryDirection={recommendation.direction}
          />
        </div>
      )}

      {/* 조건부 대기 - 조건만 */}
      {recommendation.status === 'wait' && recommendation.conditions.length > 0 && (
        <div>
          <div className="text-[12px] text-gray-500 mb-1">추가 확신 조건:</div>
          <div className="space-y-1.5">
            {recommendation.conditions.map((cond, i) => (
              <ConditionCard key={i} condition={cond} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* 진입 금지 - 대기 조건만 */}
      {recommendation.status === 'forbidden' && recommendation.conditions.length > 0 && (
        <div>
          <div className="text-[12px] text-gray-500 mb-1">대기 조건:</div>
          <div className="space-y-1.5">
            {recommendation.conditions.map((cond, i) => (
              <ConditionCard key={i} condition={cond} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
