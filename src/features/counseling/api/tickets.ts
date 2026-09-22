import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';

/**
 * The player's question-ticket balance.
 *
 * WHY THIS IS ASKED BEFORE THE ROOM OPENS
 *
 * The consultation room refuses to seat anyone with no tickets — ConsultationSession checks the
 * balance and bails before it binds the counselor or hands the stage over. That refusal is correct,
 * but it happens INSIDE: the player watches the room load, the counselor appear and the session
 * die. Asking here means "you are out of tickets" is said on the way in, where it reads as a
 * precondition instead of a failure.
 *
 * The engine-side gate stays. This is the polite check, not the authoritative one — the balance can
 * change between this call and the first turn, and only the server can settle that.
 *
 * `/api/v1/saju/tickets` rather than `/api/v1/users/question_tickets_balance`: the latter
 * authenticates with the app token and answers 401 to the device uid this client carries. The saju
 * route uses the same User-Auth the room already relies on for the chart.
 */
export interface TicketBalance {
  tickets: number;
  pro: number;
  normal: number;
}

/**
 * Returns the balance, or `null` when it could not be established.
 *
 * Null is NOT zero, and callers must not treat it as such. A network blip, a cold server or an
 * unprovisioned uid would otherwise lock the player out of a consultation they have every right to
 * — the engine still holds the real gate, so letting them through on an unknown balance costs at
 * worst the failure this check exists to make prettier.
 */
export async function fetchTicketBalance(signal?: AbortSignal): Promise<TicketBalance | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/saju/tickets`, { signal });
    if (!res) return null;       // not signed in: unknown, which is not zero — see above
    if (!res.ok) return null;

    const body = await res.json();
    if (!body?.success || typeof body.tickets !== 'number') return null;

    return {
      tickets: body.tickets,
      pro: typeof body.pro === 'number' ? body.pro : 0,
      normal: typeof body.normal === 'number' ? body.normal : 0,
    };
  } catch {
    return null;
  }
}
