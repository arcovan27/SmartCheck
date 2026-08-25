import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/UsersPage.tsx", import.meta.url), "utf8");

test("edição mantém o e-mail fora do payload e usa seletor pesquisável de funcionários ativos", () => {
  assert.match(source, /Editar usuário/);
  assert.match(source, /SearchableSelect/);
  assert.match(source, /employees\?isActive=true/);
  assert.match(source, /Pesquisar por nome ou matrícula/);
  assert.match(source, /O e-mail de login não será alterado/);
  assert.doesNotMatch(source, /data:\s*\{[^}]*email:/s);
});

test("listagem oferece editar ao lado da ativação e exibe nome e matrícula", () => {
  assert.match(source, />Editar</);
  assert.match(source, /user\.employee\.name.*user\.employee\.registration/);
  assert.match(source, /user\.isActive \? "Inativar" : "Ativar"/);
});
