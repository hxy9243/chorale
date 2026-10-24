import { act, render } from '@testing-library/react';
import type { ReactElement } from 'react';

export const renderHydrated = async (ui: ReactElement) => {
  let result: ReturnType<typeof render>;
  await act(async () => { result = render(ui); });
  return result!;
};
