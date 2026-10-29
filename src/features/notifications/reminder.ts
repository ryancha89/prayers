import { NativeModules } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguageStore } from '../../shared/i18n';
import { translate } from '../../shared/i18n/translations';
import { useAuthStore } from '../auth/store/authStore';

/**
 * The daily check-in reminder (10-17, 알림 settings): a local notification at the time the player
 * picked, on each of the next DAYS_AHEAD days — today left out once today is checked in, so a day
 * that is already done never rings. Re-planned on every app start and after every check-in, which
 * also rolls the 14-day window forward.
 *
 * iOS only for now (native `Reminder`, UNUserNotificationCenter). Without the module the settings
 * page says so rather than offering a switch that does nothing.
 *
 * 29-10: it is a CHECK-IN reminder, so it rings only while someone is signed in — sign-out cancels
 * the planned ones (forgetLocalData) and a sign-in plans them again. Their words are written in the
 * language of the moment they are planned, so a language change plans them again too (App.tsx).
 */
const DAYS_AHEAD = 14;

type ReminderModule = {
  status(): Promise<'granted' | 'denied' | 'undetermined'>;
  requestPermission(): Promise<boolean>;
  schedule(dates: string[], hour: number, minute: number, title: string, body: string): Promise<number>;
  cancelAll(): Promise<void>;
};
const native = (): ReminderModule | null => (NativeModules.Reminder as ReminderModule | undefined) ?? null;

export const reminderSupported = () => native() != null;

interface ReminderState {
  enabled: boolean;
  hour: number;
  minute: number;
  /** The phone date last checked in (YYYY-MM-DD), so today is skipped. */
  checkedOn: string | null;
  set(patch: Partial<Pick<ReminderState, 'enabled' | 'hour' | 'minute' | 'checkedOn'>>): void;
}

export const useReminder = create<ReminderState>()(
  persist(
    set => ({
      enabled: false,
      hour: 9,
      minute: 0,
      checkedOn: null,
      set: patch => set(patch),
    }),
    {
      name: 'prayers.reminder.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ enabled: s.enabled, hour: s.hour, minute: s.minute, checkedOn: s.checkedOn }),
    },
  ),
);

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The dates to ring on: the next DAYS_AHEAD days whose reminder time is still ahead, minus a checked-in today. */
export function reminderDates(now: Date, hour: number, minute: number, checkedOn: string | null): string[] {
  const out: string[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute);
    if (d.getTime() <= now.getTime()) continue;
    const key = ymd(d);
    if (key === checkedOn) continue;
    out.push(key);
  }
  return out;
}

type Persisted = { persist?: { hasHydrated(): boolean; onFinishHydration(cb: () => void): () => void } };
/** A store read before its saved row is back reads its defaults — `enabled: false`, nobody signed in
 *  — and the launch's re-plan would cancel every reminder instead of rolling them forward. */
function hydrated(store: unknown): Promise<void> {
  const p = (store as Persisted).persist;
  if (!p || p.hasHydrated()) return Promise.resolve();
  return new Promise(resolve => {
    const off = p.onFinishHydration(() => { off(); resolve(); });
  });
}

/** Re-plan the notifications from the stored settings. Safe to call any time; never throws. */
export async function applyReminder(): Promise<void> {
  const mod = native();
  if (!mod) return;
  await Promise.all([hydrated(useReminder), hydrated(useAuthStore), hydrated(useLanguageStore)]);
  const { enabled, hour, minute, checkedOn } = useReminder.getState();
  const signedIn = useAuthStore.getState().userAuth != null;
  try {
    if (!enabled || !signedIn || (await mod.status()) !== 'granted') {
      await mod.cancelAll();
      return;
    }
    const lang = useLanguageStore.getState().lang;
    await mod.schedule(
      reminderDates(new Date(), hour, minute, checkedOn),
      hour,
      minute,
      translate(lang, 'notif.pushTitle'),
      translate(lang, 'notif.pushBody'),
    );
  } catch {
    // A reminder is a convenience; failing to plan one must not reach the player.
  }
}

/** Sign-out: the planned reminders go now, whatever the settings say (they stay as the device's,
 *  for the next sign-in). Never throws. */
export async function cancelReminders(): Promise<void> {
  try {
    await native()?.cancelAll();
  } catch {
    // Nothing the player could do about it.
  }
}

/** Turn the reminder on (asking for permission the first time) or off. Resolves whether it is on. */
export async function setReminderEnabled(on: boolean): Promise<boolean> {
  const mod = native();
  if (!mod) return false;
  if (on) {
    const allowed = (await mod.status()) === 'granted' || (await mod.requestPermission());
    useReminder.getState().set({ enabled: allowed });
    await applyReminder();
    return allowed;
  }
  useReminder.getState().set({ enabled: false });
  await applyReminder();
  return false;
}

/** After a check-in: today is done, so today's reminder goes. */
export function noteCheckedInToday(): void {
  useReminder.getState().set({ checkedOn: ymd(new Date()) });
  void applyReminder();
}
