document.addEventListener('DOMContentLoaded', () => {
  const layout = document.getElementById('layout');
  const catalogToggle = document.getElementById('catalog-toggle');
  const catalogExpandAllBtn = document.getElementById('catalog-expand-all-btn');
  const catalogCollapseAllBtn = document.getElementById('catalog-collapse-all-btn');
  const catalogSelectBtn = document.getElementById('catalog-select-btn');
  const catalogSelectBar = document.getElementById('catalog-select-bar');
  const catalogSelectedCount = document.getElementById('catalog-selected-count');
  const catalogDeleteSelected = document.getElementById('catalog-delete-selected');
  const catalogCancelSelect = document.getElementById('catalog-cancel-select');
  const treeContainer = document.getElementById('tree');
  const btnRun = document.getElementById('btn-run');
  const currentTestTitle = document.getElementById('current-test-title');
  const infoBar = document.getElementById('info-bar');
  const runStatus = document.getElementById('run-status');
  const runId = document.getElementById('run-id');
  const runTime = document.getElementById('run-time');
  const stepsList = document.getElementById('steps-list');
  const jsonOutput = document.getElementById('json-output');
  const requestOutput = document.getElementById('request-output');
  const testCaseJsonOutput = document.getElementById('testcase-json-output');
  const testCaseJsonHighlight = document.getElementById('testcase-json-highlight');
  const testCaseJsonSave = document.getElementById('testcase-json-save');

  const btnEditBuilder = document.getElementById('btn-edit-builder');

  let currentTestCaseId = null;
  let currentTestCaseCategory = null;
  let currentRunResult = null;
  let currentTestCase = null;
  let catalogSelectMode = false;
  let selectedCatalogItems = new Map();
  let testCaseJsonPristine = '';

  // Initialize
  initializeCatalogToggle();
  initializeTestcaseToggle();
  fetchTestCases();
  initContextMenu();

  btnRun.addEventListener('click', executeTestCase);
  btnEditBuilder.addEventListener('click', () => { if (currentTestCase) window.loadInBuilder?.(currentTestCase); });
  testCaseJsonSave.addEventListener('click', saveRunnerTestCaseJson);
  testCaseJsonOutput.addEventListener('input', () => {
    updateRunnerJsonHighlight();
    updateRunnerJsonSaveState();
  });
  testCaseJsonOutput.addEventListener('scroll', syncRunnerJsonHighlightScroll);
  catalogExpandAllBtn.addEventListener('click', () => setAllCatalogFoldersCollapsed(false));
  catalogCollapseAllBtn.addEventListener('click', () => setAllCatalogFoldersCollapsed(true));
  catalogSelectBtn.addEventListener('click', () => setCatalogSelectMode(!catalogSelectMode));
  catalogCancelSelect.addEventListener('click', () => setCatalogSelectMode(false));
  catalogDeleteSelected.addEventListener('click', deleteSelectedTestCases);

  function initializeCatalogToggle() {
    const collapsed = localStorage.getItem('catalogCollapsed') === 'true';
    setCatalogCollapsed(collapsed);
    catalogToggle.addEventListener('click', () => {
      setCatalogCollapsed(!layout.classList.contains('catalog-collapsed'));
    });
  }

  function initializeTestcaseToggle() {
    const viewer  = document.getElementById('testcase-viewer');
    const btn     = document.getElementById('testcase-toggle');
    const STORAGE = 'testcaseCollapsed';

    const collapsed = localStorage.getItem(STORAGE) === 'true';
    viewer.classList.toggle('collapsed', collapsed);
    btn.title = collapsed ? 'Expand' : 'Collapse';

    btn.addEventListener('click', () => {
      const isNowCollapsed = !viewer.classList.contains('collapsed');
      viewer.classList.toggle('collapsed', isNowCollapsed);
      btn.title = isNowCollapsed ? 'Expand' : 'Collapse';
      localStorage.setItem(STORAGE, String(isNowCollapsed));
    });
  }

  function setCatalogCollapsed(collapsed) {
    layout.classList.toggle('catalog-collapsed', collapsed);
    localStorage.setItem('catalogCollapsed', String(collapsed));
    catalogToggle.title = collapsed ? 'Expand catalog sidebar' : 'Collapse catalog sidebar';
    catalogToggle.setAttribute('aria-label', catalogToggle.title);
  }

  function setAllCatalogFoldersCollapsed(collapsed) {
    treeContainer.querySelectorAll('.folder').forEach(folder => {
      folder.classList.toggle('collapsed', collapsed);
    });
  }

  window.reloadCatalog = fetchTestCases;

  function X(str) {
    return String(str??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function highlightJsonText(text) {
    const jsonTokenRe = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
    let html = '';
    let lastIndex = 0;
    String(text ?? '').replace(jsonTokenRe, (match, ...args) => {
      const offset = args[args.length - 2];
      html += X(String(text).slice(lastIndex, offset));
      let cls = 'json-number';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'json-key' : 'json-string';
      else if (/true|false/.test(match)) cls = 'json-boolean';
      else if (/null/.test(match)) cls = 'json-null';
      html += `<span class="${cls}">${X(match)}</span>`;
      lastIndex = offset + match.length;
      return match;
    });
    html += X(String(text ?? '').slice(lastIndex));
    return html;
  }

  window.showToast = function(message, type = 'success') {
    let container = document.getElementById('oa-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'oa-toast-container';
      container.className = 'oa-toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `oa-toast ${type}`;
    toast.innerHTML = `
      <span class="oa-toast-dot"></span>
      <span class="oa-toast-message">${X(message)}</span>
    `;
    container.appendChild(toast);
    window.setTimeout(() => toast.classList.add('leaving'), 2600);
    window.setTimeout(() => toast.remove(), 3100);
  };

  // ── Custom confirm modal ──
  window.showConfirm = function(title, msg, confirmLabel = 'Delete') {
    return new Promise(resolve => {
      const overlay  = document.getElementById('oa-modal-overlay');
      overlay.classList.remove('oa-modal-success');
      document.getElementById('oa-modal-title').textContent   = title;
      document.getElementById('oa-modal-msg').textContent     = msg;
      const confirmBtn = document.getElementById('oa-modal-confirm');
      const cancelBtn = document.getElementById('oa-modal-cancel');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.className = 'btn oa-btn-danger';
      cancelBtn.style.display = '';
      overlay.style.display = 'flex';

      function done(result) {
        overlay.style.display = 'none';
        overlay.onclick = null;
        confirmBtn.onclick = null;
        cancelBtn.onclick  = null;
        resolve(result);
      }
      confirmBtn.onclick = () => done(true);
      cancelBtn.onclick  = () => done(false);
      overlay.onclick = e => { if (e.target === overlay) done(false); };
    });
  };

  window.showDialog = function(title, msg, confirmLabel = 'OK') {
    return new Promise(resolve => {
      const overlay  = document.getElementById('oa-modal-overlay');
      overlay.classList.add('oa-modal-success');
      document.getElementById('oa-modal-title').textContent = title;
      document.getElementById('oa-modal-msg').textContent   = msg;
      const confirmBtn = document.getElementById('oa-modal-confirm');
      const cancelBtn = document.getElementById('oa-modal-cancel');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.className = 'btn btn-primary';
      cancelBtn.style.display = 'none';
      overlay.style.display = 'flex';

      function done() {
        overlay.style.display = 'none';
        overlay.onclick = null;
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        cancelBtn.style.display = '';
        overlay.classList.remove('oa-modal-success');
        resolve();
      }
      confirmBtn.onclick = done;
      overlay.onclick = e => { if (e.target === overlay) done(); };
    });
  };

  window.showJsonConfirm = function(title, msg, jsonText, confirmLabel = 'Save') {
    return new Promise(resolve => {
      const overlay  = document.getElementById('oa-modal-overlay');
      overlay.classList.remove('oa-modal-success');
      overlay.classList.add('oa-modal-json');
      document.getElementById('oa-modal-title').textContent = title;
      const msgEl = document.getElementById('oa-modal-msg');
      msgEl.innerHTML = `
        <div class="oa-modal-json-note">${X(msg)}</div>
        <pre class="oa-modal-json-box"><code>${X(jsonText)}</code></pre>
      `;
      const confirmBtn = document.getElementById('oa-modal-confirm');
      const cancelBtn = document.getElementById('oa-modal-cancel');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.className = 'btn btn-primary';
      cancelBtn.style.display = '';
      overlay.style.display = 'flex';

      function done(result) {
        overlay.style.display = 'none';
        overlay.onclick = null;
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        msgEl.textContent = '';
        overlay.classList.remove('oa-modal-json');
        resolve(result);
      }
      confirmBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      overlay.onclick = e => { if (e.target === overlay) done(false); };
    });
  };

  initFilePicker();

  function initFilePicker() {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="oa-file-overlay" class="oa-modal-overlay oa-file-overlay" style="display:none">
        <div class="oa-file-modal glass-panel">
          <div class="oa-file-head">
            <div>
              <div class="oa-modal-title">Select Proto File</div>
              <div class="oa-file-subtitle">Choose a .proto file readable by the OctoAssert server.</div>
            </div>
            <button id="oa-file-close" class="icon-btn" type="button" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="oa-file-path-row">
            <button id="oa-file-up" class="btn btn-sm" type="button">Up</button>
            <input id="oa-file-path" class="exp-input" autocomplete="off">
            <button id="oa-file-go" class="btn btn-accent btn-sm" type="button">Go</button>
          </div>
          <div id="oa-file-list" class="oa-file-list"></div>
          <div id="oa-file-msg" class="oa-file-msg"></div>
        </div>
      </div>
    `);
  }

  async function openProtoPicker(s, card) {
    const overlay = document.getElementById('oa-file-overlay');
    const pathInput = document.getElementById('oa-file-path');
    const listEl = document.getElementById('oa-file-list');
    const msgEl = document.getElementById('oa-file-msg');
    const close = () => { overlay.style.display = 'none'; };
    let currentPath = firstProtoDir(s.protoFiles) || '';
    let parentPath = '';

    async function load(path = '') {
      msgEl.textContent = '';
      listEl.innerHTML = '<div class="oa-file-empty">Loading...</div>';
      try {
        const url = path ? `/api/files/browse?path=${encodeURIComponent(path)}` : '/api/files/browse';
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        currentPath = data.path || '';
        parentPath = data.parent || '';
        pathInput.value = currentPath;
        render(data.entries || []);
      } catch (err) {
        listEl.innerHTML = '<div class="oa-file-empty">Unable to open this path.</div>';
        msgEl.textContent = err.message;
      }
    }

    function render(entries) {
      if (!entries.length) {
        listEl.innerHTML = '<div class="oa-file-empty">No folders or .proto files here.</div>';
        return;
      }
      listEl.innerHTML = entries.map(entry => `
        <button class="oa-file-item ${entry.type === 'dir' ? 'is-dir' : 'is-file'}" type="button" data-path="${X(entry.path)}" data-rel-path="${X(entry.rel_path || entry.path)}" data-type="${X(entry.type)}">
          <span class="oa-file-kind">${entry.type === 'dir' ? 'DIR' : 'PROTO'}</span>
          <span class="oa-file-name">${X(entry.name)}</span>
        </button>
      `).join('');
      listEl.querySelectorAll('.oa-file-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const path = btn.dataset.path;
          if (btn.dataset.type === 'dir') load(path);
          else selectProto(btn.dataset.relPath || path);
        });
      });
    }

    function selectProto(path) {
      const existing = s.protoFiles.split(',').map(p => p.trim()).filter(Boolean);
      if (!existing.includes(path)) existing.push(path);
      s.protoFiles = existing.join(', ');
      const input = card.querySelector('.bldr-protos-in');
      if (input) input.value = s.protoFiles;
      close();
    }

    document.getElementById('oa-file-close').onclick = close;
    document.getElementById('oa-file-up').onclick = () => { if (parentPath) load(parentPath); };
    document.getElementById('oa-file-go').onclick = () => load(pathInput.value.trim());
    pathInput.onkeydown = e => { if (e.key === 'Enter') load(pathInput.value.trim()); };
    overlay.onclick = e => { if (e.target === overlay) close(); };
    overlay.style.display = 'flex';
    await load(currentPath);
  }

  function firstProtoDir(value) {
    const first = (value || '').split(',').map(p => p.trim()).find(Boolean);
    if (!first) return '';
    const slash = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'));
    return slash > 0 ? first.slice(0, slash) : '';
  }

  async function fetchTestCases() {
    try {
      const res = await fetch('/api/testcases');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cases = await res.json();
      renderTree(cases || []);
    } catch (err) {
      treeContainer.innerHTML = `<div class="empty-state">Error loading test cases: ${err.message}</div>`;
    }
  }

  function renderTree(cases) {
    treeContainer.innerHTML = '';
    if (cases.length === 0) {
      treeContainer.innerHTML = '<div class="empty-state">No test cases found.</div>';
      return;
    }

    // Build a tree structure based on category.
    const tree = {};
    cases.forEach(tc => {
      const parts = (tc.category || 'uncategorized').split('/').filter(Boolean);
      if (parts.length === 0) parts.push('uncategorized');
      
      let curr = tree;
      parts.forEach((p, idx) => {
        if (!curr[p]) curr[p] = { __cases: [], __category: parts.slice(0, idx + 1).join('/') };
        curr = curr[p];
      });
      curr.__cases.push(tc);
    });

    // Render HTML
    function buildHtml(node, name) {
      const div = document.createElement('div');
      div.className = 'folder';
      const category = node.__category || name;
      
      const header = document.createElement('div');
      header.className = 'folder-header';
      header.innerHTML = `
        <span class="folder-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <span class="folder-name"></span>
        </span>
        <button class="folder-delete-btn" type="button" title="Delete this folder" aria-label="Delete this folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      `;
      header.querySelector('.folder-name').textContent = name;
      header.onclick = e => {
        if (e.target.closest('.folder-delete-btn')) return;
        div.classList.toggle('collapsed');
      };
      header.querySelector('.folder-delete-btn').onclick = e => {
        e.stopPropagation();
        deleteFolder(category);
      };
      div.appendChild(header);

      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'folder-children';
      
      if (node.__cases) {
        node.__cases.forEach(tc => {
          const item = document.createElement('div');
          item.className = 'test-case-item';
          item.classList.toggle('catalog-selecting', catalogSelectMode);
          item.classList.toggle('selected', selectedCatalogItems.has(catalogItemKey(tc)));
          item.innerHTML = `
            <label class="tc-select-wrap" title="Select this test case">
              <input class="tc-select-check" type="checkbox"${selectedCatalogItems.has(catalogItemKey(tc)) ? ' checked' : ''}>
            </label>
            <div class="tc-text">
              <div class="tc-name"></div>
              <div class="tc-id"></div>
            </div>
            <button class="tc-more-btn" type="button" title="More actions" aria-label="More test case actions">
              <svg viewBox="0 0 24 24" fill="currentColor" class="icon"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
            </button>
          `;
          item.querySelector('.tc-name').textContent = tc.name;
          item.querySelector('.tc-id').textContent = tc.id;
          item.onclick = e => {
            if (e.target.closest('.tc-more-btn') || e.target.closest('.tc-select-wrap')) return;
            if (catalogSelectMode) {
              toggleCatalogItem(tc);
              return;
            }
            selectTestCase(tc.id, tc.name, item, tc.category);
          };
          item.querySelector('.tc-select-check').onchange = e => {
            e.stopPropagation();
            toggleCatalogItem(tc, e.target.checked);
          };
          item.querySelector('.tc-more-btn').onclick = e => {
            e.stopPropagation();
            showContextMenu(e, tc, item);
          };
          item.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, tc, item); });
          childrenDiv.appendChild(item);
        });
      }

      Object.keys(node).forEach(k => {
        if (k !== '__cases' && k !== '__category') {
          childrenDiv.appendChild(buildHtml(node[k], k));
        }
      });

      div.appendChild(childrenDiv);
      return div;
    }

    Object.keys(tree).forEach(k => {
      treeContainer.appendChild(buildHtml(tree[k], k));
    });
  }

  function setCatalogSelectMode(enabled) {
    catalogSelectMode = enabled;
    if (!enabled) selectedCatalogItems.clear();
    catalogSelectBar.style.display = enabled ? 'flex' : 'none';
    treeContainer.classList.toggle('catalog-select-mode', enabled);
    updateCatalogSelectionUI();
    fetchTestCases();
  }

  function catalogItemKey(tc) {
    return `${tc.category || ''}\u0000${tc.id}`;
  }

  function toggleCatalogItem(tc, checked = !selectedCatalogItems.has(catalogItemKey(tc))) {
    const key = catalogItemKey(tc);
    if (checked) selectedCatalogItems.set(key, { id: tc.id, category: tc.category || '' });
    else selectedCatalogItems.delete(key);
    updateCatalogSelectionUI();
    fetchTestCases();
  }

  function updateCatalogSelectionUI() {
    const count = selectedCatalogItems.size;
    catalogSelectedCount.textContent = `${count} selected`;
    catalogDeleteSelected.disabled = count === 0;
  }

  async function deleteSelectedTestCases() {
    const items = [...selectedCatalogItems.values()];
    if (!items.length) return;
    if (!await showConfirm('Delete Test Cases', `Delete the selected ${items.length} test cases?\nThis action cannot be undone.`)) return;
    try {
      const res = await fetch('/api/testcases/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Delete failed');
        return;
      }
      if (items.some(item => item.id === currentTestCaseId && (!currentTestCaseCategory || item.category === currentTestCaseCategory))) {
        clearSelection();
      }
      setCatalogSelectMode(false);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  async function deleteFolder(category) {
    if (!category || category === 'uncategorized') return;
    if (!await showConfirm('Delete Folder', `Delete "${category}" folder?\nAll test cases inside this folder will be deleted. This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/catalog/categories/${encodeURIComponent(category)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Delete folder failed');
        return;
      }
      if (currentTestCaseCategory && (currentTestCaseCategory === category || currentTestCaseCategory.startsWith(category + '/'))) {
        clearSelection();
      }
      fetchTestCases();
    } catch (err) {
      alert('Delete folder failed: ' + err.message);
    }
  }

  // ── Catalog item menu ──
  function initContextMenu() {
    const menu = document.getElementById('tc-context-menu');
    // Close on any click outside
    document.addEventListener('click', () => menu.style.display = 'none');
    document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.style.display = 'none'; });
  }

  function showContextMenu(e, tc, item) {
    const menu = document.getElementById('tc-context-menu');
    // Position
    menu.style.display = 'block';
    const x = Math.min(e.clientX, window.innerWidth  - menu.offsetWidth  - 8);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    // Wire up actions
    menu.querySelector('.ctx-run').onclick = () => {
      menu.style.display = 'none';
      selectTestCase(tc.id, tc.name, item, tc.category);
      // wait for definition to load then run
      const wait = setInterval(() => {
        if (currentTestCase) { clearInterval(wait); executeTestCase(); }
      }, 80);
      setTimeout(() => clearInterval(wait), 5000);
    };
    menu.querySelector('.ctx-edit').onclick = () => {
      menu.style.display = 'none';
      selectTestCase(tc.id, tc.name, item, tc.category);
      // wait for definition then switch to builder
      const wait = setInterval(() => {
        if (currentTestCase) { clearInterval(wait); window.loadInBuilder?.(currentTestCase); }
      }, 80);
      setTimeout(() => clearInterval(wait), 5000);
    };
    menu.querySelector('.ctx-duplicate').onclick = async () => {
      menu.style.display = 'none';
      duplicateTestCase(tc);
    };
    menu.querySelector('.ctx-select').onclick = () => {
      menu.style.display = 'none';
      setCatalogSelectMode(true);
      toggleCatalogItem(tc, true);
    };
    menu.querySelector('.ctx-delete').onclick = async () => {
      menu.style.display = 'none';
      deleteTestCase(tc);
    };
  }

  async function duplicateTestCase(tc) {
    try {
      const category = tc.category ? `?category=${encodeURIComponent(tc.category)}` : '';
      const res = await fetch(`/api/testcases/${encodeURIComponent(tc.id)}/duplicate${category}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Duplicate failed');
        return;
      }
      fetchTestCases();
      window.loadInBuilder?.(data);
    } catch (err) {
      alert('Duplicate failed: ' + err.message);
    }
  }

  async function deleteTestCase(tc) {
    if (!await showConfirm('Delete Test Case', `Delete "${tc.name}"?\nThis action cannot be undone.`)) return;
    try {
      const category = tc.category ? `?category=${encodeURIComponent(tc.category)}` : '';
      const res = await fetch(`/api/testcases/${encodeURIComponent(tc.id)}${category}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Delete failed');
        return;
      }
      if (currentTestCaseId === tc.id && (!currentTestCaseCategory || currentTestCaseCategory === tc.category)) {
        clearSelection();
      }
      fetchTestCases();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  function clearSelection() {
    currentTestCaseId = null;
    currentTestCaseCategory = null;
    currentRunResult = null;
    currentTestCase = null;
    currentTestTitle.textContent = 'Select a Test Case';
    btnRun.disabled = true;
    btnEditBuilder.disabled = true;
    infoBar.style.display = 'none';
    stepsList.innerHTML = '<div class="empty-state">No execution data</div>';
    requestOutput.textContent = '// Select an execution step to inspect request data...';
    jsonOutput.textContent = '// Select an execution step to inspect response data...';
    setRunnerJsonText('// Selected test case JSON will appear here...', { readonly: true });
  }

  function selectTestCase(id, name, element, category = null) {
    document.querySelectorAll('.test-case-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    currentTestCaseId = id;
    currentTestCaseCategory = category;
    currentTestCase = null;
    currentTestTitle.textContent = name;
    btnRun.disabled = false;
    btnEditBuilder.disabled = false;
    
    // Reset view
    infoBar.style.display = 'none';
    stepsList.innerHTML = '<div class="empty-state">Ready to execute. Click Execute Run.</div>';
    requestOutput.textContent = '// Select an execution step to inspect request data...';
    jsonOutput.textContent = '// Select an execution step to inspect response data...';
    setRunnerJsonText('// Loading selected test case JSON...', { readonly: true });
    fetchTestCaseDefinition(id, category);
  }

  async function fetchTestCaseDefinition(id, category = null) {
    try {
      const qs = category ? `?category=${encodeURIComponent(category)}` : '';
      const res = await fetch(`/api/testcases/${encodeURIComponent(id)}${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (currentTestCaseId !== id || currentTestCaseCategory !== category) return;
      if (category && !data.category) data.category = category;
      currentTestCase = data;
      setRunnerJsonText(JSON.stringify(data, null, 2), { readonly: false });
    } catch (err) {
      if (currentTestCaseId !== id || currentTestCaseCategory !== category) return;
      setRunnerJsonText(`// Failed to load test case JSON: ${err.message}`, { readonly: true });
    }
  }

  function setRunnerJsonText(text, { readonly }) {
    testCaseJsonOutput.value = text;
    testCaseJsonOutput.readOnly = readonly;
    testCaseJsonPristine = text;
    updateRunnerJsonHighlight();
    updateRunnerJsonSaveState();
  }

  function updateRunnerJsonHighlight() {
    testCaseJsonHighlight.innerHTML = highlightJsonText(testCaseJsonOutput.value);
    syncRunnerJsonHighlightScroll();
  }

  function syncRunnerJsonHighlightScroll() {
    testCaseJsonHighlight.parentElement.scrollTop = testCaseJsonOutput.scrollTop;
    testCaseJsonHighlight.parentElement.scrollLeft = testCaseJsonOutput.scrollLeft;
  }

  function updateRunnerJsonSaveState() {
    const dirty = !testCaseJsonOutput.readOnly && testCaseJsonOutput.value !== testCaseJsonPristine;
    testCaseJsonSave.style.display = dirty ? 'inline-flex' : 'none';
  }

  async function saveRunnerTestCaseJson() {
    if (!currentTestCaseId) return;
    let parsed;
    try {
      parsed = JSON.parse(testCaseJsonOutput.value);
    } catch (err) {
      await showDialog('Invalid JSON', `The current content is not valid JSON and cannot be saved.\n\n${err.message}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      await showDialog('Invalid JSON', 'Test Case JSON must be an object.');
      return;
    }
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      await showDialog('Invalid JSON', 'Test Case JSON must include a non-empty steps array.');
      return;
    }
    const category = parsed.category || currentTestCaseCategory || 'builder';
    const payload = { ...parsed, category };
    testCaseJsonSave.disabled = true;
    try {
      const res = await fetch('/api/builder/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (!parsed.category) parsed.category = category;
      currentTestCase = parsed;
      currentTestCaseId = data.id || parsed.id || currentTestCaseId;
      currentTestCaseCategory = data.category || category;
      currentTestTitle.textContent = parsed.name || currentTestCaseId;
      setRunnerJsonText(JSON.stringify(parsed, null, 2), { readonly: false });
      fetchTestCases();
      await showDialog('Saved', `Test Case: ${currentTestCaseId}\nCatalog: ${currentTestCaseCategory}`);
    } catch (err) {
      await showDialog('Save Failed', err.message);
    } finally {
      testCaseJsonSave.disabled = false;
      updateRunnerJsonSaveState();
    }
  }

  async function executeTestCase() {
    if (!currentTestCaseId) return;

    btnRun.disabled = true;
    btnRun.innerHTML = `<span class="pulse"></span> Running...`;
    stepsList.innerHTML = `
      <div class="oa-steps-spinner">
        <div class="oa-spinner"></div>
        <span>Executing…</span>
      </div>`;
    requestOutput.textContent = '// Waiting for execution steps...';
    jsonOutput.textContent = '// Waiting for response...';
    infoBar.style.display = 'none';

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentTestCaseId, category: currentTestCaseCategory || '' })
      });
      const data = await res.json();
      currentRunResult = data;
      if (!res.ok) {
        showToast(`Execute Run failed: ${data.error || 'Failed'}`, 'error');
        renderResult(data);
        return;
      }
      renderResult(data);
      showRunnerRunToast(data);
    } catch (err) {
      stepsList.innerHTML = `<div class="empty-state" style="color:var(--neon-danger)">Execution failed: ${err.message}</div>`;
      showToast(`Execute Run failed: ${err.message}`, 'error');
    } finally {
      btnRun.disabled = false;
      btnRun.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Execute Run`;
    }
  }

  function showRunnerRunToast(result) {
    const steps = Array.isArray(result.steps) ? result.steps : [];
    const passed = steps.filter(step => step.status === 'passed').length;
    const failed = steps.filter(step => step.status !== 'passed').length;
    const elapsed = Number.isFinite(Number(result.elapsed_ms)) ? ` in ${result.elapsed_ms} ms` : '';
    if (result.status === 'passed') {
      showToast(`Execute Run passed: ${passed} step${passed === 1 ? '' : 's'}${elapsed}`);
      return;
    }
    showToast(`Execute Run failed: ${passed} passed, ${failed} failed${elapsed}`, 'error');
  }

  function renderResult(result) {
    infoBar.style.display = 'flex';
    runId.textContent = result.test_case_id;
    runTime.textContent = result.elapsed_ms;

    runStatus.textContent = result.status;
    runStatus.className = 'badge ' + (result.status === 'passed' ? 'badge-success' : 'badge-danger');

    stepsList.innerHTML = '';
    if (!result.steps || result.steps.length === 0) {
      stepsList.innerHTML = '<div class="empty-state">No steps executed.</div>';
    } else {
      result.steps.forEach((step, idx) => {
        const div = document.createElement('div');
        div.className = `step-card ${step.status}`;
        div.innerHTML = `
          <div class="step-marker"></div>
          <div class="step-content">
            <div class="step-header">
              <span class="step-name">${step.name}</span>
              <span class="step-type">${step.type}</span>
            </div>
            <div class="step-time">${step.elapsed_ms} ms</div>
            ${step.error ? `<div style="color:var(--neon-danger);font-size:12px;margin-top:4px;">${step.error}</div>` : ''}
          </div>
        `;
        div.onclick = () => showStepDetails(idx, div);
        stepsList.appendChild(div);
      });
      const preferredIdx = result.steps.findIndex(step => step.status === 'failed');
      const selectedIdx = preferredIdx >= 0 ? preferredIdx : 0;
      showStepDetails(selectedIdx, stepsList.children[selectedIdx]);
    }
  }

  function showStepDetails(idx, element) {
    document.querySelectorAll('.step-card').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    
    const step = currentRunResult.steps[idx];
    if (step) {
      showJson(buildStepRequestData(step), requestOutput);
      showJson(buildStepResponseData(step), jsonOutput);
    }
  }

  function buildStepRequestData(step) {
    return compactObject({
      name: step.name,
      type: step.type,
      description: step.request?.description,
      action: parseMaybeJson(step.request?.action),
      asserts: step.request?.asserts,
      exports: formatExports(step.request?.exports),
      executor_request_summary: parseMaybeJson(step.request_summary),
      executor_raw_payload: parseMaybeJson(step.raw_payload)
    });
  }

  function formatExports(exports) {
    if (!Array.isArray(exports) || exports.length === 0) return exports;
    return exports.map(exp => compactObject({
      from: exp.path || exp.result,
      as: exp.as
    }));
  }

  function buildStepResponseData(step) {
    return compactObject({
      name: step.name,
      type: step.type,
      status: step.status,
      elapsed_ms: step.elapsed_ms,
      response_summary: parseMaybeJson(step.response_summary),
      error: step.error,
      values: step.values
    });
  }

  function compactObject(obj) {
    return Object.fromEntries(
      Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== '')
    );
  }

  function parseMaybeJson(value) {
    if (value === undefined || value === null || value === '') return value;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  function showJson(obj, target) {
    const jsonStr = JSON.stringify(obj, null, 2);
    target.innerHTML = highlightJsonText(jsonStr);
  }
});

/* ══════════════════════════════════════════
   Test Case Builder (Tab Nav + Builder Logic)
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const layout      = document.getElementById('layout');
  const builderView = document.getElementById('builder-view');
  let loadingBuilderFromEdit = false;

  // ── Tab switching ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      layout.style.display      = tab === 'runner'  ? '' : 'none';
      builderView.style.display = tab === 'builder' ? '' : 'none';
      if (tab === 'builder') {
        loadBuilderCategories();
        if (!loadingBuilderFromEdit) resetBuilder();
      }
    });
  });

  // ══════════════════════════════════════════
  // BUILDER STATE & CONSTANTS
  // ══════════════════════════════════════════
  const EXEC_TYPES = [
    { v: 'grpc_unary',        l: 'gRPC Unary',       g: 'gRPC'        },
    { v: 'http_request',      l: 'HTTP Request',      g: 'HTTP'        },
    { v: 'websocket_connect', l: 'WS Connect',        g: 'WebSocket'   },
    { v: 'websocket_send',    l: 'WS Send',           g: 'WebSocket'   },
    { v: 'websocket_await',   l: 'WS Await',          g: 'WebSocket'   },
    { v: 'websocket_close',   l: 'WS Close',          g: 'WebSocket'   },
    { v: 'db_check',          l: 'DB Check',          g: 'Database'    },
    { v: 'delay',             l: 'Delay',             g: 'Utility'     },
    { v: 'include',           l: 'Include',           g: 'Utility'     },
    { v: 'group',             l: 'Group',             g: 'Utility'     },
    { v: 'fake_grpc_start',   l: 'Fake gRPC Start',   g: 'Fake Server' },
    { v: 'fake_grpc_stop',    l: 'Fake gRPC Stop',    g: 'Fake Server' },
    { v: 'fake_http_start',   l: 'Fake HTTP Start',   g: 'Fake Server' },
    { v: 'fake_http_stop',    l: 'Fake HTTP Stop',    g: 'Fake Server' },
  ];

  let tcSteps      = [];
  let stepSeq      = 0;
  let activeStepId = null;

  const stepsEl    = document.getElementById('builder-steps');
  const stepTabsEl = document.getElementById('builder-step-tabs');
  const emptyEl    = document.getElementById('builder-empty');
  const addBtn     = document.getElementById('builder-add-btn');
  const runAllBtn  = document.getElementById('builder-run-all-btn');
  const saveBtn    = document.getElementById('builder-save-btn');
  const saveMsgEl  = document.getElementById('builder-save-msg');
  const categoryInput = document.getElementById('tc-category');
  const categoryPickerBtn = document.getElementById('builder-cat-picker-btn');
  const categoryMenu = document.createElement('div');
  categoryMenu.className = 'builder-cat-menu';
  categoryMenu.style.display = 'none';
  document.body.appendChild(categoryMenu);
  let builderCategories = [];

  addBtn.addEventListener('click', () => addStep());
  runAllBtn.addEventListener('click', runAll);
  saveBtn.addEventListener('click', saveTC);
  categoryPickerBtn.addEventListener('click', () => {
    if (categoryMenu.style.display === 'none') showCategoryMenu();
    else hideCategoryMenu();
  });
  categoryInput.addEventListener('focus', hideCategoryMenu);
  document.addEventListener('click', e => {
    if (!categoryMenu.contains(e.target) && !e.target.closest('.catalog-picker')) hideCategoryMenu();
  });
  window.addEventListener('resize', hideCategoryMenu);

  // ══════════════════════════════════════════
  // CONTEXT VARIABLES (localStorage)
  // ══════════════════════════════════════════
  const CTX_KEY  = 'octoassert_ctx';
  const ctxBtn   = document.getElementById('builder-ctx-btn');
  const ctxWrap  = document.getElementById('builder-ctx-wrap');
  const ctxRows  = document.getElementById('builder-ctx-rows');
  const ctxBadge = document.getElementById('builder-ctx-badge');
  const ctxClear = document.getElementById('builder-ctx-clear');
  const tooltip  = document.getElementById('ctx-tooltip');
  const ctxSuggest = document.createElement('div');
  ctxSuggest.className = 'ctx-suggest';
  ctxSuggest.style.display = 'none';
  document.body.appendChild(ctxSuggest);
  let ctxSuggestState = null;

  ctxBtn.addEventListener('click', () => {
    const hidden = ctxWrap.style.display === 'none';
    ctxWrap.style.display = hidden ? '' : 'none';
  });
  ctxClear.addEventListener('click', () => { localStorage.removeItem(CTX_KEY); renderCtxPanel(); });

  // Tooltip on hover for inputs/textareas containing ${ctx.*}
  stepsEl.addEventListener('mouseover', e => {
    const el = e.target.closest('input, textarea');
    if (!el || !el.value.includes('${ctx.')) { tooltip.style.display = 'none'; return; }
    const ctx = getCtx();
    const lines = [...el.value.matchAll(/\$\{(ctx\.[^}]+)\}/g)].map(m => {
      const key = m[1];
      const v = ctx[key];
      return v !== undefined
        ? `${key}  =  "${String(v)}"`
        : `<span class="ctx-tt-unset">${key}  =  (not set)</span>`;
    });
    if (!lines.length) return;
    tooltip.innerHTML = lines.join('\n');
    tooltip.style.display = '';
    const r  = el.getBoundingClientRect();
    let top  = r.bottom + 4, left = r.left;
    tooltip.style.top = '0'; tooltip.style.left = '0'; // measure
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    if (left + tw > window.innerWidth  - 8) left = window.innerWidth  - tw - 8;
    if (top  + th > window.innerHeight - 8) top  = r.top - th - 4;
    tooltip.style.top = top + 'px'; tooltip.style.left = left + 'px';
  });
  stepsEl.addEventListener('mouseout',  () => { tooltip.style.display = 'none'; });
  document.addEventListener('scroll', () => { tooltip.style.display = 'none'; hideCtxSuggest(); }, true);
  stepsEl.addEventListener('input', e => {
    const el = e.target.closest('input, textarea');
    if (el) updateCtxSuggest(el);
  });
  stepsEl.addEventListener('keyup', e => {
    const el = e.target.closest('input, textarea');
    if (!el || ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
    updateCtxSuggest(el);
  });
  stepsEl.addEventListener('click', e => {
    const el = e.target.closest('input, textarea');
    if (el) updateCtxSuggest(el);
    else hideCtxSuggest();
  });
  stepsEl.addEventListener('keydown', e => {
    if (!ctxSuggestState || ctxSuggest.style.display === 'none') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      hideCtxSuggest();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setCtxSuggestIndex(ctxSuggestState.index + dir);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyCtxSuggestion(ctxSuggestState.items[ctxSuggestState.index]);
    }
  });
  document.addEventListener('click', e => {
    if (!ctxSuggest.contains(e.target) && !stepsEl.contains(e.target)) hideCtxSuggest();
  });

  function getCtx() {
    try { return JSON.parse(localStorage.getItem(CTX_KEY) || '{}'); } catch { return {}; }
  }

  function saveCtxValues(values) {
    if (!values || !Object.keys(values).length) return;
    const ctx = getCtx();
    Object.assign(ctx, values);
    localStorage.setItem(CTX_KEY, JSON.stringify(ctx));
    renderCtxPanel();
  }

  function renderCtxPanel() {
    const ctx  = getCtx();
    const keys = Object.keys(ctx);
    ctxBadge.textContent  = keys.length || '';
    ctxBadge.style.display = keys.length ? '' : 'none';
    if (!keys.length) {
      ctxRows.innerHTML = '<div class="bldr-ctx-empty">No context variables yet. Run a step with exports to populate.</div>';
      return;
    }
    ctxRows.innerHTML = keys.map(k => `
      <div class="bldr-ctx-row">
        <code class="bldr-ctx-key">${X(k)}</code>
        <span class="bldr-ctx-eq">=</span>
        <code class="bldr-ctx-val" title="${X(String(ctx[k]))}">${X(String(ctx[k]))}</code>
        <button class="bldr-ctx-del" data-key="${X(k)}">×</button>
      </div>`).join('');
    ctxRows.querySelectorAll('.bldr-ctx-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = getCtx(); delete c[btn.dataset.key];
        localStorage.setItem(CTX_KEY, JSON.stringify(c));
        renderCtxPanel();
      });
    });
  }

  function updateCtxSuggest(el) {
    const ctx = getCtx();
    const keys = Object.keys(ctx).sort();
    if (!keys.length) {
      hideCtxSuggest();
      return;
    }

    const caret = el.selectionStart ?? 0;
    const before = el.value.slice(0, caret);
    const match = before.match(/(?:^|[\s"'=:,[({])(\$\{?c?t?x?\.?[\w.-]*)$/);
    if (!match || !match[1].startsWith('$')) {
      hideCtxSuggest();
      return;
    }

    const token = match[1];
    const query = token.replace(/^\$\{?/, '').replace(/^ctx\.?/, '').toLowerCase();
    const items = keys.filter(key => key.toLowerCase().includes(query)).slice(0, 8);
    if (!items.length) {
      hideCtxSuggest();
      return;
    }

    const start = caret - token.length;
    ctxSuggestState = { el, start, end: caret, items, index: 0 };
    renderCtxSuggest(ctx, items);
    positionCtxSuggest(el);
  }

  function renderCtxSuggest(ctx, items) {
    ctxSuggest.innerHTML = items.map((key, i) => `
      <button class="ctx-suggest-item ${i === 0 ? 'active' : ''}" type="button" data-idx="${i}">
        <code class="ctx-suggest-key">\${ctx.${X(key)}}</code>
        <span class="ctx-suggest-val">${X(String(ctx[key]))}</span>
      </button>
    `).join('');
    ctxSuggest.querySelectorAll('.ctx-suggest-item').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        const idx = Number(btn.dataset.idx || 0);
        applyCtxSuggestion(ctxSuggestState?.items[idx]);
      });
    });
    ctxSuggest.style.display = '';
  }

  function positionCtxSuggest(el) {
    const rect = el.getBoundingClientRect();
    ctxSuggest.style.left = '0';
    ctxSuggest.style.top = '0';
    const width = Math.min(360, Math.max(rect.width, 260));
    ctxSuggest.style.width = width + 'px';
    let left = rect.left;
    let top = rect.bottom + 6;
    const menuHeight = ctxSuggest.offsetHeight || 180;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 6;
    ctxSuggest.style.left = Math.max(8, left) + 'px';
    ctxSuggest.style.top = Math.max(8, top) + 'px';
  }

  function setCtxSuggestIndex(index) {
    if (!ctxSuggestState) return;
    const count = ctxSuggestState.items.length;
    ctxSuggestState.index = (index + count) % count;
    ctxSuggest.querySelectorAll('.ctx-suggest-item').forEach((item, i) => {
      item.classList.toggle('active', i === ctxSuggestState.index);
      if (i === ctxSuggestState.index) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function applyCtxSuggestion(key) {
    if (!ctxSuggestState || !key) return;
    const { el, start, end } = ctxSuggestState;
    const insertion = `\${ctx.${key}}`;
    el.value = el.value.slice(0, start) + insertion + el.value.slice(end);
    const caret = start + insertion.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    hideCtxSuggest();
  }

  function hideCtxSuggest() {
    ctxSuggestState = null;
    ctxSuggest.style.display = 'none';
  }

  // Replace ${ctx.xxx} in action JSON using localStorage values
  function injectCtx(obj) {
    const ctx = getCtx();
    if (!Object.keys(ctx).length) return obj;
    let str = JSON.stringify(obj);
    str = str.replace(/\$\{(ctx\.[^}]+)\}/g, (_, key) =>
      ctx[key] !== undefined
        ? String(ctx[key]).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        : `\${${key}}`
    );
    try { return JSON.parse(str); } catch { return obj; }
  }

  renderCtxPanel();

  // ── Type selector HTML ──
  function typeSelectHTML(cur) {
    const groups = {};
    EXEC_TYPES.forEach(t => { (groups[t.g] = groups[t.g] || []).push(t); });
    return Object.entries(groups).map(([g, ts]) =>
      `<optgroup label="${g}">${ts.map(t =>
        `<option value="${t.v}"${t.v === cur ? ' selected' : ''}>${t.l}</option>`
      ).join('')}</optgroup>`
    ).join('');
  }

  // ── Add / remove / move steps ──
  function addStep(type = 'grpc_unary') {
    stepSeq++;
    const s = {
      _id: stepSeq, stepDescription: '', type,
      // grpc_unary
      endpoint: '', proxyMode: false, proxyEndpoint: '',
      services: [], selectedService: '', selectedMethod: '',
      metadata: [], protoFiles: '', payload: '{}',
      // http_request
      httpMethod: 'GET', url: '', headers: [], httpBody: '',
      // websocket
      wsUrl: '', wsHeaders: [], wsConnId: '', wsPayload: '{}',
      wsMatchPath: '', wsMatchEquals: '', wsTimeoutMs: 5000,
      // db_check
      dbDriver: 'postgres', dbDsn: '', dbSql: '',
      // delay
      durationMs: 1000,
      // include / group
      includePath: '', groupFile: '',
      // fake_grpc
      fakeGrpcPort: 19091,
      fakeGrpcProtos: 'proto/fake/service.proto',
      fakeGrpcResponses: '{\n  "FakeService/Echo": {"message": "world"}\n}',
      fakeGrpcAddr: '',
      // fake_http
      fakeHttpPort: 18080,
      fakeHttpRoutes: '[\n  {"method":"GET","path":"/health","status":200,"body":{"ok":true}}\n]',
      fakeHttpUrl: '',
      asserts: [], exports: [],
      result: null,
    };
    tcSteps.push(s);
    emptyEl.style.display = 'none';
    const card = document.createElement('div');
    card.className = 'builder-step-card';
    card.dataset.stepId = s._id;
    card.innerHTML = cardHTML(s);
    stepsEl.appendChild(card);
    attachCard(card, s);
    renderAE(card, s);
    setActiveStep(s._id);
    renderStepTabs();
    updateBtns();
  }

  function removeStep(id) {
    const idx = tcSteps.findIndex(s => s._id === id);
    if (idx < 0) return;
    tcSteps.splice(idx, 1);
    stepsEl.querySelector(`[data-step-id="${id}"]`)?.remove();
    if (!tcSteps.length) {
      activeStepId = null;
      emptyEl.style.display = '';
    } else {
      const newActive = tcSteps[Math.min(idx, tcSteps.length - 1)]._id;
      setActiveStep(newActive);
    }
    renderStepTabs();
    updateBtns();
  }

  function moveStep(id, dir) {
    const idx = tcSteps.findIndex(s => s._id === id);
    if (idx < 0) return;
    moveStepTo(id, idx + dir);
  }

  function moveStepTo(id, toIndex) {
    const fromIndex = tcSteps.findIndex(s => s._id === id);
    if (fromIndex < 0) return;
    const boundedIndex = Math.max(0, Math.min(toIndex, tcSteps.length - 1));
    if (fromIndex === boundedIndex) return;
    const [step] = tcSteps.splice(fromIndex, 1);
    tcSteps.splice(boundedIndex, 0, step);
    syncStepCardOrder();
    renderStepTabs();
  }

  function syncStepCardOrder() {
    tcSteps.forEach(step => {
      const card = stepsEl.querySelector(`.builder-step-card[data-step-id="${step._id}"]`);
      if (card) stepsEl.appendChild(card);
    });
  }

  // ── Tab management ──
  function setActiveStep(id) {
    activeStepId = id;
    stepsEl.querySelectorAll('.builder-step-card').forEach(c => {
      c.classList.toggle('bldr-active', c.dataset.stepId === String(id));
    });
  }

  function renderStepTabs() {
    stepTabsEl.innerHTML = '';
    tcSteps.forEach((s, i) => {
      const tab = document.createElement('div');
      tab.className = 'bldr-step-tab' + (s._id === activeStepId ? ' active' : '');
      tab.draggable = true;
      tab.dataset.stepId = s._id;
      tab.setAttribute('role', 'button');
      tab.setAttribute('tabindex', '0');
      const typeShort = s.type.replace('websocket_', 'ws_').replace('fake_', 'f_').replace('_request', '').replace('_unary', '');
      const label = s.stepDescription ? ` - ${s.stepDescription}` : '';
      tab.innerHTML = `<span>Step ${i + 1}</span><span class="bldr-tab-type">${typeShort}${X(label)}</span><button class="bldr-tab-close" type="button" title="Remove">×</button>`;
      tab.addEventListener('click', e => {
        if (e.target.classList.contains('bldr-tab-close')) return;
        setActiveStep(s._id);
        renderStepTabs();
      });
      tab.addEventListener('keydown', e => {
        if (e.target.classList.contains('bldr-tab-close')) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        setActiveStep(s._id);
        renderStepTabs();
      });
      tab.addEventListener('dragstart', e => {
        if (e.target.classList.contains('bldr-tab-close')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(s._id));
        tab.classList.add('bldr-tab-dragging');
      });
      tab.addEventListener('dragend', () => {
        stepTabsEl.querySelectorAll('.bldr-step-tab').forEach(el => {
          el.classList.remove('bldr-tab-dragging', 'bldr-tab-drop-before', 'bldr-tab-drop-after');
        });
      });
      tab.addEventListener('dragover', e => {
        e.preventDefault();
        const rect = tab.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        stepTabsEl.querySelectorAll('.bldr-step-tab').forEach(el => {
          el.classList.remove('bldr-tab-drop-before', 'bldr-tab-drop-after');
        });
        tab.classList.add(before ? 'bldr-tab-drop-before' : 'bldr-tab-drop-after');
        e.dataTransfer.dropEffect = 'move';
      });
      tab.addEventListener('dragleave', () => {
        tab.classList.remove('bldr-tab-drop-before', 'bldr-tab-drop-after');
      });
      tab.addEventListener('drop', e => {
        e.preventDefault();
        const draggedId = Number(e.dataTransfer.getData('text/plain'));
        if (!draggedId || draggedId === s._id) return;
        const rect = tab.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        let targetIndex = tcSteps.findIndex(step => step._id === s._id);
        const fromIndex = tcSteps.findIndex(step => step._id === draggedId);
        if (targetIndex < 0 || fromIndex < 0) return;
        if (!before) targetIndex += 1;
        if (fromIndex < targetIndex) targetIndex -= 1;
        moveStepTo(draggedId, targetIndex);
        setActiveStep(draggedId);
        renderStepTabs();
      });
      tab.querySelector('.bldr-tab-close').addEventListener('click', async e => {
        e.stopPropagation();
        if (!await showConfirm('Delete Step', `Remove Step ${i + 1} (${s.type})?`)) return;
        removeStep(s._id);
      });
      stepTabsEl.appendChild(tab);
    });
    // update ↑↓ disabled state on active card
    const cards = stepsEl.querySelectorAll('.builder-step-card');
    cards.forEach((c, i) => {
      c.querySelector('.bldr-up-btn')?.setAttribute('disabled', i === 0 ? '' : null);
      c.querySelector('.bldr-dn-btn')?.setAttribute('disabled', i === cards.length - 1 ? '' : null);
      if (i === 0) c.querySelector('.bldr-up-btn')?.setAttribute('disabled', '');
      else c.querySelector('.bldr-up-btn')?.removeAttribute('disabled');
      if (i === cards.length - 1) c.querySelector('.bldr-dn-btn')?.setAttribute('disabled', '');
      else c.querySelector('.bldr-dn-btn')?.removeAttribute('disabled');
    });
    // update step num label
    stepsEl.querySelectorAll('.builder-step-card').forEach((c, i) => {
      const el = c.querySelector('.bldr-step-num');
      if (el) el.textContent = `Step ${i + 1}`;
    });
  }

  function updateBtns() {
    const has = tcSteps.length > 0;
    runAllBtn.disabled = !has;
    saveBtn.disabled   = !has;
  }

  function resetBuilder() {
    document.getElementById('tc-name').value = '';
    document.getElementById('tc-description').value = '';
    document.getElementById('tc-category').value = '';
    document.getElementById('tc-timeout').value = 30000;

    tcSteps = [];
    stepSeq = 0;
    activeStepId = null;
    stepsEl.querySelectorAll('.builder-step-card').forEach(c => c.remove());
    stepTabsEl.innerHTML = '';
    emptyEl.style.display = '';
    setMsg('', '');
    updateBtns();
    stepsEl.parentElement?.scrollTo(0, 0);
  }

  // ── Build card HTML ──
  function cardHTML(s) {
    return `
      <div class="bldr-card-header">
        <span class="bldr-step-num"></span>
        <button class="btn btn-primary btn-sm bldr-run-step-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon bldr-run-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icon bldr-spin-icon" style="display:none"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <span class="bldr-run-label">Run Step</span>
        </button>
        <select class="exp-select bldr-type-select" style="width:175px;font-size:12px;padding:5px 28px 5px 8px">${typeSelectHTML(s.type)}</select>
        <input class="exp-input bldr-step-desc-input" value="${X(s.stepDescription)}" placeholder="Step description" title="Step Description">
        <div class="bldr-card-controls">
          <button class="btn btn-sm bldr-up-btn" title="Move up">↑</button>
          <button class="btn btn-sm bldr-dn-btn" title="Move down">↓</button>
          <button class="btn btn-sm bldr-del-btn" title="Remove" style="border-color:rgba(239,68,68,0.3);color:var(--neon-danger)">×</button>
        </div>
      </div>
      <div class="bldr-card-body" style="display: flex; gap: 0;">
        <div class="bldr-card-section bldr-data-section" style="flex: 1; min-width: 0; border-right: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; display: flex; flex-direction: column;">
          <div class="bldr-data-header">
            <span class="bldr-data-title" style="font-size: 13px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Step Request</span>
            <button class="icon-btn bldr-horizontal-toggle" type="button" data-target="bldr-data-wrap-${s._id}" style="width:24px;height:24px;border:none;background:transparent;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="transition: transform 0.2s ease;"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
          </div>
          <div id="bldr-data-wrap-${s._id}" class="bldr-data-wrap" style="flex: 1;">
            <div class="bldr-card-form">${formHTML(s)}</div>
            <div class="bldr-ae-wrapper"></div>
          </div>
        </div>
        <div class="bldr-card-section bldr-response-section" id="bldr-result-section-${s._id}" style="display:none; flex: 1; min-width: 0; padding-bottom: 8px;">
          <div class="bldr-data-header">
            <span class="bldr-data-title" style="font-size: 13px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Step Response</span>
            <button class="icon-btn bldr-horizontal-toggle" type="button" data-target="bldr-result-wrap-${s._id}" style="width:24px;height:24px;border:none;background:transparent;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="transition: transform 0.2s ease;"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
          </div>
          <div id="bldr-result-wrap-${s._id}" class="bldr-data-wrap" style="flex: 1;">
            <div class="bldr-card-result"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Form HTML per executor type ──
  function formHTML(s) {
    switch (s.type) {
      case 'grpc_unary':        return fGrpc(s);
      case 'http_request':      return fHttp(s);
      case 'websocket_connect': return fWsConn(s);
      case 'websocket_send':    return fWsSend(s);
      case 'websocket_await':   return fWsAwait(s);
      case 'websocket_close':   return fWsClose(s);
      case 'db_check':          return fDb(s);
      case 'delay':             return fDelay(s);
      case 'include':           return fInclude(s);
      case 'group':             return fGroup(s);
      case 'fake_grpc_start':   return fFakeGrpcStart(s);
      case 'fake_grpc_stop':    return fFakeGrpcStop(s);
      case 'fake_http_start':   return fFakeHttpStart(s);
      case 'fake_http_stop':    return fFakeHttpStop(s);
      default: return '<div class="exp-section"><em>Unknown type</em></div>';
    }
  }

  function fGrpc(s) {
    const svcOpts = s.services.map(sv =>
      `<option value="${X(sv.full)}"${s.selectedService===sv.full?' selected':''}>${X(sv.name)}</option>`
    ).join('');
    const mtdOpts = (s.services.find(sv=>sv.full===s.selectedService)?.methods||[]).map(m =>
      `<option value="${X(m)}"${s.selectedMethod===m?' selected':''}>${X(m)}</option>`
    ).join('');
    const metaRows = s.metadata.map((r,i) => metaRowHTML(r,i)).join('');
    return `
      <div class="exp-section">
        <div class="bldr-proxy-bar">
          <label class="exp-label" style="margin:0">Endpoint</label>
          <label class="bldr-proxy-label"><input type="checkbox" class="bldr-proxy-check"${s.proxyMode?' checked':''}> Via Proxy</label>
        </div>
        ${s.proxyMode ? `
          <div class="exp-row" style="margin-top:6px">
            <input class="exp-input exp-input-grow bldr-proxy-ep-in" value="${X(s.proxyEndpoint)}" placeholder="localhost:50055 (query server)"/>
          </div>
        ` : `
          <div class="exp-row" style="margin-top:6px">
            <input class="exp-input exp-input-grow bldr-ep-in" value="${X(s.endpoint)}" placeholder="localhost:50052"/>
            <button class="btn btn-accent bldr-connect-btn">Connect</button>
          </div>
        `}
        <div class="bldr-connect-status exp-connect-status" style="margin-top:4px"></div>
      </div>
      <div class="exp-section">
        ${s.proxyMode ? `
          <div class="exp-two-col">
            <div>
              <label class="exp-label">Service <span class="exp-optional">(manual)</span></label>
              <input class="exp-input bldr-svc-in" value="${X(s.selectedService)}" placeholder="package.ServiceName"/>
            </div>
            <div>
              <label class="exp-label">Method <span class="exp-optional">(manual)</span></label>
              <input class="exp-input bldr-mtd-in" value="${X(s.selectedMethod)}" placeholder="MethodName"/>
            </div>
          </div>
        ` : `
          <div class="exp-two-col">
            <div>
              <label class="exp-label">Service</label>
              <select class="exp-select bldr-svc-sel"${s.services.length?'':' disabled'}>
                <option value="">— connect first —</option>${svcOpts}
              </select>
            </div>
            <div>
              <label class="exp-label">Method</label>
              <select class="exp-select bldr-mtd-sel"${s.selectedService?'':' disabled'}>
                <option value="">— select service —</option>${mtdOpts}
              </select>
            </div>
          </div>
        `}
        ${s.proxyMode ? `
          <label class="exp-label" style="margin-top:10px">Proto Files <span class="exp-optional">(optional)</span></label>
          <div class="exp-row">
            <input class="exp-input exp-input-grow bldr-protos-in" value="${X(s.protoFiles)}" placeholder="../distributeproto/ClassicalBaccaratManagement.proto"/>
            <button class="btn btn-accent btn-sm bldr-browse-proto-btn" type="button">Browse</button>
          </div>
        ` : ''}
      </div>
      <div class="exp-section">
        <div class="exp-section-header">
          <label class="exp-label">Metadata <span class="exp-optional">(optional)</span></label>
          <button class="btn btn-sm bldr-add-meta-btn">+ Add</button>
        </div>
        <div class="exp-meta-rows bldr-meta-rows">${metaRows}</div>
      </div>
      <div class="exp-section" style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px">
        <label class="exp-label">Payload <span class="exp-optional">(JSON)</span></label>
        <textarea class="exp-textarea bldr-payload-ta" spellcheck="false" style="min-height:200px">${X(s.payload)}</textarea>
      </div>`;
  }

  function fHttp(s) {
    const methods = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
    const mOpts = methods.map(m=>`<option${s.httpMethod===m?' selected':''}>${m}</option>`).join('');
    const hRows = s.headers.map((h,i)=>metaRowHTML(h,i,'Content-Type','application/json')).join('');
    return `
      <div class="exp-section">
        <div class="exp-row">
          <select class="exp-select bldr-http-method-sel" style="width:110px">${mOpts}</select>
          <input class="exp-input exp-input-grow bldr-url-in" value="${X(s.url)}" placeholder="http://localhost:8080/api/v1/..."/>
        </div>
      </div>
      <div class="exp-section">
        <div class="exp-section-header">
          <label class="exp-label">Headers</label>
          <button class="btn btn-sm bldr-add-header-btn">+ Add</button>
        </div>
        <div class="exp-meta-rows bldr-header-rows">${hRows}</div>
      </div>
      <div class="exp-section" style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px">
        <label class="exp-label">Body <span class="exp-optional">(JSON, optional)</span></label>
        <textarea class="exp-textarea bldr-http-body-ta" spellcheck="false" style="min-height:260px">${X(s.httpBody)}</textarea>
      </div>`;
  }

  function fWsConn(s) {
    const hRows = s.wsHeaders.map((h,i)=>metaRowHTML(h,i,'Authorization','Bearer ...')).join('');
    return `
      <div class="exp-section">
        <label class="exp-label">URL</label>
        <input class="exp-input bldr-ws-url-in" style="width:100%" value="${X(s.wsUrl)}" placeholder="ws://localhost:8080/api/v1/external/connect?ticket=..."/>
      </div>
      <div class="exp-section">
        <div class="exp-section-header">
          <label class="exp-label">Headers <span class="exp-optional">(optional)</span></label>
          <button class="btn btn-sm bldr-add-wsh-btn">+ Add</button>
        </div>
        <div class="exp-meta-rows bldr-wsh-rows">${hRows}</div>
      </div>
      <div class="exp-section" style="padding-bottom:12px">
        <p class="bldr-hint">After connecting, <code>conn_id</code> is returned. Export it with <code>${'${ctx.ws_conn}'}</code> and reference it in send/await/close steps.</p>
      </div>`;
  }

  function fWsSend(s) {
    return `
      <div class="exp-section">
        <label class="exp-label">Connection ID</label>
        <input class="exp-input bldr-ws-conn-in" style="width:100%" value="${X(s.wsConnId)}" placeholder="\${ctx.ws_conn}"/>
      </div>
      <div class="exp-section" style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px">
        <label class="exp-label">Payload <span class="exp-optional">(JSON)</span></label>
        <textarea class="exp-textarea bldr-ws-payload-ta" rows="5" spellcheck="false">${X(s.wsPayload)}</textarea>
      </div>`;
  }

  function fWsAwait(s) {
    return `
      <div class="exp-section">
        <label class="exp-label">Connection ID</label>
        <input class="exp-input bldr-ws-conn-in" style="width:100%" value="${X(s.wsConnId)}" placeholder="\${ctx.ws_conn}"/>
      </div>
      <div class="exp-section">
        <div class="exp-two-col">
          <div>
            <label class="exp-label">Match Path</label>
            <input class="exp-input bldr-ws-mpath-in" value="${X(s.wsMatchPath)}" placeholder="Type"/>
          </div>
          <div>
            <label class="exp-label">Equals</label>
            <input class="exp-input bldr-ws-meq-in" value="${X(s.wsMatchEquals)}" placeholder="presence"/>
          </div>
        </div>
      </div>
      <div class="exp-section" style="padding-bottom:12px">
        <label class="exp-label">Timeout (ms)</label>
        <input class="exp-input bldr-ws-timeout-in" type="number" value="${s.wsTimeoutMs}" style="width:120px"/>
      </div>`;
  }

  function fWsClose(s) {
    return `
      <div class="exp-section" style="padding-bottom:12px">
        <label class="exp-label">Connection ID</label>
        <input class="exp-input bldr-ws-conn-in" style="width:100%" value="${X(s.wsConnId)}" placeholder="\${ctx.ws_conn}"/>
      </div>`;
  }

  function fDb(s) {
    const drivers = ['postgres','mysql','sqlite'];
    const dOpts = drivers.map(d=>`<option${s.dbDriver===d?' selected':''}>${d}</option>`).join('');
    return `
      <div class="exp-section">
        <div class="exp-two-col">
          <div>
            <label class="exp-label">Driver</label>
            <select class="exp-select bldr-db-driver-sel">${dOpts}</select>
          </div>
          <div>
            <label class="exp-label">DSN</label>
            <div class="exp-row">
              <input class="exp-input exp-input-grow bldr-db-dsn-in" value="${X(s.dbDsn)}" placeholder="host=127.0.0.1 port=5432 user=baccarat password=666666 dbname=baccarat_game sslmode=disable"/>
              <button class="btn btn-accent btn-sm bldr-db-dsn-edit-btn" type="button">Edit</button>
            </div>
          </div>
        </div>
      </div>
      <div class="exp-section" style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px">
        <label class="exp-label">SQL</label>
        <textarea class="exp-textarea bldr-db-sql-ta" rows="4" spellcheck="false">${X(s.dbSql)}</textarea>
      </div>`;
  }

  function fDelay(s) {
    return `
      <div class="exp-section" style="padding-bottom:12px">
        <label class="exp-label">Duration (ms)</label>
        <input class="exp-input bldr-delay-in" type="number" value="${s.durationMs}" min="0" style="width:140px"/>
      </div>`;
  }

  function fInclude(s) {
    return `
      <div class="exp-section" style="padding-bottom:12px">
        <label class="exp-label">File Path <span class="exp-optional">(.json or .yaml)</span></label>
        <input class="exp-input bldr-include-in" style="width:100%" value="${X(s.includePath)}" placeholder="config/fake.yaml"/>
      </div>`;
  }

  function fGroup(s) {
    return `
      <div class="exp-section" style="padding-bottom:12px">
        <label class="exp-label">Group File</label>
        <input class="exp-input bldr-group-in" style="width:100%" value="${X(s.groupFile)}" placeholder="testcases/fake/groups/fake_http_login.json"/>
      </div>`;
  }

  function fFakeGrpcStart(s) {
    return `
      <div class="exp-section">
        <div class="exp-row" style="gap:12px;align-items:flex-end">
          <div style="flex-shrink:0">
            <label class="exp-label">Port</label>
            <input class="exp-input bldr-fgrpc-port-in" type="number" value="${s.fakeGrpcPort}" style="width:90px"/>
          </div>
          <div style="flex:1">
            <label class="exp-label">Proto Files <span class="exp-optional">(comma-separated)</span></label>
            <input class="exp-input bldr-fgrpc-protos-in" value="${X(s.fakeGrpcProtos)}" placeholder="proto/fake/service.proto"/>
          </div>
        </div>
      </div>
      <div class="exp-section" style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px">
        <label class="exp-label">Responses <span class="exp-optional">(JSON: "Service/Method" → body)</span></label>
        <textarea class="exp-textarea bldr-fgrpc-resp-ta" spellcheck="false" style="min-height:280px">${X(s.fakeGrpcResponses)}</textarea>
      </div>`;
  }

  function fFakeGrpcStop(s) {
    return `
      <div class="exp-section" style="padding-bottom:12px">
        <label class="exp-label">Address <span class="exp-optional">(from start step exports)</span></label>
        <input class="exp-input bldr-fgrpc-addr-in" style="width:100%" value="${X(s.fakeGrpcAddr)}" placeholder="\${ctx.grpc_addr}"/>
      </div>`;
  }

  function fFakeHttpStart(s) {
    return `
      <div class="exp-section" style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px">
        <div class="exp-row" style="justify-content:space-between;align-items:center">
          <label class="exp-label" style="margin:0">Routes <span class="exp-optional">(JSON array)</span></label>
          <div style="display:flex;align-items:center;gap:8px">
            <label class="exp-label" style="margin:0;white-space:nowrap">Port</label>
            <input class="exp-input bldr-fhttp-port-in" type="number" value="${s.fakeHttpPort}" style="width:90px"/>
          </div>
        </div>
        <textarea class="exp-textarea bldr-fhttp-routes-ta" spellcheck="false" style="min-height:320px">${X(s.fakeHttpRoutes)}</textarea>
      </div>`;
  }

  function fFakeHttpStop(s) {
    return `
      <div class="exp-section" style="padding-bottom:12px">
        <label class="exp-label">URL</label>
        <input class="exp-input bldr-fhttp-url-in" style="width:100%" value="${X(s.fakeHttpUrl)}" placeholder="\${ctx.http_addr}"/>
      </div>`;
  }

  // ── Metadata row HTML helper ──
  function metaRowHTML(r, i, kph='key', vph='value') {
    return `<div class="exp-meta-row" data-mi="${i}">
      <input class="exp-input meta-key" value="${X(r.k)}" placeholder="${kph}"/>
      <input class="exp-input meta-val" value="${X(r.v)}" placeholder="${vph}"/>
      <button class="exp-remove-meta bldr-rm-row" data-mi="${i}">×</button>
    </div>`;
  }

  // ── Attach card events ──
  function attachCard(card, s) {
    card.querySelector('.bldr-type-select').addEventListener('change', e => {
      s.type = e.target.value;
      card.querySelector('.bldr-card-form').innerHTML = formHTML(s);
      attachForm(card, s);
      renderStepTabs(); // update tab label to reflect new type
    });
    bind(card, '.bldr-step-desc-input', 'input', e => {
      s.stepDescription = e.target.value.trim();
      renderStepTabs();
    });
    card.querySelector('.bldr-up-btn').addEventListener('click', () => moveStep(s._id, -1));
    card.querySelector('.bldr-dn-btn').addEventListener('click', () => moveStep(s._id,  1));
    card.querySelector('.bldr-del-btn').addEventListener('click', async () => {
      const idx = tcSteps.findIndex(t => t._id === s._id);
      if (!await showConfirm('Delete Step', `Remove Step ${idx + 1} (${s.type})?`)) return;
      removeStep(s._id);
    });
    card.querySelector('.bldr-run-step-btn').addEventListener('click', () => runStep(s, card));
    
    card.querySelectorAll('.bldr-horizontal-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.closest('.bldr-card-section');
        if (section) {
          section.classList.toggle('bldr-collapsed');
        }
      });
    });
    
    // Kept for other section toggles if any
    card.querySelectorAll('.bldr-section-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) {
          const open = target.style.display === 'none';
          target.style.display = open ? '' : 'none';
          btn.classList.toggle('bldr-ae-open', open);
        }
      });
    });

    attachForm(card, s);
  }

  function attachForm(card, s) {
    switch (s.type) {
      case 'grpc_unary':        attachGrpc(card, s); break;
      case 'http_request':      attachHttp(card, s); break;
      case 'websocket_connect': attachWsConn(card, s); break;
      case 'websocket_send':    attachWsSend(card, s); break;
      case 'websocket_await':   attachWsAwait(card, s); break;
      case 'websocket_close':   bind(card, '.bldr-ws-conn-in', 'input', e => s.wsConnId = e.target.value); break;
      case 'db_check':          attachDb(card, s); break;
      case 'delay':             bind(card, '.bldr-delay-in', 'input', e => s.durationMs = +e.target.value || 0); break;
      case 'include':           bind(card, '.bldr-include-in', 'input', e => s.includePath = e.target.value); break;
      case 'group':             bind(card, '.bldr-group-in', 'input', e => s.groupFile = e.target.value); break;
      case 'fake_grpc_start':   attachFakeGrpcStart(card, s); break;
      case 'fake_grpc_stop':    bind(card, '.bldr-fgrpc-addr-in', 'input', e => s.fakeGrpcAddr = e.target.value); break;
      case 'fake_http_start':   attachFakeHttpStart(card, s); break;
      case 'fake_http_stop':    bind(card, '.bldr-fhttp-url-in', 'input', e => s.fakeHttpUrl = e.target.value); break;
    }
  }

  // ── Assertions & Exports ──
  function renderAE(card, s) {
    const wrapper = card.querySelector('.bldr-ae-wrapper');
    if (!wrapper) return;

    function assertRowHTML(a, i) {
      return `<div class="bldr-ae-row" data-ai="${i}">
        <select class="exp-select bldr-assert-type-sel" style="width:95px;font-size:12px;padding:4px 24px 4px 6px">
          <option value="json_path"${a.type==='json_path'?' selected':''}>json_path</option>
        </select>
        <input class="exp-input bldr-assert-path-in" value="${X(a.path)}" placeholder="response.status" title="JSON path"/>
        <input class="exp-input bldr-assert-eq-in"   value="${X(String(a.expect??''))}" placeholder="expected value" title="Expected value" style="width:130px"/>
        <button class="exp-remove-meta bldr-rm-assert" data-ai="${i}">×</button>
      </div>`;
    }

    function exportRowHTML(e, i) {
      return `<div class="bldr-ae-row" data-ei="${i}">
        <input class="exp-input bldr-export-path-in" value="${X(e.path)}" placeholder="response.conn_id" title="Extract path"/>
        <span class="bldr-ae-arrow">→</span>
        <input class="exp-input bldr-export-as-in"   value="${X(e.as)}"   placeholder="ctx.ws_conn"     title="Context variable"/>
        <button class="exp-remove-meta bldr-rm-export" data-ei="${i}">×</button>
      </div>`;
    }

    function rerender() {
      wrapper.innerHTML = `
        <div class="bldr-ae-section">
          <div class="bldr-ae-header">
            <button class="bldr-ae-toggle ${s.asserts.length?'bldr-ae-open':''}" data-target="bldr-asserts-${s._id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:12px;height:12px"><polyline points="9 18 15 12 9 6"/></svg>
              Assertions <span class="bldr-ae-count">${s.asserts.length||''}</span>
            </button>
            <button class="btn btn-sm bldr-add-assert-btn">+ Add</button>
          </div>
          <div class="bldr-ae-rows" id="bldr-asserts-${s._id}" style="${s.asserts.length?'':'display:none'}">
            ${s.asserts.map(assertRowHTML).join('')}
          </div>
        </div>
        <div class="bldr-ae-section">
          <div class="bldr-ae-header">
            <button class="bldr-ae-toggle ${s.exports.length?'bldr-ae-open':''}" data-target="bldr-exports-${s._id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:12px;height:12px"><polyline points="9 18 15 12 9 6"/></svg>
              Exports <span class="bldr-ae-count">${s.exports.length||''}</span>
            </button>
            <button class="btn btn-sm bldr-add-export-btn">+ Add</button>
          </div>
          <div class="bldr-ae-rows" id="bldr-exports-${s._id}" style="${s.exports.length?'':'display:none'}">
            ${s.exports.map(exportRowHTML).join('')}
          </div>
        </div>`;

      // Toggle buttons
      wrapper.querySelectorAll('.bldr-ae-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(btn.dataset.target);
          const open   = target.style.display === 'none';
          target.style.display = open ? '' : 'none';
          btn.classList.toggle('bldr-ae-open', open);
        });
      });

      // Add assertion
      wrapper.querySelector('.bldr-add-assert-btn').addEventListener('click', () => {
        s.asserts.push({ type: 'json_path', path: '', expect: '' });
        document.getElementById(`bldr-asserts-${s._id}`).style.display = '';
        wrapper.querySelector(`[data-target="bldr-asserts-${s._id}"]`).classList.add('bldr-ae-open');
        rerender();
      });

      // Add export
      wrapper.querySelector('.bldr-add-export-btn').addEventListener('click', () => {
        s.exports.push({ path: '', as: '' });
        document.getElementById(`bldr-exports-${s._id}`).style.display = '';
        wrapper.querySelector(`[data-target="bldr-exports-${s._id}"]`).classList.add('bldr-ae-open');
        rerender();
      });

      // Assert row events
      wrapper.querySelectorAll('.bldr-ae-row[data-ai]').forEach(row => {
        const i = +row.dataset.ai;
        row.querySelector('.bldr-assert-type-sel')?.addEventListener('change', e => { s.asserts[i].type   = e.target.value; });
        row.querySelector('.bldr-assert-path-in')?.addEventListener('input',  e => { s.asserts[i].path   = e.target.value; });
        row.querySelector('.bldr-assert-eq-in')?.addEventListener('input',    e => { s.asserts[i].expect = e.target.value; });
        row.querySelector('.bldr-rm-assert')?.addEventListener('click', () => { s.asserts.splice(i,1); rerender(); });
      });

      // Export row events
      wrapper.querySelectorAll('.bldr-ae-row[data-ei]').forEach(row => {
        const i = +row.dataset.ei;
        row.querySelector('.bldr-export-path-in')?.addEventListener('input', e => { s.exports[i].path = e.target.value; });
        row.querySelector('.bldr-export-as-in')?.addEventListener('input',   e => { s.exports[i].as   = e.target.value; });
        row.querySelector('.bldr-rm-export')?.addEventListener('click', () => { s.exports.splice(i,1); rerender(); });
      });
    }

    rerender();
  }

  function attachGrpc(card, s) {
    bind(card, '.bldr-proxy-check', 'change', e => {
      s.proxyMode = e.target.checked;
      card.querySelector('.bldr-card-form').innerHTML = formHTML(s);
      attachForm(card, s);
    });
    bind(card, '.bldr-ep-in',       'input', e => s.endpoint       = e.target.value);
    bind(card, '.bldr-proxy-ep-in', 'input', e => s.proxyEndpoint  = e.target.value);
    bind(card, '.bldr-svc-in',      'input', e => s.selectedService = e.target.value.trim());
    bind(card, '.bldr-mtd-in',      'input', e => s.selectedMethod  = e.target.value.trim());
    bind(card, '.bldr-protos-in',   'input', e => s.protoFiles      = e.target.value);
    bind(card, '.bldr-browse-proto-btn', 'click', () => openProtoPicker(s, card));
    bind(card, '.bldr-payload-ta',  'input', e => s.payload        = e.target.value);

    const connectBtn = card.querySelector('.bldr-connect-btn');
    if (connectBtn) connectBtn.addEventListener('click', async () => {
      const ep = s.proxyMode ? s.proxyEndpoint : s.endpoint;
      if (!ep) return;
      const statusEl = card.querySelector('.bldr-connect-status');
      statusEl.textContent = 'Connecting…'; statusEl.className = 'bldr-connect-status exp-connect-status loading';
      connectBtn.disabled = true;
      try {
        const res = await fetch('/api/explore/reflect', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({endpoint: ep})
        });
        const data = await res.json();
        if (!res.ok || !data?.length) {
          statusEl.textContent = data?.error || 'No services found'; statusEl.className = 'bldr-connect-status exp-connect-status error'; return;
        }
        s.services = data; s.selectedService = ''; s.selectedMethod = '';
        card.querySelector('.bldr-card-form').innerHTML = formHTML(s);
        attachForm(card, s);
        card.querySelector('.bldr-connect-status').textContent = `✓ ${data.length} service${data.length>1?'s':''} found`;
        card.querySelector('.bldr-connect-status').className = 'bldr-connect-status exp-connect-status success';
      } catch(err) {
        statusEl.textContent = err.message; statusEl.className = 'bldr-connect-status exp-connect-status error';
      } finally { connectBtn.disabled = false; }
    });

    const svcSel = card.querySelector('.bldr-svc-sel');
    if (svcSel) svcSel.addEventListener('change', () => {
      s.selectedService = svcSel.value; s.selectedMethod = '';
      card.querySelector('.bldr-card-form').innerHTML = formHTML(s);
      attachForm(card, s);
    });
    bind(card, '.bldr-mtd-sel', 'change', e => s.selectedMethod = e.target.value);
    attachMetaRows(card, s, '.bldr-meta-rows', '.bldr-add-meta-btn', s.metadata);
  }

  function attachHttp(card, s) {
    bind(card, '.bldr-http-method-sel', 'change', e => s.httpMethod = e.target.value);
    bind(card, '.bldr-url-in',          'input',  e => s.url        = e.target.value);
    bind(card, '.bldr-http-body-ta',    'input',  e => s.httpBody   = e.target.value);
    attachMetaRows(card, s, '.bldr-header-rows', '.bldr-add-header-btn', s.headers);
  }

  function attachWsConn(card, s) {
    bind(card, '.bldr-ws-url-in', 'input', e => s.wsUrl = e.target.value);
    attachMetaRows(card, s, '.bldr-wsh-rows', '.bldr-add-wsh-btn', s.wsHeaders);
  }

  function attachWsSend(card, s) {
    bind(card, '.bldr-ws-conn-in',    'input', e => s.wsConnId  = e.target.value);
    bind(card, '.bldr-ws-payload-ta', 'input', e => s.wsPayload = e.target.value);
  }

  function attachWsAwait(card, s) {
    bind(card, '.bldr-ws-conn-in',    'input', e => s.wsConnId      = e.target.value);
    bind(card, '.bldr-ws-mpath-in',   'input', e => s.wsMatchPath   = e.target.value);
    bind(card, '.bldr-ws-meq-in',     'input', e => s.wsMatchEquals = e.target.value);
    bind(card, '.bldr-ws-timeout-in', 'input', e => s.wsTimeoutMs   = +e.target.value || 5000);
  }

  function attachDb(card, s) {
    bind(card, '.bldr-db-driver-sel', 'change', e => s.dbDriver = e.target.value);
    bind(card, '.bldr-db-dsn-in',     'input',  e => s.dbDsn    = e.target.value);
    bind(card, '.bldr-db-dsn-edit-btn', 'click', () => openDbDsnEditor(s, card));
    bind(card, '.bldr-db-sql-ta',     'input',  e => s.dbSql    = e.target.value);
  }

  function attachFakeGrpcStart(card, s) {
    bind(card, '.bldr-fgrpc-port-in',  'input', e => s.fakeGrpcPort      = +e.target.value || 19091);
    bind(card, '.bldr-fgrpc-protos-in','input', e => s.fakeGrpcProtos    = e.target.value);
    bind(card, '.bldr-fgrpc-resp-ta',  'input', e => s.fakeGrpcResponses = e.target.value);
  }

  function attachFakeHttpStart(card, s) {
    bind(card, '.bldr-fhttp-port-in',  'input', e => s.fakeHttpPort   = +e.target.value || 18080);
    bind(card, '.bldr-fhttp-routes-ta','input', e => s.fakeHttpRoutes = e.target.value);
  }

  // ── Generic metadata/header row manager ──
  function attachMetaRows(card, s, rowsSel, addSel, arr) {
    function rerender() {
      const rowsEl = card.querySelector(rowsSel);
      if (!rowsEl) return;
      rowsEl.innerHTML = arr.map((r,i) => metaRowHTML(r,i)).join('');
      rowsEl.querySelectorAll('.exp-meta-row').forEach(row => {
        const i = +row.dataset.mi;
        row.querySelector('.meta-key').addEventListener('input', e => { arr[i].k = e.target.value; });
        row.querySelector('.meta-val').addEventListener('input', e => { arr[i].v = e.target.value; });
        row.querySelector('.bldr-rm-row').addEventListener('click', () => { arr.splice(i,1); rerender(); });
      });
    }
    const addB = card.querySelector(addSel);
    if (addB) addB.addEventListener('click', () => { arr.push({k:'',v:''}); rerender(); });
    // attach events to initially rendered rows
    const rowsEl = card.querySelector(rowsSel);
    if (rowsEl) rowsEl.querySelectorAll('.exp-meta-row').forEach(row => {
      const i = +row.dataset.mi;
      if (i < 0 || i >= arr.length) return;
      row.querySelector('.meta-key')?.addEventListener('input', e => { arr[i].k = e.target.value; });
      row.querySelector('.meta-val')?.addEventListener('input', e => { arr[i].v = e.target.value; });
      row.querySelector('.bldr-rm-row')?.addEventListener('click', () => { arr.splice(i,1); rerender(); });
    });
  }

  // ── Collect action from step state ──
  function collectAction(s) {
    switch (s.type) {
      case 'grpc_unary': {
        const meta = {};
        s.metadata.forEach(r => { if (r.k) meta[r.k] = r.v; });
        const a = {
          endpoint: s.proxyMode ? s.proxyEndpoint : s.endpoint,
          service:  s.selectedService,
          method:   s.selectedMethod,
          payload:  tryJSON(s.payload, {}),
        };
        const protoFiles = s.protoFiles.split(',').map(p => p.trim()).filter(Boolean);
        if (Object.keys(meta).length) a.metadata = meta;
        if (protoFiles.length) a.proto_files = protoFiles;
        return a;
      }
      case 'http_request': {
        const hdrs = {};
        s.headers.forEach(h => { if (h.k) hdrs[h.k] = h.v; });
        const a = { method: s.httpMethod, url: s.url };
        if (Object.keys(hdrs).length) a.headers = hdrs;
        const b = s.httpBody.trim();
        if (b) a.payload = tryJSON(b, b);
        return a;
      }
      case 'websocket_connect': {
        const hdrs = {};
        s.wsHeaders.forEach(h => { if (h.k) hdrs[h.k] = h.v; });
        const a = { url: s.wsUrl };
        if (Object.keys(hdrs).length) a.headers = hdrs;
        return a;
      }
      case 'websocket_send':
        return { conn_id: s.wsConnId, payload: tryJSON(s.wsPayload, {}) };
      case 'websocket_await':
        return { conn_id: s.wsConnId, match: { path: s.wsMatchPath, equals: parseScalar(s.wsMatchEquals) }, timeout_ms: s.wsTimeoutMs };
      case 'websocket_close':
        return { conn_id: s.wsConnId };
      case 'db_check':
        return { driver: s.dbDriver, dsn: s.dbDsn, sql: s.dbSql };
      case 'delay':
        return { duration_ms: s.durationMs };
      case 'include':
        return { file_path: s.includePath };
      case 'group':
        return { file: s.groupFile };
      case 'fake_grpc_start':
        return { port: s.fakeGrpcPort, proto_files: s.fakeGrpcProtos.split(',').map(p=>p.trim()).filter(Boolean), responses: tryJSON(s.fakeGrpcResponses, {}) };
      case 'fake_grpc_stop':
        return { addr: s.fakeGrpcAddr };
      case 'fake_http_start':
        return { port: s.fakeHttpPort, routes: tryJSON(s.fakeHttpRoutes, []) };
      case 'fake_http_stop':
        return { url: s.fakeHttpUrl };
      default: return {};
    }
  }

  function buildStepJSON(s, index = tcSteps.indexOf(s)) {
    const obj = { step_id: String(index + 1), type: s.type, action: collectAction(s) };
    if (s.stepDescription) obj.description = s.stepDescription;
    if (s.asserts?.length) {
      obj.asserts = s.asserts
        .filter(a => a.path)
        .map(a => ({ type: a.type || 'json_path', path: a.path, expect: parseScalar(String(a.expect ?? '')) }));
    }
    if (s.exports?.length) {
      obj.exports = s.exports.filter(e => e.path && e.as).map(e => ({ path: e.path, as: e.as }));
    }
    return obj;
  }

  // ── Run step ──
  async function runStep(s, card) {
    const minRunVisibleMS = 220;
    const runStartedAt = performance.now();
    const runBtn   = card.querySelector('.bldr-run-step-btn');
    const resultEl = card.querySelector('.bldr-card-result');
    const runIcon  = runBtn.querySelector('.bldr-run-icon');
    const spinIcon = runBtn.querySelector('.bldr-spin-icon');
    const runLabel = runBtn.querySelector('.bldr-run-label');

    runBtn.disabled = true;
    runIcon.style.display  = 'none';
    spinIcon.style.display = '';
    runLabel.textContent   = 'Running…';
    card.classList.add('bldr-running');

    // overlay on card content (below header)
    const overlay = document.createElement('div');
    overlay.className = 'oa-loading-overlay bldr-step-overlay';
    overlay.innerHTML = `<div class="oa-spinner"></div><div class="oa-loading-label">Running step…</div>`;
    card.appendChild(overlay);

    const resultSection = card.querySelector(`#bldr-result-section-${s._id}`);
    if (resultSection) resultSection.style.display = '';
    resultEl.innerHTML = '';
    try {
      const stepJSON = buildStepJSON(s, tcSteps.findIndex(step => step._id === s._id));
      // inject localStorage ctx so individual steps can use exported values
      stepJSON.action = injectCtx(stepJSON.action);
      stepJSON.timeout_ms = +document.getElementById('tc-timeout').value || 30000;
      const res = await fetch('/api/builder/run-step', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(stepJSON)
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Failed';
        renderResult(resultEl, null, msg);
        showToast(`Step ${stepIndexOf(s)} failed: ${msg}`, 'error');
        return;
      }
      s.result = data;
      // save exported values to localStorage context
      if (data.values) saveCtxValues(data.values);
      renderResult(resultEl, data);
      if (data.status === 'passed') {
        showToast(`Step ${stepIndexOf(s)} passed in ${data.elapsed_ms} ms`);
      } else {
        showToast(`Step ${stepIndexOf(s)} failed${data.error ? ': ' + data.error : ''}`, 'error');
      }
    } catch(err) {
      renderResult(resultEl, null, err.message);
      showToast(`Step ${stepIndexOf(s)} failed: ${err.message}`, 'error');
    }
    finally {
      const remainingMS = minRunVisibleMS - (performance.now() - runStartedAt);
      if (remainingMS > 0) await sleep(remainingMS);
      overlay.remove();
      runBtn.disabled = false;
      runIcon.style.display  = '';
      spinIcon.style.display = 'none';
      runLabel.textContent   = 'Run Step';
      card.classList.remove('bldr-running');
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function stepIndexOf(step) {
    const index = tcSteps.findIndex(s => s._id === step._id);
    return index >= 0 ? index + 1 : '?';
  }

  // ── Render step result ──
  function renderResult(el, result, errMsg) {
    if (errMsg) { el.innerHTML = `<div class="bldr-result-error" style="padding:10px 16px">${X(errMsg)}</div>`; return; }
    const ok     = result.status === 'passed';
    const parsed = tryJSON(result.response_summary, null);
    const disp   = parsed || (result.error ? {error: result.error} : {response: 'no data'});
    el.innerHTML = `
      <div class="bldr-result-header" style="padding:8px 16px 6px">
        <span class="badge ${ok?'badge-success':'badge-danger'}">${ok?'PASSED':'FAILED'}</span>
        <span class="info-text">${result.elapsed_ms} ms</span>
        ${result.error ? `<span class="bldr-result-err-msg">${X(result.error)}</span>` : ''}
      </div>
      <div class="code-container bldr-result-code" style="margin:0 16px 12px;max-height:600px;overflow-y:auto">
        <pre><code class="bldr-result-json"></code></pre>
      </div>`;
    hlJSON(disp, el.querySelector('.bldr-result-json'));
  }

  // ── Run All ──
  async function runAll() {
    if (!tcSteps.length) return;
    runAllBtn.disabled = true;
    runAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon bldr-spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Running…`;

    // show overlay on content wrap
    const contentWrap = document.querySelector('.builder-step-content-wrap');
    const overlay = document.createElement('div');
    overlay.className = 'oa-loading-overlay';
    overlay.innerHTML = `<div class="oa-spinner"></div><div class="oa-loading-label">Running all steps…</div>`;
    contentWrap.appendChild(overlay);
    try {
      const tc = buildTC();
      const res = await fetch('/api/builder/run', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(tc)
      });
      const runResult = await res.json();
      if (!res.ok) {
        showToast(`Run All failed: ${runResult.error || 'Failed'}`, 'error');
        return;
      }
      let passed = 0;
      let failed = 0;
      runResult.steps?.forEach((sr, i) => {
        const step = tcSteps[i];
        if (!step) return;
        const card = stepsEl.querySelector(`[data-step-id="${step._id}"]`);
        if (!card) return;
        const resultSection = card.querySelector(`#bldr-result-section-${step._id}`);
        if (resultSection) resultSection.style.display = '';
        const resultEl = card.querySelector('.bldr-card-result');
        renderResult(resultEl, sr);
        step.result = sr;
        if (sr.values) saveCtxValues(sr.values);
        if (sr.status === 'passed') passed++;
        else failed++;
      });
      if (failed) showToast(`Run All finished: ${passed} passed, ${failed} failed`, 'error');
      else showToast(`Run All passed: ${passed} step${passed === 1 ? '' : 's'}`);
    } catch(err) {
      console.error(err);
      showToast(`Run All failed: ${err.message}`, 'error');
    }
    finally {
      overlay.remove();
      runAllBtn.disabled = false;
      runAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run All`;
    }
  }

  // ── Save ──
  async function saveTC() {
    const name = document.getElementById('tc-name').value.trim();
    if (!name) { setMsg('Name is required', 'error'); return; }
    if (!tcSteps.length) { setMsg('Add at least one step', 'error'); return; }
    const payload = { ...buildTC(), category: document.getElementById('tc-category').value.trim() || 'builder' };
    setMsg('Waiting for confirmation…', '');
    const okToSave = await showJsonConfirm(
      'Confirm Save Test Case',
      `Review the JSON before saving to Catalog: ${payload.category}`,
      JSON.stringify(payload, null, 2)
    );
    if (!okToSave) { setMsg('', ''); return; }
    saveBtn.disabled = true; setMsg('Saving…', '');
    try {
      const res = await fetch('/api/builder/save', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error||'Save failed', 'error'); return; }
      setMsg('', '');
      showToast(`Saved "${data.id}" in ${data.category}`);
      window.reloadCatalog?.();
      loadBuilderCategories();
    } catch(err) { setMsg(err.message, 'error'); }
    finally { saveBtn.disabled = false; }
  }

  function buildTC() {
    return {
      id:          slugTC(document.getElementById('tc-name').value),
      name:        document.getElementById('tc-name').value.trim(),
      description: document.getElementById('tc-description').value.trim(),
      config:      { timeout_ms: +document.getElementById('tc-timeout').value || 30000 },
      steps:       tcSteps.map((step, index) => buildStepJSON(step, index)),
    };
  }

  function setMsg(msg, type) {
    saveMsgEl.textContent = msg;
    saveMsgEl.className = 'exp-save-msg' + (type ? ' ' + type : '');
  }

  // ── Load categories for datalist ──
  async function loadBuilderCategories() {
    try {
      const res = await fetch('/api/explore/categories');
      if (!res.ok) return;
      const cats = await res.json();
      if (!Array.isArray(cats)) return;
      builderCategories = [...new Set(cats.filter(Boolean))].sort((a, b) => a.localeCompare(b));
      renderCategoryMenu();
    } catch {}
  }
  window.loadBuilderCategories = loadBuilderCategories;

  function renderCategoryMenu() {
    if (!builderCategories.length) {
      categoryMenu.innerHTML = '<div class="builder-cat-empty">No catalogs yet</div>';
      return;
    }
    categoryMenu.innerHTML = builderCategories.map(cat => `
      <button class="builder-cat-option" type="button" data-category="${X(cat)}">
        <span>${X(cat)}</span>
      </button>
    `).join('');
    categoryMenu.querySelectorAll('.builder-cat-option').forEach(btn => {
      btn.addEventListener('click', () => {
        categoryInput.value = btn.dataset.category || '';
        hideCategoryMenu();
        categoryInput.focus();
      });
    });
  }

  async function showCategoryMenu() {
    await loadBuilderCategories();
    renderCategoryMenu();
    const rect = categoryInput.getBoundingClientRect();
    categoryMenu.style.width = rect.width + 'px';
    categoryMenu.style.left = rect.left + 'px';
    categoryMenu.style.top = (rect.bottom + 6) + 'px';
    categoryMenu.style.display = '';
  }

  function hideCategoryMenu() {
    categoryMenu.style.display = 'none';
  }

  // ── Load a saved test case into the builder ──
  window.loadInBuilder = function loadInBuilder(tc) {
    // Switch tab
    const builderTab = document.querySelector('[data-tab="builder"]');
    loadingBuilderFromEdit = true;
    if (builderTab) builderTab.click();
    loadingBuilderFromEdit = false;

    // Populate TC header
    document.getElementById('tc-name').value        = tc.name        || '';
    document.getElementById('tc-description').value = tc.description || '';
    document.getElementById('tc-category').value    = tc.category    || '';
    document.getElementById('tc-timeout').value     = tc.config?.timeout_ms || 30000;

    // Clear existing steps
    tcSteps = []; stepSeq = 0;
    stepsEl.querySelectorAll('.builder-step-card').forEach(c => c.remove());
    if (!tc.steps?.length) { emptyEl.style.display = ''; updateBtns(); return; }
    emptyEl.style.display = 'none';

    // Load steps
    tc.steps.forEach(sj => {
      const s = stepFromJSON(sj);
      tcSteps.push(s);
      const card = document.createElement('div');
      card.className = 'builder-step-card';
      card.dataset.stepId = s._id;
      card.innerHTML = cardHTML(s);
      stepsEl.appendChild(card);
      attachCard(card, s);
      renderAE(card, s);
    });
    // activate first step
    if (tcSteps.length) setActiveStep(tcSteps[0]._id);
    renderStepTabs();
    updateBtns();
    // Scroll to top
    stepsEl.parentElement?.scrollTo(0, 0);
  };

  function stepFromJSON(sj) {
    stepSeq++;
    const a = (typeof sj.action === 'string') ? tryJSON(sj.action, {}) : (sj.action || {});
    const s = {
      _id: stepSeq, stepDescription: sj.description || stepIDToDescription(sj.step_id), type: sj.type || 'grpc_unary',
      endpoint: '', proxyMode: false, proxyEndpoint: '',
      services: [], selectedService: '', selectedMethod: '',
      metadata: [], protoFiles: '', payload: '{}',
      httpMethod: 'GET', url: '', headers: [], httpBody: '',
      wsUrl: '', wsHeaders: [], wsConnId: '', wsPayload: '{}',
      wsMatchPath: '', wsMatchEquals: '', wsTimeoutMs: 5000,
      dbDriver: 'postgres', dbDsn: '', dbSql: '',
      durationMs: 1000, includePath: '', groupFile: '',
      fakeGrpcPort: 19091, fakeGrpcProtos: '', fakeGrpcResponses: '{}', fakeGrpcAddr: '',
      fakeHttpPort: 18080, fakeHttpRoutes: '[]', fakeHttpUrl: '',
      result: null,
    };
    switch (s.type) {
      case 'grpc_unary': {
        const meta = a.metadata || {};
        if (Object.prototype.hasOwnProperty.call(meta, 'x-server-id')) {
          s.proxyMode = true;
          s.proxyEndpoint = a.endpoint || '';
          s.metadata = Object.entries(meta).map(([k,v])=>({k,v}));
        } else {
          s.endpoint = a.endpoint || '';
          s.metadata = Object.entries(meta).map(([k,v])=>({k,v}));
        }
        if (a.service) {
          s.services        = [{ name: a.service.split('.').pop(), full: a.service, methods: a.method ? [a.method] : [] }];
          s.selectedService = a.service;
          s.selectedMethod  = a.method || '';
        }
        s.protoFiles = (a.proto_files || []).join(', ');
        s.payload = a.payload ? JSON.stringify(a.payload, null, 2) : '{}';
        break;
      }
      case 'http_request':
        s.httpMethod = a.method || 'GET'; s.url = a.url || '';
        s.headers    = Object.entries(a.headers||{}).map(([k,v])=>({k,v}));
        s.httpBody   = a.payload ? JSON.stringify(a.payload, null, 2) : '';
        break;
      case 'websocket_connect':
        s.wsUrl     = a.url || '';
        s.wsHeaders = Object.entries(a.headers||{}).map(([k,v])=>({k,v}));
        break;
      case 'websocket_send':
        s.wsConnId  = a.conn_id || '';
        s.wsPayload = a.payload ? JSON.stringify(a.payload, null, 2) : '{}';
        break;
      case 'websocket_await':
        s.wsConnId      = a.conn_id || '';
        s.wsMatchPath   = a.match?.path  || '';
        s.wsMatchEquals = String(a.match?.equals ?? '');
        s.wsTimeoutMs   = a.timeout_ms   || 5000;
        break;
      case 'websocket_close':   s.wsConnId       = a.conn_id   || ''; break;
      case 'db_check':          s.dbDriver = a.driver||'postgres'; s.dbDsn = a.dsn||''; s.dbSql = a.sql||''; break;
      case 'delay':             s.durationMs     = a.duration_ms || 1000; break;
      case 'include':           s.includePath    = a.file_path || ''; break;
      case 'group':             s.groupFile      = a.file      || ''; break;
      case 'fake_grpc_start':
        s.fakeGrpcPort      = a.port || 19091;
        s.fakeGrpcProtos    = (a.proto_files||[]).join(', ');
        s.fakeGrpcResponses = a.responses ? JSON.stringify(a.responses, null, 2) : '{}';
        break;
      case 'fake_grpc_stop':    s.fakeGrpcAddr   = a.addr || ''; break;
      case 'fake_http_start':
        s.fakeHttpPort   = a.port || 18080;
        s.fakeHttpRoutes = a.routes ? JSON.stringify(a.routes, null, 2) : '[]';
        break;
      case 'fake_http_stop':    s.fakeHttpUrl    = a.url  || ''; break;
    }
    // Restore asserts
    s.asserts = (sj.asserts || []).map(a => ({
      type:   a.type   || 'json_path',
      path:   a.path   || '',
      expect: String(a.expect ?? ''),
    }));
    // Restore exports
    s.exports = (sj.exports || []).map(e => ({
      path: e.path || '',
      as:   e.as   || '',
    }));
    return s;
  }

  // ── Shared helpers ──
  function bind(card, sel, evt, fn) {
    const el = card.querySelector(sel);
    if (el) el.addEventListener(evt, fn);
  }
  function tryJSON(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }
  function parseScalar(s) {
    s = String(s).trim();
    if (s==='true') return true; if (s==='false') return false; if (s==='null') return null;
    const n = Number(s); return (!isNaN(n)&&s!=='') ? n : s;
  }
  async function openDbDsnEditor(s, card) {
    const initial = parseDsnFields(s.dbDsn);
    const overlay = document.createElement('div');
    overlay.className = 'oa-modal-overlay oa-db-dsn-overlay';
    overlay.innerHTML = `
      <div class="oa-modal glass-panel oa-db-dsn-modal">
        <div class="oa-modal-body">
          <div class="oa-modal-title">Edit Database Connection</div>
          <div class="oa-db-dsn-grid">
            <label><span>Host</span><input class="exp-input db-host" value="${X(initial.host)}" placeholder="127.0.0.1"></label>
            <label><span>Port</span><input class="exp-input db-port" value="${X(initial.port)}" placeholder="5432"></label>
            <label><span>User</span><input class="exp-input db-user" value="${X(initial.user)}" placeholder="baccarat"></label>
            <label><span>Password</span><input class="exp-input db-password" value="${X(initial.password)}" placeholder="666666" type="password"></label>
            <label><span>Database</span><input class="exp-input db-dbname" value="${X(initial.dbname)}" placeholder="baccarat_game"></label>
            <label><span>SSL Mode</span>
              <select class="exp-select db-sslmode">
                ${['disable','require','verify-ca','verify-full'].map(v => `<option value="${v}"${initial.sslmode === v ? ' selected' : ''}>${v}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="oa-db-raw-label">
            <span>Raw DSN</span>
            <textarea class="exp-textarea db-raw" spellcheck="false" rows="3">${X(s.dbDsn)}</textarea>
          </label>
        </div>
        <div class="oa-modal-actions">
          <button class="btn db-cancel" type="button">Cancel</button>
          <button class="btn btn-primary db-apply" type="button">Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const raw = overlay.querySelector('.db-raw');
    const fields = ['host', 'port', 'user', 'password', 'dbname', 'sslmode'];
    const getField = key => overlay.querySelector(`.db-${key}`);
    const syncRaw = () => { raw.value = buildDsnFromFields(Object.fromEntries(fields.map(k => [k, getField(k).value]))); };
    fields.forEach(k => getField(k).addEventListener('input', syncRaw));
    getField('sslmode').addEventListener('change', syncRaw);

    const close = () => overlay.remove();
    overlay.querySelector('.db-cancel').addEventListener('click', close);
    overlay.querySelector('.db-apply').addEventListener('click', () => {
      s.dbDsn = raw.value.trim();
      const input = card.querySelector('.bldr-db-dsn-in');
      if (input) input.value = s.dbDsn;
      close();
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.db-host')?.focus();
  }

  function parseDsnFields(dsn) {
    const out = { host: '', port: '', user: '', password: '', dbname: '', sslmode: 'disable' };
    const re = /(\w+)=((?:"[^"]*")|'[^']*'|[^\s]+)/g;
    let match;
    while ((match = re.exec(String(dsn || ''))) !== null) {
      const key = match[1];
      let val = match[2] || '';
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = val;
    }
    return out;
  }

  function buildDsnFromFields(fields) {
    return ['host', 'port', 'user', 'password', 'dbname', 'sslmode']
      .map(key => [key, String(fields[key] || '').trim()])
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${quoteDsnValue(value)}`)
      .join(' ');
  }

  function quoteDsnValue(value) {
    if (!/\s/.test(value)) return value;
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  function stepIDToDescription(stepID) {
    const raw = String(stepID || '').trim();
    if (!raw || /^\d+$/.test(raw) || /^step_?\d+$/i.test(raw)) return '';
    return raw.replace(/_/g, ' ');
  }
  function X(str) {
    return String(str??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function hlJSON(obj, target) {
    const s = JSON.stringify(obj, null, 2);
    target.innerHTML = s.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      m => { let c='json-number'; if(/^"/.test(m)) c=/:$/.test(m)?'json-key':'json-string'; else if(/true|false/.test(m)) c='json-boolean'; else if(/null/.test(m)) c='json-null'; return `<span class="${c}">${m}</span>`; }
    );
  }
  function slugTC(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'untitled';
  }
});
