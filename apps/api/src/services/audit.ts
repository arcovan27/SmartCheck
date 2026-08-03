import type { Prisma, PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";

type AuditDb = PrismaClient | Prisma.TransactionClient;

const forbiddenAuditKeys = new Set([
  "passwordHash",
  "password",
  "biometricTemplateId",
  "attachmentPath",
  "path",
  "cid",
  "diagnosis",
  "medicalNotes"
]);

export function sanitizeAuditValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const serialized = JSON.stringify(value, (key, item) => {
    if (forbiddenAuditKeys.has(key)) return undefined;
    if (typeof item === "bigint") return item.toString();
    return item;
  });
  if (serialized === undefined) return undefined;
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export async function writeAudit(
  db: AuditDb,
  request: FastifyRequest,
  input: {
    companyId?: string | null;
    unitId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: unknown;
    newValue?: unknown;
    metadata?: unknown;
  }
) {
  return db.auditLog.create({
    data: {
      companyId: input.companyId ?? null,
      unitId: input.unitId ?? null,
      actorUserId: request.user.id,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousValue: sanitizeAuditValue(input.previousValue),
      newValue: sanitizeAuditValue(input.newValue),
      metadata: sanitizeAuditValue(input.metadata),
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null
    }
  });
}
