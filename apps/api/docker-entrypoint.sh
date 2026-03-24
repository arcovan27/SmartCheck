#!/bin/sh
set -e

echo "Aplicando schema no banco..."
npm run prisma:deploy

if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
  echo "RUN_SEED_ON_START=true -> executando seed..."
  npm run seed
else
  echo "RUN_SEED_ON_START=false -> seed ignorado (dados preservados)."
fi

exec npm run dev
