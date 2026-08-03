import type { FastifyInstance } from "fastify";
import { HrPermission, OccurrenceStatus, Prisma, ScheduleImportItemStatus, ScheduleImportStatus, ScheduleOrigin, SchedulePeriodStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { attendanceDefaultStatus, canonicalImportHash, dateOnly, normalizePersonName, resolveImportCode, startOfCompetence, type ImportAdDecision } from "../services/workforceSchedules.js";
import { requireWorkScheduleEnabled } from "../services/hrFeatureGuards.js";

const adDecisionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.enum(["AUX_DOENCA", "ADVERT", "FALTA_JUST", "IGNORE"]) }),
  z.object({ mode: z.literal("INDIVIDUAL"), values: z.record(z.enum(["AUX_DOENCA", "ADVERT", "FALTA_JUST", "IGNORE"])) })
]);

const importInput = z.object({
  companyId: z.string(), unitId: z.string().optional().nullable(), originalName: z.string().min(1).max(255), sheetName: z.string().min(1).max(120), competence: z.string().regex(/^\d{4}-\d{2}$/), adDecision: adDecisionSchema.optional(),
  rows: z.array(z.object({ sourceRow: z.number().int().min(1), sourceEmployeeKey: z.string().min(1).max(200), sourceName: z.string().min(2).max(200), sourceRegistration: z.string().max(80).optional().nullable(), confirmedEmployeeId: z.string().cuid().optional().nullable(), cells: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), code: z.string().min(1).max(20) })).min(1).max(31) })).min(1).max(600)
});

type PreviewItem = {
  sourceRow: number; sourceEmployeeKey: string; sourceName: string; sourceRegistration?: string | null; employeeId?: string; date: Date; sourceCode: string; frequencyTypeId?: string; status: ScheduleImportItemStatus; issue?: Prisma.InputJsonValue; sourcePayload: Prisma.InputJsonValue;
};

function summarize(items: PreviewItem[]) {
  const byStatus: Record<string, number> = {};
  for (const item of items) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  const unresolved = items.filter((item) => item.status !== ScheduleImportItemStatus.READY && item.status !== ScheduleImportItemStatus.IGNORED).length;
  return { total: items.length, ready: byStatus.READY ?? 0, ignored: byStatus.IGNORED ?? 0, unresolved, byStatus };
}

