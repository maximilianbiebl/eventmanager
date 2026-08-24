import React, { createContext, useContext, useEffect, useState } from 'react';

/*
 * Drei Zustände, nicht zwei:
 *   'system' -> kein data-theme am <html>, prefers-color-scheme entscheidet
 *   'light'  -> data-theme="light", schlägt ein dunkles Betriebssystem
 *   'dark'   -> data-theme="dark"
 *
 * Die Farben selbst stehen als Custom Properties in index.css. Hier wird
 * nur das Attribut gesetzt - deshalb genügt ein Attributwechsel, um die
 * ganze Oberfläche umzustellen.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'themeMode';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Was gerade tatsächlich dargestellt wird - bei 'system' aufgelöst. */
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: () => {},
  resolved: 'light',
});

const readStored = (): ThemeMode => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Bei 'system' auf Änderungen des Betriebssystems reagieren
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* privater Modus - dann eben ohne Merken */
    }
  }, [mode]);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  return (
    <ThemeContext.Provider value={{ mode, setMode: setModeState, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
