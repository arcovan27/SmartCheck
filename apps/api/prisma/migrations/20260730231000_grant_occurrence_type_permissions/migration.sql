-- Executada separadamente da ampliacao do enum HrPermission por limitacao transacional do PostgreSQL.
-- Replica o acesso atual: visualizacao/revisao e registro recebem apenas as permissoes equivalentes.
-- Nao executar em producao sem homologacao, backup e autorizacao expressa.

INSERT INTO "RolePermission" ("role", "permission")
SELECT DISTINCT source."role", target.permission::"HrPermission"
FROM "RolePermission" source
CROSS JOIN unnest(ARRAY[
  'OCCURRENCE_VIEW',
  'OCCURRENCE_EDIT',
  'OCCURRENCE_CANCEL',
  'WARNING_VIEW',
  'SUSPENSION_VIEW',
  'WORK_ACCIDENT_VIEW'
]) AS target(permission)
WHERE source."permission" = 'OCCURRENCE_REVIEW'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("role", "permission")
SELECT DISTINCT source."role", target.permission::"HrPermission"
FROM "RolePermission" source
CROSS JOIN unnest(ARRAY[
  'WARNING_REGISTER',
  'SUSPENSION_REGISTER',
  'WORK_ACCIDENT_REGISTER'
]) AS target(permission)
WHERE source."permission" = 'OCCURRENCE_REGISTER'
ON CONFLICT DO NOTHING;
