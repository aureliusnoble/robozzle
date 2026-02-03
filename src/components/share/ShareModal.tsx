import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Link } from 'lucide-react';
import type { PuzzleConfig, Program } from '../../engine/types';
import { ShareCard } from './ShareCard';
import { generateShareDataUrl } from '../../lib/shareImageGenerator';
import { generateAnimatedGif, gifBlobToDataUrl, generateStaticPng } from '../../lib/gifGenerator';
import type { GifProgress } from '../../lib/gifGenerator';
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
  const [gifBlob, setGifBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState<GifProgress | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Build share URL
  const baseUrl = window.location.origin;
  const shareUrl = category === 'daily'
    ? `${baseUrl}/robozzle/daily${date ? `?date=${date}` : ''}`
    : `${baseUrl}/robozzle/classic?puzzle=${puzzle.id}`;

  // Calculate daily number if not provided
  const effectiveDailyNumber = dailyNumber ?? (date ? getDayNumber(date) : undefined);

  // Generate GIF when modal opens (only once, not on solution toggle)
  const generateGif = useCallback(async () => {
    if (!program) return;
    setIsGenerating(true);
    setGeneratingProgress({ current: 0, total: 100, phase: 'loading' });

    try {
      const blob = await generateAnimatedGif(puzzle, program, setGeneratingProgress);
      setGifBlob(blob);
      const dataUrl = await gifBlobToDataUrl(blob);
      setImageUrl(dataUrl);
    } catch (error) {
      console.error('Failed to generate GIF:', error);
      // Fallback to static image
      if (cardRef.current) {
        const dataUrl = await generateShareDataUrl(cardRef.current);
        setImageUrl(dataUrl);
      }
    }
    setIsGenerating(false);
    setGeneratingProgress(null);
  }, [puzzle, program]);

  // Generate static image for solution preview
  const generateStaticImage = useCallback(async () => {
    if (!cardRef.current) return;
    setIsGenerating(true);

    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 100));

    const dataUrl = await generateShareDataUrl(cardRef.current);
    setImageUrl(dataUrl);
    setGifBlob(null); // Clear GIF blob when showing static
    setIsGenerating(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (includeSolution) {
        // Show static image with solution
        const timer = setTimeout(generateStaticImage, 50);
        return () => clearTimeout(timer);
      } else {
        // Generate animated GIF without solution
        const timer = setTimeout(generateGif, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, includeSolution, generateGif, generateStaticImage]);

  const [imageCopied, setImageCopied] = useState(false);

  const handleCopyImage = async () => {
    if (!imageUrl) return;

    try {
      let blob: Blob;

      // Browsers only support PNG for clipboard, not GIF
      // So we always need to use PNG for clipboard operations
      if (gifBlob && program) {
        // Generate a static PNG for clipboard
        blob = await generateStaticPng(puzzle, program);
      } else {
        // Convert data URL to blob (for static PNG from ShareCard)
        const response = await fetch(imageUrl);
        blob = await response.blob();
      }

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
                <div className={styles.generating}>
                  {generatingProgress ? (
                    <>
                      Generating {generatingProgress.phase === 'loading' ? 'loading sprites' : generatingProgress.phase === 'simulating' ? 'animation' : 'GIF'}...
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${generatingProgress.current}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    'Generating image...'
                  )}
                </div>
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
            shareUrl={shareUrl}
            category={category}
            dailyNumber={effectiveDailyNumber}
            date={date}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
