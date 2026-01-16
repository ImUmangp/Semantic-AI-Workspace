// server.js
// Serve React build - after azure

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve React build - after azure

//const pdfParse = require("pdf-parse/lib/pdf-parse");
import pdfParse from "pdf-parse";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});


import express from "express";
import path from "path";
import bodyParser from "body-parser";
import axios from "axios";
import multer from "multer";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
//require("dotenv").config();
import {
  SearchClient,
  AzureKeyCredential,
}  from "@azure/search-documents";
dotenv.config();
const {
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  AZURE_SEARCH_ENDPOINT,
  AZURE_OPENAI_API_VERSION,
  AZURE_SEARCH_API_KEY,
  AZURE_SEARCH_INDEX,
  PORT = 3000,

  // Serverless chat model (Foundry)
  FOUNDY_CHAT_ENDPOINT,
  FOUNDY_CHAT_MODEL,
  FOUNDY_CHAT_KEY,
} = process.env;

// -------------------- Express app & static React --------------------
const app = express();
app.use(bodyParser.json());

// Serve React build (client/dist) as static files
app.use(express.static(path.join(__dirname, "client", "dist")));
// ---- Simple in-memory metrics & settings (resets on server restart) ----
const metrics = {
  totalDocumentsIndexed: 0,
  totalUploads: 0,
  totalSearchRequests: 0,
  totalRagRequests: 0,
  lastSearchAt: null,
  lastRagAt: null,
  errorCount: 0,
};

const adminSettings = {
  defaultTopK: 5,
  maxTopK: 20,
  enableLogging: true,      // e.g. control extra logging later
  ragSystemPrompt: "You are a helpful assistant that answers based only on the provided context.",
};

// -------------------- Embeddings helper --------------------
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
    }
  );

  return response.data.data[0].embedding;
}
async function indexDocument({ id, content, source }) {
  const vector = await getEmbedding(content);

  const searchClient = new SearchClient(
    AZURE_SEARCH_ENDPOINT,
    AZURE_SEARCH_INDEX,
    new AzureKeyCredential(AZURE_SEARCH_API_KEY)
  );

  const doc = {
    id,
    content,
    source,
    contentVector: vector,
  };

  await searchClient.uploadDocuments([doc]);
}

// -------------------- Helper: vector search for /search and /rag-chat --------------------
async function searchSimilarDocs(query, topK = 5) {
  if (!query || typeof query !== "string") {
    throw new Error("searchSimilarDocs: query must be a non-empty string");
  }

  const queryEmbedding = await getEmbedding(query);

  const searchClient = new SearchClient(
    AZURE_SEARCH_ENDPOINT,
    AZURE_SEARCH_INDEX,
    new AzureKeyCredential(AZURE_SEARCH_API_KEY)
  );

  const results = await searchClient.search("", {
    vectorSearchOptions: {
      queries: [
        {
          kind: "vector",
          vector: queryEmbedding,
          kNearestNeighborsCount: topK,
          fields: ["contentVector"],
        },
      ],
    },
    select: ["id", "content", "source"],
  });

  const hits = [];
  for await (const result of results.results) {
    hits.push({
      id: result.document.id,
      content: result.document.content,
      source: result.document.source,
      score: result.score,
    });
  }

  return hits;
}

// -------------------- /search – raw vector search endpoint --------------------
app.post("/search", async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Body must contain 'query' string" });
    }
// ---- apply admin settings for TopK ----
    const numericTopK = Number(topK);
    const effectiveTopK =
      Number.isFinite(numericTopK) && numericTopK > 0
        ? Math.min(numericTopK, adminSettings.maxTopK)
        : adminSettings.defaultTopK;

    // ---- metrics: count search request ----
    metrics.totalSearchRequests += 1;
    metrics.lastSearchAt = new Date().toISOString();
    const hits = await searchSimilarDocs(query, topK);

    return res.json({
      query,
      count: hits.length,
      results: hits,
    });
  } catch (err) {
    console.error("Error in /search:", err.response?.data || err.message || err);
      metrics.errorCount += 1; // <-- metrics for errors
    return res.status(500).json({
      error: "Internal server error",
      details: err.response?.data || err.message || "Unknown",
    });
  }
});

