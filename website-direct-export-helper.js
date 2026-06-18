// Reference helper for rpg-homebrew.netlify.app.
// Codex should integrate this into index.html rather than loading it as a separate file
// if the app is intentionally kept as one self-contained HTML document.

const OBSIDIAN_DIRECT_EXPORT_FORMAT = "rpg-homebrew-obsidian-direct-export";
const OBSIDIAN_DIRECT_EXPORT_VERSION = 1;
const OBSIDIAN_DIRECT_EXPORT_MAX_BYTES = 32 * 1024 * 1024;

function obsidianDirectExportByteLength(text) {
  return new TextEncoder().encode(String(text ?? "")).byteLength;
}

async function sendRpgHomebrewExportToObsidian(payload, filename = "rpg-homebrew-export.json") {
  if (!globalThis.isSecureContext || !navigator.clipboard?.writeText) {
    throw new Error("Direct Obsidian export requires an HTTPS page and clipboard support.");
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
  const byteLength = obsidianDirectExportByteLength(transferText);

  if (byteLength > OBSIDIAN_DIRECT_EXPORT_MAX_BYTES) {
    throw new Error(`This export is ${(byteLength / 1024 / 1024).toFixed(1)} MB. Download the JSON file and import it manually.`);
  }

  await navigator.clipboard.writeText(transferText);
  window.location.href = `obsidian://rpg-homebrew-import?source=clipboard&requestId=${encodeURIComponent(requestId)}`;
}
