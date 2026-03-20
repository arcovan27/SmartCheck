import type { UserRole } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

export function allowRoles(roles: UserRole[]) {
  return async function checkRole(request: FastifyRequest, reply: FastifyReply) {
    if (!roles.includes(request.user.role)) {
      reply.code(403).send({ message: "Forbidden" });
    }
  };
}
