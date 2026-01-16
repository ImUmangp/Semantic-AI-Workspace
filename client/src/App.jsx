import React, { useState, useEffect } from "react";
import "./App.css";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest } from "./authConfig";
import { ADMIN_GROUP_ID } from "./authConfig";
// ---- MSAL instance + initializer ---------------------------------
const msalInstance = new PublicClientApplication(msalConfig);
let msalReady = false;

async function ensureMsalInitialized() {
  if (!msalReady) {
    await msalInstance.initialize();
    msalReady = true;
  }
}

/* ---------- Top bar (with profile dropdown) ---------- */
function TopBar({ account, onLogout, onOpenSettings, isAdmin }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const userName = account?.name || "Signed in user";
  const userUpn = account?.username || "";
  const initials =
    userName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "U";

  const toggleMenu = () => setMenuOpen((v) => !v);

  const handleSettingsClick = () => {
    if (onOpenSettings) onOpenSettings();
    setMenuOpen(false);
  };

  const handleLogoutClick = () => {
    setMenuOpen(false);
    if (onLogout) onLogout();
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-logo-dot" />
        <div>
          <div className="topbar-title">
            AI Document Workspace
            {isAdmin && <span className="topbar-admin-chip">Admin</span>}
          </div>
          <div className="topbar-subtitle">
            Azure OpenAI · Azure AI Search
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-user-wrapper">
          <button className="topbar-user" type="button" onClick={toggleMenu}>
            <div className="topbar-avatar">{initials}</div>
            <div className="topbar-user-text">
              <div className="topbar-user-name">{userName}</div>
              <div className="topbar-user-upn">
                {userUpn}
                {isAdmin && (
                  <span className="topbar-user-role"> · Admin</span>
                )}
              </div>
            </div>
            <span className="topbar-caret">{menuOpen ? "▲" : "▼"}</span>
          </button>

          {menuOpen && (
            <div className="profile-menu">
              <div className="profile-menu-header">
                <div className="profile-avatar">{initials}</div>
                <div className="profile-text">
                  <div className="profile-name">{userName}</div>
                  {userUpn && <div className="profile-upn">{userUpn}</div>}
                  {isAdmin && (
                    <div className="profile-role-hint">
                      You are signed in as <strong>admin</strong>.
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="profile-menu-item"
                onClick={handleSettingsClick}
              >
                ⚙️ Settings
              </button>
              <button
                type="button"
                className="profile-menu-item profile-menu-danger"
                onClick={handleLogoutClick}
              >
                🔓 Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}



/* ---------- LOGIN PAGE (unchanged except layout is now fixed) ---------- */
function LoginPage({ onLogin }) {
  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-badge">Document Hub</div>
        <h1 className="login-title">Sign in to AI Workspace</h1>
        <p className="login-subtitle">
          Use your Microsoft (Entra ID) account to explore your documents with
          vector search and answers.
        </p>

        <ul className="login-bullets">
          <li>🔍 Ask questions over your indexed notes and logs</li>
          <li>🤖 Get grounded AI answers with citations</li>
          <li>🔐 Secured with Azure Entra ID (your org account)</li>
        </ul>

        <button className="login-button" onClick={onLogin}>
          <span className="login-button-icon">🔑</span>
          <span>Sign in with Microsoft</span>
        </button>

        <p className="login-hint">
          You&apos;ll be redirected to the Microsoft sign-in screen. Your
          organization&apos;s security policies apply.
        </p>
      </div>
    </div>
  );
}

/* ---------- Main workspace with sidebar + tabs ---------- */
function VectorRagPage({ activeTab, setActiveTab,isAdmin }) {
  // ---------- Vector search state ----------
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchStatusClass, setSearchStatusClass] = useState("status");
  const [searchLoading, setSearchLoading] = useState(false);

  // ---------- RAG chat state ----------
  const [ragQuery, setRagQuery] = useState("");
  const [ragAnswer, setRagAnswer] = useState("");
  const [ragSources, setRagSources] = useState([]);
  const [ragStatus, setRagStatus] = useState("");
  const [ragStatusClass, setRagStatusClass] = useState("status");
  const [ragLoading, setRagLoading] = useState(false);

    // ---------- Upload knowledge state ----------
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]); // per-file status
  // ---------- Admin dashboard state ----------
  const [adminStats, setAdminStats] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminForm, setAdminForm] = useState({
    defaultTopK: 5,
    maxTopK: 20,
    enableLogging: true,
    ragSystemPrompt: "",
  });

  // ---------- Toast state ----------
  const [toast, setToast] = useState(null); // { message, type }

  const showToast = (message, type = "info") => {
    setToast({ message, type });
  };

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (activeTab === "admin") {
      loadAdminStats();
    }
  }, [activeTab]);

  // ---------- Raw vector search (/search) ----------
