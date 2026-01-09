# Quant Trade - 암호화폐 선물 트레이딩 분석 시스템

## 프로젝트 개요

암호화폐 선물 거래의 **진입 타점** 판단을 돕는 기술적 분석 대시보드입니다.

### 기술 스택
- **백엔드**: NestJS + TypeScript (Bybit/Binance API 연동)
- **프론트엔드**: Next.js 16 + React 19 + TailwindCSS
- **차트**: TradingView Lightweight Charts
- **실시간 데이터**: WebSocket (청산, 고래 거래, 캔들)
- **상태 관리**: TanStack Query (React Query)

### 지원 거래소
- Bybit (캔들, 오더북, Long/Short Ratio)
- Binance Futures (OI, 청산, 고래 거래, 펀딩레이트)

---

## 1. 기술적 지표 시스템

### 1.1 모멘텀 지표

| 지표 | 구현 방식 | 매매 활용 |
|------|----------|----------|
| **RSI (14)** | technicalindicators 라이브러리 | 30 이하=과매도(롱), 70 이상=과매수(숏) |
| **OBV** | 거래량 누적 (종가 상승시 +, 하락시 -) | 가격-OBV 방향 불일치 = 추세 전환 |
| **CVD** | 캔들 내 매수/매도 비율로 거래량 분배 | 실제 매수/매도 세력 파악 |

**CVD 계산 로직 (특이점)**
```
closePosition = (close - low) / (high - low)  // 0~1
buyVolume = volume * closePosition
sellVolume = volume * (1 - closePosition)
delta = buyVolume - sellVolume
CVD = 누적(delta)
```

### 1.2 추세 지표

| 지표 | 구현 | 활용 |
|------|------|------|
| **EMA 20/50/200** | technicalindicators | 정배열=상승, 역배열=하락 |
| **VWAP** | 일간 리셋 방식 (TP×V 누적 / V 누적) | 기관 매매 기준선 |
| **ADX (14)** | Wilder's Smoothing | 25 이상=추세장, 40 이상=강한 추세 |

**추세 판단 로직**
```
bullish: 가격 > EMA200 AND EMA20 > EMA50
bearish: 가격 < EMA200 AND EMA20 < EMA50
neutral: 그 외
```

### 1.3 변동성 지표

| 지표 | 구현 | 활용 |
|------|------|------|
| **ATR (14)** | True Range의 Wilder's EMA | 손절: 2×ATR |
| **ATR Ratio** | 현재 ATR / 50캔들 평균 ATR | 1.0=평균, 1.5=고변동성 |

### 1.4 선물 전용 지표

| 지표 | 데이터 소스 | 활용 |
|------|------------|------|
| **OI (미결제약정)** | Binance Futures API | OI↑+가격↑=진정한 상승 |
| **Long/Short Ratio** | Bybit API | 극단적 쏠림 시 반대매매 |
| **펀딩레이트** | Binance Futures API | ±0.1% 이상=과열, 반대매매 |

**OI 정규화 방식 (특이점)**
```
ROC = ((현재OI - 이전OI) / 이전OI) × 100 × 100
정규화OI = 누적(ROC)  // CVD처럼 추세 시각화
```

---

## 2. 다이버전스 감지 시스템

### 2.1 감지 알고리즘

**스윙 포인트 탐지**
- leftBars=5, rightBars=5, minRightBars=2
- 로컬 고점/저점 식별

**다이버전스 판정 조건**
```
Bullish: 가격 저점↓ + 지표 저점↑ (최소 0.3% 가격 변화)
Bearish: 가격 고점↑ + 지표 고점↓ (최소 0.3% 가격 변화)
거리 제한: 5~200 캔들
```

### 2.2 지원 다이버전스 타입
- RSI 다이버전스
- OBV 다이버전스
- CVD 다이버전스
- OI 다이버전스

### 2.3 필터링 시스템

**ADX 필터 (추세장 역추세 신호 제거)**
```
조건: ADX >= 25 AND DI 차이 > 5
상승추세에서 Bearish 다이버전스 → 필터링
하락추세에서 Bullish 다이버전스 → 필터링
```

