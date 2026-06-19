export type ParserErrorCode =
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_READ_FAILED"
  | "DOC_CONVERSION_FAILED"
  | "DOCX_PARSE_FAILED"
  | "PDF_PARSE_FAILED"
  | "PARSE_EMPTY";

export class ParserError extends Error {
  constructor(
    readonly code: ParserErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ParserError";
  }
}

export class RetryableParserError extends ParserError {
  constructor(code: ParserErrorCode, message: string) {
    super(code, message, true);
    this.name = "RetryableParserError";
  }
}

export function isRetryableParserError(error: unknown): error is ParserError {
  return error instanceof ParserError && error.retryable;
}
