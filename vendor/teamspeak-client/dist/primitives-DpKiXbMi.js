import { createECDH as e, createHash as t, createPrivateKey as n, createPublicKey as r, createSign as i, createVerify as a, generateKeyPairSync as o, randomBytes as s } from "node:crypto";
//#region src/errors.ts
var c = class extends Error {
	constructor(e, t) {
		super(e, t), this.name = "TeamspeakError";
	}
}, l = class extends c {
	id;
	serverMessage;
	constructor(e, t) {
		super(`TeamSpeak server error: ${t} (id=${e})`), this.name = "ServerError", this.id = e, this.serverMessage = t;
	}
}, u = class extends c {
	command;
	constructor(e) {
		super(`command timeout: ${e}`), this.name = "CommandTimeoutError", this.command = e;
	}
}, d = class extends c {
	constructor() {
		super("already connecting or connected"), this.name = "AlreadyConnectedError";
	}
}, f = class extends c {
	constructor() {
		super("EAX tag mismatch"), this.name = "EAXTagMismatchError";
	}
}, p = class extends c {
	constructor() {
		super("fake signature mismatch"), this.name = "FakeSignatureMismatchError";
	}
}, m = class extends c {
	constructor(e, t) {
		super(e, t), this.name = "FileTransferError";
	}
}, h = class extends c {
	constructor() {
		super("timeout waiting for file transfer notification"), this.name = "FileTransferTimeoutError";
	}
}, g = class extends c {
	constructor(e, t) {
		super(e, t), this.name = "CryptoInitError";
	}
}, _ = class extends c {
	constructor(e = "invalid identity format") {
		super(e), this.name = "InvalidIdentityError";
	}
}, v = 32, y = 65, b = 4, x = class {
	privateKey;
	offset;
	constructor(e, t) {
		this.privateKey = e, this.offset = t;
	}
	publicKeyBase64() {
		let e = this.privateKey.export({ format: "jwk" });
		return e.x === void 0 || e.y === void 0 || typeof e.x != "string" || typeof e.y != "string" ? "" : E(oe(e.x, v), oe(e.y, v));
	}
	toString() {
		let e = this.privateKey.export({ format: "jwk" });
		if (!e.d) return `:${this.offset}`;
		let t = oe(e.d, v);
		return `${Buffer.from(t).toString("base64")}:${this.offset}`;
	}
	securityLevel() {
		let e = t("sha1");
		return e.update(this.publicKeyBase64()), e.update(this.offset.toString(10)), se(e.digest());
	}
	async upgradeToLevel(e, n) {
		let r = this.publicKeyBase64();
		for (;;) {
			if (n?.aborted) throw n.reason;
			let i = t("sha1");
			if (i.update(r), i.update(this.offset.toString(10)), se(i.digest()) >= e) return;
			this.offset++, this.offset % 10000n == 0n && await new Promise((e) => setImmediate(e));
		}
	}
};
function S(t) {
	let r = t.lastIndexOf(":");
	if (r < 0) throw new _();
	let i = t.slice(0, r), a = t.slice(r + 1), o = Buffer.from(i, "base64"), s = BigInt(a);
	if (o.length > v) throw new _("private key scalar too large");
	let c = Buffer.alloc(v);
	o.copy(c, v - o.length);
	let l = e("prime256v1");
	l.setPrivateKey(c);
	let u = l.getPublicKey(null, "uncompressed"), d = Buffer.from(u.slice(1, 33)).toString("base64url"), f = Buffer.from(u.slice(33, 65)).toString("base64url"), p = {
		kty: "EC",
		crv: "P-256",
		d: c.toString("base64url"),
		x: d,
		y: f
	};
	return new x(n({
		key: p,
		format: "jwk"
	}), s);
}
function C(e) {
	let { privateKey: n } = o("ec", { namedCurve: "prime256v1" }), r = new x(n, 0n), i = r.publicKeyBase64();
	for (;;) {
		let n = t("sha1");
		if (n.update(i), n.update(r.offset.toString(10)), se(n.digest()) >= e) return r;
		r.offset++;
	}
}
function w(e) {
	let n = t("sha1").update(e).digest();
	return Buffer.from(n).toString("base64");
}
function T(e) {
	return t("sha512").update(e).digest();
}
function E(e, t) {
	let n = O(3, Buffer.from([7, 0])), r = O(2, ae(32)), i = O(2, ae(e)), a = O(2, ae(t));
	return O(48, Buffer.concat([
		n,
		r,
		i,
		a
	])).toString("base64");
}
function ee(e) {
	let t = D(e), n = {
		kty: "EC",
		crv: "P-256",
		x: Buffer.from(t.slice(1, 33)).toString("base64url"),
		y: Buffer.from(t.slice(33, 65)).toString("base64url")
	};
	return r({
		key: n,
		format: "jwk"
	});
}
function D(e) {
	try {
		return te(e);
	} catch {}
	return ne(e);
}
function te(e) {
	let t = k(e, 48).value, n = 0, r = k(t, 3, n);
	n += r.consumed;
	let i = k(t, 2, n);
	n += i.consumed;
	let a = k(t, 2, n);
	n += a.consumed;
	let o = k(t, 2, n);
	return re(A(a.value, v), A(o.value, v));
}
function ne(e) {
	let t = k(e, 48).value, n = 0, r = k(t, 2, n);
	n += r.consumed;
	let i = k(t, 2, n);
	return re(A(r.value, v), A(i.value, v));
}
function re(e, t) {
	if (e.length > v || t.length > v) throw Error("invalid public key point encoding");
	let n = new Uint8Array(y);
	return n[0] = b, n.set(e, 33 - e.length), n.set(t, 65 - t.length), n;
}
function O(e, t) {
	let n = ie(t.length);
	return Buffer.concat([
		Buffer.from([e]),
		n,
		t
	]);
}
function ie(e) {
	return e < 128 ? Buffer.from([e]) : e < 256 ? Buffer.from([129, e]) : Buffer.from([
		130,
		e >> 8 & 255,
		e & 255
	]);
}
function ae(e) {
	if (typeof e == "number") {
		let t = [], n = e;
		do
			t.unshift(n & 255), n >>= 8;
		while (n > 0);
		return t[0] & 128 && t.unshift(0), Buffer.from(t);
	}
	let t = 0;
	for (; t < e.length - 1 && e[t] === 0;) t++;
	let n = e.slice(t);
	return n[0] & 128 ? Buffer.concat([Buffer.from([0]), n]) : Buffer.from(n);
}
function k(e, t, n = 0) {
	if (e[n] !== t) throw Error(`expected DER tag 0x${t.toString(16)}, got 0x${(e[n] ?? 0).toString(16)}`);
	let r = n + 1, i, a = e[r++];
	if (a < 128) i = a;
	else if (a === 129) i = e[r++];
	else if (a === 130) i = (e[r] << 8 | e[r + 1]) >>> 0, r += 2;
	else throw Error("unsupported DER length encoding");
	return {
		value: e.slice(r, r + i),
		consumed: r - n + i
	};
}
function A(e, t) {
	let n = 0;
	for (; n < e.length - 1 && e[n] === 0;) n++;
	let r = e.slice(n);
	if (r.length > t) throw Error("integer too large");
	if (r.length === t) return r;
	let i = new Uint8Array(t);
	return i.set(r, t - r.length), i;
}
function oe(e, t) {
	let n = Buffer.from(e, "base64url");
	if (n.length === t) return n;
	let r = Buffer.alloc(t);
	return n.copy(r, t - n.length), r;
}
function se(e) {
	let t = 0;
	for (let n of e) if (n === 0) t += 8;
	else for (let e = 0; e < 8; e++) if (!(n & 1 << e)) t++;
	else return t;
	return t;
}
//#endregion
//#region node_modules/@noble/hashes/_u64.js
var ce = /* @__PURE__ */ BigInt(2 ** 32 - 1), le = /* @__PURE__ */ BigInt(32);
function ue(e, t = !1) {
	return t ? {
		h: Number(e & ce),
		l: Number(e >> le & ce)
	} : {
		h: Number(e >> le & ce) | 0,
		l: Number(e & ce) | 0
	};
}
function de(e, t = !1) {
	let n = e.length, r = new Uint32Array(n), i = new Uint32Array(n);
	for (let a = 0; a < n; a++) {
		let { h: n, l: o } = ue(e[a], t);
		[r[a], i[a]] = [n, o];
	}
	return [r, i];
}
var fe = (e) => e / 2 ** 32 | 0, pe = (e) => e >>> 0;
function me(e, t, n, r) {
	let i = fe(n), a = pe(n);
	e.setUint32(t, r ? a : i, r), e.setUint32(t + 4, r ? i : a, r);
}
var he = (e, t, n) => e >>> n, ge = (e, t, n) => e << 32 - n | t >>> n, j = (e, t, n) => e >>> n | t << 32 - n, M = (e, t, n) => e << 32 - n | t >>> n, _e = (e, t, n) => e << 64 - n | t >>> n - 32, ve = (e, t, n) => e >>> n - 32 | t << 64 - n;
function N(e, t, n, r) {
	let i = (t >>> 0) + (r >>> 0);
	return {
		h: e + n + (i / 2 ** 32 | 0) | 0,
		l: i | 0
	};
}
var ye = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), be = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, xe = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), Se = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, Ce = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), we = (e, t, n, r, i, a) => t + n + r + i + a + (e / 2 ** 32 | 0) | 0;
//#endregion
//#region node_modules/@noble/hashes/utils.js
function Te(e) {
	return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
var Ee = (e) => e ? `"${e}" ` : "";
function P(e, t = "") {
	if (typeof e != "number") throw TypeError(Ee(t) + "expected number, got " + typeof e);
	if (!Number.isSafeInteger(e) || e < 0) throw RangeError(Ee(t) + "expected integer >= 0, got " + e);
	return e;
}
function F(e, t, n = "") {
	if (Te(e) && (t === void 0 || e.length === t)) return e;
	t !== void 0 && P(t, "length");
	let r = Te(e), i = t === void 0 ? "" : ` of length ${t}`, a = r ? `length=${e.length}` : `type=${typeof e}`, o = Ee(n) + "expected Uint8Array" + i + ", got " + a;
	throw r ? RangeError(o) : TypeError(o);
}
var De = (e, t) => {
	if (typeof e != "object" || !e || Array.isArray(e)) throw TypeError((t === "object" ? "" : `"${t}" `) + "expected object, got type=" + typeof e);
}, Oe = (e, t) => {
	De(e, t);
	let n = Object.getPrototypeOf(e);
	if (n !== Object.prototype && n !== null) throw TypeError(`"${t}" expected plain object`);
	if (Object.hasOwn(e, "__proto__")) throw TypeError(`"${t}.__proto__" is not allowed`);
};
function ke(e, t = !0) {
	if (e.destroyed) throw Error("hash was destroyed");
	if (t && e.finished) throw Error("digest() was already called");
}
function Ae(e, t) {
	F(e, void 0, "output");
	let n = t.outputLen;
	if (!(e.length >= n)) throw RangeError("\"output\" expected length >= " + n);
}
function je(...e) {
	for (let t = 0; t < e.length; t++) e[t].fill(0);
}
function Me(e) {
	return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
var Ne = typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Pe = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Fe(e) {
	if (F(e), Ne) return e.toHex();
	let t = "";
	for (let n = 0; n < e.length; n++) t += Pe[e[n]];
	return t;
}
function Ie(e) {
	return e >= 48 && e <= 57 ? e - 48 : e >= 65 && e <= 70 ? e - 55 : e >= 97 && e <= 102 ? e - 87 : void 0;
}
function Le(e) {
	if (typeof e != "string") throw TypeError("hex string expected, got " + typeof e);
	if (Ne) try {
		return Uint8Array.fromHex(e);
	} catch (e) {
		throw e instanceof SyntaxError ? RangeError(e.message) : e;
	}
	let t = e.length, n = t / 2;
	if (t % 2) throw RangeError("hex string expected, got unpadded hex of length " + t);
	let r = new Uint8Array(n);
	for (let t = 0, i = 0; t < n; t++, i += 2) {
		let n = Ie(e.charCodeAt(i)), a = Ie(e.charCodeAt(i + 1));
		if (n === void 0 || a === void 0) {
			let t = e[i] + e[i + 1];
			throw RangeError("hex string expected, got non-hex character \"" + t + "\" at index " + i);
		}
		r[t] = n * 16 + a;
	}
	return r;
}
function Re(...e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		F(r), t += r.length;
	}
	let n = new Uint8Array(t);
	for (let t = 0, r = 0; t < e.length; t++) {
		let i = e[t];
		n.set(i, r), r += i.length;
	}
	return n;
}
function ze(e, t, n = "opts") {
	return Oe(e, "defaults"), t !== void 0 && Oe(t, n), Object.assign(Object.create(null), e, t);
}
function Be(e, t = {}) {
	if (typeof e != "function") throw TypeError("\"hashCons\" expected function, got type=" + typeof e);
	t = ze({}, t, "info");
	let n = (t, n) => e(n).update(t).digest(), r = e(void 0);
	return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (t) => e(t), Object.assign(n, t), Object.freeze(n);
}
function Ve(e = 32) {
	P(e, "bytesLength");
	let t = typeof globalThis == "object" ? globalThis.crypto : null;
	if (typeof t?.getRandomValues != "function") throw Error("crypto.getRandomValues must be defined");
	if (e > 65536) throw RangeError(`"bytesLength" expected <= 65536, got ${e}`);
	return t.getRandomValues(new Uint8Array(e));
}
var He = (e) => ({ oid: Uint8Array.from([
	6,
	9,
	96,
	134,
	72,
	1,
	101,
	3,
	4,
	2,
	e
]) }), Ue = class {
	blockLen;
	outputLen;
	canXOF = !1;
	padOffset;
	isLE;
	buffer;
	view;
	finished = !1;
	length = 0;
	pos = 0;
	destroyed = !1;
	constructor(e, t, n, r) {
		this.blockLen = e, this.outputLen = t, this.padOffset = n, this.isLE = r, this.buffer = new Uint8Array(e), this.view = Me(this.buffer);
	}
	update(e) {
		ke(this), F(e);
		let { view: t, buffer: n, blockLen: r } = this, i = e.length, a = !1;
		for (let o = 0; o < i;) {
			let s = Math.min(r - this.pos, i - o);
			if (s === r) {
				let t = Me(e);
				for (; r <= i - o; o += r) this.process(t, o);
				a = !0;
				continue;
			}
			n.set(o === 0 && s === i ? e : e.subarray(o, o + s), this.pos), this.pos += s, o += s, this.pos === r && (this.process(t, 0), this.pos = 0, a = !0);
		}
		return this.length += e.length, a && this.roundClean(), this;
	}
	digestInto(e) {
		ke(this), Ae(e, this), this.finished = !0;
		let { buffer: t, view: n, blockLen: r, isLE: i } = this, { pos: a } = this;
		t[a++] = 128, t.fill(0, a), this.padOffset > r - a && (this.process(n, 0), t.fill(0)), me(n, r - 8, this.length * 8, i), this.process(n, 0), this.roundClean();
		let o = e === t ? n : Me(e), s = this.outputLen, c = s / 4, l = this.get();
		if (s % 4 || c > l.length) throw Error("invalid outputLen");
		for (let e = 0; e < c; e++) o.setUint32(4 * e, l[e], i);
	}
	digest() {
		let { buffer: e, outputLen: t } = this;
		this.digestInto(e);
		let n = e.slice(0, t);
		return this.destroy(), n;
	}
	_cloneIntoMeta(e) {
		let { buffer: t, length: n, finished: r, destroyed: i, pos: a } = this;
		return e.destroyed = i, e.finished = r, e.length = n, e.pos = a, a && e.buffer.set(t), e;
	}
	clone() {
		return this._cloneInto();
	}
}, We = /* @__PURE__ */ Uint32Array.from([
	1779033703,
	4089235720,
	3144134277,
	2227873595,
	1013904242,
	4271175723,
	2773480762,
	1595750129,
	1359893119,
	2917565137,
	2600822924,
	725511199,
	528734635,
	4215389547,
	1541459225,
	327033209
]), Ge = /* @__PURE__ */ de((/* @__PURE__ */ "0x428a2f98d728ae22.0x7137449123ef65cd.0xb5c0fbcfec4d3b2f.0xe9b5dba58189dbbc.0x3956c25bf348b538.0x59f111f1b605d019.0x923f82a4af194f9b.0xab1c5ed5da6d8118.0xd807aa98a3030242.0x12835b0145706fbe.0x243185be4ee4b28c.0x550c7dc3d5ffb4e2.0x72be5d74f27b896f.0x80deb1fe3b1696b1.0x9bdc06a725c71235.0xc19bf174cf692694.0xe49b69c19ef14ad2.0xefbe4786384f25e3.0x0fc19dc68b8cd5b5.0x240ca1cc77ac9c65.0x2de92c6f592b0275.0x4a7484aa6ea6e483.0x5cb0a9dcbd41fbd4.0x76f988da831153b5.0x983e5152ee66dfab.0xa831c66d2db43210.0xb00327c898fb213f.0xbf597fc7beef0ee4.0xc6e00bf33da88fc2.0xd5a79147930aa725.0x06ca6351e003826f.0x142929670a0e6e70.0x27b70a8546d22ffc.0x2e1b21385c26c926.0x4d2c6dfc5ac42aed.0x53380d139d95b3df.0x650a73548baf63de.0x766a0abb3c77b2a8.0x81c2c92e47edaee6.0x92722c851482353b.0xa2bfe8a14cf10364.0xa81a664bbc423001.0xc24b8b70d0f89791.0xc76c51a30654be30.0xd192e819d6ef5218.0xd69906245565a910.0xf40e35855771202a.0x106aa07032bbd1b8.0x19a4c116b8d2d0c8.0x1e376c085141ab53.0x2748774cdf8eeb99.0x34b0bcb5e19b48a8.0x391c0cb3c5c95a63.0x4ed8aa4ae3418acb.0x5b9cca4f7763e373.0x682e6ff3d6b2b8a3.0x748f82ee5defb2fc.0x78a5636f43172f60.0x84c87814a1f0ab72.0x8cc702081a6439ec.0x90befffa23631e28.0xa4506cebde82bde9.0xbef9a3f7b2c67915.0xc67178f2e372532b.0xca273eceea26619c.0xd186b8c721c0c207.0xeada7dd6cde0eb1e.0xf57d4f7fee6ed178.0x06f067aa72176fba.0x0a637dc5a2c898a6.0x113f9804bef90dae.0x1b710b35131c471b.0x28db77f523047d84.0x32caab7b40c72493.0x3c9ebe0a15c9bebc.0x431d67c49c100d4c.0x4cc5d4becb3e42b6.0x597f299cfc657e2a.0x5fcb6fab3ad6faec.0x6c44198c4a475817".split(".")).map((e) => BigInt(e))), Ke = Ge[0], qe = Ge[1], I = /* @__PURE__ */ new Uint32Array(80), L = /* @__PURE__ */ new Uint32Array(80), Je = class extends Ue {
	Ah = 0;
	Al = 0;
	Bh = 0;
	Bl = 0;
	Ch = 0;
	Cl = 0;
	Dh = 0;
	Dl = 0;
	Eh = 0;
	El = 0;
	Fh = 0;
	Fl = 0;
	Gh = 0;
	Gl = 0;
	Hh = 0;
	Hl = 0;
	constructor(e, t) {
		super(128, e, 16, !1), this.Ah = t[0] | 0, this.Al = t[1] | 0, this.Bh = t[2] | 0, this.Bl = t[3] | 0, this.Ch = t[4] | 0, this.Cl = t[5] | 0, this.Dh = t[6] | 0, this.Dl = t[7] | 0, this.Eh = t[8] | 0, this.El = t[9] | 0, this.Fh = t[10] | 0, this.Fl = t[11] | 0, this.Gh = t[12] | 0, this.Gl = t[13] | 0, this.Hh = t[14] | 0, this.Hl = t[15] | 0;
	}
	get() {
		let { Ah: e, Al: t, Bh: n, Bl: r, Ch: i, Cl: a, Dh: o, Dl: s, Eh: c, El: l, Fh: u, Fl: d, Gh: f, Gl: p, Hh: m, Hl: h } = this;
		return [
			e,
			t,
			n,
			r,
			i,
			a,
			o,
			s,
			c,
			l,
			u,
			d,
			f,
			p,
			m,
			h
		];
	}
	set(e, t, n, r, i, a, o, s, c, l, u, d, f, p, m, h) {
		this.Ah = e | 0, this.Al = t | 0, this.Bh = n | 0, this.Bl = r | 0, this.Ch = i | 0, this.Cl = a | 0, this.Dh = o | 0, this.Dl = s | 0, this.Eh = c | 0, this.El = l | 0, this.Fh = u | 0, this.Fl = d | 0, this.Gh = f | 0, this.Gl = p | 0, this.Hh = m | 0, this.Hl = h | 0;
	}
	_cloneInto(e) {
		return (e ||= new this.constructor()).set(...this.get()), this._cloneIntoMeta(e);
	}
	process(e, t) {
		for (let n = 0; n < 16; n++, t += 4) I[n] = e.getUint32(t), L[n] = e.getUint32(t += 4);
		for (let e = 16; e < 80; e++) {
			let t = I[e - 15] | 0, n = L[e - 15] | 0, r = j(t, n, 1) ^ j(t, n, 8) ^ he(t, n, 7), i = M(t, n, 1) ^ M(t, n, 8) ^ ge(t, n, 7), a = I[e - 2] | 0, o = L[e - 2] | 0, s = j(a, o, 19) ^ _e(a, o, 61) ^ he(a, o, 6), c = xe(i, M(a, o, 19) ^ ve(a, o, 61) ^ ge(a, o, 6), L[e - 7], L[e - 16]), l = Se(c, r, s, I[e - 7], I[e - 16]);
			I[e] = l | 0, L[e] = c | 0;
		}
		let { Ah: n, Al: r, Bh: i, Bl: a, Ch: o, Cl: s, Dh: c, Dl: l, Eh: u, El: d, Fh: f, Fl: p, Gh: m, Gl: h, Hh: g, Hl: _ } = this;
		for (let e = 0; e < 80; e++) {
			let t = j(u, d, 14) ^ j(u, d, 18) ^ _e(u, d, 41), v = M(u, d, 14) ^ M(u, d, 18) ^ ve(u, d, 41), y = u & f ^ ~u & m, b = d & p ^ ~d & h, x = Ce(_, v, b, qe[e], L[e]), S = we(x, g, t, y, Ke[e], I[e]), C = x | 0, w = j(n, r, 28) ^ _e(n, r, 34) ^ _e(n, r, 39), T = M(n, r, 28) ^ ve(n, r, 34) ^ ve(n, r, 39), E = n & i ^ n & o ^ i & o, ee = r & a ^ r & s ^ a & s;
			g = m | 0, _ = h | 0, m = f | 0, h = p | 0, f = u | 0, p = d | 0, {h: u, l: d} = N(c | 0, l | 0, S | 0, C | 0), c = o | 0, l = s | 0, o = i | 0, s = a | 0, i = n | 0, a = r | 0;
			let D = ye(C, T, ee);
			n = be(D, S, w, E), r = D | 0;
		}
		({h: n, l: r} = N(this.Ah | 0, this.Al | 0, n | 0, r | 0)), {h: i, l: a} = N(this.Bh | 0, this.Bl | 0, i | 0, a | 0), {h: o, l: s} = N(this.Ch | 0, this.Cl | 0, o | 0, s | 0), {h: c, l: l} = N(this.Dh | 0, this.Dl | 0, c | 0, l | 0), {h: u, l: d} = N(this.Eh | 0, this.El | 0, u | 0, d | 0), {h: f, l: p} = N(this.Fh | 0, this.Fl | 0, f | 0, p | 0), {h: m, l: h} = N(this.Gh | 0, this.Gl | 0, m | 0, h | 0), {h: g, l: _} = N(this.Hh | 0, this.Hl | 0, g | 0, _ | 0), this.set(n, r, i, a, o, s, c, l, u, d, f, p, m, h, g, _);
	}
	roundClean() {
		je(I, L);
	}
	destroy() {
		this.destroyed = !0, je(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
	}
}, Ye = class extends Je {
	constructor() {
		super(64, We);
	}
}, Xe = /* @__PURE__ */ Be(() => new Ye(), /* @__PURE__ */ He(3));
//#endregion
//#region node_modules/@noble/curves/utils.js
function Ze(e, t, n = () => {}) {
	if (!Array.isArray(e)) throw TypeError(`"${t}" expected array, got type=${typeof e}`);
	for (let r = 0; r < e.length; r++) n(e[r], `${t}[${r}]`);
	return e;
}
var R = (e, t, n) => F(e, t, n), Qe = P;
function z(e, t = "object") {
	if (typeof e != "object" || !e || Array.isArray(e)) throw TypeError(t === "object" ? "expected valid options object" : `"${t}" expected object, got type=${typeof e}`);
	return e;
}
function B(e, t) {
	if (typeof e != "function") throw TypeError(`"${t}" is invalid: expected function, got ${typeof e}`);
	return e;
}
var $e = Fe, et = (...e) => Re(...e), tt = (e) => Le(e), nt = Te, rt = (e) => Ve(e), it = /* @__PURE__ */ BigInt(0), at = /* @__PURE__ */ BigInt(1), ot = (e) => e ? `"${e}" ` : "";
function V(e, t = "") {
	if (typeof e != "boolean") throw TypeError(ot(t) + "expected boolean, got type=" + typeof e);
	return e;
}
function st(e) {
	if (typeof e == "bigint") {
		if (!U(e)) throw RangeError("positive bigint expected, got " + e);
	} else Qe(e);
	return e;
}
function H(e, t = "") {
	if (typeof e != "number") {
		let n = t && `"${t}" `;
		throw TypeError(n + "expected number, got type=" + typeof e);
	}
	if (!Number.isSafeInteger(e)) {
		let n = t && `"${t}" `;
		throw RangeError(n + "expected safe integer, got " + e);
	}
}
function ct(e) {
	if (typeof e != "string") throw TypeError("hex string expected, got " + typeof e);
	return e === "" ? it : BigInt("0x" + e);
}
function lt(e) {
	return ct(Fe(e));
}
function ut(e) {
	return ct(Fe(pt(F(e)).reverse()));
}
function dt(e, t) {
	if (P(t), t === 0) throw Error("zero output length is invalid");
	e = st(e);
	let n = t * 2, r = e.toString(16);
	if (r.length > n) throw RangeError("number is too large");
	return Le(r.padStart(n, "0"));
}
function ft(e, t) {
	return dt(e, t).reverse();
}
function pt(e) {
	return Uint8Array.from(R(e));
}
function U(e) {
	return typeof e == "bigint" && it <= e;
}
function mt(e, t, n) {
	return U(e) && U(t) && U(n) && t <= e && e < n;
}
function ht(e, t, n, r) {
	if (!mt(t, n, r)) throw RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function gt(e) {
	if (e < it) throw Error("expected non-negative bigint, got " + e);
	return e === it ? 0 : e.toString(2).length;
}
var _t = (e) => (H(e, "n"), (at << BigInt(e)) - at);
function W(e, t = {}, n = {}, r = "object") {
	z(e, r), z(t, "fields"), z(n, "optFields");
	function i(t, n, i) {
		let a = r === "object" ? `param "${String(t)}"` : `"${r}.${String(t)}"`, o = e[t];
		if (!Object.hasOwn(e, t) && (i ? o !== void 0 : n !== "function")) throw TypeError(`${a} is invalid: expected own property`);
		if (i && o === void 0) return;
		let s = typeof o;
		if (s !== n || o === null) throw TypeError(`${a} is invalid: expected ${n}, got ${s}`);
	}
	let a = (e, t) => Object.entries(e).forEach(([e, n]) => i(e, n, t));
	a(t, !1), a(n, !0);
}
//#endregion
//#region node_modules/@noble/curves/abstract/modular.js
var G = /* @__PURE__ */ BigInt(0), K = /* @__PURE__ */ BigInt(1), q = /* @__PURE__ */ BigInt(2), vt = /* @__PURE__ */ BigInt(3), yt = /* @__PURE__ */ BigInt(4), bt = /* @__PURE__ */ BigInt(5), xt = /* @__PURE__ */ BigInt(7), St = /* @__PURE__ */ BigInt(8), Ct = /* @__PURE__ */ BigInt(9), wt = /* @__PURE__ */ BigInt(15), Tt = /* @__PURE__ */ BigInt(16), Et = /* @__PURE__ */ BigInt("0x10000000000000000");
function J(e, t) {
	if (t <= G) throw Error("mod: expected positive modulus, got " + t);
	let n = e % t;
	return n >= G ? n : t + n;
}
function Dt(e, t, n) {
	if (n <= K) throw Error("pow: expected modulus > 1, got " + n);
	if (typeof t != "bigint") throw TypeError("invalid exponent: expected bigint, got " + typeof t);
	if (t < G) throw Error("invalid exponent, negatives unsupported");
	if (t === G) return K;
	if (t === K) return e;
	let r = e % n;
	if (r < G && (r += n), t < Et) {
		let e = K;
		for (; t > G;) t & K && (e = e * r % n), r = r * r % n, t >>= K;
		return e;
	}
	let i = [];
	for (; t > G;) i.push(Number(t & wt)), t >>= yt;
	let a = Array(16);
	a[0] = K, a[1] = r;
	for (let e = 2; e < 16; e++) a[e] = a[e - 1] * r % n;
	let o = a[i[i.length - 1]];
	for (let e = i.length - 2; e >= 0; e--) {
		o = o * o % n, o = o * o % n, o = o * o % n, o = o * o % n;
		let t = i[e];
		t !== 0 && (o = o * a[t] % n);
	}
	return o;
}
function Y(e, t, n) {
	if (n <= K) throw Error("pow2: expected modulus > 1, got " + n);
	if (t < G) throw Error("pow2: expected non-negative exponent, got " + t);
	let r = e;
	for (; t-- > G;) r *= r, r %= n;
	return r;
}
function Ot(e, t) {
	if (e === G) throw Error("invert: expected non-zero number");
	if (t <= K) throw Error("invert: expected modulus > 1, got " + t);
	let n = J(e, t), r = t, i = G, a = K;
	for (; n !== G;) {
		let e = r / n, t = r - n * e, o = i - a * e;
		r = n, n = t, i = a, a = o;
	}
	if (r !== K) throw Error("invert: does not exist");
	return J(i, t);
}
function kt(e, t, n) {
	let r = e;
	if (!r.eql(r.sqr(t), n)) throw Error("Cannot find square root");
}
function At(e, t) {
	if ((e & K) === G) throw Error(t + ": expected odd modulus, got " + e);
}
function jt(e, t) {
	let n = e, r = (n.ORDER + K) / yt, i = n.pow(t, r);
	return kt(n, i, t), i;
}
function Mt(e, t) {
	let n = e, r = (n.ORDER - bt) / St, i = n.mul(t, q), a = n.pow(i, r), o = n.mul(t, a), s = n.mul(n.mul(o, q), a), c = n.mul(o, n.sub(s, n.ONE));
	return kt(n, c, t), c;
}
function Nt(e) {
	let t = Ut(e), n = Pt(e), r = n(t, t.neg(t.ONE)), i = n(t, r), a = n(t, t.neg(r)), o = (e + xt) / Tt;
	return ((e, t) => {
		let n = e, s = n.pow(t, o), c = n.mul(s, r), l = n.mul(s, i), u = n.mul(s, a), d = n.eql(n.sqr(c), t), f = n.eql(n.sqr(l), t);
		s = n.cmov(s, c, d), c = n.cmov(u, l, f);
		let p = n.eql(n.sqr(c), t), m = n.cmov(s, c, p);
		return kt(n, m, t), m;
	});
}
function Pt(e) {
	if (e < vt) throw Error("sqrt is not defined for small field");
	At(e, "tonelliShanks");
	let t = e - K, n = 0;
	for (; t % q === G;) t /= q, n++;
	let r = q, i = Ut(e);
	for (; zt(i, r) === 1;) if (r++ > 1e3) throw Error("Cannot find square root: probably non-prime P");
	if (n === 1) return jt;
	let a = i.pow(r, t), o = (t + K) / q;
	return function(e, r) {
		let i = e;
		if (i.is0(r)) return r;
		if (zt(i, r) !== 1) throw Error("Cannot find square root");
		let s = n, c = i.mul(i.ONE, a), l = i.pow(r, t), u = i.pow(r, o);
		for (; !i.eql(l, i.ONE);) {
			if (i.is0(l)) throw Error("Cannot find square root: probably non-prime P");
			let e = 1, t = i.sqr(l);
			for (; !i.eql(t, i.ONE);) if (e++, t = i.sqr(t), e === s) throw Error("Cannot find square root");
			let n = K << BigInt(s - e - 1), r = i.pow(c, n);
			s = e, c = i.sqr(r), l = i.mul(l, c), u = i.mul(u, r);
		}
		return u;
	};
}
function Ft(e) {
	return At(e, "Fp.sqrt"), e % yt === vt ? jt : e % St === bt ? Mt : e % Tt === Ct ? Nt(e) : Pt(e);
}
var It = (e, t) => (J(e, t) & K) === K, Lt = [
	"create",
	"isValid",
	"is0",
	"neg",
	"inv",
	"sqrt",
	"sqr",
	"eql",
	"add",
	"sub",
	"mul",
	"pow",
	"div",
	"addN",
	"subN",
	"mulN",
	"sqrN"
];
function X(e) {
	if (z(e, "field"), typeof e.ORDER != "bigint") throw TypeError("param \"ORDER\" is invalid: expected bigint, got " + typeof e.ORDER);
	H(e.BYTES, "BYTES"), H(e.BITS, "BITS");
	for (let t of Lt) B(e[t], "field." + t);
	if (e.BYTES < 1 || e.BITS < 1) throw Error("invalid field: expected BYTES/BITS > 0");
	if (e.ORDER <= K) throw Error("invalid field: expected ORDER > 1, got " + e.ORDER);
	return e;
}
function Rt(e, t, n = !1) {
	X(e), Ze(t, "nums"), V(n, "passZero");
	let r = e, i = Array(t.length).fill(n ? r.ZERO : void 0), a = t.reduce((e, t, n) => r.is0(t) ? e : (i[n] = e, r.mul(e, t)), r.ONE), o = r.inv(a);
	return t.reduceRight((e, t, n) => r.is0(t) ? e : (i[n] = r.mul(e, i[n]), r.mul(e, t)), o), i;
}
function zt(e, t) {
	X(e);
	let n = e;
	At(n.ORDER, "FpLegendre");
	let r = (n.ORDER - K) / q, i = n.pow(t, r), a = n.eql(i, n.ONE), o = n.eql(i, n.ZERO), s = n.eql(i, n.neg(n.ONE));
	if (!a && !o && !s) throw Error("invalid Legendre symbol result");
	return a ? 1 : o ? 0 : -1;
}
function Bt(e, t) {
	if (t !== void 0 && Qe(t), e <= G) throw Error("invalid n length: expected positive n, got " + e);
	if (t !== void 0 && t < 1) throw Error("invalid n length: expected positive bit length, got " + t);
	let n = gt(e);
	if (t !== void 0 && t < n) throw Error(`invalid n length: expected nBitLength (${t}) >= bitLen(n) (${n})`);
	let r = t === void 0 ? n : t;
	return {
		nBitLength: r,
		nByteLength: Math.ceil(r / 8)
	};
}
var Vt = /* @__PURE__ */ new WeakMap(), Ht = class {
	ORDER;
	BITS;
	BYTES;
	isLE;
	ZERO = G;
	ONE = K;
	_lengths;
	_mod;
	constructor(e, t = {}) {
		if (e <= K) throw Error("invalid field: expected ORDER > 1, got " + e);
		let n;
		this.isLE = !1, typeof t == "object" && t && (typeof t.BITS == "number" && (n = t.BITS), typeof t.sqrt == "function" && Object.defineProperty(this, "sqrt", {
			value: t.sqrt,
			enumerable: !0
		}), typeof t.isLE == "boolean" && (this.isLE = t.isLE), t.allowedLengths && (this._lengths = Object.freeze(t.allowedLengths.slice())), typeof t.modFromBytes == "boolean" && (this._mod = t.modFromBytes));
		let { nBitLength: r, nByteLength: i } = Bt(e, n);
		if (i > 2048) throw Error("invalid field: expected ORDER of <= 2048 bytes");
		this.ORDER = e, this.BITS = r, this.BYTES = i, Object.freeze(this);
	}
	create(e) {
		return J(e, this.ORDER);
	}
	isValid(e) {
		if (typeof e != "bigint") throw TypeError("invalid field element: expected bigint, got " + typeof e);
		return G <= e && e < this.ORDER;
	}
	is0(e) {
		return e === G;
	}
	isValidNot0(e) {
		return !this.is0(e) && this.isValid(e);
	}
	isOdd(e) {
		return (e & K) === K;
	}
	neg(e) {
		return J(-e, this.ORDER);
	}
	eql(e, t) {
		return e === t;
	}
	sqr(e) {
		return J(e * e, this.ORDER);
	}
	add(e, t) {
		return J(e + t, this.ORDER);
	}
	sub(e, t) {
		return J(e - t, this.ORDER);
	}
	mul(e, t) {
		return J(e * t, this.ORDER);
	}
	pow(e, t) {
		return Dt(e, t, this.ORDER);
	}
	div(e, t) {
		return J(e * Ot(t, this.ORDER), this.ORDER);
	}
	sqrN(e) {
		return e * e;
	}
	addN(e, t) {
		return e + t;
	}
	subN(e, t) {
		return e - t;
	}
	mulN(e, t) {
		return e * t;
	}
	inv(e) {
		return Ot(e, this.ORDER);
	}
	sqrt(e) {
		let t = Vt.get(this);
		return t || Vt.set(this, t = Ft(this.ORDER)), t(this, e);
	}
	toBytes(e) {
		return this.isLE ? ft(e, this.BYTES) : dt(e, this.BYTES);
	}
	fromBytes(e, t = !1) {
		R(e);
		let { _lengths: n, BYTES: r, isLE: i, ORDER: a, _mod: o } = this;
		if (n) {
			if (e.length < 1 || !n.includes(e.length) || e.length > r) throw Error("Field.fromBytes: expected " + n + " bytes, got " + e.length);
			let t = new Uint8Array(r);
			t.set(e, i ? 0 : t.length - e.length), e = t;
		}
		if (e.length !== r) throw Error("Field.fromBytes: expected " + r + " bytes, got " + e.length);
		let s = i ? ut(e) : lt(e);
		if (o && (s = J(s, a)), !t && !this.isValid(s)) throw Error("invalid field element: outside of range 0..ORDER");
		return s;
	}
	invertBatch(e) {
		return Rt(this, e, !0);
	}
	cmov(e, t, n) {
		return V(n, "condition"), n ? t : e;
	}
};
function Ut(e, t = {}) {
	return Object.freeze(Ht.prototype), new Ht(e, t);
}
//#endregion
//#region node_modules/@noble/curves/abstract/curve.js
var Wt = /* @__PURE__ */ BigInt(0), Z = /* @__PURE__ */ BigInt(1), Gt = /* @__PURE__ */ BigInt(4), Kt = 16, qt = 128, Jt = 5, Yt = 2 ** 31;
function Xt(e) {
	let t = e;
	if (typeof t != "function") throw TypeError("\"Point\" expected constructor, got type=" + typeof e);
	B(t.fromAffine, "Point.fromAffine"), B(t.fromBytes, "Point.fromBytes"), B(t.fromHex, "Point.fromHex"), z(t.BASE, "Point.BASE"), z(t.ZERO, "Point.ZERO"), X(t.Fp), X(t.Fn);
}
function Zt(e, t) {
	Xt(e), tn(t, e);
	let n = Rt(e.Fp, t.map((e) => e.Z));
	return t.map((t, r) => e.fromAffine(t.toAffine(n[r])));
}
function Qt(e, t, n = 1) {
	if (!Number.isSafeInteger(e) || e < n || e > t) throw Error("invalid window size, expected [" + n + ".." + t + "], got W=" + e);
}
function $t(e, t) {
	let n = e * (4 * t + 128);
	if (n > Yt) throw Error("invalid window size: table would need ~" + Math.ceil(n / 2 ** 20) + " MiB, max " + Yt / 2 ** 20 + " MiB");
}
function en(e, t) {
	if (e !== void 0) {
		B(e, "randomBytes");
		try {
			let n = e(t);
			if (!nt(n) || n.length !== t) return;
		} catch {
			return;
		}
		return e;
	}
}
function tn(e, t) {
	Ze(e, "points"), e.forEach((e, n) => {
		if (!(e instanceof t)) throw Error("invalid point at index " + n);
	});
}
function nn(e, t, n) {
	if (!Array.isArray(e)) throw Error("array of scalars expected");
	e.forEach((e, r) => {
		if (!(n === void 0 ? t.isValid(e) : U(e) && e < n)) throw Error("invalid scalar at index " + r);
	});
}
var rn = /* @__PURE__ */ new WeakMap();
function an(e) {
	return rn.get(e) || 1;
}
function on(e, t) {
	let n = e.double(), r = [e];
	for (let e = 1; e < t; e++) r.push(r[e - 1].add(n));
	return r;
}
function sn(e, t) {
	let n = 2 ** t, r = n / 2, i = BigInt(n - 1), a = [];
	for (; e > Wt;) {
		let t = 0;
		e & Z && (t = Number(e & i), t >= r && (t -= n), e -= BigInt(t)), a.push(t), e >>= Z;
	}
	return a;
}
function cn(e, t, n) {
	let r = 2 ** t, i = r / 2, a = BigInt(r - 1), o = BigInt(t), s = [];
	for (let t = 0; t < n; t++) {
		let t = Number(e & a);
		e >>= o, t > i && (t -= r, e += Z), s.push(t);
	}
	if (e !== Wt) throw Error("invalid wnaf");
	return s;
}
function ln(e, t, n) {
	let r = 0;
	for (let e of n) r = Math.max(r, e.length);
	let i = e;
	for (let e = r - 1; e >= 0; e--) {
		e !== r - 1 && (i = i.double());
		for (let r = 0; r < n.length; r++) {
			let a = n[r][e];
			if (a) {
				let e = t[r][Math.abs(a) - 1 >> 1];
				i = i.add(a < 0 ? e.negate() : e);
			}
		}
	}
	return i;
}
var un = class {
	Point;
	BASE;
	ZERO;
	randomBytes;
	wnafPrecomputes = /* @__PURE__ */ new WeakMap();
	baseCanBeBlinded;
	bits;
	constructor(e, t) {
		Xt(e), this.randomBytes = en(t, Kt), this.Point = e, this.BASE = e.BASE, this.ZERO = e.ZERO, this.bits = e.Fn.BITS;
	}
	buildWnafTable(e, t, n) {
		let r = Math.ceil(n / t) + 1, i = 2 ** (t - 1), a = [], o = e;
		for (let e = 0; e < r; e++) {
			let e = o;
			for (let t = 0; t < i; t++) a.push(e), e = e.add(o);
			o = a[a.length - 1].double();
		}
		return {
			W: t,
			bits: n,
			windows: r,
			comp: a
		};
	}
	wnafCachedCT(e, t) {
		let { W: n, windows: r, comp: i } = e, a = 2 ** (n - 1), o = cn(t, n, r), s = this.ZERO, c = this.BASE;
		for (let e = 0; e < r; e++) {
			let t = o[e], n = e * a, r = Math.abs(t) - 1, l = i[n];
			for (let e = 1; e < a; e++) l = e === r ? i[n + e] : l;
			let u = l.negate();
			t === 0 ? c = c.add(i[n]) : s = s.add(t < 0 ? u : l);
		}
		return {
			p: s,
			f: c
		};
	}
	getWnafPrecomputes(e, t, n, r) {
		let i = this.wnafPrecomputes.get(t), a = i?.find((t) => t.W === e && t.bits === n);
		return a || (a = this.buildWnafTable(t, e, n), typeof r == "function" && (a = {
			...a,
			comp: r(a.comp)
		}), i || (i = [], this.wnafPrecomputes.set(t, i)), i.push(a)), a;
	}
	assertPoint(e) {
		if (!(e instanceof this.Point)) throw TypeError("\"point\" expected Point instance, got type=" + typeof e);
	}
	validateMulInput(e, t) {
		if (this.assertPoint(e), !mt(t, Z, this.Point.Fn.ORDER)) throw Error("invalid scalar");
	}
	runCT(e, t, n, r) {
		let i = an(e);
		return i === 1 ? this.fixedWindowCT(e, t, n) : this.wnafCachedCT(this.getWnafPrecomputes(i, e, n, r), t);
	}
	mulCT(e, t, n) {
		return this.validateMulInput(e, t), this.runCT(e, t, this.bits, n);
	}
	mulCTBlinded(e, t, n) {
		if (this.validateMulInput(e, t), this.randomBytes === void 0) throw Error("randomBytes is required for scalar blinding");
		let r = this.Point.Fn.BITS + qt, i = this.randomBytes(Kt);
		if (!nt(i) || i.length !== Kt) throw Error("randomBytes returned invalid byte array");
		i[0] = i[0] & 63 | 128;
		let a = t + lt(i) * this.Point.Fn.ORDER;
		return this.runCT(e, a, r, n);
	}
	fixedWindowCT(e, t, n) {
		let r = Jt, i = _t(r), a = Array(32);
		a[0] = this.ZERO;
		for (let t = 1; t < 32; t++) a[t] = a[t - 1].add(e);
		let o = Math.ceil(n / r), s = this.ZERO;
		for (let e = o - 1; e >= 0; e--) {
			if (e !== o - 1) for (let e = 0; e < r; e++) s = s.double();
			let n = Number(t >> BigInt(e * r) & i), c = a[0];
			for (let e = 1; e < 32; e++) c = e === n ? a[e] : c;
			s = s.add(c);
		}
		return {
			p: s,
			f: s
		};
	}
	shouldBlind(e, t) {
		return this.randomBytes === void 0 ? !1 : t === Z || e === this.BASE && (this.baseCanBeBlinded === void 0 && (this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0()), this.baseCanBeBlinded);
	}
	mulSecret(e, t, n, r) {
		return this.shouldBlind(e, n) ? this.mulCTBlinded(e, t, r) : this.mulCT(e, t, r);
	}
	mulUnsafe(e, t, n) {
		if (this.assertPoint(e), !U(t)) throw Error("invalid scalar");
		let r = an(e);
		if (r === 1 || t >= this.Point.Fn.ORDER) return dn(this.Point, [e], [t], !0);
		let i = this.getWnafPrecomputes(r, e, this.bits, n);
		return this.wnafCachedCT(i, t).p;
	}
	setWindowSize(e, t) {
		this.assertPoint(e), Qt(t, this.bits), $t((Math.ceil((this.bits + qt) / t) + 1) * 2 ** (t - 1), this.Point.Fp.BYTES), rn.set(e, t), this.wnafPrecomputes.delete(e);
	}
	hasWindowSize(e) {
		return an(e) !== 1;
	}
};
function dn(e, t, n, r = !1) {
	if (Xt(e), tn(t, e), V(r, "allowOversized"), nn(n, e.Fn, r ? e.Fn.ORDER ** Gt : void 0), t.length !== n.length) throw Error("arrays of points and scalars must have equal length");
	let i = t.map((e) => on(e, 4)), a = n.map((e) => sn(e, 4));
	return ln(e.ZERO, i, a);
}
function fn(e, t, n) {
	if (t) {
		if (t.ORDER !== e) throw Error("Field.ORDER must match order: Fp == p, Fn == n");
		return X(t), t;
	}
	return Ut(e, { isLE: n });
}
function pn(e, t, n = {}, r) {
	if (e !== "weierstrass" && e !== "edwards") throw Error("expected curve type \"weierstrass\" or \"edwards\"");
	if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object") throw Error(`expected valid ${e} CURVE object`);
	W(n);
	for (let e of [
		"p",
		"n",
		"h"
	]) {
		let n = t[e];
		if (!(U(n) && n !== Wt)) throw Error(`CURVE.${e} must be positive bigint`);
	}
	let i = fn(t.p, n.Fp, r), a = fn(t.n, n.Fn, r), o = [
		"Gx",
		"Gy",
		"a",
		e === "weierstrass" ? "b" : "d"
	];
	for (let e of o) if (!i.isValid(t[e])) throw Error(`CURVE.${e} must be valid field element of CURVE.Fp`);
	return t = Object.freeze(Object.assign({}, t)), {
		CURVE: t,
		Fp: i,
		Fn: a
	};
}
function mn(e, t) {
	return function(n) {
		let r = e(n);
		return {
			secretKey: r,
			publicKey: t(r)
		};
	};
}
//#endregion
//#region node_modules/@noble/curves/abstract/edwards.js
var hn = /* @__PURE__ */ BigInt(0), gn = /* @__PURE__ */ BigInt(1), _n = /* @__PURE__ */ BigInt(2), vn = /* @__PURE__ */ BigInt(4), yn = /* @__PURE__ */ BigInt(8);
function bn(e, t, n, r) {
	let i = e.sqr(n), a = e.sqr(r), o = e.add(e.mul(t.a, i), a), s = e.add(e.ONE, e.mul(t.d, e.mul(i, a)));
	return e.eql(o, s);
}
function xn(e, t = {}) {
	W(t, {}, {}, "extraOpts");
	let n = t, r = pn("edwards", e, n, n.FpFnLE), { Fp: i, Fn: a } = r, o = r.CURVE, { h: s } = o;
	if (zt(i, o.a) !== 1) throw Error("edwards: CURVE.a must be a square in Fp for complete addition formulas");
	if (zt(i, o.d) !== -1) throw Error("edwards: CURVE.d must be a non-square in Fp for complete addition formulas");
	W(n, {}, {
		uvRatio: "function",
		randomBytes: "function"
	});
	let c = n.randomBytes === void 0 ? rt : n.randomBytes, l = _n << BigInt(i.BYTES * 8) - gn;
	function u(e) {
		if (!i.isOdd) throw Error("Field does not have .isOdd()");
		return i.isOdd(e);
	}
	let d = n.uvRatio === void 0 ? (e, t) => {
		try {
			return {
				isValid: !0,
				value: i.sqrt(i.div(e, t))
			};
		} catch {
			return {
				isValid: !1,
				value: hn
			};
		}
	} : n.uvRatio;
	if (!bn(i, o, o.Gx, o.Gy)) throw Error("bad curve params: generator point");
	let f = i.eql(o.a, i.neg(i.ONE)) ? (e) => i.neg(e) : i.eql(o.a, i.ONE) ? (e) => e : (e) => i.mul(o.a, e);
	function p(e, t, n = !1) {
		let r = n ? gn : hn;
		return ht("coordinate " + e, t, r, l), t;
	}
	function m(e) {
		if (!(e instanceof h)) throw Error("EdwardsPoint expected");
	}
	class h {
		static BASE = new h(o.Gx, o.Gy, i.ONE, i.mul(o.Gx, o.Gy));
		static ZERO = new h(i.ZERO, i.ONE, i.ONE, i.ZERO);
		static Fp = i;
		static Fn = a;
		X;
		Y;
		Z;
		T;
		constructor(e, t, n, r) {
			this.X = p("x", e), this.Y = p("y", t), this.Z = p("z", n, !0), this.T = p("t", r), Object.freeze(this);
		}
		static CURVE() {
			return o;
		}
		static fromAffine(e) {
			if (e instanceof h) throw Error("extended point not allowed");
			let { x: t, y: n } = e || {};
			return p("x", t), p("y", n), new h(t, n, i.ONE, i.mul(t, n));
		}
		static fromBytes(e, t = !1) {
			let n = i.BYTES, { a: r, d: a } = o;
			e = pt(R(e, n, "point")), V(t, "zip215");
			let s = pt(e), c = e[n - 1];
			s[n - 1] = c & -129;
			let f = ut(s);
			ht("point.y", f, hn, t ? l : i.ORDER);
			let p = i.sqr(f), m = i.sub(p, i.ONE), g = i.sub(i.mulN(a, p), r), { isValid: _, value: v } = d(m, g);
			if (!_) throw Error("bad point: invalid y coordinate");
			let y = u(v), b = !!(c & 128);
			if (!t && i.is0(v) && b) throw Error("bad point: x=0 and x_0=1");
			return b !== y && (v = i.neg(v)), h.fromAffine({
				x: v,
				y: f
			});
		}
		static fromHex(e, t = !1) {
			return h.fromBytes(tt(e), t);
		}
		get x() {
			return this.toAffine().x;
		}
		get y() {
			return this.toAffine().y;
		}
		precompute(e = 6, t = !0) {
			return _.setWindowSize(this, e), t || this.multiply(_n), this;
		}
		assertValidity() {
			let e = this, { a: t, d: n } = o;
			if (e.is0()) throw Error("bad point: ZERO");
			let { X: r, Y: a, Z: s, T: c } = e, l = i.sqr(r), u = i.sqr(a), d = i.sqr(s), f = i.sqr(d), p = i.mul(l, t), m = i.mul(i.add(p, u), d), h = i.add(f, i.mul(n, i.mul(l, u)));
			if (!i.eql(m, h)) throw Error("bad point: equation left != right (1)");
			let g = i.mul(r, a), _ = i.mul(s, c);
			if (!i.eql(g, _)) throw Error("bad point: equation left != right (2)");
		}
		equals(e) {
			m(e);
			let { X: t, Y: n, Z: r } = this, { X: a, Y: o, Z: s } = e, c = i.mul(t, s), l = i.mul(a, r), u = i.mul(n, s), d = i.mul(o, r);
			return i.eql(c, l) && i.eql(u, d);
		}
		is0() {
			return this.equals(h.ZERO);
		}
		negate() {
			return new h(i.neg(this.X), this.Y, this.Z, i.neg(this.T));
		}
		double() {
			let { X: e, Y: t, Z: n } = this, r = i.sqr(e), a = i.sqr(t), o = i.mul(i.sqr(n), _n), s = f(r), c = i.addN(e, t), l = i.sub(i.subN(i.sqr(c), r), a), u = i.addN(s, a), d = i.subN(u, o), p = i.subN(s, a), m = i.mul(l, d), g = i.mul(u, p), _ = i.mul(l, p), v = i.mul(d, u);
			return new h(m, g, v, _);
		}
		add(e) {
			m(e);
			let { d: t } = o, { X: n, Y: r, Z: a, T: s } = this, { X: c, Y: l, Z: u, T: d } = e, p = i.mul(n, c), g = i.mul(r, l), _ = i.mul(i.mulN(s, t), d), v = i.mul(a, u), y = i.sub(i.subN(i.mulN(i.addN(n, r), i.addN(c, l)), p), g), b = i.subN(v, _), x = i.addN(v, _), S = i.sub(g, f(p)), C = i.mul(y, b), w = i.mul(x, S), T = i.mul(y, S), E = i.mul(b, x);
			return new h(C, w, E, T);
		}
		subtract(e) {
			return m(e), this.add(e.negate());
		}
		multiply(e) {
			if (!a.isValidNot0(e)) throw RangeError("invalid scalar: expected 1 <= sc < curve.n");
			let { p: t, f: n } = _.mulSecret(this, e, s, g);
			return g([t, n])[0];
		}
		multiplyUnsafe(e) {
			if (!a.isValid(e)) throw RangeError("invalid scalar: expected 0 <= sc < curve.n");
			return e === hn ? h.ZERO : this.is0() || e === gn ? this : _.mulUnsafe(this, e, g);
		}
		isSmallOrder() {
			return this.clearCofactor().is0();
		}
		isTorsionFree() {
			return _.mulUnsafe(this, o.n).is0();
		}
		toAffine(e) {
			let t = this, n = e;
			if (n != null && typeof n != "bigint") throw TypeError("\"invertedZ\" expected bigint, got type=" + typeof n);
			let { X: r, Y: a, Z: o } = t, s = t.is0();
			n ??= s ? i.create(yn) : i.inv(o);
			let c = i.mul(r, n), l = i.mul(a, n), u = i.mul(o, n);
			if (s) return {
				x: i.ZERO,
				y: i.ONE
			};
			if (!i.eql(u, i.ONE)) throw Error("invZ was invalid");
			return {
				x: c,
				y: l
			};
		}
		clearCofactor() {
			return s === gn ? this : s === _n ? this.double() : s === vn ? this.double().double() : s === yn ? this.double().double().double() : this.multiplyUnsafe(s);
		}
		toBytes() {
			let { x: e, y: t } = this.toAffine(), n = i.toBytes(t);
			return n[n.length - 1] |= u(e) ? 128 : 0, n;
		}
		toHex() {
			return $e(this.toBytes());
		}
		toString() {
			return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
		}
	}
	let g = (e) => Zt(h, e), _ = new un(h, c);
	return _.bits >= 6 && h.BASE.precompute(6), Object.freeze(h.prototype), Object.freeze(h), h;
}
function Sn(e, t, n = {}) {
	if (Xt(e), typeof t != "function") throw Error("\"hash\" function param is required");
	let r = t, i = n;
	W(i, {}, {
		adjustScalarBytes: "function",
		randomBytes: "function",
		domain: "function",
		prehash: "function",
		zip215: "boolean",
		mapToCurve: "function",
		toMontgomery: "function",
		toMontgomerySecret: "function"
	});
	let { prehash: a } = i, { BASE: o, Fp: s, Fn: c } = e, l = r.outputLen, u = 2 * s.BYTES;
	if (l !== void 0 && (H(l, "hash.outputLen"), l !== u)) throw Error(`hash.outputLen must be ${u}, got ${l}`);
	let d = i.randomBytes === void 0 ? rt : i.randomBytes, f = i.toMontgomery, p = i.toMontgomerySecret, m = i.adjustScalarBytes === void 0 ? (e) => e : i.adjustScalarBytes, h = i.domain === void 0 ? (e, t, n) => {
		if (V(n, "phflag"), t.length || n) throw Error("Contexts/pre-hash are not supported");
		return e;
	} : i.domain;
	function g(e) {
		return c.create(ut(e));
	}
	function _(e) {
		let t = T.secretKey;
		R(e, T.secretKey, "secretKey");
		let n = R(r(e), 2 * t, "hashedSecretKey"), i = m(n.slice(0, t));
		return {
			head: i,
			prefix: n.slice(t, 2 * t),
			scalar: g(i)
		};
	}
	function v(e) {
		let { head: t, prefix: n, scalar: r } = _(e), i = o.multiply(r);
		return {
			head: t,
			prefix: n,
			scalar: r,
			point: i,
			pointBytes: i.toBytes()
		};
	}
	function y(e) {
		return v(e).pointBytes;
	}
	function b(e = Uint8Array.of(), ...t) {
		let n = et(...t);
		return g(r(h(n, R(e, void 0, "context"), !!a)));
	}
	function x(e, t, n = {}) {
		W(n, {}, {}, "options"), e = pt(R(e, void 0, "message")), a && (e = a(e));
		let { prefix: r, scalar: i, pointBytes: s } = v(t), l = b(n.context, r, e), u = o.multiply(l).toBytes(), d = b(n.context, u, s, e), f = c.create(l + d * i);
		if (!c.isValid(f)) throw Error("sign failed: invalid s");
		return R(et(u, c.toBytes(f)), T.signature, "result");
	}
	let S = { zip215: i.zip215 };
	function C(t, n, r, i = S) {
		W(i);
		let { context: s } = i, c = i.zip215 === void 0 ? !!S.zip215 : i.zip215, l = T.signature;
		t = R(t, l, "signature"), n = R(n, void 0, "message"), r = R(r, T.publicKey, "publicKey"), c !== void 0 && V(c, "zip215"), a && (n = a(n));
		let u = l / 2, d = t.subarray(0, u), f = ut(t.subarray(u, l)), p, m, h;
		try {
			p = e.fromBytes(r, c), m = e.fromBytes(d, c), h = o.multiplyUnsafe(f);
		} catch {
			return !1;
		}
		if (!c && p.isSmallOrder()) return !1;
		let g = b(s, d, r, n);
		return m.add(p.multiplyUnsafe(g)).subtract(h).clearCofactor().is0();
	}
	let w = s.BYTES, T = {
		secretKey: w,
		publicKey: w,
		signature: 2 * w,
		seed: w
	};
	function E(e) {
		return e = e === void 0 ? d(T.seed) : e, R(e, T.seed, "seed");
	}
	function ee(e) {
		return nt(e) && e.length === T.secretKey;
	}
	function D(t, n) {
		try {
			return !!e.fromBytes(t, n === void 0 ? S.zip215 : n);
		} catch {
			return !1;
		}
	}
	let te = {
		getExtendedPublicKey: v,
		randomSecretKey: E,
		isValidSecretKey: ee,
		isValidPublicKey: D,
		toMontgomery(t) {
			if (f === void 0) throw Error("Montgomery conversion is not supported for this curve");
			return f(e.fromBytes(t));
		},
		toMontgomerySecret(e) {
			if (p === void 0) throw Error("Montgomery conversion is not supported for this curve");
			return p(e);
		}
	};
	return Object.freeze(T), Object.freeze(te), Object.freeze({
		keygen: mn(E, y),
		getPublicKey: y,
		sign: x,
		verify: C,
		utils: te,
		Point: e,
		lengths: T
	});
}
//#endregion
//#region node_modules/@noble/curves/ed25519.js
var Cn = /* @__PURE__ */ BigInt(1), wn = /* @__PURE__ */ BigInt(2), Tn = /* @__PURE__ */ BigInt(5), En = /* @__PURE__ */ BigInt(8), Dn = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), On = {
	p: Dn,
	n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
	h: En,
	a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
	d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
	Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
	Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function kn(e) {
	let t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), a = Dn, o = e * e % a * e % a, s = Y(Y(o, wn, a) * o % a, Cn, a) * e % a, c = Y(s, Tn, a) * s % a, l = Y(c, t, a) * c % a, u = Y(l, n, a) * l % a, d = Y(u, r, a) * u % a;
	return {
		pow_p_5_8: Y(Y(Y(Y(d, i, a) * d % a, i, a) * d % a, t, a) * c % a, wn, a) * e % a,
		b2: o
	};
}
function An(e) {
	return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
var jn = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function Mn(e, t) {
	let n = Dn, r = J(t * t * t, n), i = kn(e * J(r * r * t, n)).pow_p_5_8, a = J(e * r * i, n), o = J(t * a * a, n), s = a, c = J(a * jn, n), l = o === e, u = o === J(-e, n), d = o === J(-e * jn, n);
	return l && (a = s), (u || d) && (a = c), It(a, n) && (a = J(-a, n)), {
		isValid: l || u,
		value: a
	};
}
var Nn = /* @__PURE__ */ xn(On, { uvRatio: Mn }), Pn = Nn.Fp;
function Fn(e) {
	let { y: t } = e;
	return Pn.toBytes(Pn.div(Cn + t, Cn - t));
}
function In(e) {
	let t = Nn.Fp.BYTES;
	return F(e, t), An(Xe(e.subarray(0, t))).subarray(0, t);
}
function Ln(e) {
	return Sn(Nn, Xe, Object.assign({
		adjustScalarBytes: An,
		toMontgomery: Fn,
		toMontgomerySecret: In,
		zip215: !0
	}, e));
}
var Q = /* @__PURE__ */ Ln({}), $ = 32, Rn = 248, zn = 127, Bn = 64, Vn = 128, Hn = 127;
function Un(e) {
	e.length < $ || (e[0] = (e[0] ?? 0) & Rn, e[31] = (e[31] ?? 0) & zn | Bn);
}
function Wn() {
	let e = new Uint8Array(s($));
	Un(e);
	let t = Yn(e) % Q.Point.CURVE().n;
	return [Q.Point.BASE.multiply(t).toBytes(), Uint8Array.from(e)];
}
function Gn(e, t) {
	let n = i("SHA256");
	return n.update(t), n.sign(e);
}
function Kn(e, t, n) {
	try {
		let r = a("SHA256");
		return r.update(t), r.verify(e, Buffer.from(n));
	} catch {
		return !1;
	}
}
function qn(e, n) {
	if (e.length !== $ || n.length !== $) throw Error("invalid key length");
	let r = Uint8Array.from(n);
	r[31] = (r[31] ?? 0) & Hn;
	let i = Yn(r), a = Jn(Q.Point.fromBytes(e).negate(), i).toBytes();
	return a[31] = (a[31] ?? 0) ^ Vn, t("sha512").update(a).digest();
}
function Jn(e, t) {
	let n = Q.Point.CURVE().n;
	if (t < n) return t === 0n ? Q.Point.ZERO : e.multiply(t);
	let r = t % n, i = t / n, a = r === 0n ? Q.Point.ZERO : e.multiply(r), o = e.multiply(n - 1n).add(e).multiply(i);
	return a.add(o);
}
function Yn(e) {
	let t = 0n;
	for (let n = e.length - 1; n >= 0; n--) t = t << 8n | BigInt(e[n]);
	return t;
}
//#endregion
export { l as C, _ as S, g as _, Jn as a, m as b, Q as c, w as d, T as f, u as g, d as h, qn as i, x as l, ee as m, Un as n, Gn as o, S as p, Wn as r, Kn as s, Yn as t, C as u, f as v, c as w, h as x, p as y };

//# sourceMappingURL=primitives-DpKiXbMi.js.map