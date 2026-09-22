# Cursor chat, effort and conversation instructions

In Connections, sign in with the official Cursor CLI if necessary, then choose
**Load Cursor chat models**. Drool reads the CLI's live `models` catalog. Select a
model family and one of the reasoning efforts actually advertised for it. Fast
and Thinking variants remain separate where the catalog distinguishes them.
No arbitrary effort override is invented for models exposing only one setting.

Persona presets and editable default instructions are saved locally as app
preferences. They are sent with each conversation turn; they do not replace
Cursor's provider-level system instructions. This is a text conversation route,
separate from Cursor's native image-generation tool. Image model selection remains
controlled by Cursor.

Each turn uses the official CLI in `--mode ask`, an isolated workspace, and a
Drool-owned CLI configuration that denies file reads/writes, shell execution,
MCP calls and web fetches. Authentication stays with the official CLI. No Cursor
tokens are read or copied by Drool. Cancellation terminates the owned CLI process;
there is no automatic retry that might spend credits twice.

The visible conversation stays in the panel while it is open. Each request sends
the current instructions and the last 12 exchanges. Very large conversations
produce an explicit request to start a new chat; they are not silently shortened
beyond this displayed history window. Default model/persona settings survive
leaving the page; conversation history is not a durable chat archive yet.

Validation on Windows with Cursor CLI 2026.09.18: live catalog discovery returned
model/effort variants; a harmless authenticated text request in Ask mode returned
`Drool chat ready.`. Unit tests cover model grouping, effort IDs, personas,
cancelled requests, malformed responses, prompt bounds and role validation.

Official reference: [Cursor CLI parameters](https://cursor.com/docs/cli/reference/parameters).
