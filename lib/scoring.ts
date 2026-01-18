import { MTFOverviewData, MTFTimeframeData, MTFStatus, OrderBlock } from './types';
import { RSI, ADX } from './thresholds';

// 추가 시장 데이터 (오더블록, 볼륨프로파일 등)
export interface MarketStructureData {
  currentPrice: number;
  orderBlocks?: OrderBlock[];
  poc?: number;  // Point of Control
  vah?: number;  // Value Area High
  val?: number;  // Value Area Low
}

// 스코어 카테고리
export interface ScoreCategory {
  score: number;
  maxScore: number;
  details: string[];
}

// 5개 카테고리 신호 점수 (역추세 중심)
export interface SignalScore {
  total: number;
  maxTotal: number;
  confidence: 'highest' | 'high' | 'medium' | 'low' | 'skip';
  // 5개 카테고리 (추세 점수 제거, 역추세 중심)
  divergence: ScoreCategory;        // 다이버전스 (25점)
  momentum: ScoreCategory;          // 모멘텀 + ADX필터 (25점)
  volume: ScoreCategory;            // 거래량 (CVD) (20점)
  levels: ScoreCategory;            // 지지/저항 (15점)
  sentiment: ScoreCategory;         // 시장심리 (펀딩+OI) (15점)
  external: ScoreCategory;          // 레거시 호환용 (sentiment alias)
  recommendation: {
    action: 'long' | 'short' | 'wait';
    leverage: string;
    seedRatio: string;
  };
  // 레거시 호환 (deprecated)
  trendAlignment: ScoreCategory;    // 제거됨, 빈 값 반환
  mtfAlignment: ScoreCategory;
  marketStructure: ScoreCategory;
  externalFactors: ScoreCategory;
}

// 신선도 계수 (캔들 수 기준)
const getFreshnessMultiplier = (candlesAgo: number, isExpired: boolean): number => {
  if (isExpired) return 0;
  if (candlesAgo <= 10) return 1.0;
  if (candlesAgo <= 30) return 0.7;
  return 0.3;
};

// 가격이 레벨 근처인지 체크 (threshold: 기본 0.5%)
const isNearLevel = (currentPrice: number, level: number, thresholdPercent: number = 0.5): boolean => {
  const diff = Math.abs(currentPrice - level) / currentPrice * 100;
  return diff <= thresholdPercent;
};

// 가격이 오더블록 근처인지 체크
const checkNearOrderBlock = (
  currentPrice: number,
  orderBlocks: OrderBlock[] | undefined,
  direction: 'bullish' | 'bearish'
): { isNear: boolean; type: 'support' | 'resistance' | null } => {
  if (!orderBlocks || orderBlocks.length === 0) {
    return { isNear: false, type: null };
  }

  for (const ob of orderBlocks) {
    const inRange = currentPrice >= ob.low && currentPrice <= ob.high;
    const nearRange = isNearLevel(currentPrice, ob.low, 1.0) || isNearLevel(currentPrice, ob.high, 1.0);

    if (inRange || nearRange) {
      if (ob.type === 'bullish') {
        return { isNear: true, type: 'support' };
      } else {
        return { isNear: true, type: 'resistance' };
      }
    }
  }

  return { isNear: false, type: null };
};

