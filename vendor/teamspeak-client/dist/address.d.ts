export interface HostPort {
    host: string;
    port: string;
}
/** Parse a TeamSpeak address without confusing an IPv6 colon for a port separator. */
export declare function splitHostPort(address: string, defaultPort?: string): HostPort;
export declare function joinHostPort(host: string, port: string): string;
export declare function isIpAddress(host: string): boolean;
//# sourceMappingURL=address.d.ts.map