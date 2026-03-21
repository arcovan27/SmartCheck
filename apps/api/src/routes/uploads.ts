import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { nanoid } from "nanoid";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/uploads", { preHandler: [app.authenticate] }, async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ message: "Arquivo não enviado" });
    }

    const filename = `${Date.now()}-${nanoid()}-${file.filename.replace(/\s+/g, "-")}`;
    const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
    fs.mkdirSync(uploadDir, { recursive: true });

    const relativePath = path.join(env.UPLOAD_DIR, filename);
    const absolutePath = path.resolve(process.cwd(), relativePath);

    await pipeline(file.file, fs.createWriteStream(absolutePath));

    const attachment = await prisma.attachment.create({
      data: {
        filename: file.filename,
        mimeType: file.mimetype,
        path: relativePath
      }
    });

    return reply.code(201).send(attachment);
  });

  app.post("/attachments/link", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        attachmentId: z.string().cuid(),
        maintenanceId: z.string().cuid().optional(),
        checklistExecutionItemId: z.string().cuid().optional(),
        epiDeliveryId: z.string().cuid().optional()
      })
      .parse(request.body);

    return prisma.attachment.update({
      where: { id: body.attachmentId },
      data: {
        maintenanceId: body.maintenanceId,
        checklistExecutionItemId: body.checklistExecutionItemId,
        epiDeliveryId: body.epiDeliveryId
      }
    });
  });
}
