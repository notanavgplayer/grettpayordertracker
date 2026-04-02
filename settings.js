import { auth, db } from "./firebase.js";
import { onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = 'index.html'; return; }

  document.getElementById('settingsEmail').textContent = user.email || '—';
  document.getElementById('settingsCreated').textContent = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
  document.getElementById('settingsLastLogin').textContent = user.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—';
});

// ── Change Password ──────────────────────────────────────────────────────────
window.changePassword = async function() {
  const newPw   = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  const msgEl   = document.getElementById('pwMsg');
  const btn     = document.getElementById('changePwBtn');

  msgEl.className = 'settings-msg';
  msgEl.style.display = 'none';

  if (!newPw || newPw.length < 6) {
    showMsg(msgEl, 'error', 'Password must be at least 6 characters.');
    return;
  }
  if (newPw !== confirm) {
    showMsg(msgEl, 'error', 'Passwords do not match.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Updating…';
  try {
    await updatePassword(auth.currentUser, newPw);
    showMsg(msgEl, 'success', 'Password updated successfully.');
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch(e) {
    console.error('Password change error:', e);
    if (e.code === 'auth/requires-recent-login') {
      showMsg(msgEl, 'error', 'Please sign out and sign in again before changing your password.');
    } else {
      showMsg(msgEl, 'error', 'Failed to update password. ' + (e.message || ''));
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Update Password';
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

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
