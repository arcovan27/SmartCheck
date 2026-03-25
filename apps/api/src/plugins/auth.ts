import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

export const authPlugin = fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();

      if (request.user?.checklistOnly) {
        const path = request.url.split("?")[0] ?? "";
        const allowedPrefixes = [
          "/auth/me",
          "/equipments",
          "/checklist-templates",
          "/checklist-executions",
          "/history/equipment",
          "/uploads"
        ];
        const allowed = allowedPrefixes.some((prefix) => path.startsWith(prefix));
        if (!allowed) {
          return reply.code(403).send({ message: "Acesso permitido apenas para execucao de checklist" });
        }
      }
    } catch {
      reply.code(401).send({ message: "Unauthorized" });
    }
  });
});
