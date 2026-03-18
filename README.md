# quant-trade-dashboard

실시간 암호화폐 데이터를 브라우저에서 끊김 없이 렌더링하는 **고성능 트레이딩 분석 대시보드**

---

## Overview

복잡한 금융 데이터를 직관적으로 전달하는 것이 핵심 목표였습니다.
다중 타임프레임의 실시간 데이터를 동시에 처리하면서도 UI가 버벅이지 않도록
렌더링 최적화와 데이터 파이프라인 설계에 집중했습니다.

---

## Screenshots

### 분석 — 다중 타임프레임 신호 분석
![분석 화면](https://github.com/park-siwan/resume/blob/main/img/%ED%80%80%ED%8A%B8%ED%8A%B8%EB%A0%88%EC%9D%B4%EB%94%A9%20%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C1.png)

### 차트 — 6개 타임프레임 동시 렌더링
![차트 화면](https://github.com/park-siwan/resume/blob/0f235d38396e1d7b4bc99b78fb7a961950d1a489/img/%ED%80%80%ED%8A%B8%ED%8A%B8%EB%A0%88%EC%9D%B4%EB%94%A9%20%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C2.png)

### 전략 — 실시간 포지션 및 전략 성과
![전략 화면](https://github.com/park-siwan/resume/blob/0f235d38396e1d7b4bc99b78fb7a961950d1a489/img/%ED%80%80%ED%8A%B8%ED%8A%B8%EB%A0%88%EC%9D%B4%EB%94%A9%20%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C3.png)

---

## 기술적 도전과 의사결정

### 1. WebSocket 기반 실시간 데이터 파이프라인
- 캔들 · OI(미결제약정) · 청산 데이터를 단일 WebSocket 커넥션으로 처리
- 구독/해지 패턴으로 불필요한 데이터 수신 최소화
- 연결 끊김 시 자동 재연결 및 데이터 복구 로직 구현

### 2. 고성능 차트 렌더링
- TradingView Lightweight Charts 기반 10+ 기술적 지표 동시 렌더링
- Canvas 기반 렌더링으로 DOM 업데이트 병목 회피
- 6개 타임프레임 차트를 동시에 그리면서도 60fps 유지

### 3. 복잡한 금융 정보의 정보 설계
- 다중 지표(RSI · ADX · CVD · OBV · OI · ATR)를 한 화면에 밀도 있게 배치
- 디자인 전공자의 시각으로 정보 위계 설계 — 색상·굵기·크기로 신호 강도 표현
- 트레이더가 빠르게 스캔할 수 있도록 테이블 레이아웃과 색상 코딩 최적화

---

## Tech Stack

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=flat-square)
![TradingView](https://img.shields.io/badge/TradingView_Charts-131722?style=flat-square)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

---

## Features

- **실시간 다중 타임프레임 분석** (5m · 15m · 30m · 1h · 4h · 1d)
- **신호 점수 시스템** — 다이버전스 · 모멘텀 · 거래량 · 지지저항 종합 스코어링
- **6분할 차트 뷰** — 전 타임프레임 동시 조망
- **전략 백테스팅 및 실시간 포지션 모니터링**
- **Walk-Forward 검증** — 과최적화 방지
