import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("apps/web/Dockerfile", "utf8");
const nginx = readFileSync("apps/web/nginx.conf", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");

test("imagem web publica somente o build estático pelo Nginx", () => {
  assert.match(dockerfile, /RUN npm run build --workspace @smartcheck\/web/);
  assert.match(dockerfile, /FROM nginx:[^\s]+/);
  assert.match(dockerfile, /COPY --from=build \/app\/apps\/web\/dist \/usr\/share\/nginx\/html/);
  assert.doesNotMatch(dockerfile, /npm", "run", "dev"|vite preview/);
  assert.match(compose, /- "5175:80"/);
  assert.doesNotMatch(compose.slice(compose.indexOf("  web:")), /\.\/apps\/web:\/app\/apps\/web/);
});

test("Nginx preserva SPA, cacheia hashes e bloqueia código-fonte", () => {
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(nginx, /max-age=31536000, immutable/);
  assert.match(nginx, /@vite\|src/);
  assert.match(nginx, /package\(\?:-lock\)\?/);
  assert.match(nginx, /return 404/);
});

test("contexto Docker exclui segredos, mapas e artefatos internos", () => {
  assert.match(dockerignore, /\*\*\/\.env/);
  assert.match(dockerignore, /\*\*\/\*\.map/);
  assert.match(dockerignore, /\*\*\/coverage/);
});
