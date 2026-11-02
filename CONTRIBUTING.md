# Contributing to Claude API Switch

Thanks for your interest in contributing! 🎉

## Getting Started

1. Fork the repo and clone it locally
2. Open the folder in VS Code or Cursor
3. Press `F5` to launch the Extension Development Host and test your changes
   (build an installable `.vsix` with `npm ci && npm run package` — see the README)
4. Make your changes and verify they work
5. Submit a PR

## Project Structure

```
claude_switch/
├── package.json        # Extension manifest
├── extension.js        # Main extension code
├── images/
│   └── icon.png        # Extension icon (128×128 PNG)
├── CHANGELOG.md
└── README.md
```

## Coding Conventions

- JavaScript (no TypeScript build step needed — keep it simple)
- 2-space indentation
- Use VS Code's built-in `vscode` module APIs
- Commands are registered in `activate()` and implemented as `cmd*` functions
- Use `context.globalState` for persistent storage (no external DB)

## Adding a New Command

1. Add the command definition to `package.json` under `contributes.commands`
2. Add a menu entry if needed under `contributes.menus`
3. Implement the handler function in `extension.js`
4. Register it in the `activate()` function

## Testing

- Use `Debug: Show Extension State` to inspect internal data
- Use `Debug: Create Test Profile` to test the storage pipeline without the webview
- Check **Help → Toggle Developer Tools** for console logs (prefix: `[Claude API Switch]`)

## PR Guidelines

- One feature/fix per PR
- Update CHANGELOG.md under `[Unreleased]`
- Test on both VS Code and Cursor if possible
- Screenshots welcome for UI changes
