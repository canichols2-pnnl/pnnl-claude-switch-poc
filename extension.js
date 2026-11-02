// ─────────────────────────────────────────────
// Claude API Switch — VS Code / Cursor Extension
//
// Manage and switch Claude Code API endpoint
// profiles from a sidebar tree-view. Supports
// CRUD, API connectivity testing, usage stats,
// quick-switch, import/export, templates, and more.
// ─────────────────────────────────────────────
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════

const STORAGE_KEY_PROFILES = 'claudeSwitch.profiles';
const STORAGE_KEY_LEGACY_ACTIVE_ID = 'claudeSwitch.appliedProfileId'; // no longer used — active profile is detected
const STORAGE_KEY_USAGE    = 'claudeSwitch.usageStats';
const STORAGE_KEY_SECRET_KEYS = 'claudeSwitch.secretKeys';   // globalState: ids of values held in SecretStorage
const STORAGE_KEY_OWNED_ENV   = 'claudeSwitch.ownedEnvKeys'; // workspaceState: env keys we wrote, per folder
const CONFIG_NAMESPACE = 'claudeCode';
const CONFIG_KEY = 'environmentVariables';

const EXT_NAMESPACE = 'claudeSwitch';
const SETTING_STORAGE_TARGET = 'storageTarget';               // 'user' | 'workspace'
const SETTING_REFRESH_SECONDS = 'statusRefreshIntervalSeconds';
const LOCAL_SETTINGS_DIR  = '.claude';
const LOCAL_SETTINGS_FILE = 'settings.local.json';
const GIT_EXCLUDE_PATTERN = `**/${LOCAL_SETTINGS_DIR}/${LOCAL_SETTINGS_FILE}`;

/** Variable names whose values are kept in SecretStorage and masked in the UI */
const SECRET_NAME_RE = /TOKEN|KEY|SECRET|PASSWORD/i;

const LOG_PREFIX = '[Claude API Switch]';

/** Standard env-var names */
const STANDARD_VAR_NAMES = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
];

/** Pre-built templates for common providers */
const TEMPLATES = {
  'DeepSeek': [
    { name: 'ANTHROPIC_BASE_URL',              value: 'https://api.deepseek.com/anthropic' },
    { name: 'ANTHROPIC_AUTH_TOKEN',             value: '' },
    { name: 'ANTHROPIC_MODEL',                  value: 'deepseek-v4-pro[1m]' },
    { name: 'ANTHROPIC_DEFAULT_OPUS_MODEL',     value: 'deepseek-v4-pro[1m]' },
    { name: 'ANTHROPIC_DEFAULT_SONNET_MODEL',   value: 'deepseek-v4-pro[1m]' },
    { name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',    value: 'deepseek-v4-flash' },
    { name: 'CLAUDE_CODE_SUBAGENT_MODEL',       value: 'deepseek-v4-flash' },
    { name: 'CLAUDE_CODE_EFFORT_LEVEL',         value: 'max' },
  ],
  'Aliyun DashScope (Qwen)': [
    { name: 'ANTHROPIC_BASE_URL',              value: 'https://dashscope.aliyuncs.com/apps/anthropic' },
    { name: 'ANTHROPIC_AUTH_TOKEN',             value: '' },
    { name: 'ANTHROPIC_MODEL',                  value: 'qwen3.7-max' },
    { name: 'ANTHROPIC_DEFAULT_OPUS_MODEL',     value: 'qwen3.7-max' },
    { name: 'ANTHROPIC_DEFAULT_SONNET_MODEL',   value: 'qwen3.7-max' },
    { name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',    value: 'qwen3.7-max' },
    { name: 'CLAUDE_CODE_SUBAGENT_MODEL',       value: 'qwen3.7-max' },
    { name: 'CLAUDE_CODE_EFFORT_LEVEL',         value: 'max' },
  ],
  'Anthropic Official': [
    { name: 'ANTHROPIC_BASE_URL',              value: 'https://api.anthropic.com' },
    { name: 'ANTHROPIC_AUTH_TOKEN',             value: '' },
    { name: 'ANTHROPIC_MODEL',                  value: 'claude-sonnet-4-6' },
    { name: 'ANTHROPIC_DEFAULT_OPUS_MODEL',     value: 'claude-opus-4-8' },
    { name: 'ANTHROPIC_DEFAULT_SONNET_MODEL',   value: 'claude-sonnet-4-6' },
    { name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',    value: 'claude-haiku-4-5-20251001' },
    { name: 'CLAUDE_CODE_SUBAGENT_MODEL',       value: 'claude-sonnet-4-6' },
    { name: 'CLAUDE_CODE_EFFORT_LEVEL',         value: 'max' },
  ],
  'Local Proxy': [
    { name: 'ANTHROPIC_BASE_URL',              value: 'http://127.0.0.1:15722' },
    { name: 'ANTHROPIC_AUTH_TOKEN',             value: 'PROXY_MANAGED' },
    { name: 'ANTHROPIC_MODEL',                  value: '' },
    { name: 'ANTHROPIC_DEFAULT_OPUS_MODEL',     value: '' },
    { name: 'ANTHROPIC_DEFAULT_SONNET_MODEL',   value: '' },
    { name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',    value: '' },
    { name: 'CLAUDE_CODE_SUBAGENT_MODEL',       value: '' },
    { name: 'CLAUDE_CODE_EFFORT_LEVEL',         value: 'max' },
  ],
  'Empty': [
    { name: 'ANTHROPIC_BASE_URL',              value: '' },
    { name: 'ANTHROPIC_AUTH_TOKEN',             value: '' },
    { name: 'ANTHROPIC_MODEL',                  value: '' },
    { name: 'ANTHROPIC_DEFAULT_OPUS_MODEL',     value: '' },
    { name: 'ANTHROPIC_DEFAULT_SONNET_MODEL',   value: '' },
    { name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',    value: '' },
    { name: 'CLAUDE_CODE_SUBAGENT_MODEL',       value: '' },
    { name: 'CLAUDE_CODE_EFFORT_LEVEL',         value: 'max' },
  ],
};

// ═══════════════════════════════════════════════
//  LOGGING
// ═══════════════════════════════════════════════

function logInfo(msg)  { console.log(`${LOG_PREFIX} ${msg}`); }
function logError(msg, err) { console.error(`${LOG_PREFIX} ${msg}`, err || ''); }

// ═══════════════════════════════════════════════
//  PLATFORM-AWARE SETTINGS PATH DETECTION
// ═══════════════════════════════════════════════

function detectSettingsJsonPath() {
  const appName = vscode.env.appName || 'Visual Studio Code';
  const home = os.homedir();

  const platformPaths = {
    darwin: (name) => path.join(home, 'Library', 'Application Support', name, 'User', 'settings.json'),
    win32:  (name) => path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), name, 'User', 'settings.json'),
    linux:  (name) => path.join(home, '.config', name, 'User', 'settings.json'),
  };
  const getPath = platformPaths[process.platform] || platformPaths.linux;

  let candidate = getPath(appName);
  if (fs.existsSync(candidate)) return candidate;

  const forks = ['Cursor', 'Code', 'Code - OSS', 'VSCodium', 'Windsurf', 'Code - Insiders', 'Cursor Nightly'];
  for (const fork of forks) {
    candidate = getPath(fork);
    if (fs.existsSync(candidate)) return candidate;
  }
  return getPath(appName);
}

function getEditorLabel() {
  const p = detectSettingsJsonPath();
  const parts = p.split(path.sep);
  const idx = parts.indexOf('User');
  return idx > 0 ? parts[idx - 1] : (vscode.env.appName || 'VS Code');
}

// ═══════════════════════════════════════════════
//  SETTINGS READ / WRITE
// ═══════════════════════════════════════════════

// ── Storage target: user settings.json vs. per-workspace .claude/settings.local.json ──

function getStorageTarget() {
  const value = vscode.workspace.getConfiguration(EXT_NAMESPACE).get(SETTING_STORAGE_TARGET);
  return value === 'workspace' ? 'workspace' : 'user';
}

/** Workspace folder the current window is "about": the active editor's folder, else the first one. */
function getContextFolder() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return null;
  const doc = vscode.window.activeTextEditor?.document;
  if (doc) {
    const f = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (f) return f;
  }
  return folders[0];
}

/** Folder to apply a profile to — asks only in multi-root workspaces. */
async function pickTargetFolder() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length <= 1) return folders[0] || null;
  return vscode.window.showWorkspaceFolderPick({ placeHolder: 'Apply profile to which workspace folder?' });
}

function describeTarget(folder) {
  if (getStorageTarget() === 'workspace') {
    return folder ? `${LOCAL_SETTINGS_DIR}/${LOCAL_SETTINGS_FILE} in "${folder.name}"` : 'workspace (no folder open)';
  }
  return `${getEditorLabel()} user settings`;
}

/** Reads env vars from whichever storage target is selected. */
async function readCurrentEnvVars(folder) {
  if (getStorageTarget() === 'workspace') {
    folder = folder || getContextFolder();
    return folder ? readLocalEnvVars(folder) : [];
  }
  return readUserEnvVars();
}

/** Writes env vars to whichever storage target is selected. */
async function writeEnvVars(context, variables, folder) {
  if (getStorageTarget() === 'workspace') {
    if (!folder) {
      return { success: false, error: 'No workspace folder is open. Open a folder, or set "claudeSwitch.storageTarget" to "user".' };
    }
    return writeEnvVarsToLocal(context, folder, variables);
  }
  return writeEnvVarsToUser(variables);
}

/** Applies a profile to the selected target (prompting for a folder if needed). */
async function applyProfileVariables(context, profile) {
  let folder = null;
  if (getStorageTarget() === 'workspace') {
    folder = await pickTargetFolder();
    if (!folder && (vscode.workspace.workspaceFolders || []).length > 1) return null; // picker dismissed
  }
  const result = await writeEnvVars(context, profile.variables, folder);
  return { ...result, folder, targetLabel: describeTarget(folder) };
}

function formatApplySuccess(profileName, result) {
  const parts = [`✅ "${profileName}" applied to ${result.targetLabel}.`];
  if (result.cleanup?.removed) parts.push('Removed claudeCode.environmentVariables from user settings.');
  if (result.gitExcluded === false) parts.push(`⚠ Could not add ${LOCAL_SETTINGS_FILE} to .git/info/exclude — make sure it is not committed.`);
  parts.push('Restart any running Claude sessions to pick it up.');
  return parts.join(' ');
}

