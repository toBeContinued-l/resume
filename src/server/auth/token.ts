import { createHash, randomBytes } from "crypto";

export function createSecretToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
