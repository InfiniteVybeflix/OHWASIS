'use client'

import { useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Bot, Check, X, RefreshCw, Edit3, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'

interface AiProposal {
  understanding: string
  displayName: string
  tagline: string
  description: string
  industry: string
  suggestedCategories: string[]
  suggestedProducts: Array<{
    name: string
    description: string
    basePrice: number
    currency: string
    category: string
    stock: number
  }>
  suggestedDeliveryZones: Array<{
    name: string
    fee: number
    estimatedMinutes: number
  }>
  suggestedPaymentMethods: string[]
  suggestedOpeningHours: Array<{
    day: number
    open: string
    close: string
    closed: boolean
  }>
  unclearPoints: string[]
}

interface AiDraftResponse {
  draftId: string
  understanding: string
  proposal: AiProposal
  model: string
  message: string
}

/**
 * AI Business Setup Dialog
 *
 * Owner describes their business idea in natural language.
 * AI proposes a structured setup (name, products, categories, etc.).
 * Owner sees the AI's understanding FIRST, then reviews the full proposal.
 *
 * Four actions:
 *  - Approve: apply the AI proposal as-is (creates the business)
 *  - Edit: owner modifies fields before approving (inline editor)
 *  - Retry: send feedback to AI, get a new proposal (linked to previous draft)
 *  - Cancel (X): discard the draft
 *
 * NOTHING is published until the owner approves.
 */
export function AiBusinessSetup({ open, onOpenChange, onApproved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onApproved: (handle: string) => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<AiDraftResponse | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editedProposal, setEditedProposal] = useState<AiProposal | null>(null)
  const [feedback, setFeedback] = useState('')
  const [showAll, setShowAll] = useState(false)

  const reset = () => {
    setDescription('')
    setDraft(null)
    setEditMode(false)
    setEditedProposal(null)
    setFeedback('')
    setShowAll(false)
  }

  const generate = async (isRetry: boolean) => {
    if (!isRetry && description.length < 20) {
      pushToast({ type: 'error', message: 'Please describe your business in at least 20 characters' })
      return
    }
    setLoading(true)
    try {
      const body: Record<string, string> = isRetry
        ? { description, feedback, parentDraftId: draft?.draftId }
        : { description }
      const res = await apiFetch<AiDraftResponse>('/api/ai/business-setup', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setDraft(res)
      setEditedProposal(res.proposal)
      setFeedback('')
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'AI call failed' })
    } finally {
      setLoading(false)
    }
  }

  const approve = async () => {
    if (!draft || !editedProposal) return
    setLoading(true)
    try {
      const isEdited = JSON.stringify(editedProposal) !== JSON.stringify(draft.proposal)
      // Auto-generate a handle from the display name (the user can change it later)
      const handle = editedProposal.displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
      const res = await apiFetch<{ draftId: string; status: string; appliedTo: string; message: string }>(
        `/api/ai/drafts/${draft.draftId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            editedProposal: isEdited ? editedProposal : undefined,
            handle,
          }),
        },
      )
      pushToast({
        type: 'success',
        message: isEdited
          ? `${editedProposal.displayName} created (with your edits applied)`
          : `${editedProposal.displayName} created!`,
      })
      onApproved(handle)
      reset()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Approval failed' })
    } finally {
      setLoading(false)
    }
  }

  const cancel = () => {
    if (draft) {
      // Mark the draft as rejected (no API call needed — drafts auto-expire if unattended)
      // We're being honest: we don't claim to "publish" anything.
    }
    reset()
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" /> AI business setup
              </CardTitle>
              <CardDescription className="mt-1">
                Describe your business idea. The AI will propose a setup you can review, edit, or retry before anything is published.
              </CardDescription>
            </div>
            <button onClick={cancel} aria-label="Close" className="opacity-70 hover:opacity-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Describe business */}
          {!draft && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="description">Describe your business idea</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="e.g. I want to start a small business selling fresh fruit juices and smoothies in Westlands, Nairobi. I'll deliver to offices during lunch hours and offer a subscription for daily delivery. My main products will be seasonal fruit juices, green smoothies, and protein shakes."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  The more detail you provide, the better the AI&apos;s proposal will be. You can revise later.
                </p>
              </div>
              <Button onClick={() => void generate(false)} disabled={loading || description.length < 20} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Sparkles className="mr-2 h-4 w-4" /> Generate proposal
              </Button>
            </div>
          )}

          {/* Step 2: Review AI proposal */}
          {draft && editedProposal && (
            <div className="space-y-4">
              {/* Understanding shown FIRST */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="mb-1 text-xs font-medium text-primary">What I understood</div>
                <p className="text-sm">{draft.understanding || editedProposal.understanding}</p>
              </div>

              {/* Unclear points — honest disclosure */}
              {editedProposal.unclearPoints && editedProposal.unclearPoints.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
                  <div className="mb-1 font-medium text-amber-700 dark:text-amber-300">Things I wasn&apos;t sure about:</div>
                  <ul className="ml-4 list-disc space-y-0.5 text-xs">
                    {editedProposal.unclearPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {/* Editable proposal fields */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Proposed setup</h3>
                  <Button size="sm" variant={editMode ? 'default' : 'outline'} onClick={() => setEditMode(!editMode)}>
                    <Edit3 className="mr-1 h-3 w-3" /> {editMode ? 'Editing' : 'Edit'}
                  </Button>
                </div>

                {editMode ? (
                  <EditableProposal proposal={editedProposal} onChange={setEditedProposal} />
                ) : (
                  <ReadonlyProposal proposal={editedProposal} showAll={showAll} onToggleShowAll={() => setShowAll(!showAll)} />
                )}
              </div>

              {/* Retry feedback */}
              <div className="rounded-lg border border-border/60 p-3">
                <Label htmlFor="feedback" className="text-xs">Feedback for retry (optional)</Label>
                <Textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={2}
                  placeholder="e.g. Make the products cheaper, add a delivery subscription, change the name to be more local..."
                />
              </div>

              {/* Action bar */}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button onClick={() => void approve()} disabled={loading} className="flex-1">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Approve &amp; create business
                </Button>
                <Button variant="outline" onClick={() => void generate(true)} disabled={loading || feedback.length < 5}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry with feedback
                </Button>
                <Button variant="ghost" onClick={cancel} disabled={loading}>
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReadonlyProposal({ proposal, showAll, onToggleShowAll }: {
  proposal: AiProposal
  showAll: boolean
  onToggleShowAll: () => void
}) {
  return (
    <div className="space-y-2 rounded border border-border/60 p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Business name" value={proposal.displayName} />
        <Field label="Industry" value={proposal.industry.replace('_', ' ')} />
      </div>
      <Field label="Tagline" value={proposal.tagline} />
      <div className="rounded border border-border/40 bg-muted/30 p-2">
        <div className="text-xs text-muted-foreground">Description</div>
        <p className="mt-1 text-sm whitespace-pre-wrap">{proposal.description}</p>
      </div>

      <button onClick={onToggleShowAll} className="flex items-center gap-1 text-xs text-primary">
        {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {showAll ? 'Hide details' : `Show ${proposal.suggestedProducts.length} products, ${proposal.suggestedCategories.length} categories, ${proposal.suggestedDeliveryZones.length} delivery zones, payment methods, opening hours`}
      </button>

      {showAll && (
        <div className="space-y-3 border-t pt-3">
          <div>
            <div className="text-xs font-medium">Categories</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {proposal.suggestedCategories.map((c, i) => <Badge key={i} variant="secondary" className="text-[10px]">{c}</Badge>)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium">Products ({proposal.suggestedProducts.length})</div>
            <ul className="mt-1 space-y-1">
              {proposal.suggestedProducts.map((p, i) => (
                <li key={i} className="rounded border border-border/40 p-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs">{p.currency} {p.basePrice.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                  <div className="text-[10px] text-muted-foreground">Category: {p.category} · Stock: {p.stock}</div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium">Delivery zones</div>
            <ul className="mt-1 space-y-1">
              {proposal.suggestedDeliveryZones.map((z, i) => (
                <li key={i} className="text-xs">{z.name} — KES {z.fee} (~{z.estimatedMinutes} min)</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium">Payment methods</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {proposal.suggestedPaymentMethods.map((m, i) => <Badge key={i} variant="outline" className="text-[10px]">{m.replace(/_/g, ' ')}</Badge>)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium">Opening hours</div>
            <ul className="mt-1 space-y-0.5">
              {proposal.suggestedOpeningHours.map((h, i) => (
                <li key={i} className="text-xs">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][h.day]}: {h.closed ? 'Closed' : `${h.open}–${h.close}`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function EditableProposal({ proposal, onChange }: {
  proposal: AiProposal
  onChange: (p: AiProposal) => void
}) {
  return (
    <div className="space-y-3 rounded border border-primary/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Business name</Label>
          <Input value={proposal.displayName} onChange={(e) => onChange({ ...proposal, displayName: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Industry</Label>
          <Input value={proposal.industry} onChange={(e) => onChange({ ...proposal, industry: e.target.value })} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Tagline</Label>
        <Input value={proposal.tagline} onChange={(e) => onChange({ ...proposal, tagline: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea value={proposal.description} onChange={(e) => onChange({ ...proposal, description: e.target.value })} rows={4} />
      </div>
      <div>
        <Label className="text-xs">Products (edit names / prices)</Label>
        <div className="space-y-2">
          {proposal.suggestedProducts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_60px] gap-2">
              <Input
                value={p.name}
                onChange={(e) => {
                  const next = [...proposal.suggestedProducts]
                  next[i] = { ...p, name: e.target.value }
                  onChange({ ...proposal, suggestedProducts: next })
                }}
              />
              <Input
                type="number"
                value={p.basePrice}
                onChange={(e) => {
                  const next = [...proposal.suggestedProducts]
                  next[i] = { ...p, basePrice: Number(e.target.value) }
                  onChange({ ...proposal, suggestedProducts: next })
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = proposal.suggestedProducts.filter((_, idx) => idx !== i)
                  onChange({ ...proposal, suggestedProducts: next })
                }}
              >Remove</Button>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        You can edit payment methods, opening hours, and delivery zones after the business is created.
      </p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}
