import { n as e, o as t, r as n, t as r } from "./address-BfmovVpp.js";
import { resolveSrv as i } from "node:dns/promises";
import { createConnection as a } from "node:net";
//#region src/discovery/resolver.ts
var o = 41144, s = "https://named.myteamspeak.com/lookup", c = 6e5, l = class {
	#e = /* @__PURE__ */ new Map();
	constructor(e = t) {}
	async resolve(t, i) {
		if (!t) throw Error("empty address");
		let a = this.#t(t);
		if (a) return a;
		let { host: o, port: s } = n(t);
		if (r(o)) return [{
			addr: e(o, s),
			source: "Direct",
			expiry: /* @__PURE__ */ new Date(0)
		}];
		if (!o.includes(".") && o !== "localhost") {
			let e = await u(o, i);
			if (e) return this.resolve(e, i);
		}
		let c = await this.#r(o, i);
		if (c) return this.#n(t, c);
		let l = p(o), d = await this.#i(l, o, i);
		if (d) return this.#n(t, [{
			addr: d,
			source: "TSDNS-SRV",
			expiry: /* @__PURE__ */ new Date(0)
		}]);
		let f = await this.#a(l, o, i);
		if (f) return this.#n(t, [{
			addr: f,
			source: "TSDNS-Direct",
			expiry: /* @__PURE__ */ new Date(0)
		}]);
		let m = [{
			addr: e(o, s),
			source: "Direct",
			expiry: /* @__PURE__ */ new Date(0)
		}];
		return this.#n(t, m);
	}
	#t(e) {
		let t = this.#e.get(e);
		if (!t || t.length === 0) return null;
		let n = t[0];
		return n.expiry.getTime() > 0 && Date.now() > n.expiry.getTime() ? null : t;
	}
	#n(e, t) {
		let n = new Date(Date.now() + c), r = t.map((e) => ({
			...e,
			expiry: n
		}));
		return this.#e.set(e, r), r;
	}
	async #r(t, n) {
		try {
			let r = await m(i(`_ts3._udp.${t}`), n);
			return !r || r.length === 0 ? null : r.map((t) => ({
				addr: e(t.name.replace(/\.$/, ""), String(t.port)),
				source: "SRV",
				expiry: /* @__PURE__ */ new Date(0)
			}));
		} catch {
			return null;
		}
	}
	async #i(t, n, r) {
		for (let a of t) try {
			let t = await m(i(`_tsdns._tcp.${a}`), r);
			if (!t || t.length === 0) continue;
			for (let i of t) {
				let t = await d(e(i.name.replace(/\.$/, ""), String(i.port)), n, r);
				if (t) return t;
			}
		} catch {
			continue;
		}
		return null;
	}
	async #a(t, n, r) {
		for (let i of t) {
			let t = await d(e(i, String(o)), n, r);
			if (t) return t;
		}
		return null;
	}
};
async function u(e, t) {
	try {
		let n = new URL(s);
		n.searchParams.set("name", e);
		let r = t ? { signal: t } : {}, i = await fetch(n.toString(), r);
		return i.ok && (await i.text()).split("\n")[0]?.trim() || null;
	} catch {
		return null;
	}
}
function d(e, t, n) {
	let [r, i] = f(e), o = parseInt(i, 10);
	return new Promise((e) => {
		let i = setTimeout(() => {
			s.destroy(), e(null);
		}, 3e3), s = a({
			host: r,
			port: o,
			timeout: 2e3
		}, () => {
			s.write(`${t}\n`);
		}), c = "";
		s.on("data", (t) => {
			c += t.toString();
			let n = c.indexOf("\n");
			if (n >= 0) {
				clearTimeout(i), s.destroy();
				let t = c.slice(0, n).trim();
				e(!t || t === "404" || t === "errors" ? null : t);
			}
		}), s.on("error", () => {
			clearTimeout(i), e(null);
		}), n && n.addEventListener("abort", () => {
			clearTimeout(i), s.destroy(), e(null);
		}, { once: !0 });
	});
}
function f(e) {
	let { host: t, port: r } = n(e);
	return [t, r];
}
function p(e) {
	let t = e.split("."), n = [];
	for (let e = 0; e < t.length - 1; e++) n.push(t.slice(e).join("."));
	return n.slice(0, 3);
}
function m(e, t) {
	return t ? Promise.race([e, new Promise((e, n) => t.addEventListener("abort", () => n(t.reason), { once: !0 }))]) : e;
}
//#endregion
export { l as t };

//# sourceMappingURL=resolver-6B8dI9gr.js.map