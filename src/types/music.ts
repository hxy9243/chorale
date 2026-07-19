export interface MusicSample {
  id: string;
  title: string;
  composer: string;
  filename: string;
  type: 'xml' | 'mxl';
}

export interface ScoreMeta {
  title?: string;
  composer?: string;
  key?: string;
  timeSignature?: string;
  bpm?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  tempo: number; // percentage scale or actual BPM
  volume: number; // 0 to 1
}
