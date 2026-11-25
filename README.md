# OracleBench-AI : Plateforme de Benchmark d'Oracles Blockchain

OracleBench-AI est une plateforme complète d'évaluation, de filtrage par intelligence artificielle et de sécurisation on-chain pour les réseaux d'oracles blockchain.

Le système simule des flux de données avec diverses anomalies (bruit gaussien, biais systématique, spikes, données périmées, collusion), applique une détection d'anomalies par forêt d'isolement (**Isolation Forest**) couplée à un moteur de réputation dynamique, met en compétition plusieurs stratégies d'agrégation, puis scelle le résultat vérifié sur un Smart Contract Ethereum via un pont sécurisé.

---

## 1. Architecture Globale du Pipeline

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          GROUND TRUTH (Vérité)                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       N NŒUDS ORACLES SYNTHÉTIQUES                     │
│    (Profils : NORMAL, NOISY, BIASED, SPIKE, STALE, COLLUSION)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│     COLLECTOR + DÉTECTION D'ANOMALIES (Isolation Forest) + RÉPUTATION  │
│                   [Personne B - Python / Flask] : Port 5000            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    MOTEUR D'AGRÉGATION COMPARATIF                      │
│     (Moyenne / Médiane / Tronquée / Pondérée par Réputation / IA)      │
│                     [Personne A - Python]                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Valeur finale + Confiance + Proof Hash
┌────────────────────────────────────────────────────────────────────────┐
│              PONT BLOCKCHAIN (HTTP REST <-> ETHERS.JS V6)              │
│                 [Personne C - Node.js / Express] : Port 3001           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ JSON-RPC (31337)
┌────────────────────────────────────────────────────────────────────────┐
│              SMART CONTRACT SOLIDITY (OracleBench.sol)                 │
│         [Personne C - Hardhat EVM / Contrôle d'accès & Seuil]          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Lecture on-chain & Métriques
┌────────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD DE BENCHMARK REACT                        │
│             [Personne C - Vite / React / Recharts] : Port 3000         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Périmètre du Projet & Répartition

- **Personne A** : Simulation des oracles, baselines d'agrégation statistique, campagne de benchmark expérimental (Python).
- **Personne B (IA & Backend)** :
  - **Détection d'anomalies (`oraclebench/anomaly_detection.py`)** : Isolation Forest non supervisée sans ground truth, calcul d'anomalies par features statistiques.
  - **Moteur de réputation (`oraclebench/reputation.py`)** : Réputation dynamique bornée $[0, 1]$, pénalités et récupération progressive.
  - **Score de confiance (`oraclebench/confidence.py`)** : Moyenne géométrique pondérée (consensus, réputation, dispersion).
  - **Agrégation IA (`oraclebench/ai_aggregation.py`)** : Moyenne pondérée sur les nœuds sains filtrés.
  - **Backend Flask (`backend/api.py`, `backend/storage.py`)** : API REST, stockage local Parquet et PostgreSQL, intégration du pont.
- **Personne C (Blockchain, Dashboard & Déploiement)** :
  - **Smart Contract Solidity (`smart-contract/contracts/OracleBench.sol`)** : Stockage immuable, seuil de confiance $\ge 0.70$, contrôle d'accès optimisé en gas.
  - **Pont Blockchain (`smart-contract/bridge/`)** : API Express + ethers.js v6 reliant le backend Flask au réseau blockchain.
  - **Dashboard Web (`dashboard/`)** : Application React 18 (Vite + Recharts) proposant 5 vues analytiques interactives et un mode mock complet autonome.
  - **Conteneurisation (`docker-compose.yml`)** : Déploiement et orchestration reproductible en conteneurs Docker.
  - **Contrats d'interface (`contracts/`)** : Schémas JSON et spécifications d'API v0 partagés avec l'équipe.

---

## 3. Convention de Mise à l'Échelle (Fixed-Point Scaling)

L'EVM (Ethereum Virtual Machine) ne traitant que des entiers, les données flottantes sont converties par le Pont :

| Grandeur | Type Client / Python | Type On-Chain (Solidity) | Règle de Conversion |
|---|---|---|---|
| **Valeur finale** (`final_value`) | Nombre flottant | `int256` | $V_{\text{on-chain}} = \text{round}(V_{\text{décimal}} \times 10^6)$ |
| **Score de confiance** (`confidence`) | Flottant $[0.0, 1.0]$ | `uint256` | $C_{\text{on-chain}} = \text{round}(C_{\text{décimal}} \times 10000)$ |
| **Hash de preuve** (`proof_hash`) | `0x` + 64 hex | `bytes32` | Mapping direct 32 octets |
| **Horodatage** | ISO / Unix ms | `uint256` | `block.timestamp` (secondes Unix) |

*Exemple :* Une confiance de `0.8542` devient `8542` on-chain. Le seuil de confiance par défaut de `70%` correspond à la valeur `7000`.

---

## 4. Prérequis

- **Python** : 3.10+ (recommandé 3.11 ou 3.12)
- **Node.js** : version 18 LTS, 20 LTS ou 24
- **npm** : version 9+ ou 10+
- **Docker & Docker Compose** (recommandé pour une exécution en un clic)
- **Git**

---

## 5. Démarrage Rapide avec Docker

La commande unique suivante initialise la blockchain locale, compile et déploie le smart contract, lance le pont blockchain, le backend Flask et le dashboard web :

```bash
docker compose up --build
```

### Services démarrés :
- **Dashboard Web** : [http://localhost:3000](http://localhost:3000)
- **API Backend Flask (Personne B)** : [http://localhost:5000](http://localhost:5000) (`/health`, `/rounds`, `/round/<id>`, `/reputation`, `/experiments/summary`)
- **Pont Blockchain (Bridge API - Personne C)** : [http://localhost:3001](http://localhost:3001) (`/health`, `/stats`)
- **Nœud Hardhat (RPC JSON-EVM)** : `http://localhost:8545` (Chain ID : 31337)
- **Déployeur de contrat** : Initialise le contrat sur le nœud puis s'arrête proprement.

---

## 6. Lancement en Local (Sans Docker)

Pour exécuter et développer sur chaque service indépendamment :

### Étape 1 : Smart Contract & Nœud Local
```bash
cd smart-contract
npm install

# Dans un terminal dédié : démarrer le nœud Hardhat
npx hardhat node

# Dans un second terminal : déployer le contrat sur localhost
npx hardhat run scripts/deploy.js --network localhost
```

### Étape 2 : Pont Blockchain Express
```bash
cd smart-contract/bridge
npm install

# Démarrer le serveur du pont sur le port 3001
npm start
```

### Étape 3 : Backend Flask (Personne B)
```bash
# Dans la racine du projet :
pip install -r requirements.txt

# Démarrer l'API Flask reliée au pont blockchain de la Personne C
# Sous Windows PowerShell :
$env:BRIDGE_URL = "http://localhost:3001"
python -m backend.api

# Sous Linux / macOS :
BRIDGE_URL=http://localhost:3001 python -m backend.api
```

### Étape 4 : Dashboard React (Vite)
```bash
cd dashboard
npm install

# Lancer le serveur de développement Vite
npm run dev
```
Accéder à l'application sur [http://localhost:3000](http://localhost:3000).

---

## 7. Commandes de Test et de Validation

### A. Tests Unitaires du Smart Contract (Partie C)
```bash
cd smart-contract
npm test
```

### B. Mesure Réelle du Gas et de la Latence (Partie C)
```bash
cd smart-contract
npm run measure:gas
```

### C. Tests d'Intégration du Pont Blockchain (Partie C)
```bash
cd smart-contract/bridge
npm test
```

### D. Tests Unitaires de l'IA et du Backend (Partie B)
Exécute la suite complète de 160+ tests unitaires (IA, Isolation Forest, réputation, confiance, stockage Parquet/SQL, client de pont, API Flask) :
```bash
pytest
```

### E. Simulation & Démo de Bout en Bout
Injecte une série de rounds dans l'API Flask, calcule l'IA, met à jour la réputation et scelle sur la blockchain :
```bash
python -m data.demo_api_client
```

---

## 8. Configuration & Bascule Mocks / API Réelle

Le dashboard web peut fonctionner soit en mode autonome (fixtures `dashboard/mocks/`), soit connecté à l'API Flask réelle de la Personne B :

Dans `dashboard/.env` ou `docker-compose.yml` :
```env
# URL de l'API Flask (Personne B)
VITE_API_URL=http://localhost:5000

# URL du Pont Blockchain (Personne C)
VITE_BRIDGE_URL=http://localhost:3001

# Bascule d'environnement :
# - true : utilise les fixtures locales de rounds
# - false : appelle directement le backend Flask et le pont en direct
VITE_USE_MOCKS=false
```

---

## 9. Les 5 Vues du Dashboard

1. **Vue Round** : Sélection dynamique de round, KPIs de valeur finale, jauge de confiance, consensus des oracles sains/alertés, et preuve cryptographique `proof_hash`.
2. **Vue Oracles** : Graphique de déviation par rapport au consensus IA, score d'anomalie Isolation Forest, réputation et statut (`NORMAL` / `ALERT`).
3. **Vue Comparaison** : Benchmarking des 5 méthodes (Moyenne, Médiane, Tronquée, Pondérée, Pipeline IA) vs Vérité terrain.
4. **Vue Blockchain** : Statut on-chain de la transaction (`CONFIRMED`, `REJECTED`), inspection du Smart Contract via le pont (`GET /round/:id`), métriques de gas.
5. **Vue Expériences** : Courbes MAE vs % d'attaquants, métriques de classification (Précision, Rappel, F1-Score), latence d'inférence.

---

## 10. Contrats d'Interface Partagés (`contracts/`)

- `contracts/observation.schema.json` : Format normalisé des observations par oracle.
- `contracts/round_result.schema.json` : Format du résultat complet de round après IA et agrégation.
- `contracts/bridge.md` : Spécification des endpoints du pont (`/record`, `/round/:id`, `/health`, `/stats`).
- `contracts/api.openapi.yaml` : Spécification OpenAPI 3.0 des routes Flask requises par le dashboard (`/rounds`, `/rounds/{id}`, `/experiments/summary`).
