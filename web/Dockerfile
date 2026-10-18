FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY . .

ENV DOCKER=1

EXPOSE 5174

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