// 1. 추세 정렬 점수 (20점 만점) - 고TF 중심
// 핵심: 4h, 1d 추세가 방향과 일치하는지 확인 (저TF는 타이밍용)
export const calculateTrendAlignmentScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 6; // 기본 점수

  const timeframes = mtfData.timeframes;
  const h4 = timeframes.find(tf => tf.timeframe === '4h');
  const d1 = timeframes.find(tf => tf.timeframe === '1d');
  const h1 = timeframes.find(tf => tf.timeframe === '1h');
  const oppositeDirection = direction === 'bullish' ? 'bearish' : 'bullish';

  // 고TF(4h, 1d) 추세가 핵심 - 여기서 방향 결정
  if (d1?.trend === direction) {
    score += 6;
    details.push(`1D 추세 일치 +6`);
  } else if (d1?.trend === oppositeDirection) {
    score -= 4;
    details.push(`1D 역추세 -4`);
  } else {
    details.push(`1D 중립 ±0`);
  }

  if (h4?.trend === direction) {
    score += 5;
    details.push(`4H 추세 일치 +5`);
  } else if (h4?.trend === oppositeDirection) {
    score -= 3;
    details.push(`4H 역추세 -3`);
  } else {
    details.push(`4H 중립 ±0`);
  }

  // 1h는 중간 확인용
  if (h1?.trend === direction) {
    score += 2;
    details.push(`1H 일치 +2`);
  } else if (h1?.trend === oppositeDirection) {
    score -= 1;
    details.push(`1H 역추세 -1`);
  } else {
    details.push(`1H 중립 ±0`);
  }

  // 저TF(5m, 15m)는 추세 점수에서 제외 (타이밍 점수에서 사용)

  return {
    score: Math.max(2, Math.min(20, score)),
    maxScore: 20,
    details,
  };
};

// 1. 다이버전스 점수 (25점 만점) - 역추세 핵심 지표
export const calculateDivergenceScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 5; // 기본 점수

  mtfData.timeframes.forEach(tf => {
    if (tf.divergence && tf.divergence.direction === direction) {
      const multiplier = getFreshnessMultiplier(tf.divergence.candlesAgo, tf.divergence.isExpired);

      if (multiplier > 0) {
        let typeScore = 0;
        switch (tf.divergence.type) {
          case 'rsi':
          case 'cvd':
            typeScore = 5;
            break;
          case 'obv':
          case 'oi':
            typeScore = 4;
            break;
        }

        const addedScore = typeScore * multiplier;
        score += addedScore;
        details.push(`${tf.timeframe} ${tf.divergence.type.toUpperCase()} +${addedScore.toFixed(1)} (신선도${multiplier})`);
      }
    }
  });

  // 역방향 다이버전스 체크
  const oppositeDirection = direction === 'bullish' ? 'bearish' : 'bullish';
  const oppositeDivergences = mtfData.timeframes.filter(
    tf => tf.divergence && tf.divergence.direction === oppositeDirection && !tf.divergence.isExpired
  );
  if (oppositeDivergences.length > 0) {
    const penalty = oppositeDivergences.length * 3;
    score -= penalty;
    details.push(`역방향 ${oppositeDivergences.length}개 -${penalty}`);
  }

  // 컨플루언스 보너스 (2개 이상 일치)
  const validDivergences = mtfData.timeframes.filter(
    tf => tf.divergence && tf.divergence.direction === direction && !tf.divergence.isExpired
  );
  if (validDivergences.length >= 3) {
    score += 4;
    details.push(`강한 컨플루언스 +4`);
  } else if (validDivergences.length >= 2) {
    score += 2;
    details.push(`컨플루언스 +2`);
  }

  if (validDivergences.length === 0) {
    details.push(`다이버전스 없음 ±0`);
  }

  return {
    score: Math.max(2, Math.min(25, Math.round(score))),
    maxScore: 25,
    details,
  };
};

