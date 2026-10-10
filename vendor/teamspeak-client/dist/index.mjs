import { a as e, i as t, o as n } from "./address-BfmovVpp.js";
import { C as r, S as i, _ as a, b as o, d as s, g as c, h as l, l as u, o as d, p as f, r as p, u as m, v as h, w as g, x as _, y as v } from "./primitives-DpKiXbMi.js";
import { t as y } from "./crypto-BtmoNWm8.js";
import { t as b } from "./resolver-6B8dI9gr.js";
import { a as x, t as S } from "./handler-DI_abe9c.js";
import { i as C, n as w, t as T } from "./command-BLe-C2L2.js";
import { n as ee } from "./crypt-handshake-DziOY4Lq.js";
import { t as te } from "./crypt-init2-DEykmDHe.js";
import { t as ne } from "./parser-DZMv3Jm-.js";
import { createHash as E } from "node:crypto";
import { createConnection as D } from "node:net";
//#region src/commands.ts
var O = class {
	#e = /* @__PURE__ */ new Map();
	#t = 0;
	#n = [];
	#r = !1;
	register() {
		this.#t++;
		let e = this.#t;
		return [e, new Promise((t) => {
			this.#e.set(e, t);
		})];
	}
	unregister(e) {
		this.#e.delete(e);
	}
	signalWelcomeComplete() {
		this.#r = !0, this.#n = [];
	}
	buffer(e) {
		this.#r && this.#e.size !== 0 && this.#n.push(e);
	}
	resolve(e, t) {
		let n = this.#e.get(e);
		if (!n) {
			this.#n = [];
			return;
		}
		let r = this.#n;
		this.#n = [], this.#e.delete(e), n({
			err: t,
			data: r
		});
	}
	discardBuffer() {
		this.#n = [];
	}
	reset() {
		this.#e.clear(), this.#n = [], this.#r = !1, this.#t = 0;
	}
};
function k(e) {
	let t = e.id ?? "0", n = e.msg ?? "", i = e.return_code, a = null;
	t !== "0" && (a = new r(t, n));
	let o = null;
	if (i !== void 0 && i !== "") {
		let e = parseInt(i, 10);
		isNaN(e) || (o = e);
	}
	return {
		err: a,
		rc: o
	};
}
function A(e, t) {
	return e.includes("return_code=") ? e : `${e} return_code=${t}`;
}
//#endregion
//#region src/transfer.ts
var j = class {
	#e = /* @__PURE__ */ new Map();
	#t = 0;
	register() {
		this.#t++, this.#t > 65535 && (this.#t = 1);
		let e = this.#t;
		return [e, new Promise((t) => {
			this.#e.set(e, t);
		})];
	}
	unregister(e) {
		this.#e.delete(e);
	}
	notify(e, t) {
		let n = this.#e.get(e);
		n && n(t);
	}
	reset() {
		this.#e.clear(), this.#t = 0;
	}
};
function M(e, t, n) {
	return new Promise((r, i) => {
		let a = D({
			host: e,
			port: t
		}, () => {
			a.write(n, (e) => {
				e ? (a.destroy(), i(new o(`failed to send transfer key: ${e.message}`))) : r(a);
			});
		});
		a.setTimeout(1e4), a.once("error", i), a.once("timeout", () => {
			a.destroy(), i(new o("connection timeout"));
		});
	});
}
async function N(e, t, n) {
	let r = await M(e, t.port, t.fileTransferKey);
	await new Promise((e, t) => {
		n.pipe(r), r.on("finish", e), r.on("error", t);
	});
}
async function P(e, t, n) {
	let r = await M(e, t.port, t.fileTransferKey);
	await new Promise((e, t) => {
		r.pipe(n), n.on("finish", e), r.on("error", t), n.on("error", t);
	});
}
function F(e, t, n, r, i, a) {
	let o = t.startsWith("/") ? t : `/${t}`;
	return T("ftinitupload", {
		cid: String(e),
		name: o,
		cpw: n,
		size: String(r),
		clientftfid: String(i),
		overwrite: a ? "1" : "0",
		resume: "0"
	});
}
function I(e, t, n, r) {
	let i = t.startsWith("/") ? t : `/${t}`;
	return T("ftinitdownload", {
		cid: String(e),
		name: i,
		cpw: n,
		clientftfid: String(r),
		seekpos: "0"
	});
}
//#endregion
//#region src/events.ts
function L(e, t) {
	let n = t;
	for (let t = e.length - 1; t >= 0; t--) n = e[t](n);
	return n;
}
function R(e, t) {
	let n = t;
	for (let t = e.length - 1; t >= 0; t--) n = e[t](n);
	return n;
}
//#endregion
//#region src/handshake.ts
function z(e, t) {
	let n = t.alpha ?? "", r = t.beta ?? "", i = t.omega ?? "";
	e.crypt.initCrypto(n, r, i), e.logger.info("crypto initialized (P-256 path), sending clientinit"), G(e);
}
function B(e, t) {
	e.logger.info("received initivexpand2"), e.handler.receivedFinalInitAck();
	let n = t.l ?? "", r = t.omega ?? "", i = t.proof ?? "", a = t.beta ?? "", o = H(e, a);
	te(e.crypt, n, r, i, a, o), G(e);
}
function V(e, t) {
	let n = t.aclid ?? t.clid ?? "", r = n ? parseInt(n, 10) : 0;
	r > 0 && (e.clid = r, e.handler.setClientID(r)), e.logger.info("connected to server", { selfId: e.clid }), e._markConnected(), setImmediate(() => {
		let t = T("clientupdate", {
			client_input_muted: "0",
			client_output_muted: "0"
		});
		e.sendCommandNoWait(t).catch(() => {});
	});
}
function H(e, t) {
	let [n, r] = p(), i = Buffer.from(n).toString("base64"), a = U(e, n, t), o = w("clientek", [["ek", i], ["proof", a]]);
	return e.handler.sendPacket(x.Command, Buffer.from(o), 0), r;
}
function U(e, t, n) {
	let r = Buffer.from(n, "base64"), i = /* @__PURE__ */ new Uint8Array(86);
	i.set(t.slice(0, 32)), i.set(r.slice(0, Math.min(54, r.length)), 32);
	let a = d(e.crypt.identity.privateKey, i);
	return Buffer.from(a).toString("base64");
}
function W(e) {
	return e === "" ? "" : E("sha1").update(e).digest().toString("base64");
}
function G(e) {
	let t = K(e);
	e.handler.sendPacket(x.Command, Buffer.from(t), 0);
}
function K(e) {
	let t = e.crypt.identity.publicKeyBase64(), n = e.getClientInitOptions(), r = W(n.defaultChannelPassword), i = W(n.serverPassword), a = E("sha1").update(t).digest().toString("base64");
	return w("clientinit", [
		["client_nickname", e.nickname],
		["client_version", "3.?.? [Build: 5680278000]"],
		["client_platform", "Windows"],
		["client_input_hardware", "1"],
		["client_output_hardware", "1"],
		["client_default_channel", n.defaultChannel],
		["client_default_channel_password", r],
		["client_server_password", i],
		["client_meta_data", ""],
		["client_version_sign", "DX5NIYLvfJEUjuIbCidnoeozxIDRRkpq3I9vVMBmE9L2qnekOoBzSenkzsg2lC9CMv8K5hkEzhr2TYUYSwUXCg=="],
		["client_key_offset", String(e.crypt.identity.offset)],
		["client_nickname_phonetic", ""],
		["client_default_token", ""],
		["hwid", a]
	]);
}
//#endregion
//#region src/helpers.ts
function q(e) {
	if (e === "" || e === void 0) return 0n;
	try {
		return BigInt(e);
	} catch {
		return 0n;
	}
}
function J(e) {
	let t = parseInt(e, 10);
	return isNaN(t) || t < 0 || t > 65535 ? 0 : t;
}
function Y(e) {
	let t = parseInt(e, 10);
	return isNaN(t) ? 0 : t;
}
function re(e, t) {
	if (t === e) return !0;
	if (!t.startsWith(e)) return !1;
	let n = t.slice(e.length);
	return /^\d+$/.test(n);
}
function X(e) {
	let t = e.indexOf(" ");
	if (t < 0) return [e];
	let n = e.slice(0, t), r = e.slice(t + 1);
	if (!r.includes("|")) return [e];
	let i = r.split("|"), a = [], o = /* @__PURE__ */ new Map();
	for (let e of i) {
		if (e === "") continue;
		let t = e.split(" ").filter(Boolean), r = /* @__PURE__ */ new Set();
		for (let e of t) r.add(Z(e));
		let i = [];
		for (let [e, t] of o) r.has(e) || i.push(t);
		let s = [...i, ...t];
		a.push(`${n} ${s.join(" ")}`), o = /* @__PURE__ */ new Map();
		for (let e of s) o.set(Z(e), e);
	}
	return a.length === 0 ? [e] : a;
}
function Z(e) {
	let t = e.indexOf("=");
	return t > 0 ? e.slice(0, t) : e;
}
//#endregion
//#region src/notifications.ts
function ie(e, t, n, r) {
	switch (e.name) {
		case "notifycliententerview": return ae(e, n, r);
		case "notifyclientleftview": return oe(e, t, n);
		case "notifyclientmoved": return se(e, n);
		case "notifyclientupdated": return ce(e, n);
		case "notifytextmessage": return le(e, n);
		case "notifyclientpoke": return pe(e);
		case "notifystartupload": return {
			kind: "startUpload",
			info: ue(e)
		};
		case "notifystartdownload": return {
			kind: "startDownload",
			info: de(e)
		};
		case "notifystatusfiletransfer": return {
			kind: "fileTransferStatus",
			info: fe(e)
		};
		default: return {
			kind: "rawNotification",
			notification: {
				name: e.name,
				params: { ...e.params }
			}
		};
	}
}
function ae(e, t, n) {
	let r = J(e.params.clid ?? ""), i = q(e.params.ctid ?? e.params.cid ?? ""), a = Y(e.params.client_type ?? ""), o = e.params.client_servergroups ?? "", s = t.get(r), c = {
		...s,
		id: r,
		nickname: e.params.client_nickname ?? "",
		uid: e.params.client_unique_identifier ?? "",
		channelID: i === 0n ? s?.channelID ?? 0n : i,
		type: a,
		serverGroups: o ? o.split(",") : []
	};
	return r !== 0 && t.set(r, c), {
		kind: "clientEnter",
		info: c
	};
}
function oe(e, t, n) {
	let r = J(e.params.clid ?? ""), i = Y(e.params.reasonid ?? ""), a = q(e.params.ctid ?? "");
	if (a !== 0n) {
		if (r !== 0) {
			let e = n.get(r);
			e && n.set(r, {
				...e,
				channelID: a
			});
		}
		return {
			kind: "clientMoved",
			event: {
				id: r,
				targetChannelID: a,
				reasonID: i,
				invokerID: J(e.params.invokerid ?? ""),
				invokerName: e.params.invokername ?? "",
				invokerUID: e.params.invokeruid ?? ""
			}
		};
	}
	let o = r === t;
	return r !== 0 && n.delete(r), {
		kind: "clientLeave",
		event: {
			id: r,
			reasonID: i,
			reasonMsg: e.params.reasonmsg ?? "",
			targetID: J(e.params.targetid ?? "")
		},
		isSelf: o
	};
}
function se(e, t) {
	let n = J(e.params.clid ?? ""), r = q(e.params.ctid ?? e.params.cid ?? "");
	if (n !== 0) {
		let e = t.get(n);
		e && t.set(n, {
			...e,
			channelID: r
		});
	}
	return {
		kind: "clientMoved",
		event: {
			id: n,
			targetChannelID: r,
			reasonID: Y(e.params.reasonid ?? ""),
			invokerID: J(e.params.invokerid ?? ""),
			invokerName: e.params.invokername ?? "",
			invokerUID: e.params.invokeruid ?? ""
		}
	};
}
function ce(e, t) {
	let n = J(e.params.clid ?? ""), r = t.get(n), i = q(e.params.ctid ?? e.params.cid ?? ""), a = e.params.client_servergroups, o = {
		...r,
		id: n,
		nickname: e.params.client_nickname ?? r?.nickname ?? "",
		uid: e.params.client_unique_identifier ?? r?.uid ?? "",
		channelID: i === 0n ? r?.channelID ?? 0n : i,
		type: e.params.client_type === void 0 ? r?.type ?? 0 : Y(e.params.client_type),
		serverGroups: a === void 0 ? r?.serverGroups ?? [] : a ? a.split(",") : []
	};
	return e.params.client_away !== void 0 && (o.away = e.params.client_away === "1"), e.params.client_away_message !== void 0 && (o.awayMessage = e.params.client_away_message), e.params.client_input_muted !== void 0 && (o.inputMuted = e.params.client_input_muted === "1"), e.params.client_output_muted !== void 0 && (o.outputMuted = e.params.client_output_muted === "1"), e.params.client_is_channel_commander !== void 0 && (o.channelCommander = e.params.client_is_channel_commander === "1"), n !== 0 && t.set(n, o), {
		kind: "clientUpdated",
		event: { info: o }
	};
}
function le(e, t) {
	let n = J(e.params.invokerid ?? ""), r = t.get(n);
	return {
		kind: "textMessage",
		message: {
			targetMode: Y(e.params.targetmode ?? ""),
			targetID: q(e.params.target ?? ""),
			invokerID: n,
			invokerName: e.params.invokername ?? "",
			invokerUID: e.params.invokeruid ?? r?.uid ?? "",
			message: C(e.params.msg ?? ""),
			invokerGroups: r?.serverGroups ?? []
		}
	};
}
function ue(e) {
	return {
		clientFileTransferID: J(e.params.clientftfid ?? ""),
		serverFileTransferID: J(e.params.serverftfid ?? ""),
		fileTransferKey: e.params.ftkey ?? "",
		port: J(e.params.port ?? ""),
		seekPosition: q(e.params.seekpos ?? "")
	};
}
function de(e) {
	return {
		clientFileTransferID: J(e.params.clientftfid ?? ""),
		serverFileTransferID: J(e.params.serverftfid ?? ""),
		fileTransferKey: e.params.ftkey ?? "",
		port: J(e.params.port ?? ""),
		size: q(e.params.size ?? "")
	};
}
function fe(e) {
	return {
		clientFileTransferID: J(e.params.clientftfid ?? ""),
		status: Y(e.params.status ?? ""),
		message: e.params.msg ?? ""
	};
}
function pe(e) {
	return {
		kind: "poked",
		event: {
			invokerID: J(e.params.invokerid ?? ""),
			invokerName: C(e.params.invokername ?? ""),
			invokerUID: e.params.invokeruid ?? "",
			message: C(e.params.msg ?? "")
		}
	};
}
//#endregion
//#region src/directory.ts
function Q(e) {
	let t = q(e.cid ?? "");
	return t === 0n ? null : {
		id: t,
		parentID: q(e.pid ?? e.cpid ?? ""),
		order: q(e.channel_order ?? e.order ?? ""),
		name: e.channel_name ?? "",
		description: e.channel_topic ?? e.channel_description ?? ""
	};
}
function me(e) {
	let t = J(e.clid ?? "");
	if (t === 0) return null;
	let n = e.client_servergroups ?? "";
	return {
		id: t,
		nickname: e.client_nickname ?? "",
		uid: e.client_unique_identifier ?? "",
		channelID: q(e.cid ?? e.ctid ?? ""),
		type: Y(e.client_type ?? ""),
		serverGroups: n ? n.split(",") : [],
		away: e.client_away === "1",
		awayMessage: e.client_away_message ?? "",
		inputMuted: e.client_input_muted === "1",
		outputMuted: e.client_output_muted === "1",
		channelCommander: e.client_is_channel_commander === "1"
	};
}
function he(e, t, n) {
	let r = q(t.cid ?? "");
	if (r === 0n) return !1;
	switch (e) {
		case "notifychannelcreated": {
			let e = Q(t);
			return e ? (n.set(e.id, e), !0) : !1;
		}
		case "notifychanneledited": {
			let e = n.get(r);
			if (!e) return !1;
			let i = { ...e };
			return t.channel_name !== void 0 && (i.name = t.channel_name), t.channel_topic !== void 0 && (i.description = t.channel_topic), t.channel_description !== void 0 && t.channel_topic === void 0 && (i.description = t.channel_description), (t.cpid !== void 0 || t.pid !== void 0) && (i.parentID = q(t.cpid ?? t.pid ?? "")), (t.channel_order !== void 0 || t.order !== void 0) && (i.order = q(t.channel_order ?? t.order ?? "")), n.set(r, i), !0;
		}
		case "notifychannelmoved": {
			let e = n.get(r);
			if (!e) return !1;
			let i = {
				...e,
				parentID: q(t.cpid ?? t.pid ?? "")
			};
			return (t.channel_order !== void 0 || t.order !== void 0) && (i.order = q(t.channel_order ?? t.order ?? "")), n.set(r, i), !0;
		}
		case "notifychanneldeleted": return n.delete(r);
		default: return !1;
	}
}
function ge(e, t) {
	return {
		channels: [...e.values()].map((e) => ({ ...e })),
		clients: [...t.values()].map((e) => ({
			...e,
			serverGroups: [...e.serverGroups]
		}))
	};
}
//#endregion
//#region src/throttle.ts
var _e = class e {
	static TOKEN_RATE = 4;
	static TOKEN_MAX = 8;
	#e = 5;
	#t = Date.now();
	async wait(t) {
		for (;;) {
			if (t?.aborted) throw t.reason;
			let n = Date.now(), r = (n - this.#t) / 1e3;
			if (this.#e = Math.min(this.#e + r * e.TOKEN_RATE, e.TOKEN_MAX), this.#t = n, this.#e >= 1) {
				--this.#e;
				return;
			}
			let i = Math.ceil((1 - this.#e) / e.TOKEN_RATE * 1e3) + 10;
			await new Promise((e, n) => {
				let r = setTimeout(e, i);
				t && t.addEventListener("abort", () => {
					clearTimeout(r), n(t.reason);
				}, { once: !0 });
			});
		}
	}
};
//#endregion
//#region src/client.ts
function ve(e) {
	return {
		serverPassword: e.serverPassword ?? "",
		defaultChannel: e.defaultChannel ?? "",
		defaultChannelPassword: e.defaultChannelPassword ?? ""
	};
}
var ye = class {
	crypt;
	handler;
	logger;
	nickname;
	clid = 0;
	#e;
	#t;
	#n;
	#r;
	#i = t.Disconnected;
	#a = new _e();
	#o = new O();
	#s = new j();
	#c = /* @__PURE__ */ new Map();
	#l = /* @__PURE__ */ new Map();
	#u = [];
	#d = !1;
	#f = 0;
	#p = [];
	#m = null;
	#h = [];
	#g = [];
	#_ = [];
	#v = [];
	#y = [];
	#b = [];
	#x = [];
	#S = [];
	#C = [];
	#w = [];
	#T = [];
	#E = [];
	#D = [];
	#O;
	#k;
	constructor(t, n, r, i = {}) {
		this.#e = t, this.#t = n, this.nickname = r, this.logger = i.logger ?? e, this.#n = i.resolver ?? new b(this.logger), this.#r = ve(i), this.crypt = new y(t), this.handler = new S(this.crypt, this.logger), this.handler.onPacket = (e) => this.#M(e), this.handler.onClosed = (e) => this.#V(e), i.commandMiddleware && this.#E.push(...i.commandMiddleware), i.eventMiddleware && this.#D.push(...i.eventMiddleware), this.#O = this.#W(), this.#k = this.#G();
	}
	get status() {
		return this.#i;
	}
	getClientInitOptions() {
		return this.#r;
	}
	async connect() {
		if (this.#i !== t.Disconnected) throw new l();
		this.#A(), this.#i = t.Connecting;
		let e = await this.#j();
		this.logger.info("connecting to server", { address: e }), await this.handler.connect(e);
	}
	async disconnect() {
		if (this.#i === t.Disconnected) return;
		let e = this.#i === t.Connected;
		if (this.#i = t.Disconnected, this.logger.info("disconnecting from server"), e) try {
			await this.execCommand("clientdisconnect reasonmsg=Shutdown", 1e3);
		} catch {}
		this.handler.close();
		let n = this.#w.slice();
		for (let e of n) setImmediate(() => e(void 0));
	}
	waitConnected(e) {
		return this.#i === t.Connected ? Promise.resolve() : this.#m ? Promise.reject(this.#m) : new Promise((t, n) => {
			let r, i = () => {
				let t = this.#p.indexOf(r);
				t >= 0 && this.#p.splice(t, 1);
				let n = e?.reason;
				r.reject(n instanceof Error ? n : Error(String(n ?? "Connection wait aborted")));
			};
			r = {
				resolve: () => {
					e?.removeEventListener("abort", i), t();
				},
				reject: (t) => {
					e?.removeEventListener("abort", i), n(t);
				}
			}, this.#p.push(r), e?.aborted ? i() : e?.addEventListener("abort", i, { once: !0 });
		});
	}
	async sendCommandNoWait(e) {
		await this.#a.wait(), await this.#O(e);
	}
	async execCommand(e, t = 1e4) {
		await this.execCommandWithResponse(e, t);
	}
	async execCommandWithResponse(e, t = 1e4) {
		let [n, r] = this.#o.register(), i = A(e, n);
		try {
			await this.#a.wait(), await this.#O(i);
		} catch (e) {
			throw this.#o.unregister(n), e;
		}
		let a = await Promise.race([r, new Promise((n, r) => setTimeout(() => r(new c(e)), t))]);
		if (this.#o.unregister(n), a.err) throw a.err;
		return a.data;
	}
	on(e, t) {
		switch (e) {
			case "textMessage":
				this.#h.push(t);
				break;
			case "clientEnter":
				this.#g.push(t);
				break;
			case "clientLeave":
				this.#_.push(t);
				break;
			case "clientMoved":
				this.#v.push(t);
				break;
			case "clientUpdated":
				this.#y.push(t);
				break;
			case "directorySnapshot":
				this.#u.push(t);
				break;
			case "poked":
				this.#b.push(t);
				break;
			case "voiceData":
				this.#x.push(t);
				break;
			case "rawNotification":
				this.#S.push(t);
				break;
			case "connected":
				this.#C.push(t);
				break;
			case "disconnected":
				this.#w.push(t);
				break;
			case "kicked": this.#T.push(t);
		}
		return this;
	}
	useCommandMiddleware(...e) {
		return this.#E.push(...e), this.#O = this.#W(), this;
	}
	useEventMiddleware(...e) {
		return this.#D.push(...e), this.#k = this.#G(), this;
	}
	clientID() {
		return this.clid;
	}
	channelID() {
		return this.#c.get(this.clid)?.channelID ?? 0n;
	}
	sendVoice(e, t) {
		this.handler.sendVoicePacket(e, t);
	}
	sendWhisper(e, t, n) {
		this.handler.sendWhisperPacket(e, t, n);
	}
	async fileTransferInitUpload(e, t, n, r, i = !1) {
		let [a, s] = this.#s.register(), c = F(e, t, n, r, a, i);
		try {
			await this.execCommand(c, 1e4);
		} catch (e) {
			throw this.#s.unregister(a), e;
		}
		let l = await Promise.race([s, new Promise((e, t) => setTimeout(() => t(new _()), 1e4))]);
		if (this.#s.unregister(a), "size" in l) throw new o("unexpected download response");
		if ("status" in l) {
			let e = l;
			throw new o(`${e.message} (status=${e.status})`);
		}
		return l;
	}
	async fileTransferInitDownload(e, t, n) {
		let [r, i] = this.#s.register(), a = I(e, t, n, r);
		try {
			await this.execCommand(a, 1e4);
		} catch (e) {
			throw this.#s.unregister(r), e;
		}
		let s = await Promise.race([i, new Promise((e, t) => setTimeout(() => t(new _()), 1e4))]);
		if (this.#s.unregister(r), "seekPosition" in s) throw new o("unexpected upload response");
		if ("status" in s) {
			let e = s;
			throw new o(`${e.message} (status=${e.status})`);
		}
		return s;
	}
	uploadFileData(e, t, n) {
		return N(e, t, n);
	}
	downloadFileData(e, t, n) {
		return P(e, t, n);
	}
	_markConnected() {
		this.#i = t.Connected, this.#m = null;
		for (let e of this.#p) e.resolve();
		this.#p = [];
		let e = this.#C.slice();
		for (let t of e) setImmediate(() => t());
	}
	#A() {
		this.#m = null;
		let e = this.#p.splice(0);
		for (let t of e) t.reject(/* @__PURE__ */ Error("Connection attempt was reset"));
		this.handler.close(), this.crypt = new y(this.#e), this.handler = new S(this.crypt, this.logger), this.handler.onPacket = (e) => this.#M(e), this.handler.onClosed = (e) => this.#V(e), this.#o.reset(), this.#s.reset(), this.#l.clear(), this.#c.clear(), this.#f++, this.#d = !1, this.clid = 0, this.#O = this.#W();
	}
	async #j() {
		let e = this.#t.includes(":") ? this.#t : `${this.#t}:9987`;
		try {
			return (await this.#n.resolve(this.#t))[0]?.addr ?? e;
		} catch {
			return e;
		}
	}
	#M(e) {
		this.#N(e);
	}
	#N(e) {
		let t = e.typeFlagged & 15;
		if (t === 8) {
			let t = ee(this.crypt, e.data);
			t && this.handler.sendPacket(x.Init1, t, 0);
			return;
		}
		if ((t === 0 || t === 1) && e.data.length > 5) {
			this.#P(e.data);
			return;
		}
		(t === 2 || t === 3) && e.data.length > 0 && this.#F(Buffer.from(e.data).toString("utf8"));
	}
	#P(e) {
		if (this.#x.length === 0) return;
		let t = new DataView(e.buffer, e.byteOffset, e.byteLength).getUint16(2, !1);
		if (t === this.clid) return;
		let n = {
			clientId: t,
			codec: e[4],
			data: e.subarray(5)
		};
		for (let e of this.#x) setImmediate(() => e(n));
	}
	#F(e) {
		if (!e) return;
		let t = e.split("\0").join("\n").split("\n");
		for (let e of t) {
			let t = e.replace(/\r$/, "");
			if (t) for (let e of X(t)) this.#I(e);
		}
	}
	#I(e) {
		let t = ne(e);
		if (t && t.name) {
			if (t.name.startsWith("notify")) {
				let e = he(t.name, t.params, this.#l), n = ie(t, this.clid, this.#c, this.nickname);
				this.#R(n, t.params), e && this.#U();
				return;
			}
			switch (t.name) {
				case "clientinitiv":
					z(this, t.params);
					break;
				case "initivexpand2":
					B(this, t.params);
					break;
				case "initserver":
					V(this, t.params);
					break;
				case "channellist": {
					let e = Q(t.params);
					e && this.#l.set(e.id, e), this.#o.buffer(t.params), this.#U();
					break;
				}
				case "channelclientlist": {
					let e = me(t.params);
					e && this.#c.set(e.id, e), this.#o.buffer(t.params), this.#U();
					break;
				}
				case "error":
					this.#L(t.params);
					break;
				default: {
					let e = t.params;
					if (t.name.includes("=")) {
						let n = t.name.indexOf("="), r = t.name.slice(0, n), i = t.name.slice(n + 1);
						e = {
							[r]: i,
							...t.params
						};
					}
					this.#o.buffer(e);
					break;
				}
			}
		}
	}
	#L(e) {
		let { err: n, rc: r } = k(e);
		r === null ? this.#o.discardBuffer() : this.#o.resolve(r, n), n && this.#i !== t.Connected && this.#H(n), (e.id ?? "0") === "3329" && setImmediate(() => this.disconnect().catch(() => {}));
	}
	#R(e, t) {
		switch (e.kind) {
			case "clientEnter": {
				let t = e.info, n = this.#c.get(t.id);
				n && t.channelID === 0n && n.channelID !== 0n && (t = {
					...t,
					channelID: n.channelID
				}, this.#c.set(t.id, t)), t.id !== 0 && t.id === this.clid ? (this.nickname = t.nickname, this.#o.signalWelcomeComplete()) : t.id !== 0 && this.clid === 0 && re(this.nickname, t.nickname) && (this.clid = t.id, this.handler.setClientID(t.id), this.nickname = t.nickname, this.#o.signalWelcomeComplete()), this.#z("clientEnter", t), this.#U();
				break;
			}
			case "clientLeave":
				if (this.#z("clientLeave", e.event), e.isSelf && (e.event.reasonID === 4 || e.event.reasonID === 5)) {
					let t = e.event.reasonMsg;
					for (let e of this.#T) setImmediate(() => e(t));
				}
				this.#U();
				break;
			case "clientMoved":
				this.#z("clientMoved", e.event), this.#U();
				break;
			case "clientUpdated":
				this.#z("clientUpdated", e.event), this.#U();
				break;
			case "textMessage":
				this.#z("textMessage", e.message);
				break;
			case "poked":
				this.#z("poked", e.event);
				break;
			case "startUpload":
				this.#s.notify(e.info.clientFileTransferID, e.info);
				break;
			case "startDownload":
				this.#s.notify(e.info.clientFileTransferID, e.info);
				break;
			case "fileTransferStatus":
				this.#s.notify(e.info.clientFileTransferID, e.info);
				break;
			case "rawNotification": this.#z("rawNotification", e.notification);
		}
	}
	#z(e, t) {
		this.#k(t);
	}
	#B(e, t) {
		switch (e) {
			case "textMessage":
				for (let e of this.#h) setImmediate(() => e(t));
				break;
			case "clientEnter":
				for (let e of this.#g) setImmediate(() => e(t));
				break;
			case "clientLeave":
				for (let e of this.#_) setImmediate(() => e(t));
				break;
			case "clientMoved":
				for (let e of this.#v) setImmediate(() => e(t));
				break;
			case "clientUpdated":
				for (let e of this.#y) setImmediate(() => e(t));
				break;
			case "poked":
				for (let e of this.#b) setImmediate(() => e(t));
				break;
			case "directorySnapshot":
				for (let e of this.#u) setImmediate(() => e(t));
				break;
			case "rawNotification": for (let e of this.#S) setImmediate(() => e(t));
		}
	}
	#V(e) {
		if (this.#i === t.Disconnected) return;
		this.#i !== t.Connected && this.#H(e ?? /* @__PURE__ */ Error("Connection closed before TeamSpeak handshake completed")), this.#i = t.Disconnected;
		let n = this.#w.slice();
		for (let t of n) setImmediate(() => t(e ?? void 0));
	}
	#H(e) {
		this.#m = e;
		let t = this.#p.splice(0);
		for (let n of t) n.reject(e);
	}
	#U() {
		if (this.#d) return;
		this.#d = !0;
		let e = this.#f;
		setImmediate(() => {
			if (this.#d = !1, e !== this.#f) return;
			let t = ge(this.#l, this.#c);
			this.#z("directorySnapshot", t);
		});
	}
	#W() {
		return L(this.#E, async (e) => {
			this.handler.sendPacket(x.Command, Buffer.from(e), 0);
		});
	}
	#G() {
		return R(this.#D, (e) => {
			typeof e == "object" && e && "channels" in e && "clients" in e ? this.#B("directorySnapshot", e) : typeof e == "object" && e && "name" in e && "params" in e && typeof e.name == "string" ? this.#B("rawNotification", e) : typeof e == "object" && e && "invokerName" in e && "message" in e && "targetMode" in e ? this.#B("textMessage", e) : typeof e == "object" && e && "invokerName" in e && "message" in e && !("targetMode" in e) ? this.#B("poked", e) : typeof e == "object" && e && "info" in e && e.info !== null && typeof e.info == "object" && "id" in e.info && "uid" in e.info ? this.#B("clientUpdated", e) : typeof e == "object" && e && "id" in e && "uid" in e ? this.#B("clientEnter", e) : typeof e == "object" && e && "id" in e && "reasonID" in e && "targetChannelID" in e ? this.#B("clientMoved", e) : typeof e == "object" && e && "id" in e && "reasonID" in e && this.#B("clientLeave", e);
		});
	}
};
//#endregion
//#region src/api.ts
async function be(e, t, n, r) {
	let i = w("sendtextmessage", [
		["targetmode", String(t)],
		["target", String(n)],
		["msg", r]
	]);
	await e.sendCommandNoWait(i);
}
async function $(e, t, n, r = "") {
	let i = [["clid", String(t)], ["cid", String(n)]];
	r && i.push(["cpw", xe(r)]);
	let a = w("clientmove", i);
	await e.execCommand(a, 1e4);
}
function xe(e) {
	return E("sha1").update(e).digest("base64");
}
async function Se(e, t, n) {
	let r = w("clientpoke", [["clid", String(t)], ["msg", n]]);
	await e.execCommand(r, 1e4);
}
async function Ce(e, t) {
	let n = (await e.execCommandWithResponse(`clientinfo clid=${t}`, 5e3))[0];
	if (!n) throw Error(`no data returned for client ${t}`);
	return n;
}
async function we(e) {
	return (await e.execCommandWithResponse("channellist", 5e3)).map((e) => ({
		id: BigInt(e.cid ?? "0"),
		parentID: BigInt(e.pid ?? "0"),
		order: BigInt(e.channel_order ?? e.order ?? "0"),
		name: C(e.channel_name ?? ""),
		description: ""
	}));
}
async function Te(e) {
	return (await e.execCommandWithResponse("clientlist -uid -away -voice -groups", 5e3)).map((e) => {
		let t = e.client_servergroups ?? "";
		return {
			id: parseInt(e.clid ?? "0", 10),
			nickname: C(e.client_nickname ?? ""),
			uid: e.client_unique_identifier ?? "",
			channelID: BigInt(e.cid ?? "0"),
			type: parseInt(e.client_type ?? "0", 10),
			serverGroups: t ? t.split(",") : []
		};
	});
}
async function Ee(e, t, n) {
	if (n.length === 0) return;
	let r = n.join("|"), i = T("ftdeletefile", {
		cid: String(t),
		cpw: "",
		name: r
	});
	await e.execCommand(i, 1e4);
}
//#endregion
export { l as AlreadyConnectedError, ye as Client, t as ClientStatus, c as CommandTimeoutError, a as CryptoInitError, h as EAXTagMismatchError, v as FakeSignatureMismatchError, o as FileTransferError, _ as FileTransferTimeoutError, u as Identity, i as InvalidIdentityError, r as ServerError, g as TeamspeakError, $ as clientMove, e as consoleLogger, M as dialFileTransfer, P as downloadFileData, Ee as fileTransferDeleteFile, m as generateIdentity, Ce as getClientInfo, s as getUidFromPublicKey, f as identityFromString, we as listChannels, Te as listClients, n as noopLogger, Se as poke, be as sendTextMessage, N as uploadFileData };

//# sourceMappingURL=index.mjs.map