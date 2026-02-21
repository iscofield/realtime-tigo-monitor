/**
 * WiringBadge — inline badge displaying xSyP wiring notation.
 * Clickable to open a WiringPopover for selecting wiring configuration.
 */

import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { getWiringOptions } from '../../../utils/wiringConfig';

interface WiringBadgeProps {
  stringName: string;
  panelCount: number;
  seriesCount?: number;
  parallelCount?: number;
  onOpen: (anchorRef: React.RefObject<HTMLSpanElement | null>) => void;
  isOpen: boolean;
}

const baseBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '48px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  fontSize: '12px',
  borderRadius: '4px',
  padding: '2px 6px',
  position: 'relative',
  border: 'none',
  background: 'none',
  lineHeight: '1.5',
};

const defaultBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  backgroundColor: '#f0f0f0',
  color: '#666',
};

const customBadgeStyle: CSSProperties = {
  ...baseBadgeStyle,
  backgroundColor: '#e3f2fd',
  color: '#1565c0',
};

const nonInteractiveBadgeStyle: CSSProperties = {
  cursor: 'default',
};

const interactiveBadgeStyle: CSSProperties = {
  cursor: 'pointer',
};

export function WiringBadge({
  stringName,
  panelCount,
  seriesCount,
  parallelCount,
  onOpen,
  isOpen,
}: WiringBadgeProps) {
  const badgeRef = useRef<HTMLSpanElement>(null);

  const effectiveSeries = seriesCount ?? panelCount;
  const effectiveParallel = parallelCount ?? 1;
  const isDefault = effectiveParallel === 1;
  const label = `${effectiveSeries}S${effectiveParallel}P`;

  const options = getWiringOptions(panelCount);
  const isInteractive = options.length > 1;

  const groupText = effectiveParallel === 1 ? '1 parallel group' : `${effectiveParallel} parallel groups`;
  const ariaLabel = panelCount === 1
    ? `String ${stringName} wiring: 1 panel, 1 parallel group.`
    : `String ${stringName} wiring: ${effectiveSeries} panels in series, ${groupText}. Activate to change.`;

  const handleClick = () => {
    if (!isInteractive) return;
    onOpen(badgeRef);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(badgeRef);
    }
  };

  const style = {
    ...(isDefault ? defaultBadgeStyle : customBadgeStyle),
    ...(isInteractive ? interactiveBadgeStyle : nonInteractiveBadgeStyle),
  };

  return (
    <span
      ref={badgeRef}
      style={style}
      className="wiring-badge"
      tabIndex={isInteractive ? 0 : undefined}
      role={isInteractive ? 'button' : undefined}
      aria-haspopup={isInteractive ? 'dialog' : undefined}
      aria-expanded={isInteractive ? isOpen : undefined}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {label}
    </span>
  );
}
