/**
 * Trimming by index. A regular expression such as `/\/+$/` retries from every
 * start of a long run that does not end the string, which takes quadratic time
 * on input a server or a caller controls; these walk the string once.
 */
/** `text` without the `/` characters at its end. */
export declare function trimTrailingSlashes(text: string): string;
/** `text` without the `\r` characters at either end. */
export declare function trimCarriageReturns(text: string): string;
//# sourceMappingURL=trim.d.ts.map