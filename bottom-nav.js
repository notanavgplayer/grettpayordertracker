// bottom-nav.js — Mobile bottom navigation bar
// Injected automatically on screens < 640px

export function injectBottomNav(currentPage) {
  // Primary 4 nav items always visible
  const PRIMARY = [
    { id:'home',      label:'Home',     href:'home.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 18v-6h6v6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>` },
    { id:'tenders',   label:'Tenders',  href:'tenders.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><path d="M4 3h8l4 4v10H4V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v4h4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>` },
    { id:'payorders', label:'Pay Orders',href:'dashboard.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'todo',      label:'To-Do',    href:'todo.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><path d="M8 5h9M8 10h9M8 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3 5.5l1.5 1.5L7 4M3 10.5l1.5 1.5L7 9M3 15.5l1.5 1.5L7 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  ];

  // All remaining items in "More" menu
  const MORE = [
    { id:'notes',     label:'Notes',     href:'notes.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><path d="M4 4h12v9l-4 4H4V4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>` },
    { id:'expenses',  label:'Expenses',  href:'expenses.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 9h16" stroke="currentColor" stroke-width="1.5"/></svg>` },
    { id:'contacts',  label:'Contacts',  href:'contacts.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 18c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'calendar',  label:'Calendar',  href:'calendar.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 2v4M13 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'fees',      label:'Fees',      href:'fees.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 7v1.5M10 11.5V13M8 9a2 2 0 114 0c0 1-1 1.5-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'reports',   label:'Reports',   href:'reports.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><path d="M3 15V9M7 15V5M11 15V8M15 15V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'activity',  label:'Activity',  href:'activity.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'templates', label:'Templates', href:'templates.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 6h6M7 10h6M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'backup',    label:'Backup',    href:'backup.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 15v1a1 1 0 001 1h12a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    { id:'settings',  label:'Settings',  href:'settings.html',
      icon:`<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M10 2v2M10 16v2M3.5 5.5l1.4 1.4M15.1 15.1l1.4 1.4M2 10h2M16 10h2M3.5 14.5l1.4-1.4M15.1 4.9l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
  ];

  // Check if current page is in More
  const moreActive = MORE.some(m => m.id === currentPage);

  // Primary items HTML
  const primaryHtml = PRIMARY.map(item => `
    <a href="${item.href}" class="bottom-nav-item ${item.id === currentPage ? 'active' : ''}">
      ${item.icon}
      <span>${item.label}</span>
    </a>`).join('');

  // More button
  const moreBtn = `
    <button class="bottom-nav-item ${moreActive ? 'active' : ''}" onclick="toggleMoreMenu()" id="moreNavBtn">
      <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
        <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
        <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
        <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
      </svg>
      <span>More</span>
    </button>`;

  // More menu items
  const moreItemsHtml = MORE.map(item => `
    <a href="${item.href}" class="bottom-nav-more-item ${item.id === currentPage ? 'active' : ''}">
      ${item.icon}
      <span>${item.label}</span>
    </a>`).join('');

  // Inject bottom nav
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.id = 'bottomNav';
  nav.innerHTML = primaryHtml + moreBtn;
  document.body.appendChild(nav);

  // Inject more overlay
  const overlay = document.createElement('div');
  overlay.className = 'bottom-nav-more-overlay';
  overlay.id = 'moreOverlay';
  overlay.onclick = () => closeMoreMenu();
  document.body.appendChild(overlay);

  // Inject more panel
  const panel = document.createElement('div');
  panel.className = 'bottom-nav-more-panel';
  panel.id = 'morePanel';
  panel.innerHTML = moreItemsHtml;
  document.body.appendChild(panel);

  window.toggleMoreMenu = function() {
    const open = overlay.classList.contains('open');
    if (open) closeMoreMenu(); else openMoreMenu();
  };
  window.openMoreMenu = function() {
    overlay.classList.add('open');
    panel.style.display = 'grid';
    document.getElementById('moreNavBtn').style.color = '#e8940a';
  };
  window.closeMoreMenu = function() {
    overlay.classList.remove('open');
    panel.style.display = 'none';
    if (!moreActive) document.getElementById('moreNavBtn').style.color = '';
  };
}
