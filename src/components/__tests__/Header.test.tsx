import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from '../Header';

describe('Header Component', () => {
  it('renders application title and badge correctly', () => {
    render(<Header />);
    expect(screen.getByText('Chorale Player')).toBeDefined();
    expect(screen.getByText(/abcjs \+ xml2abc PoC/)).toBeDefined();
  });
});
