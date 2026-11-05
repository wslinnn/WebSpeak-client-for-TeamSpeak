/**
 * Escape a value for the command line: the characters that delimit a command
 * (space, `|`, `/`, the backslash itself, control characters) become their
 * two-character escapes.
 */
export declare function escape(s: string): string;
/** Undo {@link escape}, in one pass so that `\\s` comes back as `\s`, not a space. */
export declare function unescape(s: string): string;
/** A command line, parsed. */
export interface Command {
    /** The command's name, or `""` for a data row, which carries no name. */
    readonly name: string;
    /** Its parameters, unescaped. A flag such as `-uid` maps to `""`. */
    readonly params: Readonly<Record<string, string>>;
}
/** Build a command line from a parameter map; keys and values are escaped alike. */
export declare function buildCommand(cmd: string, params: Readonly<Record<string, string>>): string;
/** Build a TS3 command string preserving parameter order. */
export declare function buildCommandOrdered(cmd: string, params: ReadonlyArray<readonly [string, string]>): string;
//# sourceMappingURL=command.d.ts.map