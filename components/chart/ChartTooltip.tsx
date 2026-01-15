import { MarketSignal } from '@/lib/types/index';
import { COLORS, TOOLTIP_COLORS } from '@/lib/colors';

interface ChartTooltipProps {
  x: number;
  y: number;
  rsi: number | null;
  filterReason: string | null;
  crossover: { type: 'golden_cross' | 'dead_cross'; analysis: string } | null;
  divergences: Array<{ type: string; direction: string; analysis: string; isFiltered: boolean; startTime: number; endTime: number }>;
  marketSignal?: MarketSignal | null;
  priceInfo?: {
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePercent: number;
  } | null;
  choch?: {
    direction: 'bullish' | 'bearish';
    strength: 'strong' | 'medium' | 'weak';
    isOverheated: boolean;
    rsiAtBreak?: number;
  } | null;
}

// 방향별 색상 헬퍼
const getDirectionColor = (direction: string, type: 'primary' | 'signal' = 'primary') => {
  if (type === 'signal') {
    return direction === 'bullish' ? COLORS.BULLISH : COLORS.ORANGE;
  }
  return direction === 'bullish' ? COLORS.LONG : COLORS.SHORT;
};

// 공통 스타일
const STYLES = {
  divider: {
    borderTop: `1px solid ${TOOLTIP_COLORS.DIVIDER}`,
    marginBottom: '8px',
  },
  dividerLight: {
    borderTop: `1px solid ${TOOLTIP_COLORS.DIVIDER_LIGHT}`,
    marginBottom: '8px',
  },
  text: {
    lineHeight: '1.6',
    color: COLORS.TEXT_SECONDARY,
  },
  title: {
    fontWeight: 'bold' as const,
    marginBottom: '8px',
    fontSize: '14px',
  },
} as const;

