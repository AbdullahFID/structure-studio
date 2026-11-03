import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { REDUCED } from '../state/helpers.js';

// Tweens a number toward its new value so metrics visibly travel when an option changes.
export function useCountUp(value, format) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (REDUCED || from === value || !Number.isFinite(from)) {
      setShown(value);
      return undefined;
    }
    const o = { v: from };
    const tw = gsap.to(o, { v: value, duration: 0.7, ease: 'power3.out', onUpdate: () => setShown(o.v) });
    return () => tw.kill();
  }, [value]);
  return format(shown);
}

export function useMedia(query) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
