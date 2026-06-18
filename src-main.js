const {
  Plugin,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  FuzzySuggestModal,
  MarkdownRenderChild,
  ItemView,
  TFolder,
  normalizePath,
} = require("obsidian");

const PLUGIN_ID = "rpg-homebrew-importer";
const CODE_BLOCK_LANGUAGE = "rpg-homebrew";
const PROTOCOL_ACTION = "rpg-homebrew-import";
const DICE_VIEW_TYPE = "rpg-homebrew-dice-results";
const DIRECT_EXPORT_FORMAT = "rpg-homebrew-obsidian-direct-export";
const DIRECT_EXPORT_VERSION = 1;
const MAX_DIRECT_TRANSFER_BYTES = 32 * 1024 * 1024;

const DEFAULT_SETTINGS = {
  importFolder: "RPG Homebrew",
  organizeByType: true,
  openImportedNote: true,
  autoOpenDiceView: true,
  diceViewSide: "right",
  maxDiceHistory: 100,
  diceHistory: [],
};

const TYPE_FOLDER = {
  statblock: "Mobs",
  class: "Classes",
  item: "Items & Potions",
  spell: "Spells",
  skill: "Skills",
  achievement: "Achievements",
  lootbox: "Lootboxes",
  description: "Descriptions",
  document: "Page Documents",
};

const TYPE_LABEL = {
  statblock: "Mob",
  class: "Class",
  item: "Item / Potion",
  spell: "Spell",
  skill: "Skill",
  achievement: "Achievement",
  lootbox: "Lootbox",
  description: "Description",
  document: "Page Document",
};

const ITEM_TIERS = ["bronze", "silver", "gold", "platinum", "legendary", "celestial"];
const DEFAULT_COLORS = {
  quote: "#9a5a3c",
  tags: "#202420",
};




function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function titleCase(value) {
  const text = asString(value).trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function sanitizeFileName(value) {
  return asString(value, "Untitled Homebrew")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180) || "Untitled Homebrew";
}

function safeJsonParse(text) {
  const source = asString(text).trim();
  if (!source) throw new Error("The JSON input is empty.");
  return JSON.parse(source);
}

function addAsset(assets, type, data, sourceFormat = "unknown") {
  if (!isObject(data)) return;
  assets.push({ type, data, sourceFormat });
}

function looksLikeItemBlock(value) {
  return isObject(value) && asString(value.name).trim() && Array.isArray(value.features)
    && (value.kind !== undefined || value.showRequirements !== undefined || value.showStats !== undefined);
}

function looksLikeClassBlock(value) {
  return isObject(value) && asString(value.name).trim() && Array.isArray(value.features) && !looksLikeItemBlock(value);
}

function looksLikeStatblock(value) {
  return isObject(value) && asString(value.name).trim() && isObject(value.vitals);
}

function looksLikeDescription(value) {
  return isObject(value) && value.title !== undefined && value.body !== undefined;
}

function looksLikeAchievement(value) {
  return isObject(value) && asString(value.name).trim() && value.reward !== undefined;
}

function looksLikeSpell(value) {
  return isObject(value) && asString(value.name).trim() && value.description !== undefined
    && (value.manaCost !== undefined || value.range !== undefined || value.duration !== undefined || value.cooldown !== undefined);
}

function looksLikeSkill(value) {
  return isObject(value) && asString(value.name).trim() && value.description !== undefined
    && (value.limitations !== undefined || value.tags !== undefined || value.hasLimitations !== undefined)
    && !looksLikeSpell(value);
}

function looksLikeLootbox(value) {
  return isObject(value) && (value.kind === "lootbox" || value.lootbox || Array.isArray(value.pool));
}

function extractCollectionAssets(parsed, sourceFormat, assets) {
  const statEntries = Array.isArray(parsed.cards) ? parsed.cards : asArray(parsed.statblocks);
  statEntries.forEach((entry) => addAsset(assets, "statblock", isObject(entry.statblock) ? entry : { statblock: entry }, sourceFormat));
  asArray(parsed.classes).forEach((entry) => addAsset(assets, "class", isObject(entry.classblock) ? entry : { classblock: entry }, sourceFormat));
  asArray(parsed.items).forEach((entry) => addAsset(assets, "item", isObject(entry.itemblock) ? entry : { itemblock: entry }, sourceFormat));
  asArray(parsed.spells).forEach((entry) => addAsset(assets, "spell", isObject(entry.spellblock) ? entry : { spellblock: entry }, sourceFormat));
  asArray(parsed.skills).forEach((entry) => addAsset(assets, "skill", isObject(entry.skillblock) ? entry : { skillblock: entry }, sourceFormat));
  asArray(parsed.achievements).forEach((entry) => addAsset(assets, "achievement", isObject(entry.achievementblock) ? entry : { achievementblock: entry }, sourceFormat));
  asArray(parsed.lootboxes).forEach((entry) => addAsset(assets, "lootbox", entry, sourceFormat));
  asArray(parsed.documents).forEach((entry) => addAsset(assets, "document", isObject(entry.document) ? entry : { document: entry }, sourceFormat));
}

function extractAssets(parsed) {
  const assets = [];
  if (!isObject(parsed)) return assets;

  if (parsed.format === DIRECT_EXPORT_FORMAT) {
    const payload = parsed.payload !== undefined ? parsed.payload : (parsed.data !== undefined ? parsed.data : parsed.export);
    if (typeof payload === "string") {
      try { return extractAssets(safeJsonParse(payload)); } catch (error) { return assets; }
    }
    if (isObject(payload)) return extractAssets(payload);
    return assets;
  }

  if (parsed.schema === "rpg-homebrew-obsidian" && parsed.type && isObject(parsed.data)) {
    addAsset(assets, parsed.type, parsed.data, parsed.sourceFormat || parsed.schema);
    return assets;
  }

  const sourceFormat = asString(parsed.format, "unknown");
  const hasCollections = [
    "cards", "statblocks", "classes", "items", "spells", "skills", "achievements", "lootboxes", "documents",
  ].some((key) => Array.isArray(parsed[key]));

  if (hasCollections) {
    extractCollectionAssets(parsed, sourceFormat, assets);
    if (assets.length) return assets;
  }

  if (isObject(parsed.statblock)) addAsset(assets, "statblock", parsed, sourceFormat);
  else if (isObject(parsed.classblock)) addAsset(assets, "class", parsed, sourceFormat);
  else if (isObject(parsed.itemblock)) addAsset(assets, "item", parsed, sourceFormat);
  else if (isObject(parsed.spellblock)) addAsset(assets, "spell", parsed, sourceFormat);
  else if (isObject(parsed.skillblock)) addAsset(assets, "skill", parsed, sourceFormat);
  else if (isObject(parsed.achievementblock)) addAsset(assets, "achievement", parsed, sourceFormat);
  else if (parsed.format === "ttrpg-page-document" || isObject(parsed.document) || Array.isArray(parsed.pages)) addAsset(assets, "document", isObject(parsed.document) ? parsed : { document: parsed }, sourceFormat);
  else if (looksLikeLootbox(parsed)) addAsset(assets, "lootbox", parsed, sourceFormat);
  else if (looksLikeStatblock(parsed)) addAsset(assets, "statblock", { statblock: parsed }, sourceFormat);
  else if (looksLikeItemBlock(parsed)) addAsset(assets, "item", { itemblock: parsed }, sourceFormat);
  else if (looksLikeClassBlock(parsed)) addAsset(assets, "class", { classblock: parsed }, sourceFormat);
  else if (looksLikeAchievement(parsed)) addAsset(assets, "achievement", { achievementblock: parsed }, sourceFormat);
  else if (looksLikeSpell(parsed)) addAsset(assets, "spell", { spellblock: parsed }, sourceFormat);
  else if (looksLikeSkill(parsed)) addAsset(assets, "skill", { skillblock: parsed }, sourceFormat);
  else if (looksLikeDescription(parsed)) addAsset(assets, "description", parsed, sourceFormat);

  return assets;
}

