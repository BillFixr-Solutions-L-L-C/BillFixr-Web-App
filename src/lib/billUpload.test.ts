import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_BILL_MIME_TYPES, MAX_BILL_BYTES, prepareBillFile } from "./billUpload";

// Tiny real 1x1 fixtures so pdf-lib's embedPng/embedJpg have valid bytes to parse.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function fixtureFile(name: string, type: string, base64: string): File {
  return new File([base64ToUint8Array(base64) as BlobPart], name, { type });
}

function fileList(files: File[]): FileList {
  const list: Record<string | number, unknown> = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () {
      yield* files;
    },
  };
  files.forEach((file, i) => {
    list[i] = file;
  });
  return list as unknown as FileList;
}

beforeEach(() => {
  // jsdom doesn't implement createObjectURL; stub it so loadImage() doesn't throw.
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
  // jsdom's Image never fires onload on its own — resolve it immediately with a fixed size.
  vi.stubGlobal(
    "Image",
    class {
      width = 100;
      height = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        Promise.resolve().then(() => this.onload?.());
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prepareBillFile", () => {
  it("rejects an unsupported file type", async () => {
    const file = fixtureFile("resume.docx", "application/msword", "");
    await expect(prepareBillFile(fileList([file]))).rejects.toThrow(/supported file type/);
  });

  it("rejects mixing a PDF with photos", async () => {
    const pdf = fixtureFile("bill.pdf", "application/pdf", "");
    const photo = fixtureFile("page.png", "image/png", PNG_BASE64);
    await expect(prepareBillFile(fileList([pdf, photo]))).rejects.toThrow(/single PDF, or one or more photos/);
  });

  it("rejects a single PDF over the 10MB limit", async () => {
    const big = new File([new Uint8Array(MAX_BILL_BYTES + 1)], "big.pdf", { type: "application/pdf" });
    await expect(prepareBillFile(fileList([big]))).rejects.toThrow(/too large/);
  });

  it("passes a single PDF under the limit through unchanged", async () => {
    const pdf = fixtureFile("bill.pdf", "application/pdf", "");
    const result = await prepareBillFile(fileList([pdf]));
    expect(result.name).toBe("bill.pdf");
    expect(result.type).toBe("application/pdf");
  });

  it("accepts a single photo", async () => {
    const photo = fixtureFile("page.jpg", "image/jpeg", JPEG_BASE64);
    const result = await prepareBillFile(fileList([photo]));
    expect(result.type).toBe("image/jpeg");
  });

  it("merges multiple photos into a single PDF", async () => {
    const page1 = fixtureFile("page1.png", "image/png", PNG_BASE64);
    const page2 = fixtureFile("page2.jpg", "image/jpeg", JPEG_BASE64);
    const result = await prepareBillFile(fileList([page1, page2]));
    expect(result.type).toBe("application/pdf");
    expect(result.name).toBe("bill.pdf");
  });

  it("only allows pdf/png/jpeg, matching the server-side bucket allowlist", () => {
    expect(ALLOWED_BILL_MIME_TYPES).toEqual(["application/pdf", "image/png", "image/jpeg"]);
  });
});
