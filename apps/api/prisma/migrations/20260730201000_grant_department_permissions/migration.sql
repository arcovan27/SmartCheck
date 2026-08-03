-- Executada separadamente da ampliacao do enum para respeitar o ciclo transacional do PostgreSQL.
-- Mantem compatibilidade: perfis que ja administravam catalogos recebem as novas permissoes.
-- Nao executar em producao sem homologacao, backup e autorizacao expressa.

INSERT INTO "RolePermission" ("role", "permission")
SELECT existing_permission."role", grant_permission::"HrPermission"
FROM "RolePermission" existing_permission
CROSS JOIN unnest(ARRAY['DEPARTMENT_VIEW', 'DEPARTMENT_CREATE', 'DEPARTMENT_EDIT', 'DEPARTMENT_DEACTIVATE', 'DEPARTMENT_DELETE']) AS grant_permission
WHERE existing_permission."permission" = 'CATALOG_MANAGE'
ON CONFLICT DO NOTHING;
