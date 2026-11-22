const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("--- Déploiement OracleBench ---");
  console.log("Réseau cible :", hre.network.name);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Compte déployeur :", deployer.address);

  const OracleBench = await hre.ethers.getContractFactory("OracleBench");
  const oracleBench = await OracleBench.deploy();
  await oracleBench.waitForDeployment();

  const contractAddress = await oracleBench.getAddress();
  console.log("Contrat OracleBench déployé à :", contractAddress);

  // Préparation du dossier de déploiement
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Lecture de l'ABI compilée
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "OracleBench.sol",
    "OracleBench.json"
  );

  let abi = [];
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    abi = artifact.abi;
  }

  const deploymentData = {
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    address: contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    abiPath: "./artifacts/contracts/OracleBench.sol/OracleBench.json",
    abi: abi,
  };

  const outputFileName = hre.network.name === "localhost" ? "localhost.json" : `${hre.network.name}.json`;
  const outputPath = path.join(deploymentsDir, outputFileName);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log("Métadonnées sauvegardées dans :", outputPath);
}

main().catch((error) => {
  console.error("Erreur de déploiement :", error);
  process.exitCode = 1;
});
