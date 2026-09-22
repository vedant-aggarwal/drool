import { useCodexStoryApprovalStore } from '../../stores/codexStoryApprovalStore'
import { useStoryboardStore } from '../../stores/storyboardStore'

/** Mount once in AppShell so an approval also works from Story studio. */
export function CodexStoryApproval() {
  const requests = useCodexStoryApprovalStore(s => s.requests)
  const answer = useCodexStoryApprovalStore(s => s.answer)
  const projects = useStoryboardStore(s => s.projects)
  const request = requests[0]
  if (!request) return null
  const project = projects.find(p => p.id === request.args.projectId)
  const panel = project?.panels.find(p => p.id === request.args.panelId)
  const preview = Object.entries(request.args).filter(([key]) => !['projectId', 'panelId', 'characterId'].includes(key))
  return <aside role="region" aria-label="Codex storyboard approval" className="fixed bottom-4 right-4 z-[100] w-[min(460px,calc(100vw-2rem))] space-y-3 rounded-xl border border-violet-400/40 bg-zinc-950 p-4 text-gray-100 shadow-xl" onKeyDown={e => { if (e.key === 'Escape') answer(request.id, false) }}>
    <h2 className="text-sm font-semibold">Codex requests a story action</h2>
    <p className="text-sm text-violet-200">{request.tool.replace('storyboard_', '').replaceAll('_', ' ')}{project ? ` · ${project.title}` : ''}{panel ? ` · ${panel.title}` : ''}</p>
    {panel && ['storyboard_approve_panel', 'storyboard_render_panel'].includes(request.tool) && <p className="max-h-32 overflow-auto whitespace-pre-wrap text-sm text-gray-300">{panel.prompt}</p>}
    <div className="max-h-60 space-y-2 overflow-auto text-sm">{preview.map(([key, value]) => <div key={key}><span className="font-medium text-gray-400">{key}: </span><span className="whitespace-pre-wrap break-words">{String(value)}</span></div>)}</div>
    {request.tool === 'storyboard_render_panel' && <p className="text-xs text-gray-400">Uses your selected local image engine and the approved panel prompt.</p>}
    <div className="flex gap-2"><button className="min-h-10 rounded-lg bg-violet-600 px-4 text-sm hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-white" onClick={() => answer(request.id, true)}>Allow once</button><button className="min-h-10 rounded-lg border border-white/20 px-4 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white" onClick={() => answer(request.id, false)}>Decline</button><span className="ml-auto self-center text-xs text-gray-500">{requests.length > 1 ? `${requests.length} requests` : 'Workflow permissions'}</span></div>
  </aside>
}
