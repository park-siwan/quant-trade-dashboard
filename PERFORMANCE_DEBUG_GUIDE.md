# RealtimeChart 성능 최적화 가이드

## 🔍 현재 상황
- **렌더링 횟수**: #2172+ (매우 높음)
- **렌더링 시간**: 26ms ~ 210ms (목표: <16ms)
- **목표**: 불필요한 리렌더 제거하여 성능 개선

---

## 📊 1단계: 리렌더 원인 파악

### 디버깅 도구 사용법

개발 서버를 실행하면 콘솔에 자동으로 다음 정보가 출력됩니다:

```bash
npm run dev
```

**콘솔 출력 예시:**
```
🔄 [RealtimeChart] Render #2173
🔄 [RealtimeChart] Changed props: {
  ticker: { from: 78234.5, to: 78235.1 },
  candles: { from: 1000, to: 1001 }
}
```

### 주요 확인 사항

#### ✅ 정상적인 리렌더 (괜찮음)
- `candles` 변경 (새 캔들 도착)
- `selectedStrategy` 변경 (사용자가 전략 선택)
- `timeframe` 변경 (사용자가 타임프레임 변경)

#### ❌ 문제가 되는 리렌더 (수정 필요)
- `ticker` 매 초마다 변경 (실시간 가격)
- `divergenceData` 자주 변경
- `equityCurves`, `rollingSharpeData` 같은 값인데 새 Map 객체 생성
- `backtestTrades` 배열이 같은 내용인데 새 배열 생성

---

## 🎯 2단계: 주요 원인 분석

### 원인 1: Socket 데이터 과도한 업데이트

**문제:**
```typescript
const { ticker, divergenceData } = useSocket();
```
- `ticker`는 1초마다 업데이트 → 1초에 1번 리렌더
- `divergenceData`도 자주 변경됨

**해결책 A - Ref 사용 (값을 읽기만 하는 경우):**
```typescript
// UI에 표시만 하고 리렌더 불필요한 경우
const tickerRef = useRef(ticker);
tickerRef.current = ticker;
```

**해결책 B - useMemo로 필요한 값만 추출:**
```typescript
const currentPrice = useMemo(() => ticker?.price, [ticker?.price]);
```

**해결책 C - Throttle/Debounce:**
```typescript
const [throttledTicker, setThrottledTicker] = useState(ticker);

useEffect(() => {
  const timer = setTimeout(() => {
    setThrottledTicker(ticker);
  }, 1000); // 1초마다만 업데이트

  return () => clearTimeout(timer);
}, [ticker]);
```

### 원인 2: 참조 안정성 문제

**문제:**
```typescript
// hooks에서 매번 새 Map/Array 반환
const equityCurves = new Map(); // ← 매 렌더마다 새 객체!
```

**해결책 - 이미 구현됨, 확인 필요:**
useBacktestRunner.ts에 참조 안정화 로직이 있는지 확인:
```typescript
setEquityCurves(prev => {
  if (/* 내용이 동일하면 */) {
    return prev; // ← 기존 참조 재사용
  }
  return newEquityCurves;
});
```

### 원인 3: useEffect 의존성 과다

**문제:**
```typescript
useEffect(() => {
  // 무거운 작업
}, [candles, strategies, timeframe, symbol, /* 너무 많음 */]);
```

**해결책:**
- 필요한 의존성만 포함
- `useCallback`으로 함수 메모이제이션
- 조건문으로 불필요한 실행 차단

---

## 🛠️ 3단계: 실제 수정 방법

### 수정 1: ticker 리렌더 방지

**Before (문제):**
```typescript
const { ticker, divergenceData } = useSocket();

return (
  <div>Price: {ticker?.price}</div>
)
```

**After (해결):**
```typescript
const { ticker } = useSocket();
const price = useMemo(() => ticker?.price, [ticker?.price]);

return (
  <div>Price: {price}</div>
)
```

### 수정 2: 차트 컴포넌트 메모이제이션

**Before:**
```typescript
<MultiStrategyEquityChart
  strategies={chartStrategies}
  highlightedStrategyId={highlightedStrategy}
/>
```

**After:**
```typescript
const chartStrategiesMemo = useMemo(() => chartStrategies, [
  chartStrategies.length,
  // ID만 비교
  chartStrategies.map(s => s.strategyId).join(',')
]);

<MultiStrategyEquityChart
  strategies={chartStrategiesMemo}
  highlightedStrategyId={highlightedStrategy}
/>
```

