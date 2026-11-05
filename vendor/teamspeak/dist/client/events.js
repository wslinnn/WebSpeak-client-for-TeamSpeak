export function buildEventChain(middlewares, base) {
    let handler = base;
    for (let i = middlewares.length - 1; i >= 0; i--) {
        handler = middlewares[i](handler);
    }
    return handler;
}
//# sourceMappingURL=events.js.map