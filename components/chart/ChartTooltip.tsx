interface ChartTooltipProps {
  x: number;
  y: number;
  rsi: number | null;
  filterReason: string | null;
}

export default function ChartTooltip({
  x,
  y,
  rsi,
  filterReason,
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
        maxWidth: '300px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(251, 146, 60, 0.1)',
      }}
    >
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
