export interface HostPort {
    host: string;
    port: string;
}
/** Parse a TeamSpeak address without confusing an IPv6 colon for a port separator. */
export declare function splitHostPort(address: string, defaultPort?: string): HostPort;
/**
 * Parse an address to connect to, and check it can be one: a host, which
 * contains nothing a host name or IP address cannot, and a port from 1 to
 * 65535. Throws an InvalidAddressError otherwise.
 */
export declare function parseConnectAddress(address: string): HostPort & {
    portNumber: number;
};
export declare function joinHostPort(host: string, port: string): string;
export declare function isIpAddress(host: string): boolean;
//# sourceMappingURL=address.d.ts.map