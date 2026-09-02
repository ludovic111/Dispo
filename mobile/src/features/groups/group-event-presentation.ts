import type { DispoPalette } from '@/theme/tokens';

type EventPalette = Pick<DispoPalette, 'concert' | 'jam' | 'rehearsal'>;

export function groupEventColor(kind: string | null, palette: EventPalette): string | null {
  if (kind === 'Concert') return palette.concert;
  if (kind === 'Jam') return palette.jam;
  if (kind === 'Répétition') return palette.rehearsal;
  return null;
}