// 2. 모멘텀/RSI + ADX필터 점수 (25점 만점)
// 역추세 매매: RSI 과매수/과매도 + ADX 낮을수록 좋음
export const calculateMomentumScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 8; // 기본 점수

  const tf5m = mtfData.timeframes.find(tf => tf.timeframe === '5m');
  const tf15m = mtfData.timeframes.find(tf => tf.timeframe === '15m');
  const tf1h = mtfData.timeframes.find(tf => tf.timeframe === '1h');

  if (tf5m?.rsi) {
    details.push(`5m RSI: ${tf5m.rsi.toFixed(0)}`);
  }

  // 역추세 매매용 RSI (과매수/과매도가 좋음)
  if (direction === 'bullish') {
    // 롱 진입: 과매도(낮은 RSI)가 좋음
    if (tf5m?.rsi) {
      if (tf5m.rsi <= RSI.OVERSOLD) {
        score += 6;
        details.push(`RSI≤${RSI.OVERSOLD} 과매도 +6`);
      } else if (tf5m.rsi <= 40) {
        score += 4;
        details.push(`RSI≤40 매도구간 +4`);
      } else if (tf5m.rsi <= 50) {
        score += 2;
        details.push(`RSI≤50 중립하단 +2`);
      } else if (tf5m.rsi >= RSI.OVERBOUGHT) {
        score -= 4;
        details.push(`RSI≥${RSI.OVERBOUGHT} 과매수(역방향) -4`);
      } else {
        details.push(`RSI 중립 ±0`);
      }
    }
  } else {
    // 숏 진입: 과매수(높은 RSI)가 좋음
    if (tf5m?.rsi) {
      if (tf5m.rsi >= RSI.OVERBOUGHT) {
        score += 6;
        details.push(`RSI≥${RSI.OVERBOUGHT} 과매수 +6`);
      } else if (tf5m.rsi >= 60) {
        score += 4;
        details.push(`RSI≥60 매수구간 +4`);
      } else if (tf5m.rsi >= 50) {
        score += 2;
        details.push(`RSI≥50 중립상단 +2`);
      } else if (tf5m.rsi <= RSI.OVERSOLD) {
        score -= 4;
        details.push(`RSI≤${RSI.OVERSOLD} 과매도(역방향) -4`);
      } else {
        details.push(`RSI 중립 ±0`);
      }
    }
  }

  // ADX 필터: 낮을수록 역추세에 유리 (강한 추세에서 역추세 위험)
  const adxValues = mtfData.timeframes
    .map(tf => tf.adx)
    .filter((a): a is number => a !== null);
  const avgAdx = adxValues.length > 0
    ? adxValues.reduce((sum, a) => sum + a, 0) / adxValues.length
    : 0;

  if (avgAdx > 0) {
    details.push(`평균 ADX: ${avgAdx.toFixed(0)}`);
    if (avgAdx >= ADX.VERY_STRONG) {
      // 강한 추세 = 역추세 매매 위험
      score -= 6;
      details.push(`ADX≥${ADX.VERY_STRONG} 강추세(역추세위험) -6`);
    } else if (avgAdx >= ADX.STRONG) {
      score -= 3;
      details.push(`ADX≥${ADX.STRONG} 추세중(주의) -3`);
    } else if (avgAdx < ADX.WEAK) {
      // 약한 추세/횡보 = 역추세 매매 유리
      score += 4;
      details.push(`ADX<${ADX.WEAK} 횡보(역추세유리) +4`);
    } else {
      details.push(`ADX 중립 ±0`);
    }
  }

  return {
    score: Math.max(2, Math.min(25, score)),
    maxScore: 25,
    details,
  };
};

