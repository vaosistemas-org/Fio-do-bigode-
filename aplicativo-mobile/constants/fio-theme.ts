export const FioColors = {
  ink: '#EEF2EF',
  inkSoft: '#D9E1DB',
  gold: '#D2AD67',
  goldSoft: '#423B2D',
  green: '#74B892',
  greenSoft: '#30483A',
  orange: '#FFB04A',
  orangeSoft: '#4B3B25',
  canvas: '#242824',
  surface: '#2E332F',
  surfaceMuted: '#292E2A',
  surfaceRaised: '#383E39',
  line: '#4C534D',
  lineStrong: '#687069',
  text: '#F2F3EF',
  textMuted: '#C0C7C1',
  textSoft: '#929A93',
  textOnAccent: '#172119',
  white: '#FFFFFF',
  danger: '#FF8D83',
  dangerSoft: '#4A2F2D',
  success: '#8AD4A8',
  successSoft: '#294536',
} as const;

export const FioRadius = {
  small: 10,
  medium: 16,
  large: 22,
  pill: 999,
} as const;

export const FioShadow = {
  shadowColor: '#111411',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.2,
  shadowRadius: 18,
  elevation: 2,
} as const;
