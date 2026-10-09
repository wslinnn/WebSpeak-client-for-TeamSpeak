export declare class TeamspeakError extends Error {
    constructor(message: string, options?: ErrorOptions);
}
export declare class ServerError extends TeamspeakError {
    readonly id: string;
    readonly serverMessage: string;
    constructor(id: string, serverMessage: string);
}
export declare class CommandTimeoutError extends TeamspeakError {
    readonly command: string;
    constructor(command: string);
}
export declare class AlreadyConnectedError extends TeamspeakError {
    constructor();
}
export declare class EAXTagMismatchError extends TeamspeakError {
    constructor();
}
export declare class FakeSignatureMismatchError extends TeamspeakError {
    constructor();
}
export declare class FileTransferError extends TeamspeakError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class FileTransferTimeoutError extends TeamspeakError {
    constructor();
}
export declare class CryptoInitError extends TeamspeakError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class InvalidIdentityError extends TeamspeakError {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map