FROM node:22-alpine AS base
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install

COPY . .
WORKDIR /app/apps/api
RUN npm run prisma:generate

EXPOSE 3333
CMD ["sh", "-c", "npm run prisma:deploy && npm run seed && npm run dev"]
