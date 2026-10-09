export declare function parseUint64(s: string): bigint;
export declare function parseUint16(s: string): number;
export declare function parseInt10(s: string): number;
/**
 * Reports whether `actual` equals `expected` or equals `expected` followed by
 * only digits — the pattern TeamSpeak uses when a nickname is already taken.
 */
export declare function isAutoNicknameMatch(expected: string, actual: string): boolean;
/**
 * Expand a pipe-separated multi-row TS3 command line into individual rows,
 * each prefixed with the command name.
 */
export declare function splitCommandRows(line: string): string[];
//# sourceMappingURL=helpers.d.ts.map