// -------------------- Health check --------------------


// -------------------- testChat helper --------------------
async function testChat() {
  try {
    if (!FOUNDY_CHAT_ENDPOINT || !FOUNDY_CHAT_MODEL || !FOUNDY_CHAT_KEY) {
      throw new Error(
        "Serverless chat env vars missing. Check FOUNDY_CHAT_ENDPOINT, FOUNDY_CHAT_MODEL, FOUNDY_CHAT_KEY."
      );
    }

    const response = await axios.post(
      `${FOUNDY_CHAT_ENDPOINT}/chat/completions`,
      {
        model: FOUNDY_CHAT_MODEL,
        messages: [
          { role: "system", content: "You are a helpful AI assistant. Respond briefly." },
          { role: "user", content: "Say hello in one sentence." },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": FOUNDY_CHAT_KEY,
        },
      }
    );

    console.log("\n✅ Serverless GPT reply (testChat):");
    console.log(response.data.choices[0].message.content);
  } catch (err) {
    console.error(
      "\n❌ Error in testChat:",
      err.response?.data || err.message || err
    );
  }
}

// -------------------- /test-chat – quick sanity endpoint --------------------
app.get("/test-chat", async (req, res) => {
  try {
    const response = await axios.post(
      `${FOUNDY_CHAT_ENDPOINT}/chat/completions`,
      {
        model: FOUNDY_CHAT_MODEL,
        messages: [
          { role: "system", content: "You are a helpful AI assistant. Be concise." },
          { role: "user", content: "Say hello!" },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": FOUNDY_CHAT_KEY,
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    res.status(500).json({
      error: "Chat test failed",
      details: err.response?.data || err.message,
    });
  }
});

// -------------------- /rag-chat – full RAG answer + citations + metadata --------------------
app.post("/rag-chat", async (req, res) => {
  try {
    const { query, topK} = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Body must contain 'query' string" });
    }

    if (!FOUNDY_CHAT_ENDPOINT || !FOUNDY_CHAT_MODEL || !FOUNDY_CHAT_KEY) {
      return res.status(500).json({
        error: "RAG chat not configured",
        details:
          "Missing FOUNDY_CHAT_ENDPOINT, FOUNDY_CHAT_MODEL, or FOUNDY_CHAT_KEY in environment.",
      });
    }
    const effectiveTopK =
      typeof topK === "number" && !isNaN(topK)
        ? Math.min(topK, adminSettings.maxTopK)
        : adminSettings.defaultTopK;

    metrics.totalRagRequests += 1;
    metrics.lastRagAt = new Date().toISOString();
    const hits = await searchSimilarDocs(query, topK);

    if (!hits || hits.length === 0) {
      return res.json({
        query,
        answer:
          "I could not find any relevant information in the indexed documents for this question.",
        documents: [],
      });
    }

    const contextBlocks = hits.map(
      (h, index) =>
        `[Doc #${index + 1}] Source: ${h.source || "unknown"} | Id: ${
          h.id
        } | Score: ${h.score}\n${h.content}`
    );
    const contextText = contextBlocks.join("\n\n");

    const messages = [
      {
        role: "system",
        content: `
You are a helpful assistant that answers questions ONLY using the provided context.
If the answer is not present in the context, clearly say:
"I’m not able to find this information in the provided documents."

When you answer:
- Give a clear, concise answer.
- At the end, add a "Sources:" section with bullet points like:
  - [Doc #1] short explanation of why it was used.
Do NOT invent sources or ids that are not in the context.
        `.trim(),
      },
      {
        role: "user",
        content: `
CONTEXT:
${contextText}

QUESTION:
${query}
        `.trim(),
      },
    ];

    const resp = await axios.post(
      `${FOUNDY_CHAT_ENDPOINT}/chat/completions`,
      {
        model: FOUNDY_CHAT_MODEL,
        messages,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": FOUNDY_CHAT_KEY,
        },
      }
    );

    const answer =
      resp.data?.choices?.[0]?.message?.content ||
      "No answer returned by the model.";

    return res.json({
      query,
      answer,
      documents: hits,
    });
  } catch (err) {
    console.error(
      "Error in /rag-chat:",
      err.response?.status,
      err.response?.data || err.message || err
    );
metrics.errorCount += 1;

    return res.status(500).json({
      error: "RAG chat failed",
      details: err.response?.data || err.message || "Unknown error",
    });
  }
});
app.post("/upload-knowledge", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded." });
    }

    const results = [];

    for (const file of req.files) {
      const ext = (path.extname(file.originalname) || "").toLowerCase();
      let text = "";

      if (ext === ".txt") {
        text = file.buffer.toString("utf8");
      } else if (ext === ".pdf") {
        try {
          const data = await pdfParse(file.buffer);
          text = data.text || "";
        } catch (pdfErr) {
          console.error("PDF parse failed:", pdfErr);
          results.push({
            file: file.originalname,
            status: "failed",
            reason: "PDF parsing error",
          });
          continue;
        }
      } else {
        results.push({
          file: file.originalname,
          status: "skipped",
          reason: "Unsupported extension",
        });
        continue;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        results.push({
          file: file.originalname,
          status: "skipped",
          reason: "Empty or unreadable content",
        });
        continue;
      }

      const limited = trimmed.slice(0, 8000);

      const baseName = path.basename(file.originalname, ext);
      const safeBase = baseName.replace(/[^A-Za-z0-9_\-=]/g, "-");
      const id = `${Date.now()}-${safeBase}`;

      await indexDocument({
        id,
        content: limited,
        source: file.originalname,
      });

      metrics.totalDocumentsIndexed += 1;
      metrics.totalUploads += 1;

      results.push({
        file: file.originalname,
        status: "ingested",
      });
    }

    return res.json({ success: true, results });
  } catch (err) {
    console.error("Error in /upload-knowledge:", err);
    return res.status(500).json({
      error: "Failed to ingest uploaded files.",
      details: err.message || err,
    });
  }
});





