import { useEffect, useRef } from 'react';

/**
 * 리렌더 원인을 추적하는 디버깅 훅
 * 어떤 props/state가 변경되어 리렌더가 발생했는지 콘솔에 출력
 */
export function useWhyDidYouUpdate(name: string, props: Record<string, any>) {
  const previousProps = useRef<Record<string, any> | undefined>(undefined);

  useEffect(() => {
    if (previousProps.current) {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps: Record<string, { from: any; to: any }> = {};

      allKeys.forEach((key) => {
        if (previousProps.current![key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current![key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changedProps).length > 0) {
        console.log(`🔄 [${name}] Changed props:`, changedProps);
      }
    }

    previousProps.current = props;
  });
}
