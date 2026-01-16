// ingest.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const {
  SearchClient,
  AzureKeyCredential,
} = require("@azure/search-documents");

const {
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  AZURE_SEARCH_ENDPOINT,
  AZURE_SEARCH_API_KEY,
  AZURE_OPENAI_API_VERSION,
  AZURE_SEARCH_INDEX,
} = process.env;

// --------- Chunk text ----------
function chunkText(text, maxChars = 800) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

// --------- Foundry Embedding Function (Updated) ----------
async function getEmbedding(text) {
   const url =
    `${AZURE_OPENAI_ENDPOINT}` +
    `openai/deployments/${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings` +
    `?api-version=${AZURE_OPENAI_API_VERSION}`;

  console.log("---- Embedding request debug ----");
  console.log("URL:", url);
  console.log("Model Name:", AZURE_OPENAI_EMBEDDING_DEPLOYMENT);
  console.log("Endpoint:", AZURE_OPENAI_ENDPOINT);
  console.log("---------------------------------");

  try {
    const response = await axios.post(
      url,
      {
        input: [text], // array required by Foundry
        model: AZURE_OPENAI_EMBEDDING_DEPLOYMENT, // "embeddings-deployment"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": AZURE_OPENAI_API_KEY, // Foundry Key 1
        },
        timeout: 30000,
      }
    );

    return response.data.data[0].embedding;
  } catch (err) {
    console.error("Embedding API error:", err.response?.data || err.message);
    throw err;
  }
}

// --------- Main Ingestion (Multi-file) ----------
async function ingest() {
  try {
    const dataDir = path.join(__dirname, "data");
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".txt"));

    if (files.length === 0) {
      console.error("No .txt files found in /data directory.");
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
      const rawText = fs.readFileSync(filePath, "utf8");

      if (!rawText || !rawText.trim()) {
        console.error(`Skipping empty file: ${file}`);
        continue;
      }

      const chunks = chunkText(rawText, 800);
      console.log(`File "${file}" -> ${chunks.length} chunks`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i].trim();
        if (!chunk) continue;

        console.log(`Embedding ${file} (chunk ${i + 1}/${chunks.length})...`);
        const embedding = await getEmbedding(chunk);

        docs.push({
          id: uuidv4(),
          content: chunk,
          source: file,
          contentVector: embedding,
        });
      }
    }

    console.log(`Uploading ${docs.length} documents to Azure AI Search...`);
    const result = await searchClient.uploadDocuments(docs);

    console.log("Upload result:", result.results);
    console.log("Ingestion complete ✅");
  } catch (err) {
    console.error("Error in ingestion:", err);
  }
}

// Run
ingest();
