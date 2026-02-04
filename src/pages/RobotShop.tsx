import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Check, X, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { SKINS, DEFAULT_SKIN_ID, type Skin } from '../data/skins';
import styles from './RobotShop.module.css';

const STORAGE_KEY = 'robozzle-user-skins';

interface UserSkins {
  purchasedSkins: string[];
  starsSpent: number;
}

function loadLocalSkins(): UserSkins {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        purchasedSkins: parsed.purchasedSkins || [DEFAULT_SKIN_ID],
        starsSpent: parsed.starsSpent || 0,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { purchasedSkins: [DEFAULT_SKIN_ID], starsSpent: 0 };
}

function saveLocalSkins(skins: UserSkins): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skins));
}

export function RobotShop() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isDevUser } = useAuthStore();
  const devModeActive = isDevUser();

  const [userSkins, setUserSkins] = useState<UserSkins>(loadLocalSkins);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmPurchase, setConfirmPurchase] = useState<Skin | null>(null);
  const [successPurchase, setSuccessPurchase] = useState<Skin | null>(null);

  // Redirect non-dev users to home
  useEffect(() => {
    if (!devModeActive) {
      navigate('/');
    }
  }, [devModeActive, navigate]);

  // Fetch and merge skins from Supabase
  useEffect(() => {
    async function fetchSkins() {
      if (!isAuthenticated || !user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('user_skins')
          .select('purchased_skins, stars_spent')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          // Merge local and remote (union of purchased skins, max of stars spent)
          const localSkins = loadLocalSkins();
          const remoteSkins = data.purchased_skins || [DEFAULT_SKIN_ID];
          const mergedPurchased = [...new Set([...localSkins.purchasedSkins, ...remoteSkins])];
          const mergedSpent = Math.max(localSkins.starsSpent, data.stars_spent || 0);

          const merged: UserSkins = {
            purchasedSkins: mergedPurchased,
            starsSpent: mergedSpent,
          };

          setUserSkins(merged);
          saveLocalSkins(merged);

          // If local had data remote didn't, push back to Supabase
          const hasNewLocal = localSkins.purchasedSkins.some(s => !remoteSkins.includes(s)) ||
                              localSkins.starsSpent > (data.stars_spent || 0);
          if (hasNewLocal) {
            await supabase
              .from('user_skins')
              .upsert({
                user_id: user.id,
                purchased_skins: mergedPurchased,
                stars_spent: mergedSpent,
              }, { onConflict: 'user_id' });
          }
        }
      } catch (err) {
        console.error('Error fetching skins:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSkins();
  }, [isAuthenticated, user?.id]);

  const totalStars = user?.classicStars || 0;
  const availableStars = totalStars - userSkins.starsSpent;

  const handlePurchase = async (skin: Skin) => {
    if (userSkins.purchasedSkins.includes(skin.id)) return;
    if (skin.cost > availableStars) return;

    setConfirmPurchase(skin);
  };

  const confirmPurchaseSkin = async () => {
    if (!confirmPurchase) return;

    const skin = confirmPurchase;
    const newPurchased = [...userSkins.purchasedSkins, skin.id];
    const newSpent = userSkins.starsSpent + skin.cost;

    const updated: UserSkins = {
      purchasedSkins: newPurchased,
      starsSpent: newSpent,
    };

    // Update local state and storage immediately
    setUserSkins(updated);
    saveLocalSkins(updated);
    setConfirmPurchase(null);
    setSuccessPurchase(skin);

    // Sync to Supabase if authenticated
    if (isAuthenticated && user?.id) {
      try {
        await supabase
          .from('user_skins')
          .upsert({
            user_id: user.id,
            purchased_skins: newPurchased,
            stars_spent: newSpent,
          }, { onConflict: 'user_id' });
      } catch (err) {
        console.error('Error syncing skins to Supabase:', err);
      }
    }
  };

  const getSkinStatus = (skin: Skin): 'owned' | 'buyable' | 'insufficient' => {
    if (userSkins.purchasedSkins.includes(skin.id)) return 'owned';
    if (skin.cost <= availableStars) return 'buyable';
    return 'insufficient';
  };

  const getButtonText = (skin: Skin): string => {
    const status = getSkinStatus(skin);
    if (status === 'owned') return 'Owned';
    if (status === 'buyable') return 'Buy';
    const needed = skin.cost - availableStars;
    return `Need ${needed}`;
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
          <span className={styles.spentStars}>Spent: {userSkins.starsSpent}</span>
          <span>•</span>
          <span className={styles.availableStars}>Available: {availableStars}</span>
        </div>
      </div>

      {/* Skins Grid */}
      <h2 className={styles.sectionTitle}>Available Skins</h2>
      <div className={styles.skinsGrid}>
        {SKINS.map((skin) => {
          const status = getSkinStatus(skin);
          return (
            <div key={skin.id} className={styles.skinCard}>
              <div className={styles.skinImageWrapper}>
                <img src={skin.image} alt={skin.name} className={styles.skinImage} />
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
                  status === 'owned'
                    ? styles.buyButtonOwned
                    : status === 'buyable'
                    ? styles.buyButtonPurchase
                    : styles.buyButtonInsufficient
                }`}
                onClick={() => handlePurchase(skin)}
                disabled={status === 'owned' || status === 'insufficient'}
              >
                {status === 'owned' && (
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
                You now own <strong>{successPurchase.name}</strong>. Check your collection to equip
                it!
              </p>
              <button
                className={styles.popupButton}
                onClick={() => setSuccessPurchase(null)}
              >
                Awesome!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
