'use client';

import { Recommendation, WaitCondition } from '@/lib/recommendation';
import { TrendingUp, TrendingDown, Ban, Clock, CheckCircle } from 'lucide-react';

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

// 대기 조건 카드
function ConditionCard({ condition, index }: { condition: WaitCondition; index: number }) {
  const isLong = condition.direction === 'long';

  return (
    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded ${
            isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {index + 1}. {isLong ? '롱' : '숏'}
        </span>
        {isLong ? (
          <TrendingUp className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-red-400" />
        )}
      </div>

      <div className="text-sm text-gray-300 mb-1">
        <span className="font-mono text-white">
          ${condition.triggerPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>{' '}
        {condition.triggerType === 'touch' ? '터치' : condition.triggerType === 'break' ? '돌파' : '접근'}
        {' + '}
        <span className="text-gray-400">{condition.requiredSignal}</span>
      </div>

      <div className="text-xs text-gray-500">
        예상 점수:{' '}
        <span className={condition.expectedScore >= 50 ? 'text-green-400' : 'text-yellow-400'}>
          {condition.expectedScore}점
        </span>
        {' → '}
        {condition.expectedScore >= 50 ? '소량 진입 가능' : '추가 확인 필요'}
      </div>
    </div>
  );
}

// 진입 정보 카드
function EntryInfo({ recommendation }: { recommendation: Recommendation }) {
  if (!recommendation.entryPrice) return null;

  const isLong = recommendation.direction === 'long';

  return (
    <div className="space-y-3">
      {/* 방향 표시 */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
            isLong ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}
        >
          {isLong ? (
            <TrendingUp className="w-4 h-4 text-green-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" />
          )}
          <span className={`font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
            {isLong ? '롱' : '숏'}
          </span>
        </div>
      </div>

      {/* 가격 정보 */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/5">
          <div className="text-[10px] text-gray-500 mb-1">진입가</div>
          <div className="font-mono text-white">
            ${recommendation.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2.5 border border-red-500/20">
          <div className="text-[10px] text-red-400 mb-1">손절가</div>
          <div className="font-mono text-red-300">
            ${recommendation.stopLoss?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2.5 border border-green-500/20">
          <div className="text-[10px] text-green-400 mb-1">익절목표</div>
          <div className="font-mono text-green-300">
            ${recommendation.takeProfit?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* 레버리지 & 시드 */}
      {recommendation.leverage && recommendation.leverage !== '-' && (
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-gray-500">레버리지: </span>
            <span className="text-white font-mono">{recommendation.leverage}</span>
          </div>
          <div>
            <span className="text-gray-500">시드비율: </span>
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

  return (
    <div className={`backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-xl p-4`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-400">추천 타점</h3>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${style.bg} ${style.border}`}
        >
          <StatusIcon className={`w-3.5 h-3.5 ${style.text}`} />
          <span className={`text-xs font-semibold ${style.text}`}>{style.label}</span>
        </div>
      </div>

      {/* 진입 가능한 경우 */}
      {recommendation.status === 'entry' && <EntryInfo recommendation={recommendation} />}

      {/* 조건부 대기 - 진입 정보 + 조건 */}
      {recommendation.status === 'wait' && (
        <div className="space-y-4">
          <EntryInfo recommendation={recommendation} />
          {recommendation.conditions.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2">추가 확신 조건:</div>
              <div className="space-y-2">
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
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">대기 조건:</div>
          <div className="space-y-2">
            {recommendation.conditions.map((cond, i) => (
              <ConditionCard key={i} condition={cond} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* 근거 */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="space-y-0.5">
          {recommendation.reasoning.map((r, i) => (
            <div key={i} className="text-[10px] text-gray-500">
              • {r}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
