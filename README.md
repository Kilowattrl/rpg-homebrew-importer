# RPG Homebrew Importer

Import creations from [RPG Homebrew](https://rpg-homebrew.netlify.app) into Obsidian as searchable Markdown notes with compact, game-ready rendered cards.

The plugin understands the website's JSON formats for mobs, classes, items, potions, spells, skills, achievements, lootboxes, description cards, preview collections, library exports, and page documents.

## Features

- Import one or many downloaded JSON files.
- Paste JSON or receive a direct website export through the system clipboard.
- Create one Markdown note per creation, with optional type-based folders.
- Preserve the original JSON inside each note for future rerendering and migrations.
- Render cards with scoped CSS grids that remain consistent across Obsidian themes.
- Click dice notation such as `d20`, `1d8+3`, or `2d6-1d4+3` to roll it.
- Review totals, individual dice, modifiers, sources, and roll history in a dockable dice-results view.

## Import JSON files

1. Open the command palette.
2. Run **RPG Homebrew Importer: Import JSON**, or select the JSON-file ribbon icon.
3. Choose files, drag files into the window, or paste JSON.
4. Choose a destination folder.
5. Select **Import sorted** to create category folders, or **Quick add** to place every note directly in the chosen folder.

Each imported note contains Obsidian properties, the original source data in an `rpg-homebrew` code block, and the rendered creation in Reading view and Live Preview.

## Direct website export

The website can send an export to Obsidian without an account or cloud storage. It writes a versioned transfer package to the clipboard and opens:

```text
obsidian://rpg-homebrew-import?source=clipboard&requestId=<UUID>
```

The plugin validates the request ID and payload before opening the normal import window. Direct transfers support packages up to 32 MiB. Larger or image-heavy page documents can use the regular JSON download and import flow.

When automatic clipboard access is unavailable, open Obsidian and run **RPG Homebrew Importer: Receive website export from clipboard**, or paste the package into the importer.

The complete integration contract is documented in [WEBSITE-INTEGRATION.md](WEBSITE-INTEGRATION.md).

## Dice results

Dice notation inside rendered creations is clickable. The **RPG Dice Results** view can be opened in either sidebar and dragged anywhere in the workspace. It includes a manual roller and persistent history.

## Privacy and permissions

RPG Homebrew Importer is local and offline:

- It makes no network requests.
- It requires no account.
- It contains no analytics, telemetry, advertising, or automatic updater.
- It reads the clipboard only when you invoke a clipboard command or open a matching direct-export URI.
- It creates Markdown files only inside the destination folder you choose in the current vault.

The direct-export website handoff places the selected JSON package on the clipboard before opening Obsidian. Clipboard contents remain under the operating system's normal clipboard controls.

## Supported platforms

The plugin uses Obsidian's cross-platform APIs and Web Clipboard API. File imports and rendered cards work on desktop and mobile. Clipboard permission behavior varies by operating system, so the manual paste fallback remains available.

## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release and place them in:

```text
YourVault/.obsidian/plugins/rpg-homebrew-importer/
```

Reload Obsidian, then enable **RPG Homebrew Importer** under **Settings → Community plugins**.

## Development

```bash
npm install
npm run verify
npm run build
```

`npm run dev` watches the source and rebuilds `main.js`. The compiled file is intentionally excluded from the repository and attached to GitHub releases.

## License

[MIT](LICENSE)
