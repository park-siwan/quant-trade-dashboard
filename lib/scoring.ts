import { MTFOverviewData, MTFTimeframeData, MTFStatus, OrderBlock } from './types';

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

export interface SignalScore {
  total: number;
  maxTotal: number;
  confidence: 'highest' | 'high' | 'medium' | 'low' | 'skip';
  mtfAlignment: ScoreCategory;
  divergence: ScoreCategory;
  marketStructure: ScoreCategory;
  externalFactors: ScoreCategory;
  recommendation: {
    action: 'long' | 'short' | 'wait';
    leverage: string;
    seedRatio: string;
  };
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
    // 오더블록 범위 내에 있는지 체크 (또는 1% 이내)
    const inRange = currentPrice >= ob.low && currentPrice <= ob.high;
    const nearRange = isNearLevel(currentPrice, ob.low, 1.0) || isNearLevel(currentPrice, ob.high, 1.0);

    if (inRange || nearRange) {
      // 불리시 오더블록 = 지지 (롱 유리), 베어리시 오더블록 = 저항 (숏 유리)
      if (ob.type === 'bullish') {
        return { isNear: true, type: 'support' };
      } else {
        return { isNear: true, type: 'resistance' };
      }
    }
  }

  return { isNear: false, type: null };
};

// MTF 정렬 점수 계산 (30점 만점)
export const calculateMTFAlignmentScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 0;

  const timeframes = mtfData.timeframes;
  const alignedCount = timeframes.filter(tf => tf.trend === direction).length;
  const totalCount = timeframes.length;

  // 기본 점수 (더 세분화된 스케일)
  if (alignedCount === 6) {
    score = 30;
    details.push(`${alignedCount}/${totalCount} TF 일치 (완벽)`);
  } else if (alignedCount === 5) {
    score = 25;
    details.push(`${alignedCount}/${totalCount} TF 일치`);
  } else if (alignedCount === 4) {
    score = 20;
    details.push(`${alignedCount}/${totalCount} TF 일치`);
  } else if (alignedCount === 3) {
    score = 15;
    details.push(`${alignedCount}/${totalCount} TF 일치`);
  } else if (alignedCount === 2) {
    score = 10;
    details.push(`${alignedCount}/${totalCount} TF 일치 (약함)`);
  } else if (alignedCount === 1) {
    score = 5;
    details.push(`${alignedCount}/${totalCount} TF 일치 (매우 약함)`);
  } else {
    score = 0;
    details.push(`${alignedCount}/${totalCount} TF 일치 (진입 위험)`);
  }

  // 4h, 1d 체크
  const h4 = timeframes.find(tf => tf.timeframe === '4h');
  const d1 = timeframes.find(tf => tf.timeframe === '1d');

  // 보너스: 4h + 1d 둘 다 일치
  if (h4?.trend === direction && d1?.trend === direction) {
    score += 5;
    details.push('4h+1d 일치 보너스 +5');
  }

  // 페널티: 4h 또는 1d 역행 (완화된 페널티)
  const oppositeDirection = direction === 'bullish' ? 'bearish' : 'bullish';
  if (h4?.trend === oppositeDirection) {
    score -= 5;
    details.push('4h 역행 페널티 -5');
  }
  if (d1?.trend === oppositeDirection) {
    score -= 5;
    details.push('1d 역행 페널티 -5');
  }

  return {
    score: Math.max(0, Math.min(35, score)), // 0~35점 (보너스 포함)
    maxScore: 30,
    details,
  };
};

