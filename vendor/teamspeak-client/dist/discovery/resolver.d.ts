import type { Logger } from "../types.js";
import type { ResolvedAddr } from "../types.js";
export declare class Resolver {
    #private;
    constructor(_log?: Logger);
    resolve(inputAddr: string, signal?: AbortSignal): Promise<ResolvedAddr[]>;
}
//# sourceMappingURL=resolver.d.ts.map