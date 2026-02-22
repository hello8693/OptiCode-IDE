import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser || delay <= 0) {
      setDebounced(prev => (Object.is(prev, value) ? prev : value));
      return;
    }
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
