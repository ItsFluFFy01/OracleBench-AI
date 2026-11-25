# Dockerfile pour le backend Flask d'OracleBench-AI (Personne B)
FROM python:3.11-slim

WORKDIR /app

# Installation de curl pour les healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Installation des dépendances Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code source et des données
COPY oraclebench/ oraclebench/
COPY backend/ backend/
COPY data/ data/

# Variables d'environnement par défaut
ENV PYTHONUNBUFFERED=1
ENV PORT=5000
ENV HOST=0.0.0.0
ENV CHAIN_MIN_CONFIDENCE=0.7

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:5000/health || exit 1

CMD ["python", "-m", "backend.api"]
