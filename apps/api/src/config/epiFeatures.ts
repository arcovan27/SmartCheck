import { parseFeatureFlag } from "./hrFeatures.js";

export const epiFeatures = {
  get biometricSignatureEnabled(): boolean {
    return parseFeatureFlag(process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED);
  }
};
