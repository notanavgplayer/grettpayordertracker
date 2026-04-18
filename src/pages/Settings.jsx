import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { exportAllDataJSON } from '@/lib/export'
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
import { Moon, Sun, Download, Loader2, Users, Shield, User } from 'lucide-react'
import { toast } from 'sonner'

export default function Settings() {
  const { user, userDoc, isAdmin, displayName, role } = useAuth()
  const { toggleTheme, isDark } = useTheme()
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

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

  useEffect(() => {
    if (isAdmin) {
      setLoadingUsers(true)
      getDocs(collection(db, 'users')).then((snap) => {
        setUsers(snap.docs.filter((d) => d.id !== '__meta__').map((d) => ({ id: d.id, ...d.data() })))
        setLoadingUsers(false)
      })
    }
  }, [isAdmin])

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
    await updateDoc(doc(db, 'users', uid), { role: newRole })
    setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, role: newRole } : u))
    toast.success('Role updated')
  }

  const doExport = async () => {
    setExportingBackup(true)
    try { await exportAllDataJSON(user.email); toast.success('Backup downloaded') }
    catch { toast.error('Export failed') }
    finally { setExportingBackup(false) }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader title="Settings" description="Manage your account and application settings" />

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" /> Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="mt-1 text-xs capitalize">{role}</Badge>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  name="name"
                  autoComplete="name"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                />
              </div>
              <Button onClick={saveName} disabled={savingName || newDisplayName === displayName} size="sm">
                {savingName && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" name="email" autoComplete="email" value={user?.email || ''} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
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
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">
              Confirm New Password
              {confirmPw && newPw && (
                <span className={`ml-2 text-xs font-normal ${newPw === confirmPw ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {newPw === confirmPw ? '✓ match' : '✗ no match'}
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
            />
          </div>
          <Button onClick={changePassword} disabled={savingPw} size="sm">
            {savingPw && <Loader2 className="h-4 w-4 animate-spin" />} Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="h-5 w-5 text-muted-foreground" /> : <Sun className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Toggle between light and dark theme</p>
              </div>
            </div>
            <Switch checked={isDark} onCheckedChange={toggleTheme} />
          </div>
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Data Backup</CardTitle>
          <CardDescription>Export all your data as a JSON backup file</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={doExport} disabled={exportingBackup} variant="outline">
            {exportingBackup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Full Backup (JSON)
          </Button>
        </CardContent>
      </Card>

      {/* User Management (Admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> User Management</CardTitle>
            <CardDescription>Manage roles for all users in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading users…</div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(u.displayName || u.email || '')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.displayName || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {u.id === user.uid ? (
                      <Badge variant="default" className="text-xs flex-shrink-0">You (Admin)</Badge>
                    ) : (
                      <Select value={u.role || 'viewer'} onValueChange={(v) => changeUserRole(u.id, v)}>
                        <SelectTrigger className="w-24 h-7 text-xs flex-shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
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
