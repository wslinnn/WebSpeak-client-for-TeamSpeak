import type { EscapedString } from "../types.js";
export declare function escape(s: string): EscapedString;
export declare function unescape(s: string): string;
export interface Command {
    name: string;
    params: Record<string, string>;
}
/** Build a TS3 command string from an unordered params map. */
export declare function buildCommand(cmd: string, params: Record<string, string>): string;
/** Build a TS3 command string preserving parameter order. */
export declare function buildCommandOrdered(cmd: string, params: ReadonlyArray<readonly [string, string]>): string;
//# sourceMappingURL=command.d.ts.map