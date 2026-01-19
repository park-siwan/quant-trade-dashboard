/**
 * 지지/저항 영역 병합 유틸리티
 * - 겹침 감지 및 색상 혼합 로직
 */

import { SupportResistanceZone, BlendedZone, ZoneSource, ZoneType } from '@/lib/types';
import { ZONE_COLORS } from '@/lib/colors';
import { VolumeProfileData } from '@/components/chart/chartTypes';
import { OrderBlockData } from '@/lib/types';

/**
 * 두 영역이 실제로 겹치는지 확인 (물리적 겹침만 병합)
 */
function zonesOverlapOrClose(a: SupportResistanceZone, b: SupportResistanceZone): boolean {
  // 실제로 겹치는 경우만 병합 (버퍼 없음)
  // a의 하단이 b의 상단보다 높거나, a의 상단이 b의 하단보다 낮으면 겹치지 않음
  return !(a.priceBottom > b.priceTop || a.priceTop < b.priceBottom);
}

/**
 * 겹치는 영역을 병합
 */
function mergeZonePair(a: SupportResistanceZone, b: SupportResistanceZone): BlendedZone {
  const priceTop = Math.max(a.priceTop, b.priceTop);
  const priceBottom = Math.min(a.priceBottom, b.priceBottom);
  const overlappingSources: ZoneSource[] = [a.source, b.source];

  // 같은 방향 겹침 → strength 합산 (최대 1)
  // 반대 방향 겹침 → conflict
  let blendType: 'support' | 'resistance' | 'conflict';
  let strength: number;

  if (a.type === b.type) {
    blendType = a.type as 'support' | 'resistance';
    strength = Math.min(a.strength + b.strength * 0.5, 1); // 강도 합산 (최대 1)
  } else {
    blendType = 'conflict';
    strength = (a.strength + b.strength) / 2; // 혼조 시 평균
  }

  const finalColor = getBlendedColor(blendType, strength);

  return {
    id: `${a.id}_${b.id}`,
    source: a.source, // 첫 번째 소스 유지
    type: blendType === 'conflict' ? 'neutral' : blendType,
    priceTop,
    priceBottom,
    strength,
    overlappingSources,
    blendType,
    finalColor,
  };
}

/**
 * 영역 타입과 강도에 따른 색상 반환
 */
export function getBlendedColor(type: 'support' | 'resistance' | 'conflict', strength: number): string {
  if (type === 'conflict') {
    return ZONE_COLORS.CONFLICT.fill;
  }

  const colors = type === 'support' ? ZONE_COLORS.SUPPORT : ZONE_COLORS.RESISTANCE;

  // 강도에 따라 색상 선택
  if (strength >= 0.7) {
    return colors.fillStrong;
  }
  return colors.fill;
}

/**
 * 영역 타입에 따른 테두리 색상 반환
 */
export function getZoneBorderColor(type: 'support' | 'resistance' | 'conflict'): string {
  if (type === 'conflict') {
    return ZONE_COLORS.CONFLICT.border;
  }
  return type === 'support' ? ZONE_COLORS.SUPPORT.border : ZONE_COLORS.RESISTANCE.border;
}

/**
 * VolumeProfile + OrderBlock 데이터를 SupportResistanceZone 배열로 변환
 */
export function createZonesFromData(
  volumeProfile: VolumeProfileData | null | undefined,
  orderBlockData: OrderBlockData | null | undefined,
  currentPrice: number
): SupportResistanceZone[] {
  const zones: SupportResistanceZone[] = [];

  // VAL (매수세 구간) - 현재가보다 낮으면 지지
  if (volumeProfile?.val) {
    const priceRange = currentPrice * 0.002; // 0.2% 범위
    zones.push({
      id: 'val',
      source: 'VAL',
      type: 'support',
      priceTop: volumeProfile.val + priceRange,
      priceBottom: volumeProfile.val - priceRange,
      strength: 0.6,
    });
  }

  // VAH (매도세 구간) - 현재가보다 높으면 저항
  if (volumeProfile?.vah) {
    const priceRange = currentPrice * 0.002; // 0.2% 범위
    zones.push({
      id: 'vah',
      source: 'VAH',
      type: 'resistance',
      priceTop: volumeProfile.vah + priceRange,
      priceBottom: volumeProfile.vah - priceRange,
      strength: 0.6,
    });
  }

  // POC (Point of Control) - 가장 많은 거래량이 발생한 가격대
  // 현재가보다 아래면 지지, 위면 저항
  if (volumeProfile?.poc) {
    const priceRange = currentPrice * 0.002; // 0.2% 범위 (다른 영역과 동일)
    const isSupport = volumeProfile.poc < currentPrice;
    zones.push({
      id: 'poc',
      source: 'POC',
      type: isSupport ? 'support' : 'resistance',
      priceTop: volumeProfile.poc + priceRange,
      priceBottom: volumeProfile.poc - priceRange,
      strength: 0.7,
    });
  }

  // 오더블록
  if (orderBlockData?.activeBlocks) {
    orderBlockData.activeBlocks.forEach((block, index) => {
      const midPrice = (block.high + block.low) / 2;
      const isSupport = midPrice < currentPrice;

      zones.push({
        id: `ob_${index}`,
        source: isSupport ? 'OB_SUPPORT' : 'OB_RESISTANCE',
        type: isSupport ? 'support' : 'resistance',
        priceTop: block.high,
        priceBottom: block.low,
        strength: block.strength === 'strong' ? 0.8 : block.strength === 'medium' ? 0.6 : 0.4,
      });
    });
  }

  return zones;
}

/**
 * 겹치는 영역 병합
 */
export function mergeOverlappingZones(zones: SupportResistanceZone[]): BlendedZone[] {
  if (zones.length === 0) return [];

  // 가격 기준 정렬 (상단 가격 내림차순)
  const sorted = [...zones].sort((a, b) => b.priceTop - a.priceTop);

  const result: BlendedZone[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (processed.has(i)) continue;

    let currentZone = sorted[i];
    const overlappingIndices: number[] = [i];

    // 겹치거나 가까운 영역 찾기
    for (let j = i + 1; j < sorted.length; j++) {
      if (processed.has(j)) continue;

      if (zonesOverlapOrClose(currentZone, sorted[j])) {
        overlappingIndices.push(j);
      }
    }

    // 겹침이 있으면 병합
    if (overlappingIndices.length > 1) {
      let mergedZone: BlendedZone = {
        ...currentZone,
        overlappingSources: [currentZone.source],
        blendType: currentZone.type === 'neutral' ? 'conflict' : currentZone.type as 'support' | 'resistance',
        finalColor: getBlendedColor(
          currentZone.type === 'neutral' ? 'conflict' : currentZone.type as 'support' | 'resistance',
          currentZone.strength
        ),
      };

      for (let k = 1; k < overlappingIndices.length; k++) {
        const idx = overlappingIndices[k];
        mergedZone = mergeZonePair(mergedZone, sorted[idx]);
        processed.add(idx);
      }

      result.push(mergedZone);
    } else {
      // 겹침 없음 - 단일 영역으로 BlendedZone 변환
      result.push({
        ...currentZone,
        overlappingSources: [currentZone.source],
        blendType: currentZone.type === 'neutral' ? 'conflict' : currentZone.type as 'support' | 'resistance',
        finalColor: getBlendedColor(
          currentZone.type === 'neutral' ? 'conflict' : currentZone.type as 'support' | 'resistance',
          currentZone.strength
        ),
      });
    }

    processed.add(i);
  }

  return result;
}
