'use client'

import { useEffect, useRef, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Loader2, Edit, FileText, Trash2, Sparkles, Check, X, RefreshCw, Eye } from 'lucide-react'

interface PageDTO {
  id: string
  slug: string
  title: string
  status: string
  publishedAt: string | null
  updatedAt: string
}

// ---------------------------------------------------------------------------
// CMS AI draft flow
// ---------------------------------------------------------------------------

type AiStep = 'compose' | 'review'
type ReviewMode = 'view' | 'edit' | 'retry'

interface CmsProposal {
  title?: string
  slug?: string
  body?: string
  understanding?: string
  seo?: Record<string, string>
}

const PAGE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'about', label: 'About' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'terms', label: 'Terms' },
  { value: 'faq', label: 'FAQ' },
  { value: 'offer', label: 'Offer' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'custom', label: 'Custom' },
]

export function MerchantCMSTab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [pages, setPages] = useState<PageDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PageDTO | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // AI draft state
  const [aiOpen, setAiOpen] = useState(false)
  const [aiStep, setAiStep] = useState<AiStep>('compose')
  const [reviewMode, setReviewMode] = useState<ReviewMode>('view')
  const [description, setDescription] = useState('')
  const [pageType, setPageType] = useState('offer')
  const [feedback, setFeedback] = useState('')
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [understanding, setUnderstanding] = useState<string | null>(null)
  const [proposal, setProposal] = useState<CmsProposal | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ pages: PageDTO[] }>('/api/pages')
      setPages(data.pages)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantHandle])

  const openAiDialog = () => {
    setAiStep('compose')
    setReviewMode('view')
    setDescription('')
    setPageType('offer')
    setFeedback('')
    setDraftId(null)
    setUnderstanding(null)
    setProposal(null)
    setAiOpen(true)
  }

  const generate = async (mode: 'fresh' | 'retry') => {
    if (mode === 'fresh' && description.trim().length < 10) {
      pushToast({ type: 'error', message: 'Describe your idea in at least 10 characters' })
      return
    }
    if (mode === 'retry' && feedback.trim().length < 3) {
      pushToast({ type: 'error', message: 'Add a few words of feedback first' })
      return
    }
    setGenerating(true)
    try {
      const body: Record<string, unknown> = { description, pageType }
      if (mode === 'retry') {
        body.feedback = feedback
        if (draftId) body.parentDraftId = draftId
      }
      const res = await apiFetch<{
        draftId: string
        understanding?: string
        proposal: CmsProposal
        model?: string
        message?: string
      }>('/api/cms/ai-draft', { method: 'POST', body: JSON.stringify(body) })
      setDraftId(res.draftId)
      setUnderstanding(res.understanding ?? res.proposal?.understanding ?? null)
      setProposal(res.proposal)
      setAiStep('review')
      setReviewMode('view')
      setFeedback('')
      if (mode === 'retry') {
        pushToast({ type: 'success', message: 'Revised draft ready' })
      }
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'AI draft failed' })
    } finally {
      setGenerating(false)
    }
  }

  const approve = async (editedHtml?: string) => {
    if (!draftId) {
      pushToast({ type: 'error', message: 'No draft to approve' })
      return
    }
    setApproving(true)
    try {
      const body: Record<string, unknown> = {}
      if (editedHtml !== undefined && proposal) {
        body.editedProposal = { ...proposal, body: editedHtml }
      }
      await apiFetch<{ appliedTo: string; message?: string }>(`/api/ai/drafts/${draftId}/approve`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      pushToast({ type: 'success', message: 'Draft approved — page saved as DRAFT' })
      setAiOpen(false)
      await load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Approve failed' })
    } finally {
      setApproving(false)
    }
  }

  const cancelDraft = async () => {
    if (!draftId) {
      setAiOpen(false)
      return
    }
    // Best-effort reject so the draft isn't left dangling
    try {
      await apiFetch(`/api/ai/drafts/${draftId}`, { method: 'DELETE' })
    } catch {
      // ignore — non-critical
    }
    setAiOpen(false)
  }

  if (loading) return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{pages.length} pages</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openAiDialog}>
            <Sparkles className="mr-1 h-4 w-4" /> Describe your idea
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" /> New page
          </Button>
        </div>
      </div>
      {pages.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No CMS pages yet. Create your first About, Privacy, or Terms page — or describe an idea and let AI draft one.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded border border-border/60 p-3">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant={p.status === 'PUBLISHED' ? 'default' : 'secondary'} className="text-[10px]">{p.status}</Badge>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">/{p.slug}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                <Edit className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <PageEditor
        open={showCreate || editing !== null}
        page={editing}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditing(null) } }}
        onSaved={() => { void load() }}
      />

      {/* AI draft dialog */}
      <Dialog open={aiOpen} onOpenChange={(o) => { if (!o) void cancelDraft(); else setAiOpen(o) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {aiStep === 'compose' ? 'Describe your page idea' : 'Review AI draft'}
            </DialogTitle>
            <DialogDescription>
              {aiStep === 'compose'
                ? 'Tell the AI what you want. It will draft a CMS page (saved as DRAFT — nothing publishes until you say so).'
                : 'Approve to create a DRAFT page, edit inline, or retry with feedback.'}
            </DialogDescription>
          </DialogHeader>

          {aiStep === 'compose' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="ai-page-type">Page type</Label>
                <Select value={pageType} onValueChange={setPageType}>
                  <SelectTrigger id="ai-page-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ai-description">Describe your idea</Label>
                <Textarea
                  id="ai-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="e.g. A special offer page for 20% off all water bottles this weekend, with a countdown and call-to-action"
                />
                <p className="mt-1 text-xs text-muted-foreground">The more specific you are, the better the draft.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setAiOpen(false)}>Cancel</Button>
                <Button onClick={() => void generate('fresh')} disabled={generating || description.trim().length < 10}>
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Generate draft
                </Button>
              </DialogFooter>
            </div>
          )}

          {aiStep === 'review' && proposal && (
            <div className="space-y-3">
              {/* AI understanding */}
              {understanding && (
                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <Eye className="h-3.5 w-3.5" /> AI&apos;s understanding
                  </div>
                  <p className="text-sm text-foreground/80">{understanding}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {proposal.title && (
                  <div>
                    <span className="text-muted-foreground">Title: </span>
                    <span className="font-medium">{proposal.title}</span>
                  </div>
                )}
                {proposal.slug && (
                  <div>
                    <span className="text-muted-foreground">Slug: </span>
                    <span className="font-mono">/{proposal.slug}</span>
                  </div>
                )}
              </div>

              {/* HTML preview / editor */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label>Preview</Label>
                  {reviewMode === 'view' && (
                    <span className="text-xs text-muted-foreground">Sanitised HTML · read-only</span>
                  )}
                  {reviewMode === 'edit' && (
                    <span className="text-xs text-amber-600">Editing — click anywhere in the preview to edit</span>
                  )}
                </div>
                <div
                  ref={previewRef}
                  contentEditable={reviewMode === 'edit'}
                  suppressContentEditableWarning
                  className={
                    'min-h-[200px] overflow-auto rounded border bg-background p-3 text-sm prose prose-sm max-w-none ' +
                    (reviewMode === 'edit'
                      ? 'border-amber-500 outline-dashed outline-2 outline-amber-500/60'
                      : 'border-border/60')
                  }
                  dangerouslySetInnerHTML={{ __html: proposal.body ?? '' }}
                />
              </div>

              {/* Retry feedback input */}
              {reviewMode === 'retry' && (
                <div>
                  <Label htmlFor="ai-feedback">Feedback for the AI</Label>
                  <Textarea
                    id="ai-feedback"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="e.g. Make the headline bigger, add a price list, soften the tone…"
                    autoFocus
                  />
                </div>
              )}

              {/* Action buttons */}
              <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void cancelDraft()}
                  disabled={generating || approving}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Cancel
                </Button>

                <div className="flex flex-wrap gap-2">
                  {reviewMode === 'view' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewMode('retry')}
                        disabled={generating || approving}
                      >
                        <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry with feedback
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewMode('edit')}
                        disabled={generating || approving}
                      >
                        <Edit className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void approve()}
                        disabled={generating || approving}
                      >
                        {approving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                        Approve
                      </Button>
                    </>
                  )}

                  {reviewMode === 'edit' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewMode('view')}
                        disabled={approving}
                      >
                        Cancel edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const html = previewRef.current?.innerHTML ?? ''
                          void approve(html)
                        }}
                        disabled={approving}
                      >
                        {approving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                        Save &amp; approve
                      </Button>
                    </>
                  )}

                  {reviewMode === 'retry' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewMode('view')}
                        disabled={generating}
                      >
                        Back
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void generate('retry')}
                        disabled={generating || feedback.trim().length < 3}
                      >
                        {generating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                        Regenerate
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PageEditor({ open, page, onOpenChange, onSaved }: {
  open: boolean
  page: PageDTO | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    title: '',
    body: '',
    status: 'DRAFT',
  })

  useEffect(() => {
    if (page) {
      // Fetch full page to get body
      void (async () => {
        try {
          const data = await apiFetch<{ page: { slug: string; title: string; body: string; status: string } }>(`/api/pages/${page.id}`)
          setForm({ slug: data.page.slug, title: data.page.title, body: data.page.body, status: data.page.status })
        } catch {
          // ignore
        }
      })()
    } else {
      setForm({ slug: '', title: '', body: '', status: 'DRAFT' })
    }
  }, [page])

  const submit = async () => {
    setLoading(true)
    try {
      if (page) {
        await apiFetch(`/api/pages/${page.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await apiFetch('/api/pages', { method: 'POST', body: JSON.stringify(form) })
      }
      pushToast({ type: 'success', message: 'Page saved' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    if (!page) return
    setLoading(true)
    try {
      await apiFetch(`/api/pages/${page.id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Page deleted' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{page ? 'Edit page' : 'Create page'}</DialogTitle>
          <DialogDescription>
            HTML body is sanitised server-side before save. Drafts are private; only published pages appear on the storefront.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="about" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="UNPUBLISHED">Unpublished</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>Body (HTML, sanitised on save)</Label>
            <Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={10} className="font-mono text-xs" placeholder="<p>Your content here…</p>" />
            <p className="mt-1 text-xs text-muted-foreground">
              Script tags, on* handlers, and javascript: URLs are stripped automatically.
            </p>
          </div>
        </div>
        <DialogFooter className="flex justify-between gap-2">
          {page && (
            <Button variant="outline" size="sm" onClick={() => void remove()} disabled={loading}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
