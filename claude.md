# Claude Code 프로젝트 가이드

## 프로젝트 개요
BTC 트레이딩 대시보드 - Next.js 14 + TypeScript + lightweight-charts

## 코드베이스 구조

### 핵심 디렉토리
```
lib/           # 유틸리티, 상수, 타입 (탐색 우선순위 높음)
├── colors.ts      # 모든 색상 상수 (COLORS, CHART_COLORS, INDICATOR_COLORS)
├── constants.ts   # 매직 넘버 중앙화 (ANIMATION, WEBSOCKET, API, TTS)
├── storage.ts     # localStorage 유틸리티
├── classnames.ts  # Tailwind 조건부 클래스 유틸리티
├── thresholds.ts  # 점수/임계값 상수
├── scoring.ts     # 신호 점수 계산
├── signal.ts      # 신호 스타일/색상
└── chart/         # 차트 관련 모듈
    ├── chartConfig.ts  # 차트 옵션, 테마
    └── indicators.ts   # 지표 추가 함수

components/    # React 컴포넌트
├── chart/         # 차트 관련 컴포넌트
│   ├── ChartRenderer.tsx  # 메인 차트 (2000줄, 복잡)
│   ├── ChartMarkers.tsx   # 마커 컴포넌트
│   └── MeasurementBox.tsx # 측정 도구
└── shared/        # 공유 컴포넌트
    └── AnimatedDisplay.tsx # 애니메이션 숫자 표시

hooks/         # 커스텀 훅
├── useCandles.ts     # 캔들 데이터 fetching
├── useMTFSocket.ts   # 멀티타임프레임 웹소켓
├── useTradeAlert.ts  # 트레이딩 알림
└── useTTS.ts         # 음성 알림
```

### 중앙화된 상수 위치
| 항목 | 파일 | 설명 |
|------|------|------|
| 색상 | `lib/colors.ts` | COLORS, CHART_COLORS, INDICATOR_COLORS |
| 타이밍 | `lib/constants.ts` | ANIMATION, WEBSOCKET, API, TTS |
| 임계값 | `lib/thresholds.ts` | SCORE, COOLDOWN, RSI, ADX |
| 차트설정 | `lib/chart/chartConfig.ts` | CHART_THEME, PANEL_CONFIG |

## 코드 작성 가이드

### 색상 사용
```typescript
// Bad - 하드코딩
color: 'rgba(34, 197, 94, 0.3)'

// Good - 중앙화된 상수
import { CHART_COLORS, rgba, COLORS } from '@/lib/colors';
color: CHART_COLORS.CANDLE_UP
color: rgba(COLORS.LONG, 0.3)
```

### 조건부 Tailwind 클래스
```typescript
// Bad - 인라인 삼항
className={isLong ? 'text-green-400' : 'text-red-400'}

// Good - 유틸리티 함수
import { directionText, directionBg } from '@/lib/classnames';
className={directionText(isLong)}
className={directionBg(direction, 20)}
```

### localStorage 접근
```typescript
// Bad - 반복되는 try-catch
if (typeof window === 'undefined') return {};
try {
  const stored = localStorage.getItem(KEY);
  // ...
} catch { return {}; }

// Good - 유틸리티 함수
import { loadFromStorage, saveToStorage } from '@/lib/storage';
const data = loadFromStorage(KEY, defaultValue, cleanupFn);
saveToStorage(KEY, data, cleanupFn);
```

### 매직 넘버
```typescript
// Bad - 하드코딩된 숫자
setTimeout(() => {}, 500);
const THROTTLE = 500;

// Good - 중앙화된 상수
import { ANIMATION, WEBSOCKET } from '@/lib/constants';
setTimeout(() => {}, ANIMATION.COLOR_FADE);
const THROTTLE = WEBSOCKET.THROTTLE_MS;
```

## Claude Code 최적화 전략

> 핵심: Claude Code가 **덜 찾아다니고 덜 고민하게** 만드는 것

### 탐색 속도 높이기

1. **파일명을 기능 그대로 짓기**
   ```
   // Bad
   utils.ts, helpers.ts, common.ts

   // Good
   formatCurrency.ts, useOrderStatus.ts, calculateScore.ts
   ```
   파일명만 보고 찾아갈 수 있게

