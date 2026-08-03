#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS_ON_START:-false}" = "true" ]; then
  echo "RUN_MIGRATIONS_ON_START=true -> aplicando migracoes pendentes..."
  npm run prisma:deploy
else
  echo "RUN_MIGRATIONS_ON_START=false -> migracoes nao executadas automaticamente."
fi

if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
  echo "RUN_SEED_ON_START=true -> executando seed..."
  npm run seed
else
  echo "RUN_SEED_ON_START=false -> seed ignorado (dados preservados)."
fi

exec npm run dev
