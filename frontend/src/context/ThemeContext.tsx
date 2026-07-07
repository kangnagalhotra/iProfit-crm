import {
  createContext, useContext, useEffect, useState, ReactNode,
} from 'react';

type Theme = 'light' | 'dark';
interface ThemeApi { theme: Theme; toggleTheme: () => void; }

const ThemeContext = createContext<ThemeApi>({} as ThemeApi);
export const useTheme = () => useContext(ThemeContext);

function initialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  return stored === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const api: ThemeApi = {
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
  };

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}
