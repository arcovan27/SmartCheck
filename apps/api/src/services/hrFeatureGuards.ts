import type { FastifyReply, FastifyRequest } from "fastify";
import { hrFeatures } from "../config/hrFeatures.js";

export const workScheduleDisabledResponse = {
  code: "WORK_SCHEDULE_DISABLED",
  message: "O modulo Escala de trabalho esta temporariamente indisponivel."
} as const;

export async function requireWorkScheduleEnabled(_request: FastifyRequest, reply: FastifyReply) {
  if (!hrFeatures.workScheduleEnabled) {
    return reply.code(503).send(workScheduleDisabledResponse);
  }
}
