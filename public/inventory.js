/* ═══════════════════════════════════════════
   API CONFIG — point this at your Node server
═══════════════════════════════════════════ */
const API = window.location.origin + '/api';

/* ═══════════════════════════════════════════
   IN-MEMORY CACHE  (populated from API)
═══════════════════════════════════════════ */
let suppliers = [];
let products  = [];   // rows from vw_supplier_products (JOIN view)
let alerts    = [];   // rows from stock_alerts table

/* ═══════════════════════════════════════════
   API HELPER
═══════════════════════════════════════════ */
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    toast(`API error: ${err.message}`, 'error');
    return null;
  }
}

/* ═══════════════════════════════════════════
   BOOT — load everything from MySQL
═══════════════════════════════════════════ */
async function loadAll() {
  setDbStatus('connecting');
  const [prods, sups, alts] = await Promise.all([
    apiFetch('/products'),   // hits vw_supplier_products JOIN view
    apiFetch('/suppliers'),
    apiFetch('/alerts'),
  ]);
  if (prods)  products  = prods;
  if (sups)   suppliers = sups;
  if (alts)   alerts    = alts;
  setDbStatus(prods ? 'connected' : 'error');
  updateBadges();
  renderProducts();
  renderAlerts('alertList');
}

/* ═══════════════════════════════════════════
   DB STATUS INDICATOR
═══════════════════════════════════════════ */
function setDbStatus(state) {
  const dot  = document.querySelector('.db-dot');
  const text = document.querySelector('.sidebar-footer div:last-child');
  const map = {
    connected:  { bg: 'var(--green)',  shadow: '0 0 8px var(--green)',  label: 'inventory_db · connected' },
    error:      { bg: 'var(--red)',    shadow: '0 0 8px var(--red)',    label: 'MySQL · disconnected' },
    connecting: { bg: 'var(--orange)', shadow: '0 0 8px var(--orange)', label: 'Connecting…' },
  };
  const s = map[state] || map.connecting;
  dot.style.background = s.bg;
  dot.style.boxShadow  = s.shadow;
  text.textContent     = s.label;
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
// products rows from vw_supplier_products use snake_case field names
function getProduct(id)  { return products.find(p => p.product_id  === id) || {}; }
function getSupplier(id) { return suppliers.find(s => s.supplier_id === id) || {}; }

function stockStatus(qty, reorder) {
  if (qty === 0)      return { label: 'Out of Stock', cls: 'badge-red' };
  if (qty <= reorder) return { label: 'Low Stock',    cls: 'badge-orange' };
  return                     { label: 'In Stock',     cls: 'badge-green' };
}

function stockBarColor(qty, reorder) {
  if (qty === 0)      return 'var(--red)';
  if (qty <= reorder) return 'var(--orange)';
  return 'var(--green)';
}

function updateBadges() {
  const unread = alerts.filter(a => !a.is_read).length;
  const low    = products.filter(p => (p.current_stock || 0) > 0 && (p.current_stock || 0) <= p.reorder_level).length;
  const out    = products.filter(p => (p.current_stock || 0) === 0).length;
  const inStk  = products.filter(p => (p.current_stock || 0) > p.reorder_level).length;

  document.getElementById('alertBadge').textContent    = unread;
  document.getElementById('lowCountBadge').textContent = low + out;
  document.getElementById('totalCount').textContent    = products.length;
  document.getElementById('inStockCount').textContent  = inStk;
  document.getElementById('lowStockCount').textContent = low;
  document.getElementById('outStockCount').textContent = out;
}

/* ═══════════════════════════════════════════
   RENDER — Dashboard product table
═══════════════════════════════════════════ */
function renderProducts(filter = '', catFilter = '') {
  const tbody = document.getElementById('productsBody');
  if (!tbody) return;
  const q = filter.toLowerCase();
  const filtered = products.filter(p => {
    const match    = !q || p.product_name.toLowerCase().includes(q)
                       || p.sku.toLowerCase().includes(q)
                       || (p.supplier_name || '').toLowerCase().includes(q);
    const catMatch = !catFilter || p.category === catFilter;
    return match && catMatch;
  });
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">No products found</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(p => {
    const qty     = p.current_stock  ?? 0;
    const reorder = p.reorder_level  ?? 10;
    const ss      = stockStatus(qty, reorder);
    const pct     = Math.min(100, (qty / (Math.max(qty, reorder) * 2 || 100)) * 100);
    return `
      <tr>
        <td><div class="td-name">${p.product_name}</div></td>
        <td><span class="td-mono">${p.sku}</span></td>
        <td><span class="badge badge-blue">${p.category || '—'}</span></td>
        <td style="font-size:12px;color:var(--muted)">${p.supplier_name || '—'}</td>
        <td>
          <div class="stock-bar-wrap">
            <div class="stock-bar-bg">
              <div class="stock-bar-fill" style="width:${pct}%;background:${stockBarColor(qty, reorder)}"></div>
            </div>
            <span class="stock-val">${qty}</span>
          </div>
        </td>
        <td><span class="badge ${ss.cls}"><span class="badge-dot"></span>${ss.label}</span></td>
        <td style="font-family:var(--font-code);font-size:12px;">$${parseFloat(p.unit_price).toFixed(2)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="editStockModal(${p.product_id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.product_id})">Del</button>
        </td>
      </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   RENDER — Full products page
═══════════════════════════════════════════ */
function renderProductsFull() {
  const tbody = document.getElementById('productsFullBody');
  if (!tbody) return;
  tbody.innerHTML = products.map(p => {
    const qty     = p.current_stock ?? 0;
    const reorder = p.reorder_level ?? 10;
    const ss      = stockStatus(qty, reorder);
    return `
      <tr>
        <td class="td-mono">${p.product_id}</td>
        <td>
          <div class="td-name">${p.product_name}</div>
          <div style="font-size:10px;color:var(--muted)">${p.description || ''}</div>
        </td>
        <td class="td-mono">${p.sku}</td>
        <td><span class="badge badge-blue">${p.category || '—'}</span></td>
        <td style="font-size:12px;color:var(--muted)">${p.supplier_name || '—'}</td>
        <td style="font-family:var(--font-code);font-size:12px;">$${parseFloat(p.unit_price).toFixed(2)}</td>
        <td style="font-family:var(--font-code);font-size:12px;">${reorder}</td>
        <td><span class="badge ${ss.cls}"><span class="badge-dot"></span>${ss.label}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="editStockModal(${p.product_id})">Stock</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.product_id})">Del</button>
        </td>
      </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   RENDER — Suppliers grid
