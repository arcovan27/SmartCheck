import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus } from "@prisma/client";
import { assertQuoteDates, assertQuoteTransition, calculateQuote, formatQuoteNumber } from "./quotes.js";

test("calcula itens, descontos, acrescimos e total sem ponto flutuante", () => {
  const result = calculateQuote([
    { code: "A", description: "Produto A", unit: "UN", quantity: "3", unitPrice: "10.115", discount: "0.34" },
    { code: "B", description: "Servico B", unit: "HR", quantity: "1.5", unitPrice: "20.00", discount: "0" }
  ], "2.00", "1.50");
  assert.equal(result.items[0].total.toFixed(2), "30.01");
  assert.equal(result.subtotal.toFixed(2), "60.01");
  assert.equal(result.total.toFixed(2), "59.51");
});

test("rejeita quantidades, valores e descontos invalidos", () => {
  assert.throws(() => calculateQuote([{ code: "A", description: "A", unit: "UN", quantity: 0, unitPrice: 1 }]), /quantidade/);
  assert.throws(() => calculateQuote([{ code: "A", description: "A", unit: "UN", quantity: 1, unitPrice: -1 }]), /unitario/);
  assert.throws(() => calculateQuote([{ code: "A", description: "A", unit: "UN", quantity: 1, unitPrice: 1, discount: 2 }]), /superar/);
});

test("valida datas, numeracao e transicoes", () => {
  assert.equal(formatQuoteNumber(2026, 42), "ORC-2026-000042");
  assert.doesNotThrow(() => assertQuoteDates(new Date("2026-08-03"), new Date("2026-08-03")));
  assert.throws(() => assertQuoteDates(new Date("2026-08-04"), new Date("2026-08-03")), /validade/);
  assert.doesNotThrow(() => assertQuoteTransition(QuoteStatus.RASCUNHO, QuoteStatus.EMITIDO));
  assert.throws(() => assertQuoteTransition(QuoteStatus.APROVADO, QuoteStatus.RASCUNHO), /nao permitida/);
});
