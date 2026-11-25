const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OracleBench Smart Contract", function () {
  let oracleBench;
  let owner;
  let updater;
  let unauthorizedUser;

  // Données de test réutilisables
  const roundId = 1;
  const finalValue = 105421900; // 105.4219 * 1e6
  const validConfidence = 8500;  // 0.85 * 10000
  const thresholdConfidence = 7000; // Cas limite (seuil par défaut)
  const lowConfidence = 6500;    // 0.65 * 10000 < 7000
  const proofHash = ethers.keccak256(ethers.toUtf8Bytes("round-1-proof-dataset"));

  beforeEach(async function () {
    [owner, updater, unauthorizedUser] = await ethers.getSigners();

    const OracleBenchFactory = await ethers.getContractFactory("OracleBench");
    oracleBench = await OracleBenchFactory.deploy();
    await oracleBench.waitForDeployment();

    // On autorise explicitement le compte updater
    await oracleBench.connect(owner).addUpdater(updater.address);
  });

  describe("Initialisation & Contrôle d'accès", function () {
    it("doit initialiser l'owner et le seuil de confiance par défaut à 7000", async function () {
      expect(await oracleBench.owner()).to.equal(owner.address);
      expect(await oracleBench.confidenceThreshold()).to.equal(7000);
      expect(await oracleBench.isAuthorizedUpdater(owner.address)).to.be.true;
      expect(await oracleBench.isAuthorizedUpdater(updater.address)).to.be.true;
    });

    it("5. doit permettre le changement de seuil par l'owner et refuser pour un non-owner", async function () {
      // Succès par l'owner
      await expect(oracleBench.connect(owner).setConfidenceThreshold(8000))
        .to.emit(oracleBench, "ConfidenceThresholdUpdated")
        .withArgs(7000, 8000);
      expect(await oracleBench.confidenceThreshold()).to.equal(8000);

      // Rejet par un non-owner
      await expect(
        oracleBench.connect(unauthorizedUser).setConfidenceThreshold(8500)
      ).to.be.revertedWithCustomError(oracleBench, "Unauthorized")
       .withArgs(unauthorizedUser.address);
    });

    it("doit permettre d'ajouter et de révoquer un updater", async function () {
      const [, , , extraUser] = await ethers.getSigners();

      await expect(oracleBench.connect(owner).addUpdater(extraUser.address))
        .to.emit(oracleBench, "UpdaterAdded")
        .withArgs(extraUser.address);
      expect(await oracleBench.isAuthorizedUpdater(extraUser.address)).to.be.true;

      await expect(oracleBench.connect(owner).removeUpdater(extraUser.address))
        .to.emit(oracleBench, "UpdaterRemoved")
        .withArgs(extraUser.address);
      expect(await oracleBench.isAuthorizedUpdater(extraUser.address)).to.be.false;
    });
  });

  describe("Enregistrement des rounds (updateOracleValue)", function () {
    it("1. doit permettre une mise à jour valide par une adresse autorisée", async function () {
      await expect(
        oracleBench.connect(updater).updateOracleValue(roundId, finalValue, validConfidence, proofHash)
      ).to.not.be.reverted;

      const record = await oracleBench.getRound(roundId);
      expect(record.exists).to.be.true;
      expect(record.finalValue).to.equal(finalValue);
      expect(record.confidence).to.equal(validConfidence);
      expect(record.proofHash).to.equal(proofHash);
      expect(await oracleBench.latestRoundId()).to.equal(roundId);
    });

    it("2. doit rejeter si l'appelant n'est pas autorisé", async function () {
      await expect(
        oracleBench.connect(unauthorizedUser).updateOracleValue(roundId, finalValue, validConfidence, proofHash)
      ).to.be.revertedWithCustomError(oracleBench, "Unauthorized")
       .withArgs(unauthorizedUser.address);
    });

    it("3. doit rejeter si la confiance est inférieure au seuil (custom error ConfidenceTooLow)", async function () {
      await expect(
        oracleBench.connect(updater).updateOracleValue(roundId, finalValue, lowConfidence, proofHash)
      ).to.be.revertedWithCustomError(oracleBench, "ConfidenceTooLow")
       .withArgs(lowConfidence, 7000);
    });

    it("4. doit accepter lorsque la confiance est égale au seuil (cas limite)", async function () {
      await expect(
        oracleBench.connect(updater).updateOracleValue(roundId, finalValue, thresholdConfidence, proofHash)
      ).to.not.be.reverted;

      const record = await oracleBench.getRound(roundId);
      expect(record.exists).to.be.true;
      expect(record.confidence).to.equal(thresholdConfidence);
    });

    it("6. doit rejeter un round déjà enregistré (custom error RoundAlreadyRecorded)", async function () {
      // Premier enregistrement
      await oracleBench.connect(updater).updateOracleValue(roundId, finalValue, validConfidence, proofHash);

      // Tentative de ré-enregistrement du même round
      await expect(
        oracleBench.connect(updater).updateOracleValue(roundId, finalValue + 100, validConfidence, proofHash)
      ).to.be.revertedWithCustomError(oracleBench, "RoundAlreadyRecorded")
       .withArgs(roundId);
    });

    it("7. doit émettre l'événement ValueUpdated avec les bons arguments", async function () {
      const tx = await oracleBench.connect(updater).updateOracleValue(roundId, finalValue, validConfidence, proofHash);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(oracleBench, "ValueUpdated")
        .withArgs(roundId, finalValue, validConfidence, proofHash, block.timestamp);
    });

    it("8. doit permettre une lecture correcte via getRound et retourner exists=false pour un round inconnu", async function () {
      // Avant enregistrement
      const notFound = await oracleBench.getRound(999);
      expect(notFound.exists).to.be.false;
      expect(notFound.finalValue).to.equal(0);

      // Après enregistrement
      await oracleBench.connect(owner).updateOracleValue(42, -5000000, 9200, proofHash);
      const found = await oracleBench.getRound(42);
      expect(found.exists).to.be.true;
      expect(found.finalValue).to.equal(-5000000);
      expect(found.confidence).to.equal(9200);
      expect(found.proofHash).to.equal(proofHash);
      expect(found.timestamp).to.be.greaterThan(0);
      expect(await oracleBench.latestRoundId()).to.equal(42);
    });
  });
});