function blockForAsset(asset) {
  const data = asset.data || {};
  switch (asset.type) {
    case "statblock": return data.statblock || data;
    case "class": return data.classblock || data;
    case "item": return data.itemblock || data;
    case "spell": return data.spellblock || data;
    case "skill": return data.skillblock || data;
    case "achievement": return data.achievementblock || data;
    case "lootbox": return data.lootbox || data;
    case "description": return data.description || data;
    case "document": return data.document || data;
    default: return data;
  }
}

function assetName(asset) {
  const block = blockForAsset(asset);
  if (asset.type === "description") return asString(block.title, "Untitled Description");
  if (asset.type === "document") return asString(block.documentName || asset.data.name, "Untitled Page Document");
  return asString(block.name, `Untitled ${TYPE_LABEL[asset.type] || "Homebrew"}`);
}

function assetKindTag(asset) {
  if (asset.type === "item") {
    const block = blockForAsset(asset);
    return block.kind === "potion" ? "potion" : "item";
  }
  return asset.type;
}

function creatorCredit(source, fallback = {}) {
  const credit = isObject(source && source.creatorCredit)
    ? source.creatorCredit
    : isObject(fallback && fallback.creatorCredit) ? fallback.creatorCredit : {};
  return {
    enabled: Boolean(credit.enabled),
    name: asString(credit.name).trim(),
  };
}

function statValue(value) {
  const match = asString(value).match(/-?\d+/);
  return match ? Number(match[0]) : "";
}

function statModifier(value) {
  const n = Number(statValue(value));
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  if (n <= 9) return 3;
  if (n <= 19) return 4;
  if (n <= 49) return 5;
  if (n <= 99) return 6;
  if (n <= 149) return 7;
  if (n <= 199) return 8;
  if (n <= 299) return 9;
  return 10;
}

function element(parent, tag, className = "", text = undefined) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = asString(text);
  parent.appendChild(node);
  return node;
}

function appendMultiline(parent, text) {
  const lines = asString(text).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (index) parent.appendChild(document.createElement("br"));
    parent.appendChild(document.createTextNode(line));
  });
}


const DICE_EXPRESSION_SOURCE = String.raw`\b(?:\d{1,3})?d\d{1,5}(?:\s*[+\-]\s*(?:(?:\d{1,3})?d\d{1,5}|\d+))*\b`;

function secureDieRoll(sides) {
  const size = Number(sides);
  if (!Number.isInteger(size) || size < 1) throw new Error("Dice must have at least one side.");
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const range = 0x100000000;
    const limit = range - (range % size);
    const bucket = new Uint32Array(1);
    do { cryptoApi.getRandomValues(bucket); } while (bucket[0] >= limit);
    return (bucket[0] % size) + 1;
  }
  return Math.floor(Math.random() * size) + 1;
}

function rollDiceExpression(expression) {
  const original = asString(expression).trim();
  const clean = original.toLowerCase().replace(/\s+/g, "");
  if (!clean) throw new Error("Enter a dice expression such as 2d6+3.");

  const token = /([+\-]?)(?:(\d*)d(\d+)|(\d+))/gy;
  const terms = [];
  let index = 0;
  while (index < clean.length) {
    token.lastIndex = index;
    const match = token.exec(clean);
    if (!match || match.index !== index) throw new Error(`Unsupported dice expression: ${original}`);
    index = token.lastIndex;
    const sign = match[1] === "-" ? -1 : 1;
    if (match[2] !== undefined) {
      const count = match[2] === "" ? 1 : Number(match[2]);
      const sides = Number(match[3]);
      if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("A roll may contain between 1 and 1,000 dice.");
      if (!Number.isInteger(sides) || sides < 1 || sides > 100000) throw new Error("Dice may have between 1 and 100,000 sides.");
      const rolls = Array.from({ length: count }, () => secureDieRoll(sides));
      const subtotal = rolls.reduce((sum, value) => sum + value, 0);
      terms.push({ sign, kind: "dice", count, sides, rolls, value: subtotal });
    } else {
      terms.push({ sign, kind: "modifier", value: Number(match[4]) });
    }
  }

  const total = terms.reduce((sum, term) => sum + (term.sign * term.value), 0);
  const breakdown = terms.map((term, termIndex) => {
    const signText = term.sign < 0 ? "− " : termIndex > 0 ? "+ " : "";
    if (term.kind === "dice") return `${signText}${term.count}d${term.sides} [${term.rolls.join(", ")}]`;
    return `${signText}${term.value}`;
  }).join(" ");

  return { expression: original, total, breakdown: `${breakdown} = ${total}`, terms };
}

function diceContextForNode(node, asset) {
  const fallback = assetName(asset);
  const parent = node && node.parentElement;
  if (!parent || typeof parent.closest !== "function") return fallback;
  const row = parent.closest(".rpg-homebrew-action, .rpg-homebrew-class-entry, .rpg-homebrew-item-entry, .rpg-homebrew-generic-damage, .rpg-homebrew-upgrade");
  if (!row) return fallback;
  const label = row.querySelector(".rpg-homebrew-action-name, .rpg-homebrew-entry-label, b");
  const clean = asString(label && label.textContent).replace(/:\s*$/, "").trim();
  return clean ? `${fallback} · ${clean}` : fallback;
}

function makeDiceInteractive(root, asset, plugin) {
  if (!root || !plugin || typeof plugin.rollDice !== "function") return;
  const textNodes = [];
  const walker = document.createTreeWalker(root, 4);
  let current;
  while ((current = walker.nextNode())) {
    const parent = current.parentElement;
    if (!parent || parent.closest("button, style, script")) continue;
    const probe = new RegExp(DICE_EXPRESSION_SOURCE, "i");
    if (probe.test(current.nodeValue || "")) textNodes.push(current);
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue || "";
    const regex = new RegExp(DICE_EXPRESSION_SOURCE, "gi");
    const fragment = document.createDocumentFragment();
    const context = diceContextForNode(textNode, asset);
    let cursor = 0;
    let match;
    while ((match = regex.exec(text))) {
      if (match.index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const expression = match[0];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rpg-homebrew-dice-button";
      button.textContent = expression;
      button.title = `Roll ${expression}`;
      button.setAttribute("aria-label", `Roll ${expression}`);
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.classList.add("is-rolling");
        try { await plugin.rollDice(expression, context); }
        finally { window.setTimeout(() => button.classList.remove("is-rolling"), 180); }
      });
      fragment.appendChild(button);
      cursor = regex.lastIndex;
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.replaceWith(fragment);
  });
}

