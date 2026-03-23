import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const AGENT_PORT = Number(process.env.AGENT_PORT ?? 4100);
const AGENT_HOST = process.env.AGENT_HOST ?? "127.0.0.1";
const ALLOWED_ORIGINS = (process.env.AGENT_ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function sendJson(res, status, payload, origin = "*") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(payload));
}

function getAllowedOrigin(originHeader) {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  if (!originHeader) return ALLOWED_ORIGINS[0] ?? "*";
  return ALLOWED_ORIGINS.includes(originHeader) ? originHeader : ALLOWED_ORIGINS[0] ?? "*";
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function makeExternalId(employeeId) {
  const suffix = employeeId.slice(-6).toUpperCase();
  return `BIO-${suffix}-${Date.now()}`;
}

async function callApi(path, body, token, apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : "Falha na API SmartCheck";
    throw new Error(message);
  }

  return data;
}

const server = createServer(async (req, res) => {
  const origin = getAllowedOrigin(req.headers.origin);

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {}, origin);
  }

  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { status: "ok", service: "smartcheck-agent-biometric" }, origin);
  }

  if (req.method === "POST" && req.url === "/enroll") {
    try {
      const body = await parseBody(req);
      const employeeId = String(body.employeeId ?? "");
      const provider = String(body.provider ?? "UAREU_4500");
      const token = String(body.token ?? "");
      const apiBaseUrl = String(body.apiBaseUrl ?? "").replace(/\/+$/, "");
      const biometricExternalId = String(body.biometricExternalId ?? makeExternalId(employeeId));
      const biometricTemplateId = body.biometricTemplateId ? String(body.biometricTemplateId) : randomUUID();

      if (!employeeId) return sendJson(res, 400, { message: "employeeId e obrigatorio" }, origin);
      if (!token) return sendJson(res, 400, { message: "token e obrigatorio" }, origin);
      if (!apiBaseUrl) return sendJson(res, 400, { message: "apiBaseUrl e obrigatorio" }, origin);

      await callApi(
        "/biometric/enroll/start",
        { employeeId, provider },
        token,
        apiBaseUrl
      );

      await callApi(
        "/biometric/enroll/finish",
        { employeeId, provider, biometricExternalId, biometricTemplateId },
        token,
        apiBaseUrl
      );

      return sendJson(
        res,
        200,
        {
          message: "Biometria cadastrada no SmartCheck.",
          employeeId,
          biometricExternalId,
          biometricTemplateId
        },
        origin
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado no agente";
      return sendJson(res, 500, { message }, origin);
    }
  }

  if (req.method === "POST" && req.url === "/identify") {
    try {
      const body = await parseBody(req);
      const token = String(body.token ?? "");
      const apiBaseUrl = String(body.apiBaseUrl ?? "").replace(/\/+$/, "");
      const biometricExternalId = body.biometricExternalId ? String(body.biometricExternalId) : undefined;
      const biometricTemplateId = body.biometricTemplateId ? String(body.biometricTemplateId) : undefined;

      if (!token) return sendJson(res, 400, { message: "token e obrigatorio" }, origin);
      if (!apiBaseUrl) return sendJson(res, 400, { message: "apiBaseUrl e obrigatorio" }, origin);
      if (!biometricExternalId && !biometricTemplateId) {
        return sendJson(res, 400, { message: "biometricExternalId ou biometricTemplateId e obrigatorio" }, origin);
      }

      const result = await callApi(
        "/biometric/identify",
        { biometricExternalId, biometricTemplateId },
        token,
        apiBaseUrl
      );

      return sendJson(res, 200, result, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado no agente";
      return sendJson(res, 500, { message }, origin);
    }
  }

  return sendJson(res, 404, { message: "Rota nao encontrada no agente biometrico" }, origin);
});

server.listen(AGENT_PORT, AGENT_HOST, () => {
  console.log(`[smartcheck-agent] rodando em http://${AGENT_HOST}:${AGENT_PORT}`);
});
