export interface UploadedFile {
  name: string;
  mediaType: string; // application/pdf, image/png, image/jpeg, image/webp
  base64: string;
}

/** A model that transcribes one file into JSON shaped like FileExtraction. Nothing else. */
export interface ExtractionProvider {
  name: string;
  /** retryFeedback is the validation error from the previous attempt, if any. */
  transcribe(file: UploadedFile, retryFeedback: string | null): Promise<{ output: unknown; truncated: boolean }>;
}

export const SUPPORTED_MEDIA = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