function addCreatorCredit(parent, source, fallback) {
  const credit = creatorCredit(source, fallback);
  if (!credit.enabled || !credit.name) return;
  element(parent, "div", "rpg-homebrew-creator-credit", `Created by ${credit.name}`);
}

function addKeyValueLine(parent, label, value, className = "") {
  const clean = asString(value).trim();
  if (!clean) return;
  const row = element(parent, "span", className);
  element(row, "b", "", `${label}:`);
  row.appendChild(document.createTextNode(` ${clean}`));
}

function renderDescriptionBlock(description, parent, sourceMeta = {}) {
  const box = element(parent, "article", "rpg-homebrew-description-box");
  element(box, "div", "rpg-homebrew-description-title", asString(description.title, "Description"));
  const body = element(box, "div", "rpg-homebrew-description-body");
  appendMultiline(body, description.body);
  addCreatorCredit(box, description, sourceMeta);
  return box;
}

function renderStatsTable(parent, labels, values, className = "") {
  const columnCount = Math.max(1, Math.min(12, labels.length));
  const grid = element(parent, "div", `rpg-homebrew-data-grid rpg-homebrew-columns-${columnCount} ${className}`.trim());
  labels.forEach((label) => element(grid, "div", "rpg-homebrew-grid-cell rpg-homebrew-grid-header", label));
  values.forEach((value) => element(grid, "div", "rpg-homebrew-grid-cell rpg-homebrew-grid-value", value));
  return grid;
}

function normalizeAction(action) {
  const value = isObject(action) ? action : {};
  if (value.toHit !== undefined || value.damage !== undefined || value.range !== undefined) {
    return {
      name: asString(value.name),
      toHit: value.toHit ?? "",
      useFloor: Boolean(value.useFloor),
      damage: value.damage ?? "",
      range: value.range ?? "",
      extra: value.extra ?? "",
      rider: value.rider ?? "",
    };
  }
  const text = asString(value.text);
  const match = text.match(/^\s*(\d+)(\+F)?\s+to hit,\s*([^,]+),\s*(\d+)ft range(?:\s*,?\s*(.*))?$/i);
  if (match) {
    return {
      name: asString(value.name),
      toHit: Number(match[1]),
      useFloor: Boolean(match[2]),
      damage: match[3].trim(),
      range: Number(match[4]),
      extra: asString(match[5]).trim(),
      rider: asString(value.rider),
    };
  }
  return { name: asString(value.name), toHit: "", useFloor: false, damage: "", range: "", extra: text, rider: asString(value.rider) };
}

function actionMainLine(action) {
  const value = normalizeAction(action);
  const parts = [];
  if (value.toHit !== "") parts.push(`${value.toHit}${value.useFloor ? "+F" : ""} to hit`);
  if (value.damage) parts.push(asString(value.damage));
  if (value.range !== "") parts.push(`${value.range}ft range`);
  let line = parts.join(", ");
  const extra = asString(value.extra).trim();
  if (extra) line += `${line ? (extra.startsWith("(") ? " " : ", ") : ""}${extra}`;
  return line;
}

function renderStatblock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-statblock");
  element(card, "div", "rpg-homebrew-name", asString(block.name, "Untitled Mob"));
  const subtitle = element(card, "div", "rpg-homebrew-subtitle");
  appendMultiline(subtitle, block.subtitle);

  const health = isObject(block.health) ? block.health : {};
  const slots = Math.max(1, Number(health.slots) || 1);
  const hpPerSlot = asString(health.hpPerSlot || 1);
  const customValues = asArray(health.values);
  const values = Array.from({ length: slots }, (_, index) => customValues[index] || hpPerSlot);
  const healthWrap = element(card, "div", "rpg-homebrew-health-wrap");
  const bar = element(healthWrap, "div", "rpg-homebrew-health-bar");
  values.forEach((value, index) => {
    const colorLevel = Math.max(1, Math.min(20, Math.round((((index + 0.5) / values.length) * 19) + 1)));
    element(bar, "div", `rpg-homebrew-health-segment rpg-homebrew-health-color-${colorLevel}`, value);
  });
  const percentages = element(healthWrap, "div", "rpg-homebrew-health-percent-row");
  values.forEach((_, index) => element(percentages, "div", "rpg-homebrew-health-percent", `${Math.round(((index + 1) / values.length) * 100)}%`));

  const vitals = isObject(block.vitals) ? block.vitals : {};
  renderStatsTable(card, ["Level", "Surprise", "Evade", "Move", "DR"], [
    vitals.level ?? "", vitals.surprise ?? "", vitals.evade ?? "", vitals.move ?? "", vitals.dr ?? "",
  ], "rpg-homebrew-vitals");

  const stats = isObject(block.stats) ? block.stats : {};
  const statsValues = ["str", "int", "con", "dex", "cha"].map((key) => {
    const raw = statValue(stats[key]);
    const modifier = statModifier(stats[key]);
    return raw === "" ? "" : `${raw} (${modifier === "" ? "" : `+${modifier}`})`;
  });
  renderStatsTable(card, ["STR", "INT", "CON", "DEX", "CHA"], statsValues, "rpg-homebrew-stats");

  const actions = element(card, "div", "rpg-homebrew-actions");
  asArray(block.actions).forEach((rawAction) => {
    const action = normalizeAction(rawAction);
    const hasRider = Boolean(asString(action.rider).trim());
    const row = element(actions, "div", `rpg-homebrew-action${hasRider ? " has-rider" : ""}`);
    element(row, "span", "rpg-homebrew-action-name", `${action.name}:`);
    row.appendChild(document.createTextNode(` ${actionMainLine(action)}`));
    if (hasRider) {
      row.appendChild(document.createElement("br"));
      appendMultiline(row, action.rider);
    }
  });

  const notes = asString(block.notes).replace(/^\s*notes:\s*/i, "").trim();
  if (notes) {
    const noteEl = element(card, "div", "rpg-homebrew-notes");
    element(noteEl, "b", "", "Notes:");
    noteEl.appendChild(document.createTextNode(" "));
    appendMultiline(noteEl, notes);
  }
  addCreatorCredit(card, block, sourceMeta);
  return card;
}

function classFeatureLine(feature) {
  const type = asString(feature.type, "feature");
  const label = type === "skill" ? "New Skill" : type === "spell" ? "New Spell" : "Class Feature";
  const name = asString(feature.name).trim();
  if (type === "skill" || type === "spell") return `${label}: ${name}${feature.rank ? `, Starting rank: ${feature.rank}` : ""}`;
  return `${label}: ${name}`;
}

