// services/ocrServices.js
import axios from "axios";

/**
 * Extract text using Azure Computer Vision Read API
 * Supports:
 *  - Buffer (image/pdf from Multer)
 */
export async function extractTextWithOCR(buffer, mimeType) {
  const endpoint = process.env.AZURE_VISION_ENDPOINT;
  const key = process.env.AZURE_VISION_KEY;

  if (!endpoint || !key) {
    throw new Error("Azure Vision OCR configuration missing");
  }

  // ---- Validate input ----
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("OCR expects file buffer");
  }

  // ---- Supported content types ----
  const contentType =
    mimeType === "application/pdf"
      ? "application/pdf"
      : "application/octet-stream";

  // ---- Submit OCR request ----
  const analyzeRes = await axios.post(
    `${endpoint}vision/v3.2/read/analyze`,
    buffer,
    {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": contentType,
      },
      maxBodyLength: Infinity,
    }
  );

  const operationUrl = analyzeRes.headers["operation-location"];
  if (!operationUrl) {
    throw new Error("OCR operation-location header missing");
  }

  // ---- Poll for result ----
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const result = await axios.get(operationUrl, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
      },
    });

    if (result.data.status === "succeeded") {
      return parseOcrResult(result.data);
    }

    if (result.data.status === "failed") {
      throw new Error("Azure OCR failed");
    }
  }

  throw new Error("OCR timeout exceeded");
}

function parseOcrResult(data) {
  const pages = data.analyzeResult?.readResults || [];
  let text = "";

  for (const page of pages) {
    for (const line of page.lines || []) {
      text += line.text + "\n";
    }
  }

  return text.trim();
}
