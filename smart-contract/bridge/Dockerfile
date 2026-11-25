FROM node:20-alpine

WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm install --omit=dev

# Copie du code source du pont
COPY server.js ./
COPY test_bridge.js ./

EXPOSE 3001

CMD ["node", "server.js"]
