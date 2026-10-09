export interface UploadedFile {
  name: string;
  mediaType: string; // application/pdf, image/png, image/jpeg, image/webp
  base64: string;
}

/** What to read from a file: the instructions and the JSON Schema the answer must follow. */
export interface ReadTask {
  name: string; // used for tool names and logs, e.g. "record_documents"
  system: string;
  user: string;
  jsonSchema: object;
}

/** A model that reads one file and answers in JSON for the given task. It decides nothing. */
export interface ExtractionProvider {
  name: string;
  /** retryFeedback is the validation error from the previous attempt, if any. */
  transcribe(file: UploadedFile, task: ReadTask, retryFeedback: string | null): Promise<{ output: unknown; truncated: boolean }>;
}

export const SUPPORTED_MEDIA = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
