import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfirmDialog } from './ConfirmDialog.js';

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = {
    open: true,
    title: 'Kick player',
    message: 'Are you sure?',
    confirmLabel: 'Kick',
    onConfirm,
    onCancel,
    ...overrides,
  };
  render(<ConfirmDialog {...props} />);
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });

  it('renders title and message when open', () => {
    setup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kick player' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('renders the confirm label and the default cancel label', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Kick' })).toBeInTheDocument();
    // Default cancel label comes from t('common.cancel') → key verbatim.
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
  });

  it('uses a custom cancel label when provided', () => {
    setup({ cancelLabel: 'Back' });
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.cancel' })).not.toBeInTheDocument();
  });

  it('fires onConfirm when the confirm button is clicked', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Kick' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is clicked', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables both buttons while pending', () => {
    setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Kick' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeDisabled();
  });

  it('applies a danger style to the confirm button when destructive', () => {
    setup({ destructive: true });
    expect(screen.getByRole('button', { name: 'Kick' })).toHaveClass('bg-danger');
  });
});
