import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { REDUCED } from '../state/helpers.js';

// Keeps the last non-null value around for `ms` after it goes away, so the
// element can play its exit animation before it unmounts.
export function useLingering(value, ms = 220) {
  const [kept, setKept] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value != null) setKept(value);
  }
  useEffect(() => {
    if (value != null || kept == null) return undefined;
    const t = setTimeout(() => setKept(null), REDUCED ? 0 : ms);
    return () => clearTimeout(t);
  }, [value, kept, ms]);
  return { item: value ?? kept, leaving: value == null && kept != null };
}

export function usePresence(show, ms = 220) {
  const { item, leaving } = useLingering(show ? true : null, ms);
  return { mounted: !!item, leaving };
}

// Slides an indicator (a pill, a thumb, an underline) to the element matching
// `selector` inside `rootRef`, instead of the highlight jumping between items.
export function useGlide(rootRef, thumbRef, selector, key) {
  const place = useRef(null);
  useLayoutEffect(() => {
    const root = rootRef.current, thumb = thumbRef.current;
    if (!root || !thumb) return undefined;
    place.current = () => {
      const el = root.querySelector(selector);
      if (!el) { thumb.style.opacity = '0'; return; }
      const first = !thumb.dataset.placed;
      if (first) thumb.style.transition = 'none';
      thumb.style.opacity = '';
      thumb.style.width = `${el.offsetWidth}px`;
      thumb.style.height = `${el.offsetHeight}px`;
      thumb.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
      if (first) {
        thumb.getBoundingClientRect();
        thumb.style.transition = '';
        thumb.dataset.placed = '1';
      }
    };
    place.current();
    // Fonts loading, badges appearing and window resizes all move the items.
    const ro = new ResizeObserver(() => place.current?.());
    ro.observe(root);
    for (const c of root.children) if (c !== thumb) ro.observe(c);
    return () => ro.disconnect();
  }, [rootRef, thumbRef, selector]);
  useLayoutEffect(() => { place.current?.(); }, [key]);
}

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
