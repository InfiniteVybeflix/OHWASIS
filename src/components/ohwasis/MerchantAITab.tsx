'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Bot, Loader2, Plus, Send, KeyRound, Trash2, Sparkles, Zap } from 'lucide-react'

interface AiConfigDTO {
  id: string
  provider: string
  displayName: string
  enabled: boolean
  models: string
  maskedHint: string | null
  updatedAt: string
}

interface ChatMessageDTO {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function MerchantAITab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [configs, setConfigs] = useState<AiConfigDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [showAccessRequest, setShowAccessRequest] = useState(false)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessageDTO[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ configs: AiConfigDTO[]; recommended: { provider: string; baseUrl: string; defaultModel: string; contactEmail: string } }>('/api/ai/config')
      setConfigs(data.configs)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantHandle])  

  const sendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: ChatMessageDTO = { role: 'user', content: chatInput.trim() }
    const messages = [...chatMessages, userMsg]
    setChatMessages(messages)
    setChatInput('')
    setChatLoading(true)
    try {
      const data = await apiFetch<{ text: string; model: string; provider: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: messages.slice(-10), // keep last 10 for context window
          temperature: 0.6,
        }),
      })
      setChatMessages((m) => [...m, { role: 'assistant', content: data.text }])
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'AI call failed' })
    } finally {
      setChatLoading(false)
    }
  }

  const presetPrompts = [
    { label: 'Product description', text: 'Write a 60-word product description for a 500ml glass water bottle with bamboo lid, aimed at eco-conscious Nairobi customers.' },
    { label: 'Marketing tagline', text: 'Suggest 3 punchy marketing taglines for a restaurant serving authentic Kenyan pilau.' },
    { label: 'Email subject lines', text: 'Write 3 subject lines for a Black Friday promotion email from a fashion store.' },
  ]

  if (loading) return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>

  const hasEnabled = configs.some((c) => c.enabled)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" /> AI providers</CardTitle>
          <CardDescription className="text-xs">
            Provider-neutral AI layer. Recommended: Aevibron Gateway. OpenAI-compatible APIs also supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI provider configured yet.</p>
          ) : (
            <ul className="space-y-2">
              {configs.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded border border-border/60 p-3">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.displayName}</span>
                        <Badge variant={c.enabled ? 'default' : 'secondary'} className="text-[10px]">{c.enabled ? 'Enabled' : 'Disabled'}</Badge>
                        <Badge variant="outline" className="text-[10px]">{c.provider}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{c.maskedHint}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}>Edit</Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => setShowConfig(true)}>
              <Plus className="mr-1 h-4 w-4" /> Configure provider
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAccessRequest(true)}>
              <KeyRound className="mr-1 h-4 w-4" /> Request Aevibron access
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI assistant</CardTitle>
          <CardDescription className="text-xs">
            Draft product descriptions, marketing copy, and more. Sensitive data (cards, PINs, IDs) is auto-redacted before sending.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasEnabled && (
            <div className="mb-3 rounded border border-amber-500/30 bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
              No enabled AI provider. The platform may still route to Aevibron Gateway if a platform-level key is configured — try sending a message below.
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            {presetPrompts.map((p) => (
              <Button key={p.label} size="sm" variant="outline" onClick={() => setChatInput(p.text)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="mb-3 max-h-80 space-y-2 overflow-y-auto rounded border border-border/60 p-3">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ask the assistant anything about your catalogue, customers, or marketing.</p>
            ) : chatMessages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
                <Badge variant={m.role === 'user' ? 'secondary' : 'default'} className="mb-1 text-[10px]">{m.role}</Badge>
                <div className={`whitespace-pre-wrap rounded p-2 ${m.role === 'user' ? 'bg-primary/10' : 'bg-muted/40'}`}>{m.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Generating response…
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} rows={2} placeholder="Type your prompt…" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { void sendMessage() } }} />
            <Button onClick={() => void sendMessage()} disabled={chatLoading || !chatInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AiConfigEditor open={showConfig} onOpenChange={setShowConfig} onSaved={() => { void load() }} />
      <AccessRequestDialog open={showAccessRequest} onOpenChange={setShowAccessRequest} />
    </div>
  )
}

function AiConfigEditor({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [form, setForm] = useState({
    provider: 'aevibron',
    displayName: 'Aevibron Gateway',
    enabled: true,
    baseUrl: 'https://Aevibron-gateway.vercel.app/api/v1',
    apiKey: '',
    defaultModel: 'aevibron-default',
    authScheme: 'x-aevibron-key',
    models: 'aevibron-default',
  })

  const submit = async () => {
    setLoading(true)
    try {
      const body = {
        provider: form.provider,
        displayName: form.displayName,
        enabled: form.enabled,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        defaultModel: form.defaultModel,
        authScheme: form.authScheme,
        models: typeof form.models === 'string'
          ? form.models.split(',').map((s: string) => s.trim()).filter(Boolean)
          : Array.isArray(form.models) ? form.models : [],
      }
      console.log('[AI saveProvider] Sending body:', JSON.stringify(body).slice(0, 200))
      const res = await apiFetch<{ config: unknown }>('/api/ai/config', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      console.log('[AI saveProvider] Response:', res)
      pushToast({ type: 'success', message: 'AI provider saved' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      console.error('[AI saveProvider] Error:', err)
      const msg = err instanceof Error ? err.message : 'Save failed'
      const status = (err as Error & { status?: number }).status
      pushToast({ type: 'error', message: status ? `(${status}) ${msg}` : msg })
    } finally {
      setLoading(false)
    }
  }

  const testApiKey = async () => {
    if (!form.apiKey || !form.baseUrl) {
      pushToast({ type: 'error', message: 'Enter API key and base URL first' })
      return
    }
    setTesting(true)
    setFetchedModels([])
    try {
      const res = await apiFetch<{ models: string[] }>('/api/ai/test-key', {
        method: 'POST',
        body: JSON.stringify({
          provider: form.provider,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          authScheme: form.authScheme,
        }),
      })
      if (res.models && res.models.length > 0) {
        setFetchedModels(res.models)
        setForm((f) => ({ ...f, defaultModel: res.models[0], models: res.models.join(',') }))
        pushToast({ type: 'success', message: `✓ API key valid! ${res.models.length} models found.` })
      } else {
        pushToast({ type: 'info', message: 'API key valid, but no models returned. Enter models manually.' })
      }
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Test failed' })
      console.error('[AI testApiKey]', err)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure AI provider</DialogTitle>
          <DialogDescription>API keys are encrypted at rest and never exposed to browsers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Provider</Label>
            <Select value={form.provider} onValueChange={(v) => {
              const defaults: Record<string, Partial<typeof form>> = {
                aevibron: { displayName: 'Aevibron Gateway', baseUrl: 'https://Aevibron-gateway.vercel.app/api/v1', authScheme: 'x-aevibron-key', defaultModel: 'aevibron-default', models: 'aevibron-default' },
                openai: { displayName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', authScheme: 'bearer', defaultModel: 'gpt-4o-mini', models: 'gpt-4o-mini,gpt-4o' },
                anthropic: { displayName: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', authScheme: 'x-api-key', defaultModel: 'claude-3-5-sonnet-20241022', models: 'claude-3-5-sonnet-20241022' },
              }
              setForm((f) => ({ ...f, provider: v, ...(defaults[v] ?? {}) }))
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aevibron">Aevibron Gateway (recommended)</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div>
            <Label>Base URL</Label>
            <Input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} />
          </div>
          <div>
            <Label>API key</Label>
            <Input type="password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder="sk-…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Auth scheme</Label>
              <Select value={form.authScheme} onValueChange={(v) => setForm((f) => ({ ...f, authScheme: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="x-aevibron-key">X-Aevibron-Key</SelectItem>
                  <SelectItem value="bearer">Authorization: Bearer</SelectItem>
                  <SelectItem value="x-api-key">X-Api-Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default model</Label>
              <Input value={form.defaultModel} onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Models</Label>
              <Button size="sm" variant="outline" type="button" onClick={() => void testApiKey()} disabled={testing || !form.apiKey}>
                {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
                Test API key
              </Button>
            </div>
            {fetchedModels.length > 0 ? (
              <Select value={form.defaultModel} onValueChange={(v) => { setForm((f) => ({ ...f, defaultModel: v })); setForm((f) => ({ ...f, models: fetchedModels.join(',') })) }}>
                <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
                <SelectContent>
                  {fetchedModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.models} onChange={(e) => setForm((f) => ({ ...f, models: e.target.value }))} placeholder="Test your API key to auto-detect models, or type comma-separated" />
            )}
            {fetchedModels.length > 0 && (
              <p className="mt-1 text-xs text-emerald-600">✓ {fetchedModels.length} models detected. Select your default above.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            <Label className="text-sm font-normal">Enabled</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccessRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    provider: 'aevibron',
    requestedAccess: 'Production API access',
    justification: '',
  })

  const submit = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ request: { id: string; status: string; emailDelivered: boolean }; message: string }>('/api/ai/access-request', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      pushToast({ type: 'success', message: data.message })
      onOpenChange(false)
      setForm({ provider: 'aevibron', requestedAccess: 'Production API access', justification: '' })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Aevibron API access</DialogTitle>
          <DialogDescription>
            Your request is persisted as a durable record and emailed to aevibron@gmail.com (if SMTP is configured). The platform operator reviews and approves it from the admin console.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Provider</Label>
            <Select value={form.provider} onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aevibron">Aevibron Gateway</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Requested access</Label>
            <Input value={form.requestedAccess} onChange={(e) => setForm((f) => ({ ...f, requestedAccess: e.target.value }))} />
          </div>
          <div>
            <Label>Justification</Label>
            <Textarea value={form.justification} onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))} rows={4} placeholder="Why do you need this access? What's your use case?" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading || !form.justification}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Avoid unused import warning
void Trash2
