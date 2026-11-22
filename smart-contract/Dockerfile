FROM node:20-alpine

WORKDIR /app

# Configuration npm pour la robustesse réseau
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000

# Installation des dépendances
COPY package*.json ./
RUN npm install

# Copie des sources et de la configuration Hardhat
COPY hardhat.config.js ./
COPY contracts/ ./contracts/
COPY scripts/ ./scripts/
COPY test/ ./test/

# Pré-compilation des contrats Solidity
RUN npx hardhat compile

EXPOSE 8545

# Par défaut, démarre le nœud local Hardhat
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]
