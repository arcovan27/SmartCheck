import assert from "node:assert/strict";
import test from "node:test";
import { HrPermission, UserRole } from "@prisma/client";
import { sanitizeAuditValue } from "./audit.js";
import { calculateCostVariation, snapshotEpiCost } from "./epiCosts.js";
import { roleHasDefaultPermission } from "./hrAccess.js";

test("perfil operacional nao recebe acesso ao RH por fallback", () => {
  assert.equal(roleHasDefaultPermission(UserRole.OPERADOR, HrPermission.HR_ACCESS), false);
  assert.equal(roleHasDefaultPermission(UserRole.ADMIN, HrPermission.DOCUMENT_VIEW), true);
});

test("almoxarifado gerencia EPI mas nao visualiza custos", () => {
  assert.equal(roleHasDefaultPermission(UserRole.ALMOXARIFADO, HrPermission.EPI_MANAGE), true);
  assert.equal(roleHasDefaultPermission(UserRole.ALMOXARIFADO, HrPermission.EPI_COST_VIEW), false);
});

test("permissoes granulares de escala nao sao concedidas implicitamente", () => {
  assert.equal(roleHasDefaultPermission(UserRole.SEGURANCA_DO_TRABALHO, HrPermission.SCHEDULE_VIEW), true);
  assert.equal(roleHasDefaultPermission(UserRole.SEGURANCA_DO_TRABALHO, HrPermission.SCHEDULE_PERIOD_REOPEN), false);
  assert.equal(roleHasDefaultPermission(UserRole.ALMOXARIFADO, HrPermission.SCHEDULE_IMPORT), false);
  assert.equal(roleHasDefaultPermission(UserRole.ADMIN, HrPermission.SCHEDULE_BULK_EDIT), true);
});

test("auditoria remove credenciais, caminhos e dados medicos", () => {
  const value = sanitizeAuditValue({ passwordHash: "secret", path: "private/file.pdf", cid: "A00", nested: { diagnosis: "restrito", safe: "mantido" } });
  assert.deepEqual(value, { nested: { safe: "mantido" } });
});

test("snapshot de custo permanece independente do cadastro", () => {
  let currentCatalogPrice = 29.9;
  const snapshot = snapshotEpiCost(currentCatalogPrice);
  currentCatalogPrice = 45;
  assert.equal(snapshot.unitCostSnapshot?.toNumber(), 29.9);
  assert.equal(currentCatalogPrice, 45);
  assert.equal(snapshot.isEstimatedCost, false);
});

test("variacao de custo nao divide por zero", () => {
  assert.equal(calculateCostVariation(120, 100), 20);
  assert.equal(calculateCostVariation(0, 0), 0);
  assert.equal(calculateCostVariation(100, 0), null);
});
