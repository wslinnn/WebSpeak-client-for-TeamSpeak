/** The values of the table below, before freezing. */
const connectPhaseValues = {
    /** Opening the socket, or the address was not usable once resolved. */
    Open: "open",
    /** The handshake, from the first packet until the shared secret exists. */
    Handshake: "handshake",
    /** After the handshake, waiting for the server to accept the client: a wrong password, a ban or an invalid nickname end here. */
    Join: "join",
};
/** Where a connection attempt can fail; see {@link AttemptFailedInfo}. */
export const ConnectPhase = 
/* @__PURE__ */ Object.freeze(connectPhaseValues);
//# sourceMappingURL=trace.js.map