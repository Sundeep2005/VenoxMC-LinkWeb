import { render, screen } from '@testing-library/react';
import App from './App';

test('renders VenoxMC link page', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /account link/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /link met discord/i })).toBeInTheDocument();
});
