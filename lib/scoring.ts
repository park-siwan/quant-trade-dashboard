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

// 6개 카테고리 신호 점수
export interface SignalScore {
  total: number;
  maxTotal: number;
  confidence: 'highest' | 'high' | 'medium' | 'low' | 'skip';
  // 6개 카테고리
  trendAlignment: ScoreCategory;   // 추세
  divergence: ScoreCategory;        // 다이버전스
  momentum: ScoreCategory;          // 모멘텀
  volume: ScoreCategory;            // 거래량 (CVD)
  levels: ScoreCategory;            // 지지/저항
  sentiment: ScoreCategory;         // 시장심리 (펀딩+OI)
  external: ScoreCategory;          // 레거시 호환용 (sentiment alias)
  recommendation: {
    action: 'long' | 'short' | 'wait';
    leverage: string;
    seedRatio: string;
  };
  // 레거시 호환 (deprecated)
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
    details.push('1D 추세 일치');
  } else if (d1?.trend === oppositeDirection) {
    score -= 4;
    details.push('1D 역추세');
  }

  if (h4?.trend === direction) {
    score += 5;
    details.push('4H 추세 일치');
  } else if (h4?.trend === oppositeDirection) {
    score -= 3;
    details.push('4H 역추세');
  }

  // 1h는 중간 확인용
  if (h1?.trend === direction) {
    score += 2;
  } else if (h1?.trend === oppositeDirection) {
    score -= 1;
  }

  // 저TF(5m, 15m)는 추세 점수에서 제외 (타이밍 점수에서 사용)

  if (details.length === 0) {
    details.push('추세 중립');
  }

  return {
    score: Math.max(2, Math.min(20, score)),
    maxScore: 20,
    details,
  };
};

// 2. 다이버전스 점수 (20점 만점) - 기본 6점
export const calculateDivergenceScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 6; // 기본 점수 (다이버전스 없어도 중립)
  const divergenceTypes: string[] = [];

  mtfData.timeframes.forEach(tf => {
    if (tf.divergence && tf.divergence.direction === direction) {
      const multiplier = getFreshnessMultiplier(tf.divergence.candlesAgo, tf.divergence.isExpired);

      if (multiplier > 0) {
        let typeScore = 0;
        switch (tf.divergence.type) {
          case 'rsi':
          case 'cvd':
            typeScore = 4;
            break;
          case 'obv':
          case 'oi':
            typeScore = 3;
            break;
        }

        score += typeScore * multiplier;
        divergenceTypes.push(`${tf.timeframe} ${tf.divergence.type.toUpperCase()}`);
      }
    }
  });

  // 역방향 다이버전스 체크
  const oppositeDirection = direction === 'bullish' ? 'bearish' : 'bullish';
  const oppositeDivergences = mtfData.timeframes.filter(
    tf => tf.divergence && tf.divergence.direction === oppositeDirection && !tf.divergence.isExpired
  ).length;
  if (oppositeDivergences > 0) {
    score -= oppositeDivergences * 2;
  }

  if (divergenceTypes.length === 0) {
    details.push('다이버전스 대기');
  } else {
    details.push(`${divergenceTypes.length}개: ${divergenceTypes.slice(0, 2).join(', ')}`);
  }

  if (divergenceTypes.length >= 2) {
    score += 2;
    details.push('컨플루언스');
  }

  return {
    score: Math.max(2, Math.min(20, Math.round(score))),
    maxScore: 20,
    details,
  };
};

