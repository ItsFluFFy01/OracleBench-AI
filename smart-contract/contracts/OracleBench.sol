// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OracleBench
 * @author Personne C (OracleBench-AI Team)
 * @notice Smart Contract d'enregistrement et d'exposition des résultats agrégés d'oracles.
 * @dev Ce contrat ne réalise aucun calcul de Machine Learning.
 *      Il valide le niveau de confiance, applique un contrôle d'accès
 *      et stocke les données de preuve de chaque round de benchmark.
 */
contract OracleBench {
    /// @notice Structure représentant l'enregistrement immuable d'un round
    struct RoundRecord {
        int256 finalValue;      // Valeur décimale mise à l'échelle (valeur * 1e6)
        uint256 confidence;     // Score de confiance mis à l'échelle (confiance * 10000, ex: 8500 = 0.85)
        uint256 timestamp;      // Horodatage du bloc de validation (secondes Unix)
        bytes32 proofHash;      // Hash cryptographique de preuve d'intégrité
        bool exists;            // Indicateur d'existence du round
    }

    /// @notice Propriétaire du contrat (administrateur)
    address public owner;

    /// @notice Seuil minimal de confiance requis pour valider et enregistrer un round (base 10000)
    /// @dev Par défaut à 7000 (équivalent à 0.70 ou 70%)
    uint256 public confidenceThreshold;

    /// @notice Identifiant du dernier round enregistré avec succès
    uint256 public latestRoundId;

    /// @notice Registre des enregistrements par identifiant de round
    mapping(uint256 => RoundRecord) private _rounds;

    /// @notice Liste blanche des adresses autorisées à soumettre des résultats (ex: Pont Node.js)
    mapping(address => bool) public isAuthorizedUpdater;

    // --- Custom Errors ---
    error Unauthorized(address caller);
    error ConfidenceTooLow(uint256 confidence, uint256 threshold);
    error RoundAlreadyRecorded(uint256 roundId);
    error InvalidAddress();
    error InvalidThreshold(uint256 threshold);

    // --- Events ---
    event ValueUpdated(
        uint256 indexed roundId,
        int256 finalValue,
        uint256 confidence,
        bytes32 proofHash,
        uint256 timestamp
    );
    event ConfidenceThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event UpdaterAdded(address indexed updater);
    event UpdaterRemoved(address indexed updater);

    // --- Modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != owner && !isAuthorizedUpdater[msg.sender]) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    /**
     * @notice Initialise le contrat avec le déployeur comme propriétaire et le seuil par défaut.
     */
    constructor() {
        owner = msg.sender;
        isAuthorizedUpdater[msg.sender] = true;
        confidenceThreshold = 7000; // 0.70 en base 10000
    }

    /**
     * @notice Modifie le seuil de confiance minimal requis.
     * @dev Seul le propriétaire peut ajuster ce seuil.
     * @param newThreshold Nouveau seuil entre 0 et 10000.
     */
    function setConfidenceThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold > 10000) {
            revert InvalidThreshold(newThreshold);
        }
        uint256 oldThreshold = confidenceThreshold;
        confidenceThreshold = newThreshold;
        emit ConfidenceThresholdUpdated(oldThreshold, newThreshold);
    }

    /**
     * @notice Ajoute une adresse autorisée à mettre à jour les résultats.
     * @param updater Adresse à autoriser.
     */
    function addUpdater(address updater) external onlyOwner {
        if (updater == address(0)) {
            revert InvalidAddress();
        }
        isAuthorizedUpdater[updater] = true;
        emit UpdaterAdded(updater);
    }

    /**
     * @notice Retire l'autorisation d'une adresse.
     * @param updater Adresse dont l'accès est révoqué.
     */
    function removeUpdater(address updater) external onlyOwner {
        isAuthorizedUpdater[updater] = false;
        emit UpdaterRemoved(updater);
    }

    /**
     * @notice Enregistre le résultat final validé d'un round d'oracle.
     * @dev Rejette si le round existe déjà ou si la confiance est sous le seuil requis.
     * @param roundId Identifiant unique séquentiel du round.
     * @param finalValue Valeur agrégée finale mise à l'échelle (* 1e6).
     * @param confidence Score de confiance global mis à l'échelle (* 10000).
     * @param proofHash Hash cryptographique (bytes32) prouvant l'intégrité du dataset.
     */
    function updateOracleValue(
        uint256 roundId,
        int256 finalValue,
        uint256 confidence,
        bytes32 proofHash
    ) external onlyAuthorized {
        if (_rounds[roundId].exists) {
            revert RoundAlreadyRecorded(roundId);
        }
        if (confidence < confidenceThreshold) {
            revert ConfidenceTooLow(confidence, confidenceThreshold);
        }

        _rounds[roundId] = RoundRecord({
            finalValue: finalValue,
            confidence: confidence,
            timestamp: block.timestamp,
            proofHash: proofHash,
            exists: true
        });

        if (roundId > latestRoundId) {
            latestRoundId = roundId;
        }

        emit ValueUpdated(
            roundId,
            finalValue,
            confidence,
            proofHash,
            block.timestamp
        );
    }

    /**
     * @notice Récupère les données d'un round enregistré.
     * @param roundId Identifiant du round à consulter.
     * @return finalValue Valeur agrégée (* 1e6).
     * @return confidence Score de confiance (* 10000).
     * @return timestamp Horodatage de validation.
     * @return proofHash Hash de preuve du round.
     * @return exists Vrai si le round a bien été enregistré.
     */
    function getRound(uint256 roundId)
        external
        view
        returns (
            int256 finalValue,
            uint256 confidence,
            uint256 timestamp,
            bytes32 proofHash,
            bool exists
        )
    {
        RoundRecord memory record = _rounds[roundId];
        return (
            record.finalValue,
            record.confidence,
            record.timestamp,
            record.proofHash,
            record.exists
        );
    }
}
