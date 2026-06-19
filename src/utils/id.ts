import { randomBytes, randomUUID } from "node:crypto";

export const createId = () => randomUUID();

export const createSecureSlug = (bytes = 16) =>
  randomBytes(bytes).toString("base64url");
