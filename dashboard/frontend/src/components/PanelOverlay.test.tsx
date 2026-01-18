import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelOverlay } from './PanelOverlay';
import type { PanelData } from '../hooks/useWebSocket';

const createMockPanel = (overrides: Partial<PanelData> = {}): PanelData => ({
  display_label: 'A1',
  string: 'A',
  system: 'primary',
  sn: 'C3F23CR',
  watts: 100,
  voltage: 45,
  online: true,
  stale: false,
  position: { x_percent: 50, y_percent: 50 },
  ...overrides,
});

describe('PanelOverlay', () => {
  it('renders panel label', () => {
    const panel = createMockPanel();
    render(<PanelOverlay panel={panel} mode="watts" />);
    expect(screen.getByText('A1')).toBeInTheDocument();
  });

  it('displays watts value in watts mode', () => {
    const panel = createMockPanel({ watts: 385 });
    render(<PanelOverlay panel={panel} mode="watts" />);
    expect(screen.getByText('385')).toBeInTheDocument();
  });

  it('displays voltage value in voltage mode', () => {
    const panel = createMockPanel({ voltage: 42.5 });
    render(<PanelOverlay panel={panel} mode="voltage" />);
    expect(screen.getByText('42.5')).toBeInTheDocument();
  });

  it('displays red X for offline panels (FR-2.8)', () => {
    const panel = createMockPanel({ online: false });
    render(<PanelOverlay panel={panel} mode="watts" />);
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('displays em dash for null watts (FR-4.7)', () => {
    const panel = createMockPanel({ watts: null });
    render(<PanelOverlay panel={panel} mode="watts" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays em dash for null voltage (FR-4.7)', () => {
    const panel = createMockPanel({ voltage: null });
    render(<PanelOverlay panel={panel} mode="voltage" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays reduced opacity for stale panels (FR-4.7)', () => {
    const panel = createMockPanel({ stale: true, watts: 100 });
    render(<PanelOverlay panel={panel} mode="watts" />);
    const overlay = screen.getByTestId('panel-A1');
    expect(overlay).toHaveStyle({ opacity: '0.5' });
  });

  it('has correct data-testid attribute', () => {
    const panel = createMockPanel({ display_label: 'B5' });
    render(<PanelOverlay panel={panel} mode="watts" />);
    expect(screen.getByTestId('panel-B5')).toBeInTheDocument();
  });

  it('positions overlay using percentage values', () => {
    const panel = createMockPanel({ position: { x_percent: 25.5, y_percent: 75.3 } });
    render(<PanelOverlay panel={panel} mode="watts" />);
    const overlay = screen.getByTestId('panel-A1');
    expect(overlay).toHaveStyle({ left: '25.5%', top: '75.3%' });
  });

  it('displays last 4 characters of SN in sn mode', () => {
    const panel = createMockPanel({ sn: 'C3F23CR' });
    render(<PanelOverlay panel={panel} mode="sn" />);
    expect(screen.getByText('23CR')).toBeInTheDocument();
  });

  it('displays full SN if less than 4 characters', () => {
    const panel = createMockPanel({ sn: 'AB' });
    render(<PanelOverlay panel={panel} mode="sn" />);
    expect(screen.getByText('AB')).toBeInTheDocument();
  });
});