2. **index.ts로 re-export 정리**
   ```typescript
   // lib/index.ts
   export * from './colors';
   export * from './constants';
   export * from './storage';
   ```
   import 경로 헤매는 시간 감소

3. **파일당 200줄 이하 유지**
   - 길어지면 위아래 왔다갔다 하느라 느려짐
   - 500줄 넘으면 반드시 분리 검토

4. **관련 파일 한 폴더에 모으기**
   ```
   features/order/
   ├── OrderCard.tsx      # 컴포넌트
   ├── useOrder.ts        # 훅
   ├── order.types.ts     # 타입
   └── order.constants.ts # 상수
   ```
   컨텍스트 한번에 로드됨

### 생산 속도 높이기

1. **예시 코드/템플릿 제공** (아래 "코드 작성 가이드" 섹션)
   - 컴포넌트 구조, 훅 패턴 등 템플릿 박아두면 그대로 찍어냄

2. **타입 빡빡하게**
   ```typescript
   // Bad - 선택지 넓음
   type Status = string;

   // Good - 선택지 좁음, 추론 빠름
   type Status = 'pending' | 'success' | 'error';
   ```

3. **프롬프트 2단계로 시키기**
   ```
   // Bad - 엉뚱한 데 손대기 쉬움
   "이 버그 고쳐줘"

   // Good - 탐색 먼저, 정확도 상승
   "먼저 관련 파일 찾아서 알려주고, 그다음 수정해"
   ```

### 빠른 탐색을 위한 파일 구조
1. **상수/설정 먼저 확인**: `lib/` 디렉토리의 상수 파일들 우선 탐색
2. **타입 정의**: `lib/types/index.ts`에 모든 타입 집중
3. **공유 컴포넌트**: `components/shared/`에 재사용 컴포넌트

### 검색 패턴
| 찾고자 하는 것 | 검색 위치 |
|---------------|----------|
| 색상 값 | `lib/colors.ts` |
| 타이밍/딜레이 | `lib/constants.ts` |
| 점수 임계값 | `lib/thresholds.ts` |
| 차트 옵션 | `lib/chart/chartConfig.ts` |
| 타입 정의 | `lib/types/index.ts` |
| 애니메이션 컴포넌트 | `components/shared/AnimatedDisplay.tsx` |

### 대형 파일 주의
- `ChartRenderer.tsx` (~2000줄): 차트 렌더링 로직, 점진적 분리 중
- `indicators.ts` (~900줄): 지표 추가 함수들

## 리팩토링 원칙

### 중복 제거 우선순위
1. **색상/스타일**: 시각적 일관성 + 테마 변경 용이
2. **매직 넘버**: 의미 부여 + 중앙 관리
3. **유틸리티 패턴**: localStorage, 조건부 클래스 등
4. **대형 파일 분리**: 500줄 이상은 모듈 분리 검토

### 새 유틸리티 추가 시
1. `lib/` 디렉토리에 단일 책임 파일 생성
2. 명확한 export로 자동완성 지원
3. JSDoc 주석으로 사용법 명시
4. 기존 코드 점진적 마이그레이션

## 자주 발견되는 비효율 패턴

리팩토링 과정에서 반복적으로 발견된 안티패턴들입니다.

### 1. 하드코딩된 RGBA 색상
```typescript
// Bad - 27+ 인스턴스 발견
color: 'rgba(34, 197, 94, 0.3)'
color: 'rgba(239, 68, 68, 0.5)'
borderColor: '#22c55e80'

// 문제점
// - 색상 변경 시 전체 검색 필요
// - 불투명도 불일치 발생
// - 테마 변경 불가능
```

### 2. 중복된 localStorage 보일러플레이트
```typescript
// Bad - 3개 훅에서 동일 패턴 반복 (64줄 → 31줄로 감소)
if (typeof window === 'undefined') return defaultValue;
try {
  const stored = localStorage.getItem(KEY);
  if (!stored) return defaultValue;
  return JSON.parse(stored);
} catch {
  return defaultValue;
}

// 문제점
// - SSR 체크 반복
// - 에러 처리 일관성 부족
// - 정리(cleanup) 로직 누락 가능
```

