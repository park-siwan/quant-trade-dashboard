'use client';

import { Recommendation, WaitCondition } from '@/lib/recommendation';
import { TrendingUp, TrendingDown, Ban, Clock, CheckCircle, Target, ShieldAlert, Crosshair } from 'lucide-react';

interface RecommendationCardProps {
  recommendation: Recommendation;
}

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
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
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
      <div className="text-[11px] text-gray-300">
        <span className="font-mono text-white">
          ${condition.triggerPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>{' '}
        {condition.triggerType === 'touch' ? '터치' : condition.triggerType === 'break' ? '돌파' : '접근'}
        {' + '}
        <span className="text-gray-400">{condition.requiredSignal}</span>
      </div>
      <div className="text-[10px] text-gray-500">
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

      {/* 가격 정보 */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="bg-white/[0.02] rounded p-1.5 border border-white/5">
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Crosshair className="w-3 h-3" />진입가
          </div>
          <div className="font-mono text-white">
            ${recommendation.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-white/[0.02] rounded p-1.5 border border-red-500/20">
          <div className="flex items-center gap-1 text-[11px] text-red-400">
            <ShieldAlert className="w-3 h-3" />손절가
          </div>
          <div className="font-mono text-red-300">
            ${recommendation.stopLoss?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-white/[0.02] rounded p-1.5 border border-green-500/20">
          <div className="flex items-center gap-1 text-[11px] text-green-400">
            <Target className="w-3 h-3" />익절목표
          </div>
          <div className="font-mono text-green-300">
            ${recommendation.takeProfit?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* 레버리지 & 시드 */}
      {recommendation.leverage && recommendation.leverage !== '-' && (
        <div className="flex gap-3 text-[11px]">
          <div>
            <span className="text-gray-500">레버리지: </span>
            <span className="text-white font-mono">{recommendation.leverage}</span>
          </div>
          <div>
            <span className="text-gray-500">시드: </span>
            <span className="text-white font-mono">{recommendation.seedRatio}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const style = statusStyles[recommendation.status];
  const StatusIcon = style.icon;

  // 점수 정보와 거리 정보 제외 (티커와 신호점수 카드에서 표시)
  const filteredReasoning = recommendation.reasoning.filter(
    (r) => !r.includes('점 /') && !r.includes('점수') && !r.includes('35점 미만') &&
           !r.includes('까지') && !r.includes('접근 시') && !r.includes('터치 시')
  );

  return (
    <div className={`backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-3 h-full flex flex-col`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-400">추천 타점</h3>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${style.bg} ${style.border}`}
        >
          <StatusIcon className={`w-3 h-3 ${style.text}`} />
          <span className={`text-[10px] font-semibold ${style.text}`}>{style.label}</span>
        </div>
      </div>

      {/* 진입 가능한 경우 */}
      {recommendation.status === 'entry' && <EntryInfo recommendation={recommendation} />}

      {/* 조건부 대기 - 진입 정보 + 조건 */}
      {recommendation.status === 'wait' && (
        <div className="space-y-2">
          <EntryInfo recommendation={recommendation} />
          {recommendation.conditions.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1">추가 확신 조건:</div>
              <div className="space-y-1.5">
                {recommendation.conditions.map((cond, i) => (
                  <ConditionCard key={i} condition={cond} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 진입 금지 - 대기 조건만 */}
      {recommendation.status === 'forbidden' && recommendation.conditions.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-gray-500 mb-1">대기 조건:</div>
          <div className="space-y-1.5">
            {recommendation.conditions.map((cond, i) => (
              <ConditionCard key={i} condition={cond} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* 근거 (점수 제외) */}
      {filteredReasoning.length > 0 && (
        <div className="mt-auto pt-2 border-t border-white/5">
          <div className="space-y-0">
            {filteredReasoning.map((r, i) => (
              <div key={i} className="text-[10px] text-gray-500 leading-tight">
                • {r}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
