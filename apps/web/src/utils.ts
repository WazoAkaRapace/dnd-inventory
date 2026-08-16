/* Small helpers shared by the register (group list) and the table of contents (party page). */

export function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

export function toRoman(n: number): string {
  const table: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let rest = n;
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out || 'I';
}

/** SQLite timestamps are space-separated; Safari rejects those in Date(). */
export function formatSince(createdAt: string): string {
  const normalized = createdAt.includes(' ') ? createdAt.replace(' ', 'T') : createdAt;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });
  return `depuis ${fmt.format(d)}`;
}

/** Neutral creation stamp for finished things — no « depuis », the entity is over. */
export function formatCreated(createdAt: string): string {
  const normalized = createdAt.includes(' ') ? createdAt.replace(' ', 'T') : createdAt;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });
  return `créée ${fmt.format(d)}`;
}

/** Clipboard write with a legacy fallback — embedded browsers often deny the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
