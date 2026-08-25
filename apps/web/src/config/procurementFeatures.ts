export const procurementFeatures = {
  purchasesEnabled: import.meta.env.VITE_PURCHASES_ENABLED === "true",
  purchaseApprovalsEnabled: import.meta.env.VITE_PURCHASE_APPROVALS_ENABLED === "true",
  goodsReceiptsEnabled: import.meta.env.VITE_GOODS_RECEIPTS_ENABLED === "true",
  fiscalDocumentsEnabled: import.meta.env.VITE_FISCAL_DOCUMENTS_ENABLED === "true",
  accountsPayableEnabled: import.meta.env.VITE_ACCOUNTS_PAYABLE_ENABLED === "true",
  paymentsEnabled: import.meta.env.VITE_PAYMENTS_ENABLED === "true"
} as const;

