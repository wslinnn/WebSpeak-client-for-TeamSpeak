import { o as e, r as t } from "./address-BfmovVpp.js";
import { n } from "./crypt-handshake-DziOY4Lq.js";
import { isIP as r } from "node:net";
import { createSocket as i } from "node:dgram";
//#region src/transport/packet.ts
var a = /* @__PURE__ */ function(e) {
	return e[e.Voice = 0] = "Voice", e[e.VoiceWhisper = 1] = "VoiceWhisper", e[e.Command = 2] = "Command", e[e.CommandLow = 3] = "CommandLow", e[e.Ping = 4] = "Ping", e[e.Pong = 5] = "Pong", e[e.Ack = 6] = "Ack", e[e.AckLow = 7] = "AckLow", e[e.Init1 = 8] = "Init1", e;
}({}), o = /* @__PURE__ */ function(e) {
	return e[e.Fragmented = 16] = "Fragmented", e[e.NewProtocol = 32] = "NewProtocol", e[e.Compressed = 64] = "Compressed", e[e.Unencrypted = 128] = "Unencrypted", e;
}({});
function s(e) {
	return e.typeFlagged & 15;
}
function c(e) {
	return e.typeFlagged & 240;
}
function l(e) {
	return !!(c(e) & 128);
}
function u(e) {
	let t = /* @__PURE__ */ new Uint8Array(5), n = new DataView(t.buffer);
	return n.setUint16(0, e.id, !1), n.setUint16(2, e.clientID, !1), t[4] = e.typeFlagged, t;
}
function d(e) {
	return {
		id: new DataView(e.buffer, e.byteOffset, e.byteLength).getUint16(0, !1),
		typeFlagged: e[2]
	};
}
function f(e) {
	let t = new DataView(e.buffer, e.byteOffset, e.byteLength);
	return {
		id: t.getUint16(0, !1),
		clientID: t.getUint16(2, !1),
		typeFlagged: e[4]
	};
}
//#endregion
//#region src/transport/generation-window.ts
var p = class {
	#e = 0;
	#t = 0;
	#n;
	#r;
	constructor(e, t) {
		this.#n = e, this.#r = t;
	}
	get generation() {
		return this.#t;
	}
	advance(e) {
		if (e <= 0) return;
		let t = this.#e + e, n = Math.floor(t / this.#n);
		n > 0 && (this.#t = Math.min(this.#t + n, 4294967295)), this.#e = t % this.#n;
	}
	advanceToExcluded(e) {
		let t = e - this.#e;
		t < 0 && (t += this.#n), this.advance(t + 1);
	}
	syncTo(e) {
		let t = e - this.#e;
		t < 0 && (t += this.#n), this.advance(t);
	}
	isInWindow(e) {
		let t = this.#e + this.#r;
		return t < this.#n ? e >= this.#e && e < t : e >= this.#e || e < t - this.#n;
	}
	mappedToIndex(e) {
		return this.#i(e) ? e + this.#n - this.#e : e - this.#e;
	}
	isOldPacket(e) {
		return this.mappedToIndex(e) < 0;
	}
	isFuturePacket(e) {
		return this.mappedToIndex(e) >= this.#r;
	}
	#i(e) {
		return this.#e > this.#n - this.#r && e < this.#e + this.#r - this.#n;
	}
	getGeneration(e) {
		return this.#i(e) ? this.#t + 1 : this.#t;
	}
	reset() {
		this.#e = 0, this.#t = 0;
	}
}, m = 4096, h = class {
	#e = new Int32Array(m);
	decompress(e) {
		let { headerLen: t, decompressedSize: n, flags: r } = g(e), i = new Uint8Array(n);
		if (!(r & 1)) return i.set(e.slice(t, t + n)), i;
		this.#e.fill(0);
		let a = {
			control: 1,
			sourcePos: t,
			destPos: 0,
			nextHashed: 0
		};
		for (; this.#t(e, a);) if (a.control & 1) {
			if (!this.#n(e, i, a)) break;
		} else if (this.#r(e, i, n, a)) break;
		return i;
	}
	#t(e, t) {
		return t.control === 1 ? t.sourcePos + 4 > e.length ? !1 : (t.control = (e[t.sourcePos] | e[t.sourcePos + 1] << 8 | e[t.sourcePos + 2] << 16 | e[t.sourcePos + 3] << 24) >>> 0, t.sourcePos += 4, !0) : !0;
	}
	#n(e, t, n) {
		if (n.control = n.control >>> 1 >>> 0, n.sourcePos + 2 > e.length) return !1;
		let r = e[n.sourcePos], i = e[n.sourcePos + 1];
		n.sourcePos += 2;
		let a = r >> 4 | i << 4, o = r & 15;
		if (o !== 0) o += 2;
		else {
			if (n.sourcePos >= e.length) return !1;
			o = e[n.sourcePos], n.sourcePos++;
		}
		let s = this.#e[a];
		for (let e = 0; e < o; e++) n.destPos < t.length && s + e < n.destPos && (t[n.destPos] = t[s + e], n.destPos++);
		let c = n.destPos + 1 - o;
		return this.#i(t, n, c), n.nextHashed = n.destPos, !0;
	}
	#r(e, t, n, r) {
		let i = Math.max(n, 10) - 10;
		if (r.destPos >= i) {
			for (; r.destPos < n;) {
				if (r.control === 1) {
					if (r.sourcePos += 4, r.sourcePos > e.length) break;
					r.control = (e[r.sourcePos - 4] | e[r.sourcePos - 3] << 8 | e[r.sourcePos - 2] << 16 | e[r.sourcePos - 1] << 24) >>> 0;
				}
				if (r.sourcePos >= e.length) break;
				t[r.destPos++] = e[r.sourcePos++], r.control = r.control >>> 1 >>> 0;
			}
			return !0;
		}
		if (r.sourcePos >= e.length || r.destPos >= t.length) return !0;
		t[r.destPos++] = e[r.sourcePos++], r.control = r.control >>> 1 >>> 0;
		let a = Math.max(r.destPos - 2, 0);
		return this.#i(t, r, a), r.nextHashed < a && (r.nextHashed = a), !1;
	}
	#i(e, t, n) {
		for (; t.nextHashed < n && !(t.nextHashed + 3 > e.length);) {
			let n = (e[t.nextHashed] | e[t.nextHashed + 1] << 8 | e[t.nextHashed + 2] << 16) >>> 0, r = (n >> 12 ^ n) & 4095;
			this.#e[r] = t.nextHashed, t.nextHashed++;
		}
	}
};
function g(e) {
	if (e.length < 3) throw Error("QuickLZ: data too short");
	let t = e[0];
	if ((t >> 2 & 3) != 1) throw Error("QuickLZ: only level 1 is supported");
	let n = t & 2 ? 9 : 3;
	if (e.length < n) throw Error("QuickLZ: data too short for header");
	let r;
	return r = t & 2 ? (e[5] | e[6] << 8 | e[7] << 16 | e[8] << 24) >>> 0 : e[2], {
		headerLen: n,
		decompressedSize: r,
		flags: t
	};
}
//#endregion
//#region src/transport/voice-trailer.ts
var _ = class {
	#e = [];
	add(e) {
		!Number.isFinite(e) || e < 0 || (this.#e.push(e), this.#e.length > 20 && this.#e.shift());
	}
	deviationMs() {
		let e = this.#e.length;
		if (e === 0) return null;
		let t = this.#e.reduce((e, t) => e + t, 0) / e, n = this.#e.reduce((e, n) => e + (n - t) ** 2, 0) / e;
		return Math.sqrt(n);
	}
}, v = 254, y = 5, b = class {
	stats;
	#e = 0;
	constructor(e) {
		this.stats = e;
	}
	next() {
		if (this.#e >= y) return null;
		this.#e++;
		let e = this.stats.deviationMs();
		if (e === null) return null;
		let t = e * 3;
		return t > v ? v : Math.floor(t);
	}
}, x = 1024, S = 5e3, C = 6e4, w = 1e3, T = 8, E = 3, D = 5, O = 500, k = 100, A = class {
	onPacket = null;
	onClosed = null;
	#e;
	#t;
	#n = null;
	#r = 0;
	#i = !1;
	#a = null;
	#o = null;
	#s = Date.now();
	#c = /* @__PURE__ */ new Uint16Array(9);
	#l = /* @__PURE__ */ new Uint32Array(9);
	#u = new p(65536, x);
	#d = new p(65536, x);
	#f = new p(65536, x);
	#p = new p(65536, x);
	#m = /* @__PURE__ */ new Map();
	#h = /* @__PURE__ */ new Map();
	#g = /* @__PURE__ */ new Map();
	#_ = null;
	#v = new _();
	#y = new b(this.#v);
	#b = /* @__PURE__ */ new Map();
	constructor(t, n = e) {
		this.#e = t, this.#t = n;
	}
	setClientID(e) {
		this.#r = e;
	}
	connect(e) {
		return new Promise((n, a) => {
			let { host: o, port: s } = t(e), c = i(r(o) === 6 ? "udp6" : "udp4"), l = (e) => {
				c.close(), a(e);
			};
			c.once("error", l), c.connect(parseInt(s, 10), o, () => {
				c.off("error", l), this.start(c), n();
			});
		});
	}
	start(e) {
		this.#n = e, this.#i = !1, this.#s = Date.now(), e.on("message", (e) => {
			this.#s = Date.now(), this.#w(new Uint8Array(e.buffer, e.byteOffset, e.byteLength));
		}), e.on("error", (e) => {
			this.#t.error("udp error", e), this.#H(e);
		}), e.on("close", () => this.#H(null)), this.#c[a.Command] = 1, this.#c[a.Init1] = 101;
		let t = n(this.#e, null);
		t && this.#S(a.Init1, t, 0);
		let r = setInterval(() => {
			if (this.#e.cryptoInitComplete) {
				let e = this.#c[a.Ping];
				if (this.#b.set(e, Date.now()), this.#b.size > 32) {
					let e = this.#b.keys().next().value;
					e !== void 0 && this.#b.delete(e);
				}
				this.sendPacket(a.Ping, /* @__PURE__ */ new Uint8Array(), o.Unencrypted);
			}
		}, S);
		this.#a = () => clearInterval(r);
		let i = setInterval(() => this.#B(), k);
		this.#o = () => clearInterval(i);
	}
	receivedFinalInitAck() {
		this.#_ = null;
	}
	sendPacket(e, t, n) {
		let r = !this.#e.cryptoInitComplete;
		if (t.length > 487 && e !== a.Voice && e !== a.VoiceWhisper) {
			this.#x(e, t, n, r);
			return;
		}
		this.#S(e, t, n, r);
	}
	sendVoicePacket(e, t) {
		let n = this.#c[a.Voice], r = this.#l[a.Voice];
		this.#c[a.Voice] = n + 1 & 65535, this.#c[a.Voice] === 0 && this.#l[a.Voice]++;
		let i = this.#y.next(), s = E + e.length + (i === null ? 0 : 1), c = new Uint8Array(s);
		new DataView(c.buffer).setUint16(0, n, !1), c[2] = t, c.set(e, E), i !== null && (c[s - 1] = i);
		let l = u({
			typeFlagged: a.Voice | o.Unencrypted | (i === null ? 0 : 64),
			id: n,
			clientID: this.#r,
			generationID: r,
			data: c,
			receivedAt: 0
		}), d = new Uint8Array(13 + s);
		d.set(this.#e.fakeSignature, 0), d.set(l, T), d.set(c, 13), this.#C(d);
	}
	sendWhisperPacket(e, t, n) {
		if (t.length === 0) throw Error("whisper requires at least one target");
		if (t.length > 32) throw Error("too many whisper targets");
		if (t.some((e) => !Number.isInteger(e) || e < 0 || e > 65535)) throw RangeError("invalid whisper target");
		let r = this.#c[a.VoiceWhisper], i = this.#l[a.VoiceWhisper];
		this.#c[a.VoiceWhisper] = r + 1 & 65535, this.#c[a.VoiceWhisper] === 0 && (this.#l[a.VoiceWhisper] = i + 1 >>> 0);
		let s = this.#y.next(), c = D + t.length * 2, l = c + e.length + (s === null ? 0 : 1), d = new Uint8Array(l), f = new DataView(d.buffer);
		f.setUint16(0, r, !1), d[2] = n, d[3] = 0, d[4] = t.length;
		for (let e = 0; e < t.length; e++) f.setUint16(D + e * 2, t[e], !1);
		d.set(e, c), s !== null && (d[l - 1] = s);
		let p = u({
			typeFlagged: a.VoiceWhisper | o.NewProtocol | o.Unencrypted | (s === null ? 0 : 64),
			id: r,
			clientID: this.#r,
			generationID: i,
			data: d,
			receivedAt: 0
		}), m = new Uint8Array(13 + l);
		m.set(this.#e.fakeSignature, 0), m.set(p, T), m.set(d, 13), this.#C(m);
	}
	close() {
		this.#i || (this.#i = !0, this.#a?.(), this.#o?.(), this.#n?.close());
	}
	#x(e, t, n, r) {
		let i = 0, a = !0;
		for (; i < t.length;) {
			let s = Math.min(t.length - i, 487), c = i + s === t.length, l = n;
			a !== c && (l |= o.Fragmented), this.#S(e, t.slice(i, i + s), l, r), i += s, a = !1;
		}
	}
	#S(e, t, n, r = !this.#e.cryptoInitComplete) {
		n = j(e, n);
		let [i, a] = this.#R(e), s = {
			typeFlagged: e | n,
			id: i,
			clientID: this.#r,
			generationID: a,
			data: t,
			receivedAt: 0
		}, c = (n & o.Unencrypted) !== 0, l = u(s), [d, f] = this.#e.encrypt(e, i, a, l, t, r, c), p = new Uint8Array(13 + d.length);
		p.set(f.slice(0, T), 0), p.set(l, T), p.set(d, 13), this.#C(p);
		let m = {
			packet: s,
			firstSend: Date.now(),
			lastSend: Date.now(),
			retryCount: 0,
			nextInterval: O
		};
		this.#z(e, s, m);
	}
	#C(e) {
		if (this.#n) try {
			this.#n.send(Buffer.from(e), (e) => {
				e && this.#t.warn("udp send error", e);
			});
		} catch (e) {
			let t = e instanceof Error ? e : Error(String(e));
			this.#t.error("udp send failed", t), this.#H(t);
		}
	}
	#w(e) {
		if (e.length < 11) return;
		let t = e.slice(0, T), n = e.slice(T, 11), r = e.slice(11), i = d(n), o = {
			...i,
			clientID: 0,
			generationID: this.#T(i.id, i.typeFlagged & 15),
			data: /* @__PURE__ */ new Uint8Array(),
			receivedAt: Date.now()
		}, c = this.#E(o, n, r, t);
		if (c === null) return;
		o.data = c.plaintext;
		let l = s(o);
		if (l === a.Pong && this.#A(o), l === a.Ping) {
			this.#k(o.id, c.dummyUsed);
			return;
		}
		this.#D(o, c.dummyUsed) && (this.#j(o), this.#L(o));
	}
	#T(e, t) {
		switch (t) {
			case a.Command: return this.#u.getGeneration(e);
			case a.CommandLow: return this.#d.getGeneration(e);
			case a.Ack: return this.#f.getGeneration(e);
			case a.AckLow: return this.#p.getGeneration(e);
			default: return 0;
		}
	}
	#E(e, t, n, r) {
		let i = (c(e) & o.Unencrypted) !== 0, l = !this.#e.cryptoInitComplete, u = l, d = s(e), f = e.generationID;
		try {
			return {
				plaintext: this.#e.decrypt(d, e.id, f, t, n, r, l, i),
				dummyUsed: u
			};
		} catch {
			for (let i of [-1, 1]) {
				let a = f + i;
				if (!(a < 0)) try {
					return {
						plaintext: this.#e.decrypt(d, e.id, a, t, n, r, !1, !1),
						dummyUsed: !1
					};
				} catch {}
			}
			if (d === a.Command || d === a.CommandLow || d === a.Ack) try {
				return {
					plaintext: this.#e.decrypt(d, e.id, f, t, n, r, !0, i),
					dummyUsed: !0
				};
			} catch {}
			return null;
		}
	}
	#D(e, t) {
		let n = s(e);
		if (n !== a.Command && n !== a.CommandLow) return !0;
		let r = n === a.Command ? this.#u : this.#d, i = n === a.Command ? a.Ack : a.AckLow;
		return r.isInWindow(e.id) ? (this.#O(e.id, i, t), !0) : (r.isOldPacket(e.id) && this.#O(e.id, i, t), !1);
	}
	#O(e, t, n) {
		let r = /* @__PURE__ */ new Uint8Array(2);
		new DataView(r.buffer).setUint16(0, e, !1), this.#S(t, r, 0, n);
	}
	#k(e, t) {
		let n = /* @__PURE__ */ new Uint8Array(2);
		new DataView(n.buffer).setUint16(0, e, !1), this.#S(a.Pong, n, o.Unencrypted, t);
	}
	#A(e) {
		if (e.data.length < 2) return;
		let t = new DataView(e.data.buffer, e.data.byteOffset, e.data.byteLength).getUint16(0, !1), n = this.#b.get(t);
		n !== void 0 && (this.#b.delete(t), this.#v.add(Date.now() - n));
	}
	#j(e) {
		let t = s(e);
		if (t !== a.Command && t !== a.CommandLow) {
			this.onPacket?.(e);
			return;
		}
		let n = t === a.Command, r = n ? this.#m : this.#h, i = n ? this.#u : this.#d;
		for (r.set(e.id, e), n ? this.#P(r, i, !0) : this.#P(r, i, !1);;) {
			let e = n ? this.#M : this.#N, t = r.get(e);
			if (t === void 0) break;
			let a = this.#F(t, r, e, i);
			if (!a) break;
			let [o, s] = a;
			n ? this.#M = s : this.#N = s, this.#I(o), this.onPacket?.(o);
		}
	}
	#M = 0;
	#N = 0;
	#P(e, t, n) {
		let r = n ? this.#M : this.#N;
		for (; !e.has(r) && M(e, r);) r = r + 1 & 65535, t.advance(1);
		n ? this.#M = r : this.#N = r;
	}
	#F(e, t, n, r) {
		if ((c(e) & o.Fragmented) === 0) return t.delete(n), r.advance(1), [e, n + 1 & 65535];
		let i = [], a = 0, s = n, l = !1, u = !1;
		for (;;) {
			let e = t.get(s);
			if (!e) return null;
			i.push(e), a += e.data.length;
			let n = (c(e) & o.Fragmented) !== 0;
			if (!l) {
				if (l = !0, !n) {
					u = !0;
					break;
				}
			} else if (n) {
				u = !0;
				break;
			}
			s = s + 1 & 65535;
		}
		if (!u) return null;
		let d = new Uint8Array(a), f = 0;
		for (let e of i) d.set(e.data, f), f += e.data.length, t.delete(n), r.advance(1), n = n + 1 & 65535;
		return e.data = d, e.typeFlagged &= ~o.Fragmented, [e, n];
	}
	#I(e) {
		if ((c(e) & o.Compressed) !== 0) try {
			e.data = new h().decompress(e.data), e.typeFlagged &= ~o.Compressed;
		} catch (t) {
			this.#t.debug("decompression failed", {
				id: e.id,
				err: t
			});
		}
	}
	#L(e) {
		let t = s(e);
		if (t === a.Init1) {
			this.#_ = null;
			return;
		}
		if ((t === a.Ack || t === a.AckLow) && e.data.length >= 2) {
			let n = new DataView(e.data.buffer, e.data.byteOffset).getUint16(0, !1), r = (t === a.Ack ? a.Command : a.CommandLow) << 16 | n;
			this.#g.delete(r);
		}
	}
	#R(e) {
		let t = this.#c[e], n = this.#l[e];
		return e === a.Init1 ? [t, n] : (this.#c[e] = t + 1 & 65535, this.#c[e] === 0 && (this.#l[e] = n + 1 >>> 0), e === a.Command ? this.#f.advanceToExcluded(t) : e === a.CommandLow && this.#p.advanceToExcluded(t), [t, n]);
	}
	#z(e, t, n) {
		if (e === a.Init1) {
			this.#_ = n;
			return;
		}
		if (e === a.Command || e === a.CommandLow) {
			let r = e << 16 | t.id;
			this.#g.set(r, n);
		}
	}
	#B() {
		let e = Date.now();
		if (e - this.#s > C) {
			this.#t.warn("idle timeout"), this.#H(/* @__PURE__ */ Error("idle timeout"));
			return;
		}
		this.#_ && this.#V(this.#_, e);
		for (let [t, n] of this.#g) {
			if (e - n.firstSend > C) {
				this.#g.delete(t), this.#H(/* @__PURE__ */ Error("packet ack timeout"));
				return;
			}
			this.#V(n, e);
		}
	}
	#V(e, t) {
		if (t - e.lastSend < e.nextInterval) return;
		e.lastSend = t, e.retryCount++, e.nextInterval = Math.min(e.nextInterval * 2, w);
		let n = !this.#e.cryptoInitComplete, r = (c(e.packet) & o.Unencrypted) !== 0, i = u(e.packet), a = s(e.packet), [l, d] = this.#e.encrypt(a, e.packet.id, e.packet.generationID, i, e.packet.data, n, r), f = new Uint8Array(13 + l.length);
		f.set(d.slice(0, T), 0), f.set(i, T), f.set(l, 13), this.#C(f);
	}
	#H(e) {
		this.#i || (this.close(), this.onClosed?.(e));
	}
};
function j(e, t) {
	return e === a.Command || e === a.CommandLow ? t | o.NewProtocol : t;
}
function M(e, t) {
	let n = Date.now();
	for (let [r, i] of e) if ((r - t + 65536 & 65535) < 32768 && n - i.receivedAt > 5e3) return !0;
	return !1;
}
//#endregion
export { a, c, d, o as i, s as l, h as n, u as o, p as r, l as s, A as t, f as u };

//# sourceMappingURL=handler-Dbn9KAtB.js.map