function renderClassBlock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-classblock");
  element(card, "div", "rpg-homebrew-name", asString(block.name, "Untitled Class"));
  const requirements = element(card, "div", "rpg-homebrew-subtitle");
  appendMultiline(requirements, block.requirements);
  const reqs = isObject(block.reqs) ? block.reqs : {};
  renderStatsTable(card, ["STR", "INT", "CON", "DEX", "CHA"], [
    reqs.str || "##", reqs.int || "##", reqs.con || "##", reqs.dex || "##", reqs.cha || "##",
  ], "rpg-homebrew-requirements");
  const entries = element(card, "div", "rpg-homebrew-class-entries");
  asArray(block.features).forEach((feature) => {
    const row = element(entries, "div", `rpg-homebrew-class-entry ${feature.type === "feature" ? "class-feature" : feature.type === "spell" ? "new-spell" : "new-skill"}`);
    const line = classFeatureLine(feature);
    const split = line.indexOf(":") + 1;
    element(row, "span", "rpg-homebrew-entry-label", split ? line.slice(0, split) : line);
    row.appendChild(document.createTextNode(split ? line.slice(split) : ""));
    if (feature.description) {
      row.appendChild(document.createElement("br"));
      appendMultiline(row, feature.description);
    }
  });
  addCreatorCredit(card, block, sourceMeta);
  return card;
}

function itemFeatureLine(feature) {
  const type = asString(feature.type, "feature");
  const label = type === "skill" ? "New Skill"
    : type === "spell" ? "New Spell"
      : type === "skillLevel" ? "Skill Level Increase"
        : type === "spellLevel" ? "Spell Level Increase"
          : "Item Feature";
  const name = asString(feature.name).trim();
  if (type === "skill" || type === "spell") return `${label}: ${name}${feature.rank ? `, Starting rank: ${feature.rank}` : ""}`;
  if (type === "skillLevel" || type === "spellLevel") return `${label}: ${name}${feature.rank ? `, Increase: ${feature.rank}` : ""}`;
  return `${label}: ${name}`;
}

function renderItemBlock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-itemblock");
  element(card, "div", "rpg-homebrew-name", asString(block.name, "Untitled Item"));
  const tier = ITEM_TIERS.includes(block.tier) ? block.tier : "bronze";
  const kind = block.kind === "potion" ? "Potion" : "Item";
  element(card, "div", "rpg-homebrew-item-kind", `${titleCase(tier)} ${kind}`);
  if (block.showRequirements !== false && block.requirements) {
    const requirements = element(card, "div", "rpg-homebrew-subtitle");
    appendMultiline(requirements, block.requirements);
  }
  if (block.showStats !== false) {
    const reqs = isObject(block.reqs) ? block.reqs : {};
    renderStatsTable(card, ["STR", "INT", "CON", "DEX", "CHA"], [
      reqs.str || "##", reqs.int || "##", reqs.con || "##", reqs.dex || "##", reqs.cha || "##",
    ], "rpg-homebrew-requirements");
  }
  const entries = element(card, "div", "rpg-homebrew-item-entries");
  asArray(block.features).forEach((feature) => {
    const typeClass = feature.type === "feature" ? "item-feature"
      : feature.type === "spell" ? "new-spell"
        : feature.type === "skill" ? "new-skill"
          : feature.type === "spellLevel" ? "spell-level" : "skill-level";
    const row = element(entries, "div", `rpg-homebrew-item-entry ${typeClass}`);
    const line = itemFeatureLine(feature);
    const split = line.indexOf(":") + 1;
    element(row, "span", "rpg-homebrew-entry-label", split ? line.slice(0, split) : line);
    row.appendChild(document.createTextNode(split ? line.slice(split) : ""));
    if (feature.description) {
      row.appendChild(document.createElement("br"));
      appendMultiline(row, feature.description);
    }
  });
  addCreatorCredit(card, block, sourceMeta);
  return card;
}

function renderUpgrades(parent, upgrades) {
  const rows = [5, 10, 15]
    .map((rank) => ({ rank, text: asString(upgrades && (upgrades[rank] ?? upgrades[`rank${rank}`])).trim() }))
    .filter((row) => row.text);
  if (!rows.length) return;
  const wrapper = element(parent, "div", "rpg-homebrew-upgrades");
  element(wrapper, "div", "rpg-homebrew-section-title", "Upgrades");
  rows.forEach((row) => {
    const line = element(wrapper, "div", "rpg-homebrew-upgrade");
    element(line, "b", "", `Rank ${row.rank}:`);
    line.appendChild(document.createTextNode(` ${row.text}`));
  });
}

function renderSpellBlock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-generic-block rpg-homebrew-spell");
  element(card, "div", "rpg-homebrew-generic-name", asString(block.name, "Untitled Spell"));
  if (block.quote) {
    const quote = element(card, "div", "rpg-homebrew-generic-quote", block.quote);
    quote.style.setProperty("--rpg-homebrew-custom-color", asString(block.quoteColor, DEFAULT_COLORS.quote));
  }
  if (block.tags) element(card, "div", "rpg-homebrew-generic-tags", block.tags);
  const meta = element(card, "div", "rpg-homebrew-generic-lines");
  addKeyValueLine(meta, "Mana Cost", block.manaCost);
  addKeyValueLine(meta, "Range", block.range);
  if (block.hasCooldown || block.cooldown || block.duration) addKeyValueLine(meta, "Cooldown", block.cooldown || block.duration);
  const body = element(card, "div", "rpg-homebrew-generic-body");
  appendMultiline(body, block.description);
  if (block.hasDamage || block.damage) {
    const damage = element(card, "div", "rpg-homebrew-generic-damage");
    element(damage, "b", "", "Base Damage:");
    damage.appendChild(document.createTextNode(` ${asString(block.damage)}`));
  }
  renderUpgrades(card, block.upgrades);
  addCreatorCredit(card, block, sourceMeta);
  return card;
}

function renderSkillBlock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-generic-block rpg-homebrew-skill");
  element(card, "div", "rpg-homebrew-generic-name", asString(block.name, "Untitled Skill"));
  if (block.tags) {
    const tags = element(card, "div", "rpg-homebrew-generic-tags", block.tags);
    tags.style.setProperty("--rpg-homebrew-custom-color", asString(block.tagsColor || block.quoteColor, DEFAULT_COLORS.tags));
  }
  if (block.hasLimitations || block.limitations) {
    const limitations = element(card, "div", "rpg-homebrew-generic-limitations");
    element(limitations, "b", "", "Limitations:");
    limitations.appendChild(document.createTextNode(` ${asString(block.limitations)}`));
  }
  const body = element(card, "div", "rpg-homebrew-generic-body");
  appendMultiline(body, block.description);
  if (block.hasDamage || block.damage) {
    const damage = element(card, "div", "rpg-homebrew-generic-damage");
    element(damage, "b", "", "Damage:");
    damage.appendChild(document.createTextNode(` ${asString(block.damage)}`));
  }
  renderUpgrades(card, block.upgrades);
  addCreatorCredit(card, block, sourceMeta);
  return card;
}

function renderAchievementBlock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-generic-block rpg-homebrew-achievement");
  element(card, "div", "rpg-homebrew-achievement-main-title", "NEW ACHIEVEMENT!");
  element(card, "div", "rpg-homebrew-achievement-subtitle", asString(block.name, "Untitled Achievement"));
  const body = element(card, "div", "rpg-homebrew-generic-body");
  appendMultiline(body, block.description);
  const reward = element(card, "div", "rpg-homebrew-generic-reward");
  element(reward, "span", "rpg-homebrew-achievement-reward-label", "REWARD:");
  appendMultiline(reward, block.reward);
  const post = asString(block.postDescription).trim();
  if (post) reward.appendChild(document.createTextNode(` ${post}`));
  addCreatorCredit(card, block, sourceMeta);
  return card;
}

