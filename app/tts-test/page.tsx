'use client';

import { useState, useEffect, useRef } from 'react';

// 숫자 → 한글 음성 파일 매핑
const ONES_MAP: Record<number, string> = {
  1: '일', 2: '이', 3: '삼', 4: '사', 5: '오',
  6: '육', 7: '칠', 8: '팔', 9: '구',
};

// 일의 자리 + 점 (연결된 파일)
const ONES_POINT_MAP: Record<number, string> = {
  1: '일점', 2: '이점', 3: '삼점', 4: '사점', 5: '오점',
  6: '육점', 7: '칠점', 8: '팔점', 9: '구점',
};

const TENS_MAP: Record<number, string> = {
  1: '십', 2: '이십', 3: '삼십', 4: '사십', 5: '오십',
  6: '육십', 7: '칠십', 8: '팔십', 9: '구십',
};

// 숫자를 한글 음성 파일 배열로 변환 (예: 72 → ['칠십', '이'])
function numberToAudioFiles(num: number): string[] {
  if (num < 1 || num > 100) return [];

  // 100점
  if (num === 100) return ['백'];

  const files: string[] = [];
  const tens = Math.floor(num / 10);
  const ones = num % 10;

  // 십의 자리: 이십, 삼십, ... 칠십 (하나의 파일)
  if (tens > 0) {
    files.push(TENS_MAP[tens]);
  }

  // 일의 자리: 일, 이, 삼...
  if (ones > 0) {
    files.push(ONES_MAP[ones]);
  }

  return files;
}

// 점수를 "XX점" 형태로 변환 (예: 72 → ['칠십', '이점'], 50 → ['오십', '점'])
function scoreToAudioFiles(num: number): string[] {
  if (num < 1 || num > 100) return [];

  // 100점
  if (num === 100) return ['백', '점'];

  const files: string[] = [];
  const tens = Math.floor(num / 10);
  const ones = num % 10;

  // 십의 자리
  if (tens > 0) {
    files.push(TENS_MAP[tens]);
  }

  // 일의 자리 + 점 (연결)
  if (ones > 0) {
    files.push(ONES_POINT_MAP[ones]); // "이점", "삼점" 등
  } else {
    files.push('점'); // 50점, 60점 등은 그냥 "점"
  }

  return files;
}