// ── User settings (claudeCode.environmentVariables) ──

function readUserEnvVars() {
  try {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const vars = config.get(CONFIG_KEY);
    if (Array.isArray(vars)) return vars;
  } catch (_) { /* fall through */ }
  try {
    const settingsPath = detectSettingsJsonPath();
    if (!fs.existsSync(settingsPath)) return [];
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = parseJsonc(raw);
    return parsed?.['claudeCode.environmentVariables'] || [];
  } catch (_) { return []; }
}

/** Removes claudeCode.environmentVariables from user settings entirely. */
async function removeUserEnvVars() {
  const settingsPath = detectSettingsJsonPath();
  const key = `${CONFIG_NAMESPACE}.${CONFIG_KEY}`;
  let present = readUserEnvVars().length > 0;
  try {
    const raw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf-8') : '';
    present = present || raw.includes(`"${key}"`);
  } catch (_) { /* best effort */ }
  if (!present) return { removed: false };

  try {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    await config.update(CONFIG_KEY, undefined, vscode.ConfigurationTarget.Global);
    return { removed: true, method: 'config-api' };
  } catch (_) { /* fall through — setting may not be registered (Claude Code not installed) */ }
  try {
    const removed = removeKeyFromSettingsFile(settingsPath, key);
    return { removed, method: 'file-write' };
  } catch (e) {
    logError('Failed to remove user env vars', e);
    return { removed: false, error: e.message };
  }
}

/** Index of the "]" closing the array that opens at `start` (string-aware), or -1. */
function findArrayEnd(raw, start) {
  let depth = 0, inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function removeKeyFromSettingsFile(settingsPath, key) {
  if (!fs.existsSync(settingsPath)) return false;
  const raw = fs.readFileSync(settingsPath, 'utf-8');
  const keyIndex = raw.indexOf(`"${key}"`);
  if (keyIndex === -1) return false;
  const bracketStart = raw.indexOf('[', raw.indexOf(':', keyIndex));
  const bracketEnd = bracketStart === -1 ? -1 : findArrayEnd(raw, bracketStart);
  if (bracketEnd === -1) return false;

  let start = keyIndex, end = bracketEnd + 1;
  let after = end;
  while (after < raw.length && /\s/.test(raw[after])) after++;
  if (raw[after] === ',') {
    end = after + 1;                         // drop our trailing comma…
    while (end < raw.length && raw[end] !== '\n' && /\s/.test(raw[end])) end++;
    if (raw[end] === '\r') end++;
    if (raw[end] === '\n') end++;            // …and the rest of its line
  } else {
    let before = start - 1;
    while (before >= 0 && /\s/.test(raw[before])) before--;
    if (raw[before] === ',') start = before; // last entry — drop the preceding comma
  }
  while (start > 0 && raw[start - 1] !== '\n' && /\s/.test(raw[start - 1])) start--; // leading indent
  fs.writeFileSync(settingsPath, raw.slice(0, start) + raw.slice(end), 'utf-8');
  return true;
}

// ── Workspace settings (<folder>/.claude/settings.local.json → "env") ──

function localSettingsUri(folder) {
  return vscode.Uri.joinPath(folder.uri, LOCAL_SETTINGS_DIR, LOCAL_SETTINGS_FILE);
}

function isFileNotFound(err) {
  return err?.code === 'FileNotFound' || err?.code === 'ENOENT' || err?.code === 'EntryNotFound';
}

async function readLocalSettings(folder) {
  let raw;
  try {
    raw = Buffer.from(await vscode.workspace.fs.readFile(localSettingsUri(folder))).toString('utf-8');
  } catch (e) {
    if (isFileNotFound(e)) return {};
    throw e;
  }
  if (!raw.trim()) return {};
  const parsed = parseJsonc(raw); // throws on invalid JSON — never overwrite a file we can't read
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

async function readLocalEnvVars(folder) {
  const settings = await readLocalSettings(folder);
  const env = settings.env && typeof settings.env === 'object' ? settings.env : {};
  return Object.entries(env).map(([name, value]) => ({ name, value: value == null ? '' : String(value) }));
}

function ownedEnvStateKey(folder) {
  return `${STORAGE_KEY_OWNED_ENV}:${folder.uri.toString()}`;
}

async function writeEnvVarsToLocal(context, folder, variables) {
  const uri = localSettingsUri(folder);
  try {
    const settings = await readLocalSettings(folder);
    const env = settings.env && typeof settings.env === 'object' ? { ...settings.env } : {};

    // Remove whatever a previous profile put here, but leave unrelated keys alone.
    const stale = new Set([
      ...(context.workspaceState.get(ownedEnvStateKey(folder)) || []),
      ...STANDARD_VAR_NAMES,
      ...loadProfiles(context).flatMap(p => p.variables.map(v => v.name)),
    ]);
    for (const k of stale) delete env[k];

    const written = [];
    for (const v of variables) {
      if (v.value === '' || v.value == null) continue; // an empty var would override Claude's defaults
      env[v.name] = v.value;
      written.push(v.name);
    }
    if (Object.keys(env).length) settings.env = env;
    else delete settings.env;

    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, LOCAL_SETTINGS_DIR));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(settings, null, 2) + '\n', 'utf-8'));
    await context.workspaceState.update(ownedEnvStateKey(folder), written);

    const gitExcluded = await ensureGitExcluded(folder);
    const cleanup = await removeUserEnvVars();
    return { success: true, method: 'local-file', path: uri.fsPath, gitExcluded, cleanup };
  } catch (e) {
    return { success: false, method: 'local-file', error: e.message };
  }
}

/** Resolves a path read from a git file, relative to `base`, onto the same URI scheme. */
function resolveGitPath(base, p) {
  p = p.trim();
  if (!path.isAbsolute(p) && !/^[a-zA-Z]:[\\/]/.test(p)) return vscode.Uri.joinPath(base, p);
  return base.scheme === 'file' ? vscode.Uri.file(p) : base.with({ path: p.replace(/\\/g, '/') });
}

async function readText(uri) {
  return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
}

/**
 * Makes sure .claude/settings.local.json is ignored by adding it to the repo's
 * .git/info/exclude (local-only, so no tracked file is touched). Walks up from the
 * folder to find the repo and follows worktree "gitdir:" / "commondir" pointers.
 * Returns true if excluded (or no repo found), false if it could not be done.
 */
async function ensureGitExcluded(folder) {
  try {
    let dir = folder.uri, gitDir = null;
    for (let i = 0; i < 20 && !gitDir; i++) {
      const dotGit = vscode.Uri.joinPath(dir, '.git');
      try {
        const stat = await vscode.workspace.fs.stat(dotGit);
        if (stat.type & vscode.FileType.Directory) {
          gitDir = dotGit;
        } else {
          const m = (await readText(dotGit)).match(/^gitdir:\s*(.+)$/m);
          if (m) gitDir = resolveGitPath(dir, m[1]);
        }
      } catch (_) { /* not here — keep walking up */ }
      if (gitDir) break;
      const parent = vscode.Uri.joinPath(dir, '..');
      if (parent.path === dir.path) break;
      dir = parent;
    }
    if (!gitDir) return true; // not a git repo — nothing can be committed

    try { gitDir = resolveGitPath(gitDir, (await readText(vscode.Uri.joinPath(gitDir, 'commondir'))).trim()); }
    catch (_) { /* not a linked worktree */ }

    const infoDir = vscode.Uri.joinPath(gitDir, 'info');
    const excludeUri = vscode.Uri.joinPath(infoDir, 'exclude');
    let content = '';
    try { content = await readText(excludeUri); } catch (e) { if (!isFileNotFound(e)) throw e; }
    if (content.split(/\r?\n/).some(l => l.trim() === GIT_EXCLUDE_PATTERN)) return true;

    const prefix = content && !content.endsWith('\n') ? '\n' : '';
    await vscode.workspace.fs.createDirectory(infoDir);
    await vscode.workspace.fs.writeFile(excludeUri,
      Buffer.from(`${content}${prefix}# Claude API Switch — per-workspace API keys\n${GIT_EXCLUDE_PATTERN}\n`, 'utf-8'));
    return true;
  } catch (e) {
    logError('Failed to update .git/info/exclude', e);
    return false;
  }
}

async function writeEnvVarsToUser(variables) {
  try {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    await config.update(CONFIG_KEY, variables, vscode.ConfigurationTarget.Global);
    return { success: true, method: 'config-api' };
  } catch (_) { /* fall through */ }
  try {
    const settingsPath = detectSettingsJsonPath();
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let raw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf-8') : '{}';

    const newJson = JSON.stringify(variables, null, 2);
    const indented = newJson.split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n');

    let updated;
    const key = `"claudeCode.environmentVariables"`;
    const keyIndex = raw.indexOf(key);

    if (keyIndex !== -1) {
      const colonIndex = raw.indexOf(':', keyIndex);
      let bracketStart = raw.indexOf('[', colonIndex);
      if (bracketStart === -1) {
        bracketStart = colonIndex + 1;
        while (bracketStart < raw.length && raw[bracketStart] !== '[') bracketStart++;
      }
      const found = findArrayEnd(raw, bracketStart);
      const bracketEnd = found === -1 ? bracketStart : found;
      updated = raw.slice(0, bracketStart) + indented + raw.slice(bracketEnd + 1);
    } else {
      const trimmed = raw.trimEnd();
      const needsComma = trimmed.endsWith('}') && trimmed.length > 2 && trimmed[trimmed.length - 2] !== '{';
      const insertion = `${needsComma ? ',' : ''}\n  ${key}: ${indented}\n`;
      const lastBrace = trimmed.lastIndexOf('}');
      updated = trimmed.slice(0, lastBrace) + insertion + '}';
    }

    fs.writeFileSync(settingsPath, updated, 'utf-8');
    return { success: true, method: 'file-write' };
  } catch (e) {
    return { success: false, method: 'file-write', error: e.message };
  }
}

