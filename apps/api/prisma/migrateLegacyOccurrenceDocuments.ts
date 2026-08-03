import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { prisma } from "../src/prisma.js";
import { env } from "../src/env.js";

const apply = process.argv.includes("--apply");
const publicRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
const privateRoot = path.resolve(process.cwd(), env.PRIVATE_UPLOAD_DIR, "occurrences");

function contained(root: string, target: string) {
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return target.startsWith(prefix);
}

const occurrences = await prisma.employeeOccurrence.findMany({
  where: { attachmentPath: { not: null } },
  select: { id: true, companyId: true, attachmentPath: true, attachmentFilename: true, attachmentMimeType: true }
});

console.log(`${occurrences.length} documento(s) legado(s) encontrado(s). Modo: ${apply ? "APLICAR" : "SIMULACAO"}.`);
if (apply) await fs.mkdir(privateRoot, { recursive: true });

for (const occurrence of occurrences) {
  if (!occurrence.attachmentPath) continue;
  const source = path.resolve(process.cwd(), occurrence.attachmentPath);
  if (!contained(publicRoot, source)) {
    console.warn(`Ignorado ${occurrence.id}: caminho fora do diretorio publico.`);
    continue;
  }
  try {
    await fs.access(source);
  } catch {
    console.warn(`Ignorado ${occurrence.id}: arquivo nao encontrado.`);
    continue;
  }
  const extension = path.extname(occurrence.attachmentFilename ?? source).toLowerCase();
  const destination = path.join(privateRoot, `${occurrence.id}-${nanoid()}${extension}`);
  console.log(`${occurrence.id}: ${source} -> ${destination}`);
  if (!apply) continue;

  await fs.copyFile(source, destination);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.attachment.create({
        data: {
          employeeOccurrenceId: occurrence.id,
          companyId: occurrence.companyId,
          filename: occurrence.attachmentFilename ?? path.basename(source),
          mimeType: occurrence.attachmentMimeType ?? "application/octet-stream",
          path: path.relative(process.cwd(), destination),
          isSensitive: true
        }
      });
      await tx.employeeOccurrence.update({
        where: { id: occurrence.id },
        data: { attachmentPath: null, attachmentFilename: null, attachmentMimeType: null }
      });
    });
    await fs.unlink(source);
  } catch (error) {
    await fs.rm(destination, { force: true });
    throw error;
  }
}

await prisma.$disconnect();
