import { useState, useRef, useEffect } from 'react';
import { Save, FolderOpen, ChevronDown } from 'lucide-react';
import type { SavedProgram } from '../../engine/types';
import styles from './SaveLoadControls.module.css';

interface SaveLoadControlsProps {
  savedSlots: SavedProgram[];
  onSave: (slot: number) => void;
  onLoad: (slot: number) => void;
  disabled?: boolean;
}

function formatSlotInfo(slot: SavedProgram | undefined): string {
  if (!slot) return 'Empty';
  if (slot.instructionsUsed === null) return 'Saved';
  return `${slot.instructionsUsed} instr`;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function SaveLoadControls({
  savedSlots,
  onSave,
  onLoad,
  disabled,
}: SaveLoadControlsProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const saveRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (saveRef.current && !saveRef.current.contains(event.target as Node)) {
        setSaveOpen(false);
      }
      if (loadRef.current && !loadRef.current.contains(event.target as Node)) {
        setLoadOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSlot = (slot: number) => savedSlots.find((s) => s.slot === slot);

  const handleSave = (slot: number) => {
    onSave(slot);
    setSaveOpen(false);
  };

  const handleLoad = (slot: number) => {
    onLoad(slot);
    setLoadOpen(false);
  };

  // Check if any slots have data for load dropdown
  const hasAnySlots = savedSlots.some((s) => s.slot >= 1 && s.slot <= 3);

  return (
    <div className={styles.container}>
      {/* Save Dropdown */}
      <div className={styles.dropdownWrapper} ref={saveRef}>
        <button
          className={styles.dropdownButton}
          onClick={() => {
            setSaveOpen(!saveOpen);
            setLoadOpen(false);
          }}
          disabled={disabled}
          title="Save program to slot"
        >
          <Save size={14} />
          Save
          <ChevronDown size={12} />
        </button>
        {saveOpen && (
          <div className={styles.menu}>
            {[1, 2, 3].map((slot) => {
              const saved = getSlot(slot);
              return (
                <button
                  key={slot}
                  className={`${styles.menuItem} ${!saved ? styles.empty : ''}`}
                  onClick={() => handleSave(slot)}
                >
                  <span>Slot {slot}</span>
                  <span className={styles.slotInfo}>
                    {saved ? formatSlotInfo(saved) : 'Empty'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Load Dropdown */}
      <div className={styles.dropdownWrapper} ref={loadRef}>
        <button
          className={styles.dropdownButton}
          onClick={() => {
            setLoadOpen(!loadOpen);
            setSaveOpen(false);
          }}
          disabled={disabled || !hasAnySlots}
          title={hasAnySlots ? 'Load program from slot' : 'No saved programs'}
        >
          <FolderOpen size={14} />
          Load
          <ChevronDown size={12} />
        </button>
        {loadOpen && (
          <div className={styles.menu}>
            {[1, 2, 3].map((slot) => {
              const saved = getSlot(slot);
              if (!saved) return null;
              return (
                <button
                  key={slot}
                  className={styles.menuItem}
                  onClick={() => handleLoad(slot)}
                >
                  <span>Slot {slot}</span>
                  <span className={styles.slotInfo}>
                    {formatSlotInfo(saved)}
                    {saved.updatedAt && (
                      <span className={styles.timeAgo}>
                        {formatTimeAgo(saved.updatedAt)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {!hasAnySlots && (
              <div className={`${styles.menuItem} ${styles.empty}`}>
                No saved programs
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
