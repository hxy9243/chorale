import { describe, expectTypeOf, it } from 'vitest';
import type { Annotation } from '../../types/document';
import type { MusicContextSnapshot } from '../types';

describe('agent transport contracts', () => {
  it('reuses the canonical document annotation type', () => {
    expectTypeOf<NonNullable<MusicContextSnapshot['annotations']>>()
      .toEqualTypeOf<Annotation[]>();
  });
});
