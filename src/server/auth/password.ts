import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt}$${derived.toString("hex")}`;
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const [algorithm, salt, expectedHex] = passwordHash.split("$");
    if (algorithm !== "scrypt" || !salt || !expectedHex) {
      return false;
    }

    const expected = Buffer.from(expectedHex, "hex");
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

export function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long.");
  }
  if (!/[A-Za-z]/.test(password)) {
    errors.push("Password must contain at least one letter.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number.");
  }
  return errors;
}