app.get("/health", (req, res) => {
  res.send("Vector search + RAG API is running ✅");
});
// ---- Admin: get current metrics ----
app.get("/admin/stats", (req, res) => {
  return res.json({
    metrics,
    settings: adminSettings,
  });
});

// ---- Admin: update settings (e.g., topK, logging, system prompt) ----
app.post("/admin/settings", (req, res) => {
  const { defaultTopK, maxTopK, enableLogging, ragSystemPrompt } = req.body || {};

  if (typeof defaultTopK === "number" && !isNaN(defaultTopK)) {
    adminSettings.defaultTopK = defaultTopK;
  }

  if (typeof maxTopK === "number" && !isNaN(maxTopK)) {
    adminSettings.maxTopK = maxTopK;
  }

  if (typeof enableLogging === "boolean") {
    adminSettings.enableLogging = enableLogging;
  }

  if (typeof ragSystemPrompt === "string" && ragSystemPrompt.trim()) {
    adminSettings.ragSystemPrompt = ragSystemPrompt.trim();
  }

  return res.json({
    ok: true,
    settings: adminSettings,
  });
});

// -------------------- SPA root (React app) -------------------- uncomment if not in azure
//app.get("/", (req, res) => {
 // res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
//});




// Serve React build - after azure
app.use(express.static(path.join(__dirname, "client", "dist")));

//app.get("/*", (req, res) => {
//  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
//});
// SPA fallback (Express 5 safe)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});
// -------------------- Start server or run CLI test --------------------
//if (process.argv[2] === "test-chat") {
//  testChat().then(() => process.exit(0));
//} else {
 // app.listen(PORT, () => {
   // console.log(`Server running on http://localhost:${PORT}`);
  //});
//}
// -------------------- Start server or run CLI test --------------------
if (process.argv[2] === "test-chat") {
  testChat().then(() => process.exit(0));
} else {
  const port = process.env.PORT || 3000;

  app.listen(port, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${port}`);
  });
}

