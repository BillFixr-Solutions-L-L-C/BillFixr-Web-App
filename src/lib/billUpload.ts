import { PDFDocument } from "pdf-lib";

// Mirrors the server-side enforcement in
// supabase/migrations/20260910000000_storage_bucket_limits.sql — kept in
// sync manually since Supabase Storage config isn't introspectable from
// the client at runtime.
export const ALLOWED_BILL_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const MAX_BILL_BYTES = 10 * 1024 * 1024; // 10MB

// Moderate compression: enough to meaningfully cut storage/bandwidth for a
// phone-camera photo without visibly degrading a scanned bill.
const MAX_IMAGE_DIMENSION = 2000;
const IMAGE_QUALITY = 0.8;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read "${file.name}" as an image.`));
    };
    img.src = url;
  });
}

async function compressImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // canvas unsupported — fall back to the original file
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY),
  );
  // If compression somehow produced a larger file (rare, e.g. a tiny
  // already-optimized PNG), keep the original instead.
  if (!blob || blob.size >= file.size) return file;
  return blob;
}

async function mergeImagesToPdf(images: Blob[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (const image of images) {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const embedded =
      image.type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/**
 * Validates the user's file picker selection and, for photos, compresses
 * (and merges multi-page selections into one PDF) before it ever reaches
 * upload. Throws a user-facing message on anything invalid.
 */
export async function prepareBillFile(fileList: FileList): Promise<File> {
  const files = Array.from(fileList);
  if (files.length === 0) throw new Error("No file selected.");

  for (const file of files) {
    if (!ALLOWED_BILL_MIME_TYPES.includes(file.type)) {
      throw new Error(`"${file.name}" isn't a supported file type. Please upload a PDF, PNG, or JPEG.`);
    }
  }

  const images = files.filter((f) => f.type !== "application/pdf");
  const pdfs = files.filter((f) => f.type === "application/pdf");

  let result: File;
  if (pdfs.length > 0) {
    if (files.length > 1) {
      throw new Error("Please upload a single PDF, or one or more photos — not a mix.");
    }
    result = pdfs[0];
  } else if (images.length === 1) {
    const compressed = await compressImage(images[0]);
    result = new File([compressed], images[0].name, { type: "image/jpeg" });
  } else {
    const compressed = await Promise.all(images.map(compressImage));
    result = new File([await mergeImagesToPdf(compressed)], "bill.pdf", {
      type: "application/pdf",
    });
  }

  if (result.size > MAX_BILL_BYTES) {
    throw new Error("That file is too large (max 10MB) even after compression. Please try fewer or smaller photos.");
  }
  return result;
}
