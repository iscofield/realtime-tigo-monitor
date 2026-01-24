/**
 * Editor toolbar with controls for the layout editor.
 */

import type { CSSProperties } from 'react';
import { Undo2, Redo2, Grid3X3, Save, X, Trash2, Upload } from 'lucide-react';

interface EditorToolbarProps {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  overlaySize: number;
  snapEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  onExitEditMode: (discard: boolean) => void;
  onSave: () => void;
  onOverlaySizeChange: (size: number) => void;
  onSnapToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeselectAll: () => void;
  onImageUpload: () => void;
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
  backgroundColor: '#444',
  margin: '0 4px',
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

const sliderValueStyle: CSSProperties = {
  color: '#fff',
  fontSize: '12px',
  minWidth: '36px',
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
  snapEnabled,
  canUndo,
  canRedo,
  selectedCount,
  onExitEditMode,
  onSave,
  onOverlaySizeChange,
  onSnapToggle,
  onUndo,
  onRedo,
  onDeselectAll,
  onImageUpload,
}: EditorToolbarProps) {
  return (
    <div style={toolbarStyle}>
      {/* Undo/Redo */}
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

      <div style={separatorStyle} />

      {/* Snap toggle */}
      <button
        style={toggleStyle(snapEnabled)}
        onClick={onSnapToggle}
        title={snapEnabled ? 'Disable snap to align' : 'Enable snap to align'}
      >
        <Grid3X3 size={16} />
      </button>

      <div style={separatorStyle} />

      {/* Overlay size slider */}
      <div style={sliderContainerStyle}>
        <span style={labelStyle}>Size:</span>
        <input
          type="range"
          min={20}
          max={200}
          value={overlaySize}
          onChange={(e) => onOverlaySizeChange(parseInt(e.target.value, 10))}
          style={sliderStyle}
        />
        <span style={sliderValueStyle}>{overlaySize}px</span>
      </div>

      <div style={separatorStyle} />

      {/* Selection info */}
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
          <div style={separatorStyle} />
        </>
      )}

      {/* Upload image */}
      <button
        style={secondaryButtonStyle}
        onClick={onImageUpload}
        title="Upload new layout image"
      >
        <Upload size={16} />
        Upload Image
      </button>

      {/* Spacer */}
      <div style={{ flexGrow: 1 }} />

      {/* Save/Cancel */}
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