function lootboxPoolItemName(entry) {
  if (!isObject(entry)) return "Untitled Loot";
  return asString(entry.name || (entry.itemblock && entry.itemblock.name), "Untitled Loot");
}

function renderLootboxBlock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-generic-block rpg-homebrew-lootbox");
  element(card, "div", "rpg-homebrew-generic-name", asString(block.name, "Untitled Lootbox"));
  element(card, "div", "rpg-homebrew-item-kind", `${titleCase(block.tier || "bronze")} Lootbox`);
  if (block.description) {
    const body = element(card, "div", "rpg-homebrew-generic-body");
    appendMultiline(body, block.description);
  }
  const pool = asArray(block.pool);
  if (pool.length) {
    element(card, "div", "rpg-homebrew-section-title", "Possible Contents");
    const list = element(card, "div", "rpg-homebrew-lootbox-pool");
    pool.forEach((entry) => {
      const row = element(list, "div", "rpg-homebrew-lootbox-entry");
      element(row, "span", "rpg-homebrew-lootbox-name", lootboxPoolItemName(entry));
      if (block.customWeights || entry.weight !== undefined) element(row, "span", "rpg-homebrew-lootbox-weight", `${Number(entry.weight) || 0}%`);
    });
  }
  addCreatorCredit(card, block, sourceMeta);
  return card;
}

function renderDocumentBlock(block, parent, sourceMeta = {}) {
  const card = element(parent, "article", "rpg-homebrew-generic-block rpg-homebrew-document");
  element(card, "div", "rpg-homebrew-generic-name", asString(block.documentName || sourceMeta.name, "Untitled Page Document"));
  const pages = asArray(block.pages);
  const summary = element(card, "div", "rpg-homebrew-generic-body");
  summary.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"} preserved from the RPG Homebrew page editor.`;
  if (pages.length) {
    const list = element(card, "div", "rpg-homebrew-document-pages");
    pages.forEach((page, index) => {
      const count = asArray(page.elements).length;
      element(list, "div", "rpg-homebrew-document-page", `${asString(page.name, `Page ${index + 1}`)} · ${count} element${count === 1 ? "" : "s"}`);
    });
  }
  const note = element(card, "div", "rpg-homebrew-document-note", "The full page-layout JSON remains embedded in this note for future page-rendering support.");
  note.setAttribute("role", "note");
  return card;
}

function renderAsset(asset, container, plugin = null) {
  container.empty ? container.empty() : (container.textContent = "");
  container.classList.add("rpg-homebrew-render");

  const root = element(container, "div", "rpg-homebrew-card-root");

  const data = asset.data || {};
  const block = blockForAsset(asset);
  const pairTypes = new Set(["statblock", "class", "item"]);
  const pair = pairTypes.has(asset.type) && isObject(data.description)
    ? element(root, "div", "rpg-homebrew-pair")
    : root;

  if (asset.type === "statblock") renderStatblock(block, pair, data);
  else if (asset.type === "class") renderClassBlock(block, pair, data);
  else if (asset.type === "item") renderItemBlock(block, pair, data);
  else if (asset.type === "spell") renderSpellBlock(block, pair, data);
  else if (asset.type === "skill") renderSkillBlock(block, pair, data);
  else if (asset.type === "achievement") renderAchievementBlock(block, pair, data);
  else if (asset.type === "lootbox") renderLootboxBlock(block, pair, data);
  else if (asset.type === "description") renderDescriptionBlock(block, pair, data);
  else if (asset.type === "document") renderDocumentBlock(block, pair, data);
  else element(root, "pre", "rpg-homebrew-error", JSON.stringify(data, null, 2));

  if (pair !== root && isObject(data.description)) renderDescriptionBlock(data.description, pair, data);
  makeDiceInteractive(root, asset, plugin);
}

function yamlQuoted(value) {
  return JSON.stringify(asString(value));
}

