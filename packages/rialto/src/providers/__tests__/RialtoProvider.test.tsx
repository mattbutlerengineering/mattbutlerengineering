import { render, screen } from '@testing-library/react';
import { RialtoProvider } from '../RialtoProvider';
import { useUIEnvironment } from '../useUIEnvironment';

/* ── Test consumer component ─────────────────── */

function EnvironmentDisplay() {
  const { device, vibe, theme } = useUIEnvironment();
  return (
    <div>
      <span data-testid="vibe">{vibe}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="pointer">{device.pointer}</span>
    </div>
  );
}

/* ── Tests ───────────────────────────────────── */

describe('RialtoProvider', () => {
  it('renders children', () => {
    render(
      <RialtoProvider>
        <span>Hello Rialto</span>
      </RialtoProvider>
    );
    expect(screen.getByText('Hello Rialto')).toBeInTheDocument();
  });

  it('sets data-theme attribute on wrapper', () => {
    const { container } = render(
      <RialtoProvider theme="dark">
        <span>Dark mode</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute('data-theme', 'dark');
  });

  it('defaults to system theme (resolves from device context)', () => {
    const { container } = render(
      <RialtoProvider>
        <span>System</span>
      </RialtoProvider>
    );
    // matchMedia mock returns false for all queries, so colorScheme = 'light'
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute('data-theme', 'light');
  });

  it('applies vibe overrides as inline styles', () => {
    const { container } = render(
      <RialtoProvider vibe="transacting">
        <span>Transacting</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--rialto-radius-default')).toBe(
      '4px'
    );
  });

  it('merges vibeOverrides on top of preset', () => {
    const { container } = render(
      <RialtoProvider
        vibe="transacting"
        vibeOverrides={{ '--rialto-radius-default': '2px' }}
      >
        <span>Custom override</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // vibeOverrides should override the preset value
    expect(wrapper.style.getPropertyValue('--rialto-radius-default')).toBe(
      '2px'
    );
  });

  it('provides context values via useUIEnvironment', () => {
    render(
      <RialtoProvider vibe="presenting" theme="dark">
        <EnvironmentDisplay />
      </RialtoProvider>
    );

    expect(screen.getByTestId('vibe')).toHaveTextContent('presenting');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('pointer')).toHaveTextContent('fine');
  });

  it('does not apply inline styles for default vibe (empty overrides)', () => {
    const { container } = render(
      <RialtoProvider vibe="default">
        <span>Default</span>
      </RialtoProvider>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('style')).toBeNull();
  });
});

describe('useUIEnvironment', () => {
  it('throws when used outside provider', () => {
    // Suppress console.error for the expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<EnvironmentDisplay />);
    }).toThrow('useUIEnvironment must be used within <RialtoProvider>');

    spy.mockRestore();
  });
});
