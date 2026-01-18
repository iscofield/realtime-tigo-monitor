import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('displays "Show Voltage" when in watts mode', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="watts" setMode={setMode} />);
    expect(screen.getByText('Show Voltage')).toBeInTheDocument();
  });

  it('displays "Show Watts" when in voltage mode', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="voltage" setMode={setMode} />);
    expect(screen.getByText('Show Watts')).toBeInTheDocument();
  });

  it('calls setMode with "voltage" when clicked in watts mode', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="watts" setMode={setMode} />);
    fireEvent.click(screen.getByTestId('mode-toggle'));
    expect(setMode).toHaveBeenCalledWith('voltage');
  });

  it('calls setMode with "watts" when clicked in voltage mode', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="voltage" setMode={setMode} />);
    fireEvent.click(screen.getByTestId('mode-toggle'));
    expect(setMode).toHaveBeenCalledWith('watts');
  });

  it('has correct data-testid attribute', () => {
    const setMode = vi.fn();
    render(<ModeToggle mode="watts" setMode={setMode} />);
    expect(screen.getByTestId('mode-toggle')).toBeInTheDocument();
  });
});
