/**
 * Command middleware, and the chain it makes.
 *
 * Both clients wrap the typed command layer the same way, so the composing
 * lives here; each supplies its own base handler.
 */
import type { CommandExecutor } from "./command/request.js";
import type { CommandMiddleware } from "./types.js";
/**
 * Compose a chain of middlewares around a base handler.
 * Rightmost middleware wraps the base first.
 */
export declare function buildCommandChain(middlewares: readonly CommandMiddleware[], base: CommandExecutor["send"]): CommandExecutor["send"];
//# sourceMappingURL=middleware.d.ts.map