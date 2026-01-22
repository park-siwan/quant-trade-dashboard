'use client';

import { useState, useEffect } from 'react';
import { BacktestParams } from '@/lib/backtest-api';

interface BacktestPanelProps {
  onRun: (params: BacktestParams) => void;
  isLoading: boolean;
  externalParams?: Partial<BacktestParams> | null;
}

export default function BacktestPanel({ onRun, isLoading, externalParams }: BacktestPanelProps) {
  const [params, setParams] = useState<BacktestParams>({
    symbol: 'BTC/USDT',
    timeframe: '5m',
    candleCount: 5000,
    indicators: ['rsi', 'obv', 'cvd', 'oi'],
    rsiPeriod: 14,
    pivotLeftBars: 5,
    pivotRightBars: 3,
    minDistance: 15,  // 15봉 이상 거리 (너무 짧은 거리 방지)
    maxDistance: 60,  // 60봉 이하 (5분봉 기준 5시간)
    takeProfitAtr: 2.0,
    stopLossAtr: 1.0,
    initialCapital: 1000,
    positionSizePercent: 100,
    slippage: 0.0002,  // 0.02% 슬리피지
    minDivergencePct: 20,  // 최소 20% 다이버전스 강도 (강한 신호만)
  });

  // 외부에서 파라미터가 변경되면 적용
  useEffect(() => {
    if (externalParams) {
      setParams(prev => ({ ...prev, ...externalParams }));
    }
  }, [externalParams]);

  const handleChange = (key: keyof BacktestParams, value: number | string | string[]) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRun(params);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 p-4 rounded-lg space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">백테스트 설정</h2>

      {/* 기본 설정 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">타임프레임</label>
          <select
            value={params.timeframe}
            onChange={e => handleChange('timeframe', e.target.value)}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700"
          >
            <option value="5m">5분</option>
            <option value="15m">15분</option>
            <option value="30m">30분</option>
            <option value="1h">1시간</option>
            <option value="4h">4시간</option>
            <option value="1d">1일</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">캔들 수</label>
          <input
            type="number"
            value={params.candleCount}
            onChange={e => handleChange('candleCount', parseInt(e.target.value))}
            min={100}
            max={5000}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">초기 자본</label>
          <input
            type="number"
            value={params.initialCapital}
            onChange={e => handleChange('initialCapital', parseInt(e.target.value))}
            min={1000}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700"
          />
        </div>
      </div>

      {/* 지표 선택 */}
      <div className="border-t border-zinc-700 pt-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">다이버전스 지표 선택</h3>
        <div className="flex flex-wrap gap-3">
          {['rsi', 'obv', 'cvd', 'oi'].map(indicator => (
            <label key={indicator} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.indicators?.includes(indicator) || false}
                onChange={e => {
                  const current = params.indicators || [];
                  if (e.target.checked) {
                    handleChange('indicators', [...current, indicator]);
                  } else {
                    handleChange('indicators', current.filter(i => i !== indicator));
                  }
                }}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-zinc-300 uppercase">{indicator}</span>
              <span className="text-xs text-zinc-500">
                {indicator === 'rsi' && '(RSI)'}
                {indicator === 'obv' && '(On Balance Volume)'}
                {indicator === 'cvd' && '(Volume Delta)'}
                {indicator === 'oi' && '(Open Interest)'}
              </span>
            </label>
          ))}
        </div>
        {params.indicators?.includes('oi') && (
          <p className="text-xs text-yellow-500 mt-2">
            * OI 데이터는 Binance에서 최대 30일만 제공됩니다
          </p>
        )}
      </div>

      {/* RSI 설정 */}
      <div className="border-t border-zinc-700 pt-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">다이버전스 파라미터</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">RSI 기간</label>
            <input
              type="number"
              value={params.rsiPeriod}
              onChange={e => handleChange('rsiPeriod', parseInt(e.target.value))}
              min={5}
              max={30}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">피봇 Left</label>
            <input
              type="number"
              value={params.pivotLeftBars}
              onChange={e => handleChange('pivotLeftBars', parseInt(e.target.value))}
              min={2}
              max={10}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">피봇 Right</label>
            <input
              type="number"
              value={params.pivotRightBars}
              onChange={e => handleChange('pivotRightBars', parseInt(e.target.value))}
              min={1}
              max={5}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">포지션 %</label>
            <input
              type="number"
              value={params.positionSizePercent}
              onChange={e => handleChange('positionSizePercent', parseInt(e.target.value))}
              min={1}
              max={100}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>
        </div>
      </div>

      {/* TP/SL 설정 */}
      <div className="border-t border-zinc-700 pt-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">TP/SL 설정 (ATR 배수)</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Take Profit</label>
            <input
              type="number"
              value={params.takeProfitAtr}
              onChange={e => handleChange('takeProfitAtr', parseFloat(e.target.value))}
              min={0.5}
              max={5}
              step={0.1}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Stop Loss</label>
            <input
              type="number"
              value={params.stopLossAtr}
              onChange={e => handleChange('stopLossAtr', parseFloat(e.target.value))}
              min={0.5}
              max={3}
              step={0.1}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">최소 거리</label>
            <input
              type="number"
              value={params.minDistance}
              onChange={e => handleChange('minDistance', parseInt(e.target.value))}
              min={3}
              max={50}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">최대 거리</label>
            <input
              type="number"
              value={params.maxDistance}
              onChange={e => handleChange('maxDistance', parseInt(e.target.value))}
              min={10}
              max={200}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>
        </div>
      </div>

      {/* 현실적 시뮬레이션 설정 */}
      <div className="border-t border-zinc-700 pt-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">현실 반영 설정</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              슬리피지 (%)
              <span className="text-zinc-500 ml-1">체결 가격 차이</span>
            </label>
            <input
              type="number"
              value={(params.slippage || 0) * 100}
              onChange={e => handleChange('slippage', parseFloat(e.target.value) / 100)}
              min={0}
              max={0.5}
              step={0.01}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              최소 다이버전스 강도 (%)
              <span className="text-zinc-500 ml-1">약한 신호 필터</span>
            </label>
            <input
              type="number"
              value={params.minDivergencePct || 0}
              onChange={e => handleChange('minDivergencePct', parseFloat(e.target.value))}
              min={0}
              max={100}
              step={5}
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          * 슬리피지: 주문 체결 시 불리한 방향으로 가격 차이 발생 (기본 0.02%)
          <br />
          * 다이버전스 강도: 가격과 지표의 변화율 차이, 높을수록 강한 신호만 진입
        </p>
      </div>

      {/* 실행 버튼 */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 text-white font-medium py-3 rounded-lg transition-colors"
      >
        {isLoading ? '백테스트 실행 중...' : '백테스트 실행'}
      </button>
    </form>
  );
}
