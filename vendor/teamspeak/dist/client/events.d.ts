import type { EventMiddleware, ServerEvent } from "./types.js";
export declare function buildEventChain(middlewares: EventMiddleware[], base: (event: ServerEvent) => void): (event: ServerEvent) => void;
//# sourceMappingURL=events.d.ts.map