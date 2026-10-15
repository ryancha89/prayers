import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { isSilentCounselor } from './data/registry';

/**
 * Where a counselor card leads.
 *
 * Every card used to lead to the same place, because every counselor was the same kind of thing: a
 * profile, then a consultation. The meditation guide is not — her room is ten minutes of breathing
 * and there is nothing to read about her first, no topics to pick and no subject to choose. Sending
 * her through the detail screen would offer "Start counseling" for a room that never counsels.
 *
 * The decision is read from the ROSTER (`silent`), not from the id, so a second guide routes itself.
 */
export function openCounselor(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  counselor: { id: string; characterId?: string },
): void {
  if (isSilentCounselor(counselor.characterId)) {
    navigation.navigate('MeditationRoom');
    return;
  }
  navigation.navigate('CounselorDetail', { counselorId: counselor.id });
}
