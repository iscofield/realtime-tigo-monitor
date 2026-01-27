import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('renders all mode buttons', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="watts" setMode={setMode} />);
    expect(screen.getByText('Watts')).toBeInTheDocument();
    expect(screen.getByText('Voltage')).toBeInTheDocument();
    expect(screen.getByText('SN (last 4)')).toBeInTheDocument();
  });

  it('calls setMode with "voltage" when voltage button clicked', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="watts" setMode={setMode} />);
    fireEvent.click(screen.getByTestId('mode-voltage'));
    expect(setMode).toHaveBeenCalledWith('voltage');
  });

  it('calls setMode with "watts" when watts button clicked', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="voltage" setMode={setMode} />);
    fireEvent.click(screen.getByTestId('mode-watts'));
    expect(setMode).toHaveBeenCalledWith('watts');
  });

  it('calls setMode with "sn" when SN button clicked', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="watts" setMode={setMode} />);
    fireEvent.click(screen.getByTestId('mode-sn'));
    expect(setMode).toHaveBeenCalledWith('sn');
  });

  it('has correct data-testid attribute', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="watts" setMode={setMode} />);
    expect(screen.getByTestId('mode-toggle')).toBeInTheDocument();
  });
});