function parseJsonc(raw) {
  let cleaned = '', inString = false, stringChar = '', inSLC = false, inBC = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i], next = raw[i + 1];
    if (inSLC) { if (ch === '\n') { inSLC = false; cleaned += ch; } continue; }
    if (inBC)  { if (ch === '*' && next === '/') { inBC = false; i++; } continue; }
    if (inString) { cleaned += ch; if (ch === '\\') { cleaned += next; i++; } else if (ch === stringChar) { inString = false; stringChar = ''; } continue; }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; cleaned += ch; continue; }
    if (ch === '/' && next === '/') { inSLC = true; i++; continue; }
    if (ch === '/' && next === '*') { inBC = true; i++; continue; }
    cleaned += ch;
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned);
}

// ═══════════════════════════════════════════════
//  PROFILE STORAGE
// ═══════════════════════════════════════════════

// Secret-looking variable values (tokens, keys) live in SecretStorage, not globalState.
// globalState keeps `{ name, value: '', secret: true }`; this cache fills the value back in.
const _secretCache = new Map();

function isSecretVar(name) { return SECRET_NAME_RE.test(name || ''); }
function secretId(profileId, varName) { return `${EXT_NAMESPACE}.secret:${profileId}:${varName}`; }

function maskValue(name, value) {
  if (!value) return '';
  if (!isSecretVar(name)) return value;
  return value.length <= 8 ? '••••' : `${value.slice(0, 6)}…${value.slice(-2)}`;
}

/** Re-reads every stored secret into the cache (on activation and window focus). */
async function loadSecretCache(context) {
  const keys = context.globalState.get(STORAGE_KEY_SECRET_KEYS) || [];
  const fresh = new Map();
  for (const k of keys) {
    try {
      const v = await context.secrets.get(k);
      if (v !== undefined) fresh.set(k, v);
    } catch (e) { logError(`Failed to read secret ${k}`, e); }
  }
  _secretCache.clear();
  for (const [k, v] of fresh) _secretCache.set(k, v);
}

/** Returns copies of the stored profiles with secret values filled in. */
function loadProfiles(context) {
  const stored = context.globalState.get(STORAGE_KEY_PROFILES) || [];
  return stored.map(p => ({
    ...p,
    variables: (p.variables || []).map(v => ({
      name: v.name,
      value: v.secret ? (_secretCache.get(secretId(p.id, v.name)) ?? '') : (v.value || ''),
    })),
  }));
}

async function saveProfiles(context, profiles) {
  const prevKeys = new Set(context.globalState.get(STORAGE_KEY_SECRET_KEYS) || []);
  const nextKeys = new Set();
  const stored = profiles.map(p => ({ ...p, variables: [] }));

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    for (const v of p.variables) {
      const id = secretId(p.id, v.name);
      if (isSecretVar(v.name)) {
        // Known secret we never loaded (e.g. added from another window before our cache
        // refreshed) — keep it rather than treating the blank as "cleared".
        const unknownExisting = !v.value && prevKeys.has(id) && !_secretCache.has(id);
        if (v.value || unknownExisting) {
          try {
            if (v.value && _secretCache.get(id) !== v.value) {
              await context.secrets.store(id, v.value);
              _secretCache.set(id, v.value);
            }
            nextKeys.add(id);
            stored[i].variables.push({ name: v.name, value: '', secret: true });
            continue;
          } catch (e) {
            logError(`SecretStorage unavailable — keeping ${v.name} in plain storage`, e);
          }
        }
      }
      stored[i].variables.push({ name: v.name, value: v.value || '' });
    }
  }

  await context.globalState.update(STORAGE_KEY_PROFILES, stored);
  await context.globalState.update(STORAGE_KEY_SECRET_KEYS, [...nextKeys]);
  for (const k of prevKeys) {
    if (nextKeys.has(k)) continue;
    _secretCache.delete(k);
    try { await context.secrets.delete(k); } catch (_) { /* best effort */ }
  }
}

// ═══════════════════════════════════════════════
//  ACTIVE PROFILE DETECTION
//  The active profile is never stored — it is derived by comparing what is
//  actually in the target settings file against the saved profiles, so edits
//  from other windows or by hand are always reflected.
// ═══════════════════════════════════════════════

/** name → value map, ignoring empty values (they are never written to the local file). */
function normalizeVars(vars) {
  const m = new Map();
  for (const v of vars || []) {
    if (v?.name && v.value != null && v.value !== '') m.set(v.name, String(v.value));
  }
  return m;
}

function diffVars(want, have) {
  const diffs = [];
  for (const [k, v] of want) if (have.get(k) !== v) diffs.push(k);
  for (const k of have.keys()) if (!want.has(k)) diffs.push(k);
  return diffs;
}

/**
 * @returns {Promise<{state:'match'|'modified'|'none'|'no-folder'|'error', target:string,
 *   folder:any, profile?:any, closest?:{profile:any,diffs:string[]}, error?:string,
 *   userVarsPresent?:boolean, checkedAt:Date}>}
 */
async function detectActiveProfile(context) {
  const target = getStorageTarget();
  const folder = target === 'workspace' ? getContextFolder() : null;
  const base = { target, folder, checkedAt: new Date() };
  if (target === 'workspace') base.userVarsPresent = readUserEnvVars().length > 0;
  if (target === 'workspace' && !folder) return { ...base, state: 'no-folder' };

  let current;
  try { current = normalizeVars(await readCurrentEnvVars(folder)); }
  catch (e) { return { ...base, state: 'error', error: e.message }; }

  // Only compare keys this extension manages — other env vars in settings.local.json are ignored.
  const profiles = loadProfiles(context);
  const managed = new Set(STANDARD_VAR_NAMES);
  profiles.forEach(p => p.variables.forEach(v => managed.add(v.name)));
  const relevant = new Map([...current].filter(([k]) => managed.has(k)));
  if (relevant.size === 0) return { ...base, state: 'none' };

  let closest = null;
  for (const p of profiles) {
    const diffs = diffVars(normalizeVars(p.variables), relevant);
    if (diffs.length === 0) return { ...base, state: 'match', profile: p };
    if (!closest || diffs.length < closest.diffs.length) closest = { profile: p, diffs };
  }
  return { ...base, state: 'modified', closest };
}

/** Re-checks the active profile on demand and notifies listeners. Checks are serialized. */
class ActiveProfileMonitor {
  constructor(context) {
    this._context = context;
    this.current = { state: 'none', target: getStorageTarget(), folder: null, checkedAt: null };
    this._signature = '';
    this._running = null;
    this._queued = false;
    this._onDidCheck = new vscode.EventEmitter();
    /** fires `(result, changed)` after every check */
    this.onDidCheck = this._onDidCheck.event;
  }

  get activeProfileId() {
    return this.current.state === 'match' ? this.current.profile.id : null;
  }

  check() {
    if (this._running) { this._queued = true; return this._running; }
    this._running = (async () => {
      try {
        do {
          this._queued = false;
          const result = await detectActiveProfile(this._context);
          const profiles = loadProfiles(this._context);
          const signature = JSON.stringify([
            result.target, result.folder?.uri.toString(), result.state, result.profile?.id,
            result.closest?.profile.id, result.closest?.diffs, result.userVarsPresent, result.error,
            profiles.map(p => [p.id, p.name, p.updatedAt]),
          ]);
          const changed = signature !== this._signature;
          this._signature = signature;
          this.current = result;
          this._onDidCheck.fire({ result, changed });
        } while (this._queued);
      } catch (e) {
        logError('Active profile check failed', e);
      } finally {
        this._running = null;
      }
      return this.current;
    })();
    return this._running;
  }

  dispose() { this._onDidCheck.dispose(); }
}

function makeProfile(name, variables, notes) {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    notes: notes || '',
    variables: variables.map(v => ({ name: v.name, value: v.value || '' })),
    createdAt: now,
    updatedAt: now,
  };
}

// ═══════════════════════════════════════════════
//  USAGE STATS TRACKING
// ═══════════════════════════════════════════════

function getUsageStats(context) {
  return context.globalState.get(STORAGE_KEY_USAGE) || {};
}

function recordUsage(context, profileId) {
  const stats = getUsageStats(context);
  const now = new Date().toISOString();
  if (!stats[profileId]) {
    stats[profileId] = { applyCount: 0, firstApplied: now, lastApplied: now, testResults: [] };
  }
  stats[profileId].applyCount++;
  stats[profileId].lastApplied = now;
  return context.globalState.update(STORAGE_KEY_USAGE, stats);
}

function recordTestResult(context, profileId, result) {
  const stats = getUsageStats(context);
  if (!stats[profileId]) {
    stats[profileId] = { applyCount: 0, firstApplied: new Date().toISOString(), lastApplied: '', testResults: [] };
  }
  stats[profileId].testResults = stats[profileId].testResults || [];
  stats[profileId].testResults.push({
    timestamp: new Date().toISOString(),
    success: result.success,
    latency: result.latency,
    model: result.model || '',
    error: result.error || '',
  });
  // Keep last 20 results
  if (stats[profileId].testResults.length > 20) {
    stats[profileId].testResults = stats[profileId].testResults.slice(-20);
  }
  return context.globalState.update(STORAGE_KEY_USAGE, stats);
}

function formatUsageSummary(context, profileId) {
  const stats = getUsageStats(context);
  const s = stats[profileId];
  if (!s) return '';
  const parts = [`Applied ${s.applyCount}×`];
  if (s.lastApplied) {
    const days = Math.floor((Date.now() - new Date(s.lastApplied).getTime()) / 86400000);
    parts.push(days === 0 ? 'Last: today' : `Last: ${days}d ago`);
  }
  return parts.join(' · ');
}

// ═══════════════════════════════════════════════
//  API ENDPOINT TESTING
// ═══════════════════════════════════════════════

/**
 * Test connectivity to an Anthropic-compatible API endpoint.
 * Sends a minimal message (10 tokens) and reports success/failure,
 * latency, model info, and token usage.
 *
 * @param {Array<{name:string,value:string}>} variables
 * @returns {Promise<Object>} structured test result
 */
