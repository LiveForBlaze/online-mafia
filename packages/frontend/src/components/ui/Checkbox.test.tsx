import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from './Checkbox.js';

describe('Checkbox', () => {
  it('renders a checkbox associated with its label', () => {
    render(<Checkbox label="Accept terms" />);
    const box = screen.getByRole('checkbox', { name: 'Accept terms' });
    expect(box).toBeInTheDocument();
    expect(box).toHaveAttribute('type', 'checkbox');
    expect(box).not.toBeChecked();
  });

  it('wires the label to the input via a generated id when none is given', () => {
    render(<Checkbox label="Subscribe" />);
    const box = screen.getByRole('checkbox', { name: 'Subscribe' });
    const label = screen.getByText('Subscribe');
    expect(box.id).toBeTruthy();
    expect(label).toHaveAttribute('for', box.id);
  });

  it('honors an explicit id', () => {
    render(<Checkbox label="Pin" id="pin-box" />);
    const box = screen.getByRole('checkbox', { name: 'Pin' });
    expect(box).toHaveAttribute('id', 'pin-box');
    expect(screen.getByText('Pin')).toHaveAttribute('for', 'pin-box');
  });

  it('reflects the controlled checked prop', () => {
    render(<Checkbox label="On" checked readOnly />);
    expect(screen.getByRole('checkbox', { name: 'On' })).toBeChecked();
  });

  it('toggles and fires onChange when clicked', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Toggle me" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Toggle me' });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not toggle when disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="No" disabled onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'No' });
    expect(box).toBeDisabled();
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('merges a custom className on the wrapper', () => {
    const { container } = render(<Checkbox label="X" className="custom-wrap" />);
    expect(container.firstChild).toHaveClass('custom-wrap');
  });
});
