# Website direct-export integration

The plugin receives account-free website exports through the system clipboard plus a short Obsidian URI. The JSON stays on the user's device and is never uploaded to Supabase.

## Handoff contract

The website writes this JSON envelope to the clipboard:

```json
{
  "format": "rpg-homebrew-obsidian-direct-export",
  "version": 1,
  "requestId": "a UUID generated for this click",
  "createdAt": "2026-06-18T12:00:00.000Z",
  "source": "https://rpg-homebrew.netlify.app",
  "filename": "my-monster-statblock.json",
  "payload": {}
}
```

`payload` must be the exact JavaScript object already used by the matching JSON download button. Do not reshape, normalize, or stringify it twice.

After `navigator.clipboard.writeText(JSON.stringify(envelope))` resolves, open:

```text
obsidian://rpg-homebrew-import?source=clipboard&requestId=<URL-encoded requestId>
```

Obsidian reads the clipboard, checks the format/version/request ID, validates that supported creations exist, and opens the normal destination/sorting window. The user still chooses **Import sorted** or **Quick add** before notes are created.

## Browser helper

```js
const OBSIDIAN_DIRECT_EXPORT_FORMAT = "rpg-homebrew-obsidian-direct-export";
const OBSIDIAN_DIRECT_EXPORT_VERSION = 1;
const OBSIDIAN_DIRECT_EXPORT_MAX_BYTES = 32 * 1024 * 1024;

function utf8Size(text) {
  return new TextEncoder().encode(text).byteLength;
}

async function exportDirectlyToObsidian(payload, filename = "rpg-homebrew-export.json") {
  if (!navigator.clipboard?.writeText) {
    throw new Error("This browser does not support direct clipboard export.");
  }

  const requestId = crypto.randomUUID();
  const envelope = {
    format: OBSIDIAN_DIRECT_EXPORT_FORMAT,
    version: OBSIDIAN_DIRECT_EXPORT_VERSION,
    requestId,
    createdAt: new Date().toISOString(),
    source: location.origin,
    filename,
    payload
  };
  const transferText = JSON.stringify(envelope);

  if (utf8Size(transferText) > OBSIDIAN_DIRECT_EXPORT_MAX_BYTES) {
    throw new Error("This export is too large for direct transfer. Download the JSON file instead.");
  }

  await navigator.clipboard.writeText(transferText);
  window.location.href = `obsidian://rpg-homebrew-import?source=clipboard&requestId=${encodeURIComponent(requestId)}`;
}
```

Call the helper directly from a real button click. Clipboard writing requires HTTPS and may require that immediate user gesture.

## Payload mapping

Use the same payloads as the current file exports:

- Selected Mob: `clone(selectedStatblock())`
- Selected Class: `clone(selectedClassblock())`
- Selected Item/Potion: `clone(selectedItemblock())`
- Selected Spell: `clone(selectedSpellblock())`
- Selected Skill: `clone(selectedSkillblock())`
- Selected Achievement: `clone(selectedAchievementblock())`
- Selected Lootbox: `clone(selectedLootbox())`
- Preview export: `cleanPreviewExport()`
- Full library: `libraryExportPayload("all")`
- One library section: `libraryExportPayload(section)`
- A library-row export: use the exact object currently passed to `JSON.stringify` for that row's JSON download action
- Page document: use the exact document object currently downloaded by the page-document export
