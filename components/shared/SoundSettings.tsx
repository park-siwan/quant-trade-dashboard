'use client';

import { useState, useEffect } from 'react';
import { Settings, Volume2, VolumeX, TrendingUp, TrendingDown } from 'lucide-react';
import { play8BitSound, play8BitTimeframe, play8BitAlert, get8BitVolume, set8BitVolume } from '@/hooks/useTTS';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

export default function SoundSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [selectedTf, setSelectedTf] = useState('15m');

  // 초기 볼륨 로드
  useEffect(() => {
    setVolume(get8BitVolume());
  }, []);

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    set8BitVolume(newVolume);
  };

  const testSound = (direction: 'bullish' | 'bearish') => {
    play8BitSound(direction, volume);
  };

  // 타임프레임 + 방향 통합 테스트
  const testCombined = (direction: 'bullish' | 'bearish') => {
    play8BitAlert(selectedTf, direction, volume);
  };

  return (
    <div className="relative">
      {/* 톱니바퀴 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
        title="사운드 설정"
      >
        <Settings className="w-4 h-4 text-zinc-400" />
      </button>

      {/* 설정 패널 */}
      {isOpen && (
        <>
          {/* 배경 클릭 시 닫기 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* 패널 */}
          <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 rounded-lg shadow-xl p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              8비트 사운드 설정
            </h3>

            {/* 볼륨 슬라이더 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">볼륨</span>
                <span className="text-xs text-zinc-500">{Math.round(volume * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume * 100}
                  onChange={(e) => handleVolumeChange(Number(e.target.value) / 100)}
                  className="flex-1 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-zinc-300
                    [&::-webkit-slider-thumb]:hover:bg-white
                    [&::-webkit-slider-thumb]:transition-colors"
                />
                <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
              </div>
            </div>

            {/* 테스트 버튼 */}
            <div className="space-y-2">
              <span className="text-xs text-zinc-400">테스트</span>
              <div className="flex gap-2">
                <button
                  onClick={() => testSound('bullish')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3
                    bg-green-500/20 hover:bg-green-500/30 border border-green-500/30
                    rounded-lg text-green-400 text-xs font-medium transition-colors"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  상승
                </button>
                <button
                  onClick={() => testSound('bearish')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3
                    bg-red-500/20 hover:bg-red-500/30 border border-red-500/30
                    rounded-lg text-red-400 text-xs font-medium transition-colors"
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  하락
                </button>
              </div>
            </div>

            {/* 조합 테스트 (타임프레임 + 방향) */}
            <div className="mt-3 space-y-2">
              <span className="text-xs text-zinc-400">조합 테스트</span>
              {/* 타임프레임 선택 */}
              <div className="flex gap-1 flex-wrap">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTf(tf)}
                    className={`py-1 px-2 rounded text-[10px] font-medium transition-colors border ${
                      selectedTf === tf
                        ? 'bg-blue-500/30 text-blue-300 border-blue-500/50'
                        : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50 hover:bg-zinc-700/50'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              {/* 방향 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={() => testCombined('bullish')}
                  className="flex-1 py-2 px-3 bg-green-500/20 hover:bg-green-500/30
                    border border-green-500/30 rounded-lg text-green-400 text-xs font-medium transition-colors"
                >
                  {selectedTf} 상승
                </button>
                <button
                  onClick={() => testCombined('bearish')}
                  className="flex-1 py-2 px-3 bg-red-500/20 hover:bg-red-500/30
                    border border-red-500/30 rounded-lg text-red-400 text-xs font-medium transition-colors"
                >
                  {selectedTf} 하락
                </button>
              </div>
            </div>

            {/* 안내 문구 */}
            <p className="mt-3 text-[10px] text-zinc-500 leading-relaxed">
              다이버전스 감지 시 자동으로 알림음이 재생됩니다
            </p>
          </div>
        </>
      )}
    </div>
  );
}
