import type { IconName } from '../../../shared/components/Icon';
import type { TranslationKey } from '../../../shared/i18n';
import type { InboxItem } from './inboxStore';

/** Where a row leads. Every one stays inside the room: any other route would tear it down. */
export type InboxLink =
  | { to: 'diary'; memoryId: string }
  | { to: 'checkin' }
  | { to: 'coins' }
  | { to: 'decorate' };

export interface InboxLine {
  icon: IconName;
  title: string;
  body: string;
  link: InboxLink | null;
}

type T = (k: TranslationKey, p?: Record<string, string | number>) => string;

/**
 * A row's words and its link, drawn now (so a language change re-words the box). `entry` finds a
 * diary entry's first line (null when it was deleted — then the row no longer links), `counselor`
 * names the card for a tone, `piece` names a My Room sku ('' for one this build does not know).
 */
export function inboxLine(
  item: InboxItem,
  t: T,
  ctx: { entry(memoryId: string): string | null; counselor(tone: string): string; piece(sku: string): string },
): InboxLine {
  const d = item.data;
  switch (item.kind) {
    case 'reflection': {
      const memoryId = String(d.memoryId ?? '');
      const excerpt = ctx.entry(memoryId);
      return {
        icon: 'book',
        title: t('inbox.reflection.title', { name: ctx.counselor(String(d.tone ?? '')) }),
        body: excerpt ?? t('inbox.reflection.gone'),
        link: excerpt != null ? { to: 'diary', memoryId } : null,
      };
    }
    case 'checkin':
      return d.claimed === true
        ? { icon: 'gift', title: t('inbox.checkin.claimed'), body: t('inbox.checkin.granted', { count: Number(d.granted ?? 0) }), link: null }
        : { icon: 'gift', title: t('inbox.checkin.ready'), body: t('inbox.checkin.readyBody'), link: { to: 'checkin' } };
    case 'coins':
      return {
        icon: 'coin',
        title: t('inbox.coins.title', { count: Number(d.coins ?? 0) }),
        body: t('inbox.coins.body', { balance: Number(d.balance ?? 0) }),
        link: { to: 'coins' },
      };
    case 'moment':
      return {
        icon: 'train',
        title: t('inbox.moment.title'),
        body: String(d.label ?? '') || t('inbox.moment.body'),
        link: null,
      };
    case 'furniture': {
      const name = ctx.piece(String(d.sku ?? ''));
      return {
        icon: 'armchair',
        title: t('inbox.furniture.title'),
        body: name ? t('inbox.furniture.body', { name }) : t('inbox.furniture.bodyUnknown'),
        link: { to: 'decorate' },
      };
    }
    default:
      return { icon: 'mail', title: '', body: '', link: null };
  }
}
