FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_FLUX_API_URL
ARG VITE_FLUX_API_KEY
ENV VITE_FLUX_API_URL=$VITE_FLUX_API_URL VITE_FLUX_API_KEY=$VITE_FLUX_API_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html