/**
 * Call a trace hook, if there is one, and never let it touch what called it:
 * a throw, or the rejection of a promise it returns, is reported as a
 * throwing listener's is. The info is built only when there is a hook.
 */
export declare function callHook<I>(hook: ((info: I) => unknown) | undefined, owner: object | undefined, info: () => I): void;
//# sourceMappingURL=hooks.d.ts.map