// 다이버전스 점수 계산 (30점 만점)
export const calculateDivergenceScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 0;
  const divergenceTypes: string[] = [];

  // 각 타임프레임에서 다이버전스 확인
  mtfData.timeframes.forEach(tf => {
    if (tf.divergence && tf.divergence.direction === direction) {
      const multiplier = getFreshnessMultiplier(tf.divergence.candlesAgo, tf.divergence.isExpired);

      if (multiplier > 0) {
        let typeScore = 0;
        switch (tf.divergence.type) {
          case 'rsi':
            typeScore = 8;
            break;
          case 'cvd':
            typeScore = 8;
            break;
          case 'obv':
            typeScore = 7;
            break;
          case 'oi':
            typeScore = 7;
            break;
        }

        const adjustedScore = typeScore * multiplier;
        score += adjustedScore;
        divergenceTypes.push(`${tf.timeframe} ${tf.divergence.type.toUpperCase()}`);

        if (multiplier < 1) {
          details.push(`${tf.timeframe} ${tf.divergence.type.toUpperCase()} (×${multiplier})`);
        }
      }
    }
  });

  if (divergenceTypes.length === 0) {
    details.push('다이버전스 없음');
  } else {
    details.unshift(`${divergenceTypes.length}개 다이버전스: ${divergenceTypes.join(', ')}`);
  }

  // 컨플루언스 보너스
  if (divergenceTypes.length >= 2) {
    score += 5;
    details.push('컨플루언스 보너스 +5');
  }

  return {
    score: Math.min(30, Math.round(score)),
    maxScore: 30,
    details,
  };
};

// 시장 구조 점수 계산 (20점 만점) - 오더블록/POC/VAL/VAH 포함
export const calculateMarketStructureScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  marketData?: MarketStructureData
): ScoreCategory => {
  const details: string[] = [];
  let score = 0;

  // 1. 오더블록 근처 체크 (+8점)
  if (marketData?.currentPrice && marketData.orderBlocks) {
    const obCheck = checkNearOrderBlock(marketData.currentPrice, marketData.orderBlocks, direction);
    if (obCheck.isNear) {
      if (
        (direction === 'bullish' && obCheck.type === 'support') ||
        (direction === 'bearish' && obCheck.type === 'resistance')
      ) {
        score += 8;
        details.push(`오더블록 ${obCheck.type === 'support' ? '지지' : '저항'} 근처 +8`);
      } else {
        // 역방향 오더블록 근처 = 약간의 가산
        score += 2;
        details.push(`역방향 오더블록 근처 +2`);
      }
    }
  }

  // 2. POC 근처 체크 (타이트: 0.5% = +5점, 접근중: 1.0% = +3점)
  if (marketData?.currentPrice && marketData.poc) {
    if (isNearLevel(marketData.currentPrice, marketData.poc, 0.5)) {
      score += 5;
      details.push('POC 근처 +5');
    } else if (isNearLevel(marketData.currentPrice, marketData.poc, 1.0)) {
      score += 3;
      details.push('POC 접근 중 +3');
    }
  }

  // 3. VAL/VAH 체크 (넓은 threshold: 1.5% = +5점, 접근중: 2.5% = +3점)
  if (marketData?.currentPrice) {
    // 롱: VAL(지지) 근처가 유리
    if (direction === 'bullish' && marketData.val) {
      if (isNearLevel(marketData.currentPrice, marketData.val, 1.5)) {
        score += 5;
        details.push('VAL(지지) 근처 +5');
      } else if (isNearLevel(marketData.currentPrice, marketData.val, 2.5)) {
        score += 3;
        details.push('VAL 접근 중 +3');
      }
    }
    // 숏: VAH(저항) 근처가 유리
    if (direction === 'bearish' && marketData.vah) {
      if (isNearLevel(marketData.currentPrice, marketData.vah, 1.5)) {
        score += 5;
        details.push('VAH(저항) 근처 +5');
      } else if (isNearLevel(marketData.currentPrice, marketData.vah, 2.5)) {
        score += 3;
        details.push('VAH 접근 중 +3');
      }
    }
    // 역방향 레벨 근처 = 페널티 (롱인데 VAH 근처, 숏인데 VAL 근처)
    if (direction === 'bullish' && marketData.vah) {
      if (isNearLevel(marketData.currentPrice, marketData.vah, 1.5)) {
        score -= 2;
        details.push('VAH(저항) 근처 -2');
      }
    }
    if (direction === 'bearish' && marketData.val) {
      if (isNearLevel(marketData.currentPrice, marketData.val, 1.5)) {
        score -= 2;
        details.push('VAL(지지) 근처 -2');
      }
    }
  }

  // 4. ADX 기반 추세 강도
  const strongTrendTFs = mtfData.timeframes.filter(tf => tf.isStrongTrend);
  const weakTrendTFs = mtfData.timeframes.filter(tf => tf.adx !== null && tf.adx < 20);

  if (strongTrendTFs.length >= 3) {
    score += 2;
    details.push(`${strongTrendTFs.length}개 TF 강한 추세 +2`);
  } else if (weakTrendTFs.length >= 4) {
    // 약한 추세 = 횡보장, 방향성 진입 불리
    score -= 1;
    details.push(`${weakTrendTFs.length}개 TF 약한 추세 -1`);
  }

  // 5. ATR 기반 변동성 체크
  const atrRatios = mtfData.timeframes
    .map(tf => tf.atrRatio)
    .filter((r): r is number => r !== null);

  if (atrRatios.length > 0) {
    const avgATR = atrRatios.reduce((sum, r) => sum + r, 0) / atrRatios.length;

    if (avgATR < 0.8) {
      // 저변동 = 브레이크아웃 대기, 진입 유리
      score += 2;
      details.push(`저변동(ATR ${avgATR.toFixed(1)}x) +2`);
    } else if (avgATR > 1.5) {
      // 고변동 = 리스크 증가, 진입 불리
      score -= 2;
      details.push(`고변동(ATR ${avgATR.toFixed(1)}x) -2`);
    }
  }

  // 6. RSI 레벨 체크 (기존 로직, 점수 유지)
  const tf5m = mtfData.timeframes.find(tf => tf.timeframe === '5m');
  if (tf5m?.rsi) {
    if (direction === 'bullish' && tf5m.rsi <= 40) {
      score += 3;
      details.push('RSI 저점 진입');
    } else if (direction === 'bearish' && tf5m.rsi >= 60) {
      score += 3;
      details.push('RSI 고점 진입');
    }
  }

  return {
    score: Math.max(0, Math.min(20, score)),
    maxScore: 20,
    details: details.length > 0 ? details : ['시장 구조 데이터 없음'],
  };
};

