import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entrypoint = readFileSync(new URL("../../docker-entrypoint.sh", import.meta.url), "utf8");
const compose = readFileSync(new URL("../../../../docker-compose.yml", import.meta.url), "utf8");

test("container nao executa migracoes ou seed por padrao", () => {
  assert.match(entrypoint, /RUN_MIGRATIONS_ON_START:-false/);
  assert.match(entrypoint, /RUN_SEED_ON_START:-false/);
  assert.match(compose, /RUN_MIGRATIONS_ON_START: "false"/);
  assert.match(compose, /RUN_SEED_ON_START: "false"/);
});
