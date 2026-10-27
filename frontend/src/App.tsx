import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Cloud,
  LayoutDashboard,
  FolderOpen,
  Clock3,
  Share2,
  HardDrive,
  Search,
  Plus,
  Upload,
  ChevronRight,
  Grid2X2,
  List,
  FileText,
  Image,
  Film,
  Music2,
  File,
  Folder,
  ArrowUpRight,
  Download,
  X,
  MoreHorizontal,
  ShieldCheck,
  LogOut,
  ArrowRight,
  Link,
  History,
  Trash2,
  Pencil,
  FolderInput,
  Check,
  Loader2,
  Menu,
  Database,
} from "lucide-react";

type VaultFile = {
  id: string;
  name: string;
  size: number;
  content_type: string;
  folder_id: string | null;
  created_at: string;
  owner: string;
};
type VaultFolder = { id: string; name: string; parent_id: string | null };
type User = { name: string; email: string };
type Health = { storage: string; database: string; max_upload_mb: number };
const units = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : n < 1073741824
        ? `${(n / 1048576).toFixed(1)} MB`
        : `${(n / 1073741824).toFixed(2)} GB`;
const category = (f: VaultFile) =>
  f.content_type.startsWith("image/")
    ? "Images"
    : f.content_type.startsWith("video/")
      ? "Videos"
      : f.content_type.startsWith("audio/")
        ? "Audio"
        : /pdf|text|document|sheet|presentation/.test(f.content_type)
          ? "Documents"
          : "Other";