function longestBacktickRun(value) {
  const matches = asString(value).match(/`+/g) || [];
  return matches.reduce((max, run) => Math.max(max, run.length), 0);
}

function serializedAsset(asset) {
  return {
    schema: "rpg-homebrew-obsidian",
    version: 1,
    type: asset.type,
    sourceFormat: asset.sourceFormat || "unknown",
    data: asset.data,
  };
}

function buildNoteContent(asset) {
  const name = assetName(asset);
  const id = asString(asset.data.id || asset.data.libraryId || blockForAsset(asset).id).trim();
  const importedAt = new Date().toISOString();
  const kindTag = assetKindTag(asset);
  const payload = JSON.stringify(serializedAsset(asset), null, 2);
  const fence = "`".repeat(Math.max(4, longestBacktickRun(payload) + 1));
  const lines = [
    "---",
    "rpg_homebrew: true",
    `rpg_homebrew_type: ${yamlQuoted(asset.type)}`,
    `title: ${yamlQuoted(name)}`,
    `imported_at: ${yamlQuoted(importedAt)}`,
    `source_format: ${yamlQuoted(asset.sourceFormat || "unknown")}`,
  ];
  if (id) lines.push(`source_id: ${yamlQuoted(id)}`);
  lines.push("tags:", "  - rpg-homebrew", `  - rpg-homebrew/${kindTag}`, "---", "", `# ${name}`, "", `${fence}${CODE_BLOCK_LANGUAGE}`, payload, fence, "");
  return lines.join("\n");
}

function decodeBase64Url(value) {
  const normalized = asString(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(Array.from(atob(padded)).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
}

function decodeProtocolPayload(params) {
  if (!isObject(params)) return "";
  if (params.payload) {
    try { return decodeBase64Url(params.payload); } catch (error) { return ""; }
  }
  const raw = params.data || params.json || "";
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch (error) { return raw; }
}

function utf8ByteLength(value) {
  const text = asString(value);
  try { return new TextEncoder().encode(text).byteLength; } catch (error) {
    return unescape(encodeURIComponent(text)).length;
  }
}

function parseDirectExportEnvelope(text, params = {}) {
  const raw = asString(text).trim();
  if (!raw) throw new Error("The clipboard is empty.");
  const bytes = utf8ByteLength(raw);
  if (bytes > MAX_DIRECT_TRANSFER_BYTES) {
    throw new Error(`This export is ${(bytes / 1024 / 1024).toFixed(1)} MB. Direct transfer currently accepts up to ${MAX_DIRECT_TRANSFER_BYTES / 1024 / 1024} MB; use the JSON file importer for this one.`);
  }

  const envelope = safeJsonParse(raw);
  if (!isObject(envelope) || envelope.format !== DIRECT_EXPORT_FORMAT) {
    throw new Error("The clipboard does not contain an RPG Homebrew direct-export package.");
  }
  if (Number(envelope.version) !== DIRECT_EXPORT_VERSION) {
    throw new Error(`Unsupported direct-export version: ${asString(envelope.version, "unknown")}.`);
  }

  const expectedRequestId = asString(params.requestId || params.request || params.id).trim();
  const actualRequestId = asString(envelope.requestId).trim();
  if (expectedRequestId && actualRequestId !== expectedRequestId) {
    throw new Error("The website handoff ID does not match the clipboard package. Try the export button again.");
  }

  const payload = envelope.payload !== undefined ? envelope.payload : (envelope.data !== undefined ? envelope.data : envelope.export);
  if (payload === undefined || payload === null) throw new Error("The direct-export package does not contain JSON data.");
  const payloadText = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const parsedPayload = safeJsonParse(payloadText);
  const assets = extractAssets(parsedPayload);
  if (!assets.length) throw new Error("The direct-export package contains no supported RPG Homebrew creations.");

  const createdAt = asString(envelope.createdAt).trim();
  let ageWarning = "";
  if (createdAt) {
    const created = new Date(createdAt);
    if (!Number.isNaN(created.getTime()) && Date.now() - created.getTime() > 30 * 60 * 1000) {
      ageWarning = "This clipboard package is more than 30 minutes old.";
    }
  }

  return {
    text: payloadText,
    filename: asString(envelope.filename, "Website direct export.json").trim() || "Website direct export.json",
    meta: {
      source: asString(envelope.source || envelope.origin).trim(),
      requestId: actualRequestId,
      createdAt,
      ageWarning,
      bytes,
      assetCount: assets.length,
    },
  };
}

async function readSystemClipboardText() {
  if (!globalThis.navigator || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
    throw new Error("Clipboard reading is unavailable on this device.");
  }
  const text = await navigator.clipboard.readText();
  if (text) return text;
  throw new Error("The system clipboard does not contain text.");
}

class HomebrewRenderChild extends MarkdownRenderChild {
  constructor(containerEl, asset, plugin) {
    super(containerEl);
    this.asset = asset;
    this.plugin = plugin;
  }

  onload() {
    renderAsset(this.asset, this.containerEl, this.plugin);
  }
}


class DiceResultsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return DICE_VIEW_TYPE; }
  getDisplayText() { return "RPG Dice Results"; }
  getIcon() { return "dice-5"; }

  async onOpen() { this.render(); }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("rpg-homebrew-dice-view");

    const header = contentEl.createDiv({ cls: "rpg-homebrew-dice-view-header" });
    header.createEl("h4", { text: "Dice Results" });
    const clear = header.createEl("button", { text: "Clear", cls: "rpg-homebrew-dice-clear" });
    clear.disabled = !this.plugin.getDiceHistory().length;
    clear.addEventListener("click", () => this.plugin.clearDiceHistory());

    const roller = contentEl.createDiv({ cls: "rpg-homebrew-manual-roller" });
    const input = roller.createEl("input", { type: "text", placeholder: "2d6+3" });
    input.setAttribute("aria-label", "Dice expression");
    const rollButton = roller.createEl("button", { text: "Roll", cls: "mod-cta" });
    const run = async () => {
      const expression = input.value.trim();
      if (!expression) return;
      try {
        await this.plugin.rollDice(expression, "Manual roll", { suppressAutoOpen: true });
        input.select();
      } catch (error) {
        new Notice(error.message || String(error), 5000);
      }
    };
    rollButton.addEventListener("click", run);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") run();
    });

    const history = this.plugin.getDiceHistory();
    const list = contentEl.createDiv({ cls: "rpg-homebrew-roll-history" });
    if (!history.length) {
      list.createDiv({ cls: "rpg-homebrew-roll-empty", text: "Click any dice notation in an imported statblock, or roll one here." });
      return;
    }

    history.forEach((roll) => {
      const card = list.createDiv({ cls: "rpg-homebrew-roll-result" });
      const top = card.createDiv({ cls: "rpg-homebrew-roll-result-top" });
      top.createDiv({ cls: "rpg-homebrew-roll-total", text: asString(roll.total) });
      const identity = top.createDiv({ cls: "rpg-homebrew-roll-identity" });
      identity.createDiv({ cls: "rpg-homebrew-roll-expression", text: asString(roll.expression) });
      if (roll.context) identity.createDiv({ cls: "rpg-homebrew-roll-context", text: asString(roll.context) });
      card.createDiv({ cls: "rpg-homebrew-roll-breakdown", text: asString(roll.breakdown) });
      const timestamp = new Date(roll.timestamp);
      card.createDiv({
        cls: "rpg-homebrew-roll-time",
        text: Number.isNaN(timestamp.getTime()) ? "" : timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }),
      });
    });
  }
}

class FolderSuggestModal extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Choose an import folder");
  }

  getItems() {
    const folders = this.app.vault.getAllLoadedFiles()
      .filter((file) => file instanceof TFolder)
      .map((folder) => folder.path)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return ["", ...folders];
  }

  getItemText(item) {
    return item || "Vault root";
  }

  onChooseItem(item) {
    this.onChoose(item);
  }
}

