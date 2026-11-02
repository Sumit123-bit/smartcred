import React, { createContext, useContext, useEffect, useState } from 'react';

export type GlassThemeId = 'navy' | 'violet' | 'slate';

interface ThemeContextValue {
  theme: GlassThemeId;
  setTheme: (theme: GlassThemeId) => void;
}

const STORAGE_KEY = 'smartcred_glass_theme';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'navy',
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<GlassThemeId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as GlassThemeId | null;
      if (saved === 'navy' || saved === 'violet' || saved === 'slate') {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    return 'navy';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-glass-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useGlassTheme = () => useContext(ThemeContext);
