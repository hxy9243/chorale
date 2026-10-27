import type { MusicSample } from '../types/music';
import { DEFAULT_SCORE_ANNOTATIONS, DEFAULT_SCORE_TITLE } from './defaultScore';

export const PRESET_SAMPLES: MusicSample[] = [
  {
    // Retain the legacy ID and asset URL for existing sample links.
    id: 'bwv-371-abc',
    title: DEFAULT_SCORE_TITLE,
    composer: 'J.S. Bach',
    filename: 'samples/bwv_371.abc',
    type: 'abc',
    initialAnnotations: DEFAULT_SCORE_ANNOTATIONS,
  },
  {
    id: 'moonlight-sonata-xml',
    title: 'Moonlight Sonata (MusicXML)',
    composer: 'Ludwig van Beethoven',
    filename: 'samples/moonlight_sonata.xml',
    type: 'xml',
  },
  {
    id: 'twinkle-xml',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional / W.A. Mozart',
    filename: 'samples/twinkle_twinkle.xml',
    type: 'xml',
  },
];
