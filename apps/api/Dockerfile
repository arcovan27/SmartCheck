FROM node:22-alpine AS base
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install

COPY . .
WORKDIR /app/apps/api
RUN npm run prisma:generate
RUN chmod +x /app/apps/api/docker-entrypoint.sh

EXPOSE 3333
CMD ["sh", "/app/apps/api/docker-entrypoint.sh"]
