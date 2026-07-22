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
