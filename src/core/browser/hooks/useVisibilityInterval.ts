import { useEffect, useRef } from 'react';

export interface VisibilityIntervalOptions {
  intervalMs: number;
  immediate?: boolean;
  enabled?: boolean;
}

export function useVisibilityInterval(
  callback: () => void | Promise<void>,
  options: VisibilityIntervalOptions,
): void {
  const { intervalMs, immediate = false, enabled = true } = options;
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    const isBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';
    const setIntervalFn = isBrowser ? window.setInterval : globalThis.setInterval;
    const clearIntervalFn = isBrowser ? window.clearInterval : globalThis.clearInterval;

    const run = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await callbackRef.current();
      } finally {
        runningRef.current = false;
      }
    };

    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setIntervalFn(() => {
        void run();
      }, intervalMs);
    };

    const stop = () => {
      if (intervalRef.current) {
        clearIntervalFn(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (!isBrowser) return;
      if (document.hidden) {
        stop();
        return;
      }
      start();
      if (immediate) {
        void run();
      }
    };

    if (!isBrowser) {
      start();
      if (immediate) {
        void run();
      }
      return () => stop();
    }

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [enabled, intervalMs, immediate]);
}
