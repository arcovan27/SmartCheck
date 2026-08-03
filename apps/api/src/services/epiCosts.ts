import { EpiCostSource, Prisma } from "@prisma/client";

export function snapshotEpiCost(purchasePrice: Prisma.Decimal | number | string | null) {
  if (purchasePrice === null) return { unitCostSnapshot: null, costSource: null, isEstimatedCost: false };
  return {
    unitCostSnapshot: new Prisma.Decimal(purchasePrice),
    costSource: EpiCostSource.PRECO_CADASTRO,
    isEstimatedCost: false
  };
}

export function calculateCostVariation(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
