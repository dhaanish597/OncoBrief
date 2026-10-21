export * from './evidence/state';
export * from './evidence/transitions';

/**
 * The 6 explicit review states recommended for human-in-the-loop clinical workflow:
 * 'extracted' | 'needs_review' | 'conflicting' | 'verified' | 'corrected' | 'rejected'
 */
export type ReviewState =
  | 'extracted'
  | 'needs_review'
  | 'conflicting'
  | 'verified'
  | 'corrected'
  | 'rejected';

export const REVIEW_STATES: readonly ReviewState[] = [
  'extracted',
  'needs_review',
  'conflicting',
  'verified',
  'corrected',
  'rejected',
];