// 3. 거래량 점수 (20점 만점) - CVD + 변동성 축소 감지
export const calculateVolumeScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 6; // 기본 점수

  // CVD 방향 확인 (고TF 중심)
  const h4 = mtfData.timeframes.find(tf => tf.timeframe === '4h');
  const h1 = mtfData.timeframes.find(tf => tf.timeframe === '1h');

  // 고TF CVD가 핵심 (4h)
  if (h4?.cvdDirection) {
    details.push(`4H CVD: ${h4.cvdDirection}`);
  }
  if (h4?.cvdDirection === direction) {
    score += 5;
    details.push(`4H CVD 일치 +5`);
  } else if (h4?.cvdDirection && h4.cvdDirection !== direction && h4.cvdDirection !== 'neutral') {
    score -= 2;
    details.push(`4H CVD 역행 -2`);
  } else {
    details.push(`4H CVD 중립 ±0`);
  }

  // 1h CVD
  if (h1?.cvdDirection) {
    details.push(`1H CVD: ${h1.cvdDirection}`);
  }
  if (h1?.cvdDirection === direction) {
    score += 3;
    details.push(`1H CVD 일치 +3`);
  } else if (h1?.cvdDirection && h1.cvdDirection !== direction && h1.cvdDirection !== 'neutral') {
    score -= 1;
    details.push(`1H CVD 역행 -1`);
  } else {
    details.push(`1H CVD 중립 ±0`);
  }

  // ATR 축소 감지 (변동성 축소 = 폭발 전 신호)
  const atrRatios = mtfData.timeframes
    .map(tf => tf.atrRatio)
    .filter((r): r is number => r !== null);

  if (atrRatios.length > 0) {
    const avgATR = atrRatios.reduce((sum, r) => sum + r, 0) / atrRatios.length;
    details.push(`평균 ATR: ${avgATR.toFixed(2)}x`);

    if (avgATR < 0.7) {
      score += 3;
      details.push(`ATR<0.7 축소 +3`);
    } else if (avgATR < 0.9) {
      score += 1;
      details.push(`ATR<0.9 낮음 +1`);
    } else if (avgATR > 1.8) {
      score -= 2;
      details.push(`ATR>1.8 과다 -2`);
    } else {
      details.push(`ATR 중립 ±0`);
    }
  }

  return {
    score: Math.max(2, Math.min(20, score)),
    maxScore: 20,
    details,
  };
};

// 5. 지지/저항 점수 (15점 만점) - 기본 5점
export const calculateLevelsScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  marketData?: MarketStructureData
): ScoreCategory => {
  const details: string[] = [];
  let score = 5; // 기본 점수

  if (!marketData?.currentPrice) {
    details.push(`가격 정보 없음`);
    return { score: 5, maxScore: 15, details };
  }

  details.push(`현재가: $${marketData.currentPrice.toFixed(0)}`);

  // 오더블록
  if (marketData.orderBlocks && marketData.orderBlocks.length > 0) {
    details.push(`오더블록 ${marketData.orderBlocks.length}개`);
    const obCheck = checkNearOrderBlock(marketData.currentPrice, marketData.orderBlocks, direction);
    if (obCheck.isNear) {
      if (
        (direction === 'bullish' && obCheck.type === 'support') ||
        (direction === 'bearish' && obCheck.type === 'resistance')
      ) {
        score += 4;
        details.push(`오더블록 ${obCheck.type === 'support' ? '지지' : '저항'} +4`);
      } else {
        score -= 1;
        details.push(`역방향 오더블록 -1`);
      }
    } else {
      details.push(`오더블록 근처 아님 ±0`);
    }
  } else {
    details.push(`오더블록 없음`);
  }

  // POC
  if (marketData.poc) {
    const pocDist = Math.abs(marketData.currentPrice - marketData.poc) / marketData.currentPrice * 100;
    details.push(`POC: $${marketData.poc.toFixed(0)} (${pocDist.toFixed(1)}%)`);
    if (isNearLevel(marketData.currentPrice, marketData.poc, 0.5)) {
      score += 3;
      details.push(`POC ≤0.5% +3`);
    } else if (isNearLevel(marketData.currentPrice, marketData.poc, 1.0)) {
      score += 1;
      details.push(`POC ≤1% +1`);
    } else {
      details.push(`POC 멀음 ±0`);
    }
  }

  // VAL/VAH
  if (marketData.val) {
    const valDist = Math.abs(marketData.currentPrice - marketData.val) / marketData.currentPrice * 100;
    details.push(`VAL: $${marketData.val.toFixed(0)} (${valDist.toFixed(1)}%)`);
  }
  if (marketData.vah) {
    const vahDist = Math.abs(marketData.currentPrice - marketData.vah) / marketData.currentPrice * 100;
    details.push(`VAH: $${marketData.vah.toFixed(0)} (${vahDist.toFixed(1)}%)`);
  }

  if (direction === 'bullish' && marketData.val) {
    if (isNearLevel(marketData.currentPrice, marketData.val, 1.0)) {
      score += 3;
      details.push(`VAL 지지 근처 +3`);
    }
  }
  if (direction === 'bearish' && marketData.vah) {
    if (isNearLevel(marketData.currentPrice, marketData.vah, 1.0)) {
      score += 3;
      details.push(`VAH 저항 근처 +3`);
    }
  }

  // 역방향 레벨 페널티 (약하게)
  if (direction === 'bullish' && marketData.vah) {
    if (isNearLevel(marketData.currentPrice, marketData.vah, 1.0)) {
      score -= 1;
      details.push(`VAH 저항(역방향) -1`);
    }
  }
  if (direction === 'bearish' && marketData.val) {
    if (isNearLevel(marketData.currentPrice, marketData.val, 1.0)) {
      score -= 1;
      details.push(`VAL 지지(역방향) -1`);
    }
  }

  return {
    score: Math.max(2, Math.min(15, score)),
    maxScore: 15,
    details,
  };
};

