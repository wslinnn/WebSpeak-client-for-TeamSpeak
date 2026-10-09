import { i as e } from "./command-BLe-C2L2.js";
//#region src/command/parser.ts
function t(t) {
	if (t === "") return null;
	let n = 0;
	for (let e = 0; e < t.length; e++) {
		let r = t.charCodeAt(e);
		if (r >= 32 && r <= 126) {
			n = e;
			break;
		}
	}
	n > 0 && (t = t.slice(n));
	let r = t.split(" ");
	if (r.length === 0) return null;
	let i = r[0] ?? "";
	if (i === "") return null;
	let a = {};
	for (let t = 1; t < r.length; t++) {
		let n = r[t];
		if (n === void 0 || n === "") continue;
		let i = n.indexOf("=");
		i >= 0 ? a[e(n.slice(0, i))] = e(n.slice(i + 1)) : a[e(n)] = "";
	}
	return {
		name: i,
		params: a
	};
}
//#endregion
export { t };

//# sourceMappingURL=parser-DZMv3Jm-.js.map