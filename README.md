# CloudVault

A college Cloud Architecture and Design project demonstrating the separation between file contents and relational metadata. React + Vite + Tailwind CSS frontend, Python FastAPI API, and SQLAlchemy relational models.

**Phase 1 runs locally.** File bytes are stored in `backend/data/blobs/`; users, folders, file metadata, sessions and sharing records are stored in SQLite. No Azure services are provisioned or simulated. The UI labels this mode and starts with real empty accounts; it includes no sample metrics or seeded files.

## Windows setup

Install Python 3.11+ and Node.js 20.19+ (Node 22 LTS also works). From PowerShell:

```powershell
cd "D:\Ayushman Project"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
cd frontend
npm.cmd install
```

Start the API in one PowerShell terminal:

```powershell
cd "D:\Ayushman Project\backend"
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Start the frontend in another:

```powershell
cd "D:\Ayushman Project\frontend"
npm.cmd run dev
```

Open **http://127.0.0.1:5173** and create an account. Use this exact hostname so browser origin checks match `.env`. Vite proxies `/api` to the backend. Swagger API documentation: **http://127.0.0.1:8000/docs**. The frontend requires a running API; it has no offline mock mode. Stop servers with Ctrl+C. No PowerShell execution policy changes or virtual-environment activation are required.

## Implemented

- Registration/login, Argon2 password hashes, random server-side sessions, HttpOnly/SameSite cookies, logout, expiry and browser write-origin validation.
- Responsive navy/light dashboard, actual storage and file counts, folder count, recent files and byte-based file-type distribution.
- List/grid manager, nested folder creation, breadcrumbs, search, type filtering and sorting.
- Multiple uploads, drag/drop, download, rename, move to another folder/root, and permanent file deletion.
- File details with name, size, type, creation date and owner. Types are inferred from filename for categorization, not trusted content inspection.
- Secure random expiring download links (1 hour to 7 days), hashed tokens in SQL, link listing and revocation. Shared downloads intentionally allow possession-based access without login. Deleting a file removes its links.
- Version-history interface and capability endpoint explicitly marked unavailable until Azure is connected.
- Local storage adapter with opaque generated object keys, bounded streaming writes and compensating cleanup if SQL insertion fails; SQLAlchemy models compatible with SQL Server.
- Backend integration tests for authentication, file lifecycle, tenant isolation, invalid/oversize uploads, CSRF origin rejection and share expiry/revocation.

## Structure

```text
CloudVault/
├── .gitignore
├── README.md
├── docs/
│   ├── architecture.md
│   ├── validation.md
│   └── dashboard-local-qa.png     # actual local QA account screenshot
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── requirements-lock.txt       # verified dependency snapshot
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── storage.py
│   │   └── main.py
│   ├── scripts/export_schema.py
│   ├── schema/azure_sql.sql
│   ├── tests/test_workflows.py
│   └── data/                      # generated, ignored; DB and blob files
└── frontend/
    ├── .env.example
    ├── package.json
    ├── package-lock.json
    ├── index.html
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── styles.css
```

## Environment variables

All backend settings are read from **backend/.env**, relative to the backend working directory. Defaults are development-only. No frontend secrets or environment variables are required.

| Variable | Local default | Purpose |
|---|---|---|
| `APP_NAME` | `CloudVault` | Application label |
| `DATABASE_URL` | `sqlite:///./data/cloudvault.db` | SQLAlchemy database connection |
| `STORAGE_PROVIDER` | `local` | Only implemented provider; unsupported values fail startup |
| `LOCAL_STORAGE_PATH` | `./data/blobs` | Local object directory |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:5173` | CORS and browser write-origin allowlist |
| `PUBLIC_API_URL` | `http://127.0.0.1:8000` | Absolute base URL for shared downloads |
| `MAX_UPLOAD_MB` | `25` | Per-file stored-content limit in MiB |
| `SESSION_HOURS` | `24` | Session lifetime |
| `COOKIE_SECURE` | `false` | Set true for HTTPS deployments |

Future Azure storage variables (`AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`) are documented in `.env.example` only; no adapter currently consumes them. The SQL Server dialect/pyodbc dependency and DDL are provided, but a real Azure SQL connection has **not** been tested. Never put database credentials, account keys or connection strings in `VITE_*` variables. Passwords/session/share tokens are not stored as plaintext in the database. Share URLs are sensitive bearer credentials.

## Testing

```powershell
cd "D:\Ayushman Project\backend"
..\.venv\Scripts\python.exe -m pytest -q
cd ..\frontend
npm.cmd run build
```

Tests use a separate temporary SQLite database and blob directory, not your development account. The successful dependency snapshot can be installed with `pip install -r backend/requirements-lock.txt` instead of the ranged requirements.

Manual acceptance walkthrough:

1. Register, confirm zero files and zero bytes, then create `Coursework` and a nested folder.
2. Upload a PDF/image/text file. Verify counts, sizes and distribution update from the actual files.
3. Search by name, filter by type, sort, toggle list/grid, open details and download. Compare downloaded content with the original.
4. Rename a file, move it to the nested folder, and navigate there using breadcrumbs.
5. Create a link and open it in a private browser window. Revoke it and confirm it returns 404. Delete the file and confirm all its links stop working.
6. Open a second account and confirm it cannot see or operate on the first account's files (also covered by automated direct API tests).
7. Attempt a file larger than the configured maximum. Confirm the API rejects it and no metadata appears.
8. Open version history. It must clearly say Azure versioning is planned, with no invented versions.

## Remaining work

Next: implement a real Azure Blob adapter (upload, stream download, delete and version listing) behind the storage contract, connect Azure SQL using an encrypted ODBC Driver 18 connection, introduce Alembic migrations, and run integration tests against those actual services. The storage contract uses `put`, `read` (a byte-chunk iterator), and `delete`; download routes do not depend on local file paths. Azure can implement `read` with the Blob SDK's chunk iterator while keeping existing route/UI behavior.

Later: Azure Functions for scanning/thumbnails, App Service deployment, managed identity/Key Vault, account recovery and email verification, distributed login/share rate limiting, request-body limits at the reverse proxy (the current per-file limit bounds stored data, not multipart transport parsing), malware scanning, folder rename/move/delete, file replacement/version restoration, pagination, quotas, audit events, orphan reconciliation and operational backups. This foundation targets local coursework, not an Internet production launch. Google Fonts is optional presentation polish; system font fallbacks work without internet.

File deletion spans SQL and the filesystem, so it cannot be one atomic transaction. Metadata failures after blob deletion can leave a broken record; production needs a durable deletion job/reconciliation mechanism. Uploads compensate for SQL failures by removing the new object.

