import type { FastifyReply, FastifyRequest } from "fastify";
import { epiFeatures } from "../config/epiFeatures.js";

export const biometricSignatureDisabledResponse = {
  code: "EPI_BIOMETRIC_SIGNATURE_DISABLED",
  message: "Assinatura biométrica temporariamente indisponível"
} as const;

export const deliveryFormDisabledResponse = {
  code: "EPI_DELIVERY_FORM_DISABLED",
  message: "A entrega de EPI está temporariamente indisponível."
} as const;

export async function requireDeliveryFormEnabled(_request: FastifyRequest, reply: FastifyReply) {
  if (!epiFeatures.deliveryFormEnabled) {
    return reply.code(503).send(deliveryFormDisabledResponse);
  }
}

export async function requireBiometricSignatureEnabled(_request: FastifyRequest, reply: FastifyReply) {
  if (!epiFeatures.biometricSignatureEnabled) {
    return reply.code(503).send(biometricSignatureDisabledResponse);
  }
}
