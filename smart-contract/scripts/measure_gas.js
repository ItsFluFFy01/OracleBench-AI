const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=== Mesure du Gas et de la Latence de Confirmation (50 rounds) ===");
  console.log("Réseau :", hre.network.name);

  const OracleBench = await hre.ethers.getContractFactory("OracleBench");
  let oracleBench;

  const deploymentPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  let reusedExisting = false;

  if (hre.network.name !== "hardhat" && fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const code = await hre.ethers.provider.getCode(deployment.address);
    if (code !== "0x") {
      oracleBench = await hre.ethers.getContractAt("OracleBench", deployment.address);
      console.log(`Utilisation du contrat existant à l'adresse : ${deployment.address}`);
      reusedExisting = true;
    }
  }

  if (!reusedExisting) {
    oracleBench = await OracleBench.deploy();
    await oracleBench.waitForDeployment();
    console.log(`Contrat déployé à l'adresse : ${await oracleBench.getAddress()}`);
  }

  const resultsDir = path.join(__dirname, "..", "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const measurements = [];
  const latestRoundOnChain = Number(await oracleBench.latestRoundId());
  const startRound = latestRoundOnChain > 0 ? latestRoundOnChain + 1 : 1;
  const numRounds = 50;

  console.log(`Enregistrement de ${numRounds} rounds à partir du round ${startRound}...`);

  for (let i = 0; i < numRounds; i++) {
    const roundId = startRound + i;
    // Valeur simulée avec variations régulières
    const finalValue = Math.round((100 + Math.sin(i / 3) * 5 + (Math.random() - 0.5) * 2) * 1e6);
    // Confiance supérieure au seuil 7000
    const confidence = Math.floor(7500 + Math.random() * 2000);
    const proofHash = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(`benchmark-round-${roundId}-${Date.now()}`)
    );

    const startTime = Date.now();
    const tx = await oracleBench.updateOracleValue(roundId, finalValue, confidence, proofHash);
    const receipt = await tx.wait();
    const confirmationMs = Date.now() - startTime;
    const gasUsed = Number(receipt.gasUsed);

    measurements.push({
      round_id: roundId,
      gas_used: gasUsed,
      confirmation_ms: confirmationMs,
    });

    if ((i + 1) % 10 === 0) {
      console.log(`  -> ${i + 1}/${numRounds} rounds enregistrés (dernier gas : ${gasUsed}, latence : ${confirmationMs}ms)`);
    }
  }

  // Écriture du fichier CSV
  const csvPath = path.join(resultsDir, "gas_measurements.csv");
  let csvContent = "round_id,gas_used,confirmation_ms\n";
  measurements.forEach((m) => {
    csvContent += `${m.round_id},${m.gas_used},${m.confirmation_ms}\n`;
  });
  fs.writeFileSync(csvPath, csvContent);
  console.log(`\nMesures exportées dans : ${csvPath}`);

  // Calculs statistiques
  const gasValues = measurements.map((m) => m.gas_used);
  const latencyValues = measurements.map((m) => m.confirmation_ms);

  const avgGas = (gasValues.reduce((a, b) => a + b, 0) / gasValues.length).toFixed(1);
  const minGas = Math.min(...gasValues);
  const maxGas = Math.max(...gasValues);

  const avgLatency = (latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length).toFixed(1);
  const minLatency = Math.min(...latencyValues);
  const maxLatency = Math.max(...latencyValues);

  console.log("\n--- STATISTIQUES FINALES ---");
  console.log(`Gas Utilisé :      Moyenne = ${avgGas} | Min = ${minGas} | Max = ${maxGas}`);
  console.log(`Confirmation (ms): Moyenne = ${avgLatency} ms | Min = ${minLatency} ms | Max = ${maxLatency} ms`);
}

main().catch((error) => {
  console.error("Erreur lors de la mesure de gas :", error);
  process.exitCode = 1;
});
