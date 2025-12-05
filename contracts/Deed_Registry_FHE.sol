pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DeedRegistryFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public batchClosed;
    mapping(uint256 => uint256) public batchPropertyCount;

    struct EncryptedDeed {
        euint32 encryptedOwnerIdentity;
        euint32 encryptedPropertyId;
        euint32 encryptedTransactionCount;
        euint32 encryptedLastTransactionTimestamp;
        euint32 encryptedPropertyValue;
    }
    mapping(uint256 => mapping(uint256 => EncryptedDeed)) public deeds; // batchId => deedIndex => EncryptedDeed

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event CooldownSecondsSet(uint256 indexed oldCooldown, uint256 indexed newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event DeedRegistered(address indexed provider, uint256 indexed batchId, uint256 indexed deedIndex);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 propertyValueSum);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosedOrInvalid();
    error InvalidBatchId();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier respectCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            paused = true;
            emit ContractPaused(msg.sender);
        } else {
            paused = false;
            emit ContractUnpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldown, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchClosed[currentBatchId] = false;
        batchPropertyCount[currentBatchId] = 0;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatchId();
        if (batchClosed[batchId]) revert BatchClosedOrInvalid();
        batchClosed[batchId] = true;
        emit BatchClosed(batchId);
    }

    function registerDeed(
        euint32 encryptedOwnerIdentity,
        euint32 encryptedPropertyId,
        euint32 encryptedTransactionCount,
        euint32 encryptedLastTransactionTimestamp,
        euint32 encryptedPropertyValue
    ) external onlyProvider whenNotPaused respectCooldown {
        _initIfNeeded(encryptedOwnerIdentity);
        _initIfNeeded(encryptedPropertyId);
        _initIfNeeded(encryptedTransactionCount);
        _initIfNeeded(encryptedLastTransactionTimestamp);
        _initIfNeeded(encryptedPropertyValue);

        if (currentBatchId == 0 || batchClosed[currentBatchId]) {
            revert BatchClosedOrInvalid();
        }

        uint256 deedIndex = batchPropertyCount[currentBatchId]++;
        deeds[currentBatchId][deedIndex] = EncryptedDeed(
            encryptedOwnerIdentity,
            encryptedPropertyId,
            encryptedTransactionCount,
            encryptedLastTransactionTimestamp,
            encryptedPropertyValue
        );

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit DeedRegistered(msg.sender, currentBatchId, deedIndex);
    }

    function requestBatchValueSumDecryption(uint256 batchId) external whenNotPaused respectCooldown {
        if (batchId == 0 || batchId > currentBatchId || !batchClosed[batchId]) {
            revert InvalidBatchId();
        }

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        uint256 numDeeds = batchPropertyCount[batchId];
        bytes32[] memory cts = new bytes32[](numDeeds);

        for (uint256 i = 0; i < numDeeds; ) {
            cts[i] = FHE.toBytes32(deeds[batchId][i].encryptedPropertyValue);
            unchecked {
                i++;
            }
        }

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) {
            revert ReplayAttempt();
        }
        // Security: Replay protection ensures this callback is processed only once.

        uint256 batchId = decryptionContexts[requestId].batchId;
        uint256 numDeeds = batchPropertyCount[batchId];
        bytes32[] memory currentCts = new bytes32[](numDeeds);

        for (uint256 i = 0; i < numDeeds; ) {
            currentCts[i] = FHE.toBytes32(deeds[batchId][i].encryptedPropertyValue);
            unchecked {
                i++;
            }
        }

        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        // Security: State hash verification ensures that the ciphertexts that were requested for decryption
        // have not changed in contract storage since the decryption request was made.
        if (currentStateHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // Security: Proof verification ensures the cleartexts are authentic and correctly decrypted by the FHEVM network.
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        uint256 totalValue = 0;
        for (uint256 i = 0; i < numDeeds; ) {
            totalValue += abi.decode(cleartexts, (uint32)[i];
            unchecked {
                i++;
            }
        }

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, totalValue);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 val) internal {
        if (!val.isInitialized()) {
            revert NotInitialized();
        }
    }

    function _requireInitialized(euint32 val) internal view {
        if (!val.isInitialized()) {
            revert NotInitialized();
        }
    }
}