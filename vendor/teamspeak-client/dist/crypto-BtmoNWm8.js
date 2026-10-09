import { m as e, v as t, y as n } from "./primitives-DpKiXbMi.js";
import { createCipheriv as r, createECDH as i, createHash as a, timingSafeEqual as o } from "node:crypto";
//#region src/crypto/eax.ts
var s = 8, c = 16, l = class {
	#e;
	constructor(e) {
		if (e.length !== 16) throw Error("EAX requires a 16-byte key");
		this.#e = e;
	}
	encrypt(e, t, n) {
		let r = this.#t(0, e), i = this.#t(1, t), a = u(this.#e, r, n), o = this.#t(2, a), c = new Uint8Array(s);
		for (let e = 0; e < s; e++) c[e] = r[e] ^ i[e] ^ o[e];
		return [a, c];
	}
	decrypt(e, n, r, i) {
		let a = this.#t(0, e), c = this.#t(1, n), l = this.#t(2, r), d = new Uint8Array(s);
		for (let e = 0; e < s; e++) d[e] = a[e] ^ c[e] ^ l[e];
		if (!o(Buffer.from(d), Buffer.from(i.slice(0, s)))) throw new t();
		return u(this.#e, a, r);
	}
	#t(e, t) {
		let n = new Uint8Array(c + t.length);
		return n[15] = e, n.set(t, c), g(this.#e, n);
	}
};
function u(e, t, n) {
	let i = r("aes-128-ctr", Buffer.from(e), Buffer.from(t));
	return Buffer.concat([i.update(Buffer.from(n)), i.final()]);
}
function d(e, t) {
	let n = r("aes-128-ecb", Buffer.from(e), null);
	return n.setAutoPadding(!1), Buffer.concat([n.update(Buffer.from(t)), n.final()]);
}
function f(e, t) {
	let n = new Uint8Array(c);
	for (let r = 0; r < c; r++) n[r] = e[r] ^ t[r];
	return n;
}
function p(e) {
	let t = new Uint8Array(c), n = 0;
	for (let r = 15; r >= 0; r--) {
		let i = (e[r] << 1 | n) & 255;
		n = e[r] >> 7, t[r] = i;
	}
	return t;
}
var m = new Uint8Array(c);
m[15] = 135;
function h(e) {
	let t = d(e, new Uint8Array(c)), n = p(t);
	t[0] & 128 && (n = f(n, m));
	let r = p(n);
	return n[0] & 128 && (r = f(r, m)), [n, r];
}
function g(e, t) {
	let [n, r] = h(e), i = Math.max(1, Math.ceil(t.length / c)), a = t.length > 0 && t.length % c === 0, o = new Uint8Array(c);
	for (let n = 0; n < i - 1; n++) {
		let r = t.slice(n * c, (n + 1) * c);
		o = Uint8Array.from(d(e, f(o, r)));
	}
	let s = new Uint8Array(c), l = (i - 1) * c, u = t.slice(l);
	s.set(u);
	let p;
	return a ? p = f(s, n) : (u.length < c && (s[u.length] = 128), p = f(s, r)), Uint8Array.from(d(e, f(o, p)));
}
//#endregion
//#region src/crypto/crypt.ts
var _ = 8, v = 10, y = 8, b = 15, x = Buffer.from("TS3INIT1"), S = Buffer.from("c:\\windows\\syste"), C = Buffer.from("m\\firewall32.cpl"), w = class {
	identity;
	ivStruct = /* @__PURE__ */ new Uint8Array();
	fakeSignature = new Uint8Array(_);
	alphaTmp = /* @__PURE__ */ new Uint8Array();
	cryptoInitComplete = !1;
	#e = /* @__PURE__ */ new Map();
	constructor(e) {
		this.identity = e;
	}
	solveRsaChallenge(e, t, n) {
		if (n < 0 || n > 1e6) throw Error("RSA challenge level out of range");
		let r = e.slice(t, t + 64), i = e.slice(t + 64, t + 128), a = E(r), o = E(i);
		for (let e = 0; e < n; e++) a = a * a % o;
		return D(a, 64);
	}
	initCrypto(t, n, r) {
		let i = Buffer.from(t, "base64"), a = Buffer.from(n, "base64"), o = Buffer.from(r, "base64"), s = e(o), c = this.#t(s);
		this.setSharedSecret(i, a, c);
	}
	setSharedSecret(e, t, n) {
		this.ivStruct = new Uint8Array(v + t.length);
		for (let t = 0; t < v; t++) {
			let r = n[t], i = e[t];
			this.ivStruct[t] = ((r === void 0 ? 0 : r) ^ (i === void 0 ? 0 : i)) & 255;
		}
		for (let e = 0; e < t.length; e++) {
			let r = n[v + e], i = t[e];
			this.ivStruct[v + e] = ((r === void 0 ? 0 : r) ^ (i === void 0 ? 0 : i)) & 255;
		}
		let r = a("sha1").update(this.ivStruct).digest();
		this.fakeSignature = new Uint8Array(r.buffer, r.byteOffset, _), this.cryptoInitComplete = !0;
	}
	getKeyNonce(e, t, n, r, i) {
		if (i) return [Uint8Array.from(S), Uint8Array.from(C)];
		let o = T(e, r, n), s = this.#e.get(o);
		if (s === void 0) {
			let t = new Uint8Array(6 + this.ivStruct.length);
			t[0] = e ? 48 : 49, t[1] = r & b, new DataView(t.buffer).setUint32(2, n, !1), t.set(this.ivStruct, 6);
			let i = a("sha256").update(t).digest();
			s = {
				key: Uint8Array.from(i.slice(0, 16)),
				nonce: Uint8Array.from(i.slice(16, 32)),
				gen: n
			}, this.#e.set(o, s);
		}
		let c = Uint8Array.from(s.key);
		return c[0] = (c[0] === void 0 ? 0 : c[0]) ^ t >> 8 & 255, c[1] = (c[1] === void 0 ? 0 : c[1]) ^ t & 255, [c, s.nonce];
	}
	encrypt(e, t, n, r, i, a, o) {
		if (e === y) return [i, x];
		if (o) return [i, this.fakeSignature];
		let [s, c] = this.getKeyNonce(!1, t, n, e, a);
		return new l(s).encrypt(c, r, i);
	}
	decrypt(e, t, r, i, a, o, s, c) {
		if (e === y) return a;
		if (c) {
			let e = o.slice(0, _);
			if (!Buffer.from(e).equals(Buffer.from(this.fakeSignature))) throw new n();
			return a;
		}
		let [u, d] = this.getKeyNonce(!0, t, r, e, s);
		return new l(u).decrypt(d, i, a, o);
	}
	#t(e) {
		let t = this.identity.privateKey.export({ format: "jwk" }), n = e.export({ format: "jwk" }), r = i("prime256v1"), o = Buffer.from(t.d, "base64url");
		r.setPrivateKey(o);
		let s = O(n.x, 32), c = O(n.y, 32), l = Buffer.alloc(65);
		l[0] = 4, s.copy(l, 1), c.copy(l, 33);
		let u = r.computeSecret(l);
		return a("sha1").update(u).digest();
	}
};
function T(e, t, n) {
	let r = 0n;
	return e && (r |= 1n << 40n), r |= BigInt(t & b) << 32n, r |= BigInt(n), r;
}
function E(e) {
	let t = 0n;
	for (let n of e) t = t << 8n | BigInt(n);
	return t;
}
function D(e, t) {
	let n = new Uint8Array(t), r = e;
	for (let e = t - 1; e >= 0; e--) n[e] = Number(r & 255n), r >>= 8n;
	return n;
}
function O(e, t) {
	let n = Buffer.from(e, "base64url");
	if (n.length === t) return n;
	let r = Buffer.alloc(t);
	return n.copy(r, t - n.length), r;
}
//#endregion
export { l as n, g as r, w as t };

//# sourceMappingURL=crypto-BtmoNWm8.js.map