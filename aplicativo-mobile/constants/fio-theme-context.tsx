import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { FioColors } from '@/constants/fio-theme';

export type FioThemeId = 'dark' | 'light-sand' | 'light-lilac';
export type FioThemeColors = Record<keyof typeof FioColors, string> & {
  electricAccent: string;
  electricAccentSoft: string;
};

const THEME_STORAGE_KEY = '@fio/theme';

export const FioThemeOptions: { id: FioThemeId; name: string; description: string }[] = [
  { id: 'dark', name: 'Escuro', description: 'Chumbo, verde e dourado. O tema original do FIO.' },
  { id: 'light-sand', name: 'Claro areia', description: 'Cinza claro, verde, dourado e tons de areia.' },
  { id: 'light-lilac', name: 'Claro lilás', description: 'Cinza claro, verde, dourado e lilás elétrico suave.' },
];

const lightBase = {
  ink: '#1F2824',
  inkSoft: '#435049',
  gold: '#B58A32',
  goldSoft: '#F5E7C8',
  green: '#197A55',
  greenSoft: '#DDF1E7',
  orange: '#D97924',
  orangeSoft: '#FCE6D0',
  canvas: '#F4F5F2',
  surface: '#FFFFFF',
  surfaceMuted: '#EAEEE9',
  surfaceRaised: '#FFFFFF',
  line: '#D4DBD5',
  lineStrong: '#B8C4BA',
  text: '#202722',
  textMuted: '#59665E',
  textSoft: '#78837B',
  textOnAccent: '#FFFFFF',
  white: '#FFFFFF',
  danger: '#C6413C',
  dangerSoft: '#F9DEDD',
  success: '#25855D',
  successSoft: '#DDF2E6',
} as const;

export const FioThemePalettes: Record<FioThemeId, FioThemeColors> = {
  dark: { ...FioColors, electricAccent: FioColors.gold, electricAccentSoft: FioColors.goldSoft },
  'light-sand': { ...lightBase, electricAccent: '#B58A32', electricAccentSoft: '#F5E7C8' },
  'light-lilac': {
    ...lightBase,
    canvas: '#F7F5F8',
    surfaceMuted: '#F0EDF3',
    surfaceRaised: '#FFFFFF',
    line: '#DDD6E2',
    lineStrong: '#C8BBD1',
    green: '#176E55',
    greenSoft: '#DCF2E8',
    gold: '#B88427',
    goldSoft: '#F6E8C9',
    orange: '#D46F2B',
    orangeSoft: '#FBE4D8',
    inkSoft: '#493E50',
    textMuted: '#625869',
    textSoft: '#83768C',
    electricAccent: '#9461D2',
    electricAccentSoft: '#EEE4FA',
  },
};

type ThemeContextValue = {
  themeId: FioThemeId;
  colors: FioThemeColors;
  setThemeId: (themeId: FioThemeId) => Promise<void>;
};

const FioThemeContext = createContext<ThemeContextValue | null>(null);

export function FioThemeProvider({ children }: PropsWithChildren) {
  const [themeId, setStoredThemeId] = useState<FioThemeId>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((savedTheme) => {
      if (savedTheme === 'dark' || savedTheme === 'light-sand' || savedTheme === 'light-lilac') setStoredThemeId(savedTheme);
    }).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    themeId,
    colors: FioThemePalettes[themeId],
    setThemeId: async (nextThemeId) => {
      setStoredThemeId(nextThemeId);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextThemeId);
    },
  }), [themeId]);

  return <FioThemeContext.Provider value={value}>{children}</FioThemeContext.Provider>;
}

export function useFioTheme() {
  const theme = useContext(FioThemeContext);
  if (!theme) throw new Error('useFioTheme deve ser usado dentro de FioThemeProvider.');
  return theme;
}
