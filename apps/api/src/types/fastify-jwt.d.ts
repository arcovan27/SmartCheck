import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      id: string;
      employeeId: string | null;
      role: UserRole;
      email: string;
    };
    user: {
      id: string;
      employeeId: string | null;
      role: UserRole;
      email: string;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
