import { randomBytes } from "node:crypto";
import type { JoinTicketPayload } from "./join-ticket.js";

interface StoredReconnectTicket {
  payload: JoinTicketPayload;
  entryId: string;
  expiresAt: number;
}

/**
 * In-session reconnect tickets: one is issued per accepted voice WebSocket and
 * delivered to the browser in the `connected` message. A page reload or a
 * browser-level drop exchanges the token for a fresh join ticket, restoring
 * target/password/nickname/channel/identity without consuming the invite
 * again. Single-consume plus a short TTL bounds replay; switching channels
 * updates the stored payload so the rebuilt session rejoins the right channel.
 */
export class ReconnectTicketStore {
  private readonly tickets = new Map<string, StoredReconnectTicket>();

  constructor(private readonly ttlMs = 10 * 60_000, private readonly maxTickets = 256) {}

  issue(payload: JoinTicketPayload, entryId: string, now = Date.now()): string {
    this.prune(now);
    while (this.tickets.size >= this.maxTickets) {
      const oldest = this.tickets.keys().next().value;
      if (!oldest) break;
      this.tickets.delete(oldest);
    }
    const token = randomBytes(24).toString("base64url");
    this.tickets.set(token, { payload, entryId, expiresAt: now + this.ttlMs });
    return token;
  }

  consume(token: string, now = Date.now()): { payload: JoinTicketPayload; entryId: string } | null {
    const stored = this.tickets.get(token);
    this.tickets.delete(token);
    if (!stored || stored.expiresAt <= now) return null;
    return { payload: stored.payload, entryId: stored.entryId };
  }

  /** Keep the stored channel in sync with mid-session channel switches. */
  updateChannel(entryId: string, channel: string, now = Date.now()): void {
    for (const stored of this.tickets.values()) {
      if (stored.entryId !== entryId || stored.expiresAt <= now) continue;
      if (channel) stored.payload = { ...stored.payload, channel };
      else delete stored.payload.channel;
      return;
    }
  }

  get size(): number {
    return this.tickets.size;
  }

  private prune(now: number): void {
    for (const [token, stored] of this.tickets) {
      if (stored.expiresAt <= now) this.tickets.delete(token);
    }
  }
}
