import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ComingSoon } from './ComingSoon.js';

describe('ComingSoon', () => {
  it('renders the title as a heading and the "soon" tagline', () => {
    render(<ComingSoon title="Tournaments" />);
    expect(screen.getByRole('heading', { name: 'Tournaments' })).toBeInTheDocument();
    // t('common.soon') → key verbatim from the i18n mock.
    expect(screen.getByText('common.soon')).toBeInTheDocument();
  });

  it('renders the optional description when provided', () => {
    render(<ComingSoon title="Clubs" description="Coming next month" />);
    expect(screen.getByText('Coming next month')).toBeInTheDocument();
  });

  it('omits the description paragraph when not provided', () => {
    render(<ComingSoon title="Ratings" />);
    expect(screen.queryByText('Coming next month')).not.toBeInTheDocument();
  });
});