// 6. 시장심리 점수 (15점 만점) - 펀딩비 + OI + 공포탐욕지수 - 기본 5점
export const calculateSentimentScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  fundingRate?: number,
  fearGreedIndex?: number
): ScoreCategory => {
  const details: string[] = [];
  let score = 5; // 기본 점수

  // 공포탐욕지수 (0-100, 50 중립)
  // 롱: 공포(낮은값)일때 유리, 숏: 탐욕(높은값)일때 유리
  if (fearGreedIndex !== undefined) {
    details.push(`공포탐욕: ${fearGreedIndex}`);
    if (direction === 'bullish') {
      if (fearGreedIndex <= 25) {
        score += 3;
        details.push(`≤25 극단적공포 +3`);
      } else if (fearGreedIndex <= 40) {
        score += 2;
        details.push(`≤40 공포 +2`);
      } else if (fearGreedIndex >= 75) {
        score -= 2;
        details.push(`≥75 탐욕 -2`);
      } else {
        details.push(`공포탐욕 중립 ±0`);
      }
    } else {
      if (fearGreedIndex >= 75) {
        score += 3;
        details.push(`≥75 극단적탐욕 +3`);
      } else if (fearGreedIndex >= 60) {
        score += 2;
        details.push(`≥60 탐욕 +2`);
      } else if (fearGreedIndex <= 25) {
        score -= 2;
        details.push(`≤25 공포 -2`);
      } else {
        details.push(`공포탐욕 중립 ±0`);
      }
    }
  } else {
    details.push(`공포탐욕 없음`);
  }

  // 펀딩레이트
  if (fundingRate !== undefined) {
    const absRate = Math.abs(fundingRate);
    const ratePercent = (fundingRate * 100).toFixed(3);
    details.push(`펀딩: ${ratePercent}%`);

    if (direction === 'bullish' && fundingRate < 0) {
      const bonus = absRate > 0.005 ? 3 : 1;
      score += bonus;
      details.push(`음수펀딩(롱유리) +${bonus}`);
    } else if (direction === 'bearish' && fundingRate > 0) {
      const bonus = absRate > 0.005 ? 3 : 1;
      score += bonus;
      details.push(`양수펀딩(숏유리) +${bonus}`);
    } else if (
      (direction === 'bullish' && fundingRate > 0.01) ||
      (direction === 'bearish' && fundingRate < -0.01)
    ) {
      score -= 1;
      details.push(`역방향펀딩 -1`);
    } else {
      details.push(`펀딩 중립 ±0`);
    }
  } else {
    details.push(`펀딩 없음`);
  }

  // OI 방향 확인
  const h4 = mtfData.timeframes.find(tf => tf.timeframe === '4h');
  const h1 = mtfData.timeframes.find(tf => tf.timeframe === '1h');

  if (h4?.oiDirection) {
    details.push(`4H OI: ${h4.oiDirection}`);
  }
  if (h1?.oiDirection) {
    details.push(`1H OI: ${h1.oiDirection}`);
  }

  if (h4?.oiDirection === direction) {
    score += 1;
    details.push(`4H OI 일치 +1`);
  } else if (h4?.oiDirection && h4.oiDirection !== 'neutral') {
    details.push(`4H OI 역행 ±0`);
  }

  if (h1?.oiDirection === direction) {
    score += 1;
    details.push(`1H OI 일치 +1`);
  } else if (h1?.oiDirection && h1.oiDirection !== 'neutral') {
    details.push(`1H OI 역행 ±0`);
  }

  return {
    score: Math.max(2, Math.min(15, score)),
    maxScore: 15,
    details,
  };
};

