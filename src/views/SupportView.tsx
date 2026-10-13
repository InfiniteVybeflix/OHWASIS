'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageCircle, Plus, Send, Clock, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'

interface TicketDTO {
  id: string
  category: string
  customCategory: string | null
  subject: string
  status: string
  priority: string
  tenant: { id: string; handle: string; displayName: string } | null
  lastMessage: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

interface MessageDTO {
  id: string
  senderId: string
  senderName: string
  senderRole: string
  body: string
  isRead: boolean
  createdAt: string
}

const CATEGORIES = [
  { value: 'bug_report', label: 'Bug Report' },
  { value: 'product_request', label: 'Product Request' },
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'default' },
  pending_response: { label: 'Pending Response', color: 'secondary' },
  resolved: { label: 'Resolved', color: 'outline' },
  closed: { label: 'Closed', color: 'secondary' },
}

export function SupportView() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [tickets, setTickets] = useState<TicketDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageDTO[]>([])
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ tickets: TicketDTO[] }>('/api/support/tickets', { tenantHandle: null })
      setTickets(data.tickets)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const loadMessages = async (ticketId: string) => {
    setSelectedTicket(ticketId)
    try {
      const data = await apiFetch<{ ticket: { messages: MessageDTO[] } }>(`/api/support/tickets/${ticketId}`, { tenantHandle: null })
      setMessages(data.ticket.messages)
    } catch {
      // ignore
    }
  }

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return
    setSendingReply(true)
    try {
      await apiFetch(`/api/support/tickets/${selectedTicket}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: replyText }),
        tenantHandle: null,
      })
      setReplyText('')
      await loadMessages(selectedTicket)
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send' })
    } finally {
      setSendingReply(false)
    }
  }

  const closeTicket = async (ticketId: string) => {
    try {
      await apiFetch(`/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' }),
        tenantHandle: null,
      })
      pushToast({ type: 'success', message: 'Ticket closed' })
      void load()
      setSelectedTicket(null)
    } catch {
      pushToast({ type: 'error', message: 'Failed to close' })
    }
  }

  if (!session.user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Sign in to access support.</p>
        <Button className="mt-4" onClick={() => setAuthModal('login')}>Sign in</Button>
      </div>
    )
  }

  const isAdmin = session.isPlatformOperator

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 pb-20 sm:pb-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'Manage support tickets from customers and business owners.' : 'Get help from our support team.'}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New ticket
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-2 h-8 w-8" />
            No support tickets yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => {
            const status = STATUS_LABELS[t.status] ?? { label: t.status, color: 'secondary' }
            return (
              <li key={t.id}>
                <Card className="cursor-pointer hover:shadow-sm" onClick={() => void loadMessages(t.id)}>
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.subject}</span>
                        <Badge variant={status.color as 'default' | 'secondary' | 'outline'} className="text-[10px]">{status.label}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.tenant ? `${t.tenant.displayName} · ` : ''}{t.category.replace('_', ' ')} · {t.messageCount} message{t.messageCount === 1 ? '' : 's'}
                      </div>
                      {t.lastMessage && <div className="mt-0.5 truncate text-xs italic opacity-70">&quot;{t.lastMessage}&quot;</div>}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{new Date(t.updatedAt).toLocaleDateString()}</div>
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {/* Create ticket dialog */}
      <CreateTicketDialog open={showCreate} onOpenChange={setShowCreate} onCreated={() => { void load() }} />

      {/* Ticket detail dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(o) => { if (!o) setSelectedTicket(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tickets.find((t) => t.id === selectedTicket)?.subject}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{tickets.find((t) => t.id === selectedTicket)?.category.replace('_', ' ')}</Badge>
              <Badge variant="secondary" className="text-[10px]">{STATUS_LABELS[tickets.find((t) => t.id === selectedTicket)?.status ?? 'open']?.label}</Badge>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto rounded border p-2">
              {messages.map((m) => (
                <div key={m.id} className={`text-xs ${m.senderId === session.user?.id ? 'text-right' : ''}`}>
                  <div className={`inline-block max-w-[85%] rounded p-2 ${m.senderId === session.user?.id ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {m.senderName} ({m.senderRole}) · {new Date(m.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                placeholder="Type your reply…"
                disabled={sendingReply}
              />
              <Button onClick={() => void sendReply()} disabled={sendingReply || !replyText.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => selectedTicket && void closeTicket(selectedTicket)}>
              Close ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateTicketDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const activeTenantHandle = useOhwasisStore((s) => s.activeTenantHandle)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    category: 'enquiry' as string,
    customCategory: '',
    subject: '',
    message: '',
    includeTenant: false,
  })

  const submit = async () => {
    if (!form.subject || !form.message) {
      pushToast({ type: 'error', message: 'Please fill in subject and message' })
      return
    }
    setLoading(true)
    try {
      await apiFetch('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          customCategory: form.category === 'custom' ? form.customCategory : undefined,
          subject: form.subject,
          message: form.message,
          tenantHandle: form.includeTenant && activeTenantHandle ? activeTenantHandle : undefined,
        }),
        tenantHandle: null,
      })
      pushToast({ type: 'success', message: 'Ticket created. Our team will respond shortly.' })
      onCreated()
      onOpenChange(false)
      setForm({ category: 'enquiry', customCategory: '', subject: '', message: '', includeTenant: false })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.category === 'custom' && (
            <div>
              <Label>Custom category</Label>
              <Input value={form.customCategory} onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))} placeholder="Enter your own category" />
            </div>
          )}
          <div>
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Brief summary of your issue" />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={4} placeholder="Describe your issue in detail…" />
          </div>
          {activeTenantHandle && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.includeTenant} onChange={(e) => setForm((f) => ({ ...f, includeTenant: e.target.checked }))} />
              Link this ticket to my active business
            </label>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading}>
            {loading ? 'Sending…' : 'Create ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
