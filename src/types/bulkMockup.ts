export type BulkJobStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'dismissed';

export interface BulkMockupJob {
  id: string; // bmj_...
  mode: 'without_model' | 'with_model';
  status: BulkJobStatus;
  outputUrls: string[];
  referenceImageUrls: string[];
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface BulkJobSummary {
  queued: number;
  processing: number;
  ready: number;
  /** queued + processing — drives the header badge. */
  pending: number;
}
