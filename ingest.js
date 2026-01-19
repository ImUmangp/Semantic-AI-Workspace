// ingest.js (ES Module compatible)

import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

import {
  SearchClient,
  AzureKeyCredential,
} from "@azure/search-documents";

import { extractTextWithOCR } from "./services/ocrServices.js";

// ------------------ Path helpers ------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------ Env ------------------
const {
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  AZURE_SEARCH_ENDPOINT,
  AZURE_SEARCH_API_KEY,
  AZURE_OPENAI_API_VERSION,
  AZURE_SEARCH_INDEX,
} = process.env;

// ------------------ Chunking ------------------
function chunkText(text, maxChars = 800) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    chunks.push(text.slice(start, start + maxChars));
    start += maxChars;
  }

  return chunks;
}

// ------------------ OCR Decision ------------------
function needsOCR(text, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".txt") return false;
  return !text || text.trim().length < 50;
}

// ------------------ Embeddings ------------------
async function getEmbedding(text) {
  const url =
    `${AZURE_OPENAI_ENDPOINT}` +
    `openai/deployments/${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings` +
    `?api-version=${AZURE_OPENAI_API_VERSION}`;

  const response = await axios.post(
    url,
    {
      input: [text],
      model: AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_API_KEY,
      },
      timeout: 30000,
    }
  );

  return response.data.data[0].embedding;
}

// ------------------ Ingestion ------------------
async function ingest() {
  try {
    const dataDir = path.join(__dirname, "data");
    const files = fs.readdirSync(dataDir).filter((f) =>
      /\.(txt|pdf|png|jpg|jpeg)$/i.test(f)
    );

    if (files.length === 0) {
      console.warn("No supported files found in /data");
      return;
    }

    console.log("Files found:", files);

    const searchClient = new SearchClient(
      AZURE_SEARCH_ENDPOINT,
      AZURE_SEARCH_INDEX,
      new AzureKeyCredential(AZURE_SEARCH_API_KEY)
    );

    const docs = [];

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      let rawText = "";

      // ---- TXT ----
      if (file.endsWith(".txt")) {
        rawText = fs.readFileSync(filePath, "utf8");
      }

      // ---- OCR path ----
      if (needsOCR(rawText, file)) {
        console.log(`OCR triggered for file: ${file}`);
        try {
          rawText = await extractTextWithOCR(filePath);
          if (!rawText || rawText.trim().length < 50) {
            console.warn(`OCR output too small for ${file}, skipping`);
            continue;
          }
        } catch (err) {
          console.error(`OCR failed for ${file}:`, err.message);
          continue;
        }
      }

      if (!rawText.trim()) continue;

      const chunks = chunkText(rawText);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i].trim();
        if (!chunk) continue;

        console.log(`Embedding ${file} (chunk ${i + 1}/${chunks.length})`);
        const embedding = await getEmbedding(chunk);

        docs.push({
          id: uuidv4(),
          content: chunk,
          source: file,
          contentVector: embedding,
        });
      }
    }

    if (!docs.length) {
      console.warn("No documents generated for indexing");
      return;
    }

    console.log(`Uploading ${docs.length} documents to Azure AI Search...`);
    await searchClient.uploadDocuments(docs);

    console.log("Ingestion complete ✅");
  } catch (err) {
    console.error("Ingestion error:", err);
  }
}

// ------------------ Run ------------------
ingest();
