import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import PageHeader from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getInitials } from '@/lib/utils'
import { useTenderReminderSettings } from '@/hooks/useTenderReminderSettings'
import {
  beginGoogleCalendarConnection,
  disconnectGoogleCalendar,
  getTenderIntegrationSettings,
  syncGoogleCalendar,
  testTenderEmailReminders,
  updateTenderIntegrationSettings,
  tenderIntegrationsEnabled,
} from '@/lib/tenderIntegrations'
import { Bell, CalendarDays, Mail, Moon, Sun, Download, Loader2, RefreshCw, Unplug, Users, Shield, User } from 'lucide-react'
import { toast } from 'sonner'

export default function Settings() {
  const { user, userDoc, isAdmin, displayName, role } = useAuth()
  const { toggleTheme, isDark } = useTheme()
  const { preferences, browserEnabled, updatePreferences, setBrowserEnabled } = useTenderReminderSettings()
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [integration, setIntegration] = useState(null)
  const [integrationBusy, setIntegrationBusy] = useState('')

  // Profile form
  const [newDisplayName, setNewDisplayName] = useState(displayName)
  const [savingName, setSavingName] = useState(false)

  // Password form
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  // Backup
  const [exportingBackup, setExportingBackup] = useState(false)

  const toggleBrowserNotifications = async (enabled) => {
    if (!enabled) {
      await setBrowserEnabled(false)
      toast.success('Browser tender notifications disabled')
      return
    }
    if (typeof Notification === 'undefined') {
      toast.error('This browser does not support notifications')
      return
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission !== 'granted') {
      await setBrowserEnabled(false)
      toast.error('Browser notification permission was not granted')
      return
    }
    await setBrowserEnabled(true)
    toast.success('Browser tender notifications enabled while the app is open')
  }

  useEffect(() => {
    setNewDisplayName(displayName)
  }, [displayName])

  useEffect(() => {
    if (isAdmin) {
      setLoadingUsers(true)
      getDocs(collection(db, 'users'))
        .then((snap) => {
          setUsers(snap.docs.filter((d) => d.id !== '__meta__').map((d) => ({ id: d.id, ...d.data() })))
        })
        .catch((err) => {
          console.error('Failed to load users:', err)
          toast.error('Failed to load users')
        })
        .finally(() => setLoadingUsers(false))
    }
  }, [isAdmin])

  useEffect(() => {
    if (!tenderIntegrationsEnabled || !user?.uid || !isAdmin) return
    getTenderIntegrationSettings().then(setIntegration).catch((error) => toast.error(error.message))
    const result = new URLSearchParams(window.location.search).get('calendar')
    if (result) {
      toast[result === 'connected' ? 'success' : 'error'](result === 'connected' ? 'Google Calendar connected' : 'Google Calendar connection was not completed')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [user?.uid, isAdmin])

  const integrationAction = async (key, action, success) => {
    setIntegrationBusy(key)
    try {
      const result = await action()
      if (result?.calendar || result?.email) setIntegration(result)
      if (success) toast.success(typeof success === 'function' ? success(result) : success)
      return result
    } catch (error) { toast.error(error.message) }
    finally { setIntegrationBusy('') }
  }

  const connectCalendar = () => integrationAction('connect', async () => {
    const result = await beginGoogleCalendarConnection()
    window.location.assign(result.authorizationUrl)
  })

  const saveIntegrationPatch = (key, patch, message) => integrationAction(key, () => updateTenderIntegrationSettings(patch), message)

  const saveName = async () => {
    if (!newDisplayName.trim()) return
    setSavingName(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), { displayName: newDisplayName.trim() })
      toast.success('Display name updated')
    } catch { toast.error('Failed to update name') } finally { setSavingName(false) }
  }

  const changePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) { toast.error('Fill in all password fields'); return }
    if (newPw.length < 10) { toast.error('New password must be at least 10 characters'); return }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return }
    setSavingPw(true)
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await updatePassword(auth.currentUser, newPw)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      toast.success('Password changed successfully')
    } catch (e) {
      toast.error(e.code === 'auth/wrong-password' ? 'Current password is incorrect' : 'Failed to change password')
    } finally { setSavingPw(false) }
  }

  const changeUserRole = async (uid, newRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole })
      setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, role: newRole } : u))
      toast.success('Role updated')
    } catch (err) {
      console.error('Failed to update role:', err)
      toast.error('Failed to update role')
    }
  }

  const doExport = async () => {
    if (!isAdmin) { toast.error('Admin only'); return }
    setExportingBackup(true)
    try {
      // Lazy-loaded so the export entrypoint is not in a viewer's bundle;
      // a non-admin session cannot call it from the JS console.
      const { exportAllDataJSON } = await import('@/lib/export')
      await exportAllDataJSON(user.email)
      toast.success('Backup download started. Check your browser downloads and verify the saved file.')
    }
    catch { toast.error('Export failed') }
    finally { setExportingBackup(false) }
  }

  return (
    <div className="page-shell-compact grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
      <PageHeader className="lg:col-span-2" title="Settings" description="Manage your profile, appearance, reminders, and supported administration settings" />

      <Card className="rounded-xl border-border/80 bg-card">
        <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-emerald-600" /> Profile & Access</CardTitle>
          <CardDescription>Update your display name. Your account role controls available actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5 sm:gap-4 sm:p-4">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarFallback className="bg-emerald-100 dark:bg-emerald-950/60 font-semibold text-emerald-700 dark:text-emerald-300">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="mt-1 text-xs capitalize">{role}</Badge>
              <p className="mt-1 text-xs text-muted-foreground">{isAdmin ? 'Administrator: can manage records and users.' : 'Viewer: read-only access to business records.'}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3.5 sm:space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  name="name"
                  autoComplete="name"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="h-10 sm:h-11"
                />
              </div>
              <Button onClick={saveName} disabled={savingName || newDisplayName === displayName} className="h-10 w-full sm:h-11 sm:w-auto">
                {savingName && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" name="email" autoComplete="email" value={user?.email || ''} disabled className="h-10 sm:h-11" />
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && tenderIntegrationsEnabled && <>
      <Card className="rounded-xl border-border/80 bg-card">
        <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> Google Calendar</CardTitle>
            <Badge variant={integration?.calendar.connected ? 'default' : 'secondary'}>{integration?.calendar.connected ? 'Connected' : 'Not connected'}</Badge>
          </div>
          <CardDescription>Keep active tender deadlines synchronized with your phone calendar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!integration ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading calendar settings…</div>
          ) : integration.calendar.connected ? (
            <>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <p className="text-sm font-medium text-foreground">{integration.calendar.accountLabel || 'Primary calendar'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Events use Asia/Karachi dates and popup reminders.</p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <div><p id="calendar-auto-sync" className="text-sm font-medium">Automatic sync</p><p className="mt-1 text-xs text-muted-foreground">New and changed tenders are reconciled automatically.</p></div>
                <Switch checked={integration.calendar.syncEnabled} disabled={!!integrationBusy} onCheckedChange={(checked) => saveIntegrationPatch('calendar-toggle', { calendar: { syncEnabled: checked } }, `Automatic Calendar sync ${checked ? 'enabled' : 'disabled'}`)} aria-labelledby="calendar-auto-sync" />
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <p className="text-sm font-medium">Calendar reminders</p>
                {Object.entries({ sevenDays: '7 days before', threeDays: '3 days before', oneDay: '1 day before', dueToday: 'On the due date' }).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-1"><span id={`calendar-${key}`} className="text-sm text-muted-foreground">{label}</span><Switch checked={integration.calendar.thresholds[key] !== false} disabled={!!integrationBusy} onCheckedChange={(checked) => saveIntegrationPatch(`calendar-${key}`, { calendar: { thresholds: { ...integration.calendar.thresholds, [key]: checked } } })} aria-labelledby={`calendar-${key}`} /></div>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="w-full sm:w-auto" disabled={!!integrationBusy} onClick={() => integrationAction('sync', () => syncGoogleCalendar(), (result) => `${result.created + result.updated} tenders synced; ${result.failed} failed`)}>{integrationBusy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync upcoming tenders</Button>
                <Button variant="ghost" className="w-full text-destructive hover:text-destructive sm:w-auto" disabled={!!integrationBusy} onClick={() => integrationAction('disconnect', async () => { await disconnectGoogleCalendar(); const next = await getTenderIntegrationSettings(); setIntegration(next); return next }, 'Google Calendar disconnected; existing events were retained')}><Unplug className="h-4 w-4" /> Disconnect</Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Button className="w-full sm:w-auto" disabled={!!integrationBusy || !integration.calendar.configured} onClick={connectCalendar}>{integrationBusy === 'connect' && <Loader2 className="h-4 w-4 animate-spin" />} Connect Google Calendar</Button>
              {!integration.calendar.configured && <p className="text-xs text-muted-foreground">Google Calendar credentials must first be added in Netlify.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/80 bg-card">
        <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-primary" /> Email Reminders</CardTitle>
          <CardDescription>Send scheduled deadline emails at 9:00 AM Pakistan time, even when the website is closed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!integration ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading email settings…</div> : <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5"><div><p id="email-enabled" className="text-sm font-medium">Automatic email reminders</p><p className="mt-1 text-xs text-muted-foreground">{integration.email.configured ? 'Sent through the configured Resend account.' : 'Resend environment variables must first be added in Netlify.'}</p></div><Switch checked={integration.email.enabled} disabled={!!integrationBusy || !integration.email.configured} onCheckedChange={(checked) => saveIntegrationPatch('email-toggle', { email: { enabled: checked } }, `Email reminders ${checked ? 'enabled' : 'disabled'}`)} aria-labelledby="email-enabled" /></div>
            <div className="space-y-1.5"><Label htmlFor="reminder-email">Reminder email address</Label><Input id="reminder-email" type="email" value={integration.email.recipient} onChange={(event) => setIntegration((current) => ({ ...current, email: { ...current.email, recipient: event.target.value } }))} onBlur={() => saveIntegrationPatch('email-address', { email: { recipient: integration.email.recipient } }, 'Reminder email saved')} /></div>
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3.5"><p className="text-sm font-medium">Email schedule</p>{Object.entries({ sevenDays: '7 days before', threeDays: '3 days before', oneDay: '1 day before', dueToday: 'On the due date' }).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 py-1"><span id={`email-${key}`} className="text-sm text-muted-foreground">{label}</span><Switch checked={integration.email.thresholds[key] !== false} disabled={!!integrationBusy} onCheckedChange={(checked) => saveIntegrationPatch(`email-${key}`, { email: { thresholds: { ...integration.email.thresholds, [key]: checked } } })} aria-labelledby={`email-${key}`} /></div>)}</div>
            {isAdmin && <Button variant="outline" className="w-full sm:w-auto" disabled={!!integrationBusy || !integration.email.enabled} onClick={() => integrationAction('email-test', testTenderEmailReminders, (result) => `${result.sent} email reminder${result.sent === 1 ? '' : 's'} sent; ${result.duplicate} already delivered`)}>{integrationBusy === 'email-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Process due reminders now</Button>}
          </>}
        </CardContent>
      </Card>
      </>}

      {!tenderIntegrationsEnabled && <Card className="rounded-xl border-border/80 bg-card">
        <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> Integrations <Badge variant="secondary">Inactive</Badge></CardTitle>
          <CardDescription>Calendar and email synchronization are not active in this deployment.</CardDescription>
        </CardHeader>
      </Card>}

      <Card className="rounded-xl border-border/80 bg-card">
        <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4 text-primary" /> Tender Reminders</CardTitle>
          <CardDescription>Choose when submission-deadline reminders should appear.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ['sevenDays', '7 days before'],
            ['threeDays', '3 days before'],
            ['oneDay', '1 day before'],
            ['dueToday', 'On the due date'],
            ['overdue', 'When overdue'],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
              <span id={`reminder-${key}`} className="text-sm font-medium text-foreground">{label}</span>
              <Switch checked={preferences[key] !== false} onCheckedChange={(checked) => updatePreferences({ [key]: checked })} aria-labelledby={`reminder-${key}`} />
            </div>
          ))}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
            <div>
              <p id="browser-reminder-label" className="text-sm font-medium text-foreground">Browser notifications</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Optional alerts while this website is open. Closed-browser delivery requires a push service.</p>
            </div>
            <Switch checked={browserEnabled} onCheckedChange={toggleBrowserNotifications} aria-labelledby="browser-reminder-label" />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/80 bg-card">
        <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Keep your account secure with a strong password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3.5 sm:space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="h-10 sm:h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Minimum 10 characters"
              className="h-10 sm:h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">
              Confirm New Password
              {confirmPw && newPw && (
                <span className={`ml-2 text-xs font-normal ${newPw === confirmPw ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {newPw === confirmPw ? 'match' : 'no match'}
                </span>
              )}
            </Label>
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Re-enter new password"
              className="h-10 sm:h-11"
            />
          </div>
          <Button onClick={changePassword} disabled={savingPw} className="h-10 w-full sm:h-11 sm:w-auto">
            {savingPw && <Loader2 className="h-4 w-4 animate-spin" />} Update Password
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/80 bg-card">
        <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose the visual theme for your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5 sm:gap-4 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p id="dark-mode-label" className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Toggle between light and dark theme</p>
              </div>
            </div>
            <Switch checked={isDark} onCheckedChange={toggleTheme} aria-labelledby="dark-mode-label" />
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="rounded-xl border-border/80 bg-card">
          <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base"><Download className="h-4 w-4 text-emerald-600" /> Data Backup</CardTitle>
            <CardDescription>Export Firestore business records and a storage-file manifest. File contents and user accounts are not included.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={doExport} disabled={exportingBackup} variant="outline" className="h-10 w-full sm:h-11 sm:w-auto">
              {exportingBackup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Business Data (JSON)
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="rounded-xl border-border/80 bg-card lg:col-span-2">
          <CardHeader className="space-y-1.5 pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-emerald-600" /> User Management</CardTitle>
            <CardDescription>Manage roles for all users in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 p-3.5 text-sm text-muted-foreground sm:p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading users...</div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div key={u.id} className="rounded-xl border border-border/80 bg-background p-3.5 sm:p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarFallback className="bg-emerald-100 dark:bg-emerald-950/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{getInitials(u.displayName || u.email || '')}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{u.displayName || u.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Shield className="h-4 w-4" />
                        <span>Role</span>
                      </div>
                      {u.id === user.uid ? (
                        <Badge variant="default" className="w-fit text-xs">You (Admin)</Badge>
                      ) : (
                        <Select value={u.role || 'viewer'} onValueChange={(v) => changeUserRole(u.id, v)}>
                          <SelectTrigger className="h-10 w-full text-sm sm:w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
