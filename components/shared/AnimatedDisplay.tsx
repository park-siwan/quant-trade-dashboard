'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { ANIMATION } from '@/lib/constants';

// 애니메이션 타이밍 상수 (로컬 단축 참조)
const ANIMATION_DURATION = {
  DIGIT_SPIN: ANIMATION.DIGIT_SPIN,
  COLOR_FADE: ANIMATION.COLOR_FADE,
  INTERPOLATE: ANIMATION.VALUE_INTERPOLATE,
} as const;

type Direction = 'up' | 'down' | null;
type Size = 'small' | 'normal' | 'large';

// 사이즈별 클래스
const SIZE_CLASSES: Record<Size, string> = {
  small: 'w-[0.5em] h-[1.1em]',
  normal: 'w-[0.6em] h-[1.2em]',
  large: 'w-[0.65em] h-[1.3em]',
};

/**
 * 개별 숫자 슬롯 컴포넌트 (공항 전광판 스타일)
 */
export const DigitSlot = memo(({
  digit,
  direction,
  size = 'normal'
}: {
  digit: string;
  direction: Direction;
  size?: Size;
}) => {
  const [currentDigit, setCurrentDigit] = useState(digit);
  const [prevDigit, setPrevDigit] = useState(digit);
  const [isSpinning, setIsSpinning] = useState(false);
  const prevDigitRef = useRef(digit);

  useEffect(() => {
    if (prevDigitRef.current !== digit) {
      setPrevDigit(prevDigitRef.current);
      setCurrentDigit(digit);
      setIsSpinning(true);
      prevDigitRef.current = digit;

      const timer = setTimeout(() => setIsSpinning(false), ANIMATION_DURATION.DIGIT_SPIN);
      return () => clearTimeout(timer);
    }
  }, [digit]);

  // 숫자가 아니면 그냥 표시 ($ , . 등)
  if (!/\d/.test(digit)) {
    return <span className="inline-flex items-center justify-center">{digit}</span>;
  }

  return (
    <span className={`inline-block ${SIZE_CLASSES[size]} overflow-hidden relative`}>
      {isSpinning && (
        <span
          className={`absolute inset-0 flex items-center justify-center ${
            direction === 'up' ? 'animate-digit-out-up' : 'animate-digit-out-down'
          }`}
        >
          {prevDigit}
        </span>
      )}
      <span
        className={`flex items-center justify-center ${
          isSpinning
            ? direction === 'up'
              ? 'animate-digit-in-up'
              : 'animate-digit-in-down'
            : ''
        }`}
      >
        {currentDigit}
      </span>
    </span>
  );
});
DigitSlot.displayName = 'DigitSlot';

/**
 * 숫자 변화 방향 감지 훅
 */
function useValueDirection(value: number) {
  const [direction, setDirection] = useState<Direction>(null);
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current !== value) {
      setDirection(value > previousValue.current ? 'up' : 'down');
      previousValue.current = value;

      const timer = setTimeout(() => setDirection(null), ANIMATION_DURATION.COLOR_FADE);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return direction;
}

/**
 * 애니메이션 가격 표시 (prefix/suffix 지원)
 */
export const AnimatedPrice = memo(({
  value,
  prefix = '$',
  suffix = '',
  decimals = 0,
  className = '',
  colorize = true,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  colorize?: boolean;
}) => {
  const direction = useValueDirection(value);
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const colorClass = colorize
    ? direction === 'up'
      ? 'text-green-400'
      : direction === 'down'
        ? 'text-red-400'
        : ''
    : '';

  return (
    <span className={`inline-flex items-center font-mono transition-colors duration-300 ${colorClass} ${className}`}>
      {prefix && <span className="inline-flex items-center">{prefix}</span>}
      {formatted.split('').map((char, i) => (
        <DigitSlot key={i} digit={char} direction={direction} size="normal" />
      ))}
      {suffix && <span className="inline-flex items-center">{suffix}</span>}
    </span>
  );
});
AnimatedPrice.displayName = 'AnimatedPrice';

/**
 * 애니메이션 숫자 표시 (점수 등)
 */