// 3. 모멘텀/RSI 점수 (15점 만점) - 과열 페널티 강화
// 핵심: 이미 급등/급락한 상태에서 추격 진입 방지
export const calculateMomentumScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 5; // 기본 점수

  const tf5m = mtfData.timeframes.find(tf => tf.timeframe === '5m');
  const tf15m = mtfData.timeframes.find(tf => tf.timeframe === '15m');
  const tf1h = mtfData.timeframes.find(tf => tf.timeframe === '1h');

  // 고TF 추세 확인 (눌림목/반등 판단용)
  const h4 = mtfData.timeframes.find(tf => tf.timeframe === '4h');
  const d1 = mtfData.timeframes.find(tf => tf.timeframe === '1d');
  const higherTrend = d1?.trend || h4?.trend || 'neutral';

  if (direction === 'bullish') {
    // 롱 진입 시
    if (tf5m?.rsi) {
      if (tf5m.rsi >= RSI.LONG.OVERHEATED) {
        score -= 5;
        details.push(`RSI 과열 (${tf5m.rsi.toFixed(0)}) 추격금지`);
      } else if (tf5m.rsi >= RSI.LONG.HIGH) {
        score -= 3;
        details.push(`RSI 고점대 (${tf5m.rsi.toFixed(0)})`);
      } else if (tf5m.rsi <= RSI.LONG.PULLBACK && higherTrend === 'bullish') {
        score += 5;
        details.push(`눌림목 진입 (RSI ${tf5m.rsi.toFixed(0)})`);
      } else if (tf5m.rsi <= RSI.LONG.CORRECTION && tf5m.rsi > RSI.LONG.PULLBACK && higherTrend === 'bullish') {
        score += 3;
        details.push(`조정 구간 (RSI ${tf5m.rsi.toFixed(0)})`);
      } else if (tf5m.rsi <= RSI.OVERSOLD) {
        score += 2;
        details.push(`과매도 반등 (${tf5m.rsi.toFixed(0)})`);
      }
    }
  } else {
    // 숏 진입 시
    if (tf5m?.rsi) {
      if (tf5m.rsi <= RSI.SHORT.EXHAUSTED) {
        score -= 5;
        details.push(`RSI 침체 (${tf5m.rsi.toFixed(0)}) 추격금지`);
      } else if (tf5m.rsi <= RSI.SHORT.LOW) {
        score -= 3;
        details.push(`RSI 저점대 (${tf5m.rsi.toFixed(0)})`);
      } else if (tf5m.rsi >= RSI.SHORT.BOUNCE && higherTrend === 'bearish') {
        score += 5;
        details.push(`반등 진입 (RSI ${tf5m.rsi.toFixed(0)})`);
      } else if (tf5m.rsi >= RSI.SHORT.RETRACEMENT && tf5m.rsi < RSI.SHORT.BOUNCE && higherTrend === 'bearish') {
        score += 3;
        details.push(`되돌림 구간 (RSI ${tf5m.rsi.toFixed(0)})`);
      } else if (tf5m.rsi >= RSI.OVERBOUGHT) {
        score += 2;
        details.push(`과매수 하락 (${tf5m.rsi.toFixed(0)})`);
      }
    }
  }

  // ADX: 추세 강도 (너무 강하면 추격 위험)
  const avgAdx = mtfData.timeframes
    .map(tf => tf.adx)
    .filter((a): a is number => a !== null)
    .reduce((sum, a, _, arr) => sum + a / arr.length, 0);

  if (avgAdx > ADX.VERY_STRONG) {
    score -= 1;
    details.push(`ADX 과열 (${avgAdx.toFixed(0)})`);
  } else if (avgAdx >= ADX.OPTIMAL_MIN && avgAdx <= ADX.OPTIMAL_MAX) {
    score += 2;
    details.push(`ADX 적정 (${avgAdx.toFixed(0)})`);
  }

  return {
    score: Math.max(2, Math.min(15, score)),
    maxScore: 15,
    details: details.length > 0 ? details : ['모멘텀 중립'],
  };
};

