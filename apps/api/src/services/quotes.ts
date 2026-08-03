import { Prisma, QuoteStatus } from "@prisma/client";

export type QuoteItemInput = {
  catalogItemId?: string | null;
  code: string;
  description: string;
  unit: string;
  quantity: string | number | Prisma.Decimal;
  unitPrice: string | number | Prisma.Decimal;
  discount?: string | number | Prisma.Decimal;
};

export type CalculatedQuoteItem = QuoteItemInput & {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

export function money(value: string | number | Prisma.Decimal | undefined): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value ?? 0);
  if (!decimal.isFinite()) throw new Error("Valor monetario invalido");
  return decimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateQuote(
  items: QuoteItemInput[],
  discountTotal: string | number | Prisma.Decimal = 0,
  surchargeTotal: string | number | Prisma.Decimal = 0
) {
  const calculatedItems: CalculatedQuoteItem[] = items.map((item) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    const discount = money(item.discount);
    if (!quantity.isFinite() || quantity.lte(0)) throw new Error("A quantidade deve ser maior que zero");
    if (!unitPrice.isFinite() || unitPrice.lt(0)) throw new Error("O valor unitario nao pode ser negativo");
    if (discount.lt(0)) throw new Error("O desconto do item nao pode ser negativo");
    const gross = quantity.mul(unitPrice);
    if (discount.gt(gross)) throw new Error("O desconto do item nao pode superar o valor bruto");
    return { ...item, quantity, unitPrice, discount, total: money(gross.minus(discount)) };
  });
  const subtotal = calculatedItems.reduce((sum, item) => sum.plus(item.total), ZERO).toDecimalPlaces(2);
  const quoteDiscount = money(discountTotal);
  const surcharge = money(surchargeTotal);
  if (quoteDiscount.lt(0) || surcharge.lt(0)) throw new Error("Descontos e acrescimos nao podem ser negativos");
  if (quoteDiscount.gt(subtotal.plus(surcharge))) throw new Error("O desconto geral nao pode superar o valor do orcamento");
  const total = money(subtotal.minus(quoteDiscount).plus(surcharge));
  return { items: calculatedItems, subtotal, discountTotal: quoteDiscount, surchargeTotal: surcharge, total };
}

const transitions: Record<QuoteStatus, ReadonlySet<QuoteStatus>> = {
  RASCUNHO: new Set([QuoteStatus.EMITIDO, QuoteStatus.CANCELADO]),
  EMITIDO: new Set([QuoteStatus.APROVADO, QuoteStatus.REJEITADO, QuoteStatus.CANCELADO, QuoteStatus.VENCIDO]),
  APROVADO: new Set(),
  REJEITADO: new Set(),
  VENCIDO: new Set([QuoteStatus.CANCELADO]),
  CANCELADO: new Set()
};

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!transitions[from].has(to)) throw new Error(`Transicao de ${from} para ${to} nao permitida`);
}

export function formatQuoteNumber(year: number, sequence: number): string {
  return `ORC-${year}-${String(sequence).padStart(6, "0")}`;
}

export function assertQuoteDates(issueDate: Date, validityDate: Date): void {
  if (validityDate < issueDate) throw new Error("A validade deve ser igual ou posterior a emissao");
}

export function serializeFinancialChange(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Prisma.Decimal ? item.toFixed(2) : item)) as Prisma.InputJsonValue;
}
