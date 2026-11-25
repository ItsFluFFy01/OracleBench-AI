const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Historique en mémoire des transactions mesurées
const statsHistory = [];

let provider;
let wallet;
let oracleBenchContract;
let contractAddress;
let lastDeploymentMtimeMs = null;

// Helper pour trouver les fichiers de déploiement (gère Docker /app et local ..)
function findDeploymentFile(fileName) {
  const possiblePaths = [
    path.join(__dirname, "deployments", fileName),
    path.join(__dirname, "..", "deployments", fileName),
    path.join("/app", "deployments", fileName),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getActiveDeploymentFile() {
  return findDeploymentFile("localhost.json") || findDeploymentFile("hardhat.json");
}

function findArtifactPath() {
  const possiblePaths = [
    path.join(__dirname, "artifacts", "contracts", "OracleBench.sol", "OracleBench.json"),
    path.join(__dirname, "..", "artifacts", "contracts", "OracleBench.sol", "OracleBench.json"),
    path.join("/app", "artifacts", "contracts", "OracleBench.sol", "OracleBench.json"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Fonction de chargement dynamique du contrat et de son ABI
function initContract() {
  const previousAddress = contractAddress;

  provider = new ethers.JsonRpcProvider(RPC_URL, undefined, {
    staticNetwork: ethers.Network.from({ name: "localhost", chainId: 31337 })
  });
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  let loadedAbi = null;

  // Recherche de l'adresse du contrat
  if (process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS.trim() !== "") {
    contractAddress = process.env.CONTRACT_ADDRESS.trim();
  } else {
    const activePath = getActiveDeploymentFile();
    if (activePath) {
      const stat = fs.statSync(activePath);
      const data = JSON.parse(fs.readFileSync(activePath, "utf8"));
      contractAddress = data.address;
      lastDeploymentMtimeMs = stat.mtimeMs;
      if (data.abi && Array.isArray(data.abi) && data.abi.length > 0) {
        loadedAbi = data.abi;
      }
    }
  }

  let abi = loadedAbi;
  if (!abi) {
    const artifactPath = findArtifactPath();
    if (artifactPath) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      abi = artifact.abi;
    }
  }

  if (!abi) {
    // ABI minimale de secours si les artefacts ne sont pas générés
    abi = [
      "function updateOracleValue(uint256 roundId, int256 finalValue, uint256 confidence, bytes32 proofHash) external",
      "function getRound(uint256 roundId) external view returns (int256 finalValue, uint256 confidence, uint256 timestamp, bytes32 proofHash, bool exists)",
      "function latestRoundId() external view returns (uint256)",
      "function confidenceThreshold() external view returns (uint256)",
      "error ConfidenceTooLow(uint256 confidence, uint256 threshold)",
      "error RoundAlreadyRecorded(uint256 roundId)",
      "error Unauthorized(address caller)"
    ];
  }

  if (contractAddress) {
    if (previousAddress && previousAddress !== contractAddress) {
      statsHistory.length = 0;
    }
    oracleBenchContract = new ethers.Contract(contractAddress, abi, wallet);
    console.log(`[Bridge] Connecté au contrat OracleBench à l'adresse : ${contractAddress}`);
  } else {
    console.warn("[Bridge] AVERTISSEMENT : Aucune adresse de contrat trouvée. Les requêtes on-chain échoueront tant qu'un contrat n'est pas configuré.");
  }
}

// Vérifie si un nouveau déploiement a été écrit sur le disque et recharge le contrat si besoin
function ensureContractCurrent() {
  if (process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS.trim() !== "") {
    if (!oracleBenchContract) {
      initContract();
    }
    return;
  }

  const activePath = getActiveDeploymentFile();
  if (!activePath) {
    if (!oracleBenchContract) {
      initContract();
    }
    return;
  }

  try {
    const stat = fs.statSync(activePath);
    if (!oracleBenchContract || stat.mtimeMs !== lastDeploymentMtimeMs) {
      initContract();
    }
  } catch (err) {
    console.warn("[Bridge] Impossible de vérifier le fichier de déploiement :", err.message);
  }
}

// Initialisation au démarrage
try {
  initContract();
} catch (err) {
  console.error("[Bridge] Erreur lors de l'initialisation du contrat :", err);
}

// -------------------------------------------------------------
// ENDPOINTS DE L'API DU PONT
// -------------------------------------------------------------

/**
 * GET /health
 * Vérification de l'état du pont et de la connexion blockchain
 */
app.get("/health", async (req, res) => {
  try {
    ensureContractCurrent();
    let blockNumber = null;
    let networkName = "disconnected";
    let contractDeployed = false;
    if (provider) {
      try {
        blockNumber = await provider.getBlockNumber();
        const network = await provider.getNetwork();
        networkName = `${network.name} (${network.chainId})`;
        if (contractAddress) {
          const code = await provider.getCode(contractAddress);
          contractDeployed = Boolean(code && code !== "0x");
        }
      } catch (e) {
        // RPC pas encore disponible
      }
    }
    return res.json({
      status: contractAddress && blockNumber !== null && !contractDeployed ? "contract_not_deployed" : "ok",
      contract_address: contractAddress || null,
      contract_deployed: contractDeployed,
      network: networkName,
      block_number: blockNumber,
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
});

/**
 * POST /record
 * Enregistre un round sur le smart contract
 * Body: { round_id, final_value, confidence, proof_hash }
 */
app.post("/record", async (req, res) => {
  const { round_id, final_value, confidence, proof_hash } = req.body;

  // 1. Validation stricte des données d'entrée
  if (
    round_id === undefined ||
    typeof round_id !== "number" ||
    !Number.isInteger(round_id) ||
    round_id < 1
  ) {
    return res.status(400).json({
      error: "Paramètre 'round_id' invalide : entier positif requis.",
    });
  }

  if (typeof final_value !== "number" || isNaN(final_value)) {
    return res.status(400).json({
      error: "Paramètre 'final_value' invalide : nombre décimal requis.",
    });
  }

  if (
    typeof confidence !== "number" ||
    isNaN(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return res.status(400).json({
      error: "Paramètre 'confidence' invalide : nombre flottant entre 0.0 et 1.0 requis.",
    });
  }

  if (
    typeof proof_hash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(proof_hash)
  ) {
    return res.status(400).json({
      error: "Paramètre 'proof_hash' invalide : chaîne hexadécimale de 32 octets (0x + 64 hex) requise.",
    });
  }

  ensureContractCurrent();
  if (!oracleBenchContract) {
    return res.status(503).json({
      error: "Smart contract non configuré ou introuvable sur le RPC.",
    });
  }

  // 2. Application de la convention de mise à l'échelle (fixed-point)
  // final_value -> int256 = round(valeur * 1e6)
  const scaledValue = BigInt(Math.round(final_value * 1e6));
  // confidence -> uint256 = round(confiance * 10000)
  const scaledConfidence = BigInt(Math.round(confidence * 10000));
  const proofBytes32 = proof_hash;

  try {
    // 3. Vérification du seuil on-chain avant envoi pour réponse 422 rapide et claire
    let threshold = 7000n;
    try {
      threshold = await oracleBenchContract.confidenceThreshold();
    } catch (e) {
      // Ignorer si échec de lecture
    }

    if (scaledConfidence < threshold) {
      return res.status(422).json({
        status: "REJECTED",
        reason: "confidence_below_threshold",
        confidence: confidence,
        threshold: Number(threshold) / 10000,
      });
    }

    // 4. Exécution de la transaction et mesure du temps de confirmation
    const startTime = Date.now();
    const tx = await oracleBenchContract.updateOracleValue(
      round_id,
      scaledValue,
      scaledConfidence,
      proofBytes32
    );
    const receipt = await tx.wait();
    const confirmationMs = Date.now() - startTime;
    const gasUsed = Number(receipt.gasUsed);

    // 5. Stockage des statistiques
    const recordStats = {
      round_id: round_id,
      gas_used: gasUsed,
      confirmation_ms: confirmationMs,
      timestamp: Math.floor(Date.now() / 1000),
    };
    statsHistory.push(recordStats);

    return res.status(200).json({
      status: "CONFIRMED",
      round_id: round_id,
      tx_hash: tx.hash,
      block_number: receipt.blockNumber,
      gas_used: gasUsed,
      confirmation_ms: confirmationMs,
    });
  } catch (error) {
    // Détection des erreurs personnalisées de Solidity
    const errorMessage = error.toString();
    if (errorMessage.includes("ConfidenceTooLow")) {
      return res.status(422).json({
        status: "REJECTED",
        reason: "confidence_below_threshold",
        confidence: confidence,
        threshold: 0.70,
      });
    }
    if (errorMessage.includes("RoundAlreadyRecorded")) {
      return res.status(409).json({
        error: `Le round ${round_id} a déjà été enregistré sur la blockchain.`,
        code: "ROUND_ALREADY_RECORDED",
      });
    }
    if (errorMessage.includes("Unauthorized")) {
      return res.status(403).json({
        error: "L'adresse du pont n'est pas autorisée à appeler updateOracleValue.",
        code: "UNAUTHORIZED",
      });
    }

    console.error(`[Bridge] Erreur lors de l'enregistrement du round ${round_id} :`, error);
    return res.status(500).json({
      error: "Erreur lors de la transaction blockchain",
      details: error.message,
    });
  }
});

/**
 * GET /round/:id
 * Lecture des données on-chain pour un round spécifique
 */
app.get("/round/:id", async (req, res) => {
  const roundId = parseInt(req.params.id, 10);
  if (isNaN(roundId) || roundId < 1) {
    return res.status(400).json({ error: "Identifiant de round invalide." });
  }

  ensureContractCurrent();
  if (!oracleBenchContract) {
    return res.status(503).json({ error: "Smart contract non initialisé." });
  }

  try {
    const record = await oracleBenchContract.getRound(roundId);
    if (!record.exists) {
      return res.status(404).json({ error: "Round not found" });
    }

    // Dé-scaling pour renvoyer des valeurs décimales normales au client
    const finalValue = Number(record.finalValue) / 1e6;
    const confidence = Number(record.confidence) / 10000;
    const timestamp = Number(record.timestamp);
    const proofHash = record.proofHash;

    return res.json({
      round_id: roundId,
      final_value: finalValue,
      confidence: confidence,
      timestamp: timestamp,
      proof_hash: proofHash,
    });
  } catch (error) {
    console.error(`[Bridge] Erreur lors de la lecture du round ${roundId} :`, error);
    return res.status(500).json({
      error: "Erreur lors de la lecture on-chain",
      details: error.message,
    });
  }
});

/**
 * GET /stats
 * Agrégats statistiques de gas_used et confirmation_ms
 */
app.get("/stats", (req, res) => {
  if (statsHistory.length === 0) {
    return res.json({
      total_records: 0,
      gas_used: { avg: 0, min: 0, max: 0 },
      confirmation_ms: { avg: 0, min: 0, max: 0 },
      history: [],
    });
  }

  const gasList = statsHistory.map((s) => s.gas_used);
  const latencyList = statsHistory.map((s) => s.confirmation_ms);

  const avgGas = Math.round(gasList.reduce((a, b) => a + b, 0) / gasList.length);
  const minGas = Math.min(...gasList);
  const maxGas = Math.max(...gasList);

  const avgLatency = +(latencyList.reduce((a, b) => a + b, 0) / latencyList.length).toFixed(1);
  const minLatency = Math.min(...latencyList);
  const maxLatency = Math.max(...latencyList);

  return res.json({
    total_records: statsHistory.length,
    gas_used: {
      avg: avgGas,
      min: minGas,
      max: maxGas,
    },
    confirmation_ms: {
      avg: avgLatency,
      min: minLatency,
      max: maxLatency,
    },
    history: statsHistory,
  });
});

// Démarrage du serveur si appelé directement
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`[Bridge] Pont OracleBench démarré sur le port ${PORT}`);
    console.log(`[Bridge] Connecté au RPC : ${RPC_URL}`);
    console.log(`===============================================`);
  });
}

module.exports = { app, initContract };
