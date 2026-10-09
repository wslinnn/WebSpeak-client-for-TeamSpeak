import { a as e, c as t, f as n, i as r, m as i, n as a, s as o, t as s } from "./primitives-DpKiXbMi.js";
//#region src/handshake/license.ts
var c = new Uint8Array([
	205,
	13,
	226,
	174,
	212,
	99,
	69,
	80,
	154,
	126,
	60,
	253,
	143,
	104,
	179,
	220,
	117,
	85,
	178,
	157,
	204,
	236,
	115,
	205,
	24,
	117,
	15,
	153,
	56,
	18,
	64,
	138
]), l = class {
	blocks;
	constructor(e) {
		this.blocks = e;
	}
	deriveKey() {
		let e = Uint8Array.from(c);
		for (let t of this.blocks) e = m(t, e);
		return e;
	}
};
function u(e) {
	if (e.length < 1) throw Error("license too short");
	if (e[0] !== 1) throw Error("unsupported license version");
	let t = e.slice(1), n = [];
	for (; t.length > 0;) {
		let { block: e, consumed: r } = d(t);
		n.push(e), t = t.slice(r);
	}
	return new l(n);
}
function d(e) {
	if (e.length < 42) throw Error("license too short");
	if (e[0] !== 0) throw Error(`wrong key kind in license: ${e[0]}`);
	let t = e[33], r = 1356998400, i = new DataView(e.buffer, e.byteOffset, e.byteLength), a = /* @__PURE__ */ new Date((i.getUint32(34, !1) + r) * 1e3), o = /* @__PURE__ */ new Date((i.getUint32(38, !1) + r) * 1e3);
	if (o < a) throw Error("license times are invalid");
	let s = Uint8Array.from(e.slice(1, 33)), { payload: c, payloadRead: l } = f(t, e, 42), u = 42 + l, d = e.slice(1, u), p = n(Uint8Array.from(d));
	return {
		block: {
			key: s,
			hash: Uint8Array.from(p.slice(0, 32)),
			properties: c.properties,
			issuer: c.issuer,
			notValidBefore: a,
			notValidAfter: o,
			blockType: t,
			serverType: c.serverType
		},
		consumed: u
	};
}
function f(e, t, n) {
	switch (e) {
		case 0: {
			let { str: e, read: n } = p(t.slice(46));
			return {
				payload: {
					issuer: e,
					serverType: 0,
					properties: [],
					read: 5 + n
				},
				payloadRead: 5 + n
			};
		}
		case 2: {
			let { str: e, read: n } = p(t.slice(47));
			return {
				payload: {
					issuer: e,
					serverType: t[42] ?? 0,
					properties: [],
					read: 6 + n
				},
				payloadRead: 6 + n
			};
		}
		case 8: {
			let e = t[43] === void 0 ? 0 : t[43], r = 44, i = [];
			for (let n = 0; n < e; n++) {
				if (r >= t.length) throw Error("license too short");
				let e = t[r++];
				if (r + e > t.length) throw Error("license too short");
				i.push(Uint8Array.from(t.slice(r, r + e))), r += e;
			}
			return {
				payload: {
					issuer: "",
					serverType: t[42] ?? 0,
					properties: i,
					read: r - n
				},
				payloadRead: r - n
			};
		}
		case 32: return {
			payload: {
				issuer: "",
				serverType: 0,
				properties: [],
				read: 0
			},
			payloadRead: 0
		};
		default: throw Error(`invalid license block type: ${e}`);
	}
}
function p(e) {
	for (let t = 0; t < e.length; t++) if (e[t] === 0) return {
		str: new TextDecoder().decode(e.slice(0, t)),
		read: t
	};
	throw Error("non-null-terminated issuer string");
}
function m(n, r) {
	let i = Uint8Array.from(n.hash);
	a(i);
	let o = s(i), c = t.Point.fromBytes(n.key).negate(), l = t.Point.fromBytes(r).negate(), u = e(c, o).add(l).toBytes(), d = new Uint8Array(u.length);
	return d.set(u), d[31] = (d[31] === void 0 ? 0 : d[31]) ^ 128, d;
}
//#endregion
//#region src/handshake/crypt-init2.ts
function h(e, t, n, a, s, c) {
	if (e.alphaTmp.length === 0) throw Error("alpha is not initialized");
	let l = Buffer.from(t, "base64"), d = Buffer.from(n, "base64"), f = Buffer.from(a, "base64"), p = Buffer.from(s, "base64"), m = i(d);
	if (!o(m, l, f)) throw Error("init proof is not valid");
	let h = u(l).deriveKey(), g = r(h, c);
	e.setSharedSecret(e.alphaTmp, p, g);
}
//#endregion
export { l as n, u as r, h as t };

//# sourceMappingURL=crypt-init2-DEykmDHe.js.map