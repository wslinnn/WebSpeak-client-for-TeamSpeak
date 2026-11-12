import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
// Deliberate cost tradeoff. OWASP currently suggests scrypt
// N=2^17,r=8,p=1; this gateway is a self-hosted single-admin service that also
// runs TeamSpeak clients and Opus on the same small VPS, so a login is held to
// N=2^15 (32 MiB + ~100ms here) instead of 128 MiB. Raising N doubles the
// memory need AND the per-login CPU time, and `maxmem` has to grow with it
// (N=2^16 needs ~64 MiB, which this 64 MiB ceiling would reject). Old
// credentials stay verifiable because the parameters are stored per row.
const SCRYPT_PARAMETERS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export interface AdminCredential {
  version: 1;
  username: string;
  mustChangePassword: boolean;
  salt: string;
  hash: string;
  parameters: {
    N: number;
    r: number;
    p: number;
  };
}

export interface AdminPasswordOptions {
  username?: string;
  mustChangePassword?: boolean;
  allowWeakPassword?: boolean;
}

export function validateAdminPassword(password: string): string | null {
  if (password.length < 12) return "Admin password must contain at least 12 characters";
  if (password.length > 1024) return "Admin password is too long";
  return null;
}

export async function hashAdminPassword(password: string, options: AdminPasswordOptions = {}): Promise<AdminCredential> {
  const validationError = options.allowWeakPassword ? null : validateAdminPassword(password);
  if (validationError) throw new Error(validationError);
  const salt = randomBytes(16);
  const hash = await derive(password, salt, SCRYPT_PARAMETERS);
  return {
    version: 1,
    username: options.username ?? "admin",
    mustChangePassword: options.mustChangePassword ?? false,
    salt: salt.toString("base64url"),
    hash: hash.toString("base64url"),
    parameters: {
      N: SCRYPT_PARAMETERS.N,
      r: SCRYPT_PARAMETERS.r,
      p: SCRYPT_PARAMETERS.p,
    },
  };
}

export async function verifyAdminPassword(password: string, credential: AdminCredential): Promise<boolean> {
  if (credential.version !== 1 || typeof password !== "string" || password.length > 1024) return false;
  try {
    const expected = Buffer.from(credential.hash, "base64url");
    const actual = await derive(password, Buffer.from(credential.salt, "base64url"), {
      ...credential.parameters,
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function derive(
  password: string,
  salt: Buffer,
  parameters: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, parameters, (error, result) => {
      if (error) reject(error);
      else resolve(Buffer.from(result));
    });
  });
}
