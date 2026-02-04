import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Check, X, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useSkinStore } from '../stores/skinStore';
import { SKINS, type Skin } from '../data/skins';
import styles from './RobotShop.module.css';

export function RobotShop() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isDevUser } = useAuthStore();
  const devModeActive = isDevUser();

  const {
    selectedSkin,
    purchasedSkins,
    starsSpent,
    isLoading,
    setSelectedSkin,
    purchaseSkin,
    fetchSkins,
  } = useSkinStore();

  const [confirmPurchase, setConfirmPurchase] = useState<Skin | null>(null);
  const [successPurchase, setSuccessPurchase] = useState<Skin | null>(null);

  // Redirect non-dev users to home
  useEffect(() => {
    if (!devModeActive) {
      navigate('/');
    }
  }, [devModeActive, navigate]);

  // Fetch skins on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSkins();
    }
  }, [isAuthenticated, fetchSkins]);

  const totalStars = user?.classicStars || 0;
  const availableStars = totalStars - starsSpent;

  const handlePurchase = async (skin: Skin) => {
    if (purchasedSkins.includes(skin.id)) return;
    if (skin.cost > availableStars) return;

    setConfirmPurchase(skin);
  };

  const confirmPurchaseSkin = async () => {
    if (!confirmPurchase) return;

    const skin = confirmPurchase;
    await purchaseSkin(skin.id, skin.cost);
    setConfirmPurchase(null);
    setSuccessPurchase(skin);
  };

  const handleSelect = (skin: Skin) => {
    if (!purchasedSkins.includes(skin.id)) return;
    setSelectedSkin(skin.id);
  };

  const getSkinStatus = (skin: Skin): 'selected' | 'owned' | 'buyable' | 'insufficient' => {
    if (skin.id === selectedSkin && purchasedSkins.includes(skin.id)) return 'selected';
    if (purchasedSkins.includes(skin.id)) return 'owned';
    if (skin.cost <= availableStars) return 'buyable';
    return 'insufficient';
  };

  const getButtonText = (skin: Skin): string => {
    const status = getSkinStatus(skin);
    if (status === 'selected') return 'Selected';
    if (status === 'owned') return 'Select';
    if (status === 'buyable') return 'Buy';
    const needed = skin.cost - availableStars;
    return `Need ${needed}`;
  };

  const handleButtonClick = (skin: Skin) => {
    const status = getSkinStatus(skin);
    if (status === 'selected') return; // Already selected, do nothing
    if (status === 'owned') {
      handleSelect(skin);
    } else if (status === 'buyable') {
      handlePurchase(skin);
    }
    // Do nothing for insufficient
  };

  if (!devModeActive) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>Customize Your Robot</h1>
      </header>

      {/* Stars Card */}
      <div className={styles.starsCard}>
        <h2 className={styles.starsTitle}>Your Stars</h2>
        <div className={styles.totalStars}>
          <Star size={24} className={styles.starIcon} fill="currentColor" />
          Total: {totalStars}
        </div>
        <div className={styles.starsBreakdown}>
          <span className={styles.spentStars}>Spent: {starsSpent}</span>
          <span>•</span>
          <span className={styles.availableStars}>Available: {availableStars}</span>
        </div>
      </div>

      {/* Skins Grid */}
      <h2 className={styles.sectionTitle}>Available Skins</h2>
      <div className={styles.skinsGrid}>
        {SKINS.map((skin) => {
          const status = getSkinStatus(skin);
          const isSelected = status === 'selected';
          return (
            <div
              key={skin.id}
              className={`${styles.skinCard} ${isSelected ? styles.skinCardSelected : ''}`}
            >
              <div className={styles.skinImageWrapper}>
                <img src={skin.image} alt={skin.name} className={styles.skinImage} />
                {isSelected && (
                  <div className={styles.selectedBadge}>
                    <Check size={12} />
                  </div>
                )}
              </div>
              <h3 className={styles.skinName}>{skin.name}</h3>
              <div className={`${styles.skinCost} ${skin.cost === 0 ? styles.skinCostFree : ''}`}>
                {skin.cost === 0 ? (
                  'FREE'
                ) : (
                  <>
                    {skin.cost} <Star size={14} fill="currentColor" />
                  </>
                )}
              </div>
              <button
                className={`${styles.buyButton} ${
                  status === 'selected'
                    ? styles.buyButtonSelected
                    : status === 'owned'
                    ? styles.buyButtonOwned
                    : status === 'buyable'
                    ? styles.buyButtonPurchase
                    : styles.buyButtonInsufficient
                }`}
                onClick={() => handleButtonClick(skin)}
                disabled={status === 'selected' || status === 'insufficient'}
              >
                {(status === 'selected' || status === 'owned') && (
                  <span className={styles.ownedIcon}>
                    <Check size={14} />
                  </span>
                )}
                {getButtonText(skin)}
              </button>
            </div>
          );
        })}
      </div>

      {/* Purchase Confirmation Popup */}
      <AnimatePresence>
        {confirmPurchase && (
          <motion.div
            className={styles.popupOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmPurchase(null)}
          >
            <motion.div
              className={styles.popupContent}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.popupClose}
                onClick={() => setConfirmPurchase(null)}
              >
                <X size={20} />
              </button>
              <div className={styles.popupSkinPreview}>
                <img
                  src={confirmPurchase.image}
                  alt={confirmPurchase.name}
                  className={styles.popupSkinImage}
                />
              </div>
              <h3>Purchase {confirmPurchase.name}?</h3>
              <p>
                This will cost <strong>{confirmPurchase.cost} stars</strong>. You'll have{' '}
                <strong>{availableStars - confirmPurchase.cost}</strong> stars remaining.
              </p>
              <div className={styles.popupButtons}>
                <button
                  className={styles.popupCancelButton}
                  onClick={() => setConfirmPurchase(null)}
                >
                  Cancel
                </button>
                <button
                  className={styles.popupConfirmButton}
                  onClick={confirmPurchaseSkin}
                >
                  Buy
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Purchase Success Popup */}
      <AnimatePresence>
        {successPurchase && (
          <motion.div
            className={styles.popupOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSuccessPurchase(null)}
          >
            <motion.div
              className={styles.popupContent}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.popupClose}
                onClick={() => setSuccessPurchase(null)}
              >
                <X size={20} />
              </button>
              <ShoppingBag size={48} className={styles.popupIcon} />
              <h3>Purchase Complete!</h3>
              <p>
                You now own <strong>{successPurchase.name}</strong>. Select it below to use it in
                the game!
              </p>
              <button
                className={styles.popupButton}
                onClick={() => {
                  // Auto-select the newly purchased skin
                  setSelectedSkin(successPurchase.id);
                  setSuccessPurchase(null);
                }}
              >
                Use Now
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
