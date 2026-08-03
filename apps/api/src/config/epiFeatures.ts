import { parseFeatureFlag } from "./hrFeatures.js";

export const epiFeatures = {
  get deliveryFormEnabled(): boolean {
    return parseFeatureFlag(process.env.EPI_DELIVERY_FORM_ENABLED);
  },
  get biometricSignatureEnabled(): boolean {
    return parseFeatureFlag(process.env.EPI_BIOMETRIC_SIGNATURE_ENABLED);
  }
};
