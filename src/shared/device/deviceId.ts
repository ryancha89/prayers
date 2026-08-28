import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-device guest identity. Rides into Unity as SESSION_INIT.auth and onto the
 * backend as the User-Auth header, so each device keeps its own conversation
 * history (server creates a `prayers_guest` user per uid) until real login lands.
 * No PII — a random id minted once and persisted.
 */
interface DeviceIdState {
  deviceId: string;
}

const mint = () =>
  'prayers_dev_' +
  Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[
    Math.floor(Math.random() * 36)
  ]).join('');

export const useDeviceIdStore = create<DeviceIdState>()(
  persist(() => ({ deviceId: mint() }), {
    name: 'prayers.deviceId.v1',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

/** Non-hook accessor for imperative call sites (bridge payload assembly). */
export const getDeviceId = () => useDeviceIdStore.getState().deviceId;
