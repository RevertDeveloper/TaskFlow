export type LocalStorageErrorCode = "validation" | "quota" | "transaction" | "unknown";

export class LocalStorageError extends Error {
  readonly code: LocalStorageErrorCode;

  constructor(code: LocalStorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalStorageError";
    this.code = code;
  }
}

export class LocalStorageValidationError extends LocalStorageError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("validation", message, options);
    this.name = "LocalStorageValidationError";
  }
}

export class LocalStorageQuotaError extends LocalStorageError {
  constructor(options?: { cause?: unknown }) {
    super("quota", "No hay espacio suficiente para guardar los datos locales.", options);
    this.name = "LocalStorageQuotaError";
  }
}

export class LocalStorageTransactionError extends LocalStorageError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("transaction", message, options);
    this.name = "LocalStorageTransactionError";
  }
}