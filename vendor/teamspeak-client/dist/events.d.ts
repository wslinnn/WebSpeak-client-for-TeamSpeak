import type { EventMap, CommandMiddleware, EventMiddleware } from "./types.js";
type EventHandler<K extends keyof EventMap> = EventMap[K] extends void ? () => void : (payload: EventMap[K]) => void;
export type { EventHandler };
/**
 * Compose a chain of middlewares around a base handler.
 * Rightmost middleware wraps the base first.
 */
export declare function buildCommandChain(middlewares: CommandMiddleware[], base: (cmd: string) => Promise<void>): (cmd: string) => Promise<void>;
export declare function buildEventChain(middlewares: EventMiddleware[], base: (evt: EventMap[keyof EventMap]) => void): (evt: EventMap[keyof EventMap]) => void;
//# sourceMappingURL=events.d.ts.map