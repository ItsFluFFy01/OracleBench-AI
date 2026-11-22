# Spécification du Pont Blockchain (Bridge)
> **PROPOSITION v0, à valider par A, B et C**

Le pont (Bridge) est un service Node.js / Express intermédiaire développé par la **Personne C**.  
Il permet au backend Flask (Personne B) d'enregistrer et de consulter les résultats d'agrégation sur la blockchain Ethereum locale (Hardhat), sans que Flask n'ait besoin de manipuler des clients web3/EVM directement.

---

## 1. Convention de mise à l'échelle (Fixed-Point Scaling)

La Machine Virtuelle Ethereum (EVM) ne gère pas nativement les nombres à virgule flottante. Les conversions suivantes sont appliquées systématiquement par le Pont :

| Donnée | Type API / Python / Dashboard | Type On-Chain (Solidity) | Règle de conversion Pont <-> Chaîne |
|---|---|---|---|
| `final_value` | `number` (décimal) | `int256` | $V_{\text{on-chain}} = \text{round}(V_{\text{décimal}} \times 10^6)$<br>$V_{\text{décimal}} = V_{\text{on-chain}} / 10^6$ |
| `confidence` | `number` ($[0.0, 1.0]$) | `uint256` | $C_{\text{on-chain}} = \text{round}(C_{\text{décimal}} \times 10000)$<br>$C_{\text{décimal}} = C_{\text{on-chain}} / 10000$ |
| `proof_hash` | `string` (`0x` + 64 hex) | `bytes32` | Conversion directe hex string $\leftrightarrow$ `bytes32` |
| `timestamp` | `number` (ms ou ISO) | `uint256` | `block.timestamp` (secondes Unix) |

*Exemples :*
- Valeur décimale `105.4219` $\rightarrow$ `105421900` sur le Smart Contract.
- Confiance `0.8542` $\rightarrow$ `8542` sur le Smart Contract.
- Le seuil de confiance par défaut de `0.70` est stocké sous la valeur `7000`.

---

## 2. Endpoints du Pont

### `POST /record`
Enregistre un résultat de round finalisé sur le Smart Contract `OracleBench`.

- **Entêtes** : `Content-Type: application/json`
- **Corps de la requête (Body)** :
```json
{
  "round_id": 1,
  "final_value": 102.35,
  "confidence": 0.88,
  "proof_hash": "0x4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
}
```

- **Validation du Body** :
  - `round_id` : entier strict $\ge 1$
  - `final_value` : nombre valide
  - `confidence` : nombre dans $[0.0, 1.0]$
  - `proof_hash` : chaîne hexadécimale débutant par `0x` suivie de 64 caractères hexadécimaux

- **Réponse Succès (HTTP 200 ou 201)** :
```json
{
  "status": "CONFIRMED",
  "round_id": 1,
  "tx_hash": "0x5c8e...",
  "block_number": 42,
  "gas_used": 68420,
  "confirmation_ms": 154
}
```

- **Réponse Refus - Confiance insuffisante (HTTP 422)** :
Lorsque la confiance est inférieure au seuil du contrat (`confidence < confidenceThreshold`), le contrat `revert` avec l'erreur personnalisée `ConfidenceTooLow`. Le pont intercepte ce revert et renvoie :
```json
{
  "status": "REJECTED",
  "reason": "confidence_below_threshold",
  "confidence": 0.52,
  "threshold": 0.70
}
```

- **Autres Réponses d'Erreur** :
  - `HTTP 400` : Corps de requête invalide ou malformé.
  - `HTTP 409` : Round déjà enregistré (`RoundAlreadyRecorded`).
  - `HTTP 500` : Erreur de communication RPC ou transaction échouée.

---

### `GET /round/:id`
Récupère les données on-chain enregistrées pour un round donné.

- **Paramètre URL** : `id` (entier)
- **Réponse Succès (HTTP 200)** :
```json
{
  "round_id": 1,
  "final_value": 102.35,
  "confidence": 0.88,
  "timestamp": 1774272000,
  "proof_hash": "0x4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
}
```
- **Réponse Non Trouvé (HTTP 404)** :
```json
{
  "error": "Round not found"
}
```

---

### `GET /health`
Vérification de l'état du pont et de la connexion blockchain.

- **Réponse Succès (HTTP 200)** :
```json
{
  "status": "ok",
  "contract_address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "network": "localhost (31337)",
  "block_number": 43
}
```

---

### `GET /stats`
Fournit l'historique et les statistiques agrégées de gas et de latence mesurées par le pont lors des enregistrements.

- **Réponse Succès (HTTP 200)** :
```json
{
  "total_records": 50,
  "gas_used": {
    "avg": 68250,
    "min": 67800,
    "max": 69100
  },
  "confirmation_ms": {
    "avg": 142.5,
    "min": 98,
    "max": 230
  },
  "history": [
    {
      "round_id": 1,
      "gas_used": 68420,
      "confirmation_ms": 154,
      "timestamp": 1774272000
    }
  ]
}
```
