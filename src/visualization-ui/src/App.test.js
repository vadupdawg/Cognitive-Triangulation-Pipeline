import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from './app/store';
import App from './App';

import { act } from 'react';

test('renders dashboard and awaits async operations', async () => {
  await act(async () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );
  });
  
  // Use findBy queries which automatically handle waiting for async updates.
  // This will wait for the dashboard to be rendered and for the RTK Query hooks to resolve.
  expect(await screen.findByText(/Pipeline Dashboard/i)).toBeInTheDocument();
});