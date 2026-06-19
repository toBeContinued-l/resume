import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

const databaseUrl = process.env.DATABASE_URL ?? readEnvFileValue("DATABASE_URL");

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const pool = mysql.createPool(databaseUrl);

try {
  const [rows] = await pool.query(
    `
      select
        gt.id as task_id,
        gt.user_id,
        gt.resume_id,
        gt.status as task_status,
        gt.retry_count,
        gt.error_code,
        gt.error_message,
        gt.created_at as task_created_at,
        gt.updated_at as task_updated_at,
        gt.completed_at as task_completed_at,
        r.title as resume_title,
        r.status as resume_status,
        r.source_file_name,
        r.current_task_id,
        r.updated_at as resume_updated_at
      from generation_tasks gt
      join resumes r on r.id = gt.resume_id
      where gt.is_deleted = false
      order by gt.updated_at desc
      limit 20
    `,
  );

  console.log(JSON.stringify(rows, null, 2));
} finally {
  await pool.end();
}

function readEnvFileValue(name) {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return undefined;
  }
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  const prefix = `${name}=`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith(prefix)) {
      continue;
    }
    const rawValue = trimmed.slice(prefix.length).trim();
    return rawValue.replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}
