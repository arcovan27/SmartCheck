import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { HrPermission } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertUnitAccess, hasHrPermission, requireAnyHrPermission, requireHrPermission, resolveHrDataScope } from "../services/hrAccess.js";
import { occurrenceTypePermission } from "../services/occurrenceWorkflow.js";

const allowedDocumentTypes = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"]
]);

function hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return false;
}

function safeDownloadName(filename: string): string {
  return filename.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "documento";
}

export async function hrDocumentRoutes(app: FastifyInstance) {
  app.post(
    "/hr/occurrences/:occurrenceId/documents",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.OCCURRENCE_REGISTER)] },
    async (request, reply) => {
      const params = z.object({ occurrenceId: z.string().cuid() }).parse(request.params);
      const scope = await resolveHrDataScope(request);
      const occurrence = await prisma.employeeOccurrence.findFirst({
        where: {
          id: params.occurrenceId,
          deletedAt: null,
          companyId: { in: scope.companyIds }
        },
        select: { id: true, companyId: true, unitId: true, frequencyType: { select: { code: true } } }
      });
      if (!occurrence) return reply.code(404).send({ message: "Ocorrencia nao encontrada" });
      assertUnitAccess(scope, occurrence.unitId);
      const occurrencePermission = occurrence.frequencyType ? occurrenceTypePermission(occurrence.frequencyType.code) : null;
      if (occurrencePermission && !(await hasHrPermission(request.user.role, occurrencePermission.register))) return reply.code(403).send({ message: "Permissao insuficiente para anexar documento a este tipo de ocorrencia" });

      const file = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
      if (!file) return reply.code(400).send({ message: "Documento nao enviado" });
      const extension = allowedDocumentTypes.get(file.mimetype);
      if (!extension) return reply.code(415).send({ message: "Formato permitido: PDF, JPG ou PNG" });

      const buffer = await file.toBuffer();
      if (buffer.length === 0 || !hasExpectedSignature(buffer, file.mimetype)) {
        return reply.code(415).send({ message: "O conteudo do arquivo nao corresponde ao formato informado" });
      }

      const privateRoot = path.resolve(process.cwd(), env.PRIVATE_UPLOAD_DIR);
      await fs.promises.mkdir(privateRoot, { recursive: true });
      const storedFilename = `${Date.now()}-${nanoid()}${extension}`;
      const absolutePath = path.join(privateRoot, storedFilename);
      await fs.promises.writeFile(absolutePath, buffer, { flag: "wx" });

      try {
        const attachment = await prisma.$transaction(async (tx) => {
          const created = await tx.attachment.create({
            data: {
              filename: safeDownloadName(file.filename),
              mimeType: file.mimetype,
              path: storedFilename,
              employeeOccurrenceId: occurrence.id,
              companyId: occurrence.companyId,
              uploadedById: request.user.id,
              isSensitive: true
            },
            select: { id: true, filename: true, mimeType: true, createdAt: true }
          });
          await writeAudit(tx, request, {
            companyId: occurrence.companyId,
            unitId: occurrence.unitId,
            action: "DOCUMENT_UPLOAD",
            entityType: "EmployeeOccurrence",
            entityId: occurrence.id,
            metadata: { attachmentId: created.id, mimeType: created.mimeType }
          });
          return created;
        });
        return reply.code(201).send(attachment);
      } catch (error) {
        await fs.promises.unlink(absolutePath).catch(() => undefined);
        throw error;
      }
    }
  );

  app.get(
    "/hr/documents/:id",
    { preHandler: [app.authenticate, requireHrPermission(HrPermission.DOCUMENT_VIEW)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const scope = await resolveHrDataScope(request);
      const attachment = await prisma.attachment.findFirst({
        where: { id: params.id, deletedAt: null, isSensitive: true, companyId: { in: scope.companyIds } },
        include: { employeeOccurrence: { select: { unitId: true, frequencyType: { select: { code: true } } } } }
      });
      if (!attachment) return reply.code(404).send({ message: "Documento nao encontrado" });
      assertUnitAccess(scope, attachment.employeeOccurrence?.unitId);
      const occurrencePermission = attachment.employeeOccurrence?.frequencyType ? occurrenceTypePermission(attachment.employeeOccurrence.frequencyType.code) : null;
      if (occurrencePermission && !(await hasHrPermission(request.user.role, occurrencePermission.view))) return reply.code(403).send({ message: "Permissao insuficiente para visualizar este documento" });

      const privateRoot = path.resolve(process.cwd(), env.PRIVATE_UPLOAD_DIR);
      const absolutePath = path.resolve(privateRoot, attachment.path);
      const rootPrefix = privateRoot.endsWith(path.sep) ? privateRoot : `${privateRoot}${path.sep}`;
      if (!absolutePath.startsWith(rootPrefix)) return reply.code(400).send({ message: "Caminho de documento invalido" });
      if (!fs.existsSync(absolutePath)) return reply.code(404).send({ message: "Arquivo nao encontrado no armazenamento" });

      await writeAudit(prisma, request, {
        companyId: attachment.companyId,
        unitId: attachment.employeeOccurrence?.unitId,
        action: "DOCUMENT_DOWNLOAD",
        entityType: "Attachment",
        entityId: attachment.id,
        metadata: { occurrenceId: attachment.employeeOccurrenceId }
      });

      reply.header("Content-Disposition", `inline; filename="${safeDownloadName(attachment.filename)}"`);
      reply.type(attachment.mimeType);
      return reply.send(fs.createReadStream(absolutePath));
    }
  );

  app.delete(
    "/hr/documents/:id",
    { preHandler: [app.authenticate, requireAnyHrPermission(HrPermission.OCCURRENCE_EDIT, HrPermission.OCCURRENCE_CANCEL)] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const scope = await resolveHrDataScope(request);
      const attachment = await prisma.attachment.findFirst({
        where: { id: params.id, deletedAt: null, companyId: { in: scope.companyIds } },
        include: { employeeOccurrence: { select: { id: true, unitId: true, frequencyType: { select: { code: true } } } } }
      });
      if (!attachment?.employeeOccurrence) return reply.code(404).send({ message: "Documento nao encontrado" });
      assertUnitAccess(scope, attachment.employeeOccurrence.unitId);
      const permission = attachment.employeeOccurrence.frequencyType ? occurrenceTypePermission(attachment.employeeOccurrence.frequencyType.code) : null;
      if (permission && !(await hasHrPermission(request.user.role, permission.register))) return reply.code(403).send({ message: "Permissao insuficiente para remover este documento" });
      await prisma.$transaction(async (tx) => {
        await tx.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date(), deletedById: request.user.id } });
        await writeAudit(tx, request, {
          companyId: attachment.companyId, unitId: attachment.employeeOccurrence?.unitId,
          action: "DOCUMENT_REMOVE", entityType: "Attachment", entityId: attachment.id,
          previousValue: { filename: attachment.filename, occurrenceId: attachment.employeeOccurrenceId },
          newValue: { deletedAt: true }, metadata: { occurrenceId: attachment.employeeOccurrenceId }
        });
      });
      return reply.send({ message: "Documento removido do fluxo; historico preservado" });
    }
  );
}
