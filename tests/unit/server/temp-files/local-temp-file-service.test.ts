import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalTempFileService, TempFileError } from "../../../../src/server/temp-files";

let rootDir: string;
let service: LocalTempFileService;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "resume-temp-files-test-"));
  service = new LocalTempFileService({ rootDir });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("LocalTempFileService", () => {
  it("creates task directories under TEMP_UPLOAD_ROOT and returns normalized paths", async () => {
    const taskDir = await service.createTaskDir({ userId: "user-1", taskId: "task-1" });

    expect(taskDir).toBe(path.join(rootDir, "user-1", "task-1"));
    await expect(stat(taskDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    expect(service.getTaskDir({ userId: "user-1", taskId: "task-1" })).toBe(taskDir);
  });

  it("saves original files, converted docx files, and parser assets through a task lifecycle", async () => {
    const taskDir = await service.createTaskDir({ userId: "user-1", taskId: "task-1" });

    const original = await service.saveOriginal({
      taskDir,
      fileName: "../Resume.DOCX",
      content: Buffer.from("original"),
    });
    const converted = await service.saveConvertedDocx({
      taskDir,
      content: Buffer.from("converted"),
    });
    const asset = await service.saveAsset({
      taskDir,
      fileName: "avatar.png",
      content: Buffer.from("asset"),
    });

    expect(original).toMatchObject({
      taskDir,
      path: path.join(taskDir, "original.docx"),
      originalFileName: "Resume.DOCX",
      fileSize: 8,
    });
    expect(converted.path).toBe(path.join(taskDir, "converted.docx"));
    expect(asset.path).toBe(path.join(taskDir, "assets", "avatar.png"));
    await expect(readFile(original.path, "utf8")).resolves.toBe("original");
    await expect(readFile(converted.path, "utf8")).resolves.toBe("converted");
    await expect(readFile(asset.path, "utf8")).resolves.toBe("asset");

    await service.removeTaskDir({ userId: "user-1", taskId: "task-1" });
    await expect(stat(taskDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects path traversal, absolute paths, and forged task directories", async () => {
    await expect(service.createTaskDir({ userId: "../user", taskId: "task-1" })).rejects.toBeInstanceOf(TempFileError);
    await expect(service.createTaskDir({ userId: "/tmp/user", taskId: "task-1" })).rejects.toBeInstanceOf(TempFileError);
    await expect(service.createTaskDir({ userId: "user-1", taskId: "..\\task-1" })).rejects.toBeInstanceOf(TempFileError);

    const taskDir = await service.createTaskDir({ userId: "user-1", taskId: "task-1" });
    await expect(
      service.saveAsset({
        taskDir,
        fileName: "../avatar.png",
        content: Buffer.from("asset"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_SEGMENT" });
    await expect(
      service.saveOriginal({
        taskDir: path.resolve(rootDir, "..", "attacker", "task-1"),
        fileName: "resume.pdf",
        content: Buffer.from("original"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(
      service.saveOriginal({
        taskDir: path.join(rootDir, "user-1"),
        fileName: "resume.pdf",
        content: Buffer.from("original"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_PATH" });
  });

  it("rejects unsupported original file types", async () => {
    const taskDir = await service.createTaskDir({ userId: "user-1", taskId: "task-1" });

    await expect(
      service.saveOriginal({
        taskDir,
        fileName: "resume.txt",
        content: Buffer.from("original"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" });
  });

  it("removes missing task directories idempotently and does not delete sibling tasks", async () => {
    const firstTaskDir = await service.createTaskDir({ userId: "user-1", taskId: "task-1" });
    const secondTaskDir = await service.createTaskDir({ userId: "user-1", taskId: "task-2" });
    await service.saveOriginal({ taskDir: firstTaskDir, fileName: "first.pdf", content: Buffer.from("first") });
    const secondOriginal = await service.saveOriginal({ taskDir: secondTaskDir, fileName: "second.pdf", content: Buffer.from("second") });

    await service.removeTaskDir({ userId: "user-1", taskId: "task-1" });
    await service.removeTaskDir({ userId: "user-1", taskId: "task-1" });

    await expect(stat(firstTaskDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(secondOriginal.path, "utf8")).resolves.toBe("second");
  });
});
