import type { MusicSample } from '../types/music';
import { DEFAULT_SCORE_ANNOTATIONS } from './defaultScore';

export const PRESET_SAMPLES: MusicSample[] = [
  {
    id: 'bwv-371-abc',
    title: 'J.S. Bach BWV 371',
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
