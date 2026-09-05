import { useEffect, useState } from 'react';

/**
 * Schmaler Bildschirm - dieselbe Grenze wie `.hideOnMobile` im
 * Stylesheet der Aufgabentabelle.
 *
 * Gebraucht wird das dort, wo CSS allein nicht reicht: eine Zelle mit
 * colSpan muss wissen, wie viele Spalten ueberhaupt sichtbar sind.
 */
export const SCHMAL_AB = 640;

export const useSchmal = (grenze = SCHMAL_AB): boolean => {
  const frage = `(max-width: ${grenze}px)`;
  const [schmal, setSchmal] = useState(
    () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(frage).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(frage);
    const merke = () => setSchmal(mq.matches);
    merke();
    mq.addEventListener('change', merke);
    return () => mq.removeEventListener('change', merke);
  }, [frage]);

  return schmal;
};
