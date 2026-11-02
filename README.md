# 🤖 PNNL Claude API Switch

> Per-workspace Claude Code API profiles for PNNL developers — use a different AI Incubator key and model set in every project, switch with one click, and always see which one is active.

[![Release](https://img.shields.io/github/v/release/canichols2-pnnl/pnnl-claude-switch-poc)](https://github.com/canichols2-pnnl/pnnl-claude-switch-poc/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-007acc)](https://code.visualstudio.com/)

---

## ⚡ Why this exists

At PNNL, Claude Code usually runs against **[AI Incubator](https://ai-incubator.pnnl.gov/)** (PNNL's LiteLLM gateway, `https://ai-incubator-api.pnnl.gov`) and **API keys are tied to projects**: work on project A has to be billed to project A's key, project B to project B's, and you also have a personal *birthright* key.

Out of the box, the Claude Code VS Code extension takes its API settings from **user-level** settings, which every VS Code window shares. With two projects open in two windows, setting the key in one window changes it for the other, and it's easy to run work on the wrong key without noticing.

This extension keeps those settings **local to each workspace**:

- You save each key + model setup once as a named **profile** (stored in VS Code's secret storage).
- **Applying** a profile in a window writes it into *that workspace's* Claude Code settings, so each window and project uses its own key.
- The **status bar** always shows which profile the current workspace is really using, checked against the actual settings file.

---

## 🗂️ How it works — the two modes

Pick a mode with the **`claudeSwitch.storageTarget`** user setting, or run **Choose Where Profiles Are Saved** from the sidebar `⋯` menu or Quick Switch.

| | **Workspace mode** *(default)* | **User mode** |
|---|---|---|
| Setting value | `"workspace"` | `"user"` |
| Where Apply writes | `env` block of the workspace's `.claude/settings.local.json` | `claudeCode.environmentVariables` in your VS Code **user** `settings.json` |
| Scope | **This workspace only.** Every window/project can use a different profile | **Every VS Code window** shares the same profile |
| Running Claude sessions | Switch **URL and key** immediately; **models/effort** need a new session (see below) | Must be restarted (variables are passed only when Claude starts) |
| Committed to git? | No. The file is added to `.git/info/exclude` | No (user settings live outside the repo) |
| Use it when | You work on more than one project/key (the normal PNNL case) | You only ever use one key everywhere |

### What updates in a running session, and what needs a new one

Claude Code re-reads the `env` block of `.claude/settings.local.json` when the file changes, but not everything in it takes effect mid-session:

| Variable(s) | After you apply a profile in workspace mode |
|---|---|
| `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY` | **Live.** The next request in an open session uses the new endpoint and key |
| `ANTHROPIC_MODEL` | **New session.** An open session keeps the model it started with; run `/model <name>` to change it in place |
| `ANTHROPIC_DEFAULT_OPUS/SONNET/HAIKU_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_EFFORT_LEVEL` | **New session.** Treat these as read at startup |
| A variable the previous profile set and the new one doesn't | **New session.** Removing a variable doesn't unset it in a running session |
| Anything in user mode (`claudeCode.environmentVariables`) | **New session.** VS Code passes these only when Claude starts |

**Switching between keys that can use different models** (e.g. project → birthright) is the case to watch. The open session immediately uses the new key but still asks for the old model, and the gateway rejects it (`team not allowed to access model … Tried to access claude-opus-5-5-project`). After that kind of switch, start a new Claude session, or run `/model` with a model the new key allows.

### Workspace mode in detail

- **Which file:** the one Claude Code reads for the **first workspace folder**. The Claude Code extension always starts sessions there; other folders in a multi-root workspace are only extra directories. Which file you have open doesn't matter, so to change the target, reorder the folders.
  - **Windows:** `<first folder>\.claude\settings.local.json`
  - **macOS / Linux** (including WSL, SSH and dev-container windows, where Claude runs on Linux): the **git repository root's** `.claude/settings.local.json` (the main checkout's root for a linked worktree); the folder itself outside git or when the repo root is your home directory
  - The status bar tooltip always shows the exact path.
- **Merge, not overwrite:** permissions and any env vars of your own in that file are kept. Only the keys that belong to profiles are replaced, and empty values are skipped.
- **No competing user-level value:** applying (or switching to workspace mode) removes `claudeCode.environmentVariables` from user settings. If what was there didn't match a saved profile, it is saved first as a *User settings backup* profile.
- **Upgrading from user mode:** existing user-level variables stay in effect until you apply a profile in a workspace. The status bar tooltip warns while they're still present.

### Active profile verification

The extension never trusts a remembered "last applied" value. The ★ in the sidebar and the status bar come from comparing what is **actually in the target file** with your saved profiles:

| Status bar | Meaning |
|---|---|
| `★ Profile name` | The settings exactly match that profile |
| `⚠ Claude API: modified` | Changed outside the extension (tooltip shows the closest profile and which keys differ) |
| `Claude API` | No profile variables are set for this workspace |

It re-checks when the settings file or user settings change, when folders are added, removed or reordered, when the window regains focus (catching changes made in other windows), and every `claudeSwitch.statusRefreshIntervalSeconds` (default 30; `0` turns polling off).

---

## 🎨 Templates

New profiles start from a template. You only paste your key into `ANTHROPIC_AUTH_TOKEN` (or `ANTHROPIC_API_KEY` for the Anthropic API).

| Template | Main model | Subagents | Effort | Notes |
|---|---|---|---|---|
| **AI Incubator — Project: Recommended** | `claude-opus-5-5-project` | `claude-sonnet-5-5-project` | medium | Good default for project work |
| **AI Incubator — Project: Balanced** | `claude-sonnet-5-5-project` | `claude-haiku-5-5-project` | medium | Lower cost; Opus still available via `/model` |
| **AI Incubator — Project: Max Quality** | `claude-fable-5-1-project` | `claude-opus-5-5-project` | high | Highest capability and cost |
| **AI Incubator — Project: Economy** | `claude-haiku-5-5-project` | `claude-haiku-5-5-project` | low | Cheapest; quick or simple tasks |
| **AI Incubator — Birthright** | `claude-sonnet-5-5-birthright` | `claude-haiku-5-5-birthright` | medium | Personal birthright key. No Opus/Fable, so the Opus alias maps to Sonnet |
| **Anthropic API** | `claude-opus-5-5` | `claude-sonnet-5-5` | medium | Direct Anthropic API key |
| **Local Proxy** | — | — | medium | A localhost proxy that handles auth |
| **Empty** | — | — | — | Start from scratch |

All AI Incubator templates point at `https://ai-incubator-api.pnnl.gov`, map Claude Code's Opus/Sonnet/Haiku aliases to the matching `-project` (or `-birthright`) models, and set `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` (LiteLLM/Bedrock reject some Anthropic-only beta headers) and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.

To see exactly which models **your** key can use (it's a LiteLLM gateway):

```bash
curl -s -H "Authorization: Bearer $KEY" https://ai-incubator-api.pnnl.gov/v1/models
```

---

## 🚀 Quick Start (3 steps)

1. **Open the sidebar:** click the **server icon** in the activity bar to open the **API Profiles** panel.
2. **Add a profile:** click **+**, name it (e.g. `AI Incubator — <project>`), and pick a template. Paste your key into `ANTHROPIC_AUTH_TOKEN`, then click **Save**.
3. **Apply and test:** in the window for that project, click **✓ Apply** on the profile, then **▶ Test** to check the endpoint, key and model. The status bar now shows `★ <profile>` for this workspace.

Open another project in another window and apply a different profile there. Each window keeps its own.

---

## 🖥️ Extension Interface

| UI Element | Location | What it does |
|---|---|---|
| **Sidebar panel** | Activity bar (left edge) | Lists all your profiles with inline action buttons |
| **+ button** | Sidebar toolbar | Add a new profile |
| **↓ button** | Sidebar toolbar | Capture the current workspace's (or user) config as a profile |
| **🔄 button** | Sidebar toolbar | Quick switch between profiles |
| **⋯ menu** | Sidebar toolbar | Export All / Import Profile(s) from JSON / choose the mode |
| **✓ Apply** | Inline on each profile | Write the profile to the current mode's target |
| **▶ Test** | Inline on each profile | Test the API endpoint (latency, model, errors) |
| **✎ Edit** | Inline on each profile | Open the web form editor |
| **Status bar** | Bottom right | The profile actually in effect for this workspace (re-verified automatically). Click to quick-switch |
| **Command palette** | `Ctrl+Shift+P` | Search "PNNL Claude API Switch" for all commands |

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗂️ **Workspace-local profiles** | Default mode: each workspace gets its own key/models via `.claude/settings.local.json` |
| ✅ **Verified active profile** | ★ / status bar reflect what is really in the settings file, re-checked on changes, focus and a poll |
| 🎨 **PNNL templates** | AI Incubator project presets (Recommended / Balanced / Max Quality / Economy), Birthright, Anthropic, Local Proxy |
| 🔐 **Secret storage** | Keys are stored in VS Code SecretStorage (OS keychain) and masked in the sidebar |
| 🧪 **API testing** | Test each profile's endpoint: latency, model, token usage, error details |
| 🔄 **Quick switch** | Click the status bar or use the command palette |
| 📋 **Profile CRUD + notes** | Create, edit (form or JSON), duplicate, delete; notes for project / charge code / expiry |
| 📤 **Import / export** | Share profile setups (without keys, if you blank them) as JSON |
| 📊 **Usage tracking** | How often each profile was applied, plus test history |

---

## 🚀 Installation

### Install a released VSIX

1. Download `pnnl-claude-switch-<version>.vsix` from the latest [GitHub Release](https://github.com/canichols2-pnnl/pnnl-claude-switch-poc/releases/latest)
2. In VS Code / Cursor open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`) → **…** menu → **Install from VSIX…**
3. Select the downloaded file and reload the window

Or from the command line:

```bash
code --install-extension pnnl-claude-switch-<version>.vsix     # VS Code
cursor --install-extension pnnl-claude-switch-<version>.vsix   # Cursor
```

### Build and install from source

Prerequisites: **Node.js 20+** and **npm** (the only dependency is the packaging tool, [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce); the extension itself has no runtime dependencies and no compile step).

```bash
git clone https://github.com/canichols2-pnnl/pnnl-claude-switch-poc.git
cd pnnl-claude-switch-poc
npm ci                 # installs @vscode/vsce from package-lock.json
npm run package        # → pnnl-claude-switch-<version>.vsix in the repo root
code --install-extension pnnl-claude-switch-<version>.vsix --force
```

`--force` replaces an already-installed version. Reload the VS Code window afterwards (**Developer: Reload Window**). The `.vsix` file is git-ignored.

To check exactly what goes into the package without building it: `npx vsce ls`.

> **Corporate npm mirror?** If `npm ci` fails with `403 Forbidden` from an internal registry (e.g. Artifactory blocking a `@vscode/vsce` dependency by security policy), you can't build locally until the mirror allows it — download the `.vsix` from the build on any pull request (**Actions** → run → **Artifacts**) or from a release instead.

### Run it without installing (Extension Development Host)

1. Open the repo folder in VS Code
2. Press **F5** (or **Run and Debug → Run Extension**) — this uses [.vscode/launch.json](.vscode/launch.json) and opens a second window with the extension loaded from source
3. After editing `extension.js`, run **Developer: Reload Window** in that second window to pick up the change
4. Logs (`[PNNL Claude API Switch] …`) appear in the **Debug Console** of the first window

---

## 📋 Profile Format

### Single Profile (`.json`)

```json
{
  "name": "AI Incubator — My Project",
  "notes": "Project key for <project>, charge code <code>",
  "variables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "https://ai-incubator-api.pnnl.gov" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "sk-..." },
    { "name": "ANTHROPIC_MODEL", "value": "claude-opus-5-5-project" },
    { "name": "ANTHROPIC_DEFAULT_OPUS_MODEL", "value": "claude-opus-5-5-project" },
    { "name": "ANTHROPIC_DEFAULT_SONNET_MODEL", "value": "claude-sonnet-5-5-project" },
    { "name": "ANTHROPIC_DEFAULT_HAIKU_MODEL", "value": "claude-haiku-5-5-project" },
    { "name": "CLAUDE_CODE_SUBAGENT_MODEL", "value": "claude-sonnet-5-5-project" },
    { "name": "CLAUDE_CODE_EFFORT_LEVEL", "value": "medium" },
    { "name": "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS", "value": "1" },
    { "name": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "value": "1" }
  ]
}
```

Exports include keys. Blank `ANTHROPIC_AUTH_TOKEN` before sharing a profile with teammates.

### Bulk Export (`profiles.json`)

```json
[
  { "name": "AI Incubator — Project A", "notes": "...", "variables": [...] },
  { "name": "AI Incubator — Birthright", "notes": "...", "variables": [...] }
]
```

---

## 🔧 Commands Reference

| Command | How to access | Description |
|---|---|---|
| `Add API Profile` | Sidebar **+** | Create a new profile |
| `Edit Profile` | Inline ✎ | Edit profile in web form |
| `Edit Profile as JSON` | Right-click | Open the editor in JSON mode — toggle between Form and JSON views, Save validates the syntax first |
| `Apply Profile` | Inline ✓ | Write the profile to the current mode's target |
| `Test API Connection` | Inline ▶ | Test endpoint connectivity |
| `Quick Switch Profile` | `Ctrl+Shift+P` / status bar | Fast profile switching |
| `Choose Where Profiles Are Saved` | Sidebar ⋯ / Quick Switch | Switch between workspace mode (default) and user mode |
| `Duplicate Profile` | Right-click | Clone a profile |
| `Import Profile from Current Settings` | Sidebar ↓ | Capture the current workspace's (or user) config |
| `Export Profile as JSON` | Right-click | Export single profile |
| `Export All Profiles` | Sidebar ⋯ | Bulk backup — all profiles as one JSON file |
| `Import Profile from JSON` | Sidebar ⋯ | Import a single profile — also accepts an Export-All file (imports all) |
| `Import Profiles from JSON` | Sidebar ⋯ | Bulk import — also accepts a single profile object |
| `View Current Config` | `Ctrl+Shift+P` | Show the variables in effect and which file they're in |
| `Clear Usage Statistics` | `Ctrl+Shift+P` | Reset usage counters |
| `Refresh Profiles` | Sidebar ↻ | Refresh the tree view |

---

## 🧩 Supported Environments

The extension automatically detects which editor it's running in by locating `settings.json`:

| Editor | Settings Path (macOS) |
|---|---|
| **Cursor** | `~/Library/Application Support/Cursor/User/settings.json` |
| **VS Code** | `~/Library/Application Support/Code/User/settings.json` |
| **VSCodium** | `~/Library/Application Support/VSCodium/User/settings.json` |
| **Windsurf** | `~/Library/Application Support/Windsurf/User/settings.json` |
| **Code - OSS** | `~/Library/Application Support/Code - OSS/User/settings.json` |

Also works on Windows and Linux with platform-aware path detection.

---

## 🛠 Development

See [Build and install from source](#build-and-install-from-source) and [Run it without installing](#run-it-without-installing-extension-development-host) above.

### Debug Commands

- **`Debug: Show Extension State`** — Inspect profiles, storage target, detected active profile, settings paths, and current config (secrets masked)
- **`Debug: Create Test Profile`** — Create a test profile bypassing the webview to verify the storage pipeline

### Project Structure

```
pnnl-claude-switch-poc/
├── package.json           # Extension manifest (commands, settings, menus) + npm scripts
├── extension.js           # All extension logic (single file, no runtime dependencies)
├── .vscode/launch.json    # F5 → Extension Development Host
├── .github/              # Build & Release workflow + version script (pre-releases, releases)
├── images/                # Icon files
├── LICENSE                # MIT
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

---

## 📦 Releasing

Everything is built by [.github/workflows/publish.yml](.github/workflows/publish.yml) (**Build & Release** in the Actions tab). **Git tags are the source of truth for versions**: the latest full release is the highest `vX.Y.Z` tag, and every other version is derived from it — you never have to edit the version by hand.

| What happens | Version (latest release `v1.2.0`) | Result |
|---|---|---|
| Pull request to `main` | `1.2.1-pr.<pr>.<run>` | `.vsix` uploaded as a workflow artifact only |
| Push / merge to `main` | `1.2.1-pre.<run>` | GitHub **pre-release** with the `.vsix` — never marked *Latest* |
| **Run workflow** (manual) | `1.2.1` (next patch by default) | Full GitHub **release**, marked *Latest* |
| Push a `vX.Y.Z` tag | the tag | Full release of that tag (alternative to the manual run) |

`<run>` is the workflow run number, so each pre-release is newer than the last, and all pre-releases of `1.2.1` sort below the real `1.2.1`.

### Testing a pre-release

Every merge to `main` produces one. Download `pnnl-claude-switch-<version>.vsix` from the newest pre-release on the [Releases page](https://github.com/canichols2-pnnl/pnnl-claude-switch-poc/releases) and install it with `code --install-extension <file> --force`. Only the newest 10 pre-releases are kept.

### Cutting a full release

1. (Optional) Add a `## [1.2.1] — YYYY-MM-DD` section to `CHANGELOG.md` in a PR and merge it — it becomes the top of the release notes (GitHub's generated list of merged PRs is appended either way)
2. Go to **Actions → Build & Release → Run workflow**, leave the branch as `main`
3. Choose the bump (`patch` default, `minor`, or `major`) — or type an exact version like `1.2.1`
4. Run it. The workflow builds `main`, tags `v1.2.1`, publishes the release as *Latest*, deletes the `1.2.1-pre.*` pre-releases it supersedes, and commits `"version": "1.2.1"` to `package.json` on `main`

The run refuses versions that already exist or aren't newer than the latest release. Pushing a `vX.Y.Z` tag yourself does the same build and release (without the `package.json` commit).

`package.json`'s `version` only matters for local `npm run package` builds; CI stamps the computed version into the package before building.

### Marketplace / Open VSX (optional)

The workflow has commented-out steps for publishing to the VS Code Marketplace (`VSCE_PAT` secret, an Azure DevOps PAT for a [publisher](https://marketplace.visualstudio.com/manage/createpublisher)) and Open VSX (`OVSX_PAT`). Uncomment them and add the secrets to enable.

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Ideas for contributions:
- Fetch the model list from AI Incubator (`/v1/models`) in the profile editor
- Cost estimation from AI Incubator usage
- More PNNL templates as new models are added

---

## 📄 License

MIT © 2026 PNNL Claude API Switch Contributors. See [LICENSE](LICENSE) for details.
