import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createQuotePdf } from "./quotePdf.js";

test("gera Espelho do Pedido A4 multipagina com logo, tabela repetida e paginas numeradas", async () => {
  const items = Array.from({ length: 80 }, (_, index) => ({
    code: `P-${String(index + 1).padStart(3, "0")}`,
    description: `Item de concreto para validacao de quebra de pagina ${index + 1}`,
    unit: "UN",
    quantity: "2.0000",
    unitPrice: "125.50",
    discount: "1.00",
    total: "250.00"
  }));
  const pdf = await createQuotePdf({
    number: "ORC-2026-000001",
    issueDate: "2026-08-03T12:00:00.000Z",
    validityDate: "2026-08-18T12:00:00.000Z",
    generatedAt: "2026-08-03T15:30:00.000Z",
    generatedBy: "admin@smartcheck.local",
    company: { legalName: "Arcovan Solucoes de Concreto Ltda", tradeName: "Arcovan", cnpj: "00.000.000/0001-00", phone: "(00) 0000-0000", email: "contato@arcovan.com.br", addressLine: "Endereco cadastrado", city: "Cidade", state: "SP" },
    unit: { name: "Matriz" },
    customer: { legalName: "Cliente de Homologacao Ltda", document: "00.000.000/0001-99", addressLine: "Rua do Cliente, 100", city: "Cidade", state: "SP", phone: "(00) 99999-9999", email: "cliente@example.com", responsibleContact: "Contato" },
    commercialOwner: "Responsavel Comercial",
    paymentTerms: "28 dias",
    deliveryForecast: "15 dias uteis",
    commercialNotes: "Validade sujeita as condicoes descritas.",
    notes: "Exemplo local sem dados de producao.",
    items,
    subtotal: "20000.00",
    discountTotal: "500.00",
    surchargeTotal: "0.00",
    total: "19500.00"
  }, path.resolve(process.cwd(), "assets", "brand", "arcovan-logo.png"));
  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.7");
  assert.match(pdf.toString("latin1"), /\/MediaBox \[0 0 595 842\]/);
  assert.match(pdf.toString("latin1"), /\/SMask/);
  const pageCount = Number(pdf.toString("latin1").match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/)?.[1]);
  assert.ok(pageCount >= 3, `esperava PDF multipagina, recebeu ${pageCount}`);
});
