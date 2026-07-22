// Global behaviors shared across all pages: logout, "add to cart" buttons,
// and the mobile bottom tab bar (active state, account sheet, cart badge).

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    });
  }

  document.querySelectorAll('[data-add-cart]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const itemType = btn.dataset.type;
      const itemId = btn.dataset.id;
      const accessType = btn.dataset.access;

      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemType, itemId, accessType })
      });
      const data = await res.json();
      const msg = document.getElementById('addCartMsg');
      if (msg) msg.textContent = data.success ? 'Added to cart!' : (data.message || 'Could not add to cart.');
      refreshMobileCartBadge();
    });
  });

  // --- Mobile bottom tab bar: highlight the active tab based on the current path ---
  const path = window.location.pathname;
  document.querySelectorAll('.mobile-tab[data-path]').forEach((tab) => {
    const tabPath = tab.dataset.path;
    if (path === tabPath || (tabPath !== '/' && path.startsWith(tabPath))) {
      tab.classList.add('active');
    }
  });

  // --- Mobile account bottom sheet ---
  const accountBtn = document.getElementById('mobileAccountBtn');
  const sheet = document.getElementById('mobileAccountSheet');
  const closeBtn = document.getElementById('mobileAccountClose');
  if (accountBtn && sheet) {
    accountBtn.classList.toggle('active', path.startsWith('/library') || path.startsWith('/admin'));
    accountBtn.addEventListener('click', () => sheet.classList.add('open'));
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.remove('open'); });
    if (closeBtn) closeBtn.addEventListener('click', () => sheet.classList.remove('open'));
  }
  const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    });
  }

  refreshMobileCartBadge();
});

// Shows how many items are in the cart as a small badge on the mobile Cart tab.
async function refreshMobileCartBadge() {
  const cartTab = document.querySelector('.mobile-tab[data-path="/cart"]');
  if (!cartTab || !document.getElementById('logoutBtn')) return; // only fetch when logged in
  try {
    const res = await fetch('/api/cart', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    let badge = cartTab.querySelector('.cart-count-badge');
    if (data.items.length > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'cart-count-badge';
        cartTab.appendChild(badge);
      }
      badge.textContent = data.items.length;
    } else if (badge) {
      badge.remove();
    }
  } catch (err) { /* ignore - non-critical UI enhancement */ }
}

/**
 * Renders Prev / page-numbers / Next controls into `container` from a
 * pagination meta object ({ page, totalPages, hasPrevPage, hasNextPage, totalItems }),
 * and calls onGoToPage(pageNumber) when the user picks a page. Shared by every
 * paginated list in the app (admin books/exams/categories/users/transactions,
 * and the public books/exams/search pages) so the UI and behavior stay consistent.
 */
function renderPagination(container, pagination, onGoToPage) {
  if (!container) return;
  if (!pagination || pagination.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const { page, totalPages, hasPrevPage, hasNextPage, totalItems } = pagination;

  // Show a compact window of page numbers around the current page rather than
  // every page number, which matters once there are hundreds of pages (10,000+ resources / 10 per page).
  const windowSize = 2;
  let start = Math.max(1, page - windowSize);
  let end = Math.min(totalPages, page + windowSize);
  const pages = [];
  for (let p = start; p <= end; p++) pages.push(p);

  let html = `<div class="pagination-info">${totalItems} total &middot; page ${page} of ${totalPages}</div><div class="pagination-controls">`;
  html += `<button class="btn btn-small btn-secondary" data-page="${page - 1}" ${!hasPrevPage ? 'disabled' : ''}>‹ Prev</button>`;
  if (start > 1) html += `<button class="btn btn-small pagination-num" data-page="1">1</button>${start > 2 ? '<span class="pagination-ellipsis">…</span>' : ''}`;
  pages.forEach((p) => {
    html += `<button class="btn btn-small pagination-num ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`;
  });
  if (end < totalPages) html += `${end < totalPages - 1 ? '<span class="pagination-ellipsis">…</span>' : ''}<button class="btn btn-small pagination-num" data-page="${totalPages}">${totalPages}</button>`;
  html += `<button class="btn btn-small btn-secondary" data-page="${page + 1}" ${!hasNextPage ? 'disabled' : ''}>Next ›</button>`;
  html += '</div>';

  container.innerHTML = html;
  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      onGoToPage(parseInt(btn.dataset.page, 10));
    });
  });
}
