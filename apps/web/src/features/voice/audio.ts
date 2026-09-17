export const AUDIO_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"] as const;
export type AudioMimeType = (typeof AUDIO_MIME_TYPES)[number];

export const DEFAULT_MAX_AUDIO_SECONDS = 300;
export const DEFAULT_MAX_AUDIO_BYTES = 25_000_000;

const MIME_EXTENSIONS: Record<AudioMimeType, string> = {
  "audio/webm": ".webm",
  "audio/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
};

export class AudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioValidationError";
  }
}

export function normalizeAudioMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0].trim().toLowerCase();
}

export function isAllowedAudioMimeType(mimeType: string): mimeType is AudioMimeType {
  return AUDIO_MIME_TYPES.includes(normalizeAudioMimeType(mimeType) as AudioMimeType);
}

export function validateAudioBlob(
  blob: Blob,
  maxBytes = DEFAULT_MAX_AUDIO_BYTES,
): asserts blob is Blob & { type: AudioMimeType } {
  if (blob.size <= 0) {
    throw new AudioValidationError("La grabación está vacía.");
  }
  if (blob.size > maxBytes) {
    throw new AudioValidationError("La grabación supera el tamaño máximo permitido.");
  }
  if (!isAllowedAudioMimeType(blob.type)) {
    throw new AudioValidationError("El formato de grabación no está permitido.");
  }
}

export function selectRecordingMimeType(): AudioMimeType | null {
  if (typeof MediaRecorder === "undefined") {
    throw new AudioValidationError("Este navegador no permite grabar audio.");
  }
  return AUDIO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

export function audioFileName(mimeType: string): string {
  const normalizedType = normalizeAudioMimeType(mimeType) as AudioMimeType;
  return `taskflow-recording${MIME_EXTENSIONS[normalizedType] ?? ".webm"}`;
}