import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from '../Header';

describe('Header Component', () => {
  it('renders brand logo title and action buttons', () => {
    render(<Header activeFileName="Test Score.xml" chatOpen={true} onToggleChat={() => {}} />);
    expect(screen.getByText('Chorale')).toBeDefined();
    expect(screen.getByText('Test Score.xml')).toBeDefined();
    expect(screen.getByText('Share')).toBeDefined();
    expect(screen.getByTitle('Hide score chat')).toBeDefined();
    expect(screen.getByText('Saved just now')).toBeDefined();
  });
});
