import type { FastifyReply, FastifyRequest } from "fastify";
import { epiFeatures } from "../config/epiFeatures.js";

export const biometricSignatureDisabledResponse = {
  code: "EPI_BIOMETRIC_SIGNATURE_DISABLED",
  message: "Assinatura biométrica temporariamente indisponível"
} as const;

export async function requireBiometricSignatureEnabled(_request: FastifyRequest, reply: FastifyReply) {
  if (!epiFeatures.biometricSignatureEnabled) {
    return reply.code(503).send(biometricSignatureDisabledResponse);
  }
}
