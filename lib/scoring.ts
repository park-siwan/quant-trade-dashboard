import { MTFOverviewData, MTFTimeframeData, MTFStatus } from './types';

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

  // 기본 점수
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

  // 페널티: 4h 또는 1d 역행
  const oppositeDirection = direction === 'bullish' ? 'bearish' : 'bullish';
  if (h4?.trend === oppositeDirection) {
    score -= 10;
    details.push('4h 역행 페널티 -10');
  }
  if (d1?.trend === oppositeDirection) {
    score -= 10;
    details.push('1d 역행 페널티 -10');
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

// 시장 구조 점수 계산 (20점 만점) - 간소화 버전
export const calculateMarketStructureScore = (
  mtfData: MTFOverviewData,
  direction: 'bullish' | 'bearish'
): ScoreCategory => {
  const details: string[] = [];
  let score = 0;

  // ADX 기반 추세 강도
  const strongTrendTFs = mtfData.timeframes.filter(tf => tf.isStrongTrend);
  if (strongTrendTFs.length >= 3) {
    score += 10;
    details.push(`${strongTrendTFs.length}개 TF 강한 추세`);
  } else if (strongTrendTFs.length >= 1) {
    score += 5;
    details.push(`${strongTrendTFs.length}개 TF 강한 추세`);
  }

  // ATR 기반 변동성 평가
  const h4 = mtfData.timeframes.find(tf => tf.timeframe === '4h');
  if (h4?.atrRatio) {
    if (h4.atrRatio >= 0.8 && h4.atrRatio <= 1.5) {
      score += 5;
      details.push('적정 변동성');
    } else if (h4.atrRatio > 1.5) {
      score += 2;
      details.push('고변동성 주의');
    } else {
      score += 3;
      details.push('저변동성');
    }
  }

  // RSI 레벨 체크
  const tf5m = mtfData.timeframes.find(tf => tf.timeframe === '5m');
  if (tf5m?.rsi) {
    if (direction === 'bullish' && tf5m.rsi <= 40) {
      score += 5;
      details.push('RSI 저점 진입');
    } else if (direction === 'bearish' && tf5m.rsi >= 60) {
      score += 5;
      details.push('RSI 고점 진입');
    }
  }

  return {
    score: Math.min(20, score),
    maxScore: 20,
    details: details.length > 0 ? details : ['구조 데이터 부족'],
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
  fundingRate?: number
): SignalScore => {
  const mtfAlignment = calculateMTFAlignmentScore(mtfData, direction);
  const divergence = calculateDivergenceScore(mtfData, direction);
  const marketStructure = calculateMarketStructureScore(mtfData, direction);
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
