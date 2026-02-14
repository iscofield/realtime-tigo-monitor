/**
 * WiringPopover — portal-based popover with radio group for selecting
 * series-parallel wiring configuration.
 */

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import type { WiringOption } from '../../../utils/wiringConfig';

interface WiringPopoverProps {
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  options: WiringOption[];
  selectedSeries: number;
  selectedParallel: number;
  onSelect: (series: number, parallel: number) => void;
  onClose: () => void;
  stringName: string;
}

const CLOSE_DELAY_MS = 200;
const MOBILE_BREAKPOINT = 480;

const popoverStyle: CSSProperties = {
  position: 'fixed',
  backgroundColor: '#fff',
  border: '1px solid #ccc',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  padding: '12px',
  zIndex: 1000,
  minWidth: '220px',
  maxWidth: '320px',
};

const mobilePopoverStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  width: '100%',
  maxHeight: '50vh',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  backgroundColor: '#fff',
  border: '1px solid #ccc',
  borderRadius: '8px 8px 0 0',
  boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
  padding: '12px',
  zIndex: 1000,
};

const titleStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  marginBottom: '8px',
  color: '#333',
};

const radioGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const scrollableRadioGroupStyle: CSSProperties = {
  ...radioGroupStyle,
  maxHeight: '300px',
  overflowY: 'auto',
};

const radioOptionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '8px',
  borderRadius: '4px',
  cursor: 'pointer',
  border: '1px solid transparent',
};

const radioOptionSelectedStyle: CSSProperties = {
  ...radioOptionStyle,
  backgroundColor: '#e3f2fd',
  border: '1px solid #90caf9',
};

const radioOptionHoverStyle: CSSProperties = {
  backgroundColor: '#f5f5f5',
};

const labelBoldStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '14px',
  color: '#333',
};

const descriptionStyle: CSSProperties = {
  fontSize: '12px',
  color: '#666',
};

const annotationStyle: CSSProperties = {
  fontSize: '11px',
  color: '#999',
  fontStyle: 'italic',
};

export function WiringPopover({
  anchorRef,
  options,
  selectedSeries,
  selectedParallel,
  onSelect,
  onClose,
  stringName,
}: WiringPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
  }, []);

  // Position the popover
  useLayoutEffect(() => {
    if (!anchorRef.current) return;

    const anchor = anchorRef.current.getBoundingClientRect();

    if (isMobile) {
      setPosition({ top: anchor.bottom + 4, left: 0 });
      return;
    }

    // Initial position below anchor
    let top = anchor.bottom + 4;
    let left = anchor.left;

    setPosition({ top, left });

    // After render, check if we need to flip
    requestAnimationFrame(() => {
      if (!popoverRef.current) return;
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - anchor.bottom;
      const spaceAbove = anchor.top;

      if (spaceBelow < popoverRect.height && spaceAbove > spaceBelow) {
        top = anchor.top - popoverRect.height - 4;
      }

      // Keep within horizontal bounds
      if (left + popoverRect.width > viewportWidth) {
        left = viewportWidth - popoverRect.width - 8;
      }
      if (left < 8) left = 8;

      setPosition({ top, left });
    });
  }, [anchorRef, isMobile]);

  // Focus the selected option on open
  useEffect(() => {
    const selectedIdx = options.findIndex(
      o => o.series === selectedSeries && o.parallel === selectedParallel
    );
    const idx = selectedIdx >= 0 ? selectedIdx : 0;
    setFocusedIndex(idx);
    // Defer focus to next frame so the element exists
    requestAnimationFrame(() => {
      optionRefs.current[idx]?.focus();
    });
  }, [options, selectedSeries, selectedParallel]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  // Scroll to close
  useEffect(() => {
    const handleScroll = () => onClose();
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, anchorRef]);

  // Cleanup close timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleOptionClick = useCallback((option: WiringOption) => {
    if (closing) return;

    // Re-selecting current option — close immediately
    if (option.series === selectedSeries && option.parallel === selectedParallel) {
      onClose();
      anchorRef.current?.focus();
      return;
    }

    onSelect(option.series, option.parallel);
    setClosing(true);

    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      anchorRef.current?.focus();
    }, CLOSE_DELAY_MS);
  }, [closing, selectedSeries, selectedParallel, onSelect, onClose, anchorRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (closing) return;

    let newIndex = focusedIndex;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        newIndex = Math.min(focusedIndex + 1, options.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        newIndex = Math.max(focusedIndex - 1, 0);
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = options.length - 1;
        break;
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          handleOptionClick(options[focusedIndex]);
        }
        return;
      default:
        return;
    }

    if (newIndex !== focusedIndex) {
      setFocusedIndex(newIndex);
      optionRefs.current[newIndex]?.focus();
    }
  }, [focusedIndex, options, closing, handleOptionClick]);

  if (!position) return null;

  const style: CSSProperties = isMobile
    ? { ...mobilePopoverStyle, top: position.top }
    : { ...popoverStyle, top: position.top, left: position.left };

  const needsScroll = options.length > 6;
  const groupStyle = needsScroll ? scrollableRadioGroupStyle : radioGroupStyle;

  const content = (
    <div
      ref={popoverRef}
      style={style}
      role="dialog"
      aria-label={`Wiring for String ${stringName}`}
    >
      <div style={titleStyle}>Wiring for String {stringName}</div>
      <div
        role="radiogroup"
        aria-label={`Wiring configuration for String ${stringName}`}
        style={groupStyle}
        onKeyDown={handleKeyDown}
      >
        {options.map((option, idx) => {
          const isSelected = option.series === selectedSeries && option.parallel === selectedParallel;
          const isFocused = idx === focusedIndex;

          return (
            <div
              key={option.label}
              ref={el => { optionRefs.current[idx] = el; }}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isFocused ? 0 : -1}
              style={{
                ...(isSelected ? radioOptionSelectedStyle : radioOptionStyle),
                ...(isFocused && !isSelected ? radioOptionHoverStyle : {}),
                ...(closing ? { opacity: 0.6, pointerEvents: 'none' as const } : {}),
              }}
              onClick={() => handleOptionClick(option)}
              onMouseEnter={(e) => {
                if (!isSelected && !closing) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !closing) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }
              }}
            >
              <div style={{ flex: 1 }}>
                <div>
                  <span style={labelBoldStyle}>{option.label}</span>
                  {option.isDefault && <span style={annotationStyle}> (default)</span>}
                  {option.isUncommon && <span style={annotationStyle}> (uncommon)</span>}
                </div>
                <div style={descriptionStyle}>{option.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