const doSearch = async () => {
    const trimmed = query.trim();
    const k = parseInt(topK, 10) || 5;

    if (!trimmed) {
      showToast("Please enter a query to search.", "warning");
      return;
    }

    setSearchLoading(true);
    setSearchStatus("Searching...");
    setSearchStatusClass("status");
    setResults([]);

    try {
      const res = await fetch("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, topK: k }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      const found = data.count ?? data.results?.length ?? 0;
      setResults(data.results || []);
      setSearchStatus(`Found ${found} result(s).`);
      setSearchStatusClass("status ok");

      showToast(
        `Vector search complete (${found} result${found === 1 ? "" : "s"}).`,
        "success"
      );
    } catch (err) {
      console.error(err);
      setSearchStatus("Error");
      setSearchStatusClass("status error");
      setResults([]);
      showToast(`Vector search failed: ${err.message}`, "error");
    } finally {
      setSearchLoading(false);
    }
  };
  const loadAdminStats = async () => {
    try {
      setAdminLoading(true);
      setAdminError("");
      const res = await fetch("/admin/stats");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch admin stats");
      }
      setAdminStats(data);
      setAdminForm({
        defaultTopK: data.settings.defaultTopK,
        maxTopK: data.settings.maxTopK,
        enableLogging: data.settings.enableLogging,
        ragSystemPrompt: data.settings.ragSystemPrompt,
      });
    } catch (err) {
      console.error(err);
      setAdminError(err.message);
    } finally {
      setAdminLoading(false);
    }
  };
  const saveAdminSettings = async () => {
    try {
      setAdminLoading(true);
      setAdminError("");
      const res = await fetch("/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update settings");
      }
      showToast("Admin settings updated.", "success");
    } catch (err) {
      console.error(err);
      setAdminError(err.message);
      showToast(`Failed to update settings: ${err.message}`, "error");
    } finally {
      setAdminLoading(false);
    }
  };
  const handleAdminNumberChange = (field, value) => {
    const num = parseInt(value, 10);
    setAdminForm((prev) => ({
      ...prev,
      [field]: isNaN(num) ? "" : num,
    }));
  };

  const handleAdminToggle = (field) => {
    setAdminForm((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // ---------- RAG chat (/rag-chat) ----------
  const doRagChat = async () => {
    const effectiveQuery = (ragQuery || query).trim();
    const k = parseInt(topK, 10) || 5;

    if (!effectiveQuery) {
      showToast("Please enter a question for RAG chat.", "warning");
      return;
    }

    setRagLoading(true);
    setRagStatus("Retrieving docs & generating answer...");
    setRagStatusClass("status");
    setRagAnswer("");
    setRagSources([]);

    try {
      const res = await fetch("/rag-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: effectiveQuery, topK: k }),
      });

      const text = await res.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Server returned non-JSON (status ${res.status}). ` +
            text.slice(0, 200) +
            "..."
        );
      }

      if (!res.ok) {
        const msg = data.details || data.error || "RAG request failed";
        throw new Error(msg);
      }

      setRagAnswer(data.answer || "No answer generated.");
      setRagSources(data.documents || []);
      setRagStatus("Answer ready.");
      setRagStatusClass("status ok");

      showToast("RAG answer generated successfully.", "success");
    } catch (err) {
      console.error(err);
      setRagStatus("Error");
      setRagStatusClass("status error");
      setRagAnswer(err.message);
      setRagSources([]);
      showToast(`RAG chat failed: ${err.message}`, "error");
    } finally {
      setRagLoading(false);
    }
  };

  // ---------- Keyboard shortcuts ----------
  const handleVectorKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      doSearch();
    }
  };

  const handleRagKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      doRagChat();
    }
  };
  // ---------- Upload knowledge (/upload-knowledge) ----------
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(files);
    setUploadStatus(
      files.length ? `${files.length} file(s) selected.` : "No files selected."
    );
    setUploadResults([]);
  };

  const doUpload = async () => {
    if (!uploadFiles.length) {
      showToast("Please select at least one PDF or TXT file.", "warning");
      return;
    }

    const formData = new FormData();
    uploadFiles.forEach((file) => formData.append("files", file));

    setUploadLoading(true);
    setUploadStatus("Uploading & ingesting...");
    setUploadResults([]);

    try {
      const res = await fetch("/upload-knowledge", {
        method: "POST",
        body: formData, // important: DO NOT set Content-Type manually
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadStatus(
        `Ingestion complete for ${data.count ?? data.results?.length ?? 0} file(s).`
      );
      setUploadResults(data.results || []);

      showToast("Knowledge upload & ingestion completed.", "success");
    } catch (err) {
      console.error(err);
      setUploadStatus("Error during upload.");
      setUploadResults([]);
      showToast(`Upload failed: ${err.message}`, "error");
    } finally {
      setUploadLoading(false);
    }
  };

  // ---------- Sidebar navigation ----------
 const navItemsBase = [
    { id: "vector", label: "Vector Search", icon: "🔍" },
    { id: "rag", label: "RAG Chat", icon: "🤖" },
    { id: "upload", label: "Upload knowledge", icon: "📤" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  const adminNavItem = { id: "admin", label: "Admin Dashboard", icon: "📊" };

  const navItems = isAdmin
    ? [
        ...navItemsBase.slice(0, 3), // vector, rag, upload
        adminNavItem,
        navItemsBase[3],             // settings
      ]
    : navItemsBase;
  return (
    <div className="app-root">
      <div className="neon-orbit neon-orbit-1" />
      <div className="neon-orbit neon-orbit-2" />
      <div className="neon-orbit neon-orbit-3" />

      <div className="shell fade-in">
        <div className="workspace">
          <aside className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-title">Workspace</div>
              <div className="sidebar-subtitle">
                Vector DB · RAG · Settings
              </div>
            </div>
            <nav className="sidebar-nav">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-item ${
                    activeTab === item.id ? "active" : ""
                  }`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="workspace-main">
            {/* Vector Search tab */}
            {activeTab === "vector" && (
              <section className="panel panel-glass slide-up">
                <div className="panel-header">
                  <div className="panel-title">Vector Search</div>
                  <span className="chip">Raw results</span>
                </div>
                <p className="panel-subtitle">
                  Run pure vector search on your indexed documents and inspect
                  the raw matches &amp; similarity scores.
                </p>

                <label htmlFor="query">Query</label>
                <textarea
                  id="query"
                  rows={3}
                  placeholder="e.g. What does sample1 talk about?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleVectorKeyDown}
                />

                <div className="topk-row">
                  <div style={{ flex: "0 0 auto" }}>
                    <label htmlFor="topK">Top K</label>
                    <input
                      id="topK"
                      type="number"
                      min={1}
                      max={20}
                      value={topK}
                      onChange={(e) => setTopK(e.target.value)}
                    />
                  </div>
                  <div id="status" className={searchStatusClass}>
                    {searchStatus}
                  </div>
                </div>

                <div className="btn-row" style={{ marginTop: 2 }}>
                  <button
                    id="searchBtn"
                    onClick={doSearch}
                    disabled={searchLoading}
                    className="btn-primary"
                  >
                    {searchLoading ? (
                      <>
                        <span className="spinner" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <span className="btn-icon">🔍</span>
                        Search
                      </>
                    )}
                  </button>
                </div>

                <div className="section-title">Vector Search Results</div>
                <div id="results">
                  {results.length === 0 && searchStatus && (
                    <p className="status">No results.</p>
                  )}
                  {results.map((r, idx) => (
                    <div key={r.id ?? idx} className="result result-animate">
                      <div className="source">
                        #{idx + 1} • {r.source || "unknown source"}
                      </div>
                      <div style={{ marginTop: 4 }}>{r.content}</div>
                      {typeof r.score === "number" && (
                        <div className="score">
                          score: {r.score.toFixed(4)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* RAG Chat tab */}
            {activeTab === "rag" && (
              <section className="panel panel-glass slide-up">
                <div className="panel-header">
                  <div className="panel-title">RAG Chat</div>
                  <span className="chip chip-green">
                    AI answer + citations
                  </span>
                </div>
                <p className="panel-subtitle">
                  Ask a question. The assistant retrieves the most relevant
                  chunks and generates a grounded answer with bullet-style
                  citations.
                </p>

                <label htmlFor="ragQuery">Question</label>
                <textarea
                  id="ragQuery"
                  rows={3}
                  placeholder="Ask anything..."
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  onKeyDown={handleRagKeyDown}
                />

                <div className="btn-row">
                  <button
                    id="ragBtn"
                    className="secondary btn-secondary"
                    onClick={doRagChat}
                    disabled={ragLoading}
                  >
                    {ragLoading ? (
                      <>
                        <span className="spinner" />
                        Thinking...
                      </>
                    ) : (
                      <>
                        <span className="btn-icon">🤖</span>
                        Ask AI
                      </>
                    )}
                  </button>
                  <span id="ragStatus" className={ragStatusClass}>
                    {ragStatus}
                  </span>
                </div>

                <div className="section-title">AI Answer</div>
                <div id="ragAnswer" className="answer-box glow-border">
                  {ragAnswer ? (
                    ragAnswer
                  ) : (
                    <span className="answer-placeholder">
                      Your RAG answer will appear here.
                    </span>
                  )}
                </div>

                <div className="section-title">
                  Relevant Sources &amp; Metadata
                </div>
                <div id="ragSources">
                  {ragSources.length === 0 && ragStatus && (
                    <p className="status">No relevant documents found.</p>
                  )}
                  {ragSources.map((doc, i) => {
                    const safeSource = doc.source || "unknown source";
                    const score =
                      typeof doc.score === "number"
                        ? doc.score.toFixed(4)
                        : "n/a";

                    return (
                      <div
                        key={doc.id ?? i}
                        className="doc-box result-animate"
                      >
                        <div className="meta">
                          <strong>[Doc #{i + 1}] {safeSource}</strong>
                          <span className="pill">score: {score}</span>
                        </div>
                        <div className="meta">Id: {doc.id}</div>
                        <div className="doc-content">{doc.content}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
                        {/* Upload knowledge tab */}
            {activeTab === "upload" && (
              <section className="panel panel-glass slide-up">
                <div className="panel-header">
                  <div className="panel-title">Upload knowledge</div>
                  <span className="chip chip-green">PDF &amp; TXT</span>
                </div>
                <p className="panel-subtitle">
                  Upload PDF or text files. The server will extract text,
                  embed it with Azure OpenAI, and push vectors into Azure AI
                  Search so they become part of your knowledge base.
                </p>

                <div className="upload-box">
                  <label className="upload-drop">
                    <span className="upload-icon">📂</span>
                    <div className="upload-text">
                      <div className="upload-title">
                        Drag &amp; drop files here, or click to browse
                      </div>
                      <div className="upload-subtitle">
                        Supported: .pdf, .txt · Up to 10 MB per file
                      </div>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.txt"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />
                  </label>

                  <div className="upload-status-row">
                    <span className="status">{uploadStatus}</span>
                    <button
                      className="btn-primary"
                      onClick={doUpload}
                      disabled={uploadLoading || !uploadFiles.length}
                    >
                      {uploadLoading ? (
                        <>
                          <span className="spinner" />
                          Ingesting...
                        </>
                      ) : (
                        <>
                          <span className="btn-icon">📤</span>
                          Upload &amp; ingest
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {uploadResults.length > 0 && (
                  <>
                    <div className="section-title">Upload results</div>
                    <div className="upload-results">
                      {uploadResults.map((r, i) => (
                        <div key={i} className="upload-result-row">
                          <span className="upload-file-name">{r.file}</span>
                          <span
                            className={`upload-file-status ${
                              r.status === "ingested"
                                ? "ok"
                                : r.status === "skipped"
                                ? "warn"
                                : "err"
                            }`}
                          >
                            {r.status}
                            {r.reason ? ` · ${r.reason}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
{/* Admin Dashboard tab */}
{activeTab === "admin" && isAdmin && (
  <section className="panel panel-glass slide-up">
    <div className="panel-header">
      <div className="panel-title">Admin Dashboard</div>
      <span className="chip">Usage &amp; controls</span>
    </div>
    <p className="panel-subtitle">
      Monitor how the workspace is used and tune global defaults
      for vector search and RAG behavior.
    </p>

    {adminLoading && <p className="status">Loading admin stats...</p>}
    {adminError && (
      <p className="status error">Error loading stats: {adminError}</p>
    )}

    {adminStats && (
      <>
        <div className="admin-metrics-grid">
          <div className="admin-card">
            <div className="admin-card-label">Total docs indexed</div>
            <div className="admin-card-value">
              {adminStats.metrics.totalDocumentsIndexed}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Total uploads</div>
            <div className="admin-card-value">
              {adminStats.metrics.totalUploads}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Vector search calls</div>
            <div className="admin-card-value">
              {adminStats.metrics.totalSearchRequests}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">RAG chat calls</div>
            <div className="admin-card-value">
              {adminStats.metrics.totalRagRequests}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Errors (total)</div>
            <div className="admin-card-value error">
              {adminStats.metrics.errorCount}
            </div>
          </div>
          <div className="admin-card admin-card-small">
            <div className="admin-card-label">Last search</div>
            <div className="admin-card-meta">
              {adminStats.metrics.lastSearchAt || "—"}
            </div>
            <div className="admin-card-label" style={{ marginTop: 4 }}>
              Last RAG
            </div>
            <div className="admin-card-meta">
              {adminStats.metrics.lastRagAt || "—"}
            </div>
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 18 }}>
          Global settings
        </div>
        <div className="admin-settings-grid">
          <div className="admin-settings-group">
            <label>
              Default Top K
              <input
                type="number"
                min={1}
                max={100}
                value={adminForm.defaultTopK}
                onChange={(e) =>
                  handleAdminNumberChange("defaultTopK", e.target.value)
                }
              />
            </label>
            <label>
              Max Top K
              <input
                type="number"
                min={1}
                max={200}
                value={adminForm.maxTopK}
                onChange={(e) =>
                  handleAdminNumberChange("maxTopK", e.target.value)
                }
              />
            </label>
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={adminForm.enableLogging}
                onChange={() => handleAdminToggle("enableLogging")}
              />
              <span>Enable extra logging</span>
            </label>
          </div>
          <div className="admin-settings-group">
            <label>
              RAG system prompt
              <textarea
                rows={4}
                value={adminForm.ragSystemPrompt}
                onChange={(e) =>
                  setAdminForm((prev) => ({
                    ...prev,
                    ragSystemPrompt: e.target.value,
                  }))
                }
              />
            </label>
            <button
              className="btn-primary"
              style={{ marginTop: 8, alignSelf: "flex-start" }}
              onClick={saveAdminSettings}
              disabled={adminLoading}
            >
              {adminLoading ? (
                <>
                  <span className="spinner" />
                  Saving...
                </>
              ) : (
                "Save admin settings"
              )}
            </button>
          </div>
        </div>
      </>
    )}
  </section>
)}
{activeTab === "admin" && !isAdmin && (
  <section className="panel panel-glass slide-up">
    <div className="panel-header">
      <div className="panel-title">Admin Dashboard</div>
    </div>
    <p className="panel-subtitle">
      You are not authorized to view this dashboard. Please contact an
      administrator if you believe this is an error.
    </p>
  </section>
)}
            {/* Settings tab (placeholder for now) */}
            {activeTab === "settings" && (
              <section className="panel panel-glass slide-up">
                <div className="panel-header">
                  <div className="panel-title">Settings</div>
                  <span className="chip">Profile & app</span>
                </div>
                <p className="panel-subtitle">
                 Will later Configure how this workspace behaves. We can extend this
                  section with real settings later (e.g., default top K,
                  language, environment labels, etc.).
                </p>

                <div className="settings-grid">
                  <div className="settings-card">
                    <h3>Search defaults</h3>
                    <p>
                      Adjust defaults for vector search &amp; RAG, like Top K,
                      max answer length, etc.
                    </p>
                  </div>
                  <div className="settings-card">
                    <h3>Profile</h3>
                    <p>
                      In the future,we can show user-specific preferences synced from
                    backend or Entra ID.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>

        <div className="footer">
          Built for experiments · Vector search &amp; RAG powered by Azure
          OpenAI.
        </div>
      </div>

      {/* Toast container */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-bar" />
          <div className="toast-message">{toast.message}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Root App: manages login & active tab ---------- */
export default function App() {
  const [account, setAccount] = useState(null);
  const [activeTab, setActiveTab] = useState("vector");

  // Initialize MSAL once on load and restore any existing account
  useEffect(() => {
    const init = async () => {
      await ensureMsalInitialized();

      const active = msalInstance.getActiveAccount();
      if (active) {
        setAccount(active);
        return;
      }

      const all = msalInstance.getAllAccounts();
      if (all.length > 0) {
        msalInstance.setActiveAccount(all[0]);
        setAccount(all[0]);
      }
    };

    init().catch((err) => {
      console.error("MSAL init failed:", err);
    });
  }, []);

  const handleLogin = async () => {
    try {
      await ensureMsalInitialized();
      const result = await msalInstance.loginPopup(loginRequest);
      msalInstance.setActiveAccount(result.account);
      setAccount(result.account);
    } catch (err) {
      console.error("Login failed:", err);
      alert("Login failed: " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await ensureMsalInitialized();
      await msalInstance.logoutPopup();
      setAccount(null);
    } catch (err) {
      console.error("Logout failed:", err);
      alert("Logout failed: " + err.message);
    }
  };

  const isAuthenticated = !!account;
 // ---------- derive isAdmin from Entra group claims ----------
  let isAdmin = false;
  if (account && account.idTokenClaims) {
    const claims = account.idTokenClaims;
    const groups =
      claims.groups ||
      claims["groups"] ||
      []; // simple case: groups array in ID token

    if (Array.isArray(groups)) {
      isAdmin = groups.includes(ADMIN_GROUP_ID);
    }
  }

  return (
    <>
      {isAuthenticated ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
          <TopBar
            account={account}
            onLogout={handleLogout}
            onOpenSettings={() => setActiveTab("settings")}
            isAdmin={isAdmin}
          />
          <VectorRagPage activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={isAdmin} />
        </div>
      ) : (
        <LoginPage onLogin={handleLogin} />
      )}
    </>
  );
}
