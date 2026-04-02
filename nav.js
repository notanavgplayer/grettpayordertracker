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
  // Inject responsive CSS
  if (!document.querySelector('link[href*="responsive.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'responsive.css';
    document.head.appendChild(link);
  }

  const isMobile = window.innerWidth <= 640;
  const isTablet = window.innerWidth <= 1024 && window.innerWidth > 640;
  const sidebarWidth = isTablet ? '200px' : '220px';
  const contentMargin = isMobile ? '0' : (isTablet ? '200px' : '220px');

  const style = document.createElement('style');
  style.id = 'nav-styles';
  style.textContent = `
    body { display: flex; min-height: 100vh; }

    .sidebar {
      width: ${isMobile ? '0' : sidebarWidth}; flex-shrink: 0;
      background: #0f2a4a;
      display: ${isMobile ? 'none' : 'flex'}; flex-direction: column;
      position: fixed; top: 0; left: 0; bottom: 0;
      z-index: 100;
      transition: transform 0.25s ease;
    }

    .sidebar-brand {
      display: flex; align-items: center; gap: 10px;
      padding: 20px 16px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .sidebar-logo {
      width: 36px; height: 36px; flex-shrink: 0;
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .sidebar-logo svg { width: 20px; height: 20px; }
    .sidebar-brand-text strong {
      display: block; font-size: 13px; font-weight: 600;
      color: #fff; line-height: 1.2;
    }
    .sidebar-brand-text span {
      font-size: 11px; color: rgba(255,255,255,0.45);
    }

    .sidebar-section-label {
      font-size: 10px; font-weight: 700;
      letter-spacing: 0.1em; color: rgba(255,255,255,0.3);
      padding: 20px 16px 8px;
    }

    .sidebar-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 8px; flex: 1; }

    .nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px;
      border-radius: 8px;
      color: rgba(255,255,255,0.55);
      text-decoration: none;
      font-size: 13px; font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .nav-item:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); }
    .nav-item.active { background: rgba(255,255,255,0.12); color: #fff; }
    .nav-item.active .nav-item-icon { color: #e8940a; }
    .nav-item-icon { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .nav-item-icon svg { width: 18px; height: 18px; }

    .sidebar-footer {
      padding: 12px 8px;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex; align-items: center; gap: 8px;
    }
    .sidebar-user { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
    .sidebar-avatar {
      width: 30px; height: 30px; flex-shrink: 0;
      background: #e8940a; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #0f2a4a;
    }
    .sidebar-user-info { min-width: 0; }
    .sidebar-user-email {
      display: block; font-size: 11px; color: rgba(255,255,255,0.7);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 120px;
    }
    .sidebar-user-role { font-size: 10px; color: rgba(255,255,255,0.35); }
    .sidebar-logout {
      width: 30px; height: 30px; flex-shrink: 0;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.5); transition: all 0.15s;
    }
    .sidebar-logout:hover { background: rgba(232,78,60,0.2); border-color: rgba(232,78,60,0.4); color: #ff6b6b; }

    .page-content {
      margin-left: ${contentMargin};
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
      ${isMobile ? 'padding-bottom: 72px;' : ''}
    }

    /* Mobile toggle */
    .sidebar-toggle {
      display: none;
      position: fixed; top: 12px; left: 12px;
      z-index: 200;
      width: 38px; height: 38px;
      background: #0f2a4a; border: none;
      border-radius: 8px; cursor: pointer;
      color: #fff; align-items: center; justify-content: center;
    }
    .sidebar-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.5); z-index: 99;
    }

    @media (max-width: 1024px) {
      .sidebar { width: 200px; }
      .page-content { margin-left: 200px; }
    }

    @media (max-width: 640px) {
      .sidebar { display: none !important; }
      .sidebar-toggle { display: none !important; }
      .page-content { margin-left: 0 !important; padding-bottom: 72px !important; padding-top: 0 !important; }
    }
  `;
  document.head.appendChild(style);
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

  // Inject bottom nav on mobile
  if (window.innerWidth <= 640) {
    import('./bottom-nav.js').then(m => {
      m.injectBottomNav(document.body.dataset.page || '');
    });
  }
});