// 외부 요인 점수 계산 (20점 만점) - 간소화 버전
export const calculateExternalFactorsScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  fundingRate?: number
): ScoreCategory => {
  const details: string[] = [];
  let score = 0;

  // 펀딩레이트
  if (fundingRate !== undefined) {
    if (direction === 'bullish' && fundingRate < 0) {
      score += 5;
      details.push('음수 펀딩 (롱 유리)');
    } else if (direction === 'bearish' && fundingRate > 0) {
      score += 5;
      details.push('양수 펀딩 (숏 유리)');
    } else if (
      (direction === 'bullish' && fundingRate > 0.01) ||
      (direction === 'bearish' && fundingRate < -0.01)
    ) {
      score -= 3;
      details.push('펀딩 역방향 페널티');
    }
  }

  // CVD/OI 방향 일치 확인
  const h4 = mtfData.timeframes.find(tf => tf.timeframe === '4h');
  if (h4) {
    if (h4.cvdDirection === direction) {
      score += 4;
      details.push('CVD 방향 일치');
    }
    if (h4.oiDirection === direction) {
      score += 4;
      details.push('OI 방향 일치');
    }
  }

  // 전체 추세 일치
  if (mtfData.overallTrend === direction) {
    score += 5;
    details.push('전체 추세 일치');
  }

  return {
    score: Math.max(0, Math.min(20, score)),
    maxScore: 20,
    details: details.length > 0 ? details : ['외부 요인 데이터 부족'],
  };
};

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

// 전체 스코어 계산
export const calculateSignalScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish',
  fundingRate?: number,
  marketData?: MarketStructureData
): SignalScore => {
  const mtfAlignment = calculateMTFAlignmentScore(mtfData, direction);
  const divergence = calculateDivergenceScore(mtfData, direction);
  const marketStructure = calculateMarketStructureScore(mtfData, direction, marketData);
  const externalFactors = calculateExternalFactorsScore(mtfData, direction, fundingRate);

  const total = mtfAlignment.score + divergence.score + marketStructure.score + externalFactors.score;
  const maxTotal = 100;

  return {
    total,
    maxTotal,
    confidence: getConfidence(total),
    mtfAlignment,
    divergence,
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
