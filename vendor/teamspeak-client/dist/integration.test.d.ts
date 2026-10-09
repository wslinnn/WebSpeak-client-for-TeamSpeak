/**
 * Integration tests against a live TeamSpeak 3 server.
 *
 * Opt-in: these tests only run when TEAMSPEAK_ADDR is set:
 *
 *   TEAMSPEAK_ADDR=106.15.36.235:9987 pnpm test --reporter=verbose src/integration.test.ts
 *
 * A single shared client is reused across all tests to avoid the TS3
 * anti-flood protection that bans IPs reconnecting too quickly.
 */
export {};
//# sourceMappingURL=integration.test.d.ts.map