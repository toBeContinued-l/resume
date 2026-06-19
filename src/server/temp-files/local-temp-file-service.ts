import { constants as fsConstants } from "fs";
import { access, mkdir, open, realpath, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { TempFileRef, TempFileService } from "@/types/temp-files";

const DEFAULT_TEMP_UPLOAD_ROOT = path.join(tmpdir(), "online-resume", "uploads");
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const ORIGINAL_EXTENSIONS = new Set([".doc", ".docx", ".pdf"]);

export class TempFileError extends Error {
  constructor(
    public readonly code: "INVALID_SEGMENT" | "INVALID_PATH" | "INVALID_FILE_TYPE",
    message: string,
  ) {
    super(message);
    this.name = "TempFileError";
  }
}

export type LocalTempFileServiceOptions = {
  rootDir?: string;
};

export class LocalTempFileService implements TempFileService {
  readonly rootDir: string;

  constructor(options: LocalTempFileServiceOptions = {}) {
    const configuredRoot = options.rootDir ?? process.env.TEMP_UPLOAD_ROOT ?? DEFAULT_TEMP_UPLOAD_ROOT;
    this.rootDir = path.resolve(configuredRoot);
  }

  async createTaskDir(input: { userId: string; taskId: string }): Promise<string> {
    const taskDir = this.getTaskDir(input);
    await mkdir(taskDir, { recursive: true });
    await this.assertExistingPathInsideRoot(taskDir);
    return taskDir;
  }

  getTaskDir(input: { userId: string; taskId: string }): string {
    return this.resolveInsideRoot(this.safeSegment(input.userId, "userId"), this.safeSegment(input.taskId, "taskId"));
  }

  async saveOriginal(input: { taskDir: string; fileName: string; content: Buffer }): Promise<TempFileRef> {
    const taskDir = this.assertTaskDirPath(input.taskDir);
    const originalFileName = path.basename(input.fileName);
    const extension = path.extname(originalFileName).toLowerCase();

    if (!ORIGINAL_EXTENSIONS.has(extension)) {
      throw new TempFileError("INVALID_FILE_TYPE", "Original file must be .doc, .docx, or .pdf.");
    }

    const filePath = this.resolveInside(taskDir, `original${extension}`);
    await this.writeFileInsideRoot(filePath, input.content);

    return {
      taskDir,
      path: filePath,
      originalFileName,
      fileSize: input.content.byteLength,
    };
  }

  async saveConvertedDocx(input: { taskDir: string; content: Buffer }): Promise<TempFileRef> {
    const taskDir = this.assertTaskDirPath(input.taskDir);
    const filePath = this.resolveInside(taskDir, "converted.docx");
    await this.writeFileInsideRoot(filePath, input.content);

    return {
      taskDir,
      path: filePath,
      originalFileName: "converted.docx",
      fileSize: input.content.byteLength,
    };
  }

  async getAssetsDir(input: { taskDir: string }): Promise<string> {
    const taskDir = this.assertTaskDirPath(input.taskDir);
    const assetsDir = this.resolveInside(taskDir, "assets");
    await mkdir(assetsDir, { recursive: true });
    await this.assertExistingPathInsideRoot(assetsDir);
    return assetsDir;
  }

  async saveAsset(input: { taskDir: string; fileName: string; content: Buffer }): Promise<TempFileRef> {
    const taskDir = this.assertTaskDirPath(input.taskDir);
    const assetsDir = await this.getAssetsDir({ taskDir });
    const assetName = this.safeFileName(input.fileName);
    const filePath = this.resolveInside(assetsDir, assetName);
    await this.writeFileInsideRoot(filePath, input.content);

    return {
      taskDir,
      path: filePath,
      originalFileName: assetName,
      fileSize: input.content.byteLength,
    };
  }

  async removeTaskDir(input: { userId: string; taskId: string }): Promise<void> {
    const taskDir = this.getTaskDir(input);
    await rm(taskDir, { recursive: true, force: true });
  }

  private safeSegment(value: string, fieldName: string): string {
    if (!SAFE_ID_PATTERN.test(value)) {
      throw new TempFileError("INVALID_SEGMENT", `${fieldName} contains unsafe path characters.`);
    }
    return value;
  }

  private safeFileName(value: string): string {
    const baseName = path.basename(value);
    if (baseName !== value || baseName === "." || baseName === ".." || baseName.includes("\\") || baseName.includes("\0")) {
      throw new TempFileError("INVALID_SEGMENT", "fileName contains unsafe path characters.");
    }
    return baseName;
  }

  private assertTaskDirPath(taskDir: string): string {
    const normalized = path.resolve(taskDir);
    this.assertPathInsideRoot(normalized);

    const relative = path.relative(this.rootDir, normalized);
    const parts = relative.split(path.sep).filter(Boolean);
    if (parts.length !== 2) {
      throw new TempFileError("INVALID_PATH", "Path is not a task directory.");
    }
    return normalized;
  }

  private resolveInsideRoot(...parts: string[]): string {
    return this.resolveInside(this.rootDir, ...parts);
  }

  private resolveInside(basePath: string, ...parts: string[]): string {
    const resolved = path.resolve(basePath, ...parts);
    this.assertPathInsideRoot(resolved);
    return resolved;
  }

  private assertPathInsideRoot(candidate: string): void {
    const relative = path.relative(this.rootDir, candidate);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return;
    }

    throw new TempFileError("INVALID_PATH", "Path escapes TEMP_UPLOAD_ROOT.");
  }

  private async assertExistingPathInsideRoot(candidate: string): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const [rootRealPath, candidateRealPath] = await Promise.all([realpath(this.rootDir), this.realpathIfExists(candidate)]);
    const relative = path.relative(rootRealPath, candidateRealPath);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return;
    }

    throw new TempFileError("INVALID_PATH", "Path escapes TEMP_UPLOAD_ROOT.");
  }

  private async realpathIfExists(candidate: string): Promise<string> {
    await access(candidate, fsConstants.F_OK);
    return realpath(candidate);
  }

  private async writeFileInsideRoot(filePath: string, content: Buffer): Promise<void> {
    await this.assertExistingPathInsideRoot(path.dirname(filePath));
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
    const handle = await open(filePath, flags, 0o600);
    try {
      await handle.writeFile(content);
    } finally {
      await handle.close();
    }
    await this.assertExistingPathInsideRoot(filePath);
  }
}

export function createLocalTempFileService(options?: LocalTempFileServiceOptions): LocalTempFileService {
  return new LocalTempFileService(options);
}

export { DEFAULT_TEMP_UPLOAD_ROOT };
