# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] — 2026-11-02

### Changed
- **Renamed package to `pnnl-claude-switch`** — the VSIX is now `pnnl-claude-switch-<version>.vsix` and the extension ID is `claude-switch.pnnl-claude-switch`. Settings (`claudeSwitch.*`) and commands are unchanged
- **Automatic pre-releases** — every push to `main` publishes a GitHub pre-release (`<next patch>-pre.<run>`, never marked latest) with the VSIX; full releases are cut on demand with **Actions → Build & Release → Run workflow** (or by pushing a `vX.Y.Z` tag). Versions are derived from git tags, so `package.json` no longer has to be bumped by hand

### Upgrading from 1.2.0 or earlier
VS Code treats the new ID as a different extension, so saved profiles (and their tokens) don't carry over automatically:
1. In the old version, run **Export All Profiles** (sidebar `⋯`) — the export includes tokens, so keep the file private
2. Uninstall the old **Claude API Switch**, install `pnnl-claude-switch-1.2.1.vsix`, reload
3. Run **Import Profiles from JSON** and select the exported file, then delete it

## [1.2.0] — 2026-11-02

### Added
- **Per-workspace profiles** — new `claudeSwitch.storageTarget` user setting (`user` | `workspace`, default `user`). In `workspace` mode, Apply / Quick Switch write the profile into the `env` block of `<folder>/.claude/settings.local.json` instead of user settings, so each VS Code window can use a different API key. Existing file content is merged, not replaced
- **User-settings cleanup** — choosing `workspace` removes `claudeCode.environmentVariables` from user settings (backing it up as a profile first if it doesn't match one), so there is no competing user-level value
- **Git safety** — `.claude/settings.local.json` is added to `.git/info/exclude` (works from sub-folders and linked worktrees)
- **Verified active profile** — the status bar and ★ marker are now derived from what is actually in the settings file, re-checked on file changes, settings changes, window focus and a periodic poll (`claudeSwitch.statusRefreshIntervalSeconds`, default 30). Shows `⚠ modified` when the file was changed outside this window
- **Choose Where Profiles Are Saved** command (sidebar `⋯` menu and Quick Switch)
- Activates on startup so the status bar is available without opening the sidebar

### Changed
- README documents building/installing the VSIX locally (`npm ci && npm run package`), F5 debugging, and the release process; added `npm run package` script and `.vscode/launch.json`
- Release workflow now packages the VSIX and creates a GitHub Release (tag must match `package.json` version; notes come from this changelog)
- Repository links point to `canichols2-pnnl/pnnl-claude-switch-poc`
- API tokens/keys in profiles are stored in VS Code SecretStorage instead of plain extension state (existing profiles are migrated on first start) and are masked in the sidebar
- API test sends `ANTHROPIC_AUTH_TOKEN` as `Authorization: Bearer` (and `ANTHROPIC_API_KEY` as `x-api-key`), matching Claude Code
- Profile editor webview now has a Content Security Policy

### Removed
- Translated README and the language switcher — documentation is English-only

### Fixed
- Editing a profile no longer relies on extension state returning the same object reference
- State updates are awaited, so quick successive actions don't lose writes
- Settings-file fallback writer handles `]` inside string values

## [1.1.4] — 2026-08-08

### Added
- **Form / JSON toggle in the editor** — the Edit page now has a **Form ⇄ JSON** mode switch. "Edit Profile as JSON" opens the same editor directly in JSON view. Switching views is lossless: Form state is serialized into JSON, and JSON is parsed and validated before switching back
- **Save validates JSON syntax** — clicking **Save Profile** in JSON mode checks the JSON syntax first and shows the exact error inline; the profile is only updated if the JSON is valid (name is a non-empty string, `variables` is an array of `{ name, value }` entries)
- **Flexible import** — "Import Profile from JSON" and "Import Profiles from JSON" both accept a single profile object *or* an array of profiles (an Export-All file), with proper validation
- **Sidebar menus** — Export All / Import Profile / Import Profiles are now exposed in the sidebar's "..." menu (previously only available from the command palette)

### Removed
- The standalone JSON text-document editor and the "Reload from JSON Editor" command — the old flow could not reliably apply changes (untitled documents can't be reopened by URI), so it's replaced entirely by the in-editor JSON mode

## [1.1.1] — 2026-06-05

### Changed
- **Quick Start section** — Added step-by-step "3-step quick start" guide for adding the first profile, prominently featured at the top of the README
- **Extension UI explainer** — Added a table mapping every UI element (sidebar buttons, status bar, command palette) to its function

## [1.1.0] — 2026-06-04

### Added
- **API Connectivity Testing** — Test any profile's API endpoint with one click; reports latency, model info, token usage, and error diagnostics
- **Usage Tracking** — Records how many times each profile has been applied, first/last-used dates, and test history
- **Quick Switch** — `Cmd+Shift+P` → "Quick Switch Profile" or click the status bar to instantly swap between API configs
- **Import from Current Settings** — Capture whatever is in `settings.json` right now as a new profile
- **Export All / Import All** — Bulk export/import all profiles as a single JSON file for backup or sharing
- **Edit as JSON** — Open a profile's variables in a text editor for quick raw editing
- **Profile Notes** — Add optional description/notes to each profile (account info, expiry dates, etc.)
- **Status Bar Quick Switch** — Click "Claude API" in the status bar to switch profiles
- Open-source infrastructure: LICENSE, CHANGELOG, CONTRIBUTING, CI/CD workflow

### Fixed
- Race condition in webview panel dispose → save flow (saves now work reliably)
- JSONC parser now correctly handles `//` inside URL strings

## [1.0.0] — 2026-06-03

### Added
- Initial release
- Sidebar TreeView for managing API profiles
- CRUD operations (create, read, update, delete) for profiles
- Webview-based profile editor with template quick-fill
- Apply profiles to `claudeCode.environmentVariables` in settings.json
- Auto-detection of editor platform (Cursor, VS Code, VSCodium, Windsurf)
- Import/export individual profiles as JSON
- Pre-built templates: DeepSeek, Aliyun Qwen, Anthropic Official, Local Proxy
