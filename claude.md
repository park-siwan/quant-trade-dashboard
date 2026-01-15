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

## Claude Code 탐색 최적화

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
