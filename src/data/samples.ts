import type { MusicSample } from '../types/music';

export const PRESET_SAMPLES: MusicSample[] = [
  {
    id: 'fur-elise-mxl',
    title: 'Für Elise (MXL Archive)',
    composer: 'Ludwig van Beethoven',
    filename: 'samples/fur_elise.mxl',
    type: 'mxl',
  },
  {
    id: 'twinkle-xml',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional / W.A. Mozart',
    filename: 'samples/twinkle_twinkle.xml',
    type: 'xml',
  },
  {
    id: 'fur-elise-xml',
    title: 'Für Elise (MusicXML)',
    composer: 'Ludwig van Beethoven',
    filename: 'samples/fur_elise.xml',
    type: 'xml',
  },
];