**EMA 필터 (신호 강도 분류)**
```
Strong: 다이버전스 + 크로스오버 + 추세 일치 → 5x 레버리지
Medium: 중립 추세 → 3x 레버리지
Invalid: 역추세 진입 → Skip
```

### 2.4 시각화
- 시작점(start), 끝점(end), 진입점(entry) 마커
- 다이버전스 라인 연결 (점선)

---

## 3. 시장 구조 분석 (SMC)

### 3.1 BOS (Break of Structure)
- **상승 BOS**: 이전 고점(HH) 돌파 → 추세 지속 확인
- **하락 BOS**: 이전 저점(LL) 돌파 → 추세 지속 확인

### 3.2 CHoCH (Change of Character)
- **상승 CHoCH**: LH(Lower High) 상향 돌파 → 하락→상승 전환
- **하락 CHoCH**: HL(Higher Low) 하향 돌파 → 상승→하락 전환

**CHoCH 유효성 필터**
```
상승 CHoCH: 저점 RSI <= 35 (과매도)
하락 CHoCH: 고점 RSI >= 65 (과매수)
ADX 필터: 강한 추세(ADX>=25)에서 역추세 CHoCH 필터링
```

### 3.3 스윙 타입 분류
- HH (Higher High), HL (Higher Low)
- LH (Lower High), LL (Lower Low)

---

## 4. 오더블록 (Order Block)

### 4.1 감지 로직
```
Bullish OB: 강한 상승 임펄스(ATR×1.5) 직전 마지막 하락 캔들
Bearish OB: 강한 하락 임펄스(ATR×1.5) 직전 마지막 상승 캔들
```

### 4.2 강도 분류
- **Strong**: ATR의 2배 이상 임펄스
- **Medium**: ATR의 1.5배 이상
- **Weak**: 그 이하

### 4.3 활성화 상태
- 종가가 오더블록을 완전히 돌파하면 비활성화
- 현재가 기준 위 1개, 아래 2개만 표시

---

## 5. CVD + OI + Price 3중 신호

| 신호 | 가격 | CVD | OI | 의미 |
|------|------|-----|----|----|
| **REAL_BULL** | ↑ | ↑ | ↑ | 진정한 상승 (신규매수+실매수) |
| **SHORT_TRAP** | ↑ | ↓ | ↑ | 숏 청산 유도 상승 |
| **PUMP_DUMP** | ↑ | ↓ | ↓ | 청산 기반 펌핑 (곧 하락) |
| **MORE_DROP** | ↓ | ↓ | ↑ | 정당한 하락 (신규 숏) |
| **LONG_ENTRY** | ↓ | ↑ | ↓ | 저점 매수 타점 |

**방향 감지 임계값 (타임프레임별)**
```
5m: ±1%
15m: ±1.5%
30m+: ±2%
lookback: 10캔들
minGap: 30캔들 (중복 방지)
```

---

## 6. 횡보(Consolidation) 감지

### 6.1 감지 조건
```
변동폭 <= 2%
최소 캔들 수 >= 20
```

### 6.2 활용
- 횡보 구간 박스 시각화
- 현재 진행 중 횡보 경고 → Breakout 대비

---

## 7. 실시간 데이터 (WebSocket)

### 7.1 청산 (Liquidation)
- **소스**: Binance Futures `wss://fstream.binance.com/ws/!forceOrder@arr`
- **임계값**: 모든 청산 표시
- **통계**: 1분/5분/15분 롱/숏 청산 금액

### 7.2 고래 거래 (Whale Trades)
- **소스**: Binance Futures aggTrade
- **임계값**: $50K 이상
- **심볼**: BTCUSDT, ETHUSDT

### 7.3 실시간 캔들
- WebSocket으로 현재 캔들 실시간 업데이트
- 캔들 종료 시 자동 새로고침

---

## 8. 호가창 분석 (Order Book)

### 8.1 매수/매도벽 감지
- **소스**: Bybit API (depth 200)
- **Major Wall**: 평균 물량의 3배 이상
- **Minor Wall**: 평균 물량의 2배 이상
- 현재가 ±5% 이내, 상위 3개만 표시

