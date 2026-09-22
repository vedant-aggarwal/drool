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

## Cursor native images

The **Cursor images** card uses the official Cursor Agent CLI, its managed sign-in, and the native `GenerateImage` tool. Install the CLI, choose **Check Cursor connection**, and sign in through Cursor's browser flow if needed. Existing CLI-managed authentication can be reused; Drool does not extract credentials or call private Cursor APIs. Generation runs online under the Cursor account's availability and usage limits. There is no separate image-model selector: Cursor routes native image generation; selecting a chat model would not select the image model.

Each image request has a fresh Drool-owned workspace and a separate `CURSOR_CONFIG_DIR`. The CLI runs in print/stream-JSON mode with no `--force`. Permissions allow only the requested output filename and deny shell commands, file reads, MCP calls, web fetches, and edits to configuration. Drool stops the process if the stream requests unrelated tools, reference files, unexpected output names, or a second native image operation. These are CLI permission controls, not an operating-system sandbox.

The result must include a successful native image-tool response, a successful terminal result, and decodable PNG/JPEG/WebP bytes within size limits. Text claiming an image exists is insufficient. Cursor may save its original in its managed project-assets cache; Drool saves a verified copy in its existing local images directory and provides a native **Save image as…** dialog and **Save to library** action. **Stop Cursor** cancels the local process, but cannot promise a refund or recall work already submitted to Cursor. Generation is never retried automatically. Reference-image editing and integration into StoryStudio's render queue are not exposed by this image card; the separate Cursor chat card exposes its advertised chat-model variants.

Validated with installed CLI `2026.09.18-9a7762b`: managed authentication check, a deny-all output-permission failure, then a real native image generation under the scoped allowlist. The successful run returned JPEG bytes (despite the requested `.png` filename); Drool detects the actual format and uses the matching extension. Unit tests cover cancellation, unsupported tool/output rejection, duplicate-start events, actual decoding, and UI states. Browser previews explicitly return HTTP 501.

- [Official Cursor image-generation overview](https://cursor.com/docs/agent/overview)
- [CLI permissions](https://cursor.com/docs/cli/reference/permissions)
- [CLI configuration and CURSOR_CONFIG_DIR](https://cursor.com/docs/cli/reference/configuration)
- [Structured CLI output](https://docs.cursor.com/en/cli/reference/output-format)

## OpenRouter

The upstream app already includes an OpenRouter chat preset under AI Backends. The Connections panel adds live text and image catalogs and a generation form without replacing the current local engine. It uses `GET /api/v1/models`, `GET /api/v1/images/models`, `POST /api/v1/chat/completions`, and the dedicated `POST /api/v1/images` API. It accepts raster image outputs only. The model catalog and account determine available models and prices.

- [Image API, catalog and capabilities](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [Chat completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

## Higgsfield

Two independent connection routes are exposed:

1. **MCP:** add the preset and connect using the existing MCP controls. The preset runs `npx -y mcp-remote https://mcp.higgsfield.ai/mcp`; the first connect installs the open-source transport bridge and launches the provider's OAuth flow. Successful addition is not reported as successful authentication. MCP uses the allowance or credits advertised by the account and model; when Higgsfield returns an unlimited-versus-credits choice, Drool waits for the user to choose. This bridge is a third-party transport, while the remote URL is Higgsfield's official endpoint.
2. **API:** enter `key-id:key-secret` in memory. The form demonstrates the documented Seedance 2.0 text-to-video endpoint with 5 seconds, 720p, 16:9 and audio. Requests use `Authorization: Key ...`, save the accepted request immediately, then poll the returned official `status_url` with increasing delay. Submission is never automatically retried. A completed result exposes the provider's video URL. API access uses a separate prepaid balance; it is not included in a website subscription.

The endpoint field is advanced configuration. Changing it requires a model accepting the form's parameters. The MCP studio separately discovers live model metadata, aspect ratios and defaults, exposes advanced JSON parameters and cost estimates, submits image/video requests, and polls jobs. Only advertised tools on the official connected server can run. Models requiring reference uploads are excluded from this text-only form. Stop cancels the local wait and sends an MCP cancellation notification; it cannot guarantee cancellation or refunds for already-submitted jobs. Batch orchestration remains follow-up work. Do not describe the entire provider catalog as validated by this one form.

- [Official Higgsfield MCP and credit rules](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- [API versus subscription accounts](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api)
- [API authentication](https://docs.higgsfield.ai/docs/authentication)
- [Request lifecycle and results](https://docs.higgsfield.ai/docs/concepts/requests)
- [Polling](https://docs.higgsfield.ai/docs/concepts/polling)

## Integration and validation

Connections now includes explicit Codex **Chat / Generate an image** actions. An image request without a native image result is reported as unavailable, never as successful generation. Reasoning choices come from `model/list.supportedReasoningEfforts` and are checked again against the live catalog before `turn/start.effort`. Persona text is sent in new-thread developer instructions; changing it starts a new conversation. Persona and per-model effort preferences are saved locally and inherited by `runCodexChat`, including StoryStudio calls. No credentials are stored with these preferences.

Images from Codex, OpenRouter, Cursor and Higgsfield can be saved to the Create library. The native `drool_save_provider_image` command decodes and bounds raster images before saving inside the existing `read_media_file` allowlist; library metadata retains the local path across restarts. Remote video entries retain their provider link and display an expiry warning and Open original action. Saving a library video does not claim that its bytes have been downloaded. Higgsfield MCP generation has structured-result, model-default, allowance-choice and cancellation tests; it has not been validated with a paid generation against the user's OAuth session.

Remote Connections previews use the existing SSRF-safe binary proxy, then local `blob:` URLs; the app's CSP remains unchanged. The capped native route attaches no stored credentials, checks each redirect through the existing DNS-pinned policy, enforces a 90-second overall download deadline, and rejects a body before buffering beyond 24 MB for images or 96 MB for videos. PNG/JPEG/WebP and MP4/WebM signatures are checked before preview. Image saving reuses the preview bytes and additionally performs native raster decoding. Object URLs are revoked on replacement or unmount; late downloads cannot create a stale preview. Leaving the panel drops the result, while a native download already underway may continue until its size/deadline limit. Oversized, unsupported or expired results retain **Open original**. Videos remain remote library references and do not become persistent offline video files.

`ProviderConnections` exports a complete page. The native backend must register `DroolCodexState` and the six `drool_codex_*` commands from `src-tauri/src/drool_codex.rs`, including `drool_codex_tool_result`. Mount `CodexStoryApproval` once in the app shell. Browser previews explicitly mark native Codex as unavailable and return HTTP 501 for its endpoints. `runCodexChat` is exported for a creative workflow with a prompt, model, optional conversation ID, abort signal, text-stream callback, `storyboardTools` opt-in and optional `storyboardProjectId` scope. Tool responses are correlated to a pending request and thread, consumed once, and expire after ten minutes.

Unit tests cover credential destination restrictions, malformed provider output, no accidental generation retries, request recovery metadata, stream-event races, duplicate dynamic requests, conversation/project isolation, failed turns and pre-cancelled requests. Storyboard tests exercise real store mutations, strict argument validation, approval revocation, blocked/declined permissions, permission changes while awaiting review, actual-output validation, and edits during rendering. Actual paid-provider generation and OAuth approval require account access and are not inferred from those tests.
