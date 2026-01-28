/**
 * Editor toolbar with controls for the layout editor.
 */

import type { CSSProperties } from 'react';
import { Undo2, Redo2, Grid3X3, Save, X, Trash2, Upload, ImageMinus } from 'lucide-react';

interface EditorToolbarProps {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  overlaySize: number;
  imageScale: number;
  snapEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  onExitEditMode: (discard: boolean) => void;
  onSave: () => void;
  onOverlaySizeChange: (size: number) => void;
  onImageScaleChange: (scale: number) => void;
  onImageScaleCommit: () => void;  // Called on release to record history
  onSnapToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeselectAll: () => void;
  onImageUpload: () => void;
  onImageDelete?: () => void;
  hasImage?: boolean;
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 16px',
  backgroundColor: '#1a1a1a',
  borderBottom: '1px solid #333',
  flexWrap: 'wrap',
};

const groupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const separatorStyle: CSSProperties = {
  width: '1px',
  height: '24px',
  backgroundColor: '#ddd',
  margin: '0 8px',
};

const buttonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '6px 12px',
  fontSize: '13px',
  fontWeight: 500,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background-color 0.15s, opacity 0.15s',
  whiteSpace: 'nowrap',
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#4a90d9',
  color: 'white',
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#333',
  color: '#fff',
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#dc3545',
  color: 'white',
};

const iconButtonStyle: CSSProperties = {
  ...buttonStyle,
  padding: '6px 8px',
  minWidth: '32px',
};

const disabledStyle: CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

const labelStyle: CSSProperties = {
  color: '#aaa',
  fontSize: '12px',
  marginRight: '4px',
};

const sliderContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const sliderStyle: CSSProperties = {
  width: '100px',
  cursor: 'pointer',
};

const sizeInputStyle: CSSProperties = {
  width: '50px',
  padding: '2px 4px',
  fontSize: '12px',
  color: '#fff',
  backgroundColor: '#333',
  border: '1px solid #555',
  borderRadius: '3px',
  textAlign: 'center',
};

const toggleStyle = (active: boolean): CSSProperties => ({
  ...iconButtonStyle,
  backgroundColor: active ? '#4a90d9' : '#333',
});

const selectionBadgeStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  backgroundColor: '#444',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '12px',
};