export async function hrWorkforceImportRoutes(app: FastifyInstance) {
  app.post("/hr/workforce/imports/preview", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SCHEDULE_IMPORT)] }, async (request, reply) => {
    const body = importInput.parse(request.body);
    const scope = await resolveHrDataScope(request); assertCompanyAccess(scope, body.companyId); assertUnitAccess(scope, body.unitId);
    if (!body.unitId && !scope.allUnitsInCompanies) return reply.code(403).send({ message: "Informe uma unidade dentro do escopo autorizado" });
    const competence = startOfCompetence(`${body.competence}-01`);
    const hashPayload = { companyId: body.companyId, unitId: body.unitId, sheetName: body.sheetName, competence: body.competence, rows: body.rows.map(({ confirmedEmployeeId: _ignored, ...row }) => row) };
    const contentHash = canonicalImportHash(hashPayload);
    const previous = await prisma.scheduleImportBatch.findUnique({ where: { companyId_contentHash_sheetName: { companyId: body.companyId, contentHash, sheetName: body.sheetName } }, include: { items: true } });
    if (previous) assertUnitAccess(scope, previous.unitId);
    if (previous?.status === ScheduleImportStatus.IMPORTED) return reply.send({ idempotent: true, batch: previous });

    const employees = await prisma.employee.findMany({ where: { companyId: body.companyId, unitId: unitScopeFilter(scope, body.unitId ?? undefined) }, select: { id: true, name: true, registration: true, isActive: true, unitId: true } });
    const frequencyTypes = await prisma.frequencyType.findMany({ where: { companyId: body.companyId, isActive: true } });
    const employeeById = new Map(employees.map((item) => [item.id, item]));
    const employeeByRegistration = new Map(employees.map((item) => [item.registration.trim().toUpperCase(), item]));
    const employeesByName = new Map<string, typeof employees>();
    for (const employee of employees) { const key = normalizePersonName(employee.name); employeesByName.set(key, [...(employeesByName.get(key) ?? []), employee]); }
    const frequencyByCode = new Map(frequencyTypes.map((item) => [item.code, item]));
    const requestedDates = body.rows.flatMap((row) => row.cells.map((cell) => dateOnly(cell.date)));
    if (requestedDates.some((date) => startOfCompetence(date).getTime() !== competence.getTime())) return reply.code(400).send({ message: "Todos os lancamentos devem pertencer a competencia informada" });
    const nextCompetence = new Date(competence); nextCompetence.setUTCMonth(nextCompetence.getUTCMonth() + 1);
    const existingAttendance = await prisma.dailyAttendance.findMany({ where: { companyId: body.companyId, date: { gte: competence, lt: nextCompetence }, deletedAt: null }, select: { employeeId: true, date: true, id: true } });
    const attendanceKeys = new Map(existingAttendance.map((item) => [`${item.employeeId}:${item.date.toISOString().slice(0, 10)}`, item.id]));
    const items: PreviewItem[] = [];
    for (const row of body.rows) {
      let employee = row.confirmedEmployeeId ? employeeById.get(row.confirmedEmployeeId) : undefined;
      let employeeStatus: ScheduleImportItemStatus | undefined;
      if (row.confirmedEmployeeId && !employee) employeeStatus = ScheduleImportItemStatus.EMPLOYEE_NOT_FOUND;
      if (!employee && row.sourceRegistration) employee = employeeByRegistration.get(row.sourceRegistration.trim().toUpperCase());
      if (!employee && !employeeStatus) {
        const matches = employeesByName.get(normalizePersonName(row.sourceName)) ?? [];
        employeeStatus = matches.length > 1 ? ScheduleImportItemStatus.EMPLOYEE_AMBIGUOUS : matches.length === 1 ? ScheduleImportItemStatus.EMPLOYEE_SUGGESTED : ScheduleImportItemStatus.EMPLOYEE_NOT_FOUND;
      }
      if (employee && !employee.isActive) employeeStatus = ScheduleImportItemStatus.EMPLOYEE_INACTIVE;
      for (const cell of row.cells) {
        const sourceKey = `${row.sourceEmployeeKey}:${cell.date}`;
        const code = resolveImportCode(cell.code, sourceKey, body.adDecision as ImportAdDecision | undefined);
        const frequency = code.internalCode ? frequencyByCode.get(code.internalCode) : undefined;
        let status = employeeStatus ?? code.status;
        let issue: Prisma.InputJsonValue | undefined;
        if (!employeeStatus && code.status === ScheduleImportItemStatus.READY && !frequency) status = ScheduleImportItemStatus.CODE_NOT_FOUND;
        if (!employeeStatus && status === ScheduleImportItemStatus.READY && employee && attendanceKeys.has(`${employee.id}:${cell.date}`)) { status = ScheduleImportItemStatus.CONFLICT; issue = { existingAttendanceId: attendanceKeys.get(`${employee.id}:${cell.date}`) }; }
        if (!employeeStatus && status === ScheduleImportItemStatus.READY && frequency?.requiresDocument) { status = ScheduleImportItemStatus.CONFLICT; issue = { reason: "DOCUMENT_REQUIRED", message: "Documento obrigatorio deve ser associado antes da importacao" }; }
        items.push({ sourceRow: row.sourceRow, sourceEmployeeKey: row.sourceEmployeeKey, sourceName: row.sourceName, sourceRegistration: row.sourceRegistration, employeeId: employee?.id, date: dateOnly(cell.date), sourceCode: cell.code.trim().toUpperCase(), frequencyTypeId: frequency?.id, status, issue, sourcePayload: { sourceKey, code: cell.code } });
      }
    }
    const summary = summarize(items);
    const batchStatus = summary.unresolved ? ScheduleImportStatus.REVIEW_REQUIRED : ScheduleImportStatus.READY;
    const batch = await prisma.$transaction(async (tx) => {
      let result;
      if (previous) {
        await tx.scheduleImportItem.deleteMany({ where: { batchId: previous.id } });
        result = await tx.scheduleImportBatch.update({ where: { id: previous.id }, data: { unitId: body.unitId, competence, originalName: body.originalName, status: batchStatus, adDecision: body.adDecision as Prisma.InputJsonValue | undefined, summary, items: { create: items } }, include: { items: true } });
      } else {
        result = await tx.scheduleImportBatch.create({ data: { companyId: body.companyId, unitId: body.unitId, sheetName: body.sheetName, competence, originalName: body.originalName, contentHash, status: batchStatus, adDecision: body.adDecision as Prisma.InputJsonValue | undefined, summary, createdById: request.user.id, items: { create: items } }, include: { items: true } });
      }
      await writeAudit(tx, request, { companyId: body.companyId, unitId: body.unitId, action: previous ? "SCHEDULE_IMPORT_REVALIDATE" : "SCHEDULE_IMPORT_PREVIEW", entityType: "ScheduleImportBatch", entityId: result.id, previousValue: previous ? { status: previous.status, summary: previous.summary } : undefined, newValue: { status: result.status, summary }, metadata: { contentHash, adDecision: body.adDecision } });
      return result;
    });
    return reply.code(previous ? 200 : 201).send({ idempotent: false, batch });
  });

  app.patch("/hr/workforce/imports/:batchId/items/:itemId", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SCHEDULE_IMPORT)] }, async (request, reply) => {
    const params = z.object({ batchId: z.string().cuid(), itemId: z.string().cuid() }).parse(request.params);
    const body = z.object({ action: z.enum(["ASSIGN", "IGNORE"]), employeeId: z.string().cuid().optional(), frequencyTypeId: z.string().cuid().optional() }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.scheduleImportItem.findFirst({ where: { id: params.itemId, batchId: params.batchId, batch: { companyId: { in: scope.companyIds }, status: { not: ScheduleImportStatus.IMPORTED } } }, include: { batch: true } });
    if (!existing) return reply.code(404).send({ message: "Item de importacao nao encontrado ou ja importado" });
    let data: Prisma.ScheduleImportItemUpdateInput = { status: ScheduleImportItemStatus.IGNORED, issue: Prisma.JsonNull };
    if (body.action === "ASSIGN") {
      if (!body.employeeId || !body.frequencyTypeId) return reply.code(400).send({ message: "Funcionario e tipo de frequencia sao obrigatorios" });
      const [employee, frequency, conflict] = await Promise.all([
        prisma.employee.findFirst({ where: { id: body.employeeId, companyId: existing.batch.companyId, unitId: unitScopeFilter(scope, existing.batch.unitId ?? undefined), isActive: true } }),
        prisma.frequencyType.findFirst({ where: { id: body.frequencyTypeId, companyId: existing.batch.companyId, isActive: true } }),
        prisma.dailyAttendance.findFirst({ where: { employeeId: body.employeeId, date: existing.date ?? undefined, deletedAt: null } })
      ]);
      if (!employee || !frequency) return reply.code(400).send({ message: "Funcionario ou tipo de frequencia invalido" });
      if (conflict) return reply.code(409).send({ message: "Ja existe apontamento no sistema", attendanceId: conflict.id });
      if (frequency.requiresDocument) return reply.code(409).send({ message: "O documento obrigatorio deve ser registrado pelo fluxo de atestados" });
      data = { employee: { connect: { id: employee.id } }, frequencyType: { connect: { id: frequency.id } }, status: ScheduleImportItemStatus.READY, issue: Prisma.JsonNull };
    }
    const updated = await prisma.$transaction(async (tx) => { const item = await tx.scheduleImportItem.update({ where: { id: existing.id }, data }); const remaining = await tx.scheduleImportItem.count({ where: { batchId: existing.batchId, status: { notIn: [ScheduleImportItemStatus.READY, ScheduleImportItemStatus.IGNORED] } } }); await tx.scheduleImportBatch.update({ where: { id: existing.batchId }, data: { status: remaining ? ScheduleImportStatus.REVIEW_REQUIRED : ScheduleImportStatus.READY } }); await writeAudit(tx, request, { companyId: existing.batch.companyId, unitId: existing.batch.unitId, action: "SCHEDULE_IMPORT_ITEM_RESOLVE", entityType: "ScheduleImportItem", entityId: existing.id, previousValue: existing, newValue: item }); return item; });
    return updated;
  });

  app.post("/hr/workforce/imports/:id/confirm", { preHandler: [app.authenticate, requireWorkScheduleEnabled, requireHrPermission(HrPermission.SCHEDULE_IMPORT)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);
    const batch = await prisma.scheduleImportBatch.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope) }, include: { items: { include: { frequencyType: true } } } });
    if (!batch) return reply.code(404).send({ message: "Importacao nao encontrada" });
    if (batch.status === ScheduleImportStatus.IMPORTED) return { idempotent: true, batchId: batch.id, importedAt: batch.importedAt };
    const unresolved = batch.items.filter((item) => item.status !== ScheduleImportItemStatus.READY && item.status !== ScheduleImportItemStatus.IGNORED);
    if (unresolved.length) return reply.code(409).send({ message: "Existem itens pendentes de resolucao", unresolved: unresolved.length });
    const closed = await prisma.schedulePeriod.findFirst({ where: { companyId: batch.companyId, competence: batch.competence, status: SchedulePeriodStatus.CLOSED, OR: [{ unitId: null }, ...(batch.unitId ? [{ unitId: batch.unitId }] : [])] } });
    if (closed) return reply.code(409).send({ message: "Competencia fechada para importacao" });
    const imported = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const item of batch.items.filter((candidate) => candidate.status === ScheduleImportItemStatus.READY)) {
        if (!item.employeeId || !item.date || !item.frequencyTypeId || !item.frequencyType) throw new Error("Item pronto possui dados incompletos");
        const existing = await tx.dailyAttendance.findFirst({ where: { employeeId: item.employeeId, date: item.date, deletedAt: null } });
        if (existing) throw new Error(`Conflito detectado durante confirmacao: ${item.sourceName} ${item.date.toISOString().slice(0, 10)}`);
        await tx.dailyAttendance.create({ data: { companyId: batch.companyId, unitId: batch.unitId, employeeId: item.employeeId, date: item.date, frequencyTypeId: item.frequencyTypeId, status: attendanceDefaultStatus(item.frequencyType), origin: ScheduleOrigin.IMPORT, importItemId: item.id, createdById: request.user.id } });
        await tx.scheduleImportItem.update({ where: { id: item.id }, data: { status: ScheduleImportItemStatus.IMPORTED } });
        count += 1;
      }
      const result = await tx.scheduleImportBatch.update({ where: { id: batch.id }, data: { status: ScheduleImportStatus.IMPORTED, importedAt: new Date(), summary: { ...(batch.summary && typeof batch.summary === "object" && !Array.isArray(batch.summary) ? batch.summary : {}), imported: count } } });
      await writeAudit(tx, request, { companyId: batch.companyId, unitId: batch.unitId, action: "SCHEDULE_IMPORT_CONFIRM", entityType: "ScheduleImportBatch", entityId: batch.id, previousValue: { status: batch.status }, newValue: { status: result.status, importedAt: result.importedAt }, metadata: { imported: count, contentHash: batch.contentHash } });
      return { batch: result, imported: count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    return reply.code(201).send({ idempotent: false, ...imported });
  });
}
