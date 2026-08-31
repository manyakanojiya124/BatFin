import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Algorithm, hash, verify } from "@node-rs/argon2";

import { env } from "./env.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ARGON_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

function encryptionKey() {
  const key = Buffer.from(env.adminEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ADMIN_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }
  return key;
}

export function normalizeAdminEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateAdminPassword(password: string) {
  if (password.length < 14 || password.length > 128) {
    return "Password must be between 14 and 128 characters";
  }
  if (!/[a-z]/.test(password)) return "Password needs a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter";
  if (!/\d/.test(password)) return "Password needs a number";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password needs a symbol";
  }
  return null;
}

export async function hashAdminSecret(value: string) {
  return hash(value, ARGON_OPTIONS);
}

export async function verifyAdminSecret(hashValue: string, value: string) {
  try {
    return await verify(hashValue, value);
  } catch {
    return false;
  }
}

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function opaqueTokenMatches(rawToken: string, expectedHash: string) {
  const actual = Buffer.from(hashOpaqueToken(rawToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function encryptAdminSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptAdminSecret(encrypted: string) {
  const [version, ivValue, tagValue, ciphertextValue] = encrypted.split(":");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue
  ) {
    throw new Error("Invalid encrypted admin secret");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encodeBase32(value: Buffer) {
  let bits = "";
  for (const byte of value) bits += byte.toString(2).padStart(8, "0");

  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    result += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return result;
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function createTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function createTotpUri(email: string, secret: string) {
  const label = encodeURIComponent(`${env.adminTotpIssuer}:${email}`);
  const issuer = encodeURIComponent(env.adminTotpIssuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secret: string, candidate: string) {
  if (!/^\d{6}$/.test(candidate)) return false;
  const candidateBuffer = Buffer.from(candidate);

  for (const offset of [-1, 0, 1]) {
    const expected = Buffer.from(
      generateTotpCode(secret, Date.now() + offset * 30_000),
    );
    if (
      expected.length === candidateBuffer.length &&
      timingSafeEqual(expected, candidateBuffer)
    ) {
      return true;
    }
  }
  return false;
}

export function createBackupCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const characters = Array.from({ length: 12 }, () => {
      const index = randomBytes(1)[0] ?? 0;
      return BACKUP_ALPHABET[index % BACKUP_ALPHABET.length];
    });
    return `${characters.slice(0, 4).join("")}-${characters
      .slice(4, 8)
      .join("")}-${characters.slice(8).join("")}`;
  });
}
