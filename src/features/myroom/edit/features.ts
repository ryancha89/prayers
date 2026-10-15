/**
 * Decorate-mode features switched by the product, not the server (stage 1, 14-10: "Hiện tại bỏ cái
 * trong kho luôn đi"). The code behind each stays; flipping the switch brings it back.
 *
 * `storage`: the Storage tab (stored pieces, "In the room · In storage", Place in room) and Put away
 * on the selection bar. Off in stage 1: the player arranges what stands in the room, swaps between
 * owned copies, and changes the room by skin. A copy a swap leaves unplaced is simply not shown.
 *
 * Next to it, and NOT here: whether single pieces are sold — the server says that per catalog
 * (`furniture_for_sale`, see useDecorate). A mutable object, so a test can switch it per case.
 */
export const MYROOM_FEATURES = {
  storage: false,
};
