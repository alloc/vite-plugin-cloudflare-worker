export const enum MimeType {
  TXT,
  HTML,
}

/** Get `Content-Type` header for `MimeType` enum */
export const getContentType = (type: MimeType) =>
  (type == MimeType.HTML ? 'text/html' : 'text/plain') + ';charset=utf-8'
