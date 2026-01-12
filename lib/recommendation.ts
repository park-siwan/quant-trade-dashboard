import { OrderBlock } from './types';
import { SignalScore } from './scoring';

// 대기 조건 타입
export interface WaitCondition {
  direction: 'long' | 'short';
  triggerPrice: number;
  triggerType: 'touch' | 'break' | 'approach';
  requiredSignal: string;
  expectedScore: number;
}

// 추천 결과 타입
export interface Recommendation {
  status: 'entry' | 'wait' | 'forbidden';
  direction: 'long' | 'short' | null;
  conditions: WaitCondition[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: string;
  seedRatio?: string;
  reasoning: string[];
}

interface RecommendationParams {
  longScore: SignalScore;
  shortScore: SignalScore;
  currentPrice: number;
  poc?: number;
  vah?: number;
  val?: number;
  orderBlocks?: OrderBlock[];
  avgATR?: number; // 평균 ATR 값 (달러)
}

// 추천 타점 생성
export function generateRecommendation({
  longScore,
  shortScore,
  currentPrice,
  poc,
  vah,
  val,
  orderBlocks,
  avgATR,
}: RecommendationParams): Recommendation {
  const maxScore = Math.max(longScore.total, shortScore.total);

  // 1. 진입 가능 (50점 이상)
  if (maxScore >= 50) {
    return generateEntryRecommendation({
      longScore,
      shortScore,
      currentPrice,
      vah,
      val,
      avgATR,
    });
  }

  // 2. 조건부 대기 (35~49점)
  if (maxScore >= 35) {
    return generateLowConfidenceRecommendation({
      longScore,
      shortScore,
      currentPrice,
      vah,
      val,
      avgATR,
    });
  }

  // 3. 진입 금지 (35점 미만)
  return generateWaitRecommendation({
    longScore,
    shortScore,
    currentPrice,
    poc,
    vah,
    val,
    orderBlocks,
  });
}

// 진입 가능 추천 생성
function generateEntryRecommendation({
  longScore,
  shortScore,
  currentPrice,
  vah,
  val,
  avgATR,
}: {
  longScore: SignalScore;
  shortScore: SignalScore;
  currentPrice: number;
  vah?: number;
  val?: number;
  avgATR?: number;
}): Recommendation {
  const direction = longScore.total > shortScore.total ? 'long' : 'short';
  const score = direction === 'long' ? longScore : shortScore;
  const atr = avgATR || currentPrice * 0.01; // ATR 없으면 1% 기본값

  // 손절/익절 계산
  const stopLoss =
    direction === 'long' ? currentPrice - atr * 2 : currentPrice + atr * 2;

  let takeProfit: number;
  if (direction === 'long') {
    // 롱: 익절은 현재가보다 높아야 함
    const defaultTP = currentPrice + atr * 4;
    // VAH가 현재가보다 높을 때만 VAH를 고려
    takeProfit = (vah && vah > currentPrice) ? Math.min(vah, defaultTP) : defaultTP;
  } else {
    // 숏: 익절은 현재가보다 낮아야 함
    const defaultTP = currentPrice - atr * 4;
    // VAL이 현재가보다 낮을 때만 VAL을 고려
    takeProfit = (val && val < currentPrice) ? Math.max(val, defaultTP) : defaultTP;
  }

  const riskReward = Math.abs(takeProfit - currentPrice) / Math.abs(stopLoss - currentPrice);

  return {
    status: 'entry',
    direction,
    conditions: [],
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    leverage: score.recommendation.leverage,
    seedRatio: score.recommendation.seedRatio,
    reasoning: [
      `${direction === 'long' ? '롱' : '숏'} ${score.total}점 (${score.confidence})`,
      `손절: $${stopLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })} (2ATR)`,
      `익절: $${takeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      `R:R = 1:${riskReward.toFixed(1)}`,
    ],
  };
}

// 낮은 확신 추천 생성 (35~49점)
function generateLowConfidenceRecommendation({
  longScore,
  shortScore,
  currentPrice,
  vah,
  val,
  avgATR,
}: {
  longScore: SignalScore;
  shortScore: SignalScore;
  currentPrice: number;
  vah?: number;
  val?: number;
  avgATR?: number;
}): Recommendation {
  const direction = longScore.total > shortScore.total ? 'long' : 'short';
  const score = direction === 'long' ? longScore : shortScore;
  const atr = avgATR || currentPrice * 0.01;

  const conditions: WaitCondition[] = [];
  const reasoning: string[] = [
    `${direction === 'long' ? '롱' : '숏'} ${score.total}점 - 낮은 확신`,
    '소량 진입 또는 추가 신호 대기 권장',
  ];

  // 추가 확신을 위한 조건 제시
  if (direction === 'long' && val) {
    const distanceToVAL = ((currentPrice - val) / currentPrice) * 100;
    if (distanceToVAL > 0 && distanceToVAL < 5) {
      conditions.push({
        direction: 'long',
        triggerPrice: val,
        triggerType: 'approach',
        requiredSignal: '단기저점 도달시 진입 (역추세 - 상승 다이버전스 기대)',
        expectedScore: score.total + 15,
      });
      reasoning.push(`단기저점 접근 시 점수 상승 예상`);
    }
  }

  if (direction === 'short' && vah) {
    const distanceToVAH = ((vah - currentPrice) / currentPrice) * 100;
    if (distanceToVAH > 0 && distanceToVAH < 3) {
      conditions.push({
        direction: 'short',
        triggerPrice: vah,
        triggerType: 'touch',
        requiredSignal: '단기고점 도달시 진입 (역추세 - 하락 다이버전스 기대)',
        expectedScore: score.total + 15,
      });
      reasoning.push(`단기고점 터치 시 점수 상승 예상`);
    }
  }

  return {
    status: 'wait',
    direction,
    conditions,
    entryPrice: currentPrice,
    stopLoss: direction === 'long' ? currentPrice - atr * 2 : currentPrice + atr * 2,
    takeProfit: direction === 'long' ? currentPrice + atr * 3 : currentPrice - atr * 3,
    leverage: score.recommendation.leverage,
    seedRatio: score.recommendation.seedRatio,
    reasoning,
  };
}

// 진입 금지 시 대기 조건 생성
function generateWaitRecommendation({
  longScore,
  shortScore,
  currentPrice,
  poc,
  vah,
  val,
  orderBlocks,
}: {
  longScore: SignalScore;
  shortScore: SignalScore;
  currentPrice: number;
  poc?: number;
  vah?: number;
  val?: number;
  orderBlocks?: OrderBlock[];
}): Recommendation {
  const conditions: WaitCondition[] = [];
  const reasoning: string[] = [
    `롱 ${longScore.total}점 / 숏 ${shortScore.total}점`,
    '35점 미만 - 진입 금지',
  ];

  // VAH 기반 숏 조건
  if (vah) {
    const distanceToVAH = ((vah - currentPrice) / currentPrice) * 100;
    if (distanceToVAH > 0 && distanceToVAH < 5) {
      conditions.push({
        direction: 'short',
        triggerPrice: vah,
        triggerType: 'touch',
        requiredSignal: '단기고점 도달시 진입 (역추세 - 하락 다이버전스 기대)',
        expectedScore: 45 + Math.min(10, Math.round((5 - distanceToVAH) * 2)),
      });
      reasoning.push(`단기고점($${vah.toLocaleString()})까지 ${distanceToVAH.toFixed(1)}%`);
    }
  }

  // VAL 기반 롱 조건
  if (val) {
    const distanceToVAL = ((currentPrice - val) / currentPrice) * 100;
    if (distanceToVAL > 0 && distanceToVAL < 7) {
      conditions.push({
        direction: 'long',
        triggerPrice: val,
        triggerType: 'approach',
        requiredSignal: '단기저점 도달시 진입 (역추세 - 상승 다이버전스 기대)',
        expectedScore: 45 + Math.min(10, Math.round((7 - distanceToVAL) * 1.5)),
      });
      reasoning.push(`단기저점($${val.toLocaleString()})까지 ${distanceToVAL.toFixed(1)}%`);
    }
  }

  // POC 기반 조건 (중립 구간)
  if (poc) {
    const distanceToPOC = Math.abs((poc - currentPrice) / currentPrice) * 100;
    if (distanceToPOC < 1) {
      reasoning.push(`POC($${poc.toLocaleString()}) 근처 - 방향성 대기`);
    }
  }

  // 오더블록 기반 조건 (추격 매매 필터링)
  if (orderBlocks && orderBlocks.length > 0) {
    orderBlocks.forEach((ob) => {
      const obMidPrice = (ob.high + ob.low) / 2;
      const distancePercent = ((obMidPrice - currentPrice) / currentPrice) * 100;

      // 가까운 오더블록만 (5% 이내)
      if (Math.abs(distancePercent) < 5) {
        // 추격 매매 필터링:
        // - Bullish OB (지지) → 롱은 현재가 아래에서만 (obMidPrice < currentPrice)
        // - Bearish OB (저항) → 숏은 현재가 위에서만 (obMidPrice > currentPrice)
        const isBullishOB = ob.type === 'bullish';
        const isBelowPrice = obMidPrice < currentPrice * 0.995; // 0.5% 마진
        const isAbovePrice = obMidPrice > currentPrice * 1.005;

        // 롱: Bullish OB가 현재가 아래에 있어야 함 (지지에서 반등)
        // 숏: Bearish OB가 현재가 위에 있어야 함 (저항에서 하락)
        const isValidLong = isBullishOB && isBelowPrice;
        const isValidShort = !isBullishOB && isAbovePrice;

        if (!isValidLong && !isValidShort) {
          return; // 추격 매매 조건 제외
        }

        const direction = isBullishOB ? 'long' : 'short';
        const obType = isBullishOB ? '지지구간' : '저항구간';

        // 중복 방지
        const exists = conditions.some(
          (c) => c.direction === direction && Math.abs(c.triggerPrice - obMidPrice) < 100
        );

        if (!exists) {
          conditions.push({
            direction,
            triggerPrice: obMidPrice,
            triggerType: 'touch',
            requiredSignal: `${obType} 도달시 진입 (추세추종 - ${isBullishOB ? '매수세 유입 예상' : '매도세 유입 예상'})`,
            expectedScore: 50,
          });
        }
      }
    });
  }

  // 조건이 없으면 기본 메시지
  if (conditions.length === 0) {
    reasoning.push('명확한 지지/저항 레벨 대기');
  }

  return {
    status: 'forbidden',
    direction: null,
    conditions,
    reasoning,
  };
}
