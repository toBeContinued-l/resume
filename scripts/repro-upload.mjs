import fs from "fs";

const baseUrl = process.env.REPRO_BASE_URL ?? "http://127.0.0.1:3003";
const resumePath = process.env.REPRO_RESUME_PATH ?? "/Users/milu/Desktop/张三的个人简历.docx";
const email = `codex.${Date.now()}@example.test`;
const password = "StrongPassw0rd!";

let cookie = "";

async function main() {
  console.log(`Using resume: ${resumePath}`);

  const registerResult = await request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  printStep("register", registerResult);

  const code = registerResult.body?.data?.devVerificationCode;
  if (!code) {
    throw new Error("Registration did not return devVerificationCode.");
  }

  const verifyResult = await request("/api/auth/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  printStep("verify-email", verifyResult);

  const loginResult = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  printStep("login", loginResult);
  console.log(`cookie: ${cookie || "<missing>"}`);

  const form = new FormData();
  const buffer = fs.readFileSync(resumePath);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  form.append("file", blob, "张三的个人简历.docx");

  const uploadResult = await request("/api/resumes/upload", {
    method: "POST",
    body: form,
  });
  printStep("upload", uploadResult);

  const taskId = uploadResult.body?.data?.taskId;
  if (!taskId) {
    throw new Error("Upload did not return taskId.");
  }

  for (let index = 0; index < 40; index += 1) {
    await sleep(3000);
    const progressResult = await request(`/api/generation-tasks/${taskId}`);
    printStep(`poll-${index + 1}`, progressResult);
    const status = progressResult.body?.data?.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      break;
    }
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (cookie) {
    headers.set("cookie", cookie);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie.split(";")[0];
  }
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    status: response.status,
    body,
  };
}

function printStep(step, payload) {
  console.log(`\n[${step}]`);
  console.log(JSON.stringify(payload, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
