import assert from "node:assert/strict";
import test from "node:test";
import { epiFeatures } from "../config/epiFeatures.js";
import { requireBiometricSignatureEnabled, biometricSignatureDisabledResponse } from "./epiFeatureGuards.js";

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
