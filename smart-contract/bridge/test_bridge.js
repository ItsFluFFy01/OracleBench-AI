const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isRpcAvailable(url) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "net_version", params: [], id: 1 }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function runTests() {
  console.log("=== Lancement des tests d'intégration du Pont (Bridge) ===");
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  let hardhatNodeProcess = null;

  // 1. Vérifie si le nœud Hardhat est déjà actif, sinon le lance
  const rpcReady = await isRpcAvailable(rpcUrl);
  if (!rpcReady) {
    console.log("[Test] Aucun nœud Hardhat détecté sur", rpcUrl, "-> Démarrage d'un nœud local...");
    const hardhatDir = path.join(__dirname, "..");
    const isWindows = process.platform === "win32";
    const npxCmd = isWindows ? "npx.cmd" : "npx";

    hardhatNodeProcess = spawn(npxCmd, ["hardhat", "node"], {
      cwd: hardhatDir,
      stdio: "pipe",
      shell: true,
    });

    // Attente que le nœud réponde
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      if (await isRpcAvailable(rpcUrl)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      if (hardhatNodeProcess) hardhatNodeProcess.kill();
      throw new Error("Impossible de démarrer le nœud Hardhat local");
    }
    console.log("[Test] Nœud Hardhat local prêt.");

    // Déploiement automatique du contrat sur localhost
    console.log("[Test] Déploiement du contrat OracleBench sur localhost...");
    const deployProc = spawn(npxCmd, ["hardhat", "run", "scripts/deploy.js", "--network", "localhost"], {
      cwd: hardhatDir,
      stdio: "inherit",
      shell: true,
    });

    await new Promise((resolve, reject) => {
      deployProc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Déploiement échoué avec le code ${code}`));
      });
    });
  } else {
    console.log("[Test] Nœud Hardhat détecté sur", rpcUrl);
  }

  // 2. Initialisation du pont Express
  const { app, initContract } = require("./server");
  initContract();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test] Serveur de test du pont démarré sur : ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  async function assertTest(name, fn) {
    try {
      await fn();
      console.log(`  [OK] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name} :`, err.message);
      failed++;
    }
  }

  try {
    // Test 1 : GET /health
    await assertTest("GET /health renvoie status ok et contrat connecté", async () => {
      const res = await fetch(`${baseUrl}/health`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data.status !== "ok") throw new Error(`Expected ok, got ${data.status}`);
      if (!data.contract_address) throw new Error("Contract address manquante");
    });

    // Test 2 : POST /record avec données invalides (validation)
    await assertTest("POST /record rejette un body invalide (HTTP 400)", async () => {
      const res = await fetch(`${baseUrl}/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id: "non-integer" }),
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // Test 3 : POST /record avec confiance < seuil (HTTP 422 REJECTED)
    await assertTest("POST /record avec confiance sous seuil renvoie HTTP 422 REJECTED", async () => {
      const res = await fetch(`${baseUrl}/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_id: 8888,
          final_value: 102.5,
          confidence: 0.62, // < 0.70
          proof_hash: "0x" + "a".repeat(64),
        }),
      });
      if (res.status !== 422) throw new Error(`Expected 422, got ${res.status}`);
      const data = await res.json();
      if (data.status !== "REJECTED" || data.reason !== "confidence_below_threshold") {
        throw new Error(`Réponse inattendue: ${JSON.stringify(data)}`);
      }
    });

    // Test 4 : POST /record d'un round valide sur la blockchain (HTTP 200/201 CONFIRMED)
    const testRoundId = 101;
    let confirmedTxHash = null;
    await assertTest("POST /record enregistre un round valide sur la blockchain", async () => {
      const res = await fetch(`${baseUrl}/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_id: testRoundId,
          final_value: 104.55,
          confidence: 0.88,
          proof_hash: "0x" + "f".repeat(64),
        }),
      });
      if (res.status !== 200) {
        const errText = await res.text();
        throw new Error(`Expected 200, got ${res.status}: ${errText}`);
      }
      const data = await res.json();
      if (data.status !== "CONFIRMED") throw new Error(`Expected CONFIRMED, got ${data.status}`);
      if (!data.tx_hash || !data.gas_used || !data.confirmation_ms) {
        throw new Error(`Champs de confirmation manquants : ${JSON.stringify(data)}`);
      }
      confirmedTxHash = data.tx_hash;
    });

    // Test 5 : GET /round/:id lit le round on-chain
    await assertTest("GET /round/:id relit fidèlement les données enregistrées on-chain", async () => {
      const res = await fetch(`${baseUrl}/round/${testRoundId}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      if (data.round_id !== testRoundId) throw new Error(`round_id mismatch`);
      if (Math.abs(data.final_value - 104.55) > 0.0001) throw new Error(`final_value mismatch: ${data.final_value}`);
      if (Math.abs(data.confidence - 0.88) > 0.0001) throw new Error(`confidence mismatch: ${data.confidence}`);
      if (data.proof_hash !== "0x" + "f".repeat(64)) throw new Error(`proof_hash mismatch`);
    });

    // Test 6 : GET /round/:id sur un round inexistant renvoie 404
    await assertTest("GET /round/:id renvoie 404 pour un round inexistant", async () => {
      const res = await fetch(`${baseUrl}/round/99999`);
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    });

    // Test 7 : GET /stats renvoie les métriques de transactions enregistrées
    await assertTest("GET /stats reflète les mesures de gas et latence", async () => {
      const res = await fetch(`${baseUrl}/stats`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      if (data.total_records < 1) throw new Error(`Expected at least 1 record in stats, got ${data.total_records}`);
      if (!data.gas_used.avg || !data.confirmation_ms.avg) throw new Error(`Champs stats invalides: ${JSON.stringify(data)}`);
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (hardhatNodeProcess) {
      console.log("[Test] Arrêt du nœud Hardhat local de test...");
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", hardhatNodeProcess.pid, "/f", "/t"]);
      } else {
        hardhatNodeProcess.kill("SIGTERM");
      }
    }
  }

  console.log(`\n=== Résultat des tests d'intégration du Pont : ${passed} réussis, ${failed} échoués ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erreur critique d'exécution des tests du pont :", err);
  process.exit(1);
});
