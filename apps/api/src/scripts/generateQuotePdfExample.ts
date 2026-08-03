import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createQuotePdf } from "../services/quotePdf.js";

const items = Array.from({ length: 54 }, (_, index) => {
  const quantity = index % 3 === 0 ? 12 : index % 3 === 1 ? 8 : 4;
  const unitPrice = index % 2 === 0 ? 189.9 : 245.5;
  const discount = index % 7 === 0 ? 25 : 0;
  return {
    code: `ARC-${String(index + 1).padStart(4, "0")}`,
    description: `${index % 2 === 0 ? "Tubo de concreto armado" : "Servico de apoio tecnico"} - especificacao de homologacao ${index + 1}`,
    unit: index % 2 === 0 ? "UN" : "HR",
    quantity: quantity.toFixed(4),
    unitPrice: unitPrice.toFixed(4),
    discount: discount.toFixed(2),
    total: (quantity * unitPrice - discount).toFixed(2)
  };
});
const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0);
const outputDirectory = path.resolve(process.cwd(), "..", "..", "output", "pdf");
await mkdir(outputDirectory, { recursive: true });
const pdf = await createQuotePdf({
  number: "ORC-2026-000123",
  issueDate: "2026-08-03T12:00:00.000Z",
  validityDate: "2026-08-18T12:00:00.000Z",
  generatedAt: "2026-08-03T18:45:00.000Z",
  generatedBy: "comercial@arcovan.com.br",
  company: { legalName: "Arcovan Solucoes de Concreto Ltda", tradeName: "Arcovan", cnpj: "00.000.000/0001-00", phone: "(00) 0000-0000", email: "contato@arcovan.com.br", addressLine: "Endereco cadastrado da empresa", city: "Cidade", state: "SP", zipCode: "00000-000" },
  unit: { name: "Matriz" },
  customer: { legalName: "Cliente Exemplo para Homologacao Ltda", tradeName: "Cliente Exemplo", document: "00.000.000/0001-99", addressLine: "Avenida do Cliente, 1000", city: "Cidade", state: "SP", zipCode: "00000-001", phone: "(00) 99999-9999", email: "compras@cliente.example", responsibleContact: "Contato de Compras" },
  commercialOwner: "Responsavel Comercial",
  paymentTerms: "28 dias apos faturamento",
  deliveryForecast: "15 dias uteis apos aprovacao",
  commercialNotes: "Proposta valida conforme condicoes apresentadas.",
  notes: "Documento demonstrativo gerado localmente. Nao contem dados de producao.",
  items,
  subtotal: subtotal.toFixed(2),
  discountTotal: "500.00",
  surchargeTotal: "125.00",
  total: (subtotal - 375).toFixed(2)
}, path.resolve(process.cwd(), "assets", "brand", "arcovan-logo.png"));
const output = path.join(outputDirectory, "espelho-pedido-exemplo.pdf");
await writeFile(output, pdf);
console.log(output);
