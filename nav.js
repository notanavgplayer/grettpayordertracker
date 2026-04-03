// nav.js — shared sidebar, injected into every page
// Usage: <script type="module" src="nav.js"></script>
// Add data-page="pageid" to <body> to highlight the active nav item

import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Global role — other scripts can read window.__userRole
window.__userRole = 'viewer'; // default to viewer until loaded

const NAV_ITEMS = [
  {
    id: 'home',
    label: 'Home',
    href: 'home.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M7 18v-6h6v6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: 'calendar.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M3 8h14M7 2v4M13 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="7" cy="12" r="1" fill="currentColor"/>
      <circle cx="10" cy="12" r="1" fill="currentColor"/>
      <circle cx="13" cy="12" r="1" fill="currentColor"/>
    </svg>`
  },
  {
    id: 'payorders',
    label: 'Pay Orders',
    href: 'dashboard.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'tenders',
    label: 'Tenders',
    href: 'tenders.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3h8l4 4v10H4V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M12 3v4h4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'notes',
    label: 'Notes',
    href: 'notes.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4h12v9l-4 4H4V4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M12 13v4l4-4h-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M7 8h6M7 11h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'todo',
    label: 'To-Do',
    href: 'todo.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5h9M8 10h9M8 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M3 5.5l1.5 1.5L7 4M3 10.5l1.5 1.5L7 9M3 15.5l1.5 1.5L7 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  },
  {
    id: 'expenses',
    label: 'Expenses',
    href: 'expenses.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M2 9h16" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="6" cy="13" r="1" fill="currentColor"/>
      <path d="M9 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: 'contacts.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M3 18c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'templates',
    label: 'Templates',
    href: 'templates.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M7 6h6M7 10h6M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M13 13l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'activity',
    label: 'Activity',
    href: 'activity.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/>
      <path d="M10 6v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'fees',
    label: 'Tender Fees',
    href: 'fees.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/>
      <path d="M10 7v1.5M10 11.5V13M8 9a2 2 0 114 0c0 1-1 1.5-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'reports',
    label: 'Reports',
    href: 'reports.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 15V9M7 15V5M11 15V8M15 15V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'backup',
    label: 'Backup',
    href: 'backup.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M3 15v1a1 1 0 001 1h12a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'settings',
    label: 'Settings',
    href: 'settings.html',
    icon: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.5"/>
      <path d="M10 2v2M10 16v2M3.5 5.5l1.4 1.4M15.1 15.1l1.4 1.4M2 10h2M16 10h2M3.5 14.5l1.4-1.4M15.1 4.9l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
];

function buildSidebar(userEmail) {
  const currentPage = document.body.dataset.page || '';

  const items = NAV_ITEMS.map(item => `
    <a href="${item.href}" class="nav-item ${item.id === currentPage ? 'active' : ''}" data-id="${item.id}">
      <span class="nav-item-icon">${item.icon}</span>
      <span class="nav-item-label">${item.label}</span>
    </a>
  `).join('');

  return `
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-logo">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 2L3 8v2h2v10h4v-5h6v5h4V10h2V8L12 2z" fill="#e8940a"/></svg>
      </div>
      <div class="sidebar-brand-text">
        <strong>Grett Engineering</strong>
        <span>Solutions</span>
      </div>
    </div>

    <div class="sidebar-section-label">WORKSPACE</div>
    <nav class="sidebar-nav">
      ${items}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar">${userEmail ? userEmail[0].toUpperCase() : 'G'}</div>
        <div class="sidebar-user-info">
          <span class="sidebar-user-email">${userEmail || ''}</span>
          <span class="sidebar-user-role">Administrator</span>
        </div>
      </div>
      <button class="sidebar-logout" id="sidebarLogout" title="Sign Out">
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3M13 14l4-4-4-4M17 10H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </aside>

  <button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()">
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>

  <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>
  `;
}

function injectStyles() {
  if (document.getElementById('nav-styles')) return;
  // All layout CSS should be in <head> — these are safety fallbacks
  if (!document.querySelector('link[href*="layout.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'layout.css';
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[href*="responsive.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'responsive.css';
    document.head.appendChild(link);
  }
  // Marker so we don't run twice
  const marker = document.createElement('meta');
  marker.id = 'nav-styles';
  document.head.appendChild(marker);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
window.toggleSidebar = toggleSidebar;
window.closeSidebar  = closeSidebar;

// Ctrl+K or Cmd+K opens search from anywhere
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    window.location.href = 'home.html';
  }
});

// Auth guard + inject
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }

  // Fetch user role from Firestore
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      window.__userRole = userDoc.data().role || 'viewer';
    } else {
      // First user ever → auto-assign as admin and create doc
      // Subsequent users who don't have a doc → viewer by default
      const usersSnap = await getDoc(doc(db, "users", "_appMeta"));
      const isFirstUser = !usersSnap.exists();
      const role = isFirstUser ? 'admin' : 'viewer';
      try {
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          role: role,
          createdAt: new Date().toISOString()
        });
        if (isFirstUser) {
          await setDoc(doc(db, "users", "_appMeta"), { initialized: true });
        }
        window.__userRole = role;
      } catch(e) {
        // If write fails (viewer can't write users), stay as viewer
        console.warn('Could not create user doc:', e);
        window.__userRole = 'viewer';
      }
    }
  } catch(e) {
    console.warn('Role fetch failed, defaulting to admin for backwards compat:', e);
    // If users collection doesn't exist yet, default to admin (backwards compat)
    window.__userRole = 'admin';
  }

  // Store display name globally
  window.__displayName = '';
  try {
    const userDocSnap = await getDoc(doc(db, "users", user.uid));
    if (userDocSnap.exists() && userDocSnap.data().displayName) {
      window.__displayName = userDocSnap.data().displayName;
    }
  } catch(e) { /* ignore */ }

  injectStyles();

  const container = document.createElement('div');
  container.innerHTML = buildSidebar(user.email);

  const body = document.body;
  const firstChild = body.firstChild;
  while (container.firstChild) {
    body.insertBefore(container.firstChild, firstChild);
  }

  // Wrap existing content in .page-content if not already
  const pageContent = document.getElementById('page-content');
  if (pageContent) pageContent.classList.add('page-content');

  // Update sidebar with display name if available
  if (window.__displayName) {
    const emailEl = document.querySelector('.sidebar-user-email');
    if (emailEl) emailEl.textContent = window.__displayName;
    const avatarEl = document.querySelector('.sidebar-avatar');
    if (avatarEl) avatarEl.textContent = window.__displayName[0].toUpperCase();
  }

  // Update sidebar role label
  const roleEl = document.querySelector('.sidebar-user-role');
  if (roleEl) roleEl.textContent = window.__userRole === 'admin' ? 'Administrator' : 'Viewer';

  // Hide write-action elements for viewers
  if (window.__userRole !== 'admin') {
    document.body.classList.add('role-viewer');
  }

  // Dispatch event so page scripts know the role is ready
  window.dispatchEvent(new CustomEvent('roleReady', { detail: { role: window.__userRole } }));

  document.getElementById('sidebarLogout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = 'index.html');
  });
});
