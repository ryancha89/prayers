/**
 * The Prayer Ticket — the one picture every mention of a ticket in the app points at.
 *
 * Lives beside the asset rather than in a screen so the home header can show it without pulling
 * the purchase flow along; a header that imports a screen imports its store providers too.
 *
 * The art is cut off its black render background (alpha from luminance, like the splash lotus),
 * so its own glow sits on the app's dark surfaces with no rectangle around it. 3:2, like the
 * source render.
 */
export const PRAYER_TICKET_ART = require('./prayer-ticket.png');
