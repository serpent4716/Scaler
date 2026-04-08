import { useEffect } from 'react';

export function useReveal(dep) {
  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll('.reveal').forEach((el, i) => {
        setTimeout(() => el.classList.add('in'), i * 80);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [dep]);
}
