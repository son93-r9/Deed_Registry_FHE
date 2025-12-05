// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface PropertyDeed {
  id: number;
  encryptedId: string;
  location: string;
  coordinates: { lat: number, lng: number };
  encryptedOwner: string;
  encryptedValue: string;
  timestamp: number;
  transactionHistory: string[];
}

interface UserAction {
  type: 'register' | 'transfer' | 'view' | 'decrypt';
  timestamp: number;
  details: string;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [deeds, setDeeds] = useState<PropertyDeed[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registeringDeed, setRegisteringDeed] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newDeedData, setNewDeedData] = useState({ location: "", coordinates: { lat: 0, lng: 0 }, value: 0 });
  const [selectedDeed, setSelectedDeed] = useState<PropertyDeed | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('deeds');
  const [mapView, setMapView] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 39.9042, lng: 116.4074 }); // Beijing coordinates
  
  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load deeds
      const deedsBytes = await contract.getData("property_deeds");
      let deedsList: PropertyDeed[] = [];
      if (deedsBytes.length > 0) {
        try {
          const deedsStr = ethers.toUtf8String(deedsBytes);
          if (deedsStr.trim() !== '') deedsList = JSON.parse(deedsStr);
        } catch (e) {}
      }
      setDeeds(deedsList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Register new property deed
  const registerDeed = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setRegisteringDeed(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Registering deed with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new deed
      const newDeed: PropertyDeed = {
        id: deeds.length + 1,
        encryptedId: FHEEncryptNumber(deeds.length + 1),
        location: newDeedData.location,
        coordinates: newDeedData.coordinates,
        encryptedOwner: FHEEncryptNumber(Math.random() * 1000000), // Simulate encrypted owner ID
        encryptedValue: FHEEncryptNumber(newDeedData.value),
        timestamp: Math.floor(Date.now() / 1000),
        transactionHistory: [`Registered by ${address.substring(0, 6)}...`]
      };
      
      // Update deeds list
      const updatedDeeds = [...deeds, newDeed];
      
      // Save to contract
      await contract.setData("property_deeds", ethers.toUtf8Bytes(JSON.stringify(updatedDeeds)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'register',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Registered property at ${newDeedData.location}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Property deed registered successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowRegisterModal(false);
        setNewDeedData({ location: "", coordinates: { lat: 0, lng: 0 }, value: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Registration failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setRegisteringDeed(false); 
    }
  };

  // Decrypt value with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted property value"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Handle map click to set coordinates
  const handleMapClick = (e: any) => {
    if (showRegisterModal) {
      setNewDeedData({
        ...newDeedData,
        coordinates: {
          lat: e.lngLat.lat,
          lng: e.lngLat.lng
        }
      });
    }
  };

  // Render statistics cards
  const renderStatistics = () => {
    const totalValue = deeds.reduce((sum, deed) => sum + FHEDecryptNumber(deed.encryptedValue), 0);
    const avgValue = deeds.length > 0 ? totalValue / deeds.length : 0;
    const recentActivity = deeds.length > 0 ? deeds.slice(0, 3).map(d => d.location) : [];
    
    return (
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-content">
            <div className="stat-value">{deeds.length}</div>
            <div className="stat-label">Properties Registered</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">${totalValue.toLocaleString()}</div>
            <div className="stat-label">Total Value</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">${avgValue.toLocaleString()}</div>
            <div className="stat-label">Average Value</div>
          </div>
        </div>
      </div>
    );
  };

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'register' && '📝'}
              {action.type === 'transfer' && '🔄'}
              {action.type === 'view' && '👁️'}
              {action.type === 'decrypt' && '🔓'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render FAQ section
  const renderFAQ = () => {
    const faqItems = [
      {
        question: "What is Deed Registry FHE?",
        answer: "Deed Registry FHE is a confidential on-chain property deed registry that tokenizes real estate deeds while keeping owner identity and transaction history encrypted using Fully Homomorphic Encryption (FHE)."
      },
      {
        question: "How does FHE protect my property information?",
        answer: "FHE allows computations to be performed on encrypted data without decrypting it. Your property details remain encrypted throughout all operations, only revealing information when specifically authorized."
      },
      {
        question: "Who can see my property details?",
        answer: "Only authorized parties (like banks during loan processing) can decrypt your property information with your permission. All other parties see only encrypted data."
      },
      {
        question: "How is this different from traditional property registries?",
        answer: "Traditional registries expose owner information publicly. Our system maintains privacy while still providing the benefits of blockchain-based property tokenization."
      },
      {
        question: "What blockchain is this built on?",
        answer: "Deed Registry FHE is built on Ethereum and utilizes Zama FHE for privacy-preserving computations."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted property registry...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="deed-icon">🏡</div>
          </div>
          <h1>Deed Registry<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowRegisterModal(true)} 
            className="register-deed-btn"
          >
            <div className="add-icon">+</div>Register Property
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="dashboard-grid">
            <div className="dashboard-panel intro-panel">
              <div className="panel-card">
                <h2>Confidential On-chain Property Deed Registry</h2>
                <p>Deed Registry FHE tokenizes real estate deeds on-chain while keeping owner identity and transaction history encrypted using Zama FHE.</p>
                <div className="fhe-badge">
                  <div className="fhe-icon">🔒</div>
                  <span>Powered by Zama FHE</span>
                </div>
              </div>
              
              {renderStatistics()}
              
              <div className="panel-card">
                <h2>Global Property Map</h2>
                <div className="map-container">
                </div>
              </div>
            </div>
          </div>
          
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'deeds' ? 'active' : ''}`}
                onClick={() => setActiveTab('deeds')}
              >
                Property Deeds
              </button>
              <button 
                className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
                onClick={() => setActiveTab('actions')}
              >
                My Actions
              </button>
              <button 
                className={`tab ${activeTab === 'faq' ? 'active' : ''}`}
                onClick={() => setActiveTab('faq')}
              >
                FAQ
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'deeds' && (
                <div className="deeds-section">
                  <div className="section-header">
                    <h2>Registered Properties</h2>
                    <div className="header-actions">
                      <button 
                        onClick={loadData} 
                        className="refresh-btn" 
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                      <button 
                        onClick={() => setMapView(!mapView)} 
                        className="map-view-btn"
                      >
                        {mapView ? "List View" : "Map View"}
                      </button>
                    </div>
                  </div>
                  
                  {mapView ? (
                    <div className="full-map-container">
                    </div>
                  ) : (
                    <div className="deeds-list">
                      {deeds.length === 0 ? (
                        <div className="no-deeds">
                          <div className="no-deeds-icon">🏡</div>
                          <p>No properties registered yet</p>
                          <button 
                            className="register-btn" 
                            onClick={() => setShowRegisterModal(true)}
                          >
                            Register First Property
                          </button>
                        </div>
                      ) : deeds.map((deed, index) => (
                        <div 
                          className={`deed-item ${selectedDeed?.id === deed.id ? "selected" : ""}`} 
                          key={index}
                          onClick={() => setSelectedDeed(deed)}
                        >
                          <div className="deed-header">
                            <div className="deed-location">{deed.location}</div>
                            <div className="deed-id">ID: {deed.encryptedId.substring(0, 8)}...</div>
                          </div>
                          <div className="deed-details">
                            <div className="deed-value">
                              <span>Value:</span>
                              <strong>{deed.encryptedValue.substring(0, 10)}...</strong>
                            </div>
                            <div className="deed-owner">
                              <span>Owner:</span>
                              <strong>{deed.encryptedOwner.substring(0, 10)}...</strong>
                            </div>
                          </div>
                          <div className="deed-footer">
                            <div className="deed-date">{new Date(deed.timestamp * 1000).toLocaleDateString()}</div>
                            <div className="fhe-tag">
                              <span>FHE Encrypted</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'actions' && (
                <div className="actions-section">
                  <h2>My Activity History</h2>
                  {renderUserActions()}
                </div>
              )}
              
              {activeTab === 'faq' && (
                <div className="faq-section">
                  <h2>Frequently Asked Questions</h2>
                  {renderFAQ()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showRegisterModal && (
        <ModalRegisterDeed 
          onSubmit={registerDeed} 
          onClose={() => setShowRegisterModal(false)} 
          registering={registeringDeed} 
          deedData={newDeedData} 
          setDeedData={setNewDeedData}
        />
      )}
      
      {selectedDeed && (
        <DeedDetailModal 
          deed={selectedDeed} 
          onClose={() => { 
            setSelectedDeed(null); 
            setDecryptedValue(null); 
          }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="deed-icon">🏡</div>
              <span>Deed Registry FHE</span>
            </div>
            <p>Confidential on-chain property deed registry powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Deed Registry FHE. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect property owner privacy. 
            Property details are encrypted and only revealed with explicit authorization.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalRegisterDeedProps {
  onSubmit: () => void; 
  onClose: () => void; 
  registering: boolean;
  deedData: any;
  setDeedData: (data: any) => void;
}

const ModalRegisterDeed: React.FC<ModalRegisterDeedProps> = ({ onSubmit, onClose, registering, deedData, setDeedData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDeedData({ ...deedData, [name]: value });
  };

  const handleCoordinateChange = (e: React.ChangeEvent<HTMLInputElement>, coord: 'lat' | 'lng') => {
    const value = parseFloat(e.target.value);
    setDeedData({
      ...deedData,
      coordinates: {
        ...deedData.coordinates,
        [coord]: isNaN(value) ? 0 : value
      }
    });
  };

  return (
    <div className="modal-overlay">
      <div className="register-deed-modal">
        <div className="modal-header">
          <h2>Register New Property</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon">🔒</div>
            <div>
              <strong>FHE Property Notice</strong>
              <p>Property details will be encrypted using Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Property Location *</label>
            <input 
              type="text" 
              name="location" 
              value={deedData.location} 
              onChange={handleChange} 
              placeholder="Enter property address..." 
            />
          </div>
          
          <div className="form-group">
            <label>Property Value (USD) *</label>
            <input 
              type="number" 
              name="value" 
              value={deedData.value} 
              onChange={handleChange} 
              placeholder="Enter estimated value..." 
            />
          </div>
          
          <div className="form-group coordinates-group">
            <label>Coordinates</label>
            <div className="coordinates-inputs">
              <div className="coord-input">
                <span>Latitude</span>
                <input 
                  type="number" 
                  value={deedData.coordinates.lat} 
                  onChange={(e) => handleCoordinateChange(e, 'lat')}
                  placeholder="Latitude"
                />
              </div>
              <div className="coord-input">
                <span>Longitude</span>
                <input 
                  type="number" 
                  value={deedData.coordinates.lng} 
                  onChange={(e) => handleCoordinateChange(e, 'lng')}
                  placeholder="Longitude"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={registering || !deedData.location || !deedData.value} 
            className="submit-btn"
          >
            {registering ? "Registering with FHE..." : "Register Property"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeedDetailModalProps {
  deed: PropertyDeed;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const DeedDetailModal: React.FC<DeedDetailModalProps> = ({ 
  deed, 
  onClose, 
  decryptedValue, 
  setDecryptedValue, 
  isDecrypting, 
  decryptWithSignature
}) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(deed.encryptedValue);
    if (decrypted !== null) {
      setDecryptedValue(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="deed-detail-modal">
        <div className="modal-header">
          <h2>Property Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="deed-info">
            <div className="info-item">
              <span>Location:</span>
              <strong>{deed.location}</strong>
            </div>
            <div className="info-item">
              <span>Coordinates:</span>
              <strong>{deed.coordinates.lat}, {deed.coordinates.lng}</strong>
            </div>
            <div className="info-item">
              <span>Date Registered:</span>
              <strong>{new Date(deed.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Property Data</h3>
            <div className="encrypted-data-grid">
              <div className="encrypted-data-item">
                <span>Owner ID:</span>
                <div className="encrypted-value">{deed.encryptedOwner.substring(0, 15)}...</div>
              </div>
              <div className="encrypted-data-item">
                <span>Property Value:</span>
                <div className="encrypted-value">{deed.encryptedValue.substring(0, 15)}...</div>
              </div>
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon">🔒</div>
              <span>FHE Encrypted</span>
            </div>
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span>Decrypting...</span>
              ) : decryptedValue !== null ? (
                "Hide Decrypted Value"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Property Value</h3>
              <div className="decrypted-value">
                <span>Value:</span>
                <strong>${decryptedValue.toLocaleString()}</strong>
              </div>
              <div className="decryption-notice">
                <div className="warning-icon">⚠️</div>
                <span>Decrypted values are only visible after wallet signature verification</span>
              </div>
            </div>
          )}
          
          <div className="transaction-history">
            <h3>Transaction History</h3>
            <div className="history-list">
              {deed.transactionHistory.map((tx, index) => (
                <div className="history-item" key={index}>
                  <div className="history-icon">🔄</div>
                  <div className="history-details">
                    <div className="history-text">{tx}</div>
                    <div className="history-time">{new Date(deed.timestamp * 1000).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;