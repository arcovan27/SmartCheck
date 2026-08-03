import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HrPermission, Prisma, QuoteStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { writeAudit } from "../services/audit.js";
import { assertCompanyAccess, assertUnitAccess, hasHrPermission, requireHrPermission, resolveHrDataScope, unitScopeFilter } from "../services/hrAccess.js";
import { createQuotePdf, type QuotePdfData } from "../services/quotePdf.js";
import { assertQuoteDates, assertQuoteTransition, calculateQuote, formatQuoteNumber, serializeFinancialChange } from "../services/quotes.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const itemSchema = z.object({
  catalogItemId: z.string().cuid().optional().nullable(),
  code: z.string().trim().min(1).max(60),
  description: z.string().trim().min(2).max(1000),
  unit: z.string().trim().min(1).max(20),
  quantity: z.union([z.string(), z.number()]),
  unitPrice: z.union([z.string(), z.number()]),
  discount: z.union([z.string(), z.number()]).optional().default("0")
});

const quoteBodySchema = z.object({
  companyId: z.string().cuid(),
  unitId: z.string().cuid().optional().nullable(),
  customerId: z.string().cuid().optional().nullable(),
  issueDate: z.string().regex(datePattern),
  validityDate: z.string().regex(datePattern),
  commercialOwnerId: z.string().cuid().optional().nullable(),
  paymentTerms: z.string().trim().max(500).optional().nullable(),
  deliveryForecast: z.string().trim().max(500).optional().nullable(),
  commercialNotes: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  discountTotal: z.union([z.string(), z.number()]).optional().default("0"),
  surchargeTotal: z.union([z.string(), z.number()]).optional().default("0"),
  items: z.array(itemSchema).max(500).default([]),
  idempotencyKey: z.string().trim().min(8).max(100).optional()
});

const quoteInclude = {
  company: true,
  unit: true,
  customer: true,
  commercialOwner: { select: { id: true, email: true, employee: { select: { name: true } } } },
  createdBy: { select: { id: true, email: true, employee: { select: { name: true } } } },
  updatedBy: { select: { id: true, email: true, employee: { select: { name: true } } } },
  items: { orderBy: { position: "asc" as const } }
} as const;