export default function TTSTestPage() {
  const [text, setText] = useState('롱 진입 타점입니다. 72점, 손익비 1대 3.');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [testNumber, setTestNumber] = useState(72);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState(1.0); // 재생 속도
  const [overlap, setOverlap] = useState(0); // 오버랩 (ms) - 다음 파일 미리 시작
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 예시 문장들
  const examples = [
    '롱 진입 타점입니다. 72점, 손익비 1대 3.',
    '숏 진입 타점입니다. 65점, 손익비 1대 2.',
    '롱 신호 감지. 54점. 소량 진입 고려하세요.',
    '5분봉 상승 다이버전스 감지. 롱 준비하세요.',
    '15분봉 하락 다이버전스. 숏 대기.',
    '가격이 지지선에 접근 중입니다. 롱 준비.',
    '저항선 터치 임박. 숏 타점 확인하세요.',
    '강한 롱 신호입니다. 78점. 다이버전스와 지지선 동시 확인.',
    '주의. 역방향 다이버전스 감지. 손절 확인하세요.',
    '대기 조건 충족. 롱 진입 가능. 57점.',
  ];

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      // 한국어 음성만 필터링
      const koreanVoices = availableVoices.filter(v => v.lang.includes('ko'));
      setVoices(koreanVoices.length > 0 ? koreanVoices : availableVoices);

      // 기본 한국어 여자 목소리 선택
      const defaultVoice = koreanVoices.find(v =>
        v.lang.includes('ko') && (v.name.includes('Female') || v.name.includes('여'))
      ) || koreanVoices[0];

      if (defaultVoice) {
        setSelectedVoice(defaultVoice.name);
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speak = (textToSpeak?: string) => {
    const utterance = new SpeechSynthesisUtterance(textToSpeak || text);
    utterance.lang = 'ko-KR';
    utterance.rate = rate;
    utterance.pitch = pitch;

    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) {
      utterance.voice = voice;
    }

    speechSynthesis.cancel(); // 이전 음성 중단
    speechSynthesis.speak(utterance);
  };

  const stop = () => {
    speechSynthesis.cancel();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">🔊 TTS 테스트</h1>

        {/* 텍스트 입력 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">알림 문구</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white"
            rows={3}
          />
        </div>

        {/* 음성 선택 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">
            음성 선택 ({voices.length}개 사용 가능)
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white"
          >
            {voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </div>

        {/* 속도 & 피치 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              속도: {rate.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              피치: {pitch.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        {/* 재생 버튼 */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => speak()}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg"
          >
            ▶️ 재생
          </button>
          <button
            onClick={stop}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg"
          >
            ⏹️ 중지
          </button>
        </div>

        {/* 예시 문장 */}
        <div>
          <h2 className="text-lg font-semibold mb-4">📝 예시 문장 (클릭하면 재생)</h2>
          <div className="space-y-2">
            {examples.map((example, index) => (
              <button
                key={index}
                onClick={() => {
                  setText(example);
                  speak(example);
                }}
                className="w-full text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-sm"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* 다이버전스 알림 테스트 */}
        <div className="mt-8 p-4 bg-purple-900/30 border border-purple-700 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">📊 다이버전스 알림 테스트</h2>
          <div className="grid grid-cols-2 gap-2">
            {['5분봉', '15분봉', '1시간봉', '4시간봉'].map((tf) => (
              [{ label: '상승', value: 'bullish' }, { label: '하락', value: 'bearish' }].map((dir) => (
                <button
                  key={`${tf}-${dir.value}`}
                  onClick={() => playDivergenceAlert(tf, dir.value as 'bullish' | 'bearish')}
                  disabled={isPlaying}
                  className={`py-2 px-3 rounded text-sm ${
                    dir.value === 'bullish'
                      ? 'bg-green-700 hover:bg-green-600'
                      : 'bg-red-700 hover:bg-red-600'
                  } disabled:bg-gray-700`}
                >
                  {tf} {dir.label} 다이버전스
                </button>
              ))
            )).flat()}
          </div>
        </div>

        {/* 진입 타점 알림 테스트 */}
        <div className="mt-8 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">🎯 진입 타점 알림 테스트</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => playEntryAlert('long', 72, 3)}
              disabled={isPlaying}
              className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 py-3 px-4 rounded"
            >
              롱 진입 (72점, 손익비 1:3)
            </button>
            <button
              onClick={() => playEntryAlert('short', 65, 2)}
              disabled={isPlaying}
              className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 py-3 px-4 rounded"
            >
              숏 진입 (65점, 손익비 1:2)
            </button>
            <button
              onClick={() => playStrongSignal('long')}
              disabled={isPlaying}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 py-3 px-4 rounded"
            >
              강한 롱 신호
            </button>
            <button
              onClick={() => playStrongSignal('short')}
              disabled={isPlaying}
              className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 py-3 px-4 rounded"
            >
              강한 숏 신호
            </button>
          </div>
        </div>

        {/* 클로바 음성 조합 테스트 */}
        <div className="mt-8 p-4 bg-green-900/30 border border-green-700 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">🔢 숫자 조합 테스트</h2>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">숫자 입력 (1-99)</label>
            <div className="flex gap-4">
              <input
                type="number"
                min="1"
                max="99"
                value={testNumber}
                onChange={(e) => setTestNumber(parseInt(e.target.value) || 1)}
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white"
              />
              <button
                onClick={() => playNumberSequence(testNumber)}
                disabled={isPlaying}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg"
              >
                {isPlaying ? '재생 중...' : `▶️ "${testNumber}" 재생`}
              </button>
            </div>
          </div>

          <div className="text-sm text-gray-400 mb-4">
            <p>조합: {numberToAudioFiles(testNumber).join(' + ')}.mp3</p>
          </div>

          {/* 속도 & 오버랩 조절 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                재생 속도: {audioSpeed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="1.0"
                max="2.0"
                step="0.1"
                value={audioSpeed}
                onChange={(e) => setAudioSpeed(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                오버랩: {overlap}ms
              </label>
              <input
                type="range"
                min="0"
                max="300"
                step="50"
                value={overlap}
                onChange={(e) => setOverlap(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* 빠른 테스트 버튼 */}
          <div className="grid grid-cols-5 gap-2">
            {[35, 42, 50, 54, 60, 65, 72, 78, 85, 99].map((num) => (
              <button
                key={num}
                onClick={() => {
                  setTestNumber(num);
                  playNumberSequence(num);
                }}
                disabled={isPlaying}
                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white py-2 px-3 rounded text-sm"
              >
                {num}점
              </button>
            ))}
          </div>
        </div>

        {/* 팁 */}
        <div className="mt-8 p-4 bg-gray-800 rounded-lg text-sm text-gray-400">
          <p className="font-semibold text-white mb-2">💡 팁</p>
          <ul className="list-disc list-inside space-y-1">
            <li>macOS: &quot;Yuna&quot; 목소리가 한국어 여자 음성</li>
            <li>Windows: &quot;Microsoft Heami&quot; 또는 &quot;Microsoft SunHi&quot;</li>
            <li>속도 1.1~1.2가 알림용으로 적당</li>
            <li>한국어 음성이 없으면 시스템 설정에서 추가 필요</li>
          </ul>
        </div>
      </div>
    </div>
  );

  // 숫자 음성 파일 순차 재생 (오버랩 적용)
  async function playNumberSequence(num: number) {
    const files = numberToAudioFiles(num);
    if (files.length === 0) return;

    setIsPlaying(true);

    for (let i = 0; i < files.length; i++) {
      const isLast = i === files.length - 1;
      await playAudioFile(`/audio/${files[i]}.mp3`, isLast ? 0 : overlap);
    }

    setIsPlaying(false);
  }

  // 단일 오디오 파일 재생 (Promise) - 속도 & 오버랩 적용
  function playAudioFile(src: string, overlapMs: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.playbackRate = audioSpeed; // 재생 속도 적용

      // 오버랩: 파일 끝나기 전에 resolve (다음 파일 시작)
      if (overlapMs > 0) {
        audio.onloadedmetadata = () => {
          const duration = (audio.duration * 1000) / audioSpeed;
          const resolveTime = Math.max(0, duration - overlapMs);
          setTimeout(() => resolve(), resolveTime);
        };
      } else {
        audio.onended = () => resolve();
      }

      audio.onerror = () => reject(new Error(`Failed to play ${src}`));
      audio.play().catch(reject);
    });
  }

  // 다이버전스 알림 재생
  // "5분봉 하락 다이버전스입니다. 숏준비 해보세요. 추세력이 약합니다."
  async function playDivergenceAlert(timeframe: string, direction: 'bullish' | 'bearish') {
    const dirText = direction === 'bullish' ? '상승' : '하락';
    const actionFile = direction === 'bullish' ? '롱준비_해보세요' : '숏준비_해보세요';

    const files = [
      `${timeframe}`,
      dirText,
      '다이버전스입니다',
      actionFile,
      '추세력이_약합니다',
    ];

    setIsPlaying(true);
    for (let i = 0; i < files.length; i++) {
      const isLast = i === files.length - 1;
      await playAudioFile(`/audio/${files[i]}.mp3`, isLast ? 0 : overlap);
    }
    setIsPlaying(false);
  }

  // 진입 타점 알림 재생
  // "롱 진입 타점입니다. 72점. 손익비 1대 3."
  async function playEntryAlert(direction: 'long' | 'short', score: number, rr: number) {
    const entryFile = direction === 'long' ? '롱_타점입니다' : '숏_타점입니다';
    const scoreFiles = scoreToAudioFiles(score); // "칠십 + 이점" 형태
    const rrFiles = numberToAudioFiles(rr);

    const files = [
      entryFile,  // 통째로 연결된 파일
      ...scoreFiles, // 점수 + 점 포함
      '손익비',
      '일_대',
      ...rrFiles,
      '진입_고려해보세요',
    ];

    setIsPlaying(true);
    for (let i = 0; i < files.length; i++) {
      const isLast = i === files.length - 1;
      await playAudioFile(`/audio/${files[i]}.mp3`, isLast ? 0 : overlap);
    }
    setIsPlaying(false);
  }

  // 강한 신호 알림 (둘 다 1파일)
  async function playStrongSignal(direction: 'long' | 'short') {
    const file = direction === 'long'
      ? '강한_롱_신호입니다_확인하세요'
      : '강한_숏_신호입니다_확인하세요';

    const files = [file];

    setIsPlaying(true);
    for (let i = 0; i < files.length; i++) {
      const isLast = i === files.length - 1;
      await playAudioFile(`/audio/${files[i]}.mp3`, isLast ? 0 : overlap);
    }
    setIsPlaying(false);
  }
}
