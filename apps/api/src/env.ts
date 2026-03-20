import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  UPLOAD_DIR: z.string().default("uploads"),
  WEB_ORIGIN: z.string().default("http://localhost:5173")
});

export const env = envSchema.parse(process.env);
