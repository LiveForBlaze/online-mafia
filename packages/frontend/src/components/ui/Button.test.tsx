import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './Button.js';

describe('Button', () => {
  it('renders its children and defaults to type="button"', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('fires onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('honors an explicit type and forwards extra props', () => {
    render(
      <Button type="submit" aria-label="submit-form">
        Submit
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'submit-form' })).toHaveAttribute('type', 'submit');
  });

  it('merges a custom className with the variant classes', () => {
    render(<Button className="custom-x">X</Button>);
    expect(screen.getByRole('button', { name: 'X' })).toHaveClass('custom-x');
  });
});
