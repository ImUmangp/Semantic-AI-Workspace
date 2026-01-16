# Semantic AI Workspace

An enterprise-ready **Semantic AI platform** built with:
- Azure OpenAI
- Azure AI Search
- Vector embeddings
- Retrieval-Augmented Generation (RAG)
- Azure Entra ID authentication

## Features
- Vector search over uploaded documents
- RAG-based AI answers with citations
- PDF & text ingestion
- Admin dashboard with usage metrics
- Role-based access using Entra ID groups

## Tech Stack
- Backend: Node.js + Express
- Frontend: React (Vite)
- Auth: Azure Entra ID (MSAL)
- AI: Azure OpenAI
- Search: Azure AI Search

## Run locally
```bash
npm install
cd client && npm install
cd ..
node server.js
