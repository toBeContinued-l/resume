export type TempFileRef = {
  taskDir: string;
  path: string;
  originalFileName: string;
  fileSize: number;
};

export interface TempFileService {
  createTaskDir(input: { userId: string; taskId: string }): Promise<string>;
  saveOriginal(input: {
    taskDir: string;
    fileName: string;
    content: Buffer;
  }): Promise<TempFileRef>;
  saveConvertedDocx(input: {
    taskDir: string;
    content: Buffer;
  }): Promise<TempFileRef>;
  getAssetsDir(input: { taskDir: string }): Promise<string>;
  saveAsset(input: {
    taskDir: string;
    fileName: string;
    content: Buffer;
  }): Promise<TempFileRef>;
  getTaskDir(input: { userId: string; taskId: string }): string;
  removeTaskDir(input: { userId: string; taskId: string }): Promise<void>;
}
