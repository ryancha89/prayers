import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-device guest identity. Rides into Unity as SESSION_INIT.auth and onto the
 * backend as the User-Auth header, so each device keeps its own conversation
 * history until real login lands. No PII — a random id minted once and persisted.
 *
 * THE `dev-` PREFIX IS LOAD-BEARING. It is not decoration.
 *
 * The server only auto-provisions an unknown uid when it starts with `dev-`:
 *
 *     # saju_controller.rb — current_game_user / auto_provision_dev_unity_user
 *     User.find_by(uid: uid) || auto_provision_dev_unity_user(uid)
 *     return nil unless Rails.env.development? && uid.start_with?('dev-')
 *
 * This used to mint `prayers_dev_…`, which matches nothing. Measured against a
 * running server:
 *
 *     User-Auth: prayers_dev_rb59…  ->  401 {"success":false,"error":"unauthorized"}
 *     User-Auth: dev-rb59…          ->  200 {"success":true,"has_saju":false}
 *
 * The 401 meant Unity's `/api/v1/saju/me` fetch returned nothing, the room had no
 * chart, and every consultation ended on `no_chart` — "Your chart has not reached
 * me yet". The counselor could never give a real reading, and the only symptom was
 * that notice.
 *
 * The earlier comment here claimed the server "creates a `prayers_guest` user per
 * uid". It does not; there is no such path. That claim is what the prefix was
 * written to match.
 */
interface DeviceIdState {
  deviceId: string;
}

const mint = () =>
  'dev-' +
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
