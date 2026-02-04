import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bug, Lightbulb, MessageCircle, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import styles from './FeedbackModal.module.css';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FeedbackCategory = 'bug' | 'feature' | 'other';

const categories: { value: FeedbackCategory; label: string; icon: typeof Bug }[] = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'feature', label: 'Feature', icon: Lightbulb },
  { value: 'other', label: 'Other', icon: MessageCircle },
];

const MAX_CHARS = 2000;

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { user } = useAuthStore();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!user?.id || !description.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('feedback')
        .insert({
          user_id: user.id,
          category,
          description: description.trim(),
        });

      if (insertError) throw insertError;

      setIsSuccess(true);
      setTimeout(() => {
        onClose();
        // Reset state after modal closes
        setTimeout(() => {
          setCategory('bug');
          setDescription('');
          setIsSuccess(false);
        }, 300);
      }, 2000);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      // Reset state after modal closes
      setTimeout(() => {
        setCategory('bug');
        setDescription('');
        setIsSuccess(false);
        setError(null);
      }, 300);
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
          onClick={handleClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            {isSuccess ? (
              <div className={styles.successState}>
                <CheckCircle size={48} className={styles.successIcon} />
                <h3>Thank you!</h3>
                <p>Your feedback has been submitted.</p>
              </div>
            ) : (
              <>
                <div className={styles.header}>
                  <h2 className={styles.title}>Send Feedback</h2>
                  <button className={styles.closeButton} onClick={handleClose}>
                    <X size={20} />
                  </button>
                </div>

                <div className={styles.categorySelector}>
                  {categories.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      className={`${styles.categoryButton} ${category === value ? styles.categoryActive : ''}`}
                      onClick={() => setCategory(value)}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  ))}
                </div>

                <div className={styles.textareaWrapper}>
                  <textarea
                    className={styles.textarea}
                    placeholder={
                      category === 'bug'
                        ? 'Describe the bug and steps to reproduce it...'
                        : category === 'feature'
                        ? 'Describe the feature you would like to see...'
                        : 'Share your thoughts or suggestions...'
                    }
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, MAX_CHARS))}
                    rows={5}
                  />
                  <span className={styles.charCount}>
                    {description.length}/{MAX_CHARS}
                  </span>
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <button
                  className={styles.submitButton}
                  onClick={handleSubmit}
                  disabled={!description.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className={styles.spinner} />
                      Submitting...
                    </>
                  ) : (
                    'Submit Feedback'
                  )}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