### 3. 방향성 조건부 클래스 반복
```typescript
// Bad - 31+ 인스턴스 발견
className={isLong ? 'text-green-400' : 'text-red-400'}
className={direction === 'bullish' ? 'bg-green-500/20' : 'bg-red-500/20'}
className={`${isLong ? 'border-green-500/30' : 'border-red-500/30'}`}

// 문제점
// - 색상 코드 불일치 (green-400 vs green-500)
// - 불투명도 불일치 (20 vs 30)
// - 타입 처리 불일치 (boolean vs string)
```

### 4. 분산된 매직 넘버
```typescript
// Bad - 여러 파일에 흩어진 동일 값
setTimeout(() => {}, 500);     // useTradeAlert.ts
const THROTTLE = 500;          // useMTFSocket.ts
debounce(fn, 500);             // ChartRenderer.tsx

// 문제점
// - 의미 파악 어려움 (500ms가 뭘 의미?)
// - 값 변경 시 전체 검색 필요
// - 연관된 값들의 관계 불명확
```

### 5. 동일 컴포넌트 중복 정의
```typescript
// Bad - AnimatedNumber가 3개 파일에 각각 정의됨
// ScoreCard.tsx, RecommendationCard.tsx, MTFOverview.tsx

const AnimatedNumber = ({ value }: { value: number }) => {
  // 거의 동일한 로직...
};

// 문제점
// - 버그 수정 시 3곳 수정 필요
// - 미세한 구현 차이로 인한 불일치
// - 번들 크기 증가
```

### 6. console.log 잔존
```typescript
// Bad - 프로덕션 코드에 디버깅 로그
console.log('Debug:', data);
console.log('[WebSocket] Connected');

// 검색 명령
grep -r "console\." --include="*.ts" --include="*.tsx" | grep -v node_modules
```

### 7. 대형 파일 내 분리 가능한 로직
```typescript
// Bad - ChartRenderer.tsx (2000줄)
// 마커 렌더링, 측정 도구, 이벤트 핸들러가 모두 한 파일에

// 분리 후
// - ChartMarkers.tsx (마커 전용)
// - MeasurementBox.tsx (측정 도구)
// - useChartEvents.ts (이벤트 핸들러)
```

### 8. 인라인 스타일 객체 반복 생성
```typescript
// Bad - 렌더링마다 새 객체 생성
<div style={{ color: isLong ? '#22c55e' : '#ef4444', opacity: 0.8 }}>

// Good - useMemo 또는 상수로 분리
const style = useMemo(() => ({
  color: directionColor(isLong),
  opacity: 0.8
}), [isLong]);
```

### 9. 타입 단언 남용
```typescript
// Bad - as 키워드 과다 사용
const data = response as MTFData;
const element = ref.current as HTMLDivElement;

// Good - 타입 가드 또는 제네릭 사용
if (isMTFData(response)) { ... }
const ref = useRef<HTMLDivElement>(null);
```

### 10. 중첩된 삼항 연산자
```typescript
// Bad - 가독성 저하
className={score > 80 ? 'text-green-400' : score > 50 ? 'text-yellow-400' : 'text-red-400'}

// Good - 함수로 추출
function scoreColor(score: number): string {
  if (score > 80) return 'text-green-400';
  if (score > 50) return 'text-yellow-400';
  return 'text-red-400';
}
```

## 자주 사용하는 패턴

### 방향성 (롱/숏) 처리
```typescript
type Direction = 'long' | 'short' | 'bullish' | 'bearish' | boolean;

// 색상
directionText(direction)      // 'text-green-400' | 'text-red-400'
directionBg(direction, 20)    // 'bg-green-500/20' | 'bg-red-500/20'

// 아이콘
const Icon = isLong ? TrendingUp : TrendingDown;
```

### 타임스탬프 기반 정리
```typescript
import { cleanupTimestampRecord, cleanupArrayByTimestamp } from '@/lib/storage';

// Record<string, number> 정리 (1시간 TTL)
cleanupTimestampRecord(data, 60 * 60 * 1000);

// Array<{timestamp: number}> 정리 (24시간 TTL)
cleanupArrayByTimestamp(items, 24 * 60 * 60 * 1000);
```
