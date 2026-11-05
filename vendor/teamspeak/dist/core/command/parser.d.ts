import type { Command } from "./command.js";
/**
 * Whether a token is a command name.
 *
 * A command name is a run of ASCII alphanumerics — the rule tsproto-packets
 * uses (CommandParser::new). Everything that splits or parses a line asks this
 * one function, so the parser and the row splitter cannot disagree about where
 * a command's data begins.
 */
export declare function isCommandName(token: string): boolean;
/**
 * Parse one command line, or one row of it. Returns null for an empty line.
 * A line whose first token is not a command name is a data row, with `name`
 * `""`.
 */
export declare function parseCommand(s: string): Command | null;
//# sourceMappingURL=parser.d.ts.map