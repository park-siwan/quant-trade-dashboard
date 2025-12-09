interface ChartTooltipProps {
  x: number;
  y: number;
  rsi: number | null;
  filterReason: string | null;
  crossover: { type: 'golden_cross' | 'dead_cross'; analysis: string } | null;
  divergences: Array<{ type: string; direction: string; analysis: string }>;
}

export default function ChartTooltip({
  x,
  y,
  rsi,
  filterReason,
  crossover,
  divergences,
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
      {/* 골든크로스/데드크로스 정보 */}
      {crossover && (
        <>
          <div
            style={{
              color: crossover.type === 'golden_cross' ? '#a3e635' : '#fb923c',
              fontWeight: 'bold',
              marginBottom: '8px',
              fontSize: '14px',
            }}
          >
            {crossover.type === 'golden_cross' ? '🟢 골든크로스 (GC)' : '🟠 데드크로스 (DC)'}
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

      {/* 다이버전스 정보 (여러 개 가능) */}
      {divergences && divergences.length > 0 && (
        <>
          {divergences.map((divergence, index) => (
            <div key={index}>
              <div
                style={{
                  color: divergence.direction === 'bullish' ? '#a3e635' : '#fb923c',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                  fontSize: '14px',
                }}
              >
                {divergence.direction === 'bullish' ? '📈 강세 다이버전스' : '📉 약세 다이버전스'}
                {' '}
                <span style={{ color: '#fbbf24', fontSize: '12px' }}>
                  ({divergence.type.toUpperCase()})
                </span>
              </div>
              <div style={{ lineHeight: '1.6', color: '#d1d5db', marginBottom: '12px' }}>
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
          ))}
          {/* 복수 지표 다이버전스 신뢰도 안내 */}
          {(() => {
            // 모든 다이버전스가 같은 방향인지 확인
            const allSameDirection = divergences.length >= 2 &&
              divergences.every(d => d.direction === divergences[0].direction);

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
                    여러 지표가 동시에 같은 방향의 다이버전스를 보이면 신호의 신뢰도가 크게 높아집니다.
                  </div>
                </div>
              );
            } else if (divergences.length >= 2) {
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
                    지표들이 서로 다른 방향을 가리키고 있어 시장이 혼란스러운 상태일 수 있습니다. 신중한 판단이 필요합니다.
                  </div>
                </div>
              );
            }
            return null;
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
