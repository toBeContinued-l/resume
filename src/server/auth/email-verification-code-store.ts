import { createConnection, type Socket } from "net";
import { Buffer } from "buffer";

export type EmailVerificationCodeRecord = {
  email: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
};

export interface EmailVerificationCodeStore {
  save(record: EmailVerificationCodeRecord, ttlSeconds: number): Promise<void>;
  findByEmail(email: string): Promise<EmailVerificationCodeRecord | null>;
  deleteByEmail(email: string): Promise<void>;
}

export class InMemoryEmailVerificationCodeStore implements EmailVerificationCodeStore {
  private readonly records = new Map<string, EmailVerificationCodeRecord>();

  async save(record: EmailVerificationCodeRecord): Promise<void> {
    this.records.set(record.email, record);
  }

  async findByEmail(email: string): Promise<EmailVerificationCodeRecord | null> {
    const record = this.records.get(email);
    if (!record) {
      return null;
    }
    return record;
  }

  async deleteByEmail(email: string): Promise<void> {
    this.records.delete(email);
  }
}

export type RedisEmailVerificationCodeStoreOptions = {
  host: string;
  port: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
};

export class RedisEmailVerificationCodeStore implements EmailVerificationCodeStore {
  private readonly keyPrefix: string;

  constructor(private readonly options: RedisEmailVerificationCodeStoreOptions) {
    this.keyPrefix = options.keyPrefix ?? "online-resume:email-verification:";
  }

  async save(record: EmailVerificationCodeRecord, ttlSeconds: number): Promise<void> {
    await this.command([
      "SET",
      this.key(record.email),
      JSON.stringify({
        email: record.email,
        userId: record.userId,
        codeHash: record.codeHash,
        expiresAt: record.expiresAt.toISOString(),
      }),
      "EX",
      String(ttlSeconds),
    ]);
  }

  async findByEmail(email: string): Promise<EmailVerificationCodeRecord | null> {
    const value = await this.command(["GET", this.key(email)]);
    if (typeof value !== "string") {
      return null;
    }

    const parsed = parseCodeRecord(value);
    if (!parsed || parsed.email !== email) {
      return null;
    }
    return parsed;
  }

  async deleteByEmail(email: string): Promise<void> {
    await this.command(["DEL", this.key(email)]);
  }

  private key(email: string): string {
    return `${this.keyPrefix}${email}`;
  }

  private async command(parts: string[]): Promise<RedisValue> {
    const socket = await openSocket(this.options.host, this.options.port);
    try {
      const parser = new RedisResponseParser(socket);
      if (this.options.password) {
        await writeCommand(socket, ["AUTH", this.options.password]);
        await parser.read();
      }
      if (this.options.database !== undefined) {
        await writeCommand(socket, ["SELECT", String(this.options.database)]);
        await parser.read();
      }
      await writeCommand(socket, parts);
      return await parser.read();
    } finally {
      socket.end();
    }
  }
}

export function createEmailVerificationCodeStoreFromEnv(): EmailVerificationCodeStore {
  if (!process.env.REDIS_HOST?.trim()) {
    return new InMemoryEmailVerificationCodeStore();
  }

  const port = Number(process.env.REDIS_PORT ?? 6379);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("REDIS_PORT must be a positive integer.");
  }

  const database = process.env.REDIS_DATABASE === undefined ? undefined : Number(process.env.REDIS_DATABASE);
  if (database !== undefined && (!Number.isInteger(database) || database < 0)) {
    throw new Error("REDIS_DATABASE must be a non-negative integer.");
  }

  return new RedisEmailVerificationCodeStore({
    host: process.env.REDIS_HOST,
    port,
    password: process.env.REDIS_PASSWORD,
    database,
    keyPrefix: process.env.REDIS_EMAIL_VERIFICATION_PREFIX,
  });
}

type RedisValue = string | number | null | RedisValue[];

