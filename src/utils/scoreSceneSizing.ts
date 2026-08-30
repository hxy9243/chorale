export const PREFERRED_SCORE_NOTATION_WIDTH_REM = 48;
export const PREFERRED_SCORE_ANNOTATION_WIDTH_REM = 24;
export const MIN_SCORE_ANNOTATION_WIDTH_REM = 16;
export const MIN_SCORE_DRAFTING_TOOLBAR_WIDTH_REM = 10;
export const SCORE_SCENE_GAP_REM = 0.5;

export interface ScoreSceneTracksInput {
  availableWidth: number;
  notationWidth: number;
  annotationWidth: number;
  minAnnotationWidth: number;
  minBalanceWidth?: number;
  gap: number;
}

export interface ScoreSceneTracks {
  balanceWidth: number;
  annotationWidth: number;
}

const sceneWidth = (
  notationWidth: number,
  annotationWidth: number,
  gap: number,
) => notationWidth + 2 * annotationWidth + 2 * gap;

/**
 * Projects the visible sheet viewport width into the three-track scene layout
 * (balance spacer | notation | annotation rail). The balance spacer absorbs
 * missing width first and collapses to zero before the rail narrows toward its
 * minimum floor; beyond that the caller falls back to horizontal overflow.
 */
export const fitScoreSceneTracks = ({
  availableWidth,
  notationWidth,
  annotationWidth,
  minAnnotationWidth,
  minBalanceWidth = 0,
  gap,
}: ScoreSceneTracksInput): ScoreSceneTracks => {
  const safeAvailable = Math.max(0, availableWidth);
  const safeNotation = Math.max(0, notationWidth);
  const preferredAnnotation = Math.max(0, annotationWidth);
  const safeMinAnnotation = Math.min(
    Math.max(0, minAnnotationWidth),
    preferredAnnotation,
  );
  const safeMinBalance = Math.min(
    Math.max(0, minBalanceWidth),
    preferredAnnotation,
  );
  const sceneGap = Math.max(0, gap);

  if (safeAvailable >= sceneWidth(safeNotation, preferredAnnotation, sceneGap)) {
    return { balanceWidth: preferredAnnotation, annotationWidth: preferredAnnotation };
  }

  const railFloorAvailable = safeNotation + safeMinBalance + safeMinAnnotation + 2 * sceneGap;
  if (safeAvailable < railFloorAvailable) {
    return { balanceWidth: safeMinBalance, annotationWidth: safeMinAnnotation };
  }

  const flexibleTrackWidth = safeAvailable - safeNotation - safeMinBalance - 2 * sceneGap;
  if (flexibleTrackWidth <= preferredAnnotation) {
    return { balanceWidth: safeMinBalance, annotationWidth: flexibleTrackWidth };
  }

  return {
    balanceWidth: Math.min(
      preferredAnnotation,
      safeMinBalance + flexibleTrackWidth - preferredAnnotation,
    ),
    annotationWidth: preferredAnnotation,
  };
};
