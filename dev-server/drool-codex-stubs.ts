import type { RouteMount } from './routes'

/** Browser preview cannot launch the native, account-bound Codex bridge. */
export function registerDroolCodexStubs(routes: RouteMount): void {
  for (const operation of ['status', 'login', 'generate', 'cancel', 'models', 'chat']) {
    routes.use(`/local-api/drool-cursor-${operation}`, (_req, res) => {
      res.writeHead(501, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Cursor image generation requires the Drool desktop app.', devModeOnly: true }))
    })
  }
  for (const operation of ['connect', 'login', 'send', 'interrupt', 'disconnect', 'tool-result']) {
    routes.use(`/local-api/drool-codex-${operation}`, (_req, res) => {
      res.writeHead(501, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Codex account integration requires the Drool desktop app. Browser preview cannot launch Codex.', devModeOnly: true }))
    })
  }
}
