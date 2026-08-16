/**
 * "Your turn" sword-cut — shared by the desktop combat widget and the
 * mobile dock's combat indicator.
 *
 * useTurnSlash(isMyTurn) fires once on any-state → your-turn transitions
 * (toggling/collapsing the UI does not replay it) and returns whether the
 * double cut is currently playing: the blade sweeps across forehand, then
 * cuts back backhand, all within the single animation. <TurnSlash active>
 * renders the blade overlay; pair it with the `combat-turn-glow` class for
 * the persistent full-perimeter glow while the turn is yours.
 */
import { useEffect, useRef, useState } from 'react';

// 1.15s animation + 110ms echo delay, plus a little slack
const SLASH_MS = 1400;

/** Haptic cue for combat transitions. Degrades silently where unsupported
 *  (iOS Safari) or when the user prefers reduced motion. */
export function combatVibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
    return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function useTurnSlash(isMyTurn: boolean): boolean {
  const wasMyTurn = useRef(false);
  const [slashActive, setSlashActive] = useState(false);
  useEffect(() => {
    const becameMyTurn = isMyTurn && !wasMyTurn.current;
    wasMyTurn.current = isMyTurn;
    if (!becameMyTurn) return;
    combatVibrate([120, 60, 120]);
    setSlashActive(true);
    const t = setTimeout(() => setSlashActive(false), SLASH_MS);
    return () => {
      clearTimeout(t);
      setSlashActive(false);
    };
  }, [isMyTurn]);
  return slashActive;
}

export default function TurnSlash({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="combat-slash-overlay" aria-hidden="true">
      <span className="combat-slash-blade" />
    </span>
  );
}
