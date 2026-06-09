FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:24-alpine

WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

CMD serve -s dist -l tcp://0.0.0.0:${PORT:-5173}
