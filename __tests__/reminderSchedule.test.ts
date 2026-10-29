/**
 * The check-in reminder follows the account and the language (29-10): sign-out cancels what was
 * planned (it rang "check in" at a signed-out phone), and the words are planned again in the new
 * language instead of staying in the old one until the next launch.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [] },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeModules } from 'react-native';
import { applyReminder, cancelReminders, useReminder } from '../src/features/notifications/reminder';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { useLanguageStore } from '../src/shared/i18n';
import { translate } from '../src/shared/i18n/translations';

const mod = {
  status: jest.fn(async () => 'granted'),
  requestPermission: jest.fn(async () => true),
  schedule: jest.fn(async () => 14),
  cancelAll: jest.fn(async () => {}),
};

beforeAll(() => { (NativeModules as Record<string, unknown>).Reminder = mod; });
afterAll(() => { delete (NativeModules as Record<string, unknown>).Reminder; });
beforeEach(() => {
  Object.values(mod).forEach(f => f.mockClear());
  useReminder.setState({ enabled: true, hour: 9, minute: 0, checkedOn: null });
  useAuthStore.setState({ userAuth: 'pr_1' } as never);
  useLanguageStore.setState({ lang: 'en' });
});

it('plans the reminders in the current language while signed in', async () => {
  await applyReminder();
  expect(mod.schedule).toHaveBeenCalledTimes(1);
  expect((mod.schedule.mock.calls[0] as unknown[])[3]).toBe(translate('en', 'notif.pushTitle'));
  useLanguageStore.setState({ lang: 'vi' });
  await applyReminder();
  expect((mod.schedule.mock.calls[1] as unknown[])[3]).toBe(translate('vi', 'notif.pushTitle'));
  expect((mod.schedule.mock.calls[1] as unknown[])[4]).toBe(translate('vi', 'notif.pushBody'));
});

it('signed out: nothing is planned, and what was is cancelled', async () => {
  useAuthStore.setState({ userAuth: null } as never);
  await applyReminder();
  expect(mod.schedule).not.toHaveBeenCalled();
  expect(mod.cancelAll).toHaveBeenCalled();
  // The setting itself is the device's and stays for the next sign-in.
  expect(useReminder.getState().enabled).toBe(true);
});

it('sign-out (forgetLocalData) cancels them at once', async () => {
  const { forgetLocalData } = require('../src/features/auth/api/deleteAccount');
  await forgetLocalData();
  expect(mod.cancelAll).toHaveBeenCalled();
});

it('cancelReminders never throws', async () => {
  mod.cancelAll.mockRejectedValueOnce(new Error('nope'));
  await expect(cancelReminders()).resolves.toBeUndefined();
});
