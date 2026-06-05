document.addEventListener('DOMContentLoaded', () => {
  const layout = document.getElementById('layout');
  const catalogToggle = document.getElementById('catalog-toggle');
  const catalogAddFolderBtn = document.getElementById('catalog-add-folder-btn');
  const catalogExpandAllBtn = document.getElementById('catalog-expand-all-btn');
  const catalogCollapseAllBtn = document.getElementById('catalog-collapse-all-btn');
  const catalogSelectBtn = document.getElementById('catalog-select-btn');
  const catalogSelectBar = document.getElementById('catalog-select-bar');
  const catalogSelectedCount = document.getElementById('catalog-selected-count');
  const catalogMoveSelected = document.getElementById('catalog-move-selected');
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
  const runnerResultActions = document.querySelector('.step-result-actions');
  const runnerResultOplogBtn = document.getElementById('runner-result-oplog-btn');
  const runnerResultTreeBtn = document.getElementById('runner-result-tree-btn');

  const btnEditBuilder = document.getElementById('btn-edit-builder');

  let currentTestCaseId = null;
  let currentTestCaseCategory = null;
  let currentRunResult = null;
  let currentTestCase = null;
  let catalogSelectMode = false;
  let selectedCatalogItems = new Map();
  let testCaseJsonPristine = '';
  let draggedTestCase = null;
  let draggedStepId = null;
  let tcOrder = 0;

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
  catalogAddFolderBtn.addEventListener('click', createNewFolder);
  catalogSelectBtn.addEventListener('click', () => setCatalogSelectMode(!catalogSelectMode));
  catalogCancelSelect.addEventListener('click', () => setCatalogSelectMode(false));
  catalogMoveSelected.addEventListener('click', moveSelectedTestCases);
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
      const [resCases, resCats] = await Promise.all([
        fetch('/api/testcases'),
        fetch('/api/explore/categories')
      ]);
      if (!resCases.ok) throw new Error(`HTTP ${resCases.status}`);
      const cases = await resCases.json();
      const cats = resCats.ok ? await resCats.json() : [];
      renderTree(cases || [], cats || []);
    } catch (err) {
      treeContainer.innerHTML = `<div class="empty-state">Error loading test cases: ${err.message}</div>`;
    }
  }

  function renderTree(cases, allCategories = []) {
    treeContainer.innerHTML = '';
    if (cases.length === 0 && allCategories.length === 0) {
      treeContainer.innerHTML = '<div class="empty-state">No test cases found.</div>';
      return;
    }

    // Build a tree structure based on category.
    const tree = {};
    
    let expandedFolders = new Set();
    try {
      expandedFolders = new Set(JSON.parse(localStorage.getItem('octoassert_expanded_folders') || '[]'));
    } catch (e) {}
    
    function saveExpandedFolders() {
      localStorage.setItem('octoassert_expanded_folders', JSON.stringify(Array.from(expandedFolders)));
    }
    
    // Ensure all known categories (even empty ones) are in the tree
    allCategories.forEach(cat => {
      if (!cat) return;
      const parts = cat.split('/').filter(Boolean);
      let curr = tree;
      parts.forEach((p, idx) => {
        if (!curr[p]) curr[p] = { __cases: [], __category: parts.slice(0, idx + 1).join('/') };
        curr = curr[p];
      });
    });

    cases.forEach(tc => {
      const parts = (tc.category || '').split('/').filter(Boolean);
      let curr = tree;
      if (!curr.__cases) curr.__cases = [];
      
      parts.forEach((p, idx) => {
        if (!curr[p]) curr[p] = { __cases: [], __category: parts.slice(0, idx + 1).join('/') };
        curr = curr[p];
      });
      curr.__cases.push(tc);
    });

    // Render HTML
    function buildHtml(node, name) {
      const div = document.createElement('div');
      const category = node.__category || name;
      const isExpanded = expandedFolders.has(category);
      div.className = isExpanded ? 'folder' : 'folder collapsed';
      
      const header = document.createElement('div');
      header.className = 'folder-header';
      header.innerHTML = `
        <label class="tc-select-wrap folder-select-wrap" title="Select all in folder" style="display:${catalogSelectMode?'flex':'none'};margin-right:8px;align-items:center">
          <input class="tc-select-check folder-select-check" type="checkbox">
        </label>
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
        if (div.classList.contains('collapsed')) {
          expandedFolders.delete(category);
        } else {
          expandedFolders.add(category);
        }
        saveExpandedFolders();
      };
      header.querySelector('.folder-delete-btn').onclick = e => {
        e.stopPropagation();
        deleteFolder(category);
      };
      
      const folderCheck = header.querySelector('.folder-select-check');
      folderCheck.onchange = e => {
        e.stopPropagation();
        const checked = e.target.checked;
        const toggleAll = (n) => {
          if (n.__cases) n.__cases.forEach(tc => toggleCatalogItem(tc, checked, false));
          Object.keys(n).forEach(k => {
            if (k !== '__cases' && k !== '__category') toggleAll(n[k]);
          });
        };
        toggleAll(node);
        updateCatalogSelectionUI();
        fetchTestCases();
      };
      // Determine if all children are selected to check the folder box
      let allChecked = true;
      let hasCases = false;
      const checkAll = (n) => {
        if (n.__cases) {
          if (n.__cases.length > 0) hasCases = true;
          n.__cases.forEach(tc => { if (!selectedCatalogItems.has(catalogItemKey(tc))) allChecked = false; });
        }
        Object.keys(n).forEach(k => {
          if (k !== '__cases' && k !== '__category') checkAll(n[k]);
        });
      };
      checkAll(node);
      folderCheck.checked = hasCases && allChecked;
      
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
          
          // Drag and drop sorting
          item.draggable = true;
          item.dataset.id = tc.id;
          item.dataset.category = tc.category || '';
          
          item.addEventListener('dragstart', e => {
            if (catalogSelectMode) { e.preventDefault(); return; }
            draggedTestCase = { id: tc.id, category: tc.category || '', element: item };
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => item.classList.add('dragging'), 0);
          });
          
          item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedTestCase = null;
            document.querySelectorAll('.test-case-item').forEach(el => {
              el.classList.remove('drag-over-top', 'drag-over-bottom');
            });
          });
          
          item.addEventListener('dragover', e => {
            if (catalogSelectMode || !draggedTestCase) return;
            if (draggedTestCase.category !== (tc.category || '')) return; // only sort within same folder
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            const rect = item.getBoundingClientRect();
            if (e.clientY - rect.top < rect.height / 2) {
              item.classList.add('drag-over-top');
              item.classList.remove('drag-over-bottom');
            } else {
              item.classList.add('drag-over-bottom');
              item.classList.remove('drag-over-top');
            }
          });
          
          item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over-top', 'drag-over-bottom');
          });
          
          item.addEventListener('drop', async e => {
            if (catalogSelectMode || !draggedTestCase) return;
            if (draggedTestCase.category !== (tc.category || '')) return;
            e.preventDefault();
            
            const isTop = item.classList.contains('drag-over-top');
            item.classList.remove('drag-over-top', 'drag-over-bottom');
            
            if (draggedTestCase.id === tc.id) return;
            
            const parent = item.parentNode;
            parent.insertBefore(draggedTestCase.element, isTop ? item : item.nextSibling);
            
            const ids = Array.from(parent.querySelectorAll('.test-case-item')).map(el => el.dataset.id);
            try {
              const res = await fetch('/api/testcases/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: tc.category || '', ids })
              });
              if (!res.ok) throw new Error('Reorder failed');
              // Optionally fetchTestCases() here, or just trust the DOM.
              // fetchTestCases(); is safer to sync order.
              fetchTestCases();
            } catch (err) {
              console.error(err);
              fetchTestCases();
            }
          });

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

    // Render root level items
    if (tree.__cases) {
      tree.__cases.forEach(tc => {
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

        // Drag and drop for root level items
        item.draggable = true;
        item.dataset.id = tc.id;
        item.dataset.category = tc.category || '';
        
        item.addEventListener('dragstart', e => {
          if (catalogSelectMode) { e.preventDefault(); return; }
          draggedTestCase = { id: tc.id, category: tc.category || '', element: item };
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => item.classList.add('dragging'), 0);
        });
        
        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
          draggedTestCase = null;
          document.querySelectorAll('.test-case-item').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
          });
        });
        
        item.addEventListener('dragover', e => {
          if (catalogSelectMode || !draggedTestCase) return;
          if (draggedTestCase.category !== (tc.category || '')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          
          const rect = item.getBoundingClientRect();
          if (e.clientY - rect.top < rect.height / 2) {
            item.classList.add('drag-over-top');
            item.classList.remove('drag-over-bottom');
          } else {
            item.classList.add('drag-over-bottom');
            item.classList.remove('drag-over-top');
          }
        });
        
        item.addEventListener('dragleave', () => {
          item.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        
        item.addEventListener('drop', async e => {
          if (catalogSelectMode || !draggedTestCase) return;
          if (draggedTestCase.category !== (tc.category || '')) return;
          e.preventDefault();
          
          const isTop = item.classList.contains('drag-over-top');
          item.classList.remove('drag-over-top', 'drag-over-bottom');
          
          if (draggedTestCase.id === tc.id) return;
          
          const parent = item.parentNode;
          parent.insertBefore(draggedTestCase.element, isTop ? item : item.nextSibling);
          
          const ids = Array.from(parent.querySelectorAll('.test-case-item')).map(el => el.dataset.id);
          try {
            const res = await fetch('/api/testcases/reorder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: tc.category || '', ids })
            });
            if (!res.ok) throw new Error('Reorder failed');
            fetchTestCases();
          } catch (err) {
            console.error(err);
            fetchTestCases();
          }
        });

        treeContainer.appendChild(item);
      });
    }

    Object.keys(tree).forEach(k => {
      if (k !== '__cases' && k !== '__category') {
        treeContainer.appendChild(buildHtml(tree[k], k));
      }
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

  function toggleCatalogItem(tc, checked = !selectedCatalogItems.has(catalogItemKey(tc)), refresh = true) {
    const key = catalogItemKey(tc);
    if (checked) selectedCatalogItems.set(key, { id: tc.id, category: tc.category || '' });
    else selectedCatalogItems.delete(key);
    if (refresh) {
      updateCatalogSelectionUI();
      fetchTestCases();
    }
  }

  function updateCatalogSelectionUI() {
    const count = selectedCatalogItems.size;
    catalogSelectedCount.textContent = `${count} selected`;
    catalogDeleteSelected.disabled = count === 0;
    catalogMoveSelected.disabled = count === 0;
  }

  async function moveSelectedTestCases() {
    const items = [...selectedCatalogItems.values()];
    if (!items.length) return;
    openMoveModal(items);
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

  async function createNewFolder() {
    const overlay = document.getElementById('oa-folder-modal-overlay');
    const input = document.getElementById('oa-folder-input');
    const cancelBtn = document.getElementById('oa-folder-cancel');
    const confirmBtn = document.getElementById('oa-folder-confirm');

    input.value = '';
    overlay.style.display = 'flex';
    input.focus();

    return new Promise(resolve => {
      const close = () => {
        overlay.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve();
      };

      cancelBtn.onclick = close;
      overlay.onclick = e => { if (e.target === overlay) close(); };

      const submit = async () => {
        const clean = input.value.trim();
        if (!clean) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Creating...';
        try {
          const res = await fetch('/api/catalog/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: clean })
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || 'Create folder failed');
          }
          fetchTestCases();
          showToast(`Created folder "${clean}"`);
          close();
        } catch (err) {
          alert('Create folder failed: ' + err.message);
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Create';
        }
      };

      confirmBtn.onclick = submit;
      input.onkeydown = e => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') close();
      };
    });
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
    menu.querySelector('.ctx-move').onclick = async () => {
      menu.style.display = 'none';
      openMoveModal(tc);
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

  async function openMoveModal(input) {
    const isBulk = Array.isArray(input);
    const items = isBulk ? input : [input];
    if (!items.length) return;
    
    const overlay = document.getElementById('oa-move-modal-overlay');
    const listEl = document.getElementById('oa-move-folder-list');
    const cancelBtn = document.getElementById('oa-move-cancel');
    const confirmBtn = document.getElementById('oa-move-confirm');
    
    listEl.innerHTML = '<div style="padding:10px;text-align:center;">Loading...</div>';
    overlay.style.display = 'flex';
    
    const close = () => {
      overlay.style.display = 'none';
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };
    
    cancelBtn.onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    
    try {
      const res = await fetch('/api/explore/categories');
      if (!res.ok) throw new Error('failed to load');
      let cats = await res.json() || [];
      // Always include root as an option
      cats.unshift('');
      
      const currentCat = isBulk ? null : (input.category || '');
      
      listEl.innerHTML = cats.map(c => {
        const displayLabel = c === '' ? '/ (root)' : c;
        return `
          <label style="display:block; padding:8px; cursor:pointer; border-radius:4px;" class="move-cat-item">
            <input type="radio" name="move-target" value="${X(c)}" ${c === currentCat ? 'checked' : ''}>
            <span style="margin-left:8px; color: ${c === currentCat ? 'var(--text-muted)' : 'inherit'}">${X(displayLabel)} ${c === currentCat ? '(current)' : ''}</span>
          </label>
        `;
      }).join('');
      
      confirmBtn.onclick = async () => {
        const checked = listEl.querySelector('input[name="move-target"]:checked');
        if (!checked) return;
        const target = checked.value;
        if (!isBulk && target === currentCat) { close(); return; }
        
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Moving...';
        try {
          if (isBulk) {
            const res = await fetch('/api/testcases/bulk-move', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items, target: target })
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              throw new Error(d.error || 'Bulk move failed');
            }
            showToast(`Moved ${items.length} test cases`);
            if (currentTestCaseId) {
               for (const it of items) {
                  if (it.id === currentTestCaseId && (!currentTestCaseCategory || currentTestCaseCategory === it.category)) {
                     currentTestCaseCategory = target;
                  }
               }
            }
            setCatalogSelectMode(false);
          } else {
            const tc = input;
            const res = await fetch(`/api/testcases/${encodeURIComponent(tc.id)}/move`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: tc.category || '', target: target })
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              throw new Error(d.error || 'Move failed');
            }
            if (currentTestCaseId === tc.id && (!currentTestCaseCategory || currentTestCaseCategory === tc.category)) {
               currentTestCaseCategory = target;
            }
            showToast(`Moved ${tc.name} to ${target === '' ? 'root' : target}`);
          }
          fetchTestCases();
          close();
        } catch (err) {
          alert('Move failed: ' + err.message);
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Move';
        }
      };
      
    } catch (err) {
      listEl.innerHTML = `<div style="color:var(--neon-danger)">Failed to load categories: ${err.message}</div>`;
    }
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

  window.refreshSelectedTestCase = function(id, category = null) {
    if (currentTestCaseId !== id) return;
    if ((currentTestCaseCategory || '') !== (category || '')) return;
    fetchTestCaseDefinition(id, category || null);
  };

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
    if (!currentTestCaseId || !currentTestCase || !currentTestCase.steps) return;

    btnRun.disabled = true;
    btnRun.innerHTML = `<span class="pulse"></span> Running...`;
    
    // Draw initial gray step cards
    stepsList.innerHTML = '';
    currentTestCase.steps.forEach((step, idx) => {
      const div = document.createElement('div');
      div.className = `step-card pending`;
      div.id = `runner-step-card-${idx}`;
      div.innerHTML = `
        <div class="step-marker"></div>
        <div class="step-content">
          <div class="step-header">
            <span class="step-name">${step.step_id || 'Step '+(idx+1)}</span>
            <span class="step-type">${step.type}</span>
          </div>
          <div class="step-time" id="runner-step-time-${idx}">...</div>
        </div>
      `;
      stepsList.appendChild(div);
    });

    requestOutput.textContent = '// Waiting for execution steps...';
    jsonOutput.textContent = '// Waiting for response...';
    infoBar.style.display = 'none';

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson'
        },
        body: JSON.stringify({ id: currentTestCaseId, category: currentTestCaseCategory || '' })
      });

      if (!res.ok) {
        const data = await res.json().catch(()=>({error: 'Failed'}));
        showToast(`Execute Run failed: ${data.error || 'Failed'}`, 'error');
        renderRunResult(data);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'progress') {
              const card = document.getElementById(`runner-step-card-${ev.index}`);
              if (card) {
                card.className = `step-card ${ev.status}`;
              }
            } else if (ev.type === 'complete') {
              currentRunResult = ev.result;
              renderRunResult(ev.result);
              showRunnerRunToast(ev.result);
            }
          } catch(e) {}
        }
        if (done) break;
      }
    } catch (err) {
      stepsList.innerHTML += `<div class="empty-state" style="color:var(--neon-danger)">Execution failed: ${err.message}</div>`;
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

  function renderRunResult(result) {
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
              <span class="step-name">${step.step_id}</span>
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
      const reqDisp = buildStepRequestData(step);
      const resDisp = buildStepResponseData(step);
      showJson(reqDisp, requestOutput);
      showJson(resDisp, jsonOutput);
      const stepLogs = buildOperationLogData(step);
      if (runnerResultActions) {
        runnerResultActions.style.display = 'flex';
        if (runnerResultOplogBtn) {
          runnerResultOplogBtn.style.display = stepLogs.length ? 'inline-flex' : 'none';
          runnerResultOplogBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:14px;height:14px"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
            ${step.type === 'websocket' ? 'Operation Log' : 'Step Log'}
          `;
          runnerResultOplogBtn.onclick = () => {
            const allLogs = [];
            currentRunResult.steps.forEach((s, sIdx) => {
              buildOperationLogData(s).forEach((log, lIdx) => {
                allLogs.push({ ...log, _sIdx: sIdx, tab_label: s.type === 'websocket' ? `Step ${sIdx+1} Op ${lIdx+1}` : `Step ${sIdx+1}` });
              });
            });
            const activeIdx = allLogs.findIndex(l => l._sIdx === idx);
            openOperationLogDialog(allLogs, 'Step Log', activeIdx >= 0 ? activeIdx : 0);
          };
        }
        if (runnerResultTreeBtn) {
          runnerResultTreeBtn.onclick = () => openJsonTreeDialog('Step Response', resDisp);
        }
      }
    } else {
      if (runnerResultActions) runnerResultActions.style.display = 'none';
    }
  }

  function buildStepRequestData(step) {
    return compactObject({
      step_id: step.step_id,
      type: step.type,
      description: step.description || step.request?.description,
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

  /* ══════════════════════════════════════════
     Batch Runner Logic
  ══════════════════════════════════════════ */
  const catalogBatchRunBtn = document.getElementById('catalog-batch-run-btn');
  const batchTotal = document.getElementById('batch-total');
  const batchPassed = document.getElementById('batch-passed');
  const batchFailed = document.getElementById('batch-failed');
  const batchPending = document.getElementById('batch-pending');
  const batchProgress = document.getElementById('batch-progress');
  const batchList = document.getElementById('batch-list');
  const batchStopBtn = document.getElementById('batch-stop-btn');
  const batchDetailPanel = document.getElementById('batch-detail-panel');

  let batchState = {
    running: false,
    stopRequested: false,
    queue: [], // array of testcase paths
    results: new Map() // path -> result
  };

  if (catalogBatchRunBtn) {
    catalogBatchRunBtn.addEventListener('click', () => {
      const items = [];
      selectedCatalogItems.forEach((item, key) => {
        items.push(key);
      });
      if (items.length === 0) return;
      startBatchRun(items);
    });
  }

  function startBatchRun(paths) {
    // Switch to batch tab
    const batchTabBtn = document.querySelector('.tab-btn[data-tab="batch"]');
    if (batchTabBtn) batchTabBtn.click();
    
    batchState.running = true;
    batchState.stopRequested = false;
    batchState.queue = [...paths];
    batchState.results.clear();
    
    if (batchStopBtn) batchStopBtn.disabled = false;
    if (batchStopBtn) batchStopBtn.textContent = 'Stop';
    
    renderBatchList();
    updateBatchStats();
    if (batchDetailPanel) batchDetailPanel.style.display = 'none';
    
    // start sequential execution
    executeNextBatchItem();
  }

  batchStopBtn?.addEventListener('click', () => {
    if (batchState.running) {
      batchState.stopRequested = true;
      batchStopBtn.disabled = true;
      batchStopBtn.textContent = 'Stopping...';
    }
  });

  async function executeNextBatchItem() {
    const pendingIdx = batchState.queue.findIndex(p => !batchState.results.has(p));
    if (pendingIdx === -1 || batchState.stopRequested) {
      batchState.running = false;
      if (batchStopBtn) {
        batchStopBtn.disabled = true;
        batchStopBtn.textContent = 'Stop';
      }
      updateBatchStats();
      return;
    }

    const path = batchState.queue[pendingIdx];
    const parts = path.split('\0');
    const item = { category: parts[0], id: parts.slice(1).join('\0') };
    
    // mark as running
    batchState.results.set(path, { status: 'running' });
    updateBatchRow(path, pendingIdx);
    
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson'
        },
        body: JSON.stringify({ id: item.id, category: item.category })
      });
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let finalResult = { status: 'failed', error: 'No complete event received' };

      while (true) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'complete') {
              finalResult = ev.result;
            }
          } catch(e) {}
        }
        if (done) break;
      }
      batchState.results.set(path, finalResult);
    } catch (e) {
      batchState.results.set(path, { status: 'failed', error: String(e) });
    }
    
    updateBatchRow(path, pendingIdx);
    updateBatchStats();
    
    setTimeout(executeNextBatchItem, 100);
  }

  function updateBatchStats() {
    let passed = 0, failed = 0, pending = 0;
    batchState.queue.forEach(p => {
      const r = batchState.results.get(p);
      if (!r || r.status === 'running') pending++;
      else if (r.status === 'passed') passed++;
      else failed++;
    });
    
    if (batchTotal) batchTotal.textContent = `${batchState.queue.length} Total`;
    if (batchPassed) batchPassed.textContent = `${passed} Passed`;
    if (batchFailed) batchFailed.textContent = `${failed} Failed`;
    if (batchPending) batchPending.textContent = `${pending} Pending`;
    
    const done = passed + failed;
    const pct = batchState.queue.length ? Math.round((done / batchState.queue.length) * 100) : 0;
    if (batchProgress) batchProgress.style.width = `${pct}%`;
  }

  function renderBatchList() {
    if (!batchList) return;
    batchList.innerHTML = '';
    batchState.queue.forEach((path, idx) => {
      const div = document.createElement('div');
      div.className = 'batch-row glass-inner';
      div.id = `batch-row-${idx}`;
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.padding = '10px 16px';
      div.style.cursor = 'pointer';
      div.style.gap = '12px';
      div.style.transition = 'background 0.2s';
      
      div.onclick = () => showBatchDetail(path, idx);
      
      batchList.appendChild(div);
      updateBatchRow(path, idx);
    });
  }

  function updateBatchRow(path, idx) {
    const row = document.getElementById(`batch-row-${idx}`);
    if (!row) return;
    
    const r = batchState.results.get(path);
    const parts = path.split('\0');
    const name = parts.slice(1).join('\0');
    
    let statusHtml = '<div style="width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,0.2)"></div>';
    let timeHtml = '';
    
    row.style.borderLeft = '';
    row.style.background = 'rgba(255,255,255,0.02)';
    
    if (r) {
      if (r.status === 'running') {
        statusHtml = '<div style="width:20px;height:20px;border-radius:50%;border:2px solid var(--neon-primary);border-top-color:transparent;animation:spin 1s linear infinite"></div>';
        row.style.background = 'rgba(255,255,255,0.08)';
      } else if (r.status === 'passed') {
        statusHtml = '<svg viewBox="0 0 24 24" style="width:20px;height:20px;color:var(--neon-success)" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        timeHtml = `<span style="color:var(--text-muted);font-size:12px">${r.elapsed_ms || 0} ms</span>`;
        row.style.borderLeft = '4px solid var(--neon-success)';
      } else {
        statusHtml = '<svg viewBox="0 0 24 24" style="width:20px;height:20px;color:var(--neon-danger)" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        timeHtml = `<span style="color:var(--text-muted);font-size:12px">${r.elapsed_ms || 0} ms</span>`;
        row.style.borderLeft = '4px solid var(--neon-danger)';
        row.style.background = 'rgba(244,63,94,0.05)';
      }
    }
    
    row.innerHTML = `
      ${statusHtml}
      <div style="flex:1;font-weight:500;color:#e2e8f0;word-break:break-all">${X(name)}</div>
      ${timeHtml}
    `;
  }

  function showBatchDetail(path, idx) {
    try {
      _showBatchDetail(path, idx);
    } catch (e) {
      console.error(e);
      if (batchDetailPanel) {
        batchDetailPanel.style.display = 'flex';
        batchDetailPanel.innerHTML = '<div style="color:red;padding:20px;font-family:monospace;">ERROR: ' + e.message + '<br>' + e.stack + '</div>';
      }
    }
  }

  function _showBatchDetail(path, idx) {
    document.querySelectorAll('.batch-row').forEach(r => {
      if (!r.style.borderLeft) {
        r.style.background = 'rgba(255,255,255,0.02)';
      } else if (r.style.borderLeftColor === 'var(--neon-danger)') {
        r.style.background = 'rgba(244,63,94,0.05)';
      } else {
        r.style.background = 'rgba(255,255,255,0.02)';
      }
    });
    
    const row = document.getElementById(`batch-row-${idx}`);
    if (row) row.style.background = 'rgba(255,255,255,0.1)';
    
    const r = batchState.results.get(path);
    if (!r || r.status === 'running') {
      if (batchDetailPanel) batchDetailPanel.style.display = 'none';
      return;
    }
    
    if (batchDetailPanel) batchDetailPanel.style.display = 'flex';
    
    const parts = path.split('\0');
    const item = { category: parts[0], id: parts.slice(1).join('\0') };
    let html = `
      <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h3 style="margin:0;font-size:16px;color:#fff">${X(item.id)} <span style="font-size:12px;color:#888;font-weight:normal">${X(item.category)}</span></h3>
          <div style="margin-top:8px;display:flex;gap:8px">
            <span class="badge ${r.status==='passed'?'badge-success':'badge-danger'}">${r.status.toUpperCase()}</span>
            <span style="color:var(--text-muted);font-size:12px">${r.elapsed_ms||0} ms</span>
          </div>
        </div>
        <button class="btn btn-sm btn-outline bldr-result-oplog-btn batch-global-oplog-btn" type="button" style="display:none;align-items:center;gap:6px;margin-left:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:14px;height:14px"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
          Step Log
        </button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex:1;">
    `;
    
    if (r.error) {
      html += `<div class="bldr-result-error" style="padding:12px">${X(r.error)}</div>`;
    }
    
    if (r.steps && r.steps.length > 0) {
      r.steps.forEach((step, sIdx) => {
        const ok = step.status === 'passed';
        const resDisp = buildStepResponseData(step);
        html += `
          <div class="glass-inner" style="border-left:3px solid ${ok?'var(--neon-success)':'var(--neon-danger)'};padding:0;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);">
              <div style="font-weight:600;font-size:13px">Step ${sIdx+1}: ${X(step.type)}</div>
              <div style="display:flex;gap:8px">

                <button class="btn btn-sm btn-outline bldr-result-tree-btn batch-tree-btn" data-sidx="${sIdx}" type="button" style="display:flex;align-items:center;gap:6px;margin-left:0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:14px;height:14px"><path d="M3 3h6v6H3z"/><path d="M15 3h6v6h-6z"/><path d="M15 15h6v6h-6z"/><path d="M9 6h3a3 3 0 0 1 3 3v6"/><path d="M12 18h3"/></svg>
                  JSON Tree
                </button>
              </div>
            </div>
            <div class="code-container" style="max-height:300px;overflow-y:auto;margin:0;border-radius:0 0 6px 6px">
              <pre><code class="batch-json-code" data-sidx="${sIdx}"></code></pre>
            </div>
          </div>
        `;
      });
    }
    
    html += `</div>`;
    if (batchDetailPanel) batchDetailPanel.innerHTML = html;
    
    if (r.steps && batchDetailPanel) {
      // Build unified logs for all steps
      const allLogs = [];
      r.steps.forEach((s, sIdx) => {
        const stepLogs = buildOperationLogData(s);
        stepLogs.forEach((log, lIdx) => {
          allLogs.push({
            ...log,
            _sIdx: sIdx,
            tab_label: s.type === 'websocket' ? `Step ${sIdx+1} Op ${lIdx+1}` : `Step ${sIdx+1}`
          });
        });
      });

      r.steps.forEach((step, sIdx) => {
        const resDisp = buildStepResponseData(step);
        const codeEl = batchDetailPanel.querySelector(`.batch-json-code[data-sidx="${sIdx}"]`);
        if (codeEl) hlJSON(resDisp, codeEl);
        
        const treeBtn = batchDetailPanel.querySelector(`.batch-tree-btn[data-sidx="${sIdx}"]`);
        if (treeBtn) treeBtn.onclick = () => openJsonTreeDialog('Step Response', resDisp);
      });
      
      if (allLogs.length > 0) {
        const globalOpLogBtn = batchDetailPanel.querySelector('.batch-global-oplog-btn');
        if (globalOpLogBtn) {
          globalOpLogBtn.style.display = 'flex';
          globalOpLogBtn.onclick = () => {
            const preferredIdx = allLogs.findIndex(l => l.status === 'failed');
            openOperationLogDialog(allLogs, 'Step Log', preferredIdx >= 0 ? preferredIdx : 0);
          };
        }
      }
    }
  }

  function buildStepResponseData(step) {
    return compactObject({
      step_id: step.step_id,
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
      const batchView = document.getElementById('batch-view');
      layout.style.display      = tab === 'runner'  ? '' : 'none';
      builderView.style.display = tab === 'builder' ? '' : 'none';
      if (batchView) batchView.style.display = tab === 'batch' ? 'flex' : 'none';
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
    { v: 'websocket',         l: 'WebSocket',         g: 'WebSocket'   },
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
        <code class="ctx-suggest-key">${X(ctxPlaceholderForKey(key))}</code>
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
    const insertion = ctxPlaceholderForKey(key);
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
    return replaceCtxPlaceholders(obj, ctx);
  }

  function replaceCtxPlaceholders(value, ctx) {
    if (Array.isArray(value)) return value.map(item => replaceCtxPlaceholders(item, ctx));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, replaceCtxPlaceholders(v, ctx)])
      );
    }
    if (typeof value !== 'string') return value;
    const exact = value.match(/^\$\{(ctx\.[^}]+)\}$/);
    if (exact) {
      const key = normalizeCtxLookupKey(exact[1], ctx);
      if (key) return ctx[key];
    }
    return value.replace(/\$\{(ctx\.[^}]+)\}/g, (full, key) =>
      normalizeCtxLookupKey(key, ctx) ? String(ctx[normalizeCtxLookupKey(key, ctx)]) : full
    );
  }

  function ctxPlaceholderForKey(key) {
    const clean = String(key || '').replace(/^ctx\./, '');
    return `\${ctx.${clean}}`;
  }

  function normalizeCtxLookupKey(key, ctx) {
    const raw = String(key || '');
    const candidates = [
      raw,
      raw.startsWith('ctx.') ? raw.replace(/^ctx\./, '') : `ctx.${raw}`,
      raw.startsWith('ctx.ctx.') ? raw.replace(/^ctx\./, '') : '',
    ].filter(Boolean);
    return candidates.find(candidate => Object.prototype.hasOwnProperty.call(ctx, candidate)) || '';
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
      wsUrl: '', wsHeaders: [], wsOps: [],
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
        // Still set data for compatibility, but rely on draggedStepId
        e.dataTransfer.setData('text/plain', String(s._id));
        draggedStepId = s._id;
        tab.classList.add('bldr-tab-dragging');
      });
      tab.addEventListener('dragend', () => {
        draggedStepId = null;
        stepTabsEl.querySelectorAll('.bldr-step-tab').forEach(el => {
          el.classList.remove('bldr-tab-dragging', 'bldr-tab-drop-before', 'bldr-tab-drop-after');
        });
      });
      tab.addEventListener('dragover', e => {
        if (!draggedStepId) return;
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
        if (!draggedStepId) return;
        e.preventDefault();
        const draggedId = draggedStepId;
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
    document.getElementById('tc-id').value = '';
    document.getElementById('tc-description').value = '';
    document.getElementById('tc-category').value = '';
    document.getElementById('tc-timeout').value = 30000;
    window._resetTcIdTracking?.();

    tcSteps = [];
    stepSeq = 0;
    activeStepId = null;
    tcOrder = 0;
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
      case 'websocket':         return fWs(s);
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
        <textarea class="exp-textarea bldr-payload-ta" data-json-editor spellcheck="false" style="min-height:200px">${X(s.payload)}</textarea>
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
        <textarea class="exp-textarea bldr-http-body-ta" data-json-editor spellcheck="false" style="min-height:260px">${X(s.httpBody)}</textarea>
      </div>`;
  }
  function fWs(s) {
    const hRows = s.wsHeaders.map((h,i) => metaRowHTML(h, i, 'Authorization', 'Bearer ...')).join('');
    return `
      <div class="exp-section">
        <label class="exp-label">URL</label>
        <input class="exp-input bldr-ws-url-in" style="width:100%" value="${X(s.wsUrl)}"
          placeholder="ws://127.0.0.1:8080/api/v1/external/connect?ticket=\${ctx.ticket}"/>
      </div>
      <div class="exp-section">
        <div class="exp-section-header">
          <label class="exp-label">Headers <span class="exp-optional">(optional)</span></label>
          <button class="btn btn-sm bldr-add-wsh-btn">+ Add</button>
        </div>
        <div class="exp-meta-rows bldr-wsh-rows">${hRows}</div>
      </div>
      <div class="exp-section" style="padding-bottom:8px">
        <label class="exp-label" style="margin-bottom:8px;display:block">Operations</label>
        <div class="bldr-ws-ops-list"></div>
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
        <textarea class="exp-textarea bldr-fgrpc-resp-ta" data-json-editor spellcheck="false" style="min-height:280px">${X(s.fakeGrpcResponses)}</textarea>
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
        <textarea class="exp-textarea bldr-fhttp-routes-ta" data-json-editor spellcheck="false" style="min-height:320px">${X(s.fakeHttpRoutes)}</textarea>
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
    s._card = card; // store DOM reference for DOM-sync on save
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
      case 'websocket':         attachWebSocket(card, s); break;
      case 'db_check':          attachDb(card, s); break;

      case 'delay':             bind(card, '.bldr-delay-in', 'input', e => s.durationMs = +e.target.value || 0); break;
      case 'include':           bind(card, '.bldr-include-in', 'input', e => s.includePath = e.target.value); break;
      case 'group':             bind(card, '.bldr-group-in', 'input', e => s.groupFile = e.target.value); break;
      case 'fake_grpc_start':   attachFakeGrpcStart(card, s); break;
      case 'fake_grpc_stop':    bind(card, '.bldr-fgrpc-addr-in', 'input', e => s.fakeGrpcAddr = e.target.value); break;
      case 'fake_http_start':   attachFakeHttpStart(card, s); break;
      case 'fake_http_stop':    bind(card, '.bldr-fhttp-url-in', 'input', e => s.fakeHttpUrl = e.target.value); break;
    }
    // Initialize JSON editor overlays for all JSON textareas in this form
    initJsonEditors(card.querySelector('.bldr-card-form'));
  }

  // ── Assertions & Exports ──
  function renderAE(card, s) {
    // WebSocket uses per-operation exports/asserts — skip the step-level AE panel
    if (s.type === 'websocket') return;
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

  // ── WebSocket structured editor ──
  function attachWebSocket(card, s) {
    bind(card, '.bldr-ws-url-in', 'input', e => s.wsUrl = e.target.value);
    attachMetaRows(card, s, '.bldr-wsh-rows', '.bldr-add-wsh-btn', s.wsHeaders);

    renderWsOps(card, s);
  }

  function renderWsOps(card, s) {
    const list = card.querySelector('.bldr-ws-ops-list');
    if (!list) return;

    function opHTML(op, i) {
      const isSend    = op.type === 'send';
      const isCollect = op.type === 'collect';
      const mt        = op.matchType || 'equals';   // 'equals' | 'any' | 'contains'
      const expRows = isSend ? '' : (op.exports || []).map((e, ei) => `
        <div class="bldr-ae-row" data-ei="${ei}">
          <input class="exp-input bldr-ws-exp-path" value="${X(e.path)}" placeholder="response.field"/>
          <span class="bldr-ae-arrow">→</span>
          <input class="exp-input bldr-ws-exp-as"   value="${X(e.as)}"   placeholder="ctx.variable_name"/>
          <button class="exp-remove-meta bldr-rm-ws-exp" data-ei="${ei}">×</button>
        </div>`).join('');

      return `
        <div class="bldr-ws-op-card${op.disabled ? ' disabled' : ''}" data-oi="${i}">
          <div class="bldr-ws-op-header">
            <label class="bldr-ws-op-run-toggle" title="Run or skip this operation">
              <input class="bldr-ws-op-enabled" type="checkbox"${op.disabled ? '' : ' checked'}>
              <span>Run</span>
            </label>
            <span class="bldr-ws-op-badge ${isSend ? 'bldr-ws-send' : isCollect ? 'bldr-ws-collect' : 'bldr-ws-await'}">${isSend ? 'SEND' : isCollect ? 'COLLECT' : 'AWAIT'}</span>
            <div class="bldr-ws-op-meta">
              <input class="exp-input bldr-ws-op-id"   value="${X(op.id||'')}"          placeholder="op_id (optional)" style="width:130px;font-family:monospace;font-size:11px"/>
              <input class="exp-input bldr-ws-op-desc" value="${X(op.description||'')}" placeholder="Description…"     style="flex:1;font-size:12px"/>
            </div>
            <div class="bldr-ws-op-controls">
              <button class="btn btn-sm bldr-ws-op-up"  data-oi="${i}" ${i===0?'disabled':''} title="Move up">↑</button>
              <button class="btn btn-sm bldr-ws-op-dn"  data-oi="${i}" ${i===s.wsOps.length-1?'disabled':''} title="Move down">↓</button>
              <button class="btn btn-sm bldr-ws-op-del" data-oi="${i}" title="Remove" style="border-color:rgba(239,68,68,0.3);color:var(--neon-danger)">×</button>
            </div>
          </div>
          <div class="bldr-ws-op-body">
            ${isSend ? `
              <label class="exp-label">Payload <span class="exp-optional">(JSON)</span></label>
              <textarea class="exp-textarea bldr-ws-op-payload" data-json-editor spellcheck="false" style="min-height:120px">${X(op.payload)}</textarea>
            ` : isCollect ? `
              <div style="display:flex;align-items:center;gap:10px">
                <label class="exp-label" style="margin:0;white-space:nowrap">Timeout (ms)</label>
                <input class="exp-input bldr-ws-op-timeout" type="number" value="${op.timeoutMs||3000}" style="width:120px"/>
              </div>
              <p class="bldr-hint" style="margin-top:8px">Waits for the full timeout duration, collects all messages received, and returns them. No match filtering.</p>
            ` : `
              <div style="display:flex;gap:10px;align-items:flex-end">
                <div style="flex:1">
                  <label class="exp-label">Match Path <span class="exp-optional">(empty = accept any message)</span></label>
                  <input class="exp-input bldr-ws-op-mpath" value="${X(op.matchPath)}" placeholder="Leave empty for any / e.g. Type"/>
                </div>
                <div style="flex-shrink:0">
                  <label class="exp-label">Match Type</label>
                  <select class="exp-select bldr-ws-op-mtype" style="width:110px">
                    <option value="equals"   ${mt==='equals'  ?'selected':''}>Equals</option>
                    <option value="any"      ${mt==='any'     ?'selected':''}>Any</option>
                    <option value="contains" ${mt==='contains'?'selected':''}>Contains</option>
                  </select>
                </div>
                ${mt !== 'any' ? `
                <div style="flex:1">
                  <label class="exp-label">${mt === 'contains' ? 'Contains' : 'Value'}</label>
                  <input class="exp-input bldr-ws-op-meq" value="${X(op.matchEquals)}"
                    placeholder="${mt === 'contains' ? 'partial string…' : 'expected value'}"/>
                </div>` : ''}
              </div>
              <div style="margin-top:8px;display:flex;align-items:center;gap:10px">
                <label class="exp-label" style="margin:0;white-space:nowrap">Timeout (ms)</label>
                <input class="exp-input bldr-ws-op-timeout" type="number" value="${op.timeoutMs||5000}" style="width:120px"/>
              </div>
              <div class="exp-section-header" style="margin-top:10px;padding:0">
                <label class="exp-label" style="margin:0">Exports <span class="exp-optional">(optional)</span></label>
                <button class="btn btn-sm bldr-ws-add-exp" data-oi="${i}">+ Add</button>
              </div>
              <div class="bldr-ws-exp-rows">${expRows}</div>
            `}
          </div>
        </div>`;
    }

    // Render ops + footer add buttons
    const opsHTML = s.wsOps.length === 0
      ? `<div class="bldr-hint" style="text-align:center;padding:14px 16px">No operations yet.</div>`
      : s.wsOps.map(opHTML).join('');

    list.innerHTML = opsHTML + `
      <div class="bldr-ws-ops-footer">
        <button class="btn btn-sm bldr-ws-add-send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:12px;height:12px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Send
        </button>
        <button class="btn btn-sm bldr-ws-add-await" style="border-color:rgba(139,92,246,0.4);color:#a78bfa">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:12px;height:12px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Await
        </button>
        <button class="btn btn-sm bldr-ws-add-collect" style="border-color:rgba(245,158,11,0.4);color:var(--neon-warning)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Collect
        </button>
      </div>`;

    // Attach footer add buttons
    list.querySelector('.bldr-ws-add-send').addEventListener('click', () => {
      s.wsOps.push({ type: 'send', id: '', description: '', payload: '{}' });
      renderWsOps(card, s);
    });
    list.querySelector('.bldr-ws-add-await').addEventListener('click', () => {
      s.wsOps.push({ type: 'await', id: '', description: '', matchType: 'equals', matchPath: '', matchEquals: '', timeoutMs: 5000, exports: [] });
      renderWsOps(card, s);
    });
    list.querySelector('.bldr-ws-add-collect').addEventListener('click', () => {
      s.wsOps.push({ type: 'collect', id: '', description: '', timeoutMs: 3000 });
      renderWsOps(card, s);
    });

    initJsonEditors(list);

    list.querySelectorAll('[data-oi]').forEach(el => {
      const i = +el.dataset.oi;
      if (i >= s.wsOps.length) return;
      const op = s.wsOps[i];
      if (el.classList.contains('bldr-ws-op-up'))  el.addEventListener('click', () => { if (i>0) { [s.wsOps[i-1],s.wsOps[i]]=[s.wsOps[i],s.wsOps[i-1]]; renderWsOps(card,s); } });
      if (el.classList.contains('bldr-ws-op-dn'))  el.addEventListener('click', () => { if (i<s.wsOps.length-1) { [s.wsOps[i],s.wsOps[i+1]]=[s.wsOps[i+1],s.wsOps[i]]; renderWsOps(card,s); } });
      if (el.classList.contains('bldr-ws-op-del')) el.addEventListener('click', () => { s.wsOps.splice(i,1); renderWsOps(card,s); });
      if (el.classList.contains('bldr-ws-add-exp')) el.addEventListener('click', () => { op.exports.push({path:'',as:''}); renderWsOps(card,s); });
    });

    list.querySelectorAll('.bldr-ws-op-card').forEach(opCard => {
      const i = +opCard.dataset.oi;
      if (i >= s.wsOps.length) return;
      const op = s.wsOps[i];
      opCard.querySelector('.bldr-ws-op-id')?.addEventListener('input',      e => { op.id          = e.target.value; });
      opCard.querySelector('.bldr-ws-op-desc')?.addEventListener('input',    e => { op.description = e.target.value; });
      opCard.querySelector('.bldr-ws-op-enabled')?.addEventListener('change', e => {
        op.disabled = !e.target.checked;
        opCard.classList.toggle('disabled', op.disabled);
      });
      opCard.querySelector('.bldr-ws-op-payload')?.addEventListener('input', e => { op.payload     = e.target.value; });
      opCard.querySelector('.bldr-ws-op-mpath')?.addEventListener('input',   e => { op.matchPath   = e.target.value; });
      opCard.querySelector('.bldr-ws-op-meq')?.addEventListener('input',     e => { op.matchEquals = e.target.value; });
      opCard.querySelector('.bldr-ws-op-timeout')?.addEventListener('input', e => { op.timeoutMs   = +e.target.value || 5000; });
      opCard.querySelector('.bldr-ws-op-mtype')?.addEventListener('change',  e => { op.matchType   = e.target.value; renderWsOps(card,s); });
      opCard.querySelectorAll('.bldr-ae-row[data-ei]').forEach(row => {
        const ei = +row.dataset.ei;
        if (!op.exports || ei >= op.exports.length) return;
        row.querySelector('.bldr-ws-exp-path')?.addEventListener('input', e => { op.exports[ei].path = e.target.value; });
        row.querySelector('.bldr-ws-exp-as')?.addEventListener('input',   e => { op.exports[ei].as   = e.target.value; });
        row.querySelector('.bldr-rm-ws-exp')?.addEventListener('click',   () => { op.exports.splice(ei,1); renderWsOps(card,s); });
      });
    });
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
          payload:  parseJSONWithCtxPlaceholders(s.payload),
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
        if (b) {
          try { a.payload = parseJSONWithCtxPlaceholders(b); }
          catch { a.payload = b; }
        }
        return a;
      }
      case 'websocket': {
        const hdrs = {};
        s.wsHeaders.forEach(h => { if (h.k) hdrs[h.k] = h.v; });
        const ops = (s.wsOps || []).map(op => {
          // id and description come first for readability
          const base = {};
          if (op.id)          base.id          = op.id;
          if (op.description) base.description = op.description;
          if (op.disabled)    base.disabled    = true;
          if (op.type === 'send') {
            return { ...base, type: 'send', payload: parseJSONWithCtxPlaceholders(op.payload) };
          }
          if (op.type === 'collect') {
            return { ...base, type: 'collect', timeout_ms: op.timeoutMs || 3000 };
          }
          const mt = op.matchType || 'equals';
          const match = { path: op.matchPath };
          if (mt === 'any')           { match.any = true; }
          else if (mt === 'contains') { match.contains = op.matchEquals || ''; }
          else                        { match.equals = parseScalar(String(op.matchEquals ?? '')); }
          const o = { ...base, type: 'await', match, timeout_ms: op.timeoutMs || 5000 };
          const exps = (op.exports || []).filter(e => e.path && e.as);
          if (exps.length) o.exports = exps.map(e => ({ path: e.path, as: e.as }));
          return o;
        });
        const a = { url: s.wsUrl, operations: ops };
        if (Object.keys(hdrs).length) a.headers = hdrs;
        return a;
      }
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
        renderStepResult(resultEl, null, msg);
        showToast(`Step ${stepIndexOf(s)} failed: ${msg}`, 'error');
        return;
      }
      s.result = data;
      // save exported values to localStorage context
      if (data.values) saveCtxValues(data.values);
      if (resultSection) {
        resultSection.style.display = '';
      }
      renderStepResult(resultEl, data);
      if (data.status === 'passed') {
        showToast(`Step ${stepIndexOf(s)} passed in ${data.elapsed_ms} ms`);
      } else {
        showToast(`Step ${stepIndexOf(s)} failed${data.error ? ': ' + data.error : ''}`, 'error');
      }
    } catch(err) {
      renderStepResult(resultEl, null, err.message);
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

  function buildStepResponseData(step) {
    return compactObject({
      step_id: step.step_id,
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

  // ── Render step result ──
  function renderStepResult(el, result, errMsg) {
    if (errMsg) { el.innerHTML = `<div class="bldr-result-error" style="padding:10px 16px">${X(errMsg)}</div>`; return; }
    const ok     = result.status === 'passed';
    const disp   = buildStepResponseData(result);
    const opLog  = buildOperationLogData(result);
    el.innerHTML = `
      <div class="bldr-result-header" style="padding:8px 16px 6px">
        <span class="badge ${ok?'badge-success':'badge-danger'}">${ok?'PASSED':'FAILED'}</span>
        <span class="info-text">${result.elapsed_ms} ms</span>
        ${result.error ? `<span class="bldr-result-err-msg">${X(result.error)}</span>` : ''}
        <div style="display:flex;gap:8px;margin-left:auto">
          ${opLog.length ? `
          <button class="btn btn-sm btn-outline bldr-result-oplog-btn" type="button" style="display:flex;align-items:center;gap:6px;margin-left:0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:14px;height:14px">
              <path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>
              <path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>
            </svg>
            ${result.type === 'websocket' ? 'Operation Log' : 'Step Log'}
          </button>` : ''}
          <button class="btn btn-sm btn-outline bldr-result-tree-btn" type="button" style="display:flex;align-items:center;gap:6px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:14px;height:14px">
              <path d="M3 3h6v6H3z"/><path d="M15 3h6v6h-6z"/><path d="M15 15h6v6h-6z"/>
              <path d="M9 6h3a3 3 0 0 1 3 3v6"/><path d="M12 18h3"/>
            </svg>
            JSON Tree
          </button>
        </div>
      </div>
      <div class="code-container bldr-result-code" style="margin:0 16px 12px;max-height:600px;overflow-y:auto">
        <pre><code class="bldr-result-json"></code></pre>
      </div>`;
    
    hlJSON(disp, el.querySelector('.bldr-result-json'));
    el.querySelector('.bldr-result-tree-btn')?.addEventListener('click', () => {
      openJsonTreeDialog('Step Response', disp);
    });
    el.querySelector('.bldr-result-oplog-btn')?.addEventListener('click', () => {
      const allLogs = [];
      let activeIdx = 0;
      const stepsWithResult = tcSteps.filter(s => s.result);
      
      if (stepsWithResult.length === 0) {
        openOperationLogDialog(opLog, result.type === 'websocket' ? 'Operation Log' : 'Step Log');
        return;
      }
      
      stepsWithResult.forEach((s, sIdx) => {
        const stepLogs = buildOperationLogData(s.result);
        stepLogs.forEach((log, lIdx) => {
          const isTarget = s.result.step_id === result.step_id;
          if (isTarget && activeIdx === 0) activeIdx = allLogs.length;
          allLogs.push({
            ...log,
            _sIdx: sIdx,
            tab_label: s.result.type === 'websocket' ? `Step ${sIdx+1} Op ${lIdx+1}` : `Step ${sIdx+1}`
          });
        });
      });
      openOperationLogDialog(allLogs, 'Step Log', activeIdx);
    });
  }

  function buildOperationLogData(result) {
    const rawPayload = parseMaybeJson(result.raw_payload);
    if (Array.isArray(rawPayload?.operation_logs)) return rawPayload.operation_logs;

    const action = parseMaybeJson(result.request?.action);
    if (result.type !== 'websocket') {
      const raw = parseMaybeJson(result.raw_payload);
      return [compactObject({
        index: 1,
        status: result.status,
        id: result.step_id,
        type: result.type,
        description: result.description || result.request?.description,
        payload: (raw !== undefined && raw !== null && raw !== '') ? raw : action?.payload,
        response: parseMaybeJson(result.response_summary),
        exports: result.request?.exports,
        asserts: result.request?.asserts
      })];
    }

    const ops = Array.isArray(action?.operations) ? action.operations : [];
    return ops.map((op, index) => compactObject({
      index: index + 1,
      status: op.disabled ? 'skipped' : 'planned',
      id: op.id,
      type: op.type,
      description: op.description,
      disabled: op.disabled || undefined,
      payload: op.payload,
      match: op.match,
      timeout_ms: op.timeout_ms,
      exports: op.exports
    }));
  }

  function openOperationLogDialog(operations, title = 'Operation Log', activeIdx = 0) {
    const overlay = document.createElement('div');
    overlay.className = 'oa-json-tree-viewer-overlay';
    const tabs = operations.map((op, index) => `
      <button class="oa-oplog-tab ${index === activeIdx ? 'active' : ''} ${op.disabled || op.status === 'skipped' ? 'skipped' : ''} ${op.status === 'failed' ? 'failed' : ''}" type="button" data-op-idx="${index}">
        <span>${X(op.tab_label || `#${op.index || index + 1}`)}</span>
        <strong>${X(op.type || 'op')}</strong>
        ${op.id ? `<code>${X(op.id)}</code>` : ''}
      </button>
    `).join('');
    
    // Hide tabs if there is only 1 operation (e.g. for Step Log)
    const showTabs = operations.length > 1;

    overlay.innerHTML = `
      <div class="oa-json-tree-viewer oa-oplog-viewer glass-panel" role="dialog" aria-modal="true" aria-label="${X(title)}">
        <div class="oa-json-tree-viewer-head">
          <div>
            <div class="oa-json-tree-viewer-title">${X(title)}</div>
            <div class="oa-json-tree-viewer-subtitle">Inspect execution details, payloads, and state data.</div>
          </div>
          <button class="icon-btn oa-json-tree-close" type="button" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        ${showTabs ? `<div class="oa-oplog-tabs">${tabs}</div>` : ''}
        <div class="oa-oplog-body">
          <div class="oa-oplog-detail"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const detail = overlay.querySelector('.oa-oplog-detail');

    function renderOperation(index) {
      const op = operations[index];
      if (!op) {
        detail.innerHTML = '<div class="empty-state">No operation selected.</div>';
        return;
      }
      overlay.querySelectorAll('.oa-oplog-tab').forEach(tab => {
        tab.classList.toggle('active', Number(tab.dataset.opIdx) === index);
      });
      detail.innerHTML = operationDetailHTML(op, index);
    }

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close();
    }
    overlay.querySelector('.oa-json-tree-close')?.addEventListener('click', close);
    overlay.querySelectorAll('.oa-oplog-tab').forEach(tab => {
      tab.addEventListener('click', () => renderOperation(Number(tab.dataset.opIdx)));
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKeydown);
    renderOperation(activeIdx);
  }

  function operationDetailHTML(op, index) {
    const status = op.status || (op.disabled ? 'skipped' : 'planned');
    const payload = op.payload !== undefined ? op.payload : parseMaybeJson(op.payload_raw);
    const payloadText = op.payload_raw || (payload !== undefined ? JSON.stringify(payload, null, 2) : '');
    const summaryRows = [
      ['Operation', `#${op.index || index + 1} ${String(op.type || '').toUpperCase()}`],
      ['Status', status],
      ['ID', op.id],
      ['Description', op.description],
      ['Started At', formatOpTime(op.started_at)],
      ['Sent At', formatOpTime(op.sent_at)],
      ['Finished At', formatOpTime(op.finished_at)],
      ['Elapsed', op.elapsed_ms !== undefined ? `${op.elapsed_ms} ms` : ''],
      ['Timeout', op.timeout_ms !== undefined ? `${op.timeout_ms} ms` : ''],
      ['Collected', op.collected_messages_count !== undefined ? `${op.collected_messages_count} message(s)` : ''],
      ['Error', op.error],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    return `
      <div class="oa-oplog-summary">
        ${summaryRows.map(([label, value]) => `
          <div class="oa-oplog-summary-row">
            <span>${X(label)}</span>
            <code>${X(value)}</code>
          </div>
        `).join('')}
      </div>
      ${payloadText ? `
        <div class="oa-oplog-section-title">Payload</div>
        <pre class="oa-oplog-json"><code>${hlJSONStr(payloadText)}</code></pre>
      ` : ''}
      ${op.response ? `
        <div class="oa-oplog-section-title">Response</div>
        <pre class="oa-oplog-json"><code>${hlJSONStr(JSON.stringify(op.response, null, 2))}</code></pre>
      ` : ''}
      ${op.asserts && op.asserts.length > 0 ? `
        <div class="oa-oplog-section-title">Asserts</div>
        <pre class="oa-oplog-json"><code>${hlJSONStr(JSON.stringify(op.asserts, null, 2))}</code></pre>
      ` : ''}
      ${op.exports && op.exports.length > 0 ? `
        <div class="oa-oplog-section-title">Exports</div>
        <pre class="oa-oplog-json"><code>${hlJSONStr(JSON.stringify(op.exports, null, 2))}</code></pre>
      ` : ''}
      ${op.match ? `
        <div class="oa-oplog-section-title">Match</div>
        <pre class="oa-oplog-json"><code>${hlJSONStr(JSON.stringify(op.match, null, 2))}</code></pre>
      ` : ''}
      ${op.matched_message_raw || op.matched_message ? `
        <div class="oa-oplog-section-title">Matched Message</div>
        <pre class="oa-oplog-json"><code>${hlJSONStr(op.matched_message_raw || JSON.stringify(op.matched_message, null, 2))}</code></pre>
      ` : ''}
      ${op.collected_messages_raw || op.collected_messages ? `
        <div class="oa-oplog-section-title">Collected Messages</div>
        <pre class="oa-oplog-json"><code>${hlJSONStr(formatRawMessages(op.collected_messages_raw) || JSON.stringify(op.collected_messages, null, 2))}</code></pre>
      ` : ''}
      <div class="oa-oplog-section-title">Full Operation Log</div>
      <pre class="oa-oplog-json"><code>${hlJSONStr(JSON.stringify(op, null, 2))}</code></pre>
    `;
  }

  function formatOpTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  function formatRawMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) return '';
    return messages.map((m, index) => {
      if (typeof m === 'object' && m !== null && m.time && m.msg) {
        return `// message at ${formatOpTime(m.time)}\n${m.msg}`;
      }
      return `// message ${index + 1}\n${m}`;
    }).join('\n\n');
  }

  function openJsonTreeDialog(title, value) {
    const rawText = JSON.stringify(value, null, 2);
    const overlay = document.createElement('div');
    overlay.className = 'oa-json-tree-viewer-overlay';
    overlay.innerHTML = `
      <div class="oa-json-tree-viewer glass-panel" role="dialog" aria-modal="true" aria-label="${X(title)}">
        <div class="oa-json-tree-viewer-head">
          <div>
            <div class="oa-json-tree-viewer-title">${X(title)}</div>
            <div class="oa-json-tree-viewer-subtitle">Inspect response data as a collapsible JSON tree.</div>
          </div>
          <button class="icon-btn oa-json-tree-close" type="button" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="oa-json-tree-toolbar">
          <div class="oa-json-tree-tabs" role="tablist">
            <button class="oa-json-tree-tab active" type="button" data-view="tree">Tree</button>
            <button class="oa-json-tree-tab" type="button" data-view="raw">Raw</button>
          </div>
          <div class="oa-json-tree-tools">
            <button class="btn btn-sm oa-json-tree-expand" type="button">Expand All</button>
            <button class="btn btn-sm oa-json-tree-collapse" type="button">Collapse All</button>
            <button class="icon-btn oa-json-tree-zoom-out" type="button" title="Zoom out" aria-label="Zoom out">−</button>
            <button class="icon-btn oa-json-tree-zoom-in" type="button" title="Zoom in" aria-label="Zoom in">+</button>
          </div>
        </div>
        <div class="oa-json-tree-viewer-body">
          <div class="oa-json-tree-panel">${renderResponseJsonTree(value, '', true)}</div>
          <pre class="oa-json-raw-panel" style="display:none"><code>${hlJSONStr(rawText)}</code></pre>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const viewer = overlay.querySelector('.oa-json-tree-viewer');
    const treePanel = overlay.querySelector('.oa-json-tree-panel');
    const rawPanel = overlay.querySelector('.oa-json-raw-panel');
    let fontSize = 13;

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close();
    }
    function setView(view) {
      const showTree = view === 'tree';
      treePanel.style.display = showTree ? '' : 'none';
      rawPanel.style.display = showTree ? 'none' : '';
      overlay.querySelectorAll('.oa-json-tree-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });
    }
    function setFontSize(next) {
      fontSize = Math.max(11, Math.min(18, next));
      viewer.style.setProperty('--json-tree-font-size', `${fontSize}px`);
    }

    overlay.querySelector('.oa-json-tree-close')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKeydown);
    overlay.querySelectorAll('.oa-json-tree-tab').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });
    overlay.querySelector('.oa-json-tree-expand')?.addEventListener('click', () => {
      treePanel.querySelectorAll('.oa-response-tree-node.collapsed').forEach(node => node.classList.remove('collapsed'));
    });
    overlay.querySelector('.oa-json-tree-collapse')?.addEventListener('click', () => {
      treePanel.querySelectorAll('.oa-response-tree-node').forEach(node => node.classList.add('collapsed'));
    });
    overlay.querySelector('.oa-json-tree-zoom-out')?.addEventListener('click', () => setFontSize(fontSize - 1));
    overlay.querySelector('.oa-json-tree-zoom-in')?.addEventListener('click', () => setFontSize(fontSize + 1));
    treePanel.addEventListener('click', e => {
      const toggle = e.target.closest('.oa-response-tree-toggle');
      if (!toggle) return;
      toggle.closest('.oa-response-tree-node')?.classList.toggle('collapsed');
    });
    setFontSize(fontSize);
  }

  function renderResponseJsonTree(value, key = '', root = false) {
    const keyHTML = root ? '' : `<span class="oa-response-tree-key">${X(key)}</span><span class="oa-response-tree-colon">: </span>`;
    if (Array.isArray(value)) {
      const children = value.map((v, i) => renderResponseJsonTree(v, String(i))).join('');
      return `
        <div class="oa-response-tree-node">
          <div class="oa-response-tree-row">
            <button class="oa-response-tree-toggle" type="button" aria-label="Toggle node">▾</button>
            ${keyHTML}<span class="oa-response-tree-type">Array(${value.length})</span>
          </div>
          <div class="oa-response-tree-children">${children}</div>
        </div>`;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      const children = entries.map(([k, v]) => renderResponseJsonTree(v, k)).join('');
      return `
        <div class="oa-response-tree-node">
          <div class="oa-response-tree-row">
            <button class="oa-response-tree-toggle" type="button" aria-label="Toggle node">▾</button>
            ${keyHTML}<span class="oa-response-tree-type">Object(${entries.length})</span>
          </div>
          <div class="oa-response-tree-children">${children}</div>
        </div>`;
    }
    return `
      <div class="oa-response-tree-leaf">
        <span class="oa-response-tree-spacer"></span>
        ${keyHTML}${renderResponseTreeScalar(value)}
      </div>`;
  }

  function renderResponseTreeScalar(value) {
    if (typeof value === 'string') return `<span class="json-string">${X(JSON.stringify(value))}</span>`;
    if (typeof value === 'number') return `<span class="json-number">${X(value)}</span>`;
    if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
    if (value === null) return '<span class="json-null">null</span>';
    return `<span class="json-string">${X(String(value))}</span>`;
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
        if (resultSection) {
          resultSection.style.display = '';
        }
        const resultEl = card.querySelector('.bldr-card-result');
        renderStepResult(resultEl, sr);
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
    // Sync all form values from DOM before building (guards against stale state)
    syncAllFromDOM();
    if (!validateJsonEditorsForSave()) return;
    const payload = { ...buildTC(), category: document.getElementById('tc-category').value.trim() || 'builder' };
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
      window.refreshSelectedTestCase?.(data.id, data.category);
      loadBuilderCategories();
    } catch(err) { setMsg(err.message, 'error'); }
    finally { saveBtn.disabled = false; }
  }

  // Sync textarea values directly from DOM into step state, in case
  // event listeners missed any changes (e.g. programmatic edits, paste).
  function syncAllFromDOM() {
    tcSteps.forEach(s => {
      if (s.type !== 'websocket' || !s._card) return;
      const urlEl = s._card.querySelector('.bldr-ws-url-in');
      if (urlEl) s.wsUrl = urlEl.value;
      s.wsOps.forEach((op, i) => {
        const opCard = s._card.querySelector(`.bldr-ws-op-card[data-oi="${i}"]`);
        if (!opCard) return;

        const enabledEl = opCard.querySelector('.bldr-ws-op-enabled');
        if (enabledEl) op.disabled = !enabledEl.checked;
        const idEl = opCard.querySelector('.bldr-ws-op-id');
        if (idEl) op.id = idEl.value;
        const descEl = opCard.querySelector('.bldr-ws-op-desc');
        if (descEl) op.description = descEl.value;
        const payloadEl = opCard.querySelector('textarea.bldr-ws-op-payload');
        if (payloadEl) op.payload = payloadEl.value;
        const mpathEl  = opCard.querySelector('.bldr-ws-op-mpath');
        if (mpathEl)   op.matchPath = mpathEl.value;
        const meqEl    = opCard.querySelector('.bldr-ws-op-meq');
        if (meqEl)     op.matchEquals = meqEl.value;
        const timeEl   = opCard.querySelector('.bldr-ws-op-timeout');
        if (timeEl)    op.timeoutMs = +timeEl.value || 5000;
        opCard.querySelectorAll('.bldr-ae-row[data-ei]').forEach(row => {
          const ei = +row.dataset.ei;
          if (!op.exports || ei >= op.exports.length) return;
          const pathEl = row.querySelector('.bldr-ws-exp-path');
          if (pathEl) op.exports[ei].path = pathEl.value;
          const asEl = row.querySelector('.bldr-ws-exp-as');
          if (asEl) op.exports[ei].as = asEl.value;
        });
      });
    });
    // Sync grpc payload too
    tcSteps.forEach(s => {
      if (s.type !== 'grpc_unary' || !s._card) return;
      const payloadEl = s._card.querySelector('.bldr-payload-ta');
      if (payloadEl) s.payload = payloadEl.value;
    });
  }

  function validateJsonEditorsForSave() {
    const editors = document.querySelectorAll('#builder-view textarea[data-json-editor]');
    for (const editor of editors) {
      const raw = editor.value.trim();
      if (!raw) continue;
      try {
        parseJSONWithCtxPlaceholders(raw);
      } catch (err) {
        const message = `Invalid JSON: ${err.message}.`;
        setMsg(message, 'error');
        showToast(message, 'error');
        editor.focus();
        return false;
      }
    }
    return true;
  }

  function buildTC() {
    const name = document.getElementById('tc-name').value.trim();
    const idInput = document.getElementById('tc-id').value.trim();
    return {
      id:          idInput || slugTC(name),
      name,
      description: document.getElementById('tc-description').value.trim(),
      order:       tcOrder,
      config:      { timeout_ms: +document.getElementById('tc-timeout').value || 30000 },
      steps:       tcSteps.map((step, index) => buildStepJSON(step, index)),
    };
  }

  // Auto-sync ID from name when ID hasn't been manually overridden
  (() => {
    let idManuallyEdited = false;
    const nameEl = document.getElementById('tc-name');
    const idEl   = document.getElementById('tc-id');
    if (!nameEl || !idEl) return;
    nameEl.addEventListener('input', () => {
      if (!idManuallyEdited) idEl.value = slugTC(nameEl.value);
    });
    idEl.addEventListener('input', () => { idManuallyEdited = true; });
    idEl.addEventListener('blur',  () => {
      if (!idEl.value.trim()) { idManuallyEdited = false; idEl.value = slugTC(nameEl.value); }
    });
    // Expose reset for loadInBuilder / resetBuilder
    window._resetTcIdTracking = () => { idManuallyEdited = false; };
  })();

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
  window.loadInBuilder = function(tc) {
    if (!tc) return;
    document.getElementById('testcase-toggle').click(); // expand
    if (layout.classList.contains('catalog-collapsed')) {
      document.getElementById('catalog-toggle').click();
    }
    tcOrder = tc.order || 0;
    document.getElementById('tc-name').value = tc.name || '';
    document.getElementById('tc-description').value = tc.description || '';
    document.getElementById('tc-category').value = tc.category || '';
    document.getElementById('tc-timeout').value = tc.config?.timeout_ms || 30000;
    categoryMenu.style.display = 'none';

    // Switch tab
    const builderTab = document.querySelector('[data-tab="builder"]');
    loadingBuilderFromEdit = true;
    if (builderTab) builderTab.click();
    loadingBuilderFromEdit = false;

    // Populate TC header
    document.getElementById('tc-name').value        = tc.name        || '';
    document.getElementById('tc-id').value          = tc.id          || '';
    document.getElementById('tc-description').value = tc.description || '';
    document.getElementById('tc-category').value    = tc.category    || '';
    document.getElementById('tc-timeout').value     = tc.config?.timeout_ms || 30000;
    window._resetTcIdTracking?.(); // mark as "set from original, not manually edited"

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
      wsUrl: '', wsHeaders: [], wsOps: [],
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
      case 'websocket':
        s.wsUrl     = a.url || '';
        s.wsHeaders = Object.entries(a.headers || {}).map(([k,v]) => ({k,v}));
        s.wsOps     = (a.operations || []).map(op => {
          const base = { id: op.id || '', description: op.description || '', disabled: !!op.disabled };
          if (op.type === 'send') {
            return { ...base, type: 'send', payload: op.payload ? JSON.stringify(op.payload, null, 2) : '{}' };
          }
          if (op.type === 'collect') {
            return { ...base, type: 'collect', timeoutMs: op.timeout_ms || 3000 };
          }
          // Detect match type from the stored JSON
          let matchType = 'equals';
          if (op.match?.any)                        matchType = 'any';
          else if (op.match?.contains !== undefined) matchType = 'contains';
          const matchEquals = matchType === 'contains'
            ? (op.match?.contains || '')
            : String(op.match?.equals ?? '');
          return {
            ...base,
            type:        'await',
            matchType,
            matchPath:   op.match?.path || '',
            matchEquals,
            timeoutMs:   op.timeout_ms  || 5000,
            exports:     (op.exports || []).map(e => ({ path: e.path || '', as: e.as || '' })),
          };
        });
        break;
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
  function parseJSONWithCtxPlaceholders(str) {
    const raw = String(str ?? '').trim();
    if (!raw) return {};
    try { return JSON.parse(raw); }
    catch (firstErr) {
      const normalized = quoteBareCtxPlaceholders(raw);
      if (normalized === raw) throw firstErr;
      return JSON.parse(normalized);
    }
  }
  function quoteBareCtxPlaceholders(str) {
    let out = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inString) {
        out += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        out += ch;
        continue;
      }
      if (str.startsWith('${ctx.', i)) {
        const end = str.indexOf('}', i);
        if (end !== -1) {
          out += `"${str.slice(i, end + 1)}"`;
          i = end;
          continue;
        }
      }
      out += ch;
    }
    return out;
  }
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

  // ── JSON editor overlay ──
  function hlJSONStr(str) {
    if (!str.trim()) return '\n';
    // HTML-escape first to prevent broken rendering
    const safe = str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return safe.replace(
      /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^"\\])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      m => {
        let c = 'json-number';
        if (/^"/.test(m))       c = /:\s*$/.test(m) ? 'json-key' : 'json-string';
        else if (/^true$|^false$/.test(m)) c = 'json-boolean';
        else if (m === 'null')  c = 'json-null';
        return `<span class="${c}">${m}</span>`;
      }
    );
  }

  function initJsonEditors(container) {
    if (!container) return;
    container.querySelectorAll('textarea[data-json-editor]:not([data-je])').forEach(ta => {
      ta.dataset.je = '1';

      const minH = ta.style.minHeight || '120px';

      // Build wrapper + highlight pre
      const wrap = document.createElement('div');
      wrap.className = 'oa-json-wrap';
      wrap.style.minHeight = minH;

      const pre  = document.createElement('pre');
      pre.className = 'oa-json-pre';
      const code = document.createElement('code');
      pre.appendChild(code);

      // Insert wrapper in place of textarea
      ta.parentNode.insertBefore(wrap, ta);
      wrap.appendChild(pre);
      wrap.appendChild(ta);

      // Make textarea transparent (overlay)
      ta.classList.add('oa-json-ta');
      ta.style.minHeight = minH;

      function update() {
        code.innerHTML = hlJSONStr(ta.value);
        pre.scrollTop  = ta.scrollTop;
        pre.scrollLeft = ta.scrollLeft;
      }
      function syncHeight() {
        const h = Math.max(ta.scrollHeight, parseInt(minH) || 120);
        wrap.style.height = h + 'px';
        pre.style.height  = h + 'px';
        ta.style.height   = h + 'px';
      }

      ta.addEventListener('input',  () => { update(); syncHeight(); });
      ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
      ta.addEventListener('keydown', e => {
        // Tab inserts 2 spaces instead of losing focus
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = ta.selectionStart, end = ta.selectionEnd;
          ta.value = ta.value.substring(0,s) + '  ' + ta.value.substring(end);
          ta.selectionStart = ta.selectionEnd = s + 2;
          update();
          syncHeight();
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      update();
      syncHeight();
    });
  }

  function slugTC(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'untitled';
  }

  // Export functions to global scope so Batch Runner / Test Runner can use them
  window.buildOperationLogData = buildOperationLogData;
  window.openOperationLogDialog = openOperationLogDialog;
  window.openJsonTreeDialog = openJsonTreeDialog;
  window.hlJSON = hlJSON;
  window.hlJSONStr = hlJSONStr;
});