### 수정 3: 이벤트 핸들러 메모이제이션

**Before:**
```typescript
<button onClick={() => setSelectedStrategy(strategy)}>
  Select
</button>
```

**After:**
```typescript
const handleStrategySelect = useCallback((strategy: SavedOptimizeResult) => {
  setSelectedStrategy(strategy);
}, []); // 의존성 없음

<button onClick={() => handleStrategySelect(strategy)}>
  Select
</button>
```

---

## 🚀 4단계: 성능 검증

### 측정 방법

1. **Chrome DevTools > Performance 탭**
   - Record 시작
   - 30초 동안 대기
   - 렌더링 횟수 확인

2. **React DevTools > Profiler 탭**
   - Record 시작
   - 몇 가지 액션 수행
   - 각 컴포넌트의 렌더링 시간 확인

3. **콘솔 로그 확인**
   ```
   🔄 [RealtimeChart] Render #10
   🔄 [RealtimeChart] Changed props: { ticker: ... }
   ```

### 목표 지표

| 항목 | 현재 | 목표 | 방법 |
|------|------|------|------|
| 렌더링 횟수 (5분) | 2172+ | <50 | ticker/socket 데이터 최적화 |
| 평균 렌더링 시간 | 60-200ms | <16ms | 메모이제이션, 지연 로딩 |
| 초당 렌더 횟수 | ~7회 | <0.5회 | Throttle/Debounce |

---

## 📝 5단계: 체크리스트

### 즉시 확인할 항목

- [ ] `ticker` 때문에 매 초 리렌더되는가?
- [ ] `divergenceData` 변경 시마다 리렌더되는가?
- [ ] `equityCurves` Map이 매번 새로 생성되는가?
- [ ] `strategies` 배열이 참조가 변경되는가?
- [ ] 차트 컴포넌트들이 React.memo로 감싸졌는가?

### Hook 최적화 체크리스트

**useChartData:**
- [ ] `candles` 배열 참조 안정화 확인
- [ ] WebSocket 구독 중복 방지

**useStrategyList:**
- [ ] `strategies` 배열 참조 안정화 확인
- [ ] API 호출 중복 방지 (loadingRef 확인)

**useBacktestRunner:**
- [ ] `equityCurves` Map 참조 안정화 확인
- [ ] `rollingSharpeData` Map 참조 안정화 확인

**useRealtimeUpdates:**
- [ ] `backtestTrades` 배열 참조 안정화 확인
- [ ] 캐시 적중률 확인 (콘솔 로그)

---

## 🐛 6단계: 버그 찾기

### 의심되는 버그 패턴

1. **무한 루프:**
   ```typescript
   useEffect(() => {
     setStrategies([...strategies, newStrategy]); // ← 의존성에 strategies 있으면 무한 루프!
   }, [strategies]);
   ```

2. **Stale Closure:**
   ```typescript
   useEffect(() => {
     const timer = setInterval(() => {
       console.log(strategies); // ← 오래된 값!
     }, 1000);
   }, []); // strategies가 의존성에 없음
   ```

3. **참조 불안정:**
   ```typescript
   const config = { foo: 'bar' }; // ← 매 렌더마다 새 객체!
   useEffect(() => {
     doSomething(config);
   }, [config]); // 매번 실행됨
   ```

### 버그 찾는 방법

1. **콘솔 로그 추가:**
   ```typescript
   useEffect(() => {
     console.log('🔵 useEffect triggered', { candles: candles.length });
   }, [candles]);
   ```

2. **브레이크포인트 설정:**
   - Chrome DevTools에서 의심되는 useEffect에 중단점 설정
   - 호출 스택 확인

3. **React DevTools Profiler:**
   - "Why did this update?" 확인
   - 느린 컴포넌트 식별

---

## 💡 추천 수정 순서

1. **1순위: ticker 최적화** (가장 큰 영향)
2. **2순위: divergenceData 최적화**
3. **3순위: 차트 컴포넌트 메모이제이션**
4. **4순위: Hook 참조 안정화 검증**
5. **5순위: 이벤트 핸들러 메모이제이션**

---

## 🎓 학습 리소스

- [React 렌더링 최적화](https://react.dev/learn/render-and-commit)
- [useMemo/useCallback 사용법](https://react.dev/reference/react/useMemo)
- [React.memo 가이드](https://react.dev/reference/react/memo)
- [React DevTools Profiler](https://react.dev/learn/react-developer-tools)