const types = ["Documents", "Images", "Videos", "Audio", "Other"];
const colors = ["#6684ed", "#55bba7", "#a388db", "#edb66a", "#a6afbf"];
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
async function api(path: string, options: RequestInit = {}) {
  const r = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers:
      options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" },
  });
  if (!r.ok) {
    let msg = "Request failed";
    try {
      const d = await r.json();
      msg = typeof d.detail === "string" ? d.detail : "Please check your input";
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}
function FileIcon({ file }: { file: VaultFile }) {
  const type = category(file);
  const Icon =
    type === "Images"
      ? Image
      : type === "Videos"
        ? Film
        : type === "Audio"
          ? Music2
          : type === "Documents"
            ? FileText
            : File;
  return (
    <span className={`file-icon ${type.toLowerCase()}`}>
      <Icon size={22} />
    </span>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [health, setHealth] = useState<Health | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]),
    [folders, setFolders] = useState<VaultFolder[]>([]),
    [page, setPage] = useState("Overview"),
    [folder, setFolder] = useState<string | null>(null);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All types"),
    [sort, setSort] = useState("Newest first"),
    [view, setView] = useState("list"),
    [selected, setSelected] = useState<VaultFile | null>(null);
  const [modal, setModal] = useState(""),
    [field, setField] = useState(""),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false);
  const [links, setLinks] = useState<{ id: string; expires_at: string }[]>([]),
    [newLink, setNewLink] = useState(""),
    [hours, setHours] = useState("24"),
    [authMode, setAuthMode] = useState("login");
  const uploadRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api("/health")
      .then(setHealth)
      .catch(() =>
        setError("Cannot reach the API. Start the backend on port 8000."),
      );
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const refresh = async () => {
    setLoading(true);
    try {
      const [f, d] = await Promise.all([api("/files"), api("/folders")]);
      setFiles(f);
      setFolders(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user) void refresh();
  }, [user]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const authenticate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      setUser(
        await api(`/auth/${authMode}`, {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(form)),
        }),
      );
    });
  };
  const upload = async (list: FileList | null) => {
    if (!list) return;
    await run(async () => {
      let count = 0;
      for (const file of Array.from(list)) {
        const body = new FormData();
        body.append("file", file);
        await api(`/files${folder ? "?folder_id=" + folder : ""}`, {
          method: "POST",
          body,
        });
        count++;
        setNotice(`Uploaded ${count} of ${list.length} files`);
      }
      await refresh();
    });
    await refresh();
    if (uploadRef.current) uploadRef.current.value = "";
  };
  const open = (name: string, file: VaultFile | null = selected) => {
    setSelected(file);
    setField(file?.name || "");
    setTarget(file?.folder_id || "");
    setNewLink("");
    setModal(name);
    setError("");
    if (name === "share" && file)
      api(`/files/${file.id}/shares`)
        .then(setLinks)
        .catch((e) => setError(e.message));
  };
  const navigate = (name: string) => {
    setPage(name);
    setFolder(null);
    setQuery("");
    setSelected(null);
    setMobile(false);
  };
  const total = files.reduce((n, f) => n + f.size, 0);
  const shown = files
    .filter(
      (f) =>
        (page === "Overview" ||
          page === "Recent files" ||
          page === "Storage" ||
          f.folder_id === folder) &&
        f.name.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "All types" || category(f) === filter),
    )
    .sort((a, b) =>
      sort === "Name A–Z"
        ? a.name.localeCompare(b.name)
        : sort === "Largest first"
          ? b.size - a.size
          : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const trail: VaultFolder[] = [];
  let cursor = folder;
  while (cursor) {
    const f = folders.find((f) => f.id === cursor);
    if (!f) break;
    trail.unshift(f);
    cursor = f.parent_id;
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      if (modal === "folder")
        await api("/folders", {
          method: "POST",
          body: JSON.stringify({ name: field, parent_id: folder }),
        });
      else if (selected && modal === "rename")
        await api(`/files/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: field }),
        });
      else if (selected && modal === "move")
        await api(`/files/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ folder_id: target || null }),
        });
      else if (selected && modal === "delete") {
        await api(`/files/${selected.id}`, { method: "DELETE" });
        setSelected(null);
      }
      setModal("");
      setNotice("Changes saved");
      await refresh();
    });
  };
  if (!ready)
    return (
      <div className="boot">
        <Cloud size={38} />
        <Loader2 className="spin" />
        Opening your workspace…
      </div>
    );
  if (!user)
    return (
      <div className="auth-shell">
        <section className="auth-story">
          <a className="brand">
            <span className="brand-icon">
              <Cloud />
            </span>
            CloudVault<span className="brand-dot">.</span>
          </a>
          <div>
            <span className="eyebrow">
              A LITTLE SPACE. ENDLESS POSSIBILITIES.
            </span>
            <h1>
              Your files.
              <br />
              Beautifully
              <br />
              <em>in place.</em>
            </h1>
            <p>
              One calm home for your ideas, projects, and everything that
              matters.
            </p>
            <div className="auth-illustration">
              <div>
                <Folder size={55} />
                <span>Everything, together.</span>
              </div>
              <div>
                <ShieldCheck size={28} />
                <span>Private by design</span>
              </div>
              <div>
                <FileText size={28} />
                <span>Ready when you are</span>
              </div>
            </div>
          </div>
          <small>Cloud Architecture & Design · Azure storage project</small>
        </section>
        <section className="auth-form">
          <span className="environment">
            <i />
            LOCAL DEVELOPMENT
          </span>
          <div>
            <span className="eyebrow">YOUR PERSONAL CLOUD WORKSPACE</span>
            <h2>
              {authMode === "login" ? "Welcome back." : "Make room for more."}
            </h2>
            <p>
              {authMode === "login"
                ? "Sign in to pick up where you left off."
                : "Create your account and bring your files together."}
            </p>
            <form onSubmit={authenticate}>
              {authMode === "register" && (
                <label>
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="Alex Morgan"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@college.edu"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  maxLength={128}
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  required
                  placeholder="At least 10 characters"
                />
              </label>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <button className="primary" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <>
                    {authMode === "login"
                      ? "Sign in to CloudVault"
                      : "Create your account"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <p className="auth-switch">
              {authMode === "login"
                ? "New to CloudVault?"
                : "Already have an account?"}{" "}
              <button
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {authMode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
            <div className="local-note">
              <ShieldCheck size={20} />
              <span>
                Local files · SQLite metadata
                <br />
                <small>Azure services are not connected in this phase.</small>
              </span>
            </div>
          </div>
          <small>Your space, simplified.</small>
        </section>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a className="brand">
          <span className="brand-icon">
            <Cloud />
          </span>
          CloudVault<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {[
            [LayoutDashboard, "Overview"],
            [FolderOpen, "My files"],
            [Clock3, "Recent files"],
            [Share2, "Shared links"],
            [HardDrive, "Storage"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Cloud;
            return (
              <button
                key={String(label)}
                className={page === label ? "active" : ""}
                onClick={() => navigate(String(label))}
              >
                <I size={19} />
                {String(label)}
                {label === "My files" && (
                  <span className="nav-count">{files.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-card">
            <span>
              <HardDrive size={17} />
              Your storage
            </span>
            <strong>
              {units(total)} <small>stored locally</small>
            </strong>
            <div className="storage-line">
              <i style={{ width: total ? "100%" : "0%" }} />
            </div>
            <p>{files.length} files in your workspace</p>
            <button onClick={() => navigate("Storage")}>
              View storage details
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="sidebar-footer">
            <span className="avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>Personal account</small>
            </span>
            <button
              title="Sign out"
              onClick={() =>
                void run(async () => {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setFiles([]);
                  setFolders([]);
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="top-breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-right">
            <span className="environment">
              <i />
              LOCAL DEVELOPMENT
            </span>
            <span className="separator" />
            <span className="avatar light">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
        >
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR WORKSPACE, AT A GLANCE</div>
              <h1>
                {page === "Overview"
                  ? `Welcome back, ${user.name.split(" ")[0]}`
                  : page}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {page === "Overview"
                  ? "A little more organized. A lot more possible."
                  : page === "Shared links"
                    ? "Share thoughtfully. Stay in control of access."
                    : page === "Storage"
                      ? "A transparent view of where your files live."
                      : "Everything you need, right where you left it."}
              </p>
            </div>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => {
                  setField("");
                  setModal("folder");
                }}
              >
                <Plus size={17} />
                New folder
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => uploadRef.current?.click()}
              >
                {busy ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <Upload size={17} />
                )}
                Upload files
              </button>
            </div>
          </div>
          <input
            ref={uploadRef}
            hidden
            multiple
            type="file"
            onChange={(e) => void upload(e.target.files)}
          />
          {error && !modal && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <section className="hero-panel">
                <div>
                  <span className="hero-tag">
                    <span />
                    ALL YOUR FILES. ONE HAPPY PLACE.
                  </span>
                  <h2>Room for your next big idea.</h2>
                  <p>
                    From the first draft to the final presentation,
                    <br />
                    keep your best work together.
                  </p>
                  <button onClick={() => navigate("My files")}>
                    Explore your files
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="cloud-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <span className="art-file art-file-one">
                    <FileText size={29} />
                    <i />
                    <i />
                  </span>
                  <span className="art-file art-file-two">
                    <Image size={31} />
                  </span>
                  <div className="art-cloud">
                    <Cloud size={105} strokeWidth={1.3} />
                    <span>
                      <Check size={20} />
                    </span>
                  </div>
                  <span className="art-spark">✦</span>
                  <span className="art-dot" />
                </div>
              </section>
              <section className="stats">
                <div className="stat">
                  <span className="stat-icon blue">
                    <HardDrive size={21} />
                  </span>
                  <span>
                    Storage used<strong>{units(total)}</strong>
                    <small>Across your uploaded files</small>
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-icon mint">
                    <FileText size={21} />
                  </span>
                  <span>
                    Total files
                    <strong>
                      {files.length}
                      <small>files</small>
                    </strong>
                    <small>All your work, in one place</small>
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-icon purple">
                    <FolderOpen size={21} />
                  </span>
                  <span>
                    Your folders
                    <strong>
                      {folders.length}
                      <small>folders</small>
                    </strong>
                    <small>A place for every project</small>
                  </span>
                </div>
              </section>
            </>
          )}
          {page === "Storage" ? (
            <section className="panel storage-page">
              <div className="panel-title">
                <h2>Storage configuration</h2>
                <Database size={22} />
              </div>
              <div className="storage-mode">
                <ShieldCheck size={36} />
                <div>
                  <h3>Local development is active</h3>
                  <p>
                    Files are stored on this computer. Metadata is stored in{" "}
                    {health?.database || "SQLite"}. Azure is not connected.
                  </p>
                </div>
              </div>
              <dl>
                <dt>Stored file contents</dt>
                <dd>{units(total)}</dd>
                <dt>File count</dt>
                <dd>{files.length}</dd>
                <dt>Maximum file size</dt>
                <dd>{health?.max_upload_mb || 25} MB per file</dd>
                <dt>Cloud integration</dt>
                <dd>Planned · Azure Blob Storage + Azure SQL</dd>
              </dl>
            </section>
          ) : page === "Shared links" ? (
            <section className="panel">
              <div className="panel-title">
                <h2>Manage file access</h2>
                <span className="subtle">Links expire automatically</span>
              </div>
              <div className="share-explainer">
                <ShieldCheck size={27} />
                <p>
                  Choose a file to create a secure link, inspect active links,
                  or revoke access. Anyone with an active link can download that
                  file.
                </p>
              </div>
              {files.length ? (
                files.map((f) => (
                  <div className="share-row" key={f.id}>
                    <FileIcon file={f} />
                    <span>
                      <strong>{f.name}</strong>
                      <small>{units(f.size)}</small>
                    </span>
                    <button
                      className="secondary"
                      onClick={() => open("share", f)}
                    >
                      <Link size={16} />
                      Manage links
                    </button>
                  </div>
                ))
              ) : (
                <Empty onUpload={() => uploadRef.current?.click()} />
              )}
            </section>
          ) : (
            <div className={page === "Overview" ? "content-columns" : ""}>
              <section className="panel files-panel">
                <div className="panel-title">
                  <h2>
                    {page === "Overview"
                      ? "Recent files"
                      : page === "Recent files"
                        ? "Recently uploaded"
                        : "Your files"}{" "}
                    <span className="pill">{shown.length}</span>
                  </h2>
                  {page === "Overview" && (
                    <button
                      className="text-button"
                      onClick={() => navigate("My files")}
                    >
                      View all files
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div className="file-toolbar">
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search files"
                      placeholder="Search your files…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter by file type"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option>All types</option>
                    {types.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort files"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option>Newest first</option>
                    <option>Name A–Z</option>
                    <option>Largest first</option>
                  </select>
                  <div className="view-toggle">
                    <button
                      className={view === "list" ? "chosen" : ""}
                      aria-label="List view"
                      onClick={() => setView("list")}
                    >
                      <List size={17} />
                    </button>
                    <button
                      className={view === "grid" ? "chosen" : ""}
                      aria-label="Grid view"
                      onClick={() => setView("grid")}
                    >
                      <Grid2X2 size={16} />
                    </button>
                  </div>
                </div>
                {page === "My files" && (
                  <>
                    <div className="folder-trail">
                      <button onClick={() => setFolder(null)}>
                        <FolderOpen size={14} />
                        My files
                      </button>
                      {trail.map((f) => (
                        <span key={f.id}>
                          <ChevronRight size={13} />
                          <button onClick={() => setFolder(f.id)}>
                            {f.name}
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="folder-list">
                      {folders
                        .filter((f) => f.parent_id === folder)
                        .map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              setFolder(f.id);
                              setSelected(null);
                            }}
                          >
                            <Folder size={24} />
                            <strong>{f.name}</strong>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                    </div>
                  </>
                )}
                {loading ? (
                  <div className="empty">
                    <Loader2 className="spin" />
                    <p>Loading your files…</p>
                  </div>
                ) : shown.length ? (
                  <div className={view === "grid" ? "file-grid" : "file-table"}>
                    {view === "list" && (
                      <div className="table-head">
                        <span>Name</span>
                        <span>File size</span>
                        <span>Uploaded</span>
                        <span />
                      </div>
                    )}
                    {(page === "Overview" ? shown.slice(0, 5) : shown).map(
                      (f) => (
                        <div
                          key={f.id}
                          className={`file-row ${selected?.id === f.id ? "selected" : ""}`}
                        >
                          <button
                            className="file-name"
                            onClick={() => {
                              setSelected(f);
                              setModal("details");
                            }}
                          >
                            <FileIcon file={f} />
                            <span>
                              <strong>{f.name}</strong>
                              <small>{category(f)}</small>
                            </span>
                          </button>
                          <span className="file-size">{units(f.size)}</span>
                          <span className="file-date">
                            {date(f.created_at)}
                          </span>
                          <button
                            className="more"
                            aria-label={`Details for ${f.name}`}
                            onClick={() => open("details", f)}
                          >
                            <MoreHorizontal size={19} />
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <Empty
                    filtered={!!query || filter !== "All types"}
                    onUpload={() => uploadRef.current?.click()}
                  />
                )}
                <div className="table-footer">
                  <ShieldCheck size={14} />
                  <span>Your files are private until you share them.</span>
                  <span>
                    {page === "Overview"
                      ? Math.min(5, shown.length)
                      : shown.length}{" "}
                    files
                  </span>
                </div>
              </section>
              {page === "Overview" && (
                <aside className="right-column">
                  <section className="panel distribution">
                    <div className="panel-title">
                      <h2>Storage breakdown</h2>
                      <HardDrive size={17} />
                    </div>
                    <div
                      className="donut"
                      style={{
                        background: total
                          ? `conic-gradient(${types
                              .map((t, i) => {
                                const start =
                                  (types
                                    .slice(0, i)
                                    .reduce(
                                      (sum, t) =>
                                        sum +
                                        files
                                          .filter((f) => category(f) === t)
                                          .reduce((n, f) => n + f.size, 0),
                                      0,
                                    ) /
                                    total) *
                                  100;
                                const end =
                                  start +
                                  (files
                                    .filter((f) => category(f) === t)
                                    .reduce((n, f) => n + f.size, 0) /
                                    total) *
                                    100;
                                return `${colors[i]} ${start}% ${end}%`;
                              })
                              .join(",")})`
                          : "#edf0f6",
                      }}
                    >
                      <div>
                        <HardDrive size={19} />
                        <strong>{units(total)}</strong>
                        <small>Total used</small>
                      </div>
                    </div>
                    <div className="legend">
                      {types.map((t, i) => (
                        <div key={t}>
                          <i style={{ background: colors[i] }} />
                          <span>{t}</span>
                          <strong>
                            {units(
                              files
                                .filter((f) => category(f) === t)
                                .reduce((n, f) => n + f.size, 0),
                            )}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="tip-card">
                    <span className="tip-icon">
                      <ShieldCheck size={21} />
                    </span>
                    <h3>A little control goes a long way.</h3>
                    <p>
                      Share a file with an expiring link. Revoke access whenever
                      you need to.
                    </p>
                    <button onClick={() => navigate("Shared links")}>
                      Explore sharing
                      <ArrowRight size={14} />
                    </button>
                  </section>
                </aside>
              )}
            </div>
          )}
          <footer className="main-footer">
            <span>
              <Cloud size={15} />
              CloudVault · Your space, simplified.
            </span>
            <span>
              Local storage + SQLite<span className="footer-dot">•</span>Azure
              integration planned
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => !busy && setModal("")}>
          <section
            className={`modal ${modal === "details" ? "details-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            <span className="modal-symbol">
              {modal === "share" ? (
                <Share2 />
              ) : modal === "versions" ? (
                <History />
              ) : modal === "folder" ? (
                <FolderOpen />
              ) : (
                <FileText />
              )}
            </span>
            <h2 id="modal-title">
              {modal === "folder"
                ? "Create a folder"
                : modal === "rename"
                  ? "Rename file"
                  : modal === "move"
                    ? "Move file"
                    : modal === "delete"
                      ? "Delete this file?"
                      : modal === "share"
                        ? "Share with confidence"
                        : modal === "versions"
                          ? "Version history"
                          : "File details"}
            </h2>
            <p className="modal-description">
              {modal === "share"
                ? "Create an expiring link. Anyone with the link can download."
                : modal === "folder"
                  ? "A little organization starts here."
                  : selected?.name}
            </p>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {modal === "details" && selected && (
              <>
                <dl>
                  <dt>Filename</dt>
                  <dd>{selected.name}</dd>
                  <dt>Size</dt>
                  <dd>{units(selected.size)}</dd>
                  <dt>File type</dt>
                  <dd>{selected.content_type}</dd>
                  <dt>Uploaded</dt>
                  <dd>{date(selected.created_at)}</dd>
                  <dt>Owner</dt>
                  <dd>{selected.owner}</dd>
                  <dt>Storage</dt>
                  <dd>Local development</dd>
                </dl>
                <div className="detail-actions">
                  <a
                    className="primary"
                    href={`/api/files/${selected.id}/download`}
                  >
                    <Download size={17} />
                    Download
                  </a>
                  {[
                    [Pencil, "rename", "Rename"],
                    [FolderInput, "move", "Move"],
                    [Share2, "share", "Share"],
                    [History, "versions", "Version history"],
                    [Trash2, "delete", "Delete"],
                  ].map(([I, key, label]) => {
                    const Icon = I as typeof Cloud;
                    return (
                      <button
                        key={String(key)}
                        className={
                          key === "delete" ? "danger secondary" : "secondary"
                        }
                        onClick={() => open(String(key))}
                      >
                        <Icon size={16} />
                        {String(label)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {["folder", "rename", "move", "delete"].includes(modal) && (
              <form onSubmit={submit}>
                {modal === "folder" || modal === "rename" ? (
                  <label>
                    Name
                    <input
                      autoFocus
                      value={field}
                      onChange={(e) => setField(e.target.value)}
                      required
                      maxLength={180}
                    />
                  </label>
                ) : modal === "move" ? (
                  <label>
                    Destination folder
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">My files (root)</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {folderPath(f, folders)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p>
                    This permanently deletes the file and revokes all its shared
                    links.
                  </p>
                )}
                <button
                  className={`primary ${modal === "delete" ? "danger-button" : ""}`}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 size={17} className="spin" />
                  ) : modal === "delete" ? (
                    "Delete permanently"
                  ) : (
                    "Save changes"
                  )}
                </button>
              </form>
            )}
            {modal === "share" && selected && (
              <>
                <label>
                  Link expires after
                  <select
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  >
                    <option value="1">1 hour</option>
                    <option value="24">24 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const s = await api(`/files/${selected.id}/shares`, {
                        method: "POST",
                        body: JSON.stringify({ hours: Number(hours) }),
                      });
                      setNewLink(s.url);
                      setLinks(await api(`/files/${selected.id}/shares`));
                    })
                  }
                >
                  <Link size={17} />
                  Create secure link
                </button>
                {newLink && (
                  <label>
                    Copy your link
                    <input
                      readOnly
                      value={newLink}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(async () => {
                          await navigator.clipboard.writeText(newLink);
                          setNotice("Link copied");
                        })
                      }
                    >
                      Copy link
                    </button>
                  </label>
                )}
                <h3 className="links-heading">Active links ({links.length})</h3>
                {links.map((l) => (
                  <div key={l.id} className="link-row">
                    <span>
                      Expires {new Date(l.expires_at).toLocaleString()}
                    </span>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/files/${selected.id}/shares/${l.id}`, {
                            method: "DELETE",
                          });
                          setLinks(links.filter((x) => x.id !== l.id));
                          setNewLink("");
                        })
                      }
                    >
                      Revoke
                    </button>
                  </div>
                ))}
                {!links.length && (
                  <p className="subtle">
                    No active links. This file is private.
                  </p>
                )}
              </>
            )}
            {modal === "versions" && (
              <div className="version-note">
                <History size={30} />
                <h3>Azure versioning is coming next.</h3>
                <p>
                  Local storage does not track versions. After Azure Blob
                  Storage is connected, this panel will list real version IDs,
                  timestamps, and restore actions.
                </p>
                <span className="environment">PLANNED INTEGRATION</span>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({
  onUpload,
  filtered = false,
}: {
  onUpload: () => void;
  filtered?: boolean;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        {filtered ? <Search size={27} /> : <FolderOpen size={30} />}
      </span>
      <h3>
        {filtered ? "No matching files" : "A fresh space for your best work"}
      </h3>
      <p>
        {filtered
          ? "Try another search or file type."
          : "Drop files anywhere here, or upload your first file."}
      </p>
      {!filtered && (
        <button className="secondary" onClick={onUpload}>
          <Upload size={16} />
          Upload your first file
        </button>
      )}
    </div>
  );
}
function folderPath(folder: VaultFolder, folders: VaultFolder[]): string {
  return folder.parent_id
    ? `${folderPath(
        folders.find((f) => f.id === folder.parent_id)!,
        folders,
      )} / ${folder.name}`
    : folder.name;
}
