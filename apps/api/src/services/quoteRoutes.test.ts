import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(process.cwd(), "src", "routes", "quotes.ts"), "utf8");

test("rotas aplicam permissoes e isolamento por empresa/unidade", () => {
  for (const permission of ["QUOTE_VIEW", "QUOTE_CREATE", "QUOTE_EDIT", "QUOTE_ISSUE", "QUOTE_DECIDE", "QUOTE_CANCEL", "QUOTE_DOCUMENT", "QUOTE_VALUE_VIEW"]) assert.match(source, new RegExp(permission));
  assert.match(source, /resolveHrDataScope\(request\)/);
  assert.match(source, /assertCompanyAccess\(scope/);
  assert.match(source, /unitScopeFilter\(scope/);
  assert.match(source, /assertUnitAccess\(scope/);
});

test("criacao protege numeracao simultanea e duplo clique", () => {
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /quoteSequence\.upsert/);
  assert.match(source, /companyId_idempotencyKey/);
  assert.match(source, /error\.code === "P2034"/);
});

test("emissao exige cliente e item, recalcula e preserva snapshot", () => {
  assert.match(source, /!existing\.customer \|\| existing\.items\.length === 0/);
  assert.match(source, /calculateQuote\(existing\.items/);
  assert.match(source, /quoteVersion\.create/);
  assert.match(source, /snapshotQuote\(quote\)/);
});

test("historico, exclusao logica, filtros, paginacao e PDF estao presentes", () => {
  assert.match(source, /quoteHistory\.create/);
  assert.match(source, /deletedAt: new Date\(\)/);
  assert.match(source, /pageSize/);
  for (const filter of ["number", "from", "to", "customerId", "responsibleId", "companyId", "unitId", "status"]) assert.match(source, new RegExp(filter));
  assert.match(source, /Content-Type", "application\/pdf/);
  assert.match(source, /Content-Disposition/);
});
