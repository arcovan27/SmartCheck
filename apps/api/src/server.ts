import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { Prisma } from "@prisma/client";
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
import { dashboardRoutes } from "./routes/dashboard.js";
import { companyRoutes } from "./routes/company.js";
import { hrCatalogRoutes } from "./routes/hrCatalogs.js";
import { hrDashboardRoutes } from "./routes/hrDashboard.js";
import { hrDocumentRoutes } from "./routes/hrDocuments.js";
import { hrEpiRoutes } from "./routes/hrEpi.js";
import { hrEmployeeRoutes } from "./routes/hrEmployees.js";
import { hrOccurrenceRoutes } from "./routes/hrOccurrences.js";
import { hrPermissionRoutes } from "./routes/hrPermissions.js";
import { hrScheduleRoutes } from "./routes/hrSchedules.js";
import { hrWorkforceAttendanceRoutes } from "./routes/hrWorkforceAttendance.js";
import { hrWorkforceCatalogRoutes } from "./routes/hrWorkforceCatalogs.js";
import { hrWorkforceImportRoutes } from "./routes/hrWorkforceImports.js";
import { hrWorkforcePlanningRoutes } from "./routes/hrWorkforcePlanning.js";
import { quoteRoutes } from "./routes/quotes.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.WEB_ORIGIN.split(",").map((value) => value.trim()),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204
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

await app.register(fastifyStatic, {
  root: path.resolve(process.cwd(), "downloads"),
  prefix: "/downloads/",
  decorateReply: false
});

await app.register(authPlugin);

app.get("/health", async () => ({ status: "ok" }));

await app.register(authRoutes);
await app.register(dashboardRoutes);
await app.register(companyRoutes);
await app.register(hrDashboardRoutes);
await app.register(hrCatalogRoutes);
await app.register(hrOccurrenceRoutes);
await app.register(hrPermissionRoutes);
await app.register(hrScheduleRoutes);
await app.register(hrWorkforceCatalogRoutes);
await app.register(hrWorkforcePlanningRoutes);
await app.register(hrWorkforceAttendanceRoutes);
await app.register(hrWorkforceImportRoutes);
await app.register(hrDocumentRoutes);
await app.register(hrEpiRoutes);
await app.register(hrEmployeeRoutes);
await app.register(employeeRoutes);
await app.register(epiRoutes);
await app.register(equipmentRoutes);
await app.register(checklistRoutes);
await app.register(maintenanceRoutes);
await app.register(uploadRoutes);
await app.register(biometricRoutes);
await app.register(quoteRoutes);

app.setErrorHandler((error: any, request, reply) => {
  if (error.validation) {
    return reply.code(400).send({ message: "Dados inválidos", details: error.validation });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    request.log.error({ err: error, prismaCode: error.code }, "Database request failed");
    if (error.code === "P2002") return reply.code(409).send({ code: "RESOURCE_CONFLICT", message: "O registro conflita com dados existentes." });
    if (error.code === "P2025") return reply.code(404).send({ code: "RESOURCE_NOT_FOUND", message: "Registro não encontrado." });
    return reply.code(500).send({ code: "DATABASE_ERROR", message: "Não foi possível concluir a operação." });
  }

  if (error instanceof Error) {
    if (/Prisma|constraint|\bSQL\b|node_modules|apps[\\/]/i.test(error.message)) {
      request.log.error({ err: error }, "Unsafe internal error suppressed");
      return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." });
    }
    return reply.code(400).send({ message: error.message });
  }

  request.log.error({ err: error }, "Unknown request error");
  return reply.code(500).send({ message: "Erro interno" });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
