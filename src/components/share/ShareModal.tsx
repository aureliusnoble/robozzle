import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Link } from 'lucide-react';
import type { PuzzleConfig, Program } from '../../engine/types';
import { ShareCard } from './ShareCard';
import { generateShareDataUrl } from '../../lib/shareImageGenerator';
import { copyToClipboard } from '../../lib/shareGenerator';
import { useSkinStore } from '../../stores/skinStore';
import styles from './ShareModal.module.css';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: PuzzleConfig;
  program?: Program;
  stats: {
    steps: number;
    instructions: number;
  };
  category: 'daily' | 'classic';
  challengeType?: 'easy' | 'challenge';
  dailyNumber?: number;
  date?: string;
}

// Get day number since launch for each challenge type
// Daily Easy and Daily Challenge have different launch dates
function getDayNumber(date: string, challengeType: 'easy' | 'challenge' = 'challenge'): number {
  // Daily Challenge launched 2025-02-02, Daily Easy launched 2025-02-03
  const launchDates = {
    challenge: '2025-02-02',
    easy: '2025-02-03',
  };
  const launch = new Date(launchDates[challengeType] + 'T00:00:00');
  const current = new Date(date + 'T00:00:00');
  const diffTime = current.getTime() - launch.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 because first day is #1
  return Math.max(1, diffDays);
}

export function ShareModal({
  isOpen,
  onClose,
  puzzle,
  program,
  stats,
  category,
  challengeType = 'challenge',
  dailyNumber,
  date,
}: ShareModalProps) {
  const [includeSolution, setIncludeSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Get user's selected skin
  const { getSkinImage } = useSkinStore();
  const userSkinImage = getSkinImage();

  // Build share URL - use BASE_URL to handle GitHub Pages deployment
  const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const shareUrl = category === 'daily'
    ? `${baseUrl}daily${date ? `?date=${date}` : ''}`
    : `${baseUrl}classic?puzzle=${puzzle.id}`;

  // For display in the card (shorter version)
  const displayUrl = category === 'daily'
    ? `aureliusnoble.github.io/robozzle/daily${date ? `?date=${date}` : ''}`
    : `aureliusnoble.github.io/robozzle/classic?puzzle=${puzzle.id}`;

  // Calculate daily number if not provided
  const effectiveDailyNumber = dailyNumber ?? (date ? getDayNumber(date, challengeType) : undefined);

  // Generate image when modal opens or toggle changes
  const generateImage = useCallback(async () => {
    if (!cardRef.current) return;
    setIsGenerating(true);

    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 100));

    const dataUrl = await generateShareDataUrl(cardRef.current);
    setImageUrl(dataUrl);
    setIsGenerating(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the card is rendered
      const timer = setTimeout(generateImage, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, includeSolution, generateImage]);

  const [imageCopied, setImageCopied] = useState(false);

  const handleCopyImage = async () => {
    if (!imageUrl) return;

    try {
      // Convert data URL to blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Try to copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);

      setImageCopied(true);
      setTimeout(() => setImageCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
      // Fallback: copy the link instead
      await handleCopyLink();
    }
  };

  const handleCopyLink = async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 className={styles.title}>Share Your Result</h2>
              <button className={styles.closeButton} onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            {/* Image Preview */}
            <div className={styles.imagePreview}>
              {isGenerating ? (
                <div className={styles.generating}>Generating image...</div>
              ) : imageUrl ? (
                <img src={imageUrl} alt="Share preview" className={styles.previewImage} />
              ) : (
                <div className={styles.generating}>Loading...</div>
              )}
            </div>

            {/* Solution Toggle */}
            {program && (
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={includeSolution}
                  onChange={(e) => setIncludeSolution(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
                <span className={styles.toggleLabel}>Include my solution</span>
              </label>
            )}

            {/* Actions */}
            <div className={styles.actions}>
              <button className={styles.shareButton} onClick={handleCopyImage} disabled={!imageUrl}>
                <Image size={18} />
                {imageCopied ? 'Copied!' : 'Copy Image'}
              </button>
              <button className={styles.copyButton} onClick={handleCopyLink}>
                <Link size={18} />
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}

      {/* Hidden ShareCard for image generation - outside AnimatePresence */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            left: -9999,
            top: -9999,
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          <ShareCard
            ref={cardRef}
            puzzle={puzzle}
            program={program}
            stats={stats}
            showSolution={includeSolution}
            shareUrl={displayUrl}
            category={category}
            challengeType={challengeType}
            dailyNumber={effectiveDailyNumber}
            date={date}
            skinImage={userSkinImage}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
