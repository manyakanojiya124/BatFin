import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { env } from "./env.js";

export interface SignedAssetQrPayload {
  v: 1;
  assetId: string;
  serialNumber: string;
  token: string;
  issuedAt: number;
}

function signingKey() {
  const key = Buffer.from(env.adminQrSigningKey, "base64");
  if (key.length !== 32) {
    throw new Error("ADMIN_QR_SIGNING_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function signature(value: string) {
  return createHmac("sha256", signingKey()).update(value).digest("base64url");
}

export function hashAssetQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function issueAssetQr(assetId: string, serialNumber: string) {
  const token = randomBytes(24).toString("base64url");
  const payload: SignedAssetQrPayload = {
    v: 1,
    assetId,
    serialNumber,
    token,
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    qrData: `BTF1.${encoded}.${signature(encoded)}`,
    tokenHash: hashAssetQrToken(token),
    issuedAt: new Date(payload.issuedAt),
  };
}

export function verifyAssetQrSignature(qrData: string) {
  if (qrData.length > 4096) throw new Error("QR payload is too large");
  const [prefix, encoded, suppliedSignature] = qrData.trim().split(".");
  if (prefix !== "BTF1" || !encoded || !suppliedSignature) {
    throw new Error("QR payload format is invalid");
  }
  const expected = Buffer.from(signature(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new Error("QR signature is invalid");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as Partial<SignedAssetQrPayload>;
  if (
    payload.v !== 1 ||
    typeof payload.assetId !== "string" ||
    typeof payload.serialNumber !== "string" ||
    typeof payload.token !== "string" ||
    typeof payload.issuedAt !== "number" ||
    payload.issuedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("QR payload contents are invalid");
  }
  return payload as SignedAssetQrPayload;
}