function dateOnly(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function quoteStatusForDisplay(status: QuoteStatus, validityDate: Date): QuoteStatus {
  const currentDate = dateOnly(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  return status === QuoteStatus.EMITIDO && validityDate < currentDate ? QuoteStatus.VENCIDO : status;
}

function quoteJson(value: unknown): Prisma.InputJsonValue {
  return serializeFinancialChange(value);
}

async function recordHistory(tx: Prisma.TransactionClient, request: FastifyRequest, quote: { id: string; companyId: string; unitId: string | null }, action: string, previousValue?: unknown, newValue?: unknown) {
  await Promise.all([
    tx.quoteHistory.create({ data: { companyId: quote.companyId, unitId: quote.unitId, quoteId: quote.id, actorUserId: request.user.id, action, previousValue: previousValue === undefined ? undefined : quoteJson(previousValue), newValue: newValue === undefined ? undefined : quoteJson(newValue) } }),
    writeAudit(tx, request, { companyId: quote.companyId, unitId: quote.unitId, action, entityType: "Quote", entityId: quote.id, previousValue, newValue })
  ]);
}

async function assertReferences(companyId: string, unitId: string | null | undefined, customerId: string | null | undefined, commercialOwnerId: string | null | undefined, catalogItemIds: string[]) {
  const [unit, customer, owner, catalogCount] = await Promise.all([
    unitId ? prisma.unit.findFirst({ where: { id: unitId, companyId, isActive: true }, select: { id: true } }) : Promise.resolve({ id: "none" }),
    customerId ? prisma.customer.findFirst({ where: { id: customerId, companyId, isActive: true }, select: { id: true } }) : Promise.resolve({ id: "none" }),
    commercialOwnerId ? prisma.user.findFirst({ where: { id: commercialOwnerId, isActive: true, OR: [{ companyAccess: { some: { companyId } } }, { employee: { companyId } }] }, select: { id: true } }) : Promise.resolve({ id: "none" }),
    catalogItemIds.length ? prisma.catalogItem.count({ where: { id: { in: catalogItemIds }, companyId, isActive: true } }) : Promise.resolve(0)
  ]);
  if (unitId && !unit) throw new Error("Unidade invalida");
  if (customerId && !customer) throw new Error("Cliente invalido");
  if (commercialOwnerId && !owner) throw new Error("Responsavel comercial invalido");
  if (catalogCount !== new Set(catalogItemIds).size) throw new Error("Um ou mais produtos ou servicos sao invalidos");
}

async function nextQuoteIdentity(tx: Prisma.TransactionClient, companyId: string, issueDate: Date) {
  const year = issueDate.getUTCFullYear();
  const sequence = await tx.quoteSequence.upsert({
    where: { companyId_year: { companyId, year } },
    create: { companyId, year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true }
  });
  return { sequenceYear: year, sequenceNumber: sequence.lastValue, number: formatQuoteNumber(year, sequence.lastValue) };
}

function snapshotQuote(quote: any) {
  return quoteJson({
    number: quote.number,
    issueDate: quote.issueDate,
    validityDate: quote.validityDate,
    paymentTerms: quote.paymentTerms,
    deliveryForecast: quote.deliveryForecast,
    commercialNotes: quote.commercialNotes,
    notes: quote.notes,
    subtotal: quote.subtotal,
    discountTotal: quote.discountTotal,
    surchargeTotal: quote.surchargeTotal,
    total: quote.total,
    company: quote.company,
    unit: quote.unit,
    customer: quote.customer,
    commercialOwner: quote.commercialOwner,
    createdBy: quote.createdBy,
    items: quote.items
  });
}

async function createDraft(request: FastifyRequest, body: z.infer<typeof quoteBodySchema>, sourceQuoteId?: string) {
  const scope = await resolveHrDataScope(request);
  assertCompanyAccess(scope, body.companyId);
  assertUnitAccess(scope, body.unitId);
  const issueDate = dateOnly(body.issueDate);
  const validityDate = dateOnly(body.validityDate);
  assertQuoteDates(issueDate, validityDate);
  const catalogIds = body.items.flatMap((item) => item.catalogItemId ? [item.catalogItemId] : []);
  await assertReferences(body.companyId, body.unitId, body.customerId, body.commercialOwnerId, catalogIds);
  const totals = calculateQuote(body.items, body.discountTotal, body.surchargeTotal);
  const idempotencyKey = body.idempotencyKey ?? (request.headers["idempotency-key"] as string | undefined);
  if (idempotencyKey) {
    const existing = await prisma.quote.findUnique({ where: { companyId_idempotencyKey: { companyId: body.companyId, idempotencyKey } }, include: quoteInclude });
    if (existing) return existing;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const identity = await nextQuoteIdentity(tx, body.companyId, issueDate);
        const created = await tx.quote.create({
          data: {
            ...identity,
            companyId: body.companyId,
            unitId: body.unitId,
            customerId: body.customerId,
            issueDate,
            validityDate,
            commercialOwnerId: body.commercialOwnerId,
            paymentTerms: body.paymentTerms,
            deliveryForecast: body.deliveryForecast,
            commercialNotes: body.commercialNotes,
            notes: body.notes,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            surchargeTotal: totals.surchargeTotal,
            total: totals.total,
            createdById: request.user.id,
            idempotencyKey,
            items: { create: totals.items.map((item, position) => ({ catalogItemId: item.catalogItemId, position: position + 1, code: item.code, description: item.description, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount, total: item.total })) }
          },
          include: quoteInclude
        });
        await recordHistory(tx, request, created, sourceQuoteId ? "QUOTE_DUPLICATE" : "QUOTE_CREATE", undefined, { number: created.number, total: created.total, sourceQuoteId });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && idempotencyKey) {
        const existing = await prisma.quote.findUnique({ where: { companyId_idempotencyKey: { companyId: body.companyId, idempotencyKey } }, include: quoteInclude });
        if (existing) return existing;
      }
      throw error;
    }
  }
  throw new Error("Nao foi possivel reservar a numeracao do orcamento");
}

