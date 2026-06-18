const assert = require("assert");
const Module = require("module");
const path = require("path");

const originalLoad = Module._load;
class EmptyClass {}
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    return {
      Plugin: EmptyClass,
      Modal: EmptyClass,
      Notice: EmptyClass,
      PluginSettingTab: EmptyClass,
      Setting: EmptyClass,
      FuzzySuggestModal: EmptyClass,
      MarkdownRenderChild: EmptyClass,
      ItemView: EmptyClass,
      TFolder: EmptyClass,
      normalizePath: (value) => String(value).replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
    };
  }
  return originalLoad(request, parent, isMain);
};

const entryPath = process.env.PLUGIN_ENTRY
  ? path.resolve(process.cwd(), process.env.PLUGIN_ENTRY)
  : path.resolve(__dirname, "../src/main.js");
const PluginClass = require(entryPath);
const api = PluginClass.__test;

const rawMob = {
  name: "Gridlock Sentry Statue",
  subtitle: "Mob; Medium (4), Construct",
  health: { slots: 7, hpPerSlot: 2, values: [] },
  vitals: { level: "5", surprise: "9+F", evade: "10+F", move: "10+S", dr: "3" },
  stats: { str: 8, int: 1, con: 10, dex: 2, cha: 1 },
  actions: [{ name: "Stone Fist", toHit: 13, useFloor: true, damage: "1d8+3 Bludgeoning", range: 5, extra: "", rider: "" }],
  notes: "Intersection Guard",
};

let assets = api.extractAssets(rawMob);
assert.equal(assets.length, 1);
assert.equal(assets[0].type, "statblock");
assert.equal(api.assetName(assets[0]), "Gridlock Sentry Statue");

const library = {
  format: "ttrpg-statblock-builder-library",
  statblocks: [{ kind: "statblock", statblock: rawMob, description: { title: "Gridlock Sentry Statue, Level 5", body: "A statue." } }],
  classes: [{ kind: "class", classblock: { name: "Traffic Cop", features: [] } }],
  items: [{ kind: "item", itemblock: { name: "Shambling Acid Buckler", kind: "item", features: [] } }],
  spells: [{ kind: "spell", spellblock: { name: "Invoke Tragedy", description: "Pain.", manaCost: "15x Spell Rank" } }],
  skills: [{ kind: "skill", skillblock: { name: "Wall Skitter", description: "Move on walls." } }],
  achievements: [{ kind: "achievement", achievementblock: { name: "For Whom the Bell Tolls", description: "Defeat a boss.", reward: "Silver Boss Box" } }],
  lootboxes: [{ kind: "lootbox", name: "Silver Boss Box", pool: [] }],
};
assets = api.extractAssets(library);
assert.equal(assets.length, 7);
assert.deepEqual(assets.map((asset) => asset.type), ["statblock", "class", "item", "spell", "skill", "achievement", "lootbox"]);

const preview = { format: "ttrpg-statblock-builder-preview", cards: [{ statblock: rawMob }], classes: [], items: [] };
assert.equal(api.extractAssets(preview).length, 1);
assert.equal(api.extractAssets({ title: "Orange Lichen Gnawer, Level 3", body: "It gnaws." })[0].type, "description");
assert.equal(api.statModifier(1), 1);
assert.equal(api.statModifier(8), 3);
assert.equal(api.statModifier(50), 6);
assert.equal(api.actionMainLine(rawMob.actions[0]), "13+F to hit, 1d8+3 Bludgeoning, 5ft range");

const note = api.buildNoteContent(api.extractAssets(rawMob)[0]);
assert(note.includes("rpg_homebrew_type: \"statblock\""));
assert(note.includes("````rpg-homebrew"));
assert(note.includes("Gridlock Sentry Statue"));


const requestId = "test-request-123";
const directEnvelope = {
  format: "rpg-homebrew-obsidian-direct-export",
  version: 1,
  requestId,
  createdAt: new Date().toISOString(),
  source: "https://rpg-homebrew.netlify.app",
  filename: "gridlock-sentry-statblock.json",
  payload: rawMob,
};
const directParsed = api.parseDirectExportEnvelope(JSON.stringify(directEnvelope), { requestId });
assert.equal(directParsed.filename, "gridlock-sentry-statblock.json");
assert.equal(api.extractAssets(JSON.parse(directParsed.text)).length, 1);
assert.equal(api.extractAssets(directEnvelope).length, 1);
assert(api.utf8ByteLength(JSON.stringify(directEnvelope)) > 0);
assert.throws(() => api.parseDirectExportEnvelope(JSON.stringify(directEnvelope), { requestId: "wrong-request" }));

const roll = api.rollDiceExpression("2d6+3");
assert.equal(roll.terms.length, 2);
assert(roll.total >= 5 && roll.total <= 15);
assert(roll.breakdown.includes("2d6"));
assert.throws(() => api.rollDiceExpression("2d0"));
const d20 = api.rollDiceExpression("d20");
assert(d20.total >= 1 && d20.total <= 20);

console.log("Parser smoke tests passed.");
