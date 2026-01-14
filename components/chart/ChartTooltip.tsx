import { MarketSignal } from '@/lib/types/index';

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

export default function ChartTooltip({
  x,
  y,
  rsi,
  filterReason,
  crossover,
  divergences,
  marketSignal,
  priceInfo,
  choch,
}: ChartTooltipProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x + 15 + 'px',
        top: y + 15 + 'px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: '#ffffff',
        padding: '12px 16px',
        borderRadius: '12px',
        fontSize: '13px',
        border: '1px solid rgba(251, 146, 60, 0.3)',
        pointerEvents: 'none',
        zIndex: 1000,
        maxWidth: '350px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(251, 146, 60, 0.1)',
      }}
    >
      {/* CVD+OI 시장 신호 */}
      {marketSignal && (
        <>
          <div
            style={{
              whiteSpace: 'pre-line',
              lineHeight: '1.6',
              color: '#d1d5db',
              marginBottom: '12px',
            }}
          >
            {marketSignal.description}
          </div>
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              marginBottom: '8px',
            }}
          />
        </>
      )}

      {/* 골든크로스/데드크로스 정보 */}
      {crossover && (
        <>
          <div
            style={{
              color: crossover.type === 'golden_cross' ? '#a3e635' : '#f87171',
              fontWeight: 'bold',
              marginBottom: '8px',
              fontSize: '14px',
            }}
          >
            {crossover.type === 'golden_cross' ? '✕ 골든크로스' : '✕ 데드크로스'}
          </div>
          <div style={{ lineHeight: '1.6', color: '#d1d5db', marginBottom: '12px' }}>
            {crossover.analysis}
          </div>
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              marginBottom: '8px',
            }}
          />
        </>
      )}

      {/* CHoCH (Change of Character) 정보 */}
      {choch && (
        <>
          <div
            style={{
              color: choch.direction === 'bullish' ? '#22c55e' : '#ef4444',
              fontWeight: 'bold',
              marginBottom: '8px',
              fontSize: '14px',
            }}
          >
            {choch.direction === 'bullish' ? '↑ CHoCH 상승 전환' : '↓ CHoCH 하락 전환'}
            {' '}
            <span style={{ color: '#fbbf24', fontSize: '12px' }}>
              ({choch.strength === 'strong' ? '강함' : choch.strength === 'medium' ? '중간' : '약함'})
            </span>
          </div>
          <div style={{ lineHeight: '1.6', color: '#d1d5db', marginBottom: '8px', fontSize: '12px' }}>
            {choch.direction === 'bullish'
              ? '하락 추세에서 상승 추세로 전환되는 시장 구조 변화가 감지되었습니다. 매수 진입을 고려할 수 있습니다.'
              : '상승 추세에서 하락 추세로 전환되는 시장 구조 변화가 감지되었습니다. 매도 또는 익절을 고려하세요.'}
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', marginBottom: '8px' }}>
            {choch.rsiAtBreak && (
              <span style={{ color: '#60a5fa' }}>RSI: {choch.rsiAtBreak.toFixed(1)}</span>
            )}
            <span style={{ color: choch.isOverheated ? '#22c55e' : '#9ca3af' }}>
              신뢰도: {choch.isOverheated ? '✓ 높음' : '○ 낮음'}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '12px' }}>
            {choch.isOverheated
              ? '쉐브론 글로우: RSI 극단값으로 전환 신뢰도 높음'
              : '쉐브론 투명: RSI 조건 미충족으로 약한 신호'}
          </div>
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              marginBottom: '8px',
            }}
          />
        </>
      )}

      {/* 다이버전스 및 CHoCH 정보 (여러 개 가능) */}
      {divergences && divergences.length > 0 && (
        <>
          {divergences.map((divergence, index) => {
            // CHoCH인 경우 다른 스타일 적용
            const isChoch = divergence.type === 'choch';
            const titleColor = divergence.direction === 'bullish' ? '#22c55e' : '#ef4444';
            const title = isChoch
              ? (divergence.direction === 'bullish' ? '↑ CHoCH 상승 전환' : '↓ CHoCH 하락 전환')
              : (divergence.direction === 'bullish' ? '📈 강세 다이버전스' : '📉 약세 다이버전스');

            return (
              <div key={index}>
                <div
                  style={{
                    color: isChoch ? titleColor : (divergence.direction === 'bullish' ? '#a3e635' : '#fb923c'),
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    fontSize: '14px',
                  }}
                >
                  {title}
                  {!isChoch && (
                    <>
                      {' '}
                      <span style={{ color: '#fbbf24', fontSize: '12px' }}>
                        ({divergence.type.toUpperCase()})
                      </span>
                    </>
                  )}
                </div>
                <div style={{ lineHeight: '1.6', color: '#d1d5db', marginBottom: '12px', whiteSpace: 'pre-line' }}>
                  {divergence.analysis}
                </div>
                {index < divergences.length - 1 && (
                  <div
                    style={{
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      marginBottom: '8px',
                    }}
                  />
                )}
              </div>
            );
          })}
          {/* 복수 지표 다이버전스 신뢰도 안내 (실제 범위 겹침 체크) */}
          {(() => {
            // 필터링되지 않은 다이버전스만 추출
            const validDivergences = divergences.filter(d => !d.isFiltered);

            if (validDivergences.length < 2) return null;

            // 실제로 범위가 겹치는지 체크 (꼭짓점만 공유하는 경우 제외)
            // 두 범위 [a.start, a.end]와 [b.start, b.end]가 겹치려면:
            // max(a.start, b.start) < min(a.end, b.end) 이어야 함
            const hasRealOverlap = (d1: typeof validDivergences[0], d2: typeof validDivergences[0]) => {
              const overlapStart = Math.max(d1.startTime, d2.startTime);
              const overlapEnd = Math.min(d1.endTime, d2.endTime);
              return overlapStart < overlapEnd; // 꼭짓점만 같으면 false
            };

            // 모든 쌍에서 실제 겹침이 있는지 확인
            let realOverlapCount = 0;
            const overlappingDivergences: typeof validDivergences = [];

            for (let i = 0; i < validDivergences.length; i++) {
              for (let j = i + 1; j < validDivergences.length; j++) {
                if (hasRealOverlap(validDivergences[i], validDivergences[j])) {
                  realOverlapCount++;
                  if (!overlappingDivergences.includes(validDivergences[i])) {
                    overlappingDivergences.push(validDivergences[i]);
                  }
                  if (!overlappingDivergences.includes(validDivergences[j])) {
                    overlappingDivergences.push(validDivergences[j]);
                  }
                }
              }
            }

            // 실제로 겹치는 다이버전스가 없으면 표시 안함
            if (overlappingDivergences.length < 2) return null;

            // 같은 방향인지 확인
            const allSameDirection = overlappingDivergences.every(
              d => d.direction === overlappingDivergences[0].direction
            );

            if (allSameDirection) {
              return (
                <div
                  style={{
                    backgroundColor: 'rgba(163, 230, 53, 0.1)',
                    border: '1px solid rgba(163, 230, 53, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ color: '#a3e635', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
                    ⭐ 높은 신뢰도
                  </div>
                  <div style={{ color: '#d1d5db', fontSize: '11px', lineHeight: '1.5' }}>
                    여러 지표({overlappingDivergences.map(d => d.type.toUpperCase()).join(', ')})가
                    같은 구간에서 동일한 방향의 다이버전스를 보이고 있습니다.
                  </div>
                </div>
              );
            } else {
              // 방향이 다른 경우 (상충)
              return (
                <div
                  style={{
                    backgroundColor: 'rgba(251, 146, 60, 0.1)',
                    border: '1px solid rgba(251, 146, 60, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ color: '#fb923c', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
                    ⚠️ 신호 상충
                  </div>
                  <div style={{ color: '#d1d5db', fontSize: '11px', lineHeight: '1.5' }}>
                    지표들이 같은 구간에서 서로 다른 방향을 가리키고 있습니다. 신중한 판단이 필요합니다.
                  </div>
                </div>
              );
            }
          })()}
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              marginBottom: '8px',
            }}
          />
        </>
      )}

      {/* RSI 값 */}
      {rsi !== null && (
        <div
          style={{
            color: '#fb923c',
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
          {rsi !== null && (
            <div
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                marginBottom: '8px',
              }}
            />
          )}
          <div
            style={{
              color: '#9CA3AF',
              fontWeight: 'bold',
              marginBottom: '6px',
              fontSize: '12px',
            }}
          >
            ⚠️ 필터링됨
          </div>
          <div style={{ lineHeight: '1.5', color: '#d1d5db' }}>
            {filterReason}
          </div>
        </>
      )}
    </div>
  );
}
