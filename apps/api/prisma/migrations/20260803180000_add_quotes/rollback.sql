-- Rollback operacional da proposta. Nao executar sem backup e autorizacao.
DROP TABLE IF EXISTS "QuoteHistory";
DROP TABLE IF EXISTS "QuoteVersion";
DROP TABLE IF EXISTS "QuoteItem";
DROP TABLE IF EXISTS "Quote";
DROP TABLE IF EXISTS "QuoteSequence";
DROP TABLE IF EXISTS "CatalogItem";
DROP TABLE IF EXISTS "Customer";
DROP TYPE IF EXISTS "CatalogItemType";
DROP TYPE IF EXISTS "QuoteStatus";

-- PostgreSQL nao remove valores de enum com seguranca. Os valores QUOTE_* de
-- HrPermission permanecem inertes apos a remocao das tabelas e do codigo.
