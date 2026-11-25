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
│                   [Personne B - Python / Flask]                        │
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
- **Personne B** : IA de détection d'anomalies (Isolation Forest), modèle de mise à jour des réputations, API backend Flask (Python).
- **Personne C (ce module)** :
  - **Smart Contract Solidity (`smart-contract/contracts/OracleBench.sol`)** : Stockage immuable, seuil de confiance paramétrable, contrôle d'accès optimisé en gas.
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

- **Node.js** : version 18 LTS, 20 LTS ou 24
- **npm** : version 9+ ou 10+
- **Docker & Docker Compose** (recommandé pour une exécution en un clic)
- **Git**

---

## 5. Démarrage Rapide avec Docker

La commande unique suivante initialise la blockchain locale, compile et déploie le smart contract, lance le pont blockchain et expose le dashboard web :

```bash
docker compose up --build
```

### Services démarrés :
- **Dashboard Web** : [http://localhost:3000](http://localhost:3000)
- **Pont Blockchain (Bridge API)** : [http://localhost:3001](http://localhost:3001) (`/health`, `/stats`)
- **Nœud Hardhat (RPC JSON-EVM)** : `http://localhost:8545` (Chain ID : 31337)
- **Déployeur de contrat** : Initialise le contrat sur le nœud puis s'arrête proprement.

*Note : Le service `backend` de la Personne B (Flask) est documenté dans `docker-compose.yml` et sera activé lors de l'intégration finale.*

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
*Le fichier `smart-contract/deployments/localhost.json` sera généré automatiquement avec l'adresse du contrat et son ABI.*

### Étape 2 : Pont Blockchain Express
```bash
cd smart-contract/bridge
npm install

# Copier les variables d'environnement (optionnel, valeurs par défaut préconfigurées)
cp .env.example .env

# Démarrer le serveur du pont sur le port 3001
npm start
```

### Étape 3 : Dashboard React (Vite)
```bash
cd dashboard
npm install

# Lancer le serveur de développement Vite
npm run dev
```
Accéder à l'application sur [http://localhost:3000](http://localhost:3000).

---

## 7. Commandes de Test et de Métriques (Partie C)

### A. Tests Unitaires du Smart Contract (Hardhat / Chai / Ethers)
Exécute les 10 tests de conformité (contrôle d'accès, seuil de confiance, rejet sous le seuil avec custom error `ConfidenceTooLow`, cas limite égal au seuil, unicité du round `RoundAlreadyRecorded`, émission d'événement `ValueUpdated`, lecture `getRound`) :
```bash
cd smart-contract
npm test
```

### B. Mesure Réelle du Gas et de la Latence de Confirmation
Enregistre 50 rounds consécutifs sur la blockchain, calcule les moyennes, minimums et maximums, et exporte les résultats dans `smart-contract/results/gas_measurements.csv` :
```bash
cd smart-contract
npm run measure:gas
```
*Résultats types mesurés : Gas moyen $\approx 145\,392$, Latence moyenne $\approx 2.6\text{ ms}$.*

### C. Tests d'Intégration du Pont Blockchain
Lance automatiquement un nœud de test, déploie le contrat et vérifie les endpoints (`GET /health`, `POST /record` valide, `POST /record` rejeté avec HTTP 422, `GET /round/:id` on-chain et `GET /stats`) :
```bash
cd smart-contract/bridge
npm test
```

### D. Build de Production du Dashboard
Valide la compilation statique et la minification Vite :
```bash
cd dashboard
npm run build
```

---

## 8. Configuration & Bascule Mocks / API Réelle

Le dashboard web est conçu pour fonctionner de manière autonome sans dépendre de l'avancement des parties A et B grâce à son jeu de données de test (`dashboard/mocks/`).

La bascule s'effectue via les variables d'environnement du dashboard (`dashboard/.env` ou dans `docker-compose.yml`) :

```env
# URL de l'API Flask (Personne B)
VITE_API_URL=http://localhost:5000

# URL du Pont Blockchain (Personne C)
VITE_BRIDGE_URL=http://localhost:3001

# Bascule d'environnement :
# - true : utilise les fixtures locales de 50 rounds (autonome)
# - false : appelle directement le backend Flask et le pont en production
VITE_USE_MOCKS=true
```

---

## 9. Les 5 Vues du Dashboard

1. **Vue Round** :
   - Sélecteur de round dynamique (#1 à #50).
   - Vérité terrain (affichée uniquement en mode expérimental).
   - Valeur finale retenue, jauge de score de confiance avec statut dynamique (Valide $\ge 70\%$ / Rejeté $< 70\%$).
   - Consensus des nœuds (nombre de nœuds sains vs en alerte) et empreinte cryptographique `proof_hash`.
2. **Vue Oracles** :
   - Graphique de déviation comparant les rapports de chaque nœud oracle à la valeur finale IA.
   - Tableau complet par oracle : valeur rapportée, score d'anomalie (Isolation Forest), réputation historique, écart à la finale, et statut (`NORMAL` vert / `ALERT` rouge).
3. **Vue Comparaison** :
   - Mise en compétition des 5 méthodes : Moyenne simple, Médiane, Moyenne tronquée, Moyenne pondérée, Pipeline IA.
   - Bar chart comparatif avec ligne de vérité terrain.
   - Identification automatique de la méthode la plus performante et tableau d'erreurs absolues.
4. **Vue Blockchain** :
   - Statut on-chain de la transaction (`CONFIRMED`, `REJECTED`, `VERIFIED`).
   - Outil interactif d'interrogation en direct du Smart Contract via le pont (`GET /round/:id`).
   - Comparaison champ par champ de la valeur calculée par l'IA et de la valeur immuable stockée on-chain.
   - État de santé du pont (`GET /health`) et métriques de gas.
5. **Vue Expériences** :
   - **Courbes d'erreur MAE** vs % d'oracles corrompus (0% à 50%) démontrant la robustesse du pipeline IA.
   - **Métriques de détection** : Précision (96%), Rappel (93%), F1-Score (94.5%), Faux Positifs (2.5%).
   - **Latence de calcul** par méthode (inférence IA sous 15 ms).
   - **Courbe de gas on-chain** par round basée sur les mesures réelles.

---

## 10. Contrats d'Interface Partagés (`contracts/`)

Pour garantir l'interopérabilité entre les équipes A, B et C, les propositions initiales d'interfaces sont documentées dans le dossier `contracts/` :
- `contracts/observation.schema.json` : Schéma des observations brutes ou synthétiques par oracle.
- `contracts/round_result.schema.json` : Schéma de résultat de round agrégé transmis au pont et au dashboard.
- `contracts/bridge.md` : Spécification détaillée des endpoints du pont, des codes HTTP (notamment 422 en cas de confiance sous le seuil) et des règles de mise à l'échelle.
- `contracts/api.openapi.yaml` : Spécification OpenAPI 3.0 des routes Flask requises par le dashboard (`/rounds`, `/rounds/{id}`, `/experiments/summary`).