export function EditorToolbar({
  hasUnsavedChanges,
  isSaving,
  overlaySize,
  imageScale,
  snapEnabled,
  canUndo,
  canRedo,
  selectedCount,
  onExitEditMode,
  onSave,
  onOverlaySizeChange,
  onImageScaleChange,
  onImageScaleCommit,
  onSnapToggle,
  onUndo,
  onRedo,
  onDeselectAll,
  onImageUpload,
  onImageDelete,
  hasImage,
}: EditorToolbarProps) {
  return (
    <div style={toolbarStyle}>
      {/* 1. Undo/Redo */}
      <div style={groupStyle}>
        <button
          style={{
            ...iconButtonStyle,
            ...secondaryButtonStyle,
            ...(canUndo ? {} : disabledStyle),
          }}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          style={{
            ...iconButtonStyle,
            ...secondaryButtonStyle,
            ...(canRedo ? {} : disabledStyle),
          }}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={16} />
        </button>
      </div>

      {/* 2. Separator */}
      <div role="separator" aria-orientation="vertical" style={separatorStyle} />

      {/* 3. Snap toggle */}
      <button
        style={toggleStyle(snapEnabled)}
        onClick={onSnapToggle}
        title={snapEnabled ? 'Snap to Align: ON - Click to disable alignment guides' : 'Snap to Align: OFF - Click to enable alignment guides'}
      >
        <Grid3X3 size={16} />
        <span style={{ fontSize: '11px', color: snapEnabled ? '#fff' : '#aaa' }}>Snap</span>
      </button>

      {/* 4. Separator */}
      <div role="separator" aria-orientation="vertical" style={separatorStyle} />

      {/* 5. Image Scale slider */}
      <div style={sliderContainerStyle} title="Background image display scale (25%-200%) - editor only">
        <label id="image-scale-label" htmlFor="image-scale-slider" style={labelStyle}>
          Image Scale:
        </label>
        <input
          type="range"
          id="image-scale-slider"
          aria-labelledby="image-scale-label"
          aria-valuemin={25}
          aria-valuemax={200}
          aria-valuenow={imageScale}
          min={25}
          max={200}
          step={5}
          value={imageScale}
          onChange={(e) => onImageScaleChange(parseInt(e.target.value, 10))}
          onMouseUp={onImageScaleCommit}
          onTouchEnd={onImageScaleCommit}
          onTouchCancel={onImageScaleCommit}
          onBlur={onImageScaleCommit}
          style={sliderStyle}
        />
        <input
          type="number"
          inputMode="numeric"
          min={25}
          max={200}
          step={1}
          value={imageScale}
          onChange={(e) => {
            // Skip non-numeric input including empty string; onBlur handles reset to default
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value)) onImageScaleChange(value);
          }}
          onBlur={(e) => {
            // Validate on blur: clamp to valid range or reset to default
            const value = parseInt(e.target.value, 10);
            if (isNaN(value)) {
              onImageScaleChange(100);  // Reset to default
            } else {
              onImageScaleChange(Math.min(200, Math.max(25, value)));
            }
            onImageScaleCommit();  // Record history on blur
          }}
          style={sizeInputStyle}
        />
        <span style={{ color: '#888', fontSize: '11px' }}>%</span>
      </div>

      {/* 6. Separator */}
      <div role="separator" aria-orientation="vertical" style={separatorStyle} />

      {/* 7. Panel Size slider (renamed from "Size:") */}
      <div style={sliderContainerStyle} title="Panel overlay size in pixels (20-200)">
        <label id="panel-size-label" htmlFor="panel-size-slider" style={labelStyle}>
          Panel Size:
        </label>
        <input
          type="range"
          id="panel-size-slider"
          aria-labelledby="panel-size-label"
          aria-valuemin={20}
          aria-valuemax={200}
          aria-valuenow={overlaySize}
          min={20}
          max={200}
          value={overlaySize}
          onChange={(e) => onOverlaySizeChange(parseInt(e.target.value, 10))}
          style={sliderStyle}
        />
        <input
          type="number"
          inputMode="numeric"
          min={20}
          max={200}
          step={1}
          value={overlaySize}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
              onOverlaySizeChange(val);
            }
          }}
          onBlur={(e) => {
            // Clamp value on blur if out of range, reset to default if invalid
            const val = parseInt(e.target.value, 10);
            if (isNaN(val)) {
              onOverlaySizeChange(50);  // Reset to default
            } else if (val < 20) {
              onOverlaySizeChange(20);
            } else if (val > 200) {
              onOverlaySizeChange(200);
            }
          }}
          style={sizeInputStyle}
        />
        <span style={{ color: '#888', fontSize: '11px' }}>px</span>
      </div>

      {/* 8. Separator */}
      <div role="separator" aria-orientation="vertical" style={separatorStyle} />

      {/* 9. Selection info (when applicable) */}
      {selectedCount > 0 && (
        <>
          <div style={selectionBadgeStyle}>
            <span>{selectedCount} selected</span>
            <button
              onClick={onDeselectAll}
              style={{
                background: 'none',
                border: 'none',
                color: '#aaa',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </>
      )}

      {/* 10. Upload image */}
      <button
        style={secondaryButtonStyle}
        onClick={onImageUpload}
        title="Upload new layout image"
      >
        <Upload size={16} />
        Upload Image
      </button>

      {/* 10b. Delete image */}
      {hasImage && onImageDelete && (
        <button
          style={secondaryButtonStyle}
          onClick={onImageDelete}
          title="Delete layout image"
        >
          <ImageMinus size={16} />
          Delete Image
        </button>
      )}

      {/* 11. Spacer */}
      <div style={{ flexGrow: 1 }} />

      {/* 12. Discard/Save buttons */}
      <div style={groupStyle}>
        <button
          style={dangerButtonStyle}
          onClick={() => onExitEditMode(true)}
          title="Discard changes"
        >
          <Trash2 size={16} />
          Discard
        </button>
        <button
          style={{
            ...primaryButtonStyle,
            ...(isSaving ? disabledStyle : {}),
          }}
          onClick={onSave}
          disabled={isSaving}
          title="Save changes"
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Unsaved indicator */}
      {hasUnsavedChanges && (
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#ffc107',
            marginLeft: '8px',
          }}
          title="Unsaved changes"
        />
      )}
    </div>
  );
}
