# Contributing

Bug reports and focused pull requests are welcome.

Before opening a pull request:

1. Run `npm install`.
2. Run `npm run verify`.
3. Run `npm run build` and test the generated plugin in an Obsidian test vault.
4. Keep JSON parsing backward-compatible whenever practical.
5. Avoid network access, telemetry, and dependencies that are unnecessary for the feature.

Please include a small JSON fixture or reproduction steps for parser and renderer bugs.
