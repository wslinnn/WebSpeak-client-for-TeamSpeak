//#region src/command/command.ts
var e = [
	["\\", "\\\\"],
	["/", "\\/"],
	[" ", "\\s"],
	["|", "\\p"],
	["\x07", "\\a"],
	["\b", "\\b"],
	["\f", "\\f"],
	["\n", "\\n"],
	["\r", "\\r"],
	["	", "\\t"],
	["\v", "\\v"]
];
function t(t) {
	let n = t;
	for (let [t, r] of e) n = n.split(t).join(r);
	return n;
}
function n(e) {
	let t = "", n = 0;
	for (; n < e.length;) if (e[n] === "\\" && n + 1 < e.length) switch (e[n + 1]) {
		case "\\":
			t += "\\", n += 2;
			break;
		case "/":
			t += "/", n += 2;
			break;
		case "s":
			t += " ", n += 2;
			break;
		case "p":
			t += "|", n += 2;
			break;
		case "a":
			t += "\x07", n += 2;
			break;
		case "b":
			t += "\b", n += 2;
			break;
		case "f":
			t += "\f", n += 2;
			break;
		case "n":
			t += "\n", n += 2;
			break;
		case "r":
			t += "\r", n += 2;
			break;
		case "t":
			t += "	", n += 2;
			break;
		case "v":
			t += "\v", n += 2;
			break;
		default: t += e[n] ?? "", n++;
	}
	else t += e[n] ?? "", n++;
	return t;
}
function r(e, n) {
	let r = [t(e)];
	for (let [e, i] of Object.entries(n)) r.push(`${e}=${t(i)}`);
	return r.join(" ");
}
function i(e, n) {
	let r = [t(e)];
	for (let [e, i] of n) r.push(`${e}=${t(i)}`);
	return r.join(" ");
}
//#endregion
export { n as i, i as n, t as r, r as t };

//# sourceMappingURL=command-BLe-C2L2.js.map