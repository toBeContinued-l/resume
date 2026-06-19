export type SqlValue = string | number | boolean | Date | Buffer | null;

export type SqlExecutor = {
  execute<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
};

export class MysqlPoolExecutor implements SqlExecutor {
  private pool: MysqlPool | null = null;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  async execute<T = Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    const pool = await this.ensurePool();
    const [rows] = await pool.execute(sql, [...params]);
    return rows as T[];
  }

  async close(): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.end();
    this.pool = null;
  }

  private readonly databaseUrl: string;

  private async ensurePool(): Promise<MysqlPool> {
    if (this.pool) {
      return this.pool;
    }
    const mysql = await loadMysqlPromiseModule();
    this.pool = mysql.createPool(this.databaseUrl);
    return this.pool;
  }
}

type MysqlPool = {
  execute(sql: string, params: readonly SqlValue[]): Promise<[unknown, unknown]>;
  end(): Promise<void>;
};

type MysqlPromiseModule = {
  createPool(databaseUrl: string): MysqlPool;
};

async function loadMysqlPromiseModule(): Promise<MysqlPromiseModule> {
  const mysqlImport = (await import(/* webpackIgnore: true */ "mysql2/promise")) as {
    default?: unknown;
    createPool?: unknown;
  };
  const candidate = mysqlImport.createPool ? mysqlImport : mysqlImport.default;
  if (!candidate || typeof candidate !== "object" || typeof (candidate as MysqlPromiseModule).createPool !== "function") {
    throw new Error("mysql2/promise does not expose createPool().");
  }
  return candidate as MysqlPromiseModule;
}

export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export function toMysqlJson(value: unknown): string {
  return JSON.stringify(value);
}

export function fromMysqlJson<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}

export function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

export function nullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}
