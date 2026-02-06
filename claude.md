# Claude Code 프로젝트 가이드 - 프론트엔드 (quant-trade-dashboard)

## 프로젝트 구조

```
{루트}/quant/
├── quant-trade/              # 백엔드 (NestJS) - 별도 GitHub 레포, port 3001
└── quant-trade-dashboard/    # 프론트엔드 (Next.js) ← 현재 레포, port 3000
```

**백엔드 수정 시**: `../quant-trade/` 경로 (별도 git 레포)

## 패키지 매니저 & 실행

```bash
pnpm install    # 의존성 설치
pnpm run dev    # 개발 서버 (port 3000, Turbopack)
```

## 프로젝트 개요

BTC 트레이딩 대시보드 - Next.js 16 + React 19 + TypeScript + lightweight-charts

### 주요 의존성
| 패키지 | 용도 |
|--------|------|
| `lightweight-charts` | 캔들 차트 렌더링 |
| `@tanstack/react-query` | 서버 상태 관리 |
| `jotai` | 클라이언트 상태 관리 |
| `recharts` | 통계 차트 (Rolling Sharpe 등) |
| `socket.io-client` | 실시간 WebSocket 통신 |
| `tailwindcss 4` | 스타일링 |

## 코드베이스 구조

### 핵심 디렉토리

```
app/                   # Next.js App Router 페이지
├── page.tsx               # 메인 대시보드 (실시간 차트)
├── chart/                 # 차트 전용 페이지
├── strategy/              # 전략 상세 페이지
└── layout.tsx             # 루트 레이아웃

components/
├── backtest/              # 백테스트 & 전략 UI (핵심 모듈)
│   ├── RealtimeChart.tsx      # 메인 실시간 차트 컴포넌트
│   ├── hooks/                 # 백테스트 전용 훅
│   │   ├── useBacktestRunner.ts   # 백테스트 실행 & 롤링 샤프 로드
│   │   ├── useStrategyList.ts     # 전략 목록 관리
│   │   ├── useChartData.ts        # 차트 데이터 관리
│   │   ├── useMarkerGeneration.ts # 매매 마커 생성
│   │   ├── useRealtimeUpdates.ts  # 실시간 업데이트
│   │   ├── usePositionAlerts.ts   # 포지션 알림
│   │   └── useSoundAlerts.ts      # 사운드 알림
│   ├── chart/                 # 백테스트 차트 컴포넌트
│   ├── strategy/              # 전략 관련 UI
│   ├── trade/                 # 매매 관련 UI
│   └── ui/                    # 공통 UI 요소
│
├── chart/                 # 범용 차트 컴포넌트
│   ├── ChartRenderer.tsx      # 메인 차트 렌더러
│   ├── ChartMarkers.tsx       # 마커 컴포넌트
│   └── MeasurementBox.tsx     # 측정 도구
│
├── layout/                # 레이아웃 컴포넌트
├── shared/                # 공유 컴포넌트
└── debug/                 # 디버그 도구

lib/                   # 유틸리티, 상수, API (탐색 우선순위 높음)
├── backtest-api.ts        # 백엔드 API 호출 함수 (핵심)
├── colors.ts              # 색상 상수 (COLORS, CHART_COLORS)
├── constants.ts           # 매직 넘버 (ANIMATION, WEBSOCKET, API)
├── classnames.ts          # Tailwind 조건부 클래스
├── thresholds.ts          # 점수/임계값 상수
├── storage.ts             # localStorage 유틸리티
├── symbols.ts             # 심볼 정의
├── timeframe.ts           # 타임프레임 유틸
├── format.ts              # 포맷팅 유틸
├── config.ts              # 앱 설정
└── chart/                 # 차트 관련 모듈
    ├── chartConfig.ts         # 차트 옵션, 테마
    └── indicators.ts          # 지표 추가 함수
```

### 주요 파일 탐색 가이드

| 찾고자 하는 것 | 파일 |
|---------------|------|
| 백엔드 API 호출 | `lib/backtest-api.ts` |
| 전략 목록 로딩 | `components/backtest/hooks/useStrategyList.ts` |
| 롤링 샤프 데이터 | `components/backtest/hooks/useBacktestRunner.ts` |
| 색상 상수 | `lib/colors.ts` |
| 타이밍/딜레이 | `lib/constants.ts` |
| 점수 임계값 | `lib/thresholds.ts` |
| 차트 설정 | `lib/chart/chartConfig.ts` |

## 백엔드 API 연동

```typescript
// lib/backtest-api.ts 에서 주요 함수들
fetchStrategyPreviews(symbol, timeframe, candleCount)  // 전략 목록 프리뷰
getDailyRollingSharpeTimeline(symbol, timeframe, weeks, windowDays)  // 롤링 샤프
```

백엔드 주소: `http://localhost:3001` (lib/config.ts)

## 작업 규칙

- **작업 완료 시 반드시 커밋 & 푸시**
- 커밋 메시지: 영문 접두사 (feat/fix/perf/refactor/chore) + 설명

## 코드 작성 가이드

### 색상 사용

```typescript
// Bad - 하드코딩
color: 'rgba(34, 197, 94, 0.3)';

// Good - 중앙화된 상수
import { CHART_COLORS, rgba, COLORS } from '@/lib/colors';
color: CHART_COLORS.CANDLE_UP;
color: rgba(COLORS.LONG, 0.3);
```

### 조건부 Tailwind 클래스

```typescript
// Bad
className={isLong ? 'text-green-400' : 'text-red-400'}

// Good
import { directionText, directionBg } from '@/lib/classnames';
className={directionText(isLong)}
```

### localStorage 접근

```typescript
import { loadFromStorage, saveToStorage } from '@/lib/storage';
const data = loadFromStorage(KEY, defaultValue, cleanupFn);
```

### 매직 넘버

```typescript
import { ANIMATION, WEBSOCKET } from '@/lib/constants';
setTimeout(() => {}, ANIMATION.COLOR_FADE);
```

## 코딩 규칙

- 한 파일은 300줄을 넘기지 말 것
- try-catch 폴백 대신 에러를 명시적으로 throw할 것
- 새 기능 추가 시 기존 파일에 붙이지 말고 모듈 분리할 것
- 폴백 로직 생성 금지, 실패 시 명확한 에러 메시지 출력