function parseCodeRecord(value: string): EmailVerificationCodeRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<Record<keyof EmailVerificationCodeRecord, unknown>>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.codeHash !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      return null;
    }
    const expiresAt = new Date(parsed.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return null;
    }
    return {
      email: parsed.email,
      userId: parsed.userId,
      codeHash: parsed.codeHash,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function openSocket(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port, timeout: 10_000 });
    socket.once("connect", () => resolve(socket));
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Redis connection timeout."));
    });
    socket.once("error", reject);
  });
}

function writeCommand(socket: Socket, parts: string[]): Promise<void> {
  const payload = encodeCommand(parts);
  return new Promise((resolve, reject) => {
    socket.write(payload, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function encodeCommand(parts: string[]): Buffer {
  const buffers: Buffer[] = [Buffer.from(`*${parts.length}\r\n`)];
  for (const part of parts) {
    const body = Buffer.from(part);
    buffers.push(Buffer.from(`$${body.length}\r\n`), body, Buffer.from("\r\n"));
  }
  return Buffer.concat(buffers);
}

class RedisResponseParser {
  private buffer = Buffer.alloc(0);

  constructor(private readonly socket: Socket) {}

  async read(): Promise<RedisValue> {
    for (;;) {
      const parsed = this.tryParse(0);
      if (parsed) {
        this.buffer = this.buffer.subarray(parsed.nextOffset);
        return parsed.value;
      }
      const chunk = await this.readChunk();
      this.buffer = Buffer.concat([this.buffer, chunk]);
    }
  }

  private readChunk(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
        this.socket.off("end", onEnd);
      };
      const onData = (chunk: Buffer) => {
        cleanup();
        resolve(chunk);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onEnd = () => {
        cleanup();
        reject(new Error("Redis connection ended before a response was received."));
      };
      this.socket.once("data", onData);
      this.socket.once("error", onError);
      this.socket.once("end", onEnd);
    });
  }

  private tryParse(offset: number): { value: RedisValue; nextOffset: number } | null {
    const type = this.buffer[offset];
    if (type === undefined) {
      return null;
    }

    if (type === 43) {
      return this.parseSimpleString(offset);
    }
    if (type === 45) {
      return this.parseError(offset);
    }
    if (type === 58) {
      return this.parseInteger(offset);
    }
    if (type === 36) {
      return this.parseBulkString(offset);
    }
    if (type === 42) {
      return this.parseArray(offset);
    }
    throw new Error("Unsupported Redis response.");
  }

  private parseSimpleString(offset: number): { value: string; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    return { value: this.buffer.toString("utf8", offset + 1, end), nextOffset: end + 2 };
  }

  private parseError(offset: number): never | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    throw new Error(this.buffer.toString("utf8", offset + 1, end));
  }

  private parseInteger(offset: number): { value: number; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    return { value: Number(this.buffer.toString("utf8", offset + 1, end)), nextOffset: end + 2 };
  }

  private parseBulkString(offset: number): { value: string | null; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    const length = Number(this.buffer.toString("utf8", offset + 1, end));
    if (length === -1) {
      return { value: null, nextOffset: end + 2 };
    }
    const start = end + 2;
    const nextOffset = start + length + 2;
    if (this.buffer.length < nextOffset) {
      return null;
    }
    return { value: this.buffer.toString("utf8", start, start + length), nextOffset };
  }

  private parseArray(offset: number): { value: RedisValue[]; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    const length = Number(this.buffer.toString("utf8", offset + 1, end));
    if (length === -1) {
      return { value: [], nextOffset: end + 2 };
    }

    const values: RedisValue[] = [];
    let nextOffset = end + 2;
    for (let index = 0; index < length; index += 1) {
      const parsed = this.tryParse(nextOffset);
      if (!parsed) {
        return null;
      }
      values.push(parsed.value);
      nextOffset = parsed.nextOffset;
    }
    return { value: values, nextOffset };
  }

  private lineEnd(offset: number): number {
    return this.buffer.indexOf("\r\n", offset);
  }
}