class ImportModal extends Modal {
  constructor(app, plugin, initialText = "", options = {}) {
    super(app);
    this.plugin = plugin;
    this.initialText = initialText;
    this.initialName = asString(options.initialName, "Pasted JSON");
    this.directMeta = isObject(options.directMeta) ? options.directMeta : null;
    this.needsManualPaste = Boolean(options.needsManualPaste);
    this.fileTexts = [];
    this.folder = plugin.settings.importFolder;
    this.rememberDestination = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rpg-homebrew-import-modal-shell");
    contentEl.addClass("rpg-homebrew-import-modal");
    contentEl.createEl("h2", { text: "Import RPG Homebrew JSON" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Choose or drop website JSON exports. Full libraries and multi-entry exports create one Obsidian note per creation.",
    });

    if (this.directMeta || this.needsManualPaste) {
      const banner = contentEl.createDiv({ cls: `rpg-homebrew-direct-transfer-banner${this.needsManualPaste ? " is-warning" : ""}` });
      banner.createEl("strong", { text: this.needsManualPaste ? "Website handoff needs one more step" : "Website export received" });
      if (this.needsManualPaste) {
        banner.createEl("div", { text: "Obsidian could not read the clipboard automatically. Click the Paste JSON box and press Ctrl+V, then continue normally." });
      } else {
        const source = asString(this.directMeta.source).trim();
        const count = Number(this.directMeta.assetCount) || 0;
        const size = Number(this.directMeta.bytes) || 0;
        const details = [];
        if (count) details.push(`${count} creation${count === 1 ? "" : "s"}`);
        if (size) details.push(size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`);
        if (source) details.push(source);
        banner.createEl("div", { text: details.join(" · ") || "The direct transfer is ready to review." });
        if (this.directMeta.ageWarning) banner.createEl("div", { cls: "rpg-homebrew-direct-transfer-warning", text: this.directMeta.ageWarning });
      }
    }

    const dropZone = contentEl.createDiv({ cls: "rpg-homebrew-drop-zone" });
    dropZone.createEl("strong", { text: "Drop JSON files here" });
    dropZone.createEl("span", { text: "or choose one or more files" });
    const input = dropZone.createEl("input", { type: "file" });
    input.accept = ".json,application/json,text/plain";
    input.multiple = true;

    const textLabel = contentEl.createEl("label", { cls: "rpg-homebrew-json-label" });
    textLabel.createEl("span", { text: "Paste JSON" });
    this.textArea = textLabel.createEl("textarea", { cls: "rpg-homebrew-json-input" });
    this.textArea.placeholder = "Paste a selected creation, library section, full library, or preview JSON export.";
    this.textArea.value = this.initialText;
    if (this.needsManualPaste) setTimeout(() => this.textArea && this.textArea.focus(), 0);

    const destination = new Setting(contentEl)
      .setName("Destination folder")
      .setDesc("The plugin creates this folder when it does not exist.");
    destination.addText((text) => {
      this.folderInput = text.inputEl;
      text.setPlaceholder("RPG Homebrew").setValue(this.folder);
      text.onChange((value) => { this.folder = value; });
    });
    destination.addButton((button) => button.setButtonText("Choose").onClick(() => {
      new FolderSuggestModal(this.app, (folder) => {
        this.folder = folder;
        this.folderInput.value = folder;
      }).open();
    }));

    new Setting(contentEl)
      .setName("Remember destination")
      .setDesc("Use this folder as the default for later imports.")
      .addToggle((toggle) => toggle.setValue(false).onChange((value) => { this.rememberDestination = value; }));

    this.previewEl = contentEl.createDiv({ cls: "rpg-homebrew-import-preview" });
    this.previewEl.setText("Choose a file or paste JSON to inspect it.");

    const buttons = contentEl.createDiv({ cls: "modal-button-container rpg-homebrew-import-buttons" });
    const sortedButton = buttons.createEl("button", { cls: "mod-cta", text: "Import sorted" });
    const quickButton = buttons.createEl("button", { text: "Quick add" });
    const cancelButton = buttons.createEl("button", { text: "Cancel" });

    const readFiles = async (files) => {
      const selected = Array.from(files || []).filter((file) => file.name.toLowerCase().endsWith(".json") || file.type.includes("json") || file.type === "text/plain" || !file.type);
      this.fileTexts = await Promise.all(selected.map(async (file) => ({ name: file.name, text: await file.text() })));
      this.refreshPreview();
    };

    input.addEventListener("change", () => readFiles(input.files));
    ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.addClass("is-dragging");
    }));
    ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.removeClass("is-dragging");
    }));
    dropZone.addEventListener("drop", (event) => readFiles(event.dataTransfer && event.dataTransfer.files));
    this.textArea.addEventListener("input", () => this.refreshPreview());

    sortedButton.addEventListener("click", () => this.runImport(true));
    quickButton.addEventListener("click", () => this.runImport(false));
    cancelButton.addEventListener("click", () => this.close());

    this.refreshPreview();
  }

  gatherTexts() {
    const texts = this.fileTexts.slice();
    const pasted = this.textArea ? this.textArea.value.trim() : "";
    if (pasted) texts.push({ name: this.initialName || "Pasted JSON", text: pasted });
    return texts;
  }

  inspect() {
    const assets = [];
    const errors = [];
    this.gatherTexts().forEach((entry) => {
      try {
        const parsed = safeJsonParse(entry.text);
        const extracted = extractAssets(parsed);
        if (!extracted.length) errors.push(`${entry.name}: no supported creations were found.`);
        assets.push(...extracted);
      } catch (error) {
        errors.push(`${entry.name}: ${error.message || error}`);
      }
    });
    return { assets, errors };
  }

  refreshPreview() {
    if (!this.previewEl) return;
    const texts = this.gatherTexts();
    if (!texts.length) {
      this.previewEl.setText("Choose a file or paste JSON to inspect it.");
      return;
    }
    const { assets, errors } = this.inspect();
    this.previewEl.empty();
    if (assets.length) {
      const counts = assets.reduce((map, asset) => {
        map[asset.type] = (map[asset.type] || 0) + 1;
        return map;
      }, {});
      this.previewEl.createEl("strong", { text: `${assets.length} creation${assets.length === 1 ? "" : "s"} detected` });
      this.previewEl.createEl("div", { text: Object.entries(counts).map(([type, count]) => `${count} ${TYPE_LABEL[type] || type}${count === 1 ? "" : "s"}`).join(" · ") });
    }
    errors.forEach((message) => this.previewEl.createEl("div", { cls: "rpg-homebrew-import-error", text: message }));
  }

  async runImport(organizeByType) {
    const texts = this.gatherTexts();
    if (!texts.length) {
      new Notice("Choose or paste at least one JSON export first.");
      return;
    }
    if (this.rememberDestination) {
      this.plugin.settings.importFolder = this.folder.trim();
      await this.plugin.saveSettings();
    }
    const result = await this.plugin.importTexts(texts, {
      rootFolder: this.folder.trim(),
      organizeByType,
    });
    if (result.created.length) this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class HomebrewSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default import folder")
      .setDesc("New notes are placed here unless you choose another folder during import.")
      .addText((text) => text
        .setPlaceholder("RPG Homebrew")
        .setValue(this.plugin.settings.importFolder)
        .onChange(async (value) => {
          this.plugin.settings.importFolder = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Organize by content type")
      .setDesc("The standard import command sorts notes into Mobs, Items & Potions, Spells, and other category folders.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.organizeByType)
        .onChange(async (value) => {
          this.plugin.settings.organizeByType = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Open imported note")
      .setDesc("Open the first created note after an import finishes.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.openImportedNote)
        .onChange(async (value) => {
          this.plugin.settings.openImportedNote = value;
          await this.plugin.saveSettings();
        }));


    new Setting(containerEl)
      .setName("Open dice results when rolling")
      .setDesc("Automatically open the dice results sidebar when a clickable dice expression is rolled.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoOpenDiceView)
        .onChange(async (value) => {
          this.plugin.settings.autoOpenDiceView = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Default dice-results sidebar")
      .setDesc("The view can be dragged to any other pane after it opens.")
      .addDropdown((dropdown) => dropdown
        .addOption("right", "Right sidebar")
        .addOption("left", "Left sidebar")
        .setValue(this.plugin.settings.diceViewSide)
        .onChange(async (value) => {
          this.plugin.settings.diceViewSide = value === "left" ? "left" : "right";
          await this.plugin.saveSettings();
        }));
  }
}

class RPGHomebrewImporterPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(DICE_VIEW_TYPE, (leaf) => new DiceResultsView(leaf, this));

    this.addRibbonIcon("file-json", "Import RPG Homebrew JSON", () => {
      new ImportModal(this.app, this).open();
    });

    this.addCommand({
      id: "import-json",
      name: "Import JSON",
      callback: () => new ImportModal(this.app, this).open(),
    });

    this.addCommand({
      id: "import-json-from-clipboard",
      name: "Import JSON from clipboard",
      callback: async () => {
        try {
          const text = await readSystemClipboardText();
          new ImportModal(this.app, this, text).open();
        } catch (error) {
          new Notice("Obsidian could not read JSON from the clipboard.");
        }
      },
    });

    this.addCommand({
      id: "receive-website-export",
      name: "Receive website export from clipboard",
      callback: () => this.receiveDirectClipboardExport({}),
    });

    this.addRibbonIcon("dice-5", "Open RPG dice results", () => {
      this.openDiceResults(this.settings.diceViewSide);
    });

    this.addCommand({
      id: "open-dice-results-right",
      name: "Open dice results in right sidebar",
      callback: () => this.openDiceResults("right", true),
    });

    this.addCommand({
      id: "open-dice-results-left",
      name: "Open dice results in left sidebar",
      callback: () => this.openDiceResults("left", true),
    });

    this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_LANGUAGE, (source, el, ctx) => {
      try {
        const parsed = safeJsonParse(source);
        const assets = extractAssets(parsed);
        if (!assets.length) throw new Error("No supported RPG Homebrew creation was found.");
        const child = new HomebrewRenderChild(el, assets[0], this);
        ctx.addChild(child);
      } catch (error) {
        el.empty();
        const box = el.createDiv({ cls: "rpg-homebrew-render-error" });
        box.createEl("strong", { text: "RPG Homebrew render error" });
        box.createEl("div", { text: error.message || String(error) });
      }
    });

    this.registerObsidianProtocolHandler(PROTOCOL_ACTION, async (params) => {
      const payload = decodeProtocolPayload(params);
      if (payload) {
        new ImportModal(this.app, this, payload, { initialName: "URI export.json" }).open();
        return;
      }
      if (params && (params.source === "clipboard" || params.clipboard === "1" || params.mode === "clipboard")) {
        await this.receiveDirectClipboardExport(params);
        return;
      }
      new Notice("The RPG Homebrew import link did not include a supported payload.", 6000);
      new ImportModal(this.app, this).open();
    });

    this.addSettingTab(new HomebrewSettingTab(this.app, this));
  }

  async receiveDirectClipboardExport(params = {}) {
    try {
      const clipboardText = await readSystemClipboardText();
      const transfer = parseDirectExportEnvelope(clipboardText, params);
      new ImportModal(this.app, this, transfer.text, {
        initialName: transfer.filename,
        directMeta: transfer.meta,
      }).open();
      return transfer;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      new Notice(`Direct website export failed: ${message}`, 9000);
      new ImportModal(this.app, this, "", {
        initialName: "Website direct export.json",
        needsManualPaste: true,
        directMeta: { error: message },
      }).open();
      return null;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!Array.isArray(this.settings.diceHistory)) this.settings.diceHistory = [];
    if (this.settings.diceViewSide !== "left") this.settings.diceViewSide = "right";
    this.settings.maxDiceHistory = Math.max(10, Math.min(500, Number(this.settings.maxDiceHistory) || 100));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getDiceHistory() {
    return Array.isArray(this.settings.diceHistory) ? this.settings.diceHistory : [];
  }

  async openDiceResults(side = this.settings.diceViewSide, forceSide = false) {
    const existing = this.app.workspace.getLeavesOfType(DICE_VIEW_TYPE);
    if (existing.length && !forceSide) {
      await this.app.workspace.revealLeaf(existing[0]);
      return existing[0];
    }
    if (existing.length && forceSide) {
      existing.forEach((leaf) => leaf.detach());
    }

    const targetSide = side === "left" ? "left" : "right";
    const leaf = targetSide === "left"
      ? this.app.workspace.getLeftLeaf(false)
      : this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("Obsidian could not open a sidebar for Dice Results.");
      return null;
    }
    await leaf.setViewState({ type: DICE_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  refreshDiceViews() {
    this.app.workspace.getLeavesOfType(DICE_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof DiceResultsView) leaf.view.render();
    });
  }

  async rollDice(expression, context = "", options = {}) {
    const rolled = rollDiceExpression(expression);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      expression: rolled.expression,
      total: rolled.total,
      breakdown: rolled.breakdown,
      context: asString(context).trim(),
      timestamp: new Date().toISOString(),
    };
    this.settings.diceHistory = [entry, ...this.getDiceHistory()].slice(0, this.settings.maxDiceHistory);
    await this.saveSettings();

    const hasView = this.app.workspace.getLeavesOfType(DICE_VIEW_TYPE).length > 0;
    if (!options.suppressAutoOpen && this.settings.autoOpenDiceView && !hasView) {
      await this.openDiceResults(this.settings.diceViewSide);
    }
    this.refreshDiceViews();
    new Notice(`${entry.expression} → ${entry.total}`, 2200);
    return entry;
  }

  async clearDiceHistory() {
    this.settings.diceHistory = [];
    await this.saveSettings();
    this.refreshDiceViews();
  }

  async ensureFolder(path) {
    const clean = normalizePath(asString(path).trim()).replace(/^\/+|\/+$/g, "");
    if (!clean) return "";
    const segments = clean.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try { await this.app.vault.createFolder(current); } catch (error) {
          if (!this.app.vault.getAbstractFileByPath(current)) throw error;
        }
      }
    }
    return clean;
  }

  availableNotePath(folder, baseName) {
    const cleanName = sanitizeFileName(baseName);
    const prefix = folder ? `${folder}/` : "";
    let path = normalizePath(`${prefix}${cleanName}.md`);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${prefix}${cleanName} (${index}).md`);
      index += 1;
    }
    return path;
  }

  async importTexts(entries, options = {}) {
    const rootFolder = options.rootFolder !== undefined ? options.rootFolder : this.settings.importFolder;
    const organizeByType = options.organizeByType !== undefined ? options.organizeByType : this.settings.organizeByType;
    const assets = [];
    const errors = [];

    entries.forEach((entry) => {
      try {
        const parsed = safeJsonParse(entry.text);
        const found = extractAssets(parsed);
        if (!found.length) errors.push(`${entry.name}: no supported creations were found.`);
        assets.push(...found);
      } catch (error) {
        errors.push(`${entry.name}: ${error.message || error}`);
      }
    });

    if (!assets.length) {
      new Notice(errors[0] || "No supported RPG Homebrew creations were found.", 7000);
      return { created: [], errors };
    }

    const cleanRoot = await this.ensureFolder(rootFolder);
    const created = [];
    for (const asset of assets) {
      const category = organizeByType ? TYPE_FOLDER[asset.type] || "Other" : "";
      const folder = category ? await this.ensureFolder(cleanRoot ? `${cleanRoot}/${category}` : category) : cleanRoot;
      const path = this.availableNotePath(folder, assetName(asset));
      const file = await this.app.vault.create(path, buildNoteContent(asset));
      created.push(file);
    }

    const message = `Imported ${created.length} RPG Homebrew creation${created.length === 1 ? "" : "s"}.${errors.length ? ` ${errors.length} file${errors.length === 1 ? "" : "s"} had an issue.` : ""}`;
    new Notice(message, errors.length ? 8000 : 4500);
    if (this.settings.openImportedNote && created[0]) await this.app.workspace.getLeaf(true).openFile(created[0]);
    return { created, errors };
  }
}

RPGHomebrewImporterPlugin.__test = {
  extractAssets,
  assetName,
  buildNoteContent,
  statModifier,
  actionMainLine,
  decodeProtocolPayload,
  parseDirectExportEnvelope,
  utf8ByteLength,
  rollDiceExpression,
};

module.exports = RPGHomebrewImporterPlugin;
