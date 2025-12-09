interface ChartTooltipProps {
  x: number;
  y: number;
  rsi: number | null;
  filterReason: string | null;
  crossover: { type: 'golden_cross' | 'dead_cross'; analysis: string } | null;
  divergence: { type: string; direction: string; analysis: string } | null;
}

export default function ChartTooltip({
  x,
  y,
  rsi,
  filterReason,
  crossover,
  divergence,
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

      {/* 다이버전스 정보 */}
      {divergence && (
        <>
          <div
            style={{
              color: divergence.direction === 'bullish' ? '#a3e635' : '#fb923c',
              fontWeight: 'bold',
              marginBottom: '8px',
              fontSize: '14px',
            }}
          >
            {divergence.direction === 'bullish' ? '📈 강세 다이버전스' : '📉 약세 다이버전스'}
          </div>
          <div style={{ lineHeight: '1.6', color: '#d1d5db', marginBottom: '12px' }}>
            {divergence.analysis}
          </div>
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
