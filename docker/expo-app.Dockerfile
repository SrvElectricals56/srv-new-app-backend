FROM node:20-bookworm-slim

WORKDIR /app

ENV CI=1
ENV EXPO_NO_TELEMETRY=1
ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
ENV REACT_NATIVE_PACKAGER_HOSTNAME=localhost
ENV EXPO_PUBLIC_API_URL=http://127.0.0.1:3001/api/v1

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8081 19000 19001 19002

CMD ["npx", "expo", "start", "--web", "--port", "8081", "--host", "lan"]
