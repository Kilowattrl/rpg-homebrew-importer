# RPG Homebrew JSON notes

These notes document the formats accepted by plugin version 0.1.0.

## Selected raw blocks

The web app can export the selected block directly, without a wrapper.

### Mob

Recognized by `name` and `vitals`.

```json
{
  "name": "Gridlock Sentry Statue",
  "subtitle": "Mob; Medium (4), Construct",
  "health": { "slots": 7, "hpPerSlot": 2, "values": [] },
  "vitals": { "level": "5", "surprise": "9+F", "evade": "10+F", "move": "10+S", "dr": "3" },
  "stats": { "str": 8, "int": 1, "con": 10, "dex": 2, "cha": 1 },
  "actions": [],
  "notes": ""
}
```

### Class

Recognized by `name` and `features`, without item-specific fields.

### Item or potion

Recognized by `name`, `features`, and item-specific fields such as `kind`, `showRequirements`, or `showStats`.

### Description

Recognized by `title` and `body`.

## Library entries

Library entries may include IDs, timestamps, ownership metadata, creator credit, and a typed block key.

```json
{
  "id": "...",
  "kind": "item",
  "updatedAt": "...",
  "itemblock": { "name": "..." },
  "description": { "title": "...", "body": "..." }
}
```

Typed keys are:

- `statblock`
- `classblock`
- `itemblock`
- `spellblock`
- `skillblock`
- `achievementblock`

Lootboxes store their fields directly on the entry.

## Collection exports

The plugin accepts any object containing one or more of these arrays:

- `cards` or `statblocks`
- `classes`
- `items`
- `spells`
- `skills`
- `achievements`
- `lootboxes`
- `documents`

Known `format` values include:

- `ttrpg-statblock-builder-library`
- `ttrpg-statblock-builder-library-section`
- `ttrpg-statblock-builder-preview`
- `ttrpg-page-document`
- `ttrpg-blank-json-templates`

## Obsidian note wrapper

Imported notes use a stable wrapper inside their fenced code block:

```json
{
  "schema": "rpg-homebrew-obsidian",
  "version": 1,
  "type": "statblock",
  "sourceFormat": "ttrpg-statblock-builder-library",
  "data": {}
}
```

The `data` field preserves the website export entry.


## Direct website export envelope

The plugin recognizes this outer transport wrapper in addition to all existing export formats:

```json
{
  "format": "rpg-homebrew-obsidian-direct-export",
  "version": 1,
  "requestId": "UUID",
  "createdAt": "ISO timestamp",
  "source": "website origin",
  "filename": "suggested filename.json",
  "payload": {}
}
```

`payload` is one of the existing supported website export objects. The wrapper is transport metadata only and is removed before notes are created. Pasting the complete wrapper into the regular importer also works.
