# Phase 1 validation

Validated on Windows on October 27, 2026.

- `npm.cmd run build`: TypeScript checking and Vite production build passed.
- `python -m pytest -q`: 5 integration tests passed. They cover registration/login/logout, file and nested-folder lifecycle, cross-user isolation, sharing expiry/revocation/deletion, invalid/oversized uploads and cross-origin write rejection. The installed Starlette emits a deprecation warning for its HTTPX test client; it does not fail these tests.
- HTTP smoke checks: frontend returned 200; API health returned local storage, SQLite and `azure_connected: false`.
- Live browser checks: registration, empty dashboard, folder creation and updated folder count, uploaded file with real byte count, grid/list switching, details and explicitly unavailable Azure version history.
- A disposable **Local QA** account was created only for browser testing. Its one file is a real upload of the project's architecture document and its folder is named `QA coursework`. These development records are in ignored local data, not in source or seed scripts. New accounts start empty.
- Screenshot: `dashboard-local-qa.png` shows that account's actual local metadata. It is a QA artifact, not an example of connected Azure services.

Actual Azure Blob Storage, Azure SQL, version restoration, Functions and App Service have not been exercised or implemented in this phase. Mobile layouts are implemented in CSS; device-specific interaction testing remains to be done. The local preview servers were used for verification; use the README commands to start them again.
