import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

type BrasilApiCompany = {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  email?: string;
  ddd_telefone_1?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
};

type CnpjWsCompany = {
  razao_social?: string;
  estabelecimento?: {
    nome_fantasia?: string;
    email?: string;
    telefone1?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    cidade?: { nome?: string };
    estado?: { sigla?: string };
    cep?: string;
  };
};

function mapBrasilApiToCompany(data: BrasilApiCompany, fallbackCnpj: string) {
  const addressParts = [data.logradouro, data.numero, data.bairro].filter(Boolean);
  return {
    legalName: data.razao_social ?? "",
    tradeName: data.nome_fantasia ?? "",
    cnpj: data.cnpj ?? fallbackCnpj,
    email: data.email ?? "",
    phone: data.ddd_telefone_1 ?? "",
    addressLine: addressParts.join(", "),
    city: data.municipio ?? "",
    state: data.uf ?? "",
    zipCode: data.cep ?? ""
  };
}

function mapCnpjWsToCompany(data: CnpjWsCompany, fallbackCnpj: string) {
  const est = data.estabelecimento;
  const addressParts = [est?.logradouro, est?.numero, est?.bairro].filter(Boolean);
  return {
    legalName: data.razao_social ?? "",
    tradeName: est?.nome_fantasia ?? "",
    cnpj: fallbackCnpj,
    email: est?.email ?? "",
    phone: est?.telefone1 ?? "",
    addressLine: addressParts.join(", "),
    city: est?.cidade?.nome ?? "",
    state: est?.estado?.sigla ?? "",
    zipCode: est?.cep ?? ""
  };
}

export async function companyRoutes(app: FastifyInstance) {
  app.get("/company", { preHandler: [app.authenticate] }, async () => {
    return prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  });

  app.put("/company", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        legalName: z.string().min(2),
        tradeName: z.string().optional().nullable(),
        cnpj: z.string().min(14),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        addressLine: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zipCode: z.string().optional().nullable()
      })
      .parse(request.body);

    const normalizedCnpj = onlyDigits(body.cnpj);
    const existing = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });

    if (existing) {
      return prisma.company.update({
        where: { id: existing.id },
        data: {
          legalName: body.legalName,
          tradeName: body.tradeName ?? null,
          cnpj: normalizedCnpj,
          email: body.email ?? null,
          phone: body.phone ?? null,
          addressLine: body.addressLine ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          zipCode: body.zipCode ?? null
        }
      });
    }

    return prisma.company.create({
      data: {
        legalName: body.legalName,
        tradeName: body.tradeName ?? null,
        cnpj: normalizedCnpj,
        email: body.email ?? null,
        phone: body.phone ?? null,
        addressLine: body.addressLine ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zipCode: body.zipCode ?? null
      }
    });
  });

  app.get("/company/cnpj/:cnpj", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ cnpj: z.string().min(14) }).parse(request.params);
    const cnpj = onlyDigits(params.cnpj);

    if (cnpj.length !== 14) {
      return reply.code(400).send({ message: "CNPJ invalido" });
    }

    try {
      // 1) Tenta BrasilAPI primeiro
      {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
          const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
            signal: controller.signal
          });
          if (response.ok) {
            const data = (await response.json()) as BrasilApiCompany;
            return mapBrasilApiToCompany(data, cnpj);
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      // 2) Fallback CNPJ.WS
      {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
          const response = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
            signal: controller.signal
          });
          if (response.ok) {
            const data = (await response.json()) as CnpjWsCompany;
            return mapCnpjWsToCompany(data, cnpj);
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      return reply.code(404).send({
        message: "Nao foi possivel consultar este CNPJ nas bases automaticas. Preencha manualmente."
      });
    } catch {
      return reply.code(502).send({ message: "Falha ao consultar CNPJ no servico externo" });
    }
  });
}
