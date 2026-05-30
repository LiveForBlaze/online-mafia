import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PasswordField } from './PasswordField.js';

// The i18n mock returns the key verbatim, so the toggle's accessible name is
// 'common.showPassword' when hidden and 'common.hidePassword' when visible.

describe('PasswordField', () => {
  it('renders a label wired to a password input (masked by default)', () => {
    render(<PasswordField label="Password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
  });

  it('starts with a "show" toggle button', () => {
    render(<PasswordField label="Password" />);
    expect(screen.getByRole('button', { name: 'common.showPassword' })).toBeInTheDocument();
  });

  it('toggles the input to text and back when the eye button is clicked', async () => {
    render(<PasswordField label="Password" />);
    const input = screen.getByLabelText('Password');

    await userEvent.click(screen.getByRole('button', { name: 'common.showPassword' }));
    expect(input).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'common.hidePassword' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders the error message and marks the input invalid', () => {
    render(<PasswordField label="Password" error="Too short" />);
    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables both the input and the toggle when disabled', () => {
    render(<PasswordField label="Password" disabled />);
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'common.showPassword' })).toBeDisabled();
  });

  it('accepts a typed value', async () => {
    render(<PasswordField label="Password" />);
    const input = screen.getByLabelText('Password');
    await userEvent.type(input, 'secret');
    expect(input).toHaveValue('secret');
  });
});