### 8.2 호가 비율
```
bidAskRatio = 총매수물량 / 총매도물량
> 1.0: 매수 우세
< 1.0: 매도 우세
```

---

## 9. Volume Profile

### 9.1 계산 방식
- 가격 범위를 20개 구간으로 분할
- 각 캔들이 구간에 걸친 비율만큼 볼륨 배분

### 9.2 주요 지표
- **POC (Point of Control)**: 최대 거래량 가격
- **VAH (Value Area High)**: 70% 거래량 상단
- **VAL (Value Area Low)**: 70% 거래량 하단

---

## 10. 외부 데이터 연동

### 10.1 펀딩레이트 (Binance)
```
극단적 양수 (>=0.1%): 롱 과열 → 숏 기회
극단적 음수 (<=-0.1%): 숏 과열 → 롱 기회
```

### 10.2 Coinglass 데이터
- Fear & Greed Index (공포탐욕 지수)
- 청산 편향 (롱/숏 청산 비율)
- ETF 트렌드 (유입/유출)
- Bull Market Peak Risk

---

## 11. UI/UX 특징

### 11.1 대시보드 구성
- 메인 차트 (캔들 + EMA + VWAP + 오더블록)
- RSI/OBV/CVD/OI 하단 패널
- 오더북 플로팅 패널 (DOM 뷰)
- 실시간 청산/고래 거래 마커

### 11.2 타임프레임
- 5분, 15분, 30분, 1시간, 4시간, 1일
- 타임프레임별 자동 새로고침

### 11.3 시각적 표시
- 다이버전스: 점선 + 마커
- 골든/데드크로스: ✕ 마커 (EMA 50/200 기준, 볼륨 필터링 적용)
- CHoCH/BOS: 텍스트 마커
- 오더블록: 반투명 박스
- 횡보: 배경 박스

### 11.4 골든크로스 / 데드크로스
- **골든크로스**: EMA 50이 EMA 200을 상향 돌파 → 중장기 상승 추세 전환
- **데드크로스**: EMA 50이 EMA 200을 하향 돌파 → 중장기 하락 추세 전환
- 전통적인 50/200 기준 적용 (단기 트레이딩용 20/50 대신)

---

## 12. API 엔드포인트

### 12.1 메인 분석
```
GET /exchange/candles/analyze
Query: symbol, timeframe, limit

Response: {
  candles, indicators, signals, summary,
  trendAnalysis, crossoverEvents,
  cvdOi, consolidation, vwapAtr,
  orderBlocks, orderBook, marketStructure, adx
}
```

### 12.2 실시간 데이터
```
GET /exchange/liquidations?symbol=BTC/USDT
GET /exchange/whales?symbol=BTC/USDT
```

---

## 13. 현재 상태 및 제한사항

### 13.1 데이터 제한
- **OI**: Binance 30일 제한 → 긴 타임프레임에서 데이터 부족
- **청산/고래**: 앱 실행 이후 데이터만 수집 (히스토리 없음)

### 13.2 지원 심볼
- 현재 BTC/USDT 중심 최적화
- ETH/USDT 고래 거래만 추가 지원

### 13.3 알고리즘 특성
- 다이버전스: 후행 지표 (확인 후 표시)
- CHoCH: RSI 과열 조건으로 필터링
- 오더블록: 임펄스 강도 기반 (약한 임펄스는 감지 안됨)

---

## 14. 아키텍처 개요

```
[Binance/Bybit API] → [NestJS Backend]
                           ↓
                    [분석 서비스들]
                    - DivergenceService
                    - MarketStructureService
                    - OrderBlockService
                    - CvdOiService
                    - ConsolidationService
                    - VwapAtrService
                    - AdxService
                    - LiquidationService (WebSocket)
                    - WhaleService (WebSocket)
                    - OrderBookService
                    - FundingRateService
                           ↓
                    [REST API + WebSocket]
                           ↓
                    [Next.js Frontend]
                    - React Query (캐싱)
                    - Lightweight Charts
                    - 실시간 업데이트
```

---

*이 문서는 Claude Code에서 프로젝트 분석 후 자동 생성되었습니다.*
*강점/약점 분석 및 개선 아이디어 도출에 활용하세요.*