export async function quoteRoutes(app: FastifyInstance) {
  app.post("/quote-customers", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_CREATE)] }, async (request, reply) => {
    const body = z.object({ companyId: z.string().cuid(), legalName: z.string().trim().min(2).max(300), tradeName: z.string().trim().max(300).optional().nullable(), document: z.string().trim().max(30).optional().nullable(), addressLine: z.string().trim().max(500).optional().nullable(), city: z.string().trim().max(120).optional().nullable(), state: z.string().trim().max(2).optional().nullable(), zipCode: z.string().trim().max(20).optional().nullable(), phone: z.string().trim().max(40).optional().nullable(), email: z.string().email().optional().nullable(), responsibleContact: z.string().trim().max(200).optional().nullable() }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    assertCompanyAccess(scope, body.companyId);
    const customer = await prisma.customer.create({ data: { ...body, document: body.document?.replace(/\D/g, "") || null } });
    await writeAudit(prisma, request, { companyId: body.companyId, action: "CUSTOMER_CREATE", entityType: "Customer", entityId: customer.id, newValue: customer });
    return reply.code(201).send(customer);
  });

  app.get("/quotes/options", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_VIEW)] }, async (request) => {
    const scope = await resolveHrDataScope(request);
    const [companies, units, customers, catalogItems, users] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: scope.companyIds } }, orderBy: { legalName: "asc" } }),
      prisma.unit.findMany({ where: { companyId: { in: scope.companyIds }, id: scope.allUnitsInCompanies ? undefined : { in: scope.unitIds }, isActive: true }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true }, orderBy: { legalName: "asc" } }),
      prisma.catalogItem.findMany({ where: { companyId: { in: scope.companyIds }, isActive: true }, orderBy: { description: "asc" } }),
      prisma.user.findMany({ where: { isActive: true, OR: [{ companyAccess: { some: { companyId: { in: scope.companyIds } } } }, { employee: { companyId: { in: scope.companyIds } } }] }, select: { id: true, email: true, employee: { select: { name: true } } }, orderBy: { email: "asc" } })
    ]);
    return { companies, units, customers, catalogItems, users };
  });

  app.get("/quotes", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_VIEW)] }, async (request) => {
    const query = z.object({ number: z.string().optional(), from: z.string().regex(datePattern).optional(), to: z.string().regex(datePattern).optional(), customerId: z.string().cuid().optional(), responsibleId: z.string().cuid().optional(), companyId: z.string().cuid().optional(), unitId: z.string().cuid().optional(), status: z.nativeEnum(QuoteStatus).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    const scope = await resolveHrDataScope(request);
    if (query.companyId) assertCompanyAccess(scope, query.companyId);
    if (query.unitId) assertUnitAccess(scope, query.unitId);
    const currentDate = dateOnly(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    const expiredFilter = query.status === QuoteStatus.VENCIDO ? { status: QuoteStatus.EMITIDO, validityDate: { lt: currentDate } } : {};
    const where: Prisma.QuoteWhereInput = {
      companyId: query.companyId ?? { in: scope.companyIds },
      unitId: unitScopeFilter(scope, query.unitId),
      deletedAt: null,
      number: query.number ? { contains: query.number, mode: "insensitive" } : undefined,
      issueDate: query.from || query.to ? { gte: query.from ? dateOnly(query.from) : undefined, lte: query.to ? dateOnly(query.to) : undefined } : undefined,
      customerId: query.customerId,
      OR: query.responsibleId ? [{ createdById: query.responsibleId }, { commercialOwnerId: query.responsibleId }] : undefined,
      ...(query.status && query.status !== QuoteStatus.VENCIDO ? { status: query.status } : expiredFilter)
    };
    const canViewValues = await hasHrPermission(request.user.role, HrPermission.QUOTE_VALUE_VIEW);
    const [items, total, aggregate, statusGroups] = await prisma.$transaction([
      prisma.quote.findMany({ where, include: { customer: { select: { legalName: true, tradeName: true } }, commercialOwner: { select: { email: true, employee: { select: { name: true } } } }, createdBy: { select: { email: true, employee: { select: { name: true } } } }, company: { select: { legalName: true, tradeName: true } }, unit: { select: { name: true } } }, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.quote.count({ where }),
      prisma.quote.aggregate({ where, _sum: { total: true } }),
      prisma.quote.groupBy({ by: ["status"], where, orderBy: { status: "asc" }, _count: { _all: true }, _sum: { total: true } })
    ]);
    const expired = query.status && query.status !== QuoteStatus.EMITIDO && query.status !== QuoteStatus.VENCIDO
      ? 0
      : await prisma.quote.count({ where: { ...where, status: QuoteStatus.EMITIDO, validityDate: { lt: currentDate } } });
    const groups = statusGroups as unknown as Array<{ status: QuoteStatus; _count: { _all: number }; _sum: { total: Prisma.Decimal | null } }>;
    const count = (status: QuoteStatus) => groups.find((group) => group.status === status)?._count._all ?? 0;
    const approvedValue = groups.find((group) => group.status === QuoteStatus.APROVADO)?._sum.total ?? null;
    return {
      items: items.map((item) => ({ ...item, status: quoteStatusForDisplay(item.status, item.validityDate), total: canViewValues ? item.total : null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary: { total, open: count(QuoteStatus.RASCUNHO) + count(QuoteStatus.EMITIDO) - expired, approved: count(QuoteStatus.APROVADO), rejected: count(QuoteStatus.REJEITADO), expired, quotedValue: canViewValues ? aggregate._sum.total : null, approvedValue: canViewValues ? approvedValue : null }
    };
  });

  app.get("/quotes/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_VIEW)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);
    const quote = await prisma.quote.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope), deletedAt: null }, include: { ...quoteInclude, history: { include: { actorUser: { select: { email: true } } }, orderBy: { createdAt: "desc" } }, versions: { select: { version: true, createdAt: true }, orderBy: { version: "desc" } } } });
    if (!quote) return reply.code(404).send({ message: "Orcamento nao encontrado" });
    return { ...quote, status: quoteStatusForDisplay(quote.status, quote.validityDate) };
  });

  app.post("/quotes", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_CREATE)] }, async (request, reply) => reply.code(201).send(await createDraft(request, quoteBodySchema.parse(request.body))));

  app.put("/quotes/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_EDIT)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = quoteBodySchema.omit({ idempotencyKey: true }).parse(request.body);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.quote.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope), deletedAt: null }, include: quoteInclude });
    if (!existing) return reply.code(404).send({ message: "Orcamento nao encontrado" });
    if (existing.status !== QuoteStatus.RASCUNHO) return reply.code(409).send({ message: "Somente rascunhos podem ser editados; duplique o orcamento para criar uma nova versao comercial" });
    assertCompanyAccess(scope, body.companyId);
    assertUnitAccess(scope, body.unitId);
    if (body.companyId !== existing.companyId) return reply.code(409).send({ message: "A empresa do orcamento nao pode ser alterada" });
    const issueDate = dateOnly(body.issueDate);
    const validityDate = dateOnly(body.validityDate);
    assertQuoteDates(issueDate, validityDate);
    const catalogIds = body.items.flatMap((item) => item.catalogItemId ? [item.catalogItemId] : []);
    await assertReferences(body.companyId, body.unitId, body.customerId, body.commercialOwnerId, catalogIds);
    const totals = calculateQuote(body.items, body.discountTotal, body.surchargeTotal);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.quoteItem.deleteMany({ where: { quoteId: existing.id } });
      const quote = await tx.quote.update({ where: { id: existing.id }, data: { unitId: body.unitId, customerId: body.customerId, issueDate, validityDate, commercialOwnerId: body.commercialOwnerId, paymentTerms: body.paymentTerms, deliveryForecast: body.deliveryForecast, commercialNotes: body.commercialNotes, notes: body.notes, subtotal: totals.subtotal, discountTotal: totals.discountTotal, surchargeTotal: totals.surchargeTotal, total: totals.total, updatedById: request.user.id, items: { create: totals.items.map((item, position) => ({ catalogItemId: item.catalogItemId, position: position + 1, code: item.code, description: item.description, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount, total: item.total })) } }, include: quoteInclude });
      await recordHistory(tx, request, quote, "QUOTE_UPDATE", { total: existing.total, items: existing.items }, { total: quote.total, items: quote.items });
      return quote;
    });
    return updated;
  });

  app.post("/quotes/:id/duplicate", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_CREATE)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.quote.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope), deletedAt: null }, include: quoteInclude });
    if (!existing) return reply.code(404).send({ message: "Orcamento nao encontrado" });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const validity = new Date(Date.now() + 15 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const duplicate = await createDraft(request, { companyId: existing.companyId, unitId: existing.unitId, customerId: existing.customerId, issueDate: today, validityDate: validity, commercialOwnerId: existing.commercialOwnerId, paymentTerms: existing.paymentTerms, deliveryForecast: existing.deliveryForecast, commercialNotes: existing.commercialNotes, notes: existing.notes, discountTotal: existing.discountTotal.toString(), surchargeTotal: existing.surchargeTotal.toString(), items: existing.items.map((item) => ({ catalogItemId: item.catalogItemId, code: item.code, description: item.description, unit: item.unit, quantity: item.quantity.toString(), unitPrice: item.unitPrice.toString(), discount: item.discount.toString() })), idempotencyKey: request.headers["idempotency-key"] as string | undefined }, existing.id);
    return reply.code(201).send(duplicate);
  });

  async function changeStatus(request: FastifyRequest, reply: any, target: QuoteStatus, permission: HrPermission) {
    if (!(await hasHrPermission(request.user.role, permission))) return reply.code(403).send({ message: "Permissao insuficiente para esta operacao" });
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.quote.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope), deletedAt: null }, include: quoteInclude });
    if (!existing) return reply.code(404).send({ message: "Orcamento nao encontrado" });
    const effectiveStatus = quoteStatusForDisplay(existing.status, existing.validityDate);
    assertQuoteTransition(effectiveStatus, target);
    if (target === QuoteStatus.EMITIDO && (!existing.customer || existing.items.length === 0)) return reply.code(422).send({ message: "Informe o cliente e pelo menos um item valido antes de emitir" });
    const totals = calculateQuote(existing.items.map((item) => ({ ...item, quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount })), existing.discountTotal, existing.surchargeTotal);
    const updated = await prisma.$transaction(async (tx) => {
      const nextVersion = target === QuoteStatus.EMITIDO ? existing.currentVersion + 1 : existing.currentVersion;
      const quote = await tx.quote.update({ where: { id: existing.id }, data: { status: target, subtotal: totals.subtotal, total: totals.total, updatedById: request.user.id, currentVersion: nextVersion }, include: quoteInclude });
      if (target === QuoteStatus.EMITIDO) await tx.quoteVersion.create({ data: { quoteId: quote.id, version: nextVersion, snapshot: snapshotQuote(quote) } });
      await recordHistory(tx, request, quote, `QUOTE_${target}`, { status: effectiveStatus, total: existing.total }, { status: target, total: quote.total, version: nextVersion });
      return quote;
    });
    return reply.send(updated);
  }

  app.post("/quotes/:id/issue", { preHandler: [app.authenticate] }, (request, reply) => changeStatus(request, reply, QuoteStatus.EMITIDO, HrPermission.QUOTE_ISSUE));
  app.post("/quotes/:id/approve", { preHandler: [app.authenticate] }, (request, reply) => changeStatus(request, reply, QuoteStatus.APROVADO, HrPermission.QUOTE_DECIDE));
  app.post("/quotes/:id/reject", { preHandler: [app.authenticate] }, (request, reply) => changeStatus(request, reply, QuoteStatus.REJEITADO, HrPermission.QUOTE_DECIDE));
  app.post("/quotes/:id/cancel", { preHandler: [app.authenticate] }, (request, reply) => changeStatus(request, reply, QuoteStatus.CANCELADO, HrPermission.QUOTE_CANCEL));

  app.delete("/quotes/:id", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_EDIT)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const scope = await resolveHrDataScope(request);
    const existing = await prisma.quote.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope), deletedAt: null }, select: { id: true, companyId: true, unitId: true, status: true } });
    if (!existing) return reply.code(404).send({ message: "Orcamento nao encontrado" });
    if (existing.status !== QuoteStatus.RASCUNHO) return reply.code(409).send({ message: "Orcamentos emitidos, decididos ou cancelados nao podem ser excluidos" });
    await prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: existing.id }, data: { deletedAt: new Date(), updatedById: request.user.id } });
      await recordHistory(tx, request, existing, "QUOTE_DELETE", { deletedAt: null }, { deletedAt: true });
    });
    return reply.code(204).send();
  });

  app.get("/quotes/:id/pdf", { preHandler: [app.authenticate, requireHrPermission(HrPermission.QUOTE_DOCUMENT)] }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).parse(request.params);
    const query = z.object({ disposition: z.enum(["inline", "attachment"]).default("inline") }).parse(request.query);
    const scope = await resolveHrDataScope(request);
    const quote = await prisma.quote.findFirst({ where: { id: params.id, companyId: { in: scope.companyIds }, unitId: unitScopeFilter(scope), deletedAt: null }, include: { ...quoteInclude, versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!quote) return reply.code(404).send({ message: "Orcamento nao encontrado" });
    if (quote.status === QuoteStatus.RASCUNHO || !quote.versions[0]) return reply.code(409).send({ message: "O Espelho do Pedido fica disponivel apos a emissao" });
    const snapshot = quote.versions[0].snapshot as any;
    const generatedAt = new Date();
    const pdfData: QuotePdfData = { ...snapshot, generatedAt, generatedBy: request.user.email, commercialOwner: snapshot.commercialOwner?.employee?.name ?? snapshot.commercialOwner?.email ?? null, items: snapshot.items.map((item: any) => ({ ...item, quantity: String(item.quantity), unitPrice: String(item.unitPrice), discount: String(item.discount), total: String(item.total) })), subtotal: String(snapshot.subtotal), discountTotal: String(snapshot.discountTotal), surchargeTotal: String(snapshot.surchargeTotal), total: String(snapshot.total) };
    const pdf = await createQuotePdf(pdfData, path.resolve(process.cwd(), "assets", "brand", "arcovan-logo.png"));
    await prisma.$transaction(async (tx) => recordHistory(tx, request, quote, "QUOTE_DOCUMENT_GENERATE", undefined, { version: quote.versions[0].version, disposition: query.disposition }));
    return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `${query.disposition}; filename=\"espelho-${quote.number}.pdf\"`).header("Cache-Control", "private, no-store").send(pdf);
  });
}