═══════════════════════════════════════════ */
function renderSuppliers() {
  const grid = document.getElementById('suppliersGrid');
  if (!grid) return;
  const flags  = { USA: '🇺🇸', UK: '🇬🇧', China: '🇨🇳', Sweden: '🇸🇪' };
  const emojis = ['🏭', '🔧', '⚙️', '🛠️', '🏗️', '⚗️'];
  grid.innerHTML = suppliers.map((s, i) => {
    const count = products.filter(p => p.supplier_id === s.supplier_id).length;
    return `
      <div class="supplier-card">
        <div class="sc-avatar">${emojis[i % emojis.length]}</div>
        <div class="sc-name">${s.supplier_name}</div>
        <div class="sc-contact">${s.contact_person || ''}</div>
        <div class="sc-meta">
          <div class="sc-row"><span>✉️</span>${s.email}</div>
          <div class="sc-row"><span>📞</span>${s.phone || '—'}</div>
          <div class="sc-row"><span>🌍</span>${flags[s.country] || '🌐'} ${s.country || '—'}</div>
        </div>
        <div class="sc-footer">
          <div class="sc-products-count">📦 ${count} product${count !== 1 ? 's' : ''}</div>
          <span class="badge ${s.status === 'active' ? 'badge-green' : 'badge-red'}">
            <span class="badge-dot"></span>${s.status}
          </span>
        </div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   RENDER — Stock table
═══════════════════════════════════════════ */
function renderStock() {
  const tbody = document.getElementById('stockBody');
  if (!tbody) return;
  tbody.innerHTML = products.map(p => {
    const qty     = p.current_stock ?? 0;
    const reorder = p.reorder_level ?? 10;
    const ss      = stockStatus(qty, reorder);
    const pct     = Math.min(100, (qty / (Math.max(qty, reorder) * 2 || 100)) * 100);
    return `
      <tr>
        <td><div class="td-name">${p.product_name}</div></td>
        <td class="td-mono">${p.sku}</td>
        <td style="font-size:12px;color:var(--muted)">${p.warehouse_loc || 'Main Warehouse'}</td>
        <td>
          <div class="stock-bar-wrap">
            <div class="stock-bar-bg">
              <div class="stock-bar-fill" style="width:${pct}%;background:${stockBarColor(qty, reorder)}"></div>
            </div>
            <span class="stock-val">${qty}</span>
          </div>
        </td>
        <td class="td-mono">${reorder}</td>
        <td><span class="badge ${ss.cls}"><span class="badge-dot"></span>${ss.label}</span></td>
        <td class="td-mono">${p.last_restocked ? new Date(p.last_restocked).toLocaleDateString() : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="editStockModal(${p.product_id})">Adjust</button></td>
      </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   RENDER — Low stock VIEW  (fetches live from API)
═══════════════════════════════════════════ */
async function renderLowStock() {
  const tbody = document.getElementById('lowStockBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr>`;
  const rows = await apiFetch('/low-stock');  // hits vw_low_stock
  if (!rows) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--green)">✓ All products above reorder level</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const qty     = r.current_stock ?? 0;
    const reorder = r.reorder_level ?? 10;
    const level   = r.alert_level || (qty === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK');
    return `
      <tr>
        <td><div class="td-name">${r.product_name}</div></td>
        <td class="td-mono">${r.sku}</td>
        <td><span class="badge badge-blue">${r.category || '—'}</span></td>
        <td>
          <div class="stock-bar-wrap">
            <div class="stock-bar-bg">
              <div class="stock-bar-fill" style="width:${qty === 0 ? 0 : Math.round((qty / reorder) * 80)}%;background:${stockBarColor(qty, reorder)}"></div>
            </div>
            <span class="stock-val" style="color:${stockBarColor(qty, reorder)}">${qty}</span>
          </div>
        </td>
        <td class="td-mono">${reorder}</td>
        <td style="font-family:var(--font-code);font-size:12px;color:var(--red)">+${r.units_needed ?? 0}</td>
        <td style="font-size:12px;color:var(--muted)">
          ${r.supplier_name}<br>
          <span style="font-size:10px;color:var(--muted2)">${r.supplier_email || ''}</span>
        </td>
        <td>
          <span class="badge ${level === 'OUT_OF_STOCK' ? 'badge-red' : 'badge-orange'}">
            <span class="badge-dot"></span>${level}
          </span>
        </td>
      </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   RENDER — Alerts (from stock_alerts table via TRIGGER)
═══════════════════════════════════════════ */
function renderAlerts(target) {
  const el = document.getElementById(target);
  if (!el) return;
  if (!alerts.length) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px;">No alerts — all stock levels healthy ✓</div>';
    return;
  }
  const list = target === 'alertList' ? alerts.slice(0, 5) : alerts;
  el.innerHTML = list.map(a => {
    const pName = a.product_name || getProduct(a.product_id).product_name || `Product #${a.product_id}`;
    const icon  = a.alert_type === 'OUT_OF_STOCK' ? '🚫' : a.alert_type === 'LOW_STOCK' ? '⚠️' : '✅';
    const cls   = a.alert_type === 'OUT_OF_STOCK' ? 'red' : a.alert_type === 'LOW_STOCK' ? 'orange' : 'green';
    const time  = a.triggered_at ? new Date(a.triggered_at).toLocaleString() : '—';
    return `
      <div class="alert-item">
        <div class="alert-icon ${cls}">${icon}</div>
        <div class="alert-body">
          <div class="alert-msg">${a.message}</div>
          <div class="alert-time">${time} · ${pName}</div>
        </div>
        ${!a.is_read ? '<div class="alert-unread"></div>' : ''}
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   PAGE NAVIGATION
═══════════════════════════════════════════ */
function showPage(name, el) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  if (name === 'dashboard') { renderProducts(); renderAlerts('alertList'); }
  if (name === 'products')  { renderProductsFull(); }
  if (name === 'suppliers') { renderSuppliers(); }
  if (name === 'stock')     { renderStock(); }
  if (name === 'lowstock')  { renderLowStock(); }
  if (name === 'alerts')    { loadAlerts().then(() => renderAlerts('alertListFull')); }
  if (name === 'sql')       { showSqlTab('tables'); }
}

async function loadAlerts() {
  const data = await apiFetch('/alerts');
  if (data) alerts = data;
  updateBadges();
}

/* ═══════════════════════════════════════════
   MODALS
═══════════════════════════════════════════ */
function openModal(name) {
  if (name === 'addProduct' || name === 'adjustStock') {
    document.getElementById('inp-supplier').innerHTML =
      suppliers.map(s => `<option value="${s.supplier_id}">${s.supplier_name}</option>`).join('');
    document.getElementById('inp-adj-product').innerHTML =
      products.map(p => `<option value="${p.product_id}">${p.product_name}</option>`).join('');
  }
  document.getElementById('modal-' + name).classList.add('open');
}
function closeModal(name) { document.getElementById('modal-' + name).classList.remove('open'); }

function editStockModal(pid) {
  const sel = document.getElementById('inp-adj-product');
  sel.innerHTML = products.map(p =>
    `<option value="${p.product_id}" ${p.product_id === pid ? 'selected' : ''}>${p.product_name}</option>`
  ).join('');
  openModal('adjustStock');
}

/* ═══════════════════════════════════════════
   CRUD — wired to Node / MySQL API
═══════════════════════════════════════════ */
async function addProduct() {
  const name    = document.getElementById('inp-pname').value.trim();
  const sku     = document.getElementById('inp-sku').value.trim();
  const cat     = document.getElementById('inp-cat').value;
  const price   = parseFloat(document.getElementById('inp-price').value)   || 0;
  const reorder = parseInt(document.getElementById('inp-reorder').value)   || 10;
  const qty     = parseInt(document.getElementById('inp-stock').value)     || 0;
  const sid     = parseInt(document.getElementById('inp-supplier').value);
  const desc    = document.getElementById('inp-desc').value.trim();
  if (!name || !sku) { toast('Product name and SKU are required', 'error'); return; }

  const res = await apiFetch('/products', {
    method: 'POST',
    body: JSON.stringify({ supplier_id: sid, product_name: name, sku, category: cat, unit_price: price, reorder_level: reorder, description: desc }),
  });
  if (!res) return;

  // Create the stock row — this fires trg_stock_after_insert on the DB side
  await apiFetch(`/stock/${res.product_id}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity: qty }),
  });

  closeModal('addProduct');
  await loadAll();
  toast(`Product "${name}" added`, 'success');
}

async function deleteProduct(id) {
  const p = getProduct(id);
  const res = await apiFetch(`/products/${id}`, { method: 'DELETE' });
  if (!res) return;
  await loadAll();
  toast(`Product "${p.product_name}" deleted`, 'info');
}

async function addSupplier() {
  const name    = document.getElementById('inp-sname').value.trim();
  const contact = document.getElementById('inp-sperson').value.trim();
  const email   = document.getElementById('inp-semail').value.trim();
  const phone   = document.getElementById('inp-sphone').value.trim();
  const country = document.getElementById('inp-scountry').value.trim();
  if (!name || !email) { toast('Name and email are required', 'error'); return; }

  const res = await apiFetch('/suppliers', {
    method: 'POST',
    body: JSON.stringify({ supplier_name: name, contact_person: contact, email, phone, country }),
  });
  if (!res) return;
  closeModal('addSupplier');
  const data = await apiFetch('/suppliers');
  if (data) suppliers = data;
  renderSuppliers();
  toast(`Supplier "${name}" added`, 'success');
}

async function adjustStock() {
  const pid = parseInt(document.getElementById('inp-adj-product').value);
  const op  = document.getElementById('inp-adj-op').value;
  const qty = parseInt(document.getElementById('inp-adj-qty').value) || 0;
  const p   = getProduct(pid);
  const cur = p.current_stock ?? 0;

  let newQty = qty;
  if (op === 'add') newQty = Math.max(0, cur + qty);
  if (op === 'sub') newQty = Math.max(0, cur - qty);

  // PUT to /stock/:id — the MySQL TRIGGER fires automatically on the DB side
  const res = await apiFetch(`/stock/${pid}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity: newQty }),
  });
  if (!res) return;

  closeModal('adjustStock');
  await loadAll();
  const alertData = await apiFetch('/alerts');
  if (alertData) alerts = alertData;
  renderAlerts('alertList');
  renderAlerts('alertListFull');
  updateBadges();
  toast(`Stock updated: ${p.product_name} → ${newQty} units`, 'success');
}

/* ═══════════════════════════════════════════
   ALERT ACTIONS
═══════════════════════════════════════════ */
async function markAllRead() {
  await apiFetch('/alerts/read-all', { method: 'PUT' });
  const data = await apiFetch('/alerts');
  if (data) alerts = data;
  renderAlerts('alertListFull');
  updateBadges();
  toast('All alerts marked as read', 'info');
}

async function clearAlerts() {
  await apiFetch('/alerts', { method: 'DELETE' });
  alerts = [];
  renderAlerts('alertList');
  renderAlerts('alertListFull');
  updateBadges();
  toast('Alerts cleared', 'info');
}

/* ═══════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════ */
function filterCategory(val) { renderProducts(document.getElementById('globalSearch').value, val); }

document.getElementById('globalSearch').addEventListener('input', e => {
  renderProducts(e.target.value);
});

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function toast(msg, type = 'info') {
  const w     = document.getElementById('toastWrap');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el    = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  w.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ═══════════════════════════════════════════
   CLOSE MODALS ON OVERLAY CLICK
═══════════════════════════════════════════ */
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

/* ═══════════════════════════════════════════
   SQL SCHEMA VIEWER
═══════════════════════════════════════════ */
const SQL_SNIPPETS = {
tables: `<span class="cmt">-- ── TABLE: suppliers ───────────────────────────</span>
<span class="kw">CREATE TABLE</span> <span class="tbl">suppliers</span> (
    <span class="col">supplier_id</span>    <span class="kw2">INT</span>          <span class="kw">AUTO_INCREMENT PRIMARY KEY</span>,
    <span class="col">supplier_name</span>  <span class="kw2">VARCHAR</span>(<span class="num">150</span>) <span class="kw">NOT NULL</span>,
    <span class="col">email</span>          <span class="kw2">VARCHAR</span>(<span class="num">120</span>) <span class="kw">UNIQUE NOT NULL</span>,
    <span class="col">status</span>         <span class="kw2">ENUM</span>(<span class="str">'active'</span>,<span class="str">'inactive'</span>,<span class="str">'suspended'</span>) <span class="kw">DEFAULT</span> <span class="str">'active'</span>,
    <span class="col">created_at</span>     <span class="kw2">TIMESTAMP</span>    <span class="kw">DEFAULT</span> <span class="fn">CURRENT_TIMESTAMP</span>
);

<span class="cmt">-- ── TABLE: products ─────────────────────────────</span>
<span class="kw">CREATE TABLE</span> <span class="tbl">products</span> (
    <span class="col">product_id</span>     <span class="kw2">INT</span>           <span class="kw">AUTO_INCREMENT PRIMARY KEY</span>,
    <span class="col">supplier_id</span>    <span class="kw2">INT</span>           <span class="kw">NOT NULL</span>,
    <span class="col">product_name</span>   <span class="kw2">VARCHAR</span>(<span class="num">200</span>)  <span class="kw">NOT NULL</span>,
    <span class="col">sku</span>            <span class="kw2">VARCHAR</span>(<span class="num">60</span>)   <span class="kw">UNIQUE NOT NULL</span>,
    <span class="col">unit_price</span>     <span class="kw2">DECIMAL</span>(<span class="num">12</span>,<span class="num">2</span>) <span class="kw">NOT NULL</span>,
    <span class="col">reorder_level</span>  <span class="kw2">INT</span>           <span class="kw">NOT NULL DEFAULT</span> <span class="num">10</span>,
    <span class="kw">CONSTRAINT</span> <span class="fn">fk_product_supplier</span>
        <span class="kw">FOREIGN KEY</span> (<span class="col">supplier_id</span>) <span class="kw">REFERENCES</span> <span class="tbl">suppliers</span>(<span class="col">supplier_id</span>)
);

<span class="cmt">-- ── TABLE: stock ────────────────────────────────</span>
<span class="kw">CREATE TABLE</span> <span class="tbl">stock</span> (
    <span class="col">stock_id</span>       <span class="kw2">INT</span>          <span class="kw">AUTO_INCREMENT PRIMARY KEY</span>,
    <span class="col">product_id</span>     <span class="kw2">INT</span>          <span class="kw">NOT NULL</span>,
    <span class="col">warehouse_loc</span>  <span class="kw2">VARCHAR</span>(<span class="num">80</span>),
    <span class="col">quantity</span>       <span class="kw2">INT</span>          <span class="kw">NOT NULL DEFAULT</span> <span class="num">0</span>,
    <span class="kw">CONSTRAINT</span> <span class="fn">fk_stock_product</span>
        <span class="kw">FOREIGN KEY</span> (<span class="col">product_id</span>) <span class="kw">REFERENCES</span> <span class="tbl">products</span>(<span class="col">product_id</span>)
        <span class="kw">ON DELETE CASCADE</span>
);`,

join: `<span class="cmt">-- ── JOIN: products ⟕ suppliers ⟕ stock ─────────</span>
<span class="kw">SELECT</span>
    <span class="col">p.product_name</span>,
    <span class="col">p.sku</span>,
    <span class="col">p.category</span>,
    <span class="col">s.supplier_name</span>,
    <span class="col">s.email</span>   <span class="kw">AS</span> <span class="col">supplier_email</span>,
    <span class="col">st.quantity</span>,
    <span class="col">st.warehouse_loc</span>,
    <span class="kw">CASE</span>
        <span class="kw">WHEN</span> <span class="col">st.quantity</span> = <span class="num">0</span>
            <span class="kw">THEN</span> <span class="str">'OUT_OF_STOCK'</span>
        <span class="kw">WHEN</span> <span class="col">st.quantity</span> &lt;= <span class="col">p.reorder_level</span>
            <span class="kw">THEN</span> <span class="str">'LOW_STOCK'</span>
        <span class="kw">ELSE</span> <span class="str">'IN_STOCK'</span>
    <span class="kw">END AS</span> <span class="col">stock_status</span>
<span class="kw">FROM</span>      <span class="tbl">products</span>   <span class="col">p</span>
<span class="kw">JOIN</span>      <span class="tbl">suppliers</span>  <span class="col">s</span>   <span class="kw">ON</span> <span class="col">p.supplier_id</span>  = <span class="col">s.supplier_id</span>
<span class="kw">LEFT JOIN</span> <span class="tbl">stock</span>      <span class="col">st</span>  <span class="kw">ON</span> <span class="col">p.product_id</span>   = <span class="col">st.product_id</span>
<span class="kw">ORDER BY</span>  <span class="col">stock_status</span>, <span class="col">p.product_name</span>;`,

view: `<span class="cmt">-- ── VIEW: vw_low_stock ──────────────────────────</span>
<span class="kw">CREATE OR REPLACE VIEW</span> <span class="tbl">vw_low_stock</span> <span class="kw">AS</span>
    <span class="kw">SELECT</span>
        <span class="col">p.product_id</span>,
        <span class="col">p.product_name</span>,
        <span class="col">p.sku</span>,
        <span class="col">p.reorder_level</span>,
        <span class="fn">COALESCE</span>(<span class="col">st.quantity</span>, <span class="num">0</span>)              <span class="kw">AS</span> <span class="col">current_stock</span>,
        <span class="col">p.reorder_level</span> - <span class="fn">COALESCE</span>(<span class="col">st.quantity</span>,<span class="num">0</span>)
                                                <span class="kw">AS</span> <span class="col">units_needed</span>,
        <span class="col">s.supplier_name</span>,
        <span class="col">s.email</span>                               <span class="kw">AS</span> <span class="col">supplier_email</span>,
        <span class="kw">CASE</span>
            <span class="kw">WHEN</span> <span class="fn">COALESCE</span>(<span class="col">st.quantity</span>,<span class="num">0</span>) = <span class="num">0</span>
                <span class="kw">THEN</span> <span class="str">'OUT_OF_STOCK'</span>
            <span class="kw">ELSE</span> <span class="str">'LOW_STOCK'</span>
        <span class="kw">END</span>                                   <span class="kw">AS</span> <span class="col">alert_level</span>
    <span class="kw">FROM</span>      <span class="tbl">products</span>   <span class="col">p</span>
    <span class="kw">JOIN</span>      <span class="tbl">suppliers</span>  <span class="col">s</span>  <span class="kw">ON</span> <span class="col">p.supplier_id</span> = <span class="col">s.supplier_id</span>
    <span class="kw">LEFT JOIN</span> <span class="tbl">stock</span>      <span class="col">st</span> <span class="kw">ON</span> <span class="col">p.product_id</span>  = <span class="col">st.product_id</span>
    <span class="kw">WHERE</span> <span class="fn">COALESCE</span>(<span class="col">st.quantity</span>, <span class="num">0</span>) &lt;= <span class="col">p.reorder_level</span>
      <span class="kw">AND</span> <span class="col">p.is_active</span> = <span class="kw">TRUE</span>
    <span class="kw">ORDER BY</span> <span class="col">alert_level</span> <span class="kw">DESC</span>, <span class="col">units_needed</span> <span class="kw">DESC</span>;

<span class="cmt">-- Usage:</span>
<span class="kw">SELECT</span> * <span class="kw">FROM</span> <span class="tbl">vw_low_stock</span>;`,

trigger: `<span class="cmt">-- ── TRIGGER: After stock UPDATE ─────────────────</span>
<span class="kw">DELIMITER</span> $$
<span class="kw">CREATE TRIGGER</span> <span class="fn">trg_stock_after_update</span>
<span class="kw">AFTER UPDATE ON</span> <span class="tbl">stock</span>
<span class="kw">FOR EACH ROW</span>
<span class="kw">BEGIN</span>
    <span class="kw">DECLARE</span> <span class="col">v_reorder</span> <span class="kw2">INT</span>;
    <span class="kw">SELECT</span> <span class="col">reorder_level</span> <span class="kw">INTO</span> <span class="col">v_reorder</span>
    <span class="kw">FROM</span>   <span class="tbl">products</span> <span class="kw">WHERE</span> <span class="col">product_id</span> = <span class="kw">NEW</span>.<span class="col">product_id</span>;

    <span class="cmt">-- Stock dropped to zero</span>
    <span class="kw">IF</span> <span class="kw">NEW</span>.<span class="col">quantity</span> = <span class="num">0</span> <span class="kw">AND OLD</span>.<span class="col">quantity</span> &gt; <span class="num">0</span> <span class="kw">THEN</span>
        <span class="kw">INSERT INTO</span> <span class="tbl">stock_alerts</span>
            (<span class="col">product_id</span>, <span class="col">alert_type</span>, <span class="col">old_quantity</span>, <span class="col">new_quantity</span>, <span class="col">message</span>)
        <span class="kw">VALUES</span>
            (<span class="kw">NEW</span>.<span class="col">product_id</span>, <span class="str">'OUT_OF_STOCK'</span>,
             <span class="kw">OLD</span>.<span class="col">quantity</span>, <span class="kw">NEW</span>.<span class="col">quantity</span>,
             <span class="fn">CONCAT</span>(<span class="str">'URGENT: Product '</span>, <span class="kw">NEW</span>.<span class="col">product_id</span>, <span class="str">' OUT OF STOCK'</span>));

    <span class="cmt">-- Stock crossed reorder threshold</span>
    <span class="kw">ELSEIF NEW</span>.<span class="col">quantity</span> &lt;= <span class="col">v_reorder</span>
        <span class="kw">AND OLD</span>.<span class="col">quantity</span> &gt; <span class="col">v_reorder</span> <span class="kw">THEN</span>
        <span class="kw">INSERT INTO</span> <span class="tbl">stock_alerts</span>
            (<span class="col">product_id</span>, <span class="col">alert_type</span>, <span class="col">old_quantity</span>, <span class="col">new_quantity</span>, <span class="col">message</span>)
        <span class="kw">VALUES</span>
            (<span class="kw">NEW</span>.<span class="col">product_id</span>, <span class="str">'LOW_STOCK'</span>,
             <span class="kw">OLD</span>.<span class="col">quantity</span>, <span class="kw">NEW</span>.<span class="col">quantity</span>,
             <span class="fn">CONCAT</span>(<span class="str">'WARNING: below reorder level '</span>, <span class="col">v_reorder</span>));

    <span class="cmt">-- Restocked above threshold</span>
    <span class="kw">ELSEIF NEW</span>.<span class="col">quantity</span> &gt; <span class="col">v_reorder</span>
        <span class="kw">AND OLD</span>.<span class="col">quantity</span> &lt;= <span class="col">v_reorder</span> <span class="kw">THEN</span>
        <span class="kw">INSERT INTO</span> <span class="tbl">stock_alerts</span>
            (<span class="col">product_id</span>, <span class="col">alert_type</span>, <span class="col">old_quantity</span>, <span class="col">new_quantity</span>, <span class="col">message</span>)
        <span class="kw">VALUES</span>
            (<span class="kw">NEW</span>.<span class="col">product_id</span>, <span class="str">'RESTOCKED'</span>,
             <span class="kw">OLD</span>.<span class="col">quantity</span>, <span class="kw">NEW</span>.<span class="col">quantity</span>,
             <span class="fn">CONCAT</span>(<span class="str">'INFO: Restocked to '</span>, <span class="kw">NEW</span>.<span class="col">quantity</span>));
    <span class="kw">END IF</span>;
<span class="kw">END</span>$$
<span class="kw">DELIMITER</span> ;`,
};

function showSqlTab(key, el) {
  document.querySelectorAll('.sql-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  else document.querySelectorAll('.sql-tab')[0]?.classList.add('active');
  document.getElementById('sqlDisplay').innerHTML = SQL_SNIPPETS[key];
}

function copySql() {
  const text = document.getElementById('sqlDisplay').innerText;
  navigator.clipboard.writeText(text).then(() => toast('SQL copied to clipboard', 'info'));
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
loadAll();