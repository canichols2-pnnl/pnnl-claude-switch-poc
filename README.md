# 🤖 Claude API Switch

> Manage and switch Claude Code API endpoint profiles — **no Claude Code login required, just plug in your API key and go.**

[![Release](https://img.shields.io/github/v/release/canichols2-pnnl/pnnl-claude-switch-poc)](https://github.com/canichols2-pnnl/pnnl-claude-switch-poc/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-007acc)](https://code.visualstudio.com/)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-8b5cf6)](https://cursor.sh/)

---

## ⚡ What is this?

Claude Code connects to an AI backend via API. When you use providers like **DeepSeek**, **Alibaba Qwen**, or a local proxy, you need to set environment variables (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, etc.) in your editor's `settings.json`.

This extension gives you a **sidebar UI** to manage those configurations as named profiles and switch between them with a single click. No more digging through JSON files by hand.

> **🚫 No Claude Code account needed.** This extension only writes environment variables to `settings.json`. You bring your own API key from any Anthropic-compatible provider — it works immediately after you fill in the API endpoint and token. No login, no registration, no account required.

---

## 🚀 Quick Start — Add Your First Profile (3 Steps)

The simplest operation: **add a profile, apply it, done.**

<p align="center">
  <img src="https://raw.githubusercontent.com/canichols2-pnnl/pnnl-claude-switch-poc/main/images/get_start.gif" alt="Get started with Claude API Switch" width="800" />
</p>

### Step ① — Open the sidebar

Click the **server icon** <kbd>$(server-environment)</kbd> in the activity bar (left edge of your editor). The **"API Profiles"** panel slides open.

### Step ② — Click **+** and fill in your key

Click the **+** button in the sidebar toolbar → Enter a name (e.g. `My DeepSeek`) → Pick a template (DeepSeek / Aliyun / Anthropic / Local Proxy).

A web form opens with most fields pre-filled. **The only thing you need to do is replace `ANTHROPIC_AUTH_TOKEN` with your actual API key**, then click **Save**.

### Step ③ — Apply and test

- Click the **✓ (Apply)** inline button on your new profile → writes the config to `settings.json`
- Click the **▶ (Test)** button → verifies the endpoint is reachable and shows latency + model info

**That's it.** Claude Code is now using your configured API. The whole process takes under 30 seconds.

---

## 🖥️ Extension Interface — Where to find everything

The extension is designed so you can figure it out just by looking at the sidebar:

| UI Element | Location | What it does |
|---|---|---|
| **Sidebar panel** | Activity bar (left edge) | Lists all your profiles with inline action buttons |
| **+ button** | Sidebar toolbar | Add a new profile |
| **↓ button** | Sidebar toolbar | Capture current `settings.json` config as a profile |
| **🔄 button** | Sidebar toolbar | Quick switch between profiles |
| **⋯ menu** | Sidebar toolbar | Export All / Import Profile(s) from JSON / choose where profiles are saved |
| **✓ Apply** | Inline on each profile | One-click write to `settings.json` |
| **▶ Test** | Inline on each profile | Test the API endpoint (latency, model, errors) |
| **✎ Edit** | Inline on each profile | Open the web form editor |
| **Status bar** | Bottom of editor window | Shows the profile actually found in the settings file (re-verified automatically) — click to quick-switch |
| **Command palette** | `Cmd+Shift+P` | Search "Claude API Switch" for all commands |

Each profile in the sidebar shows its name, notes preview, and usage count — active profile is marked with a **★** star.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📋 **Profile CRUD** | Create, edit, duplicate, and delete API profiles with an intuitive web form |
| ⚡ **One-Click Apply** | Apply any profile to instantly update `claudeCode.environmentVariables` |
| 🧪 **API Testing** | Test connectivity to each endpoint — reports latency, model info, token usage, and error diagnostics |
| 📊 **Usage Tracking** | Tracks how many times each profile was applied, with timestamps and test history |
| 🔄 **Quick Switch** | `Cmd+Shift+P` or click the status bar to swap profiles instantly |
| 📝 **Profile Notes** | Add descriptions to profiles (account info, expiry dates, etc.) |
| 🎨 **Templates** | Pre-built templates for DeepSeek, Aliyun Qwen, Anthropic, Local Proxy |
| 📥 **Import from Current** | Capture whatever is in `settings.json` right now as a profile |
| 📤 **Bulk Export/Import** | Backup or share all profiles as a single JSON file; import accepts a single profile or a whole file |
| 🔧 **JSON Editor** | Toggle the editor between Form and JSON views — Save validates the syntax before updating |
| 🌐 **Auto-Detect Editor** | Works with Cursor, VS Code, VSCodium, Windsurf, and other VS Code-based editors |
| 🗂️ **Per-Workspace Profiles** | Optional `claudeSwitch.storageTarget: "workspace"` mode — each VS Code window uses its own profile via `.claude/settings.local.json` |
| ✅ **Verified Active Profile** | The ★ / status bar reflect what is really in the settings file, re-checked on file changes, window focus and a periodic poll |
| 🔐 **Secret Storage** | API tokens/keys are stored in VS Code SecretStorage (OS keychain), not plain extension state, and masked in the sidebar |
| 🐛 **Debug Tools** | Built-in debug commands to inspect state and test the storage pipeline |

---

## 📸 Demo

<p align="center">
  <img src="https://raw.githubusercontent.com/canichols2-pnnl/pnnl-claude-switch-poc/main/images/get_start.gif" alt="Claude API Switch demo" width="800" />
</p>

---

## 🧩 Why use this?

| Scenario | Without this extension | With this extension |
|---|---|---|
| Switch between DeepSeek and Aliyun | Manually edit `settings.json` each time | One click in the sidebar |
| Test if a new API key works | `curl` commands or write a script | Click the ▶ Test button |
| Share config with teammates | Copy-paste JSON fragments | Export profile → send file → they import |
| Try a new model provider | Look up URLs, models, edit JSON | Pick a template, fill in the key, done |
| Track which key you use most | Manual notes | Built-in usage stats with timestamps |

---

## 🚀 Installation

### Install a released VSIX

1. Download `claude-switch-<version>.vsix` from the latest [GitHub Release](https://github.com/canichols2-pnnl/pnnl-claude-switch-poc/releases/latest)
2. In VS Code / Cursor open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`) → **…** menu → **Install from VSIX…**
3. Select the downloaded file and reload the window

Or from the command line:

```bash
code --install-extension claude-switch-1.2.0.vsix     # VS Code
cursor --install-extension claude-switch-1.2.0.vsix   # Cursor
```

### Build and install from source

Prerequisites: **Node.js 20+** and **npm** (the only dependency is the packaging tool, [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce); the extension itself has no runtime dependencies and no compile step).

```bash
git clone https://github.com/canichols2-pnnl/pnnl-claude-switch-poc.git
cd pnnl-claude-switch-poc
npm ci                 # installs @vscode/vsce from package-lock.json
npm run package        # → claude-switch-<version>.vsix in the repo root
code --install-extension claude-switch-1.2.0.vsix --force
```

`--force` replaces an already-installed version. Reload the VS Code window afterwards (**Developer: Reload Window**). The `.vsix` file is git-ignored.

To check exactly what goes into the package without building it: `npx vsce ls`.

> **Corporate npm mirror?** If `npm ci` fails with `403 Forbidden` from an internal registry (e.g. Artifactory blocking a `@vscode/vsce` dependency by security policy), you can't build locally until the mirror allows it — download the `.vsix` from the build on any pull request (**Actions** → run → **Artifacts**) or from a release instead.

### Run it without installing (Extension Development Host)

1. Open the repo folder in VS Code
2. Press **F5** (or **Run and Debug → Run Extension**) — this uses [.vscode/launch.json](.vscode/launch.json) and opens a second window with the extension loaded from source
3. After editing `extension.js`, run **Developer: Reload Window** in that second window to pick up the change
4. Logs (`[Claude API Switch] …`) appear in the **Debug Console** of the first window

---

## 📋 Profile Format

### Single Profile (`.json`)

```json
{
  "name": "DeepSeek Production",
  "notes": "Main production account, expires 2026-12-31",
  "variables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "https://api.deepseek.com/anthropic" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "sk-..." },
    { "name": "ANTHROPIC_MODEL", "value": "deepseek-v4-pro[1m]" },
    { "name": "ANTHROPIC_DEFAULT_OPUS_MODEL", "value": "deepseek-v4-pro[1m]" },
    { "name": "ANTHROPIC_DEFAULT_SONNET_MODEL", "value": "deepseek-v4-pro[1m]" },
    { "name": "ANTHROPIC_DEFAULT_HAIKU_MODEL", "value": "deepseek-v4-flash" },
    { "name": "CLAUDE_CODE_SUBAGENT_MODEL", "value": "deepseek-v4-flash" },
    { "name": "CLAUDE_CODE_EFFORT_LEVEL", "value": "max" }
  ]
}
```

### Bulk Export (`profiles.json`)

```json
[
  { "name": "DeepSeek", "notes": "...", "variables": [...] },
  { "name": "Aliyun Qwen", "notes": "...", "variables": [...] }
]
```

---

## 🗂️ Where profiles are saved — user vs. workspace

By default, **Apply** writes the profile into `claudeCode.environmentVariables` in your **user** `settings.json`. That setting is shared by every VS Code window, so applying a profile in one window changes it for all of them.

To use a different profile per project, set:

```jsonc
// User settings
"claudeSwitch.storageTarget": "workspace"
```

(or run **Choose Where Profiles Are Saved** from the sidebar `⋯` menu / Quick Switch). In workspace mode:

- **Apply** writes the profile's variables into the `env` block of `<workspace folder>/.claude/settings.local.json`, which Claude Code reads per project. Other content in that file (permissions, your own env vars) is preserved; only keys belonging to profiles are replaced. Empty values are not written.
- `.claude/settings.local.json` is added to the repo's `.git/info/exclude` so API keys are never committed (no tracked file is changed).
- `claudeCode.environmentVariables` is **removed from user settings**, so there is no user-level value competing with the workspace one. If the removed value didn't match a saved profile, it is first saved as a "User settings backup" profile.
- In multi-root workspaces you're asked which folder to apply to; the status bar follows the folder of the active editor.

Claude reads environment variables when a session starts — **restart running Claude sessions** after switching.

### Active profile verification

The extension never trusts a stored "last applied" id. The ★ in the sidebar and the status bar are derived by comparing the variables actually present in the target file against your saved profiles:

| Status bar | Meaning |
|---|---|
| `★ Profile name` | Settings exactly match that profile |
| `⚠ Claude API: modified` | Settings were changed outside the extension (tooltip shows the closest profile and which keys differ) |
| `Claude API` | No profile variables are set in the target |

It re-checks when `.claude/settings.local.json` or user settings change, when the window regains focus (picking up changes made in other windows), and every `claudeSwitch.statusRefreshIntervalSeconds` (default 30, `0` disables polling).

---

## 🔧 Commands Reference

| Command | How to access | Description |
|---|---|---|
| `Add API Profile` | Sidebar **+** | Create a new profile |
| `Edit Profile` | Inline ✎ | Edit profile in web form |
| `Edit Profile as JSON` | Right-click | Open the editor in JSON mode — toggle between Form and JSON views, Save validates the syntax first |
| `Apply Profile` | Inline ✓ | Write to `settings.json` |
| `Test API Connection` | Inline ▶ | Test endpoint connectivity |
| `Quick Switch Profile` | `Cmd+Shift+P` / status bar | Fast profile switching |
| `Choose Where Profiles Are Saved` | Sidebar ⋯ / Quick Switch | Toggle between user settings and per-workspace storage |
| `Duplicate Profile` | Right-click | Clone a profile |
| `Import Profile from Current Settings` | Sidebar ↓ | Capture current config |
| `Export Profile as JSON` | Right-click | Export single profile |
| `Export All Profiles` | Sidebar ⋯ | Bulk backup — all profiles as one JSON file |
| `Import Profile from JSON` | Sidebar ⋯ | Import a single profile — also accepts an Export-All file (imports all) |
| `Import Profiles from JSON` | Sidebar ⋯ | Bulk import — also accepts a single profile object |
| `View Current Config` | `Cmd+Shift+P` | Inspect active settings |
| `Clear Usage Statistics` | `Cmd+Shift+P` | Reset usage counters |
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
├── .github/workflows/     # Release workflow (builds the VSIX, creates a GitHub Release)
├── images/                # Icon files
├── LICENSE                # MIT
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

---

## 📦 Releasing

Releases are built by [.github/workflows/publish.yml](.github/workflows/publish.yml). Every pull request to `main` also builds the `.vsix` and uploads it as a workflow artifact, so packaging is verified before release. Pushing a `v*` tag packages the extension and creates a **GitHub Release** with the `.vsix` attached and the matching CHANGELOG section as release notes.

1. Bump `"version"` in `package.json` (e.g. `1.2.0`) and run `npm install` so `package-lock.json` matches
2. Add a `## [1.2.0] — YYYY-MM-DD` section to `CHANGELOG.md`
3. Commit and merge to `main`
4. Tag and push — the tag **must** equal `v` + the `package.json` version, or the workflow fails:

   ```bash
   git checkout main && git pull
   git tag v1.2.0
   git push origin v1.2.0
   ```

5. Watch the **Publish Extension** run under the repo's **Actions** tab; when it finishes the release appears under **Releases**

Tags with a suffix (e.g. `v1.3.0-beta.1`) are published as pre-releases. To re-run a failed release, delete the release and tag on GitHub, fix the problem, and push the tag again.

### Marketplace / Open VSX (optional)

The workflow has commented-out steps for publishing to the VS Code Marketplace (`VSCE_PAT` secret, an Azure DevOps PAT for a [publisher](https://marketplace.visualstudio.com/manage/createpublisher)) and Open VSX (`OVSX_PAT`). Uncomment them and add the secrets to enable.

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Ideas for contributions:
- Additional API provider templates
- Cost estimation based on token usage
- Workspace-specific profile auto-switching
- i18n / localization
- More comprehensive API response parsing

---

## 📄 License

MIT © 2026 Claude API Switch Contributors. See [LICENSE](LICENSE) for details.