// 4. 거래량 점수 (15점 만점) - CVD + 변동성 축소 감지
// 핵심: 거래량 축소 후 확대 시작점이 좋은 진입
export const calculateVolumeScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 5; // 기본 점수

  // CVD 방향 확인 (고TF 중심)
  const h4 = mtfData.timeframes.find(tf => tf.timeframe === '4h');
  const h1 = mtfData.timeframes.find(tf => tf.timeframe === '1h');
  const m15 = mtfData.timeframes.find(tf => tf.timeframe === '15m');
  const m5 = mtfData.timeframes.find(tf => tf.timeframe === '5m');

  // 고TF CVD가 핵심 (4h)
  if (h4?.cvdDirection === direction) {
    score += 4;
    details.push('4H CVD 일치');
  } else if (h4?.cvdDirection && h4.cvdDirection !== direction && h4.cvdDirection !== 'neutral') {
    score -= 2;
    details.push('4H CVD 역행');
  }

  // 1h CVD
  if (h1?.cvdDirection === direction) {
    score += 2;
  } else if (h1?.cvdDirection && h1.cvdDirection !== direction && h1.cvdDirection !== 'neutral') {
    score -= 1;
  }

  // ATR 축소 감지 (변동성 축소 = 폭발 전 신호)
  const atrRatios = mtfData.timeframes
    .map(tf => tf.atrRatio)
    .filter((r): r is number => r !== null);

  if (atrRatios.length > 0) {
    const avgATR = atrRatios.reduce((sum, r) => sum + r, 0) / atrRatios.length;

    if (avgATR < 0.7) {
      // 변동성 축소 = 조정 구간 = 좋은 진입 준비
      score += 3;
      details.push(`변동성 축소 (${avgATR.toFixed(1)}x)`);
    } else if (avgATR < 0.9) {
      score += 1;
      details.push(`변동성 낮음`);
    } else if (avgATR > 1.8) {
      // 변동성 과다 = 급등/급락 후 = 추격 위험
      score -= 2;
      details.push(`변동성 과다 (${avgATR.toFixed(1)}x)`);
    }
  }

  if (details.length === 0) {
    details.push('거래량 중립');
  }

  return {
    score: Math.max(2, Math.min(15, score)),
    maxScore: 15,
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
    return { score: 5, maxScore: 15, details: ['레벨 확인 중'] };
  }

  let hasNearLevel = false;

  // 오더블록
  if (marketData.orderBlocks && marketData.orderBlocks.length > 0) {
    const obCheck = checkNearOrderBlock(marketData.currentPrice, marketData.orderBlocks, direction);
    if (obCheck.isNear) {
      hasNearLevel = true;
      if (
        (direction === 'bullish' && obCheck.type === 'support') ||
        (direction === 'bearish' && obCheck.type === 'resistance')
      ) {
        score += 4;
        details.push(`오더블록 ${obCheck.type === 'support' ? '지지' : '저항'}`);
      } else {
        score -= 1;
        details.push('역방향 오더블록');
      }
    }
  }

  // POC
  if (marketData.poc) {
    if (isNearLevel(marketData.currentPrice, marketData.poc, 0.5)) {
      hasNearLevel = true;
      score += 3;
      details.push('POC 근처');
    } else if (isNearLevel(marketData.currentPrice, marketData.poc, 1.0)) {
      score += 1;
    }
  }

  // VAL/VAH
  if (direction === 'bullish' && marketData.val) {
    if (isNearLevel(marketData.currentPrice, marketData.val, 1.0)) {
      hasNearLevel = true;
      score += 3;
      details.push('VAL 지지');
    }
  }
  if (direction === 'bearish' && marketData.vah) {
    if (isNearLevel(marketData.currentPrice, marketData.vah, 1.0)) {
      hasNearLevel = true;
      score += 3;
      details.push('VAH 저항');
    }
  }

  // 역방향 레벨 페널티 (약하게)
  if (direction === 'bullish' && marketData.vah) {
    if (isNearLevel(marketData.currentPrice, marketData.vah, 1.0)) {
      score -= 1;
    }
  }
  if (direction === 'bearish' && marketData.val) {
    if (isNearLevel(marketData.currentPrice, marketData.val, 1.0)) {
      score -= 1;
    }
  }

  if (!hasNearLevel && details.length === 0) {
    details.push('주요 레벨 없음');
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
    if (direction === 'bullish') {
      if (fearGreedIndex <= 25) {
        score += 3;
        details.push(`극단적 공포 (${fearGreedIndex})`);
      } else if (fearGreedIndex <= 40) {
        score += 2;
        details.push(`공포 (${fearGreedIndex})`);
      } else if (fearGreedIndex >= 75) {
        score -= 2;
        details.push(`탐욕 주의`);
      }
    } else {
      if (fearGreedIndex >= 75) {
        score += 3;
        details.push(`극단적 탐욕 (${fearGreedIndex})`);
      } else if (fearGreedIndex >= 60) {
        score += 2;
        details.push(`탐욕 (${fearGreedIndex})`);
      } else if (fearGreedIndex <= 25) {
        score -= 2;
        details.push(`공포 주의`);
      }
    }
  }

  // 펀딩레이트
  if (fundingRate !== undefined) {
    const absRate = Math.abs(fundingRate);
    if (direction === 'bullish' && fundingRate < 0) {
      score += absRate > 0.005 ? 3 : 1;
      details.push(`음수 펀딩`);
    } else if (direction === 'bearish' && fundingRate > 0) {
      score += absRate > 0.005 ? 3 : 1;
      details.push(`양수 펀딩`);
    } else if (
      (direction === 'bullish' && fundingRate > 0.01) ||
      (direction === 'bearish' && fundingRate < -0.01)
    ) {
      score -= 1;
    }
  }

  // OI 방향 확인
  const h4 = mtfData.timeframes.find(tf => tf.timeframe === '4h');
  const h1 = mtfData.timeframes.find(tf => tf.timeframe === '1h');

  let oiAligned = 0;

  if (h4?.oiDirection === direction) {
    oiAligned++;
    score += 1;
  }

  if (h1?.oiDirection === direction) {
    oiAligned++;
    score += 1;
  }

  if (oiAligned >= 2) {
    details.push('OI 일치');
  }

  if (details.length === 0) {
    details.push('심리 중립');
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

// 전체 스코어 계산 (6개 카테고리)
export const calculateSignalScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  fundingRate?: number,
  marketData?: MarketStructureData,
  fearGreedIndex?: number
): SignalScore => {
  // 6개 카테고리 계산
  const trendAlignment = calculateTrendAlignmentScore(mtfData, direction);
  const divergence = calculateDivergenceScore(mtfData, direction);
  const momentum = calculateMomentumScore(mtfData, direction);
  const volume = calculateVolumeScore(mtfData, direction);
  const levels = calculateLevelsScore(mtfData, direction, marketData);
  const sentiment = calculateSentimentScore(mtfData, direction, fundingRate, fearGreedIndex);

  const total = trendAlignment.score + divergence.score + momentum.score +
                volume.score + levels.score + sentiment.score;
  const maxTotal = 100;

  // 레거시 호환을 위한 매핑
  const mtfAlignment = trendAlignment;
  const marketStructure = {
    score: momentum.score + levels.score,
    maxScore: 30,
    details: [...momentum.details, ...levels.details],
  };
  const externalFactors = {
    score: volume.score + sentiment.score,
    maxScore: 30,
    details: [...volume.details, ...sentiment.details],
  };

  return {
    total,
    maxTotal,
    confidence: getConfidence(total),
    // 6개 카테고리
    trendAlignment,
    divergence,
    momentum,
    volume,
    levels,
    sentiment,
    external: sentiment, // 레거시 호환
    // 레거시 호환
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
