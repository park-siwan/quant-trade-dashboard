'use client';

import { BlendedZone, SupportResistanceZone } from '@/lib/types';

interface RawZoneRenderData {
  zone: SupportResistanceZone;
  topY: number;
  bottomY: number;
  startX: number;
}

interface BlendedZoneRenderData {
  zone: BlendedZone;
  topY: number;
  bottomY: number;
  startX: number;
}

interface SupportResistanceZonesProps {
  rawZones: RawZoneRenderData[]; // 개별 영역 (박스 렌더링용)
  blendedZones: BlendedZoneRenderData[]; // 병합된 영역 (라벨 표시용)
  mini?: boolean;
  showLabels?: boolean;
}

/**
 * 지지/저항 영역 시각화 컴포넌트
 * - 개별 영역 박스 렌더링 (투명도 겹침 효과)
 * - 병합된 라벨 표시
 * - POC도 색상 박스로 표시 (현재가 기준 지지/저항)
 */
export default function SupportResistanceZones({
  rawZones,
  blendedZones,
  mini = false,
  showLabels = true,
}: SupportResistanceZonesProps) {
  const rightPadding = mini ? 55 : 120; // 가격축 공간 (박스 짧게)

  // 영역 타입에 따른 색상
  const getZoneColor = (zone: SupportResistanceZone) => {
    const isSupport = zone.type === 'support';
    const baseOpacity = 0.15 + zone.strength * 0.1; // 강도에 따라 투명도 조절

    if (isSupport) {
      return `rgba(34, 197, 94, ${baseOpacity})`; // 초록
    } else {
      return `rgba(239, 68, 68, ${baseOpacity})`; // 빨강
    }
  };

  const getZoneBorder = (zone: SupportResistanceZone) => {
    const isSupport = zone.type === 'support';
    return isSupport ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
  };

  return (
    <>
      {/* 개별 영역 박스 (투명도 겹침 효과) - POC 포함 */}
      {rawZones.map((item, index) => {
        const { zone, topY, bottomY, startX } = item;
        const minHeight = 8; // 최소 높이
        const rawHeight = Math.abs(bottomY - topY);
        const height = Math.max(rawHeight, minHeight);
        const centerY = (topY + bottomY) / 2;
        const top = centerY - height / 2;

        return (
          <div
            key={`raw-zone-${index}`}
            style={{
              position: 'absolute',
              left: `${startX}px`,
              right: `${rightPadding}px`,
              top: `${top}px`,
              height: `${height}px`,
              backgroundColor: getZoneColor(zone),
              borderTop: `1px solid ${getZoneBorder(zone)}`,
              borderBottom: `1px solid ${getZoneBorder(zone)}`,
              pointerEvents: 'none',
              zIndex: 4,
            }}
          />
        );
      })}

      {/* 병합된 라벨 표시 */}
      {showLabels && blendedZones.map((item, index) => {
        const { zone, topY, bottomY, startX } = item;
        const minHeight = 14;
        const rawHeight = Math.abs(bottomY - topY);
        const height = Math.max(rawHeight, minHeight);
        const centerY = (topY + bottomY) / 2;
        const top = centerY - height / 2;

        // 소스 라벨 (VAL, VAH, OB, POC 등)
        let sourceLabel = '';
        if (zone.overlappingSources.length > 1) {
          sourceLabel = zone.overlappingSources.map(s => {
            if (s === 'VAL') return 'VAL';
            if (s === 'VAH') return 'VAH';
            if (s === 'OB_SUPPORT') return 'OB';
            if (s === 'OB_RESISTANCE') return 'OB';
            if (s === 'POC') return 'POC';
            return s;
          }).filter((v, i, a) => a.indexOf(v) === i).join('+');
        } else {
          switch (zone.source) {
            case 'VAL':
              sourceLabel = 'VAL';
              break;
            case 'VAH':
              sourceLabel = 'VAH';
              break;
            case 'OB_SUPPORT':
            case 'OB_RESISTANCE':
              sourceLabel = 'OB';
              break;
            case 'POC':
              sourceLabel = 'POC';
              break;
          }
        }

        return (
          <span
            key={`label-${index}`}
            style={{
              position: 'absolute',
              left: `${startX + 3}px`,
              top: `${top + height / 2}px`,
              transform: 'translateY(-50%)',
              fontSize: '8px',
              fontWeight: 600,
              color: zone.blendType === 'support'
                ? 'rgba(34, 197, 94, 1)'
                : zone.blendType === 'resistance'
                  ? 'rgba(239, 68, 68, 1)'
                  : 'rgba(234, 179, 8, 1)',
              textShadow: '0 0 2px rgba(0,0,0,0.8)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            {sourceLabel}
          </span>
        );
      })}
    </>
  );
}
