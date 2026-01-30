import type { StackFrame, FunctionName } from '../../engine/types';
import styles from './CallStack.module.css';

interface CallStackProps {
  stack: StackFrame[];
  maxVisible?: number;
}

// Colors for each function
const functionColors: Record<FunctionName, string> = {
  f1: '#6366F1', // indigo
  f2: '#A855F7', // purple
  f3: '#F97316', // orange
  f4: '#14B8A6', // teal
  f5: '#EC4899', // pink
};

interface CollapsedFrame {
  functionName: FunctionName;
  count: number;
  isCollapsed: boolean;
  isEllipsis?: boolean;
}

// Collapse consecutive same-function frames for compact display
// Only collapse if more than 3 consecutive calls of the same function
// Always keep the current (last) frame separate so "returns to" makes sense
function collapseStack(stack: StackFrame[], maxVisible: number): CollapsedFrame[] {
  if (stack.length === 0) return [];
  if (stack.length === 1) {
    return [{
      functionName: stack[0].functionName,
      count: 1,
      isCollapsed: false,
    }];
  }

  // Process all but the last frame
  const collapsed: CollapsedFrame[] = [];
  let i = 0;
  const allButLast = stack.slice(0, -1);
  const lastFrame = stack[stack.length - 1];

  while (i < allButLast.length) {
    const frame = allButLast[i];
    let count = 1;

    // Count consecutive same function
    while (i + count < allButLast.length && allButLast[i + count].functionName === frame.functionName) {
      count++;
    }

    // If 2 or fewer, expand them individually
    // (since current is always separate, this means 3 total shows as 3 badges,
    // but 4+ total collapses to ×N + current)
    if (count <= 2) {
      for (let j = 0; j < count; j++) {
        collapsed.push({
          functionName: frame.functionName,
          count: 1,
          isCollapsed: false,
        });
      }
    } else {
      // Collapse into single entry with count
      collapsed.push({
        functionName: frame.functionName,
        count,
        isCollapsed: true,
      });
    }

    i += count;
  }

  // Always add the last frame separately (the current one)
  collapsed.push({
    functionName: lastFrame.functionName,
    count: 1,
    isCollapsed: false,
  });

  // If too many groups, keep first, last few, and collapse middle
  if (collapsed.length > maxVisible) {
    const first = collapsed[0];
    const lastFew = collapsed.slice(-(maxVisible - 2));
    const middleCount = collapsed.slice(1, -(maxVisible - 2)).reduce((sum, g) => sum + g.count, 0);

    return [
      first,
      { functionName: 'f1', count: middleCount, isCollapsed: true, isEllipsis: true },
      ...lastFew,
    ];
  }

  return collapsed;
}

export function CallStack({ stack, maxVisible = 5 }: CallStackProps) {
  const collapsed = collapseStack(stack, maxVisible);
  const totalDepth = stack.length;
  const isEmpty = stack.length === 0;

  return (
    <div className={styles.container} id="call-stack">
      <span className={styles.label}>Stack</span>
      <div className={styles.frames}>
        {isEmpty ? (
          <span className={styles.emptyState}>Not running</span>
        ) : (
          collapsed.map((group, index) => {
            const isLast = index === collapsed.length - 1;
            const key = `${group.functionName}-${index}`;

            // Special case: middle ellipsis placeholder
            if (group.isEllipsis) {
              return (
                <div key={`ellipsis-${index}`} className={styles.frameGroup}>
                  <span className={styles.arrow}>→</span>
                  <span className={styles.ellipsis}>...</span>
                </div>
              );
            }

            const isSecondToLast = index === collapsed.length - 2;
            const showReturnsTo = isSecondToLast && collapsed.length > 1;

            return (
              <div key={key} className={styles.frameGroup}>
                {index > 0 && <span className={styles.arrow}>→</span>}
                <div className={styles.frameWrapper}>
                  <div
                    className={`${styles.frame} ${isLast ? styles.current : ''} ${showReturnsTo ? styles.returnsTo : ''}`}
                    style={{
                      backgroundColor: functionColors[group.functionName],
                      boxShadow: isLast
                        ? `0 0 0 2px white, 0 0 12px ${functionColors[group.functionName]}`
                        : undefined,
                    }}
                  >
                    <span className={styles.funcName}>
                      {group.functionName.toUpperCase()}
                    </span>
                    {group.count > 1 && (
                      <span className={styles.count}>×{group.count}</span>
                    )}
                  </div>
                  {isLast && (
                    <span className={styles.currentLabel}>current</span>
                  )}
                  {showReturnsTo && (
                    <span className={styles.returnsToLabel}>returns to</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {totalDepth > 1 && (
        <span className={styles.depth}>depth {totalDepth}</span>
      )}
    </div>
  );
}
