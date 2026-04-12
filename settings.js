import { auth, db } from "./firebase.js";
import { onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '/'; return; }

  document.getElementById('settingsEmail').textContent = user.email || '—';
  document.getElementById('settingsCreated').textContent = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
  document.getElementById('settingsLastLogin').textContent = user.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—';

  // Load display name from users doc
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().displayName) {
      document.getElementById('displayName').value = userDoc.data().displayName;
    }
  } catch(e) { console.warn('Could not load display name:', e); }

  // Show user management for admins
  window.addEventListener('roleReady', () => {
    if (window.__userRole === 'admin') {
      document.getElementById('userMgmtSection').style.display = 'block';
      loadUsers();
    }
  });
  // In case roleReady already fired
  if (window.__userRole === 'admin') {
    document.getElementById('userMgmtSection').style.display = 'block';
    loadUsers();
  }
});

// ── Change Password ──────────────────────────────────────────────────────────
window.changePassword = async function() {
  const currentPw = document.getElementById('currentPassword').value;
  const newPw     = document.getElementById('newPassword').value;
  const confirm   = document.getElementById('confirmPassword').value;
  const msgEl     = document.getElementById('pwMsg');
  const btn       = document.getElementById('changePwBtn');

  msgEl.className = 'settings-msg';
  msgEl.style.display = 'none';

  if (!currentPw) {
    showMsg(msgEl, 'error', 'Please enter your current password.');
    return;
  }
  if (!newPw || newPw.length < 6) {
    showMsg(msgEl, 'error', 'New password must be at least 6 characters.');
    return;
  }
  if (newPw !== confirm) {
    showMsg(msgEl, 'error', 'Passwords do not match.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Updating…';
  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPw);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPw);
    showMsg(msgEl, 'success', 'Password updated successfully.');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch(e) {
    console.error('Password change error:', e);
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
      showMsg(msgEl, 'error', 'Current password is incorrect.');
    } else if (e.code === 'auth/requires-recent-login') {
      showMsg(msgEl, 'error', 'Please sign out and sign in again before changing your password.');
    } else {
      showMsg(msgEl, 'error', 'Failed to update password. ' + (e.message || ''));
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Update Password';
  }
};

// ── Save Display Name ────────────────────────────────────────────────────────
window.saveDisplayName = async function() {
  const name  = document.getElementById('displayName').value.trim();
  const msgEl = document.getElementById('nameMsg');
  const btn   = document.getElementById('saveNameBtn');

  msgEl.className = 'settings-msg';
  msgEl.style.display = 'none';

  if (!name) {
    showMsg(msgEl, 'error', 'Please enter a name.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const uid = auth.currentUser.uid;
    // Use setDoc with merge:true — works whether doc exists or not
    // Only updates displayName, never touches role (safe per Firestore rules)
    await setDoc(doc(db, "users", uid), {
      displayName: name,
      email: auth.currentUser.email,
    }, { merge: true });
    showMsg(msgEl, 'success', `Display name updated to "${name}".`);
    // Update sidebar immediately
    const emailEl = document.querySelector('.sidebar-user-email');
    const avatarEl = document.querySelector('.sidebar-avatar');
    if (emailEl) emailEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name[0].toUpperCase();
  } catch(e) {
    console.error('Display name error:', e);
    showMsg(msgEl, 'error', 'Failed to save. ' + (e.message || ''));
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
};

// ── Export All Data ──────────────────────────────────────────────────────────
window.exportAllData = async function() {
  const msgEl = document.getElementById('exportMsg');
  msgEl.className = 'settings-msg';
  msgEl.style.display = 'none';

  try {
    const collections = ['tenders','payOrders','todos','notes','expenses','contacts','checklistTemplates','tenderFees','activityLog'];
    const data = {};

    const results = await Promise.allSettled(
      collections.map(name => getDocs(collection(db, name)))
    );

    collections.forEach((name, i) => {
      if (results[i].status === 'fulfilled') {
        data[name] = results[i].value.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        data[name] = [];
      }
    });

    data._exportedAt = new Date().toISOString();
    data._exportedBy = auth.currentUser?.email || 'unknown';

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `grett-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showMsg(msgEl, 'success', 'Backup downloaded successfully.');
  } catch(e) {
    console.error('Export error:', e);
    showMsg(msgEl, 'error', 'Failed to export data. Check your connection.');
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function showMsg(el, type, text) {
  el.textContent = text;
  el.className = `settings-msg ${type}`;
}

// ── User Management ──────────────────────────────────────────────────────────
let allUsers = [];

async function loadUsers() {
  const el = document.getElementById('userList');
  try {
    const snap = await getDocs(collection(db, "users"));
    allUsers = snap.docs
      .filter(d => d.id !== '__meta__')
      .map(d => ({ id: d.id, ...d.data() }));

    if (!allUsers.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--muted)">No users found. The current user will be auto-registered on next login.</div>';
      return;
    }

    const currentUid = auth.currentUser?.uid;
    el.innerHTML = allUsers.map(u => {
      const isSelf = u.id === currentUid;
      const initial = (u.email || '?')[0].toUpperCase();
      return `<div class="user-row">
        <div class="user-avatar">${initial}</div>
        <div class="user-info">
          <div class="user-email">${esc(u.email || 'Unknown')}${isSelf ? ' <span style="font-size:10px;color:var(--muted)">(you)</span>' : ''}</div>
          <div class="user-meta">Added ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</div>
        </div>
        ${isSelf
          ? `<span class="user-role-badge admin">Admin</span>`
          : `<select class="user-role-select" onchange="changeUserRole('${u.id}', this.value)">
              <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
              <option value="viewer" ${u.role!=='admin'?'selected':''}>Viewer</option>
            </select>`
        }
      </div>`;
    }).join('');
  } catch(e) {
    console.error('Failed to load users:', e);
    el.innerHTML = '<div style="font-size:12px;color:var(--red-fg)">Failed to load users.</div>';
  }
}

window.changeUserRole = async function(uid, newRole) {
  const msgEl = document.getElementById('userMgmtMsg');
  msgEl.className = 'settings-msg';
  msgEl.style.display = 'none';

  try {
    await updateDoc(doc(db, "users", uid), { role: newRole });
    const user = allUsers.find(u => u.id === uid);
    if (user) user.role = newRole;
    showMsg(msgEl, 'success', `Role updated to ${newRole} for ${user?.email || uid}.`);
  } catch(e) {
    console.error('Role update error:', e);
    showMsg(msgEl, 'error', 'Failed to update role. ' + (e.message || ''));
    loadUsers(); // re-render to revert select
  }
};

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
