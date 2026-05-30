import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CountryLabel } from './CountryLabel.js';

// The i18n mock leaves i18n.resolvedLanguage undefined, so the component
// resolves to the English locale ('ru' only when resolvedLanguage === 'ru').

describe('CountryLabel', () => {
  it('renders nothing when code is null', () => {
    const { container } = render(<CountryLabel code={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when code is undefined', () => {
    const { container } = render(<CountryLabel code={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the English country name with a flag for a known ISO code', () => {
    render(<CountryLabel code="DE" />);
    expect(screen.getByText('Germany')).toBeInTheDocument();
    expect(screen.getByText('🇩🇪')).toBeInTheDocument();
  });

  it('hides the flag when noFlag is true', () => {
    render(<CountryLabel code="US" noFlag />);
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.queryByText('🇺🇸')).not.toBeInTheDocument();
  });

  it('renders the raw code for an unknown value (pre-migration data)', () => {
    render(<CountryLabel code="Atlantis" />);
    expect(screen.getByText('Atlantis')).toBeInTheDocument();
  });

  it('passes through a custom className', () => {
    const { container } = render(<CountryLabel code="US" className="text-xs" />);
    expect(container.firstChild).toHaveClass('text-xs');
  });
});
