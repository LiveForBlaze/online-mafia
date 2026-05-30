import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Avatar } from './Avatar.js';

describe('Avatar', () => {
  it('renders the nickname initial when avatarUrl is null', () => {
    render(<Avatar avatarUrl={null} nickname="Alice" />);
    // No image — the initial span carries the letter.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('falls back to "?" when the nickname has no letter or digit', () => {
    render(<Avatar avatarUrl={undefined} nickname="!!!" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders a standard avatar id as a local image path', () => {
    render(<Avatar avatarUrl="avatar-01" nickname="Bob" />);
    const img = screen.getByRole('img', { name: 'Bob' });
    expect(img).toHaveAttribute('src', '/avatars/avatar-01.jpg');
  });

  it('renders a full URL avatar verbatim', () => {
    const url = 'https://example.com/photo.jpg';
    render(<Avatar avatarUrl={url} nickname="Carol" />);
    const img = screen.getByRole('img', { name: 'Carol' });
    expect(img).toHaveAttribute('src', url);
  });

  it('applies a fixed pixel size via inline style by default', () => {
    render(<Avatar avatarUrl={null} nickname="Dan" size={64} />);
    const span = screen.getByText('D');
    expect(span).toHaveStyle({ width: '64px', height: '64px' });
  });

  it('uses circle radius by default and square radius when requested', () => {
    const { rerender } = render(<Avatar avatarUrl="avatar-02" nickname="E" />);
    expect(screen.getByRole('img')).toHaveClass('rounded-full');

    rerender(<Avatar avatarUrl="avatar-02" nickname="E" shape="square" />);
    expect(screen.getByRole('img')).toHaveClass('rounded-md');
  });

  it('fills the container when size is null', () => {
    render(<Avatar avatarUrl="avatar-03" nickname="F" size={null} />);
    const img = screen.getByRole('img');
    expect(img).toHaveClass('w-full');
    expect(img).toHaveClass('h-full');
    expect(img).not.toHaveAttribute('style');
  });

  it('merges a custom className', () => {
    render(<Avatar avatarUrl={null} nickname="G" className="ring-2" />);
    expect(screen.getByText('G')).toHaveClass('ring-2');
  });
});
