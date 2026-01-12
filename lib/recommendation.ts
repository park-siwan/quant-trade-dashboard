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

// 개별 방향 추천 타입
export interface DirectionRecommendation {
  direction: 'long' | 'short';
  score: number;
  confidence: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  stopLossReason: string;
  takeProfitReason: string;
  leverage: string;
  seedRatio: string;
  riskReward: number;
}

// 추천 결과 타입
export interface Recommendation {
  status: 'entry' | 'wait' | 'forbidden';
  direction: 'long' | 'short' | null;  // 우선 추천 방향
  conditions: WaitCondition[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  stopLossReason?: string;  // 손절 근거
  takeProfitReason?: string;  // 익절 근거
  leverage?: string;
  seedRatio?: string;
  reasoning: string[];
  // 롱/숏 둘 다 표시용
  long?: DirectionRecommendation;
  short?: DirectionRecommendation;
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

// 점수 기반 TP/SL 배수 계산
function getScoreBasedMultipliers(totalScore: number): { tpMultiplier: number; slMultiplier: number; tpReason: string } {
  // 점수가 높을수록 공격적인 TP, 타이트한 SL → 좋은 손익비
  // 점수가 낮을수록 보수적인 TP, 넓은 SL → 나쁜 손익비
  if (totalScore >= 60) {
    return { tpMultiplier: 5, slMultiplier: 1.5, tpReason: '5ATR (고확신)' };
  } else if (totalScore >= 50) {
    return { tpMultiplier: 4, slMultiplier: 1.75, tpReason: '4ATR' };
  } else if (totalScore >= 40) {
    return { tpMultiplier: 3, slMultiplier: 2, tpReason: '3ATR (보수적)' };
  } else if (totalScore >= 30) {
    return { tpMultiplier: 2.5, slMultiplier: 2.5, tpReason: '2.5ATR (저확신)' };
  } else {
    return { tpMultiplier: 2, slMultiplier: 3, tpReason: '2ATR (불리)' };
  }
}

// 개별 방향 추천 계산 헬퍼
function calculateDirectionRecommendation(
  dir: 'long' | 'short',
  score: SignalScore,
  currentPrice: number,
  atr: number,
  vah?: number,
  val?: number,
): DirectionRecommendation {
  // 점수 기반 TP/SL 배수
  const { tpMultiplier, slMultiplier, tpReason } = getScoreBasedMultipliers(score.total);

  const stopLoss = dir === 'long'
    ? currentPrice - atr * slMultiplier
    : currentPrice + atr * slMultiplier;

  let takeProfit: number;
  let takeProfitReason: string;

  if (dir === 'long') {
    const defaultTP = currentPrice + atr * tpMultiplier;
    if (vah && vah > currentPrice && vah < defaultTP) {
      takeProfit = vah;
      takeProfitReason = 'VAH 저항대';
    } else {
      takeProfit = defaultTP;
      takeProfitReason = tpReason;
    }
  } else {
    const defaultTP = currentPrice - atr * tpMultiplier;
    if (val && val < currentPrice && val > defaultTP) {
      takeProfit = val;
      takeProfitReason = 'VAL 지지대';
    } else {
      takeProfit = defaultTP;
      takeProfitReason = tpReason;
    }
  }

  const riskReward = Math.abs(takeProfit - currentPrice) / Math.abs(stopLoss - currentPrice);
  const slReason = `${slMultiplier}ATR`;

  return {
    direction: dir,
    score: score.total,
    confidence: score.confidence,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    stopLossReason: slReason,
    takeProfitReason,
    leverage: score.recommendation.leverage,
    seedRatio: score.recommendation.seedRatio,
    riskReward,
  };
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

  // 롱/숏 둘 다 계산
  const longRec = calculateDirectionRecommendation('long', longScore, currentPrice, atr, vah, val);
  const shortRec = calculateDirectionRecommendation('short', shortScore, currentPrice, atr, vah, val);

  // 우선 방향 기준 값들
  const primaryRec = direction === 'long' ? longRec : shortRec;

  return {
    status: 'entry',
    direction,
    conditions: [],
    entryPrice: currentPrice,
    stopLoss: primaryRec.stopLoss,
    takeProfit: primaryRec.takeProfit,
    stopLossReason: '2ATR',
    takeProfitReason: primaryRec.takeProfitReason,
    leverage: score.recommendation.leverage,
    seedRatio: score.recommendation.seedRatio,
    long: longRec,
    short: shortRec,
    reasoning: [
      `${direction === 'long' ? '롱' : '숏'} ${score.total}점 (${score.confidence})`,
      `손절: $${primaryRec.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })} (2ATR)`,
      `익절: $${primaryRec.takeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${primaryRec.takeProfitReason})`,
      `R:R = 1:${primaryRec.riskReward.toFixed(1)}`,
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

  // 롱/숏 둘 다 계산 (점수 기반 손익비)
  const longRec = calculateDirectionRecommendation('long', longScore, currentPrice, atr, vah, val);
  const shortRec = calculateDirectionRecommendation('short', shortScore, currentPrice, atr, vah, val);

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

  const primaryRec = direction === 'long' ? longRec : shortRec;

  return {
    status: 'wait',
    direction,
    conditions,
    entryPrice: currentPrice,
    stopLoss: primaryRec.stopLoss,
    takeProfit: primaryRec.takeProfit,
    stopLossReason: '2ATR',
    takeProfitReason: '3ATR (보수적)',
    leverage: score.recommendation.leverage,
    seedRatio: score.recommendation.seedRatio,
    long: longRec,
    short: shortRec,
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

  // 롱/숏 정보 (참고용 - 진입 금지 상태에서도 점수 표시)
  // 점수 기반 손익비로 롱/숏 계산
  const atr = currentPrice * 0.01; // 기본 1%
  const longRec = calculateDirectionRecommendation('long', longScore, currentPrice, atr);
  const shortRec = calculateDirectionRecommendation('short', shortScore, currentPrice, atr);

  return {
    status: 'forbidden',
    direction: null,
    conditions,
    long: longRec,
    short: shortRec,
    reasoning,
  };
}
