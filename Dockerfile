FROM node:22-alpine AS builder
WORKDIR /app

# Instala dependências primeiro (cache layer)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copia código e faz build limitando memória do Node
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=1536" npm run build

# ── Imagem de produção ──────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