export default function ChartTooltip({
  x,
  y,
  rsi,
  filterReason,
  crossover,
  divergences,
  marketSignal,
  choch,
}: ChartTooltipProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x + 15 + 'px',
        top: y + 15 + 'px',
        backgroundColor: TOOLTIP_COLORS.BG,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: COLORS.WHITE,
        padding: '12px 16px',
        borderRadius: '12px',
        fontSize: '13px',
        border: `1px solid ${TOOLTIP_COLORS.BORDER}`,
        pointerEvents: 'none',
        zIndex: 1000,
        maxWidth: '350px',
        boxShadow: TOOLTIP_COLORS.SHADOW,
      }}
    >
      {/* CVD+OI 시장 신호 */}
      {marketSignal && (
        <>
          <div style={{ ...STYLES.text, whiteSpace: 'pre-line', marginBottom: '12px' }}>
            {marketSignal.description}
          </div>
          <div style={STYLES.divider} />
        </>
      )}

      {/* 골든크로스/데드크로스 정보 */}
      {crossover && (
        <>
          <div
            style={{
              ...STYLES.title,
              color: crossover.type === 'golden_cross' ? COLORS.BULLISH : COLORS.BEARISH,
            }}
          >
            {crossover.type === 'golden_cross' ? '✕ 골든크로스' : '✕ 데드크로스'}
          </div>
          <div style={{ ...STYLES.text, marginBottom: '12px' }}>
            {crossover.analysis}
          </div>
          <div style={STYLES.divider} />
        </>
      )}

      {/* CHoCH (Change of Character) 정보 */}
      {choch && (
        <>
          <div
            style={{
              ...STYLES.title,
              color: getDirectionColor(choch.direction),
            }}
          >
            {choch.direction === 'bullish' ? '↑ CHoCH 상승 전환' : '↓ CHoCH 하락 전환'}
            {' '}
            <span style={{ color: COLORS.OI, fontSize: '12px' }}>
              ({choch.strength === 'strong' ? '강함' : choch.strength === 'medium' ? '중간' : '약함'})
            </span>
          </div>
          <div style={{ ...STYLES.text, marginBottom: '8px', fontSize: '12px' }}>
            {choch.direction === 'bullish'
              ? '하락 추세에서 상승 추세로 전환되는 시장 구조 변화가 감지되었습니다. 매수 진입을 고려할 수 있습니다.'
              : '상승 추세에서 하락 추세로 전환되는 시장 구조 변화가 감지되었습니다. 매도 또는 익절을 고려하세요.'}
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', marginBottom: '8px' }}>
            {choch.rsiAtBreak && (
              <span style={{ color: COLORS.OBV }}>RSI: {choch.rsiAtBreak.toFixed(1)}</span>
            )}
            <span style={{ color: choch.isOverheated ? COLORS.LONG : COLORS.TEXT_MUTED }}>
              신뢰도: {choch.isOverheated ? '✓ 높음' : '○ 낮음'}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: COLORS.NEUTRAL, marginBottom: '12px' }}>
            {choch.isOverheated
              ? '쉐브론 글로우: RSI 극단값으로 전환 신뢰도 높음'
              : '쉐브론 투명: RSI 조건 미충족으로 약한 신호'}
          </div>
          <div style={STYLES.divider} />
        </>
      )}

      {/* 다이버전스 및 CHoCH 정보 (여러 개 가능) */}
      {divergences && divergences.length > 0 && (
        <>
          {divergences.map((divergence, index) => {
            const isChoch = divergence.type === 'choch';
            const titleColor = isChoch
              ? getDirectionColor(divergence.direction)
              : getDirectionColor(divergence.direction, 'signal');
            const title = isChoch
              ? (divergence.direction === 'bullish' ? '↑ CHoCH 상승 전환' : '↓ CHoCH 하락 전환')
              : (divergence.direction === 'bullish' ? '📈 강세 다이버전스' : '📉 약세 다이버전스');

            return (
              <div key={index}>
                <div style={{ ...STYLES.title, color: titleColor }}>
                  {title}
                  {!isChoch && (
                    <>
                      {' '}
                      <span style={{ color: COLORS.OI, fontSize: '12px' }}>
                        ({divergence.type.toUpperCase()})
                      </span>
                    </>
                  )}
                </div>
                <div style={{ ...STYLES.text, marginBottom: '12px', whiteSpace: 'pre-line' }}>
                  {divergence.analysis}
                </div>
                {index < divergences.length - 1 && <div style={STYLES.dividerLight} />}
              </div>
            );
          })}
          {/* 복수 지표 다이버전스 신뢰도 안내 */}
          {(() => {
            const validDivergences = divergences.filter(d => !d.isFiltered);
            if (validDivergences.length < 2) return null;

            const hasRealOverlap = (d1: typeof validDivergences[0], d2: typeof validDivergences[0]) => {
              const overlapStart = Math.max(d1.startTime, d2.startTime);
              const overlapEnd = Math.min(d1.endTime, d2.endTime);
              return overlapStart < overlapEnd;
            };

            const overlappingDivergences: typeof validDivergences = [];
            for (let i = 0; i < validDivergences.length; i++) {
              for (let j = i + 1; j < validDivergences.length; j++) {
                if (hasRealOverlap(validDivergences[i], validDivergences[j])) {
                  if (!overlappingDivergences.includes(validDivergences[i])) {
                    overlappingDivergences.push(validDivergences[i]);
                  }
                  if (!overlappingDivergences.includes(validDivergences[j])) {
                    overlappingDivergences.push(validDivergences[j]);
                  }
                }
              }
            }

            if (overlappingDivergences.length < 2) return null;

            const allSameDirection = overlappingDivergences.every(
              d => d.direction === overlappingDivergences[0].direction
            );

            if (allSameDirection) {
              return (
                <div
                  style={{
                    backgroundColor: TOOLTIP_COLORS.CONFIRM_BG,
                    border: `1px solid ${TOOLTIP_COLORS.CONFIRM_BORDER}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ color: COLORS.BULLISH, fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
                    ⭐ 높은 신뢰도
                  </div>
                  <div style={{ color: COLORS.TEXT_SECONDARY, fontSize: '11px', lineHeight: '1.5' }}>
                    여러 지표({overlappingDivergences.map(d => d.type.toUpperCase()).join(', ')})가
                    같은 구간에서 동일한 방향의 다이버전스를 보이고 있습니다.
                  </div>
                </div>
              );
            } else {
              return (
                <div
                  style={{
                    backgroundColor: TOOLTIP_COLORS.CONFLICT_BG,
                    border: `1px solid ${TOOLTIP_COLORS.CONFLICT_BORDER}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ color: COLORS.ORANGE, fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
                    ⚠️ 신호 상충
                  </div>
                  <div style={{ color: COLORS.TEXT_SECONDARY, fontSize: '11px', lineHeight: '1.5' }}>
                    지표들이 같은 구간에서 서로 다른 방향을 가리키고 있습니다. 신중한 판단이 필요합니다.
                  </div>
                </div>
              );
            }
          })()}
          <div style={STYLES.divider} />
        </>
      )}

      {/* RSI 값 */}
      {rsi !== null && (
        <div
          style={{
            color: COLORS.RSI,
            fontWeight: 'bold',
            marginBottom: filterReason ? '8px' : '0',
          }}
        >
          RSI: {rsi.toFixed(2)}
        </div>
      )}

      {/* 필터링 정보 */}
      {filterReason && (
        <>
          {rsi !== null && <div style={STYLES.divider} />}
          <div
            style={{
              color: COLORS.TEXT_MUTED,
              fontWeight: 'bold',
              marginBottom: '6px',
              fontSize: '12px',
            }}
          >
            ⚠️ 필터링됨
          </div>
          <div style={{ ...STYLES.text, lineHeight: '1.5' }}>
            {filterReason}
          </div>
        </>
      )}
    </div>
  );
}
