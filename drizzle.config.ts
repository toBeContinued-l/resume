const config = {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://user:password@localhost:3306/online_resume"
  }
};

export default config;
