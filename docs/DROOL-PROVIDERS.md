# Optional provider connections

Drool remains usable with local engines. The Connections page adds optional online providers. None of these providers becomes local inference by connecting it to Drool. API keys entered in this page stay in component memory, are never persisted, and are cleared when the page unmounts. The last Higgsfield job ID/status URL is saved so a paid generation can be recovered after restarting; no key is stored with it.

## Codex / ChatGPT

Install the official Codex CLI and Node.js if using its npm distribution. In Connections choose **Check connection**, then **Sign in with ChatGPT**. Complete the official browser flow. Account authentication and token refresh belong to Codex; Drool never reads, copies, or extracts auth files. The adapter uses its own `CODEX_HOME` in the desktop app data directory, so signing in for Drool does not change your ordinary Codex settings or load its MCP servers, hooks, or plugins.

Drool starts `codex app-server --stdio`, initializes the connection, and uses `account/read`, `account/login/start`, `model/list`, `thread/start`, `turn/start`, and `turn/interrupt`. It listens for streamed messages and native `imageGeneration` items. The response resolves only after a matching `turn/completed`, not after the command is accepted. Account usage and native image-generation availability depend on the signed-in account. There is no direct raw ChatGPT-token API adapter.

The creative connection disables `features.shell_tool`, uses a read-only sandbox with approval policy `never`, and rejects external server tool/permission requests. Connections has an opt-in **Allow Codex to use local storyboard tools** switch, off by default. Enabling it starts a new conversation with eight fixed built-in tools; no shell or arbitrary MCP tool can be registered through this bridge. The existing upstream **Codex mode** is a separate local agent feature and remains unchanged.

Storyboard tools can list/read/create projects, edit project details, edit panels and characters, explicitly approve panels, and render approved panels with the selected local image engine. They use the existing workflow permission settings, which default to confirmation. A visible **Allow once / Decline** card shows the action before execution; rendering also respects image-generation permissions. Cancelling a turn dismisses pending approvals and cancels its local generation. StoryStudio can scope the connection to one project. Story text and tool responses never grant permission by themselves.

Panel, visual style and character-appearance edits revoke affected approvals. Local rendering requires an approved panel and an installed image model, verifies the actual raster output from the configured ComfyUI instance, and saves a Gallery item before attaching it to the panel. If the panel changes during generation, the result is retained in Gallery without attaching it to the changed panel. The agent render tool currently supports ComfyUI output URLs; unsupported engine output formats fail explicitly instead of claiming an image was rendered.

The installed CLI used to inspect protocol schemas during development was `codex-cli 0.146.0`; `image_generation` was stable/enabled. An anonymous isolated app-server smoke test verified initialization, account/model reads, and creation of a thread with experimental dynamic tools. No paid image/chat turn was used to claim an account success. Real login and native generation must be validated with the user's account. The UI does not fabricate output when a native image is absent. Dynamic tools use Codex's experimental protocol and may need adaptation after CLI updates.

Official references:

- [App-server protocol and managed OAuth](https://learn.chatgpt.com/docs/app-server)
- [Codex image generation](https://learn.chatgpt.com/docs/image-generation)

## OpenRouter

The upstream app already includes an OpenRouter chat preset under AI Backends. The Connections panel adds live text and image catalogs and a generation form without replacing the current local engine. It uses `GET /api/v1/models`, `GET /api/v1/images/models`, `POST /api/v1/chat/completions`, and the dedicated `POST /api/v1/images` API. It accepts raster image outputs only. The model catalog and account determine available models and prices.

- [Image API, catalog and capabilities](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [Chat completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

## Higgsfield

Two independent connection routes are exposed:

1. **MCP:** add the preset and connect using the existing MCP controls. The preset runs `npx -y mcp-remote https://mcp.higgsfield.ai/mcp`; the first connect installs the open-source transport bridge and launches the provider's OAuth flow. Successful addition is not reported as successful authentication. MCP uses the user's plan credits; unlimited web generations do not apply. This bridge is a third-party transport, while the remote URL is Higgsfield's official endpoint.
2. **API:** enter `key-id:key-secret` in memory. The form demonstrates the documented Seedance 2.0 text-to-video endpoint with 5 seconds, 720p, 16:9 and audio. Requests use `Authorization: Key ...`, save the accepted request immediately, then poll the returned official `status_url` with increasing delay. Submission is never automatically retried. A completed result exposes the provider's video URL. API access uses a separate prepaid balance; it is not included in a website subscription.

The endpoint field is advanced configuration. Changing it requires a model accepting the form's parameters. Full per-model schema-driven controls, cost estimates, cancellation of queued jobs, and batch orchestration remain follow-up work. Do not describe the entire provider catalog as validated by this one form.

- [Official Higgsfield MCP and credit rules](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- [API versus subscription accounts](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api)
- [API authentication](https://docs.higgsfield.ai/docs/authentication)
- [Request lifecycle and results](https://docs.higgsfield.ai/docs/concepts/requests)
- [Polling](https://docs.higgsfield.ai/docs/concepts/polling)

## Integration and validation

`ProviderConnections` exports a complete page. The native backend must register `DroolCodexState` and the six `drool_codex_*` commands from `src-tauri/src/drool_codex.rs`, including `drool_codex_tool_result`. Mount `CodexStoryApproval` once in the app shell. Browser previews explicitly mark native Codex as unavailable and return HTTP 501 for its endpoints. `runCodexChat` is exported for a creative workflow with a prompt, model, optional conversation ID, abort signal, text-stream callback, `storyboardTools` opt-in and optional `storyboardProjectId` scope. Tool responses are correlated to a pending request and thread, consumed once, and expire after ten minutes.

Unit tests cover credential destination restrictions, malformed provider output, no accidental generation retries, request recovery metadata, stream-event races, duplicate dynamic requests, conversation/project isolation, failed turns and pre-cancelled requests. Storyboard tests exercise real store mutations, strict argument validation, approval revocation, blocked/declined permissions, permission changes while awaiting review, actual-output validation, and edits during rendering. Actual paid-provider generation and OAuth approval require account access and are not inferred from those tests.
