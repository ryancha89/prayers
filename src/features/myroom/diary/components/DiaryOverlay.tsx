import React from 'react';
import { useLang } from '../../../../shared/i18n';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import type { DiaryKind } from '../../../archive/types';
import { diaryCounselorFor } from '../counselors';
import { DiaryWriteSheet } from './DiaryWriteSheet';
import { DiarySavedSheet } from './DiarySavedSheet';
import { DiaryListSheet } from './DiaryListSheet';
import { DiaryDetailSheet } from './DiaryDetailSheet';
import { DiaryCalendarSheet } from './DiaryCalendarSheet';
import { DiaryBrowseSheet } from './DiaryBrowseSheet';
import { DiaryJourneySheet } from './DiaryJourneySheet';

/** Which diary screen is up. Overlays over My Room rather than routes (plan R15): the room's
 *  UnityView stays mounted under them, and closing one is the room again. */
export type DiaryRoute =
  | { screen: 'write'; editId?: string; kind?: DiaryKind; from?: DiaryRoute }
  | { screen: 'saved'; id: string }
  | { screen: 'list' }
  | { screen: 'detail'; id: string; from?: DiaryRoute }
  | { screen: 'calendar' }
  | { screen: 'browse' }
  | { screen: 'journey' };

/**
 * The diary's screens and the moves between them — Write → Saved → (View Diary) Detail, the
 * list → Detail → Edit, and the list's Calendar / Mood / ⋯ (My Journey), each of which opens Detail
 * and returns to itself — in one place, so MyRoomScreen only opens and closes it.
 *
 * `onTalk` is the one way out of the room (Talk to Counselor): it gets the entry's counsellor card
 * id and the entry id, for the hand-off's `focus_memory_id`.
 */
export const DiaryOverlay: React.FC<{
  route: DiaryRoute;
  go(route: DiaryRoute | null): void;
  onTalk(counselorId: string, memoryId: string): void;
}> = ({ route, go, onTalk }) => {
  const lang = useLang();
  const editing = useArchiveStore(st =>
    route.screen === 'write' && route.editId ? st.memories.find(m => m.id === route.editId) : undefined,
  );
  const talk = (memoryId: string) => {
    const m = useArchiveStore.getState().memories.find(x => x.id === memoryId);
    const who = diaryCounselorFor(m?.details.counselor, lang);
    if (who) onTalk(who.counselor.id, memoryId);
  };

  switch (route.screen) {
    case 'write':
      return (
        <DiaryWriteSheet
          editing={editing}
          initialKind={route.kind}
          onClose={() => go(route.from ?? null)}
          onSaved={m => go({ screen: 'saved', id: m.id })}
        />
      );
    case 'saved':
      return (
        <DiarySavedSheet
          memoryId={route.id}
          onView={() => go({ screen: 'detail', id: route.id })}
          onTalk={() => talk(route.id)}
          onClose={() => go(null)}
        />
      );
    case 'list':
      return (
        <DiaryListSheet
          onOpen={id => go({ screen: 'detail', id })}
          onWrite={kind => go({ screen: 'write', kind, from: { screen: 'list' } })}
          onCalendar={() => go({ screen: 'calendar' })}
          onBrowse={() => go({ screen: 'browse' })}
          onJourney={() => go({ screen: 'journey' })}
          onClose={() => go(null)}
        />
      );
    case 'detail':
      return (
        <DiaryDetailSheet
          memoryId={route.id}
          onEdit={() => go({ screen: 'write', editId: route.id, from: route })}
          onTalk={() => talk(route.id)}
          onDeleted={() => go(route.from ?? { screen: 'list' })}
          onClose={() => go(route.from ?? { screen: 'list' })}
        />
      );
    case 'calendar':
    case 'browse':
    case 'journey': {
      const Sheet = route.screen === 'calendar' ? DiaryCalendarSheet : route.screen === 'browse' ? DiaryBrowseSheet : DiaryJourneySheet;
      return <Sheet onOpen={id => go({ screen: 'detail', id, from: route })} onClose={() => go({ screen: 'list' })} />;
    }
  }
};
