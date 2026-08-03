import assert from "node:assert/strict";
import test from "node:test";
import { epiFeatures } from "../config/epiFeatures.js";
import { biometricSignatureDisabledResponse, deliveryFormDisabledResponse, requireBiometricSignatureEnabled, requireDeliveryFormEnabled } from "./epiFeatureGuards.js";

test("assinatura biométrica permanece desabilitada por padrão", () => {
  const previous = process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED;
  try {
    delete process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED;
    assert.equal(epiFeatures.biometricSignatureEnabled, false);
    process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED = "true";
    assert.equal(epiFeatures.biometricSignatureEnabled, true);
  } finally {
    if (previous === undefined) delete process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED;
    else process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED = previous;
  }
});

test("middleware impede comunicação biométrica quando a flag está desabilitada", async () => {
  const previous = process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED;
  delete process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED;
  let statusCode = 0;
  let payload: unknown;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    },
    send(body: unknown) {
      payload = body;
      return this;
    }
  };

  try {
    await requireBiometricSignatureEnabled({} as never, reply as never);
    assert.equal(statusCode, 503);
    assert.deepEqual(payload, biometricSignatureDisabledResponse);
  } finally {
    if (previous === undefined) delete process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED;
    else process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED = previous;
  }
});

test("Ficha de entrega permanece desabilitada por padrão e exige true explícito", () => {
  const previous = process.env.EPI_DELIVERY_FORM_ENABLED;
  try {
    delete process.env.EPI_DELIVERY_FORM_ENABLED;
    assert.equal(epiFeatures.deliveryFormEnabled, false);
    process.env.EPI_DELIVERY_FORM_ENABLED = "true";
    assert.equal(epiFeatures.deliveryFormEnabled, true);
  } finally {
    if (previous === undefined) delete process.env.EPI_DELIVERY_FORM_ENABLED;
    else process.env.EPI_DELIVERY_FORM_ENABLED = previous;
  }
});

test("middleware bloqueia novas fichas com resposta controlada", async () => {
  const previous = process.env.EPI_DELIVERY_FORM_ENABLED;
  delete process.env.EPI_DELIVERY_FORM_ENABLED;
  let statusCode = 0;
  let payload: unknown;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    },
    send(body: unknown) {
      payload = body;
      return this;
    }
  };

  try {
    await requireDeliveryFormEnabled({} as never, reply as never);
    assert.equal(statusCode, 503);
    assert.deepEqual(payload, deliveryFormDisabledResponse);
    assert.equal(deliveryFormDisabledResponse.message, "A entrega de EPI está temporariamente indisponível.");
  } finally {
    if (previous === undefined) delete process.env.EPI_DELIVERY_FORM_ENABLED;
    else process.env.EPI_DELIVERY_FORM_ENABLED = previous;
  }
});
