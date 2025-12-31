# Quant Trade 개선 TODO

## 우선순위 높음 (즉시 체감)

- [x] **Funding Rate 지표 추가** ✅ 완료
  - Binance Futures API 연동
  - 극단적 양수(0.1%+): 롱 과열 → 숏 기회
  - 극단적 음수(-0.1%-): 숏 과열 → 롱 기회
  - 다음 펀딩까지 카운트다운 표시
  - 신호 강도: STRONG/MEDIUM/WEAK

- [x] **Volume Profile 구현** ✅ 이미 구현됨
  - POC (Point of Control): 노란색 실선 - 목표가
  - VAH (Value Area High): 빨간색 점선 - 숏 진입 구간
  - VAL (Value Area Low): 초록색 점선 - 롱 진입 구간
  - 토글 버튼으로 표시/숨김 가능

## 우선순위 중간 (SMC 완성)

- [x] **BOS/CHoCH 시장 구조 감지** ✅ 완료
  - Break of Structure: 추세 지속 확인 (연한 색상)
  - Change of Character: 추세 전환 신호 (진한 색상 + 테두리)
  - 스윙 타입 분류: HH, HL, LH, LL
  - 현재 추세 판단: bullish / bearish / ranging

- [ ] **Liquidation Levels 청산 예상가**
  - Coinglass API 연동
  - 청산 '발생'이 아닌 '예상' 위치
  - 주요 청산 레벨 시각화

## 우선순위 낮음 (시스템 개선)

- [ ] **멀티 타임프레임 컨플루언스**
  - 5분봉 신호 + 1시간/4시간 추세 일치 여부
  - 상위 프레임 필터링으로 승률 향상

- [ ] **알림 시스템**
  - 텔레그램/디스코드 연동
  - 조건 충족 시 자동 알림

- [ ] **백테스팅 시스템**
  - 과거 데이터로 신호 검증
  - 신호별 승률/손익비 통계

---

## 완료

- [x] **Funding Rate 지표** (2024-12-31)
  - 백엔드: `/exchange/funding-rate` API
  - 프론트엔드: 헤더에 실시간 표시 + 카운트다운

- [x] **Volume Profile** (이미 구현됨)
  - POC, VAH, VAL 라인 표시
  - 토글 버튼으로 표시/숨김

- [x] **BOS/CHoCH 시장 구조** (2024-12-31)
  - 백엔드: 스윙 포인트 감지, 구조 돌파 분석
  - 프론트엔드: BOS/CHoCH 마커 + 헤더에 추세 표시
