import { isIP as e } from "node:net";
//#region src/types.ts
var t = /* @__PURE__ */ function(e) {
	return e[e.Disconnected = 0] = "Disconnected", e[e.Connecting = 1] = "Connecting", e[e.Connected = 2] = "Connected", e;
}({}), n = {
	debug() {},
	info() {},
	warn() {},
	error() {}
}, r = {
	debug: console.debug.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console)
};
//#endregion
//#region src/address.ts
function i(t, n = "9987") {
	let r = t.trim();
	if (r.startsWith("[")) {
		let e = r.indexOf("]");
		if (e > 0) {
			let t = r.slice(1, e), i = r.slice(e + 1);
			if (i.startsWith(":") && /^\d+$/.test(i.slice(1))) return {
				host: t,
				port: i.slice(1)
			};
			if (!i) return {
				host: t,
				port: n
			};
		}
	}
	if (e(r) === 6) return {
		host: r,
		port: n
	};
	let i = r.lastIndexOf(":");
	if (i < 0) return {
		host: r,
		port: n
	};
	let a = r.slice(i + 1);
	return /^\d+$/.test(a) && r.indexOf(":") === i ? {
		host: r.slice(0, i),
		port: a
	} : {
		host: r,
		port: n
	};
}
function a(t, n) {
	let r = s(t);
	return e(r) === 6 || r.includes(":") ? `[${r}]:${n}` : `${r}:${n}`;
}
function o(t) {
	return e(s(t)) !== 0;
}
function s(e) {
	return e.startsWith("[") && e.endsWith("]") ? e.slice(1, -1) : e;
}
//#endregion
export { r as a, t as i, a as n, n as o, i as r, o as t };

//# sourceMappingURL=address-BfmovVpp.js.map