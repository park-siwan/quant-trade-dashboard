/**
 * 차트 컴포넌트 공유 타입
 */

// Volume Profile 데이터 타입
export interface VolumeProfileData {
  buckets: Array<{ price: number; volume: number; buyVolume: number; sellVolume: number }>;
  maxVolume: number;
  poc: number; // Point of Control (최대 거래량 가격)
  vah: number; // Value Area High
  val: number; // Value Area Low
  minPrice: number;
  maxPrice: number;
}

// 실시간 캔들 데이터 타입
export interface RealtimeCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
}
