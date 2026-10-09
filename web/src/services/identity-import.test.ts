import assert from "node:assert/strict";
import { createECDH, createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { exportTeamSpeakIdentity, extractIdentityNickname, IdentityImportError, importIdentityText } from "./identity-import.js";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

function decodeBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function referenceTlv(tag: number, value: Uint8Array): Buffer {
  const length = value.length < 128 ? Buffer.from([value.length]) : Buffer.from([0x81, value.length]);
  return Buffer.concat([Buffer.from([tag]), length, Buffer.from(value)]);
}

function referenceInteger(value: Uint8Array): Buffer {
  let first = 0;
  while (first < value.length - 1 && value[first] === 0) first++;
  const significant = Buffer.from(value.subarray(first));
  return referenceTlv(0x02, (significant[0]! & 0x80) === 0 ? significant : Buffer.concat([Buffer.from([0]), significant]));
}

function createReferenceTeamSpeakIni(): { ini: string; material: string } {
  const scalar = Buffer.alloc(32);
  scalar[31] = 1;
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(scalar);
  const publicPoint = ecdh.getPublicKey(undefined, "uncompressed");
  const sequenceBody = Buffer.concat([
    referenceTlv(0x03, Buffer.from([0x07, 0x80])),
    referenceInteger(Buffer.from([32])),
    referenceInteger(publicPoint.subarray(1, 33)),
    referenceInteger(publicPoint.subarray(33, 65)),
    referenceInteger(scalar),
  ]);
  const privateDer = referenceTlv(0x30, sequenceBody);
  const obfuscated = Buffer.from(privateDer.toString("base64"), "ascii");
  const staticKey = Buffer.from("b9dfaa7bee6ac57ac7b65f1094a1c155e747327bc2fe5d51c512023fe54a280201004e90ad1daaae1075d53b7d571c30e063b5a62a4a017bb394833aa0983e6e", "ascii");
  for (let i = 0; i < Math.min(100, obfuscated.length); i++) obfuscated[i] ^= staticKey[i]!;
  const nul = obfuscated.indexOf(0, 20);
  const hashEnd = nul < 0 ? obfuscated.length : nul;
  const hash = createHash("sha1").update(obfuscated.subarray(20, hashEnd)).digest();
  for (let i = 0; i < 20; i++) obfuscated[i] ^= hash[i]!;

  return {
    material: `${scalar.toString("base64")}:42`,
    ini: `[Identity]\nid=Standard\nidentity="42V${obfuscated.toString("base64")}"\nnickname=Fixture\n`,
  };
}

async function createSdkMaterial(): Promise<string> {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  assert.ok(jwk.d);
  return `${toBase64(decodeBase64Url(jwk.d))}:42`;
}

test("exports an interoperable TeamSpeak INI and imports it back without changing the identity", async () => {
  const material = await createSdkMaterial();
  const ini = await exportTeamSpeakIdentity(material);

  assert.match(ini, /^\[Identity\]\r?\nid=WebSpeak\r?\nidentity="42V[A-Za-z0-9+/]+=*"/);
  assert.equal(await importIdentityText(ini), material);
});

test("adopting an INI nickname survives escaping on export and import", () => {
  assert.equal(extractIdentityNickname(createReferenceTeamSpeakIni().ini), "Fixture");
  assert.equal(extractIdentityNickname('[Identity]\nnickname="\\x673a\\x5668\\x4eba"\n'), "机器人");
  // Surrogate pair: U+20BB7 (𠮷) escapes as two UTF-16 units.
  assert.equal(extractIdentityNickname("[Identity]\nnickname=\\xd842\\xdfb7\n"), "𠮷");
  assert.equal(extractIdentityNickname("[Identity]\nnickname=   \n"), null);
  assert.equal(extractIdentityNickname("[Identity]\nidentity=\"1Vabc\"\n"), null);
  assert.equal(extractIdentityNickname(`${"abc"}:42`), null);
});

test("exporting writes the current nickname in escaped TeamSpeak INI form", async () => {
  const material = await createSdkMaterial();
  const ini = await exportTeamSpeakIdentity(material, "机器人");

  assert.match(ini, /\r?\nnickname=\\x673a\\x5668\\x4eba\r?\n/);
  assert.equal(extractIdentityNickname(ini), "机器人");
  // Backslash and double quote take named escapes; an empty nickname stays empty.
  assert.match(await exportTeamSpeakIdentity(material, 'a\\b"c'), /nickname=a\\x5cb\\x22c/);
  assert.match(await exportTeamSpeakIdentity(material), /nickname=\r?\n/);
});

test("imports a TeamSpeak-format keypair produced independently of the WebSpeak exporter", async () => {
  const fixture = createReferenceTeamSpeakIni();
  assert.equal(await importIdentityText(fixture.ini), fixture.material);
});

test("imports a pasted TeamSpeak identity field and accepts WebSpeak identity strings", async () => {
  const material = await createSdkMaterial();
  const ini = await exportTeamSpeakIdentity(material);
  const identityLine = ini.split(/\r?\n/).find((line) => line.startsWith("identity="));
  assert.ok(identityLine);

  assert.equal(await importIdentityText(identityLine), material);
  assert.equal(await importIdentityText(material), material);
});

test("rejects ambiguous and malformed input with stable error codes", async () => {
  await assert.rejects(importIdentityText(""), (error: unknown) => error instanceof IdentityImportError && error.code === "empty");
  await assert.rejects(importIdentityText("identity=1VYWJj\nidentity=2VZGVm"), (error: unknown) => error instanceof IdentityImportError && error.code === "multiple");
  await assert.rejects(importIdentityText("not an identity"), (error: unknown) => error instanceof IdentityImportError && error.code === "malformed");
  await assert.rejects(importIdentityText("x".repeat(128 * 1024 + 1)), (error: unknown) => error instanceof IdentityImportError && error.code === "too-large");
});

test("rejects a damaged TeamSpeak identity blob", async () => {
  const ini = await exportTeamSpeakIdentity(await createSdkMaterial());
  const damaged = ini.replace(/identity="(\d+V)([A-Za-z0-9+/])/, (_match, prefix: string, firstByte: string) => `identity="${prefix}${firstByte === "A" ? "B" : "A"}`);
  await assert.rejects(importIdentityText(damaged), (error: unknown) => error instanceof IdentityImportError && error.code === "invalid-key");
});
