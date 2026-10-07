# Remo bridge + web app. Run with host networking so UDP discovery reaches your LAN:
#   docker build -t remo . && docker run -d --network host -e REMO_TOKEN=change-me remo
FROM node:22-alpine AS build
WORKDIR /src
COPY . .
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts && npm run build -w @remo/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8732 WEB_ROOT=/app/web
COPY --from=build /src/packages/node-transport /app/node_modules/@remo/node-transport
COPY --from=build /src/apps/bridge/server.cjs /app/server.cjs
COPY --from=build /src/apps/web/dist /app/web
USER node
EXPOSE 8732
CMD ["node", "server.cjs"]
