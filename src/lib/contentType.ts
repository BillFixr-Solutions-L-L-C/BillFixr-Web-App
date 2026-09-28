// Storage doesn't hand back a content type, and the AI service needs one
// on the multipart part it receives, so it's derived from the filename.
export function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}