function testApiEndpoint(variables) {
  const getVar = (name) => (variables.find(v => v.name === name) || {}).value || '';

  const baseUrl = getVar('ANTHROPIC_BASE_URL');
  const authToken = getVar('ANTHROPIC_AUTH_TOKEN');
  const apiKey = getVar('ANTHROPIC_API_KEY');
  const model = getVar('ANTHROPIC_MODEL');

  if (!baseUrl)  return Promise.resolve({ success: false, error: 'ANTHROPIC_BASE_URL is not set' });
  if (!authToken && !apiKey) return Promise.resolve({ success: false, error: 'ANTHROPIC_AUTH_TOKEN (or ANTHROPIC_API_KEY) is not set' });
  if (!model)    return Promise.resolve({ success: false, error: 'ANTHROPIC_MODEL is not set' });

  let url;
  try {
    url = new URL(baseUrl);
    // Append /v1/messages to the existing path (do NOT replace it —
    // baseUrl may already have a path prefix like /apps/anthropic)
    url.pathname = url.pathname.replace(/\/$/, '') + '/v1/messages';
  } catch (_) { return Promise.resolve({ success: false, error: `Invalid BASE_URL: "${baseUrl}"` }); }

  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const requestBody = JSON.stringify({
    model: model,
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Say "ok"' }],
  });

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Same auth headers Claude Code sends: AUTH_TOKEN as Bearer, API_KEY as x-api-key
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(requestBody),
    },
    timeout: 15000,
    rejectUnauthorized: !baseUrl.includes('127.0.0.1') && !baseUrl.includes('localhost'),
  };

  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              latency,
              statusCode: res.statusCode,
              model: json.model || model,
              responseId: json.id || '',
              usage: json.usage || null,
              stopReason: json.stop_reason || '',
              content: (json.content || [])[0]?.text?.slice(0, 200) || '',
            });
          } else {
            resolve({
              success: false,
              latency,
              statusCode: res.statusCode,
              error: json.error?.message || json.error?.type || `HTTP ${res.statusCode}`,
              detail: data.slice(0, 800),
            });
          }
        } catch (_) {
          resolve({
            success: false,
            latency,
            statusCode: res.statusCode,
            error: 'Invalid JSON in response',
            detail: data.slice(0, 500),
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        latency: Date.now() - startTime,
        error: err.code === 'ECONNREFUSED' ? 'Connection refused — is the server running?'
             : err.code === 'ENOTFOUND'    ? 'DNS lookup failed — check the URL'
             : err.code === 'ECONNRESET'   ? 'Connection reset by server'
             : err.code === 'ETIMEDOUT'    ? 'Connection timed out'
             : err.message,
        errorCode: err.code,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, latency: Date.now() - startTime, error: 'Request timed out (15s)' });
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Returns a rich formatted string with the test result.
 */
function formatTestResult(variables, result) {
  const model = (variables.find(v => v.name === 'ANTHROPIC_MODEL') || {}).value || '?';
  const baseUrl = (variables.find(v => v.name === 'ANTHROPIC_BASE_URL') || {}).value || '?';

  // Reconstruct the exact URL for display
  let testUrl = baseUrl;
  try {
    const u = new URL(baseUrl);
    u.pathname = u.pathname.replace(/\/$/, '') + '/v1/messages';
    testUrl = u.toString();
  } catch (_) { /* use baseUrl as-is */ }

  const lines = [
    `API Connection Test`,
    `──────────────────`,
    `Request:   POST ${testUrl}`,
    `Model:     ${model}`,
    `Status:    ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`,
    `Latency:   ${result.latency != null ? result.latency + 'ms' : '?'}`,
  ];

  if (result.success) {
    lines.push(`Response:  ${result.model || model}`);
    lines.push(`Stop:      ${result.stopReason || '?'}`);
    if (result.usage) {
      lines.push(`Tokens:    input=${result.usage.input_tokens || 0} output=${result.usage.output_tokens || 0}`);
    }
    if (result.content) {
      lines.push(`Preview:   "${result.content}"`);
    }
    if (result.responseId) {
      lines.push(`ID:        ${result.responseId}`);
    }
  } else {
    lines.push(`Error:     ${result.error || 'Unknown error'}`);
    if (result.statusCode) lines.push(`HTTP:      ${result.statusCode}`);
    if (result.detail) {
      lines.push(`Detail:    ${result.detail.slice(0, 300)}`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════
//  HTML ESCAPE (server-side)
// ═══════════════════════════════════════════════

function escHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════
//  WEBVIEW — Profile Editor
// ═══════════════════════════════════════════════

function getWebviewHtml(profile, isNew, mode = 'form') {
  const title = isNew ? 'New API Profile' : `Edit: ${profile?.name || ''}`;
  const nameVal = profile?.name || '';
  const notesVal = profile?.notes || '';
  const vars = profile?.variables || [];

  const varRows = vars.map((v, i) => `
    <tr class="var-row" data-index="${i}">
      <td><input class="var-name" type="text" value="${escHtml(v.name)}" placeholder="e.g. ANTHROPIC_BASE_URL" /></td>
      <td><input class="var-value" type="text" value="${escHtml(v.value)}" placeholder="value" /></td>
      <td><button class="btn-icon btn-del-row" title="Remove" type="button">✕</button></td>
    </tr>`).join('');

  const nonce = crypto.randomBytes(16).toString('base64');

  const templateBtns = Object.keys(TEMPLATES).map(t =>
    `<button class="tmpl-btn" data-template="${escHtml(t)}" type="button">${escHtml(t)}</button>`
  ).join('');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>${escHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
  }
  h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  .section { margin-bottom: 16px; }
  label {
    display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px;
    color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.5px;
  }
  input[type="text"], textarea {
    width: 100%; padding: 5px 8px; border: 1px solid var(--vscode-input-border, #ccc);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border-radius: 2px; font-family: inherit; font-size: inherit; resize: vertical;
  }
  textarea { min-height: 40px; }
  input[type="text"]:focus, textarea:focus {
    outline: none; border-color: var(--vscode-focusBorder, #007acc);
  }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); padding: 4px 4px; }
  .var-row td { padding: 3px 4px; }
  .var-name { width: 40%; } .var-value { width: 52%; }
  .btn-icon { background: none; border: none; cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 14px; padding: 2px 6px; border-radius: 3px; }
  .btn-icon:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-errorForeground); }
  .btn-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  button { padding: 5px 12px; border-radius: 2px; border: 1px solid var(--vscode-button-secondaryBackground, #555); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; font-family: inherit; font-size: inherit; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.test-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-terminal-ansiGreen, #4ec9b0); border-color: var(--vscode-terminal-ansiGreen, #4ec9b0); }
  .templates { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .tmpl-btn { font-size: 11px; padding: 3px 8px; }
  #status { font-size: 12px; margin-top: 8px; min-height: 18px; }
  #testResult { font-size: 12px; margin-top: 8px; padding: 8px; border-radius: 4px; white-space: pre-wrap; font-family: monospace; display: none; }
  #testResult.success { display: block; background: #1a3a1a; color: #4ec9b0; border: 1px solid #4ec9b0; }
  #testResult.error { display: block; background: #3a1a1a; color: #f44747; border: 1px solid #f44747; }
  .success-text { color: var(--vscode-terminal-ansiGreen, #4ec9b0); }
  .error-text { color: var(--vscode-errorForeground, #f44747); }
  hr { border: none; border-top: 1px solid var(--vscode-widget-border, #333); margin: 12px 0; }
  .mode-toggle { display: inline-flex; border: 1px solid var(--vscode-input-border, #ccc); border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
  .mode-btn { border: none; background: transparent; color: var(--vscode-descriptionForeground); padding: 5px 16px; cursor: pointer; font-family: inherit; font-size: 12px; }
  .mode-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .mode-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #jsonEditor { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; line-height: 1.5; min-height: 300px; tab-size: 2; }
  .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
</style>
</head>
<body>

<h2>${escHtml(title)}</h2>

<div class="mode-toggle">
  <button id="modeForm" class="mode-btn active" type="button">📋 Form</button>
  <button id="modeJson" class="mode-btn" type="button">{ } JSON</button>
</div>

<div id="formView">
<div class="section">
  <label>Profile Name</label>
  <input id="profileName" type="text" value="${escHtml(nameVal)}" placeholder="My API Profile" />
</div>

<div class="section">
  <label>Notes (optional)</label>
  <textarea id="profileNotes" placeholder="e.g. DeepSeek production account, expires 2026-12-31...">${escHtml(notesVal)}</textarea>
</div>

<div class="section">
  <label>Quick Template</label>
  <div class="templates">${templateBtns}</div>
</div>

<div class="section">
  <label>Environment Variables</label>
  <table id="varTable">
    <thead><tr><th>Name</th><th>Value</th><th></th></tr></thead>
    <tbody>${varRows || '<tr><td colspan="3" style="color:var(--vscode-descriptionForeground);padding:12px 4px;">No variables — add one below or pick a template.</td></tr>'}</tbody>
  </table>
  <div class="btn-row">
    <button id="btnAddRow" type="button">+ Add Variable</button>
    <span style="font-size:11px;color:var(--vscode-descriptionForeground);">Add a custom env variable</span>
  </div>
</div>
</div>

<div id="jsonView" class="section" style="display:none;">
  <label>Profile JSON</label>
  <textarea id="jsonEditor" rows="16" spellcheck="false" placeholder='{ "name": "My Profile", "notes": "", "variables": [ { "name": "ANTHROPIC_BASE_URL", "value": "https://..." } ] }'></textarea>
  <div class="hint">Edit the profile as raw JSON — clicking <strong>Save Profile</strong> validates the syntax first and only updates if it's valid.</div>
</div>

<hr />

<div class="btn-row">
  <button id="btnSave" class="primary" type="button">💾 Save Profile</button>
  <button id="btnCancel" type="button">Cancel</button>
</div>
<div id="status"></div>
<div id="testResult"></div>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();

  document.querySelectorAll('.tmpl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'getTemplate', templateName: btn.dataset.template });
    });
  });

  window.addEventListener('message', ev => {
    const msg = ev.data;
    if (msg.type === 'setTemplate') {
      fillTable(msg.variables);
    }
  });

  function fillTable(vars) {
    const tbody = document.querySelector('#varTable tbody');
    tbody.innerHTML = vars.map((v, i) => \`
      <tr class="var-row" data-index="\${i}">
        <td><input class="var-name" type="text" value="\${escHtml(v.name)}" placeholder="e.g. ANTHROPIC_BASE_URL" /></td>
        <td><input class="var-value" type="text" value="\${escHtml(v.value)}" placeholder="value" /></td>
        <td><button class="btn-icon btn-del-row" title="Remove" type="button">✕</button></td>
      </tr>\`).join('');
    bindRowEvents();
  }

  function bindRowEvents() {
    document.querySelectorAll('.btn-del-row').forEach(btn => {
      btn.addEventListener('click', () => { btn.closest('tr').remove(); updateIndices(); });
    });
  }

  function updateIndices() {
    document.querySelectorAll('.var-row').forEach((row, i) => { row.dataset.index = i; });
  }

  document.getElementById('btnAddRow').addEventListener('click', () => {
    const tbody = document.querySelector('#varTable tbody');
    const i = tbody.querySelectorAll('.var-row').length;
    const row = document.createElement('tr');
    row.className = 'var-row'; row.dataset.index = i;
    row.innerHTML = \`<td><input class="var-name" type="text" value="" placeholder="e.g. CUSTOM_VAR" /></td><td><input class="var-value" type="text" value="" placeholder="value" /></td><td><button class="btn-icon btn-del-row" title="Remove" type="button">✕</button></td>\`;
    tbody.appendChild(row);
    bindRowEvents();
  });

  function collectProfile() {
    const name = document.getElementById('profileName').value.trim();
    const notes = document.getElementById('profileNotes').value.trim();
    const rows = document.querySelectorAll('.var-row');
    const variables = [];
    rows.forEach(row => {
      const nameEl = row.querySelector('.var-name');
      const valueEl = row.querySelector('.var-value');
      if (nameEl && nameEl.value.trim()) {
        variables.push({ name: nameEl.value.trim(), value: valueEl ? valueEl.value : '' });
      }
    });
    return { name, notes, variables };
  }

  // ── Form / JSON mode switching ──
  const initialMode = '${mode}';
  let currentMode = 'form';

  function profileToJson() {
    return JSON.stringify(collectProfile(), null, 2);
  }

  // Returns the parsed/validated profile, or null (with an error shown) if invalid.
  function parseJsonView() {
    const raw = document.getElementById('jsonEditor').value.trim();
    if (!raw) { setStatus('JSON is empty.', 'error'); return null; }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { setStatus('Invalid JSON: ' + e.message, 'error'); return null; }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
      setStatus('Invalid profile: "name" must be a non-empty string.', 'error'); return null;
    }
    if (!Array.isArray(parsed.variables)) {
      setStatus('Invalid profile: "variables" must be an array.', 'error'); return null;
    }
    for (const v of parsed.variables) {
      if (!v || typeof v.name !== 'string' || !v.name.trim()) {
        setStatus('Invalid profile: every variable needs a non-empty "name" string.', 'error'); return null;
      }
    }
    return {
      name: parsed.name.trim(),
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      variables: parsed.variables.map(v => ({
        name: v.name.trim(),
        value: typeof v.value === 'string' ? v.value : String(v.value ?? ''),
      })),
    };
  }

  function switchMode(target) {
    if (target === currentMode) return;
    if (target === 'json') {
      // Serialize the current form state into the JSON view
      document.getElementById('jsonEditor').value = profileToJson();
    } else {
      // Parse & validate JSON before leaving — block the switch if invalid
      const parsed = parseJsonView();
      if (parsed === null) return;
      document.getElementById('profileName').value = parsed.name;
      document.getElementById('profileNotes').value = parsed.notes;
      fillTable(parsed.variables);
    }
    currentMode = target;
    document.getElementById('modeForm').classList.toggle('active', target === 'form');
    document.getElementById('modeJson').classList.toggle('active', target === 'json');
    document.getElementById('formView').style.display = target === 'form' ? '' : 'none';
    document.getElementById('jsonView').style.display = target === 'json' ? '' : 'none';
    setStatus('');
  }

  document.getElementById('modeForm').addEventListener('click', () => switchMode('form'));
  document.getElementById('modeJson').addEventListener('click', () => switchMode('json'));

  document.getElementById('btnSave').addEventListener('click', () => {
    let profile;
    if (currentMode === 'json') {
      profile = parseJsonView();
      if (!profile) return; // syntax check failed — nothing is saved
    } else {
      profile = collectProfile();
      if (!profile.name) { setStatus('Please enter a profile name.', 'error'); return; }
      if (profile.variables.length === 0) { setStatus('Please add at least one environment variable.', 'error'); return; }
    }
    vscodeApi.postMessage({ type: 'save', profile });
  });

  document.getElementById('btnCancel').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'cancel' });
  });

  function setStatus(msg, cls) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = cls || '';
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  bindRowEvents();

  if (initialMode === 'json') switchMode('json');
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════
//  TREE ITEM CLASSES
// ═══════════════════════════════════════════════

class ProfileItem extends vscode.TreeItem {
  constructor(profile, isActive, usageSummary) {
    const label = isActive ? `★ ${profile.name}` : profile.name;
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = profile.id;
    this.contextValue = 'profile';
    const usage = usageSummary ? ` · ${usageSummary}` : '';
    this.description = isActive
      ? `$(pass-filled) Active · ${profile.variables.length} vars${usage}`
      : `${profile.variables.length} vars${usage}`;
    const notesLine = profile.notes ? `\n\n📝 ${profile.notes}` : '';
    this.tooltip = new vscode.MarkdownString(
      profile.variables.map(v => `- **${v.name}**: \`${maskValue(v.name, v.value) || '(empty)'}\``).join('\n\n') +
      `\n\n---\n*Created: ${profile.createdAt}*${notesLine}\n*ID: ${profile.id}*`
    );
    this.iconPath = new vscode.ThemeIcon(isActive ? 'star-full' : 'server');
    this._profile = profile;
    this._isActive = isActive;
  }
}

class VariableItem extends vscode.TreeItem {
  constructor(variable) {
    super(variable.name, vscode.TreeItemCollapsibleState.None);
    const shown = maskValue(variable.name, variable.value);
    this.description = shown || '(empty)';
    this.tooltip = `${variable.name} = ${shown || '(not set)'}`;
    this.iconPath = new vscode.ThemeIcon('symbol-variable');
    this.contextValue = 'variable';
  }
}

// ═══════════════════════════════════════════════
//  TREE DATA PROVIDER
// ═══════════════════════════════════════════════

class ApiProfilesProvider {
  constructor(context) {
    this._context = context;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  /** Redraw and re-verify the active profile (the check redraws again if the result changed). */
  refresh() {
    this._onDidChangeTreeData.fire();
    _monitor?.check();
  }

  /** Redraw only. */
  redraw() { this._onDidChangeTreeData.fire(); }

  getTreeItem(element) { return element; }

  async getChildren(element) {
    if (element) {
      if (element instanceof ProfileItem) {
        return element._profile.variables.map(v => new VariableItem(v));
      }
      return [];
    }

    const profiles = loadProfiles(this._context);
    const activeId = _monitor?.activeProfileId;

    if (profiles.length === 0) {
      const empty = new vscode.TreeItem('No profiles yet', vscode.TreeItemCollapsibleState.None);
      empty.description = 'Click + to add one';
      empty.iconPath = new vscode.ThemeIcon('info');
      empty.command = { command: 'claudeSwitch.addProfile', title: 'Add Profile' };
      return [empty];
    }

    return profiles.map(p => new ProfileItem(p, p.id === activeId, formatUsageSummary(this._context, p.id)));
  }

  getParent() { return null; }
}

// ═══════════════════════════════════════════════
//  WEBVIEW PANEL MANAGER
// ═══════════════════════════════════════════════

class ProfileEditorManager {
  constructor() {
    this._panel = null;
    this._resolve = null;
    this._reject = null;
  }

  async open(profile, options = {}) {
    const isNew = !profile;

    if (this._panel) {
      this._panel.dispose();
      this._panel = null;
      this._resolve = null;
      this._reject = null;
    }

    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;

      this._panel = vscode.window.createWebviewPanel(
        'claudeSwitch.profileEditor',
        isNew ? 'New API Profile' : `Edit: ${profile.name}`,
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this._panel.webview.html = getWebviewHtml(profile, isNew, options.mode);

      this._panel.onDidDispose(() => {
        this._panel = null;
        if (this._reject) { this._reject(new Error('Panel closed')); this._reject = null; this._resolve = null; }
      });

      this._panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
          case 'getTemplate': {
            const tpl = TEMPLATES[msg.templateName];
            if (tpl) this._panel.webview.postMessage({ type: 'setTemplate', variables: tpl });
            break;
          }
          case 'save': {
            const result = msg.profile;
            const r = this._resolve;
            this._resolve = null; this._reject = null;
            this._panel.dispose(); this._panel = null;
            if (r) r(result);
            break;
          }
          case 'cancel': {
            const rej = this._reject;
            this._resolve = null; this._reject = null;
            this._panel.dispose(); this._panel = null;
            if (rej) rej(new Error('Cancelled'));
            break;
          }
        }
      });
    });
  }
}

// ═══════════════════════════════════════════════
//  COMMAND HANDLERS
// ═══════════════════════════════════════════════

let _editorManager = new ProfileEditorManager();
/** @type {ActiveProfileMonitor | null} */
let _monitor = null;

// ── Add Profile ──
async function cmdAddProfile(context, profilesProvider) {
  try {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter a name for the new API profile',
      placeHolder: 'e.g. DeepSeek, Aliyun Qwen, My Custom API',
      validateInput: (value) => {
        if (!value?.trim()) return 'Name is required';
        if (loadProfiles(context).some(p => p.name === value.trim())) return 'A profile with this name already exists';
        return null;
      },
    });
    if (!name) return;

    const templateChoice = await vscode.window.showQuickPick(
      ['Start from template', 'Start empty'],
      { placeHolder: 'How would you like to create this profile?' }
    );
    if (!templateChoice) return;

    let initialVars = [];
    if (templateChoice === 'Start from template') {
      const tplName = await vscode.window.showQuickPick(Object.keys(TEMPLATES), { placeHolder: 'Choose a template' });
      if (!tplName) return;
      initialVars = TEMPLATES[tplName] || [];
    } else {
      initialVars = [{ name: 'ANTHROPIC_BASE_URL', value: '' }];
    }

    const profile = makeProfile(name, initialVars);
    logInfo(`Opening editor for new profile: ${name}`);

    try {
      const result = await _editorManager.open(profile);
      if (result) {
        const profiles = loadProfiles(context);
        profiles.push({
          ...profile,
          name: result.name,
          notes: result.notes || '',
          variables: result.variables,
          updatedAt: new Date().toISOString(),
        });
        await saveProfiles(context, profiles);
        profilesProvider.refresh();
        vscode.window.showInformationMessage(`✅ Profile "${result.name}" created. Apply it to activate.`);
      }
    } catch (err) {
      if (err?.message !== 'Panel closed' && err?.message !== 'Cancelled') {
        logError('Editor save failed', err);
        vscode.window.showErrorMessage(`Failed to save: ${err?.message || err}`);
      }
    }
  } catch (err) { logError('cmdAddProfile', err); vscode.window.showErrorMessage(`Error: ${err.message}`); }
}

// ── Edit Profile ──
async function cmdEditProfile(context, profilesProvider, profileItem) {
  try {
    if (!profileItem) { vscode.window.showErrorMessage('No profile selected.'); return; }
    const profiles = loadProfiles(context);
    const profile = profiles.find(p => p.id === profileItem.id);
    if (!profile) { vscode.window.showErrorMessage('Profile not found.'); return; }

    logInfo(`Opening editor for: ${profile.name}`);
    try {
      const result = await _editorManager.open(profile);
      if (result) await saveEditedProfile(context, profilesProvider, profile, result);
    } catch (err) {
      if (err?.message !== 'Panel closed' && err?.message !== 'Cancelled') {
        logError('Editor open failed', err);
        vscode.window.showErrorMessage(`Failed to save: ${err?.message || err}`);
      }
    }
  } catch (err) { logError('cmdEditProfile', err); vscode.window.showErrorMessage(`Error: ${err.message}`); }
}

// ── Delete Profile ──
async function cmdDeleteProfile(context, profilesProvider, profileItem) {
  if (!profileItem) return;
  const profiles = loadProfiles(context);
  const profile = profiles.find(p => p.id === profileItem.id);
  if (!profile) return;

  const confirm = await vscode.window.showWarningMessage(
    `Delete profile "${profile.name}"? This cannot be undone.`,
    { modal: true }, 'Delete'
  );
  if (confirm !== 'Delete') return;

  await saveProfiles(context, profiles.filter(p => p.id !== profile.id));
  profilesProvider.refresh();
  vscode.window.showInformationMessage(`Profile "${profile.name}" deleted.`);
}

// ── Apply Profile ──
async function cmdApplyProfile(context, profilesProvider, profileItem) {
  if (!profileItem) return;
  const profiles = loadProfiles(context);
  const profile = profiles.find(p => p.id === profileItem.id);
  if (!profile) { vscode.window.showErrorMessage('Profile not found.'); return; }

  const detail = getStorageTarget() === 'workspace'
    ? `This will write ${profile.variables.length} variables to the "env" block of ` +
      `${LOCAL_SETTINGS_DIR}/${LOCAL_SETTINGS_FILE} in this workspace, and remove ` +
      `\`claudeCode.environmentVariables\` from user settings.`
    : `This will update \`claudeCode.environmentVariables\` in ${getEditorLabel()} user settings ` +
      `with ${profile.variables.length} variables (affects every window).`;
  const confirm = await vscode.window.showInformationMessage(
    `Apply profile "${profile.name}"?\n\n${detail}`,
    { modal: true }, 'Apply'
  );
  if (confirm !== 'Apply') return;

  const result = await applyProfileVariables(context, profile);
  if (!result) return;
  if (result.success) {
    await recordUsage(context, profile.id);
    profilesProvider.refresh();
    vscode.window.showInformationMessage(formatApplySuccess(profile.name, result));
  } else {
    vscode.window.showErrorMessage(`Failed to write settings: ${result.error || 'Unknown error'}`);
  }
}

// ── Duplicate Profile ──
async function cmdDuplicateProfile(context, profilesProvider, profileItem) {
  if (!profileItem) return;
  const profiles = loadProfiles(context);
  const source = profiles.find(p => p.id === profileItem.id);
  if (!source) return;

  const name = await vscode.window.showInputBox({
    prompt: 'Enter a name for the duplicate',
    placeHolder: `${source.name} (Copy)`,
    value: `${source.name} (Copy)`,
    validateInput: (v) => {
      if (!v?.trim()) return 'Name is required';
      if (profiles.some(p => p.name === v.trim())) return 'A profile with this name already exists';
      return null;
    },
  });
  if (!name) return;

  profiles.push(makeProfile(name, source.variables, source.notes));
  await saveProfiles(context, profiles);
  profilesProvider.refresh();
  vscode.window.showInformationMessage(`Profile "${name}" duplicated.`);
}

// ── Export Profile ──
async function cmdExportProfile(profileItem) {
  if (!profileItem?._profile) return;
  const p = profileItem._profile;
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${p.name.replace(/\s+/g, '_')}.json`),
    filters: { 'JSON Files': ['json'] },
  });
  if (uri) {
    fs.writeFileSync(uri.fsPath, JSON.stringify({ name: p.name, notes: p.notes, variables: p.variables }, null, 2), 'utf-8');
    vscode.window.showInformationMessage(`Profile exported to ${uri.fsPath}`);
  }
}

// ── Import Profile ──
// Accepts either a single profile object ({ name, notes, variables[] })
// or an array of them (an "Export All" file) — imports all valid entries.
async function cmdImportProfile(context, profilesProvider) {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false, filters: { 'JSON Files': ['json'] }, openLabel: 'Import',
  });
  if (!uris?.length) return;
  try {
    const data = JSON.parse(fs.readFileSync(uris[0].fsPath, 'utf-8'));
    const items = (Array.isArray(data) ? data : [data]).filter(item => (
      item && typeof item.name === 'string' && item.name.trim() &&
      Array.isArray(item.variables) &&
      item.variables.every(v => v && typeof v.name === 'string' && v.name.trim())
    ));
    if (items.length === 0) {
      throw new Error('Invalid format: expected { name, variables[] } or an array of such objects');
    }
    const profiles = loadProfiles(context);
    let imported = 0;
    for (const item of items) {
      let name = item.name.trim(), suffix = 1;
      while (profiles.some(p => p.name === name)) name = `${item.name.trim()} (${suffix++})`;
      profiles.push(makeProfile(name, item.variables, typeof item.notes === 'string' ? item.notes : ''));
      imported++;
    }
    await saveProfiles(context, profiles);
    profilesProvider.refresh();
    vscode.window.showInformationMessage(
      `${imported} profile${imported > 1 ? 's' : ''} imported from ${path.basename(uris[0].fsPath)}.`
    );
  } catch (e) {
    vscode.window.showErrorMessage(`Import failed: ${e.message}`);
  }
}

// ── Export All Profiles ──
async function cmdExportAll(context) {
  const profiles = loadProfiles(context);
  if (profiles.length === 0) {
    vscode.window.showInformationMessage('No profiles to export.');
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('claude-api-switch-profiles.json'),
    filters: { 'JSON Files': ['json'] },
  });
  if (uri) {
    const data = profiles.map(p => ({ name: p.name, notes: p.notes, variables: p.variables }));
    fs.writeFileSync(uri.fsPath, JSON.stringify(data, null, 2), 'utf-8');
    vscode.window.showInformationMessage(`${profiles.length} profiles exported to ${uri.fsPath}`);
  }
}

// ── Import All Profiles ──
// Same lenient format as single import: accepts an array of profiles or one object.
async function cmdImportAll(context, profilesProvider) {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false, filters: { 'JSON Files': ['json'] }, openLabel: 'Import All',
  });
  if (!uris?.length) return;
  try {
    const data = JSON.parse(fs.readFileSync(uris[0].fsPath, 'utf-8'));
    const items = (Array.isArray(data) ? data : [data]).filter(item => (
      item && typeof item.name === 'string' && item.name.trim() &&
      Array.isArray(item.variables) &&
      item.variables.every(v => v && typeof v.name === 'string' && v.name.trim())
    ));
    if (items.length === 0) throw new Error('Expected an array of profiles or a single profile object');

    const profiles = loadProfiles(context);
    let imported = 0;
    for (const item of items) {
      let name = item.name.trim(), suffix = 1;
      while (profiles.some(p => p.name === name)) name = `${item.name.trim()} (${suffix++})`;
      profiles.push(makeProfile(name, item.variables, typeof item.notes === 'string' ? item.notes : ''));
      imported++;
    }
    await saveProfiles(context, profiles);
    profilesProvider.refresh();
    vscode.window.showInformationMessage(
      `${imported} profile${imported > 1 ? 's' : ''} imported from ${path.basename(uris[0].fsPath)}.`
    );
  } catch (e) {
    vscode.window.showErrorMessage(`Import failed: ${e.message}`);
  }
}

// ── Import from Current Settings ──
async function cmdImportFromCurrent(context, profilesProvider) {
  let vars;
  try { vars = await readCurrentEnvVars(); }
  catch (e) { vscode.window.showErrorMessage(`Could not read ${describeTarget(getContextFolder())}: ${e.message}`); return; }
  if (!Array.isArray(vars) || vars.length === 0) {
    vscode.window.showErrorMessage(`No environment variables found in ${describeTarget(getContextFolder())}.`);
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: 'Enter a name for the imported profile',
    placeHolder: 'e.g. My Current Config',
    validateInput: (v) => {
      if (!v?.trim()) return 'Name is required';
      if (loadProfiles(context).some(p => p.name === v.trim())) return 'Name already exists';
      return null;
    },
  });
  if (!name) return;

  const profiles = loadProfiles(context);
  profiles.push(makeProfile(name, vars));
  await saveProfiles(context, profiles);
  profilesProvider.refresh();
  vscode.window.showInformationMessage(`Profile "${name}" created from current settings (${vars.length} vars).`);
}

// ── Edit Profile as JSON ──
// Opens the same webview editor in JSON mode: the Form / JSON toggle in the
// page serializes the profile to JSON, and Save validates the syntax before
// updating. (This replaces the old separate text-document editor, which could
// not reliably apply changes.)

// Apply a webview save result to a profile object (shared by form & JSON edits).
// Reloads the list and replaces the entry by id, so it works even though loadProfiles returns copies.
async function saveEditedProfile(context, profilesProvider, profile, result) {
  const profiles = loadProfiles(context);
  const index = profiles.findIndex(p => p.id === profile.id);
  if (index === -1) { vscode.window.showErrorMessage('Profile no longer exists.'); return; }
  profiles[index] = {
    ...profiles[index],
    name: result.name,
    notes: result.notes || '',
    variables: result.variables,
    updatedAt: new Date().toISOString(),
  };
  await saveProfiles(context, profiles);
  profilesProvider.refresh();
  vscode.window.showInformationMessage(`✅ Profile "${result.name}" updated.`);
}

async function cmdEditAsJson(context, profilesProvider, profileItem) {
  if (!profileItem?._profile) {
    vscode.window.showErrorMessage('No profile selected.');
    return;
  }
  const profiles = loadProfiles(context);
  const profile = profiles.find(p => p.id === profileItem.id);
  if (!profile) return;

  logInfo(`Opening JSON editor for: ${profile.name}`);
  try {
    const result = await _editorManager.open(profile, { mode: 'json' });
    if (result) await saveEditedProfile(context, profilesProvider, profile, result);
  } catch (err) {
    if (err?.message !== 'Panel closed' && err?.message !== 'Cancelled') {
      logError('Editor save failed', err);
      vscode.window.showErrorMessage(`Failed to save: ${err?.message || err}`);
    }
  }
}

// ── API Test ──
async function cmdTestProfile(context, profilesProvider, profileItem) {
  if (!profileItem?._profile) {
    vscode.window.showErrorMessage('No profile selected.');
    return;
  }
  const profiles = loadProfiles(context);
  const profile = profiles.find(p => p.id === profileItem.id);
  if (!profile) return;

  const testMsg = vscode.window.setStatusBarMessage(`$(sync~spin) Testing API for "${profile.name}"...`);
  try {
    const result = await testApiEndpoint(profile.variables);
    testMsg.dispose();
    await recordTestResult(context, profile.id, result);
    profilesProvider.refresh();

    const text = formatTestResult(profile.variables, result);
    const doc = await vscode.workspace.openTextDocument({ content: text, language: 'text' });
    await vscode.window.showTextDocument(doc, { preview: true });

    if (result.success) {
      vscode.window.showInformationMessage(
        `✅ "${profile.name}" API test passed — ${result.latency}ms (${result.model || '?'})`
      );
    } else {
      vscode.window.showWarningMessage(
        `❌ "${profile.name}" API test failed — ${result.error || 'Unknown error'}`
      );
    }
  } catch (err) {
    testMsg.dispose();
    logError('API test error', err);
    vscode.window.showErrorMessage(`API test error: ${err.message}`);
  }
}

// ── Quick Switch ──
async function cmdQuickSwitch(context, profilesProvider) {
  const profiles = loadProfiles(context);
  if (profiles.length === 0) {
    vscode.window.showInformationMessage('No profiles yet. Add one first.');
    return;
  }

  await _monitor?.check(); // verify against the file right before showing the list
  const activeId = _monitor?.activeProfileId;
  const items = profiles.map(p => ({
    label: p.id === activeId ? `★ ${p.name}` : p.name,
    description: p.id === activeId
      ? `$(star-full) Active · ${p.variables.length} vars`
      : `${p.variables.length} vars`,
    detail: p.notes || formatUsageSummary(context, p.id),
    profile: p,
  }));
  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(gear) Change where profiles are saved…',
      description: `Currently: ${getStorageTarget() === 'workspace' ? 'this workspace' : 'user settings'}`,
      action: 'storageTarget',
    },
  );

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Select a profile to apply to ${describeTarget(getContextFolder())}...`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!selected) return;
  if (selected.action === 'storageTarget') {
    await cmdSelectStorageTarget();
    return;
  }

  const result = await applyProfileVariables(context, selected.profile);
  if (!result) return;
  if (result.success) {
    await recordUsage(context, selected.profile.id);
    profilesProvider.refresh();
    vscode.window.showInformationMessage(formatApplySuccess(selected.profile.name, result));
  } else {
    vscode.window.showErrorMessage(`Failed to apply: ${result.error || 'Unknown error'}`);
  }
}

// ── Select Storage Target ──
async function cmdSelectStorageTarget() {
  const current = getStorageTarget();
  const choice = await vscode.window.showQuickPick([
    {
      label: 'User settings', value: 'user',
      description: current === 'user' ? '(current)' : '',
      detail: 'claudeCode.environmentVariables in user settings.json — one profile shared by every window',
    },
    {
      label: 'This workspace', value: 'workspace',
      description: current === 'workspace' ? '(current)' : '',
      detail: `env block of ${LOCAL_SETTINGS_DIR}/${LOCAL_SETTINGS_FILE} per workspace folder — each window can use its own profile`,
    },
  ], { placeHolder: 'Where should Claude API Switch save the applied profile?' });
  if (!choice || choice.value === current) return;
  // The configuration change listener handles the cleanup / migration.
  await vscode.workspace.getConfiguration(EXT_NAMESPACE)
    .update(SETTING_STORAGE_TARGET, choice.value, vscode.ConfigurationTarget.Global);
}

// ── Clear Usage Stats ──
async function cmdClearUsageStats(context, profilesProvider) {
  const confirm = await vscode.window.showWarningMessage(
    'Clear all usage statistics?', { modal: true }, 'Clear'
  );
  if (confirm !== 'Clear') return;
  await context.globalState.update(STORAGE_KEY_USAGE, {});
  profilesProvider.refresh();
  vscode.window.showInformationMessage('Usage statistics cleared.');
}

// ── View Current Config ──
async function cmdViewCurrentConfig() {
  const folder = getContextFolder();
  const label = describeTarget(folder);
  const isLocal = getStorageTarget() === 'workspace';
  const settingsUri = isLocal
    ? (folder ? localSettingsUri(folder) : null)
    : vscode.Uri.file(detectSettingsJsonPath());

  let vars;
  try { vars = await readCurrentEnvVars(folder); }
  catch (e) { vscode.window.showErrorMessage(`Could not read ${label}: ${e.message}`); return; }

  if (!Array.isArray(vars) || vars.length === 0) {
    const result = await vscode.window.showInformationMessage(
      `No environment variables found in ${label}.`,
      ...(settingsUri ? ['Open Settings', 'OK'] : ['OK'])
    );
    if (result === 'Open Settings') {
      try { vscode.window.showTextDocument(await vscode.workspace.openTextDocument(settingsUri)); }
      catch (_) { /* file does not exist yet */ }
    }
    return;
  }

  const content = vars.map(v => `${v.name}=${v.value || ''}`).join('\n');
  const doc = await vscode.workspace.openTextDocument({
    content: `# Current environment variables in ${label}\n# File: ${settingsUri ? settingsUri.fsPath : '(none)'}\n\n${content}`,
    language: 'properties',
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

// ── Debug: Create Test Profile (no webview) ──
async function cmdDebugTestProfile(context, profilesProvider) {
  try {
    const testProfile = makeProfile(`Test-${Date.now()}`, TEMPLATES['DeepSeek']);
    const profiles = loadProfiles(context);
    profiles.push(testProfile);
    await saveProfiles(context, profiles);
    profilesProvider.refresh();
    vscode.window.showInformationMessage(
      `Debug test profile "${testProfile.name}" created (${profiles.length} total). Check sidebar.`
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Debug test failed: ${err.message}`);
  }
}

// ── Debug: Show Extension State ──
async function cmdDebugShowState(context) {
  try {
    const profiles = loadProfiles(context);
    const editorLabel = getEditorLabel();
    const settingsPath = detectSettingsJsonPath();
    const folder = getContextFolder();
    const detected = _monitor ? await _monitor.check() : await detectActiveProfile(context);
    let currentVars = [];
    try { currentVars = await readCurrentEnvVars(folder); } catch (_) { /* reported via detected.error */ }

    const lines = [
      `Editor: ${editorLabel}`, `User settings path: ${settingsPath}`,
      `User settings exists: ${fs.existsSync(settingsPath)}`,
      `Storage target: ${getStorageTarget()} → ${describeTarget(folder)}`,
      ...(getStorageTarget() === 'workspace' && folder ? [`Local settings file: ${localSettingsUri(folder).fsPath}`] : []),
      `Profiles stored: ${profiles.length}`,
      `Secrets cached: ${_secretCache.size}`,
      `Detected state: ${detected.state}${detected.profile ? ` (${detected.profile.name}, id=${detected.profile.id})` : ''}`,
      ...(detected.closest ? [`Closest profile: ${detected.closest.profile.name} — differs in ${detected.closest.diffs.join(', ')}`] : []),
      ...(detected.error ? [`Read error: ${detected.error}`] : []),
      `Current env vars: ${currentVars.length}`,
      ``, `--- Profiles ---`,
    ];
    for (const p of profiles) {
      lines.push(`  - ${p.name} (id=${p.id}, ${p.variables.length} vars)${p.notes ? ' 📝' : ''}`);
    }
    lines.push(``, `--- Current ${describeTarget(folder)} ---`);
    for (const v of currentVars) {
      lines.push(`  ${v.name}=${maskValue(v.name, v.value) || '(empty)'}`);
    }
    const content = lines.join('\n');
    const doc = await vscode.workspace.openTextDocument({ content, language: 'text' });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (err) {
    vscode.window.showErrorMessage(`Debug show state failed: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
//  STORAGE TARGET CHANGES
// ═══════════════════════════════════════════════

/**
 * Runs when claudeSwitch.storageTarget changes. Switching to "workspace" removes
 * claudeCode.environmentVariables from user settings (saving it as a profile first
 * if it doesn't match one), so there is never a user-level value to compete with.
 * Only the focused window acts — the setting change reaches every window.
 */
async function onStorageTargetChanged(context, profilesProvider) {
  const target = getStorageTarget();
  if (!vscode.window.state.focused) { profilesProvider.refresh(); return; }

  if (target === 'user') {
    profilesProvider.refresh();
    vscode.window.showInformationMessage('Claude API Switch now saves profiles to user settings (shared by every window). Apply a profile to write it there.');
    return;
  }

  const userVars = readUserEnvVars();
  if (userVars.length === 0) {
    await removeUserEnvVars(); // clear an empty [] left behind, if any
    profilesProvider.refresh();
    vscode.window.showInformationMessage(`Claude API Switch now saves profiles per workspace (${LOCAL_SETTINGS_DIR}/${LOCAL_SETTINGS_FILE}).`);
    return;
  }

  const profiles = loadProfiles(context);
  const current = normalizeVars(userVars);
  let matched = profiles.find(p => diffVars(normalizeVars(p.variables), current).length === 0);
  let backedUp = false;
  if (!matched) {
    matched = makeProfile(
      `User settings backup ${new Date().toISOString().slice(0, 10)}`, userVars,
      'Saved automatically when switching to per-workspace storage.'
    );
    profiles.push(matched);
    await saveProfiles(context, profiles);
    backedUp = true;
  }

  const cleanup = await removeUserEnvVars();
  profilesProvider.refresh();

  const msg = cleanup.error
    ? `Claude API Switch now saves profiles per workspace, but claudeCode.environmentVariables could not be removed from user settings: ${cleanup.error}`
    : `Claude API Switch now saves profiles per workspace. Removed claudeCode.environmentVariables from user settings` +
      (backedUp ? ` (saved as profile "${matched.name}").` : '.');
  const applyHere = (vscode.workspace.workspaceFolders || []).length ? `Apply "${matched.name}" here` : null;
  const show = cleanup.error ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
  const pick = await show(msg, ...(applyHere ? [applyHere] : []));
  if (!pick || pick !== applyHere) return;

  const result = await applyProfileVariables(context, matched);
  if (!result) return;
  if (result.success) {
    await recordUsage(context, matched.id);
    profilesProvider.refresh();
    vscode.window.showInformationMessage(formatApplySuccess(matched.name, result));
  } else {
    vscode.window.showErrorMessage(`Failed to apply: ${result.error || 'Unknown error'}`);
  }
}

// ═══════════════════════════════════════════════
//  STATUS BAR
// ═══════════════════════════════════════════════

function renderStatusBar(item, result) {
  const where = describeTarget(result.folder);
  const lines = [];
  item.backgroundColor = undefined;

  switch (result.state) {
    case 'match':
      item.text = `$(star-full) ${result.profile.name}`;
      lines.push(`**Active:** ${result.profile.name}`, `**Saved in:** ${where}`);
      break;
    case 'modified':
      item.text = '$(warning) Claude API: modified';
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      lines.push(`**The settings in ${where} don't match any saved profile.**`);
      if (result.closest) {
        lines.push(`Closest: "${result.closest.profile.name}" — differs in \`${result.closest.diffs.join('`, `')}\``);
      }
      break;
    case 'error':
      item.text = '$(error) Claude API';
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      lines.push(`**Could not read ${where}:** ${result.error}`);
      break;
    case 'no-folder':
      item.text = '$(server-environment) Claude API';
      lines.push('Saving per workspace, but no folder is open.');
      break;
    default:
      item.text = '$(server-environment) Claude API';
      lines.push(`No profile applied in ${where}.`);
  }

  if (result.userVarsPresent) {
    lines.push('$(warning) `claudeCode.environmentVariables` is set in user settings again — apply a profile to remove it.');
  }
  const checked = result.checkedAt ? result.checkedAt.toLocaleTimeString() : '—';
  lines.push(
    '---',
    `Last verified ${checked} · [Switch profile](command:claudeSwitch.quickSwitch) · ` +
    `[Change storage](command:claudeSwitch.selectStorageTarget) · [Re-check](command:claudeSwitch.refreshProfiles)`
  );

  const md = new vscode.MarkdownString(lines.join('\n\n'), true);
  md.isTrusted = true;
  item.tooltip = md;
}

// ═══════════════════════════════════════════════
//  EXTENSION LIFECYCLE
// ═══════════════════════════════════════════════

function activate(context) {
  const editorLabel = getEditorLabel();
  const settingsPath = detectSettingsJsonPath();
  const remoteName = vscode.env.remoteName;  // e.g. 'ssh-remote', 'wsl', 'dev-container', or undefined (local)

  logInfo(`Detected editor: ${editorLabel}`);
  logInfo(`Remote context: ${remoteName || 'local (none)'}`);
  logInfo(`Storage target: ${getStorageTarget()}`);
  logInfo(`User settings: ${settingsPath}`);
  logInfo(`Extension kind: ${vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop'}`);

  _monitor = new ActiveProfileMonitor(context);
  context.subscriptions.push(_monitor);

  const profilesProvider = new ApiProfilesProvider(context);

  const treeView = vscode.window.createTreeView('claudeSwitch.profilesView', {
    treeDataProvider: profilesProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  const register = (cmd, handler) => {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  };

  register('claudeSwitch.addProfile',          () => cmdAddProfile(context, profilesProvider));
  register('claudeSwitch.editProfile',         (item) => cmdEditProfile(context, profilesProvider, item));
  register('claudeSwitch.deleteProfile',       (item) => cmdDeleteProfile(context, profilesProvider, item));
  register('claudeSwitch.applyProfile',        (item) => cmdApplyProfile(context, profilesProvider, item));
  register('claudeSwitch.duplicateProfile',    (item) => cmdDuplicateProfile(context, profilesProvider, item));
  register('claudeSwitch.exportProfile',       (item) => cmdExportProfile(item));
  register('claudeSwitch.importProfile',       () => cmdImportProfile(context, profilesProvider));
  register('claudeSwitch.exportAll',           () => cmdExportAll(context));
  register('claudeSwitch.importAll',           () => cmdImportAll(context, profilesProvider));
  register('claudeSwitch.importFromCurrent',   () => cmdImportFromCurrent(context, profilesProvider));
  register('claudeSwitch.editAsJson',          (item) => cmdEditAsJson(context, profilesProvider, item));
  register('claudeSwitch.testProfile',         (item) => cmdTestProfile(context, profilesProvider, item));
  register('claudeSwitch.quickSwitch',         () => cmdQuickSwitch(context, profilesProvider));
  register('claudeSwitch.selectStorageTarget', () => cmdSelectStorageTarget());
  register('claudeSwitch.clearUsageStats',     () => cmdClearUsageStats(context, profilesProvider));
  register('claudeSwitch.refreshProfiles',     async () => { await loadSecretCache(context); profilesProvider.refresh(); });
  register('claudeSwitch.viewCurrentConfig',   () => cmdViewCurrentConfig());
  register('claudeSwitch.debugTestProfile',    () => cmdDebugTestProfile(context, profilesProvider));
  register('claudeSwitch.debugShowState',      () => cmdDebugShowState(context));

  // ── Status bar item — click to quick-switch, shows the *verified* active profile ──
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'claudeSwitch.quickSwitch';
  statusBarItem.text = '$(server-environment) Claude API';
  statusBarItem.tooltip = 'Claude API Switch — Click to switch profile';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  context.subscriptions.push(_monitor.onDidCheck(({ result, changed }) => {
    renderStatusBar(statusBarItem, result);
    if (changed) profilesProvider.redraw();
  }));

  // ── Re-verify whenever the source of truth may have changed ──
  const check = () => _monitor.check();
  const watcher = vscode.workspace.createFileSystemWatcher(`**/${LOCAL_SETTINGS_DIR}/${LOCAL_SETTINGS_FILE}`);

  let pollTimer = null;
  function restartPolling() {
    if (pollTimer) clearInterval(pollTimer);
    const seconds = vscode.workspace.getConfiguration(EXT_NAMESPACE).get(SETTING_REFRESH_SECONDS, 30);
    pollTimer = seconds > 0 ? setInterval(check, Math.max(5, seconds) * 1000) : null;
  }

  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(check), watcher.onDidChange(check), watcher.onDidDelete(check),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(`${EXT_NAMESPACE}.${SETTING_STORAGE_TARGET}`)) {
        onStorageTargetChanged(context, profilesProvider);
      } else if (e.affectsConfiguration(`${CONFIG_NAMESPACE}.${CONFIG_KEY}`)) {
        check();
      }
      if (e.affectsConfiguration(`${EXT_NAMESPACE}.${SETTING_REFRESH_SECONDS}`)) restartPolling();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(check),
    // Multi-root: the "current" folder follows the active editor
    vscode.window.onDidChangeActiveTextEditor(() => {
      if ((vscode.workspace.workspaceFolders || []).length > 1 && getStorageTarget() === 'workspace') check();
    }),
    // Coming back to this window: pick up profile/secret edits made in another window
    vscode.window.onDidChangeWindowState(async (state) => {
      if (!state.focused) return;
      await loadSecretCache(context);
      check();
    }),
    context.secrets.onDidChange(async (e) => {
      if (!e.key.startsWith(`${EXT_NAMESPACE}.secret:`)) return;
      const value = await context.secrets.get(e.key);
      if (value === undefined) _secretCache.delete(e.key);
      else _secretCache.set(e.key, value);
      profilesProvider.redraw();
      check();
    }),
    // Periodic backstop for changes no event reports (e.g. edits made outside VS Code)
    { dispose: () => { if (pollTimer) clearInterval(pollTimer); } },
  );
  restartPolling();

  // ── Async startup: load secrets, migrate plaintext tokens, first verification ──
  (async () => {
    try {
      await context.globalState.update(STORAGE_KEY_LEGACY_ACTIVE_ID, undefined);
      await loadSecretCache(context);
      const stored = context.globalState.get(STORAGE_KEY_PROFILES) || [];
      const hasPlaintextSecrets = stored.some(p => (p.variables || []).some(v => !v.secret && v.value && isSecretVar(v.name)));
      if (hasPlaintextSecrets) {
        logInfo('Moving profile tokens into SecretStorage.');
        await saveProfiles(context, loadProfiles(context));
      }
    } catch (e) {
      logError('Startup migration failed', e);
    }
    profilesProvider.refresh();
  })();

  logInfo('Extension activated.');
}

function deactivate() {
  if (_editorManager._panel) _editorManager._panel.dispose();
  logInfo('Extension deactivated.');
}

module.exports = { activate, deactivate };