// 레거시 호환용 alias
export const calculateExternalScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  fundingRate?: number
) => calculateSentimentScore(mtfData, direction, fundingRate);

// 신뢰도 계산
const getConfidence = (score: number): SignalScore['confidence'] => {
  if (score >= 80) return 'highest';
  if (score >= 65) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 35) return 'low';
  return 'skip';
};

// 추천 계산
const getRecommendation = (
  score: number,
  direction: 'bullish' | 'bearish'
): SignalScore['recommendation'] => {
  if (score < 35) {
    return { action: 'wait', leverage: '-', seedRatio: '-' };
  }

  const action = direction === 'bullish' ? 'long' : 'short';

  if (score >= 80) {
    return { action, leverage: '10x~15x', seedRatio: '30~40%' };
  }
  if (score >= 65) {
    return { action, leverage: '7x~10x', seedRatio: '20~30%' };
  }
  if (score >= 50) {
    return { action, leverage: '3x~5x', seedRatio: '10~20%' };
  }
  return { action, leverage: '2x~3x', seedRatio: '5~10%' };
};

// 전체 스코어 계산 (5개 카테고리 - 역추세 중심)
export const calculateSignalScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  fundingRate?: number,
  marketData?: MarketStructureData,
  fearGreedIndex?: number
): SignalScore => {
  // 5개 카테고리 계산 (추세 점수 제거)
  const divergence = calculateDivergenceScore(mtfData, direction);
  const momentum = calculateMomentumScore(mtfData, direction);
  const volume = calculateVolumeScore(mtfData, direction);
  const levels = calculateLevelsScore(mtfData, direction, marketData);
  const sentiment = calculateSentimentScore(mtfData, direction, fundingRate, fearGreedIndex);

  // 총점: 25 + 25 + 20 + 15 + 15 = 100
  const total = divergence.score + momentum.score + volume.score + levels.score + sentiment.score;
  const maxTotal = 100;

  // 레거시 호환용 빈 trendAlignment
  const trendAlignment: ScoreCategory = {
    score: 0,
    maxScore: 0,
    details: ['추세 점수 제거됨 (역추세 매매 전용)'],
  };

  // 레거시 호환을 위한 매핑
  const mtfAlignment = trendAlignment;
  const marketStructure = {
    score: momentum.score + levels.score,
    maxScore: 40,
    details: [...momentum.details, ...levels.details],
  };
  const externalFactors = {
    score: volume.score + sentiment.score,
    maxScore: 35,
    details: [...volume.details, ...sentiment.details],
  };

  return {
    total,
    maxTotal,
    confidence: getConfidence(total),
    // 5개 카테고리
    divergence,
    momentum,
    volume,
    levels,
    sentiment,
    external: sentiment, // 레거시 호환
    // 레거시 호환
    trendAlignment,
    mtfAlignment,
    marketStructure,
    externalFactors,
    recommendation: getRecommendation(total, direction),
  };
};

// 신뢰도 라벨
export const confidenceLabels: Record<SignalScore['confidence'], { label: string; color: string }> = {
  highest: { label: '최고', color: 'text-green-400' },
  high: { label: '높음', color: 'text-lime-400' },
  medium: { label: '보통', color: 'text-yellow-400' },
  low: { label: '낮음', color: 'text-orange-400' },
  skip: { label: '진입 금지', color: 'text-red-400' },
};
