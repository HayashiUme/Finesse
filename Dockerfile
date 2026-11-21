FROM node:22-alpine AS dashboard-build

WORKDIR /app
COPY VERSION ./VERSION
COPY dashboard/package.json dashboard/package-lock.json ./dashboard/
WORKDIR /app/dashboard
RUN npm ci
COPY dashboard/ ./
ARG FINESSE_VERSION
ENV FINESSE_VERSION=${FINESSE_VERSION}
RUN npm run test:i18n \
    && npm run test:connections \
    && npm run build

FROM nginx/nginx-unprivileged:alpine
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dashboard-build /app/dashboard/dist/ /usr/share/nginx/html/
EXPOSE 4173
