/**
 * What the player came into the coffee shop for, chosen at the World door (20-10, user: "chọn ngay
 * từ ngoài rồi có người dắt vô quán mới hợp lý"). Before, the door only said Enter: the player
 * walked the room looking for a seat, sat, and only then saw the menu.
 *
 *   coffee  the barista meets them at the door, seats them, and the coffee's confirmation opens
 *   tarot   the same walk to the tarot table; seated, they choose the reader there (user, 20-10:
 *           "let user firstly sit down on the table and select consultant")
 *   (none)  walk in and look around — the shared room, other players, the seats by the guest
 */
export type CafeIntent = { kind: 'coffee' } | { kind: 'tarot' };

/**
 * The seats to be shown to, best first. A seat someone else holds (the shared room) is refused by
 * Unity with reason `busy`, and the next one is tried. Coffee goes to the lounge sofa (the bar seat
 * is beside the counter staff), tarot to the tarot corner; every seat has a table rig, so either
 * service works at any of them.
 */
export const GUIDE_SEATS: Record<CafeIntent['kind'], string[]> = {
  coffee: ['lounge', 'bar', 'tarot'],
  tarot: ['tarot', 'lounge', 'bar'],
};

/** The seats to try for this intent, among those the scene has (CAFE_READY.spots), in order. */
export function guideSeats(intent: CafeIntent, spots: string[]): string[] {
  return GUIDE_SEATS[intent.kind].filter(s => spots.includes(s));
}
