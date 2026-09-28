/**
 * Mode bougie — « le même grimoire, à la lueur de la bougie ».
 *
 * Le choix utilisateur vit dans localStorage (« ts-theme » =
 * 'light' | 'dark') ; SANS préférence posée, l'app suit le système
 * (prefers-color-scheme) en direct — changer le réglage OS bascule
 * l'onglet ouvert sans rechargement. Le script inline d'index.html
 * pose la classe ts-dark AVANT la première peinture (pas de flash) ;
 * ce module ne fait que lire/écrire la préférence et tenir la classe
 * et le meta theme-color à jour.
 */

export type ThemePref = 'light' | 'dark';

const STORAGE_KEY = 'ts-theme';

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('ts-dark');
}

/** Préférence POSÉE ('light'|'dark') ou null = suivre le système. */
export function themePref(): ThemePref | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function apply() {
  const dark = themePref() ? themePref() === 'dark' : systemDark();
  document.documentElement.classList.toggle('ts-dark', dark);
  // Le bandeau d'état du navigateur suit le mode (déjà sombre en clair —
  // le header est encre — il passe au cuir profond en bougie).
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#1a1512' : '#2a1f14');
}

export function setThemePref(pref: ThemePref | null) {
  try {
    if (pref === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* priv strict : la classe s'applique quand même pour la session */
  }
  apply();
}

// Suit le système tant qu'aucune préférence n'est posée.
if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => {
    if (themePref() === null) apply();
  });
}
