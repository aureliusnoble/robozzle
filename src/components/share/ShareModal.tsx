import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PuzzleConfig, Program } from '../../engine/types';
import { ShareCard } from './ShareCard';
import { generateShareDataUrl, downloadShareImage, shareImage } from '../../lib/shareImageGenerator';
import { copyToClipboard } from '../../lib/shareGenerator';
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
  dailyNumber?: number;
  date?: string;
}

// Get day number since launch
function getDayNumber(date: string): number {
  const launch = new Date('2025-01-01');
  const current = new Date(date);
  const diffTime = Math.abs(current.getTime() - launch.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function ShareModal({
  isOpen,
  onClose,
  puzzle,
  program,
  stats,
  category,
  dailyNumber,
  date,
}: ShareModalProps) {
  const [includeSolution, setIncludeSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Build share URL
  const baseUrl = window.location.origin;
  const shareUrl = category === 'daily'
    ? `${baseUrl}/daily${date ? `?date=${date}` : ''}`
    : `${baseUrl}/classic?puzzle=${puzzle.id}`;

  // For display in the card (shorter version)
  const displayUrl = category === 'daily'
    ? `robozzle.app/daily${date ? `?date=${date}` : ''}`
    : `robozzle.app/classic?puzzle=${puzzle.id}`;

  // Calculate daily number if not provided
  const effectiveDailyNumber = dailyNumber ?? (date ? getDayNumber(date) : undefined);

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

  const handleShare = async () => {
    if (!cardRef.current) return;

    // Check if we can share files (Web Share API level 2)
    let canShareFiles = false;
    try {
      const testFile = new File([''], 'test.png', { type: 'image/png' });
      canShareFiles = 'canShare' in navigator && navigator.canShare({ files: [testFile] });
    } catch {
      canShareFiles = false;
    }

    if (canShareFiles) {
      const success = await shareImage(
        cardRef.current,
        category === 'daily' ? `RoboZZle Daily #${effectiveDailyNumber}` : `RoboZZle: ${puzzle.title}`,
        shareUrl
      );
      if (success) {
        onClose();
        return;
      }
    }

    // Fall back to copying URL
    await handleCopyLink();
  };

  const handleCopyLink = async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    const filename = category === 'daily'
      ? `robozzle-daily-${date || 'challenge'}.png`
      : `robozzle-${puzzle.id}.png`;
    await downloadShareImage(cardRef.current, filename);
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
                {'\u2715'}
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
              <button className={styles.shareButton} onClick={handleShare}>
                {'\uD83D\uDCE4'} Share
              </button>
              <button className={styles.copyButton} onClick={handleCopyLink}>
                {'\uD83D\uDD17'} Copy Link
              </button>
              <button className={styles.downloadButton} onClick={handleDownload}>
                {'\u2B07'} Download
              </button>
            </div>

            <AnimatePresence>
              {copied && (
                <motion.div
                  className={styles.copiedMessage}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  Link copied to clipboard!
                </motion.div>
              )}
            </AnimatePresence>
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
            dailyNumber={effectiveDailyNumber}
            date={date}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
