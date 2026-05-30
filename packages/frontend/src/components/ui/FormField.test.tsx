import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FormField } from './FormField.js';

describe('FormField', () => {
  it('renders a label wired to the input', () => {
    render(<FormField label="Nickname" />);
    const input = screen.getByLabelText('Nickname');
    expect(input).toBeInTheDocument();
    const label = screen.getByText('Nickname');
    expect(label).toHaveAttribute('for', input.id);
    expect(input.id).toBeTruthy();
  });

  it('uses an explicit id when given', () => {
    render(<FormField label="Email" id="email-field" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email-field');
  });

  it('does not render an error message when error is absent', () => {
    render(<FormField label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('renders the error message and marks the input invalid', () => {
    render(<FormField label="Name" error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('forwards input props like placeholder and value', () => {
    render(<FormField label="City" placeholder="Berlin" defaultValue="Lyon" />);
    const input = screen.getByLabelText('City');
    expect(input).toHaveAttribute('placeholder', 'Berlin');
    expect(input).toHaveValue('Lyon');
  });

  it('merges a custom className on the wrapper', () => {
    const { container } = render(<FormField label="X" className="custom-wrap" />);
    expect(container.firstChild).toHaveClass('custom-wrap');
  });
});