export const AnimatedNumber = memo(({
  value,
  className = '',
  size = 'large',
}: {
  value: number;
  className?: string;
  size?: Size;
}) => {
  const direction = useValueDirection(value);
  const valueStr = String(value);

  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      {valueStr.split('').map((char, i) => (
        <DigitSlot key={i} digit={char} direction={direction} size={size} />
      ))}
    </span>
  );
});
AnimatedNumber.displayName = 'AnimatedNumber';

/**
 * 애니메이션 퍼센트 표시
 */
export const AnimatedPercent = memo(({
  value,
  showSign = true,
  decimals = 0,
  className = '',
  colorize = true,
}: {
  value: number;
  showSign?: boolean;
  decimals?: number;
  className?: string;
  colorize?: boolean;
}) => {
  const direction = useValueDirection(value);
  const formatted = Math.abs(value).toFixed(decimals);
  const sign = showSign ? (value >= 0 ? '+' : '-') : '';

  const colorClass = colorize
    ? direction === 'up'
      ? 'text-green-400'
      : direction === 'down'
        ? 'text-red-400'
        : ''
    : '';

  return (
    <span className={`inline-flex items-baseline justify-center ${colorClass} ${className}`}>
      {sign && <span className="inline-flex items-center">{sign}</span>}
      {formatted.split('').map((char, i) => (
        <DigitSlot key={i} digit={char} direction={direction} size="normal" />
      ))}
      <span className="inline-flex items-center">%</span>
    </span>
  );
});
AnimatedPercent.displayName = 'AnimatedPercent';

/**
 * 부드러운 보간 애니메이션 값 (requestAnimationFrame 사용)
 * MTFOverview의 지표값 표시용
 */
export const AnimatedValue = memo(({
  value,
  decimals = 0,
  className = '',
  suffix = '',
}: {
  value: number | null;
  decimals?: number;
  className?: string;
  suffix?: string;
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [prevDisplayValue, setPrevDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<Direction>(null);
  const previousValue = useRef(value);

  useEffect(() => {
    if (value === null || previousValue.current === null) {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }
    if (previousValue.current === value) return;

    const startValue = previousValue.current;
    const endValue = value;
    const duration = ANIMATION_DURATION.INTERPOLATE;
    const startTime = performance.now();

    const newDirection = endValue > startValue ? 'up' : 'down';
    setDirection(newDirection);
    setPrevDisplayValue(startValue);
    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startValue + (endValue - startValue) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
        setTimeout(() => {
          setIsAnimating(false);
          setDirection(null);
        }, 100);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  if (displayValue === null) return <span className="text-gray-500">-</span>;

  const colorClass = isAnimating
    ? direction === 'up'
      ? 'text-green-400'
      : 'text-red-400'
    : '';

  return (
    <span className={`inline-flex overflow-hidden relative ${className}`}>
      {/* 이전 값 (슬라이드 아웃) */}
      {isAnimating && prevDisplayValue !== null && (
        <span
          className={`absolute inset-0 flex items-center justify-center ${
            direction === 'up' ? 'animate-slot-out-up' : 'animate-slot-out-down'
          }`}
        >
          {prevDisplayValue.toFixed(decimals)}{suffix}
        </span>
      )}
      {/* 현재 값 (슬라이드 인) */}
      <span
        className={`inline-block ${colorClass} ${
          isAnimating
            ? direction === 'up'
              ? 'animate-slot-in-up'
              : 'animate-slot-in-down'
            : ''
        }`}
      >
        {displayValue.toFixed(decimals)}{suffix}
      </span>
    </span>
  );
});
AnimatedValue.displayName = 'AnimatedValue';

/**
 * 셀 업데이트 감지 래퍼 (업데이트 애니메이션)
 */
export const AnimatedCell = memo(({
  children,
  dataKey
}: {
  children: React.ReactNode;
  dataKey: string;
}) => {
  const [isUpdated, setIsUpdated] = useState(false);
  const prevKey = useRef(dataKey);

  useEffect(() => {
    if (prevKey.current !== dataKey) {
      setIsUpdated(true);
      prevKey.current = dataKey;
      const timer = setTimeout(() => setIsUpdated(false), ANIMATION.CELL_UPDATE);
      return () => clearTimeout(timer);
    }
  }, [dataKey]);

  return (
    <div className={`transition-all duration-300 ${isUpdated ? 'animate-cell-update' : ''}`}>
      {children}
    </div>
  );
});
AnimatedCell.displayName = 'AnimatedCell';
