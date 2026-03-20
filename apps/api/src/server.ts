import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { env } from "./env.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { employeeRoutes } from "./routes/employees.js";
import { epiRoutes } from "./routes/epi.js";
import { equipmentRoutes } from "./routes/equipments.js";
import { checklistRoutes } from "./routes/checklists.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { uploadRoutes } from "./routes/uploads.js";
import { biometricRoutes } from "./routes/biometric.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.WEB_ORIGIN.split(",").map((value) => value.trim()),
  credentials: true
});

await app.register(multipart, {
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

await app.register(fastifyStatic, {
  root: path.resolve(process.cwd(), env.UPLOAD_DIR),
  prefix: "/files/"
});

await app.register(authPlugin);

app.get("/health", async () => ({ status: "ok" }));

await app.register(authRoutes);
await app.register(employeeRoutes);
await app.register(epiRoutes);
await app.register(equipmentRoutes);
await app.register(checklistRoutes);
await app.register(maintenanceRoutes);
await app.register(uploadRoutes);
await app.register(biometricRoutes);

app.setErrorHandler((error: any, _request, reply) => {
  if (error.validation) {
    return reply.code(400).send({ message: "Dados inválidos", details: error.validation });
  }

  if (error instanceof Error) {
    return reply.code(400).send({ message: error.message });
  }

  return reply.code(500).send({ message: "Erro interno" });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
