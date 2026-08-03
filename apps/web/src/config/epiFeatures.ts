import { apiRequest } from "../lib/api";

export type EpiFeatures = {
  deliveryFormEnabled: boolean;
  biometricSignatureEnabled: boolean;
};

export const epiFeaturesQuery = {
  queryKey: ["epi-features"] as const,
  queryFn: () => apiRequest<EpiFeatures>("/epi-features")
};
