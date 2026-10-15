import { describe, expect, it } from "vitest";

import { initialServerTarget } from "./initial-target";

function query(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

describe("initialServerTarget", () => {
  it("server/target parameters win over everything", () => {
    expect(initialServerTarget(query({ server: "ts.example.com:10011" }), { hostname: "host.local" }))
      .toEqual({ address: "ts.example.com", port: "10011" });
    expect(initialServerTarget(query({ target: "ts2.example.com" }), { hostname: "host.local" }))
      .toEqual({ address: "ts2.example.com", port: "9987" });
  });

  it("tsHost/tsPort fall back to the current hostname with the default port", () => {
    expect(initialServerTarget(query({}), { hostname: "gateway.local" }))
      .toEqual({ address: "gateway.local", port: "9987" });
    expect(initialServerTarget(query({ tsHost: "ts3.local", tsPort: "4111" }), { hostname: "gateway.local" }))
      .toEqual({ address: "ts3.local", port: "4111" });
    // tsPort 显式给出时原样保留（包括空串覆盖成空端口字段）。
    expect(initialServerTarget(query({ tsPort: "5222" }), { hostname: "gateway.local" }))
      .toEqual({ address: "gateway.local", port: "5222" });
  });
});
