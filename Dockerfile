# 构建阶段
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# 运行阶段（server/ 只用 Node 内置模块，无需安装依赖）
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

# package.json 必须保留：其中 "type": "module" 决定 server/*.js 以 ESM 解析
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 8787
CMD ["node", "server/index.js"]
