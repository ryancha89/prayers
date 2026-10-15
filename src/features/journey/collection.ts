import type { Journey, JourneyContent } from './types';

export interface CollectionRow {
  chapterId: string;
  index: number;
  number: number;
  opened: number;
  total: number;
}

/**
 * The journey's collection (mockup panel 22): per numbered station, how much of it is open.
 * A topic station counts its free part once heard plus every paid part unlocked (n/3); the monthly
 * station counts only its quarters (n/4) — its free opening line is not a piece to collect.
 * What is unlocked is the server's word (the parts); "heard" is the phone's.
 */
export function collectionOf(journey: Journey, content: JourneyContent | null, heard: string[]): CollectionRow[] {
  return journey.chapters.flatMap((c, index) => {
    if (c.number == null) return [];
    const parts = content?.chapters.find(x => x.id === c.id)?.parts ?? [];
    const paid = parts.filter(p => p.momentId);
    const paidOpen = paid.filter(p => p.unlocked).length;
    const countsFree = c.interaction !== 'quarters';
    return [{
      chapterId: c.id,
      index,
      number: c.number,
      opened: paidOpen + (countsFree && heard.includes(c.id) ? 1 : 0),
      total: paid.length + (countsFree ? 1 : 0),
    }];
  });
}
