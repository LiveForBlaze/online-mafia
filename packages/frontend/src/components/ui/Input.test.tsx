import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Input } from './Input.js';

describe('Input', () => {
  it('renders a textbox and defaults to type="text"', () => {
    render(<Input aria-label="name" />);
    const input = screen.getByRole('textbox', { name: 'name' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });

  it('honors an explicit type', () => {
    render(<Input type="email" aria-label="email" />);
    expect(screen.getByRole('textbox', { name: 'email' })).toHaveAttribute('type', 'email');
  });

  it('accepts typed input and fires onChange', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="field" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'field' });
    await userEvent.type(input, 'hi');
    expect(input).toHaveValue('hi');
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards the placeholder', () => {
    render(<Input placeholder="type here" />);
    expect(screen.getByPlaceholderText('type here')).toBeInTheDocument();
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Input aria-label="d" disabled />);
    expect(screen.getByRole('textbox', { name: 'd' })).toBeDisabled();
  });

  it('forwards a ref to the underlying input', () => {
    const ref = vi.fn();
    render(<Input ref={ref} aria-label="r" />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('merges a custom className with the base classes', () => {
    render(<Input aria-label="c" className="custom-input" />);
    const input = screen.getByRole('textbox', { name: 'c' });
    expect(input).toHaveClass('custom-input');
    expect(input).toHaveClass('rounded-md');
  });
});
