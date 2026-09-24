/* ============================================================
   学术工作台 · 前端逻辑
   双主题（亮色实验室笔记本 / 暗色深墨绿）
   侧边栏导航 · 文献工具 · 前沿日报 · 动画交互
   ============================================================ */

(function () {
  'use strict';

  // ===== 状态 =====
  const state = {
    panel: 'dashboard',
    overview: null,
    news: null,
    todos: [],
    todoDoneCollapsed: true,
    journal: [],
    journalTypeFilter: '全部',
    activeNewsTab: 'all',
    relevanceOnly: false,   // 只看与研究领域相关的资讯
    theme: 'light',
    // 文献工具
    lit: { journals: null, glossary: null, queries: null, arxiv: null },
    activeLitTab: 'journals',
    journalFilter: 'all',
    glossaryQuery: '',
    // 前沿瞭望
    frontier: null,
    // 热点日报
    hotspots: null,
    // 科技爱好者周刊（独立轻接口）
    weekly: null,
    // PDF 转写
    pdf: {
      file: null,
      jobId: null,
      timer: null,
      creepTimer: null,
      running: false,
      health: null,
      markdown: '',
      view: 'preview',
      progress: 0,
    },
    noteStudio: { notes: [], trash: [] },
    noteId: null,
    noteTrashOpen: false,
    promptLibrary: { prompts: [], trash: [] },
    promptId: null,
    promptTrashOpen: false,
    promptCategoryFilter: 'all',
    researchProjects: { projects: [], trash: [] },
    projectId: null,
    projectTrashOpen: false,
    projectCategoryFilter: 'all',
    dataCodeLibrary: { items: [], trash: [] },
    dataCodeId: null,
    dataCodeTrashOpen: false,
    dataCodeCategoryFilter: 'all',
    referenceLibrary: { items: [], trash: [] },
    referenceId: null,
    referenceTrashOpen: false,
    referenceQuery: '',
    referenceTypeFilter: 'all',
    journalTracker: { subscriptions: [], articles: [], refreshLogs: [] },
    journalTrackerLoaded: false,
    journalTrackerLoading: false,
    journalTrackerRefreshingAll: false,
    journalTrackerRefreshingCategory: '',
    journalTrackerRetryingFailed: false,
    journalTrackerAutoRefreshAt: 0,
    journalTrackerQuery: '',
    journalTrackerFilter: 'all',
    trackerJournalCategoryFilter: 'all',
    trackerAddCategory: '__default__',
    journalTrackerReadFilter: 'all',
    trackerCollapsedGroups: { unread: false, read: true },
    trackerArticlePages: { unread: 1, read: 1 },
    trackerArticleSorts: { unread: 'newest', read: 'newest' },
    trackerJournalCategoryCollapsed: {},
    trackerCategoryManageMode: false,
    trackerSelectedJournalIds: {},
  };
  try { state.trackerCollapsedGroups = Object.assign(state.trackerCollapsedGroups, JSON.parse(localStorage.getItem('academic-workbench-tracker-collapsed-v1') || '{}')); } catch (_) {}
  try { state.trackerJournalCategoryCollapsed = JSON.parse(localStorage.getItem('academic-workbench-journal-categories-collapsed-v1') || '{}'); } catch (_) {}
  var journalTrackerAutoRefreshStorageKey = 'academic-workbench-journal-tracker-last-auto-refresh-v2';
  try { state.journalTrackerAutoRefreshAt = Number(localStorage.getItem(journalTrackerAutoRefreshStorageKey)) || 0; } catch (_) {}

  const PANEL_TITLES = {
    'research-hub': '论文管线',
    'academic-records': '学术履历',
    'knowledge-base': '知识库',
    'note-studio': '公众号笔记',
    'prompt-library': '提示词库',
    'research-projects': '研究项目',
    references: '文献与引用',
    'journal-tracker': '文献追踪',
    dashboard: '概览',
    todos: '待办事项',
    focus: '专注',
    news: '资讯动态',
    literature: '文献工具',
    pdf: 'PDF转写',
    translations: '译文库',
    readings: '原文精读',
    frontier: '前沿瞭望',
    hotspots: '热点日报',
    weekly: '科技周报',
    sections: '文件夹',
    journal: '研究日志',
    summaries: '摘要卡片',
  };

  // 浏览器版仅保留研究管理核心功能；已下线的页面即使通过旧书签访问也返回概览。
  const RETIRED_PANELS = ['literature', 'pdf', 'translations', 'readings', 'frontier', 'hotspots', 'weekly', 'summaries', 'sections', 'news', 'data-code'];

  // 板块图标（线性 SVG）
  const SECTION_ICONS = {
    '01_文献库': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    '02_研究笔记': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    '03_论文写作': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    '04_数据分析': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    '05_学业事务': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '06_项目归档': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    '07_个人管理': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    '08_临时中转': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  };

  // 空态图标（内联线性 SVG；界面禁 emoji）
  const HS_ICONS = {
    frontier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5" opacity="0.55"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
    hotspot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v3H4z"/><path d="M4 9h10v11H4z"/><path d="M16 9h4v11h-4z"/><line x1="7" y1="12.5" x2="11" y2="12.5"/><line x1="7" y1="16" x2="11" y2="16"/></svg>',
    weekly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.25a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
    journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  };

  // ===== 工具函数 =====
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  var apiWriteChain = Promise.resolve();
  var activeWorkspaceConflict = null;
  var cloudReloadScheduled = false;
  var pendingExitFlush = false;
  var exitFlushStarted = false;

  function scheduleCloudWorkspaceReload() {
    if (cloudReloadScheduled) return;
    cloudReloadScheduled = true;
    function reloadWhenSaved() {
      flushAllAutoSaves();
      Promise.all([apiWriteChain.catch(function () {}), autoSaveChain.catch(function () {})]).then(function () {
        if (hasPendingAutoSave()) { setTimeout(reloadWhenSaved, 80); return; }
        window.location.reload();
      });
    }
    setTimeout(reloadWhenSaved, 120);
  }

  window.addEventListener('academic-workspace-auto-merged', scheduleCloudWorkspaceReload);

  function api(url, options) {
    function request() {
      var requestOptions = Object.assign({ headers: { 'Content-Type': 'application/json' } }, options);
      if (pendingExitFlush) requestOptions.keepalive = true;
      return fetch(url, requestOptions)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (window.__academicCloudReloadRequired) {
            window.__academicCloudReloadRequired = false;
            scheduleCloudWorkspaceReload();
            return data;
          }
          if (data && data.workspaceConflict) showWorkspaceConflict(data.workspaceConflict);
          if (data && data.ok !== false && account && options && options.method === 'POST' && url.indexOf('/api/sync') !== 0 && url.indexOf('/api/backup') !== 0 && url.indexOf('/api/auth/') !== 0) setTimeout(syncData, 0);
          return data;
        });
    }
    if (!options || options.method !== 'POST') return request();
    var queued = apiWriteChain.catch(function () {}).then(request);
    apiWriteChain = queued.then(function () {}, function () {});
    return queued;
  }

  var account = null;
  var registering = false;
  var syncTimer = null;
  var academicEditorKind = '';
  var researchHubKeys = ['research-hub-crossref-email', 'research-hub-crossref-citations-v1', 'research-hub-stages-v1', 'research-hub-fields-v1', 'research-hub-cards-v1', 'research-hub-theme', 'research-hub-unassigned-data-code-v1'];
  var autoSaveSlots = {};
  var autoSaveChain = Promise.resolve();
  var autoSaveRunning = 0;
  var AUTO_SAVE_INTERVAL = 180000;
  var activeVersionHistory = null;
  var manualSaveStatusTimers = Object.create(null);

  function setGlobalSaveState(text, status) {
    var target = $('#globalSaveState');
    if (!target) return;
    target.dataset.state = status || 'idle';
    var label = $('span', target);
    if (label) label.textContent = text;
  }

  function hasPendingAutoSave() {
    return autoSaveRunning > 0 || Object.keys(autoSaveSlots).some(function (key) { return Boolean(autoSaveSlots[key].timer); });
  }

  function hasUnsavedChanges() {
    return Object.keys(autoSaveSlots).some(function (key) { return Boolean(autoSaveSlots[key].dirty); });
  }

  function runAutoSave(key, revision, payload, persist, automatic) {
    autoSaveRunning += 1;
    var activeSlot = autoSaveSlots[key];
    if (activeSlot) activeSlot.inFlight = (activeSlot.inFlight || 0) + 1;
    setGlobalSaveState('保存中…', 'saving');
    autoSaveChain = autoSaveChain.catch(function () {}).then(function () { return persist(payload, automatic); }).then(function () {
      autoSaveRunning = Math.max(0, autoSaveRunning - 1);
      var slot = autoSaveSlots[key];
      if (slot) {
        slot.inFlight = Math.max(0, (slot.inFlight || 0) - 1);
        if (slot.revision === revision) slot.dirty = false;
      }
      if (slot && slot.revision === revision && !hasPendingAutoSave() && !hasUnsavedChanges()) {
        var time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        setGlobalSaveState((automatic ? '已自动保存 ' : '已保存 ') + time, 'saved');
      }
    }, function () {
      autoSaveRunning = Math.max(0, autoSaveRunning - 1);
      var slot = autoSaveSlots[key];
      if (slot) slot.inFlight = Math.max(0, (slot.inFlight || 0) - 1);
      setGlobalSaveState('保存失败，请检查网络', 'error');
    });
    return autoSaveChain;
  }

  function queueAutoSave(key, payload, persist) {
    var slot = autoSaveSlots[key] || { revision: 0, timer: null, inFlight: 0, dirty: false };
    slot.revision += 1;
    slot.payload = payload;
    slot.persist = persist;
    slot.dirty = true;
    if (!slot.timer) slot.timer = setTimeout(function () {
      slot.timer = null;
      runAutoSave(key, slot.revision, slot.payload, slot.persist, true);
    }, AUTO_SAVE_INTERVAL);
    autoSaveSlots[key] = slot;
    setGlobalSaveState('有更改待保存', 'pending');
  }

  function flushAllAutoSaves(forceInFlight) {
    Object.keys(autoSaveSlots).forEach(function (key) {
      var slot = autoSaveSlots[key];
      if (!slot.dirty || !slot.persist || (slot.inFlight && !forceInFlight)) return;
      if (slot.timer) { clearTimeout(slot.timer); slot.timer = null; }
      runAutoSave(key, slot.revision, slot.payload, slot.persist, true);
    });
  }

  function saveImmediately(key, payload, persist) {
    var slot = autoSaveSlots[key] || { revision: 0, timer: null, inFlight: 0, dirty: false };
    slot.revision += 1;
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.payload = payload;
    slot.persist = persist;
    slot.dirty = true;
    autoSaveSlots[key] = slot;
    return runAutoSave(key, slot.revision, payload, persist, false);
  }

  function handleBeforeUnload(event) {
    rememberScroll();
    if (!hasUnsavedChanges()) return;
    pendingExitFlush = true;
    exitFlushStarted = true;
    flushAllAutoSaves(true);
    event.preventDefault();
    event.returnValue = '尚有修改未保存，是否保存后离开？';
    setTimeout(function () {
      if (!document.hidden) { pendingExitFlush = false; exitFlushStarted = false; }
    }, 0);
    return '';
  }

  function flushAutoSavesOnPageHide() {
    if (exitFlushStarted || !hasUnsavedChanges()) return;
    pendingExitFlush = true;
    flushAllAutoSaves(true);
  }

  function setManualSaveStatus(button, status) {
    if (!button) return;
    var timerKey = button.id || 'manual-save';
    clearTimeout(manualSaveStatusTimers[timerKey]);
    button.classList.remove('is-saving', 'is-saved', 'is-save-error');
    if (status === 'saving') {
      button.disabled = true;
      button.textContent = '正在保存';
      button.classList.add('is-saving');
      return;
    }
    button.disabled = false;
    button.textContent = status === 'saved' ? '已保存' : '保存失败';
    button.classList.add(status === 'saved' ? 'is-saved' : 'is-save-error');
    manualSaveStatusTimers[timerKey] = setTimeout(function () {
      if (!button.isConnected) return;
      button.textContent = '立即保存';
      button.classList.remove('is-saved', 'is-save-error');
    }, status === 'saved' ? 1500 : 2500);
  }

  function recycleBinToolbar(kind, label, count) {
    return '<div class="recycle-bin-toolbar"><span><b>' + escapeHtml(label) + '回收站</b><small>' + count + ' 项</small></span><button type="button" data-empty-trash="' + kind + '"' + (count ? '' : ' disabled') + '>清空回收站</button></div>';
  }

  function emptyRecycleBin(kind) {
    var bins = {
      knowledge: { endpoint: '/api/knowledge-base', action: 'purge-all-trash', state: 'knowledgeBase', response: 'knowledgeBase', render: renderKnowledgeBase, label: '知识库' },
      note: { endpoint: '/api/note-studio', action: 'purge-all', state: 'noteStudio', response: 'noteStudio', render: renderNoteStudio, label: '笔记' },
      prompt: { endpoint: '/api/prompt-library', action: 'purge-all', state: 'promptLibrary', response: 'promptLibrary', render: renderPromptLibrary, label: '提示词' },
      project: { endpoint: '/api/research-projects', action: 'purge-all', state: 'researchProjects', response: 'researchProjects', render: renderResearchProjects, label: '研究项目' },
    };
    var bin = bins[kind];
    if (!bin) return;
    var items = (state[bin.state] || {}).trash || [];
    if (!items.length) return;
    if (!confirm('确定永久删除回收站中的 ' + items.length + ' 项' + (bin.label ? '「' + bin.label + '」' : '') + '吗？此操作无法恢复。')) return;
    var button = $('[data-empty-trash="' + kind + '"]');
    if (button) { button.disabled = true; button.textContent = '正在清空…'; }
    api(bin.endpoint, { method: 'POST', body: JSON.stringify({ action: bin.action }) }).then(function (res) {
      if (!res.ok) throw new Error(res.error || '清空失败');
      state[bin.state] = res[bin.response];
      bin.render();
      toast(bin.label + '回收站已清空');
    }).catch(function (error) {
      toast((error && error.message) || '清空失败，请检查网络');
      if (button && button.isConnected) { button.disabled = false; button.textContent = '清空回收站'; }
    });
  }

  function researchHubSnapshot() {
    var values = {};
    researchHubKeys.forEach(function (key) { values[key] = localStorage.getItem(key); });
    return values;
  }

  function applyResearchHubSnapshot(values) {
    var changed = false;
    Object.keys(values || {}).forEach(function (key) {
      if (researchHubKeys.indexOf(key) < 0) return;
      var current = localStorage.getItem(key);
      var next = values[key];
      if (next === null || next === undefined) {
        if (current !== null) { localStorage.removeItem(key); changed = true; }
      } else if (current !== String(next)) {
        localStorage.setItem(key, next);
        changed = true;
      }
    });
    var frame = $('.research-hub-frame');
    if (changed && frame) frame.src = frame.src;
  }

  var syncDataInFlight = false;
  function syncData() {
    if (!account || document.hidden || syncDataInFlight) return Promise.resolve();
    syncDataInFlight = true;
    return api('/api/sync', { method: 'POST', body: JSON.stringify({ data: {
      todos: state.todos, journal: state.journal,
      researchHub: researchHubSnapshot()
    } }) }).catch(function () {}).then(function () { syncDataInFlight = false; });
  }

  function applySyncData(data) {
    if (!data) return;
    if (Array.isArray(data.todos)) { state.todos = data.todos; renderTodos(); renderDashboardTodos(); updateTodoBadge(); }
    if (Array.isArray(data.journal)) { state.journal = data.journal; renderJournal(); renderDashboardJournal(); }
    applyResearchHubSnapshot(data.researchHub);
  }

  function setAccount(user) {
    account = user || null;
    var button = $('#accountButton');
    if (button) button.textContent = account ? account.email : '登录同步';
    var menuEmail = $('#accountMenuEmail');
    if (menuEmail) menuEmail.textContent = account ? account.email : '';
    if (!account && $('#accountMenu')) $('#accountMenu').hidden = true;
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = account ? setInterval(syncData, 60000) : null;
  }

  function checkAccount() {
    return api('/api/auth/me').then(function (result) {
      setAccount(result.user);
      if (!account) return;
      return api('/api/sync').then(function (sync) { applySyncData(sync.data); });
    }).catch(function () { setAccount(null); });
  }

  function openAuth() { $('#authModal').hidden = false; $('#authForgot').hidden = registering; $('#authEmail').focus(); }
  function closeAuth() { $('#authModal').hidden = true; $('#authError').hidden = true; }
  function toggleAuthMode() {
    registering = !registering;
    $('#authTitle').textContent = registering ? '创建同步账号' : '登录并同步';
    $('#authSubmit').textContent = registering ? '创建账号' : '登录';
    $('#authSwitch').textContent = registering ? '已有账号？登录' : '没有账号？创建账号';
    $('#authPassword').autocomplete = registering ? 'new-password' : 'current-password';
    $('#authForgot').hidden = registering;
  }

  function requestPasswordReset() {
    var email = $('#authEmail').value.trim();
    var error = $('#authError'); error.hidden = true;
    if (!email) { error.textContent = '请先填写注册邮箱。'; error.hidden = false; $('#authEmail').focus(); return; }
    api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: email }) }).then(function (result) {
      if (!result.ok) throw new Error(result.error || '发送失败');
      error.textContent = '重置链接已发送，请前往邮箱完成操作。'; error.style.color = 'var(--accent)'; error.hidden = false;
    }).catch(function (err) { error.style.color = ''; error.textContent = err.message || '发送失败'; error.hidden = false; });
  }

  function openAccountMenu() { var menu = $('#accountMenu'); if (menu) menu.hidden = !menu.hidden; }
  function closeAccountMenu() { var menu = $('#accountMenu'); if (menu) menu.hidden = true; }
  function openPasswordModal() { var recovery = Boolean(window.__academicPasswordRecovery); closeAccountMenu(); $('#passwordModal').hidden = false; $('#currentPasswordRow').hidden = recovery; $('#currentPassword').required = !recovery; $('#passwordModal h2').textContent = recovery ? '邮箱验证成功，请设置新密码' : '修改密码'; $('#newPassword').focus(); }
  function closePasswordModal() { $('#passwordModal').hidden = true; $('#passwordError').hidden = true; $('#passwordForm').reset(); }
  function submitPasswordChange(event) {
    event.preventDefault();
    var error = $('#passwordError'); error.hidden = true;
    var password = $('#newPassword').value;
    var recovery = Boolean(window.__academicPasswordRecovery);
    if (password !== $('#confirmPassword').value) { error.textContent = '两次输入的密码不一致。'; error.hidden = false; return; }
    api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ password: password, currentPassword: $('#currentPassword').value, recovery: recovery }) }).then(function (result) {
      if (!result.ok) throw new Error(result.error || '修改失败');
      window.__academicPasswordRecovery = false; closePasswordModal(); toast('密码已修改');
    }).catch(function (err) { error.textContent = err.message || '修改失败'; error.hidden = false; });
  }

  function logoutAccount() { closeAccountMenu(); api('/api/auth/logout', { method: 'POST' }).then(function () { setAccount(null); toast('已退出登录'); }); }

  function openBackupModal() {
    if (!account) { toast('请先登录后备份账号数据'); openAuth(); return; }
    $('#backupModal').hidden = false;
  }

  function closeBackupModal() { $('#backupModal').hidden = true; $('#backupFileInput').value = ''; }

  function showWorkspaceConflict(conflict) {
    if (!conflict || !conflict.localData) return;
    activeWorkspaceConflict = conflict;
    $('#syncConflictError').hidden = true;
    $('#syncConflictModal').hidden = false;
    $('#syncConflictReload').disabled = false;
    $('#syncConflictKeepLocal').disabled = false;
    setGlobalSaveState('等待处理同步冲突', 'error');
    flushAllAutoSaves();
  }

  function useCloudWorkspace() {
    if (!confirm('载入云端版本会放弃此设备尚未同步的修改。确定继续吗？')) return;
    $('#syncConflictKeepLocal').disabled = true;
    $('#syncConflictReload').disabled = true;
    Promise.all([apiWriteChain.catch(function () {}), autoSaveChain.catch(function () {})]).then(function () {
      activeWorkspaceConflict = null;
      window.location.reload();
    });
  }

  function keepLocalWorkspace() {
    if (!activeWorkspaceConflict || !activeWorkspaceConflict.localData) return;
    if (!confirm('将用此设备的版本覆盖云端版本。覆盖前会先下载一份冲突副本，确定继续吗？')) return;
    $('#syncConflictKeepLocal').disabled = true;
    $('#syncConflictReload').disabled = true;
    Promise.all([apiWriteChain.catch(function () {}), autoSaveChain.catch(function () {})]).then(function () {
      if (!activeWorkspaceConflict || !activeWorkspaceConflict.localData) throw new Error('冲突数据已失效，请重新载入云端版本。');
      var localData = JSON.parse(JSON.stringify(activeWorkspaceConflict.localData));
      downloadBackup(localData, 'sync-conflict');
      return api('/api/backup', { method: 'POST', body: JSON.stringify({ backup: { format: 'academic-research-hub-backup', version: 1, data: localData }, overrideConflict: true }) });
    })
      .then(function (result) {
        if (!result || !result.ok) {
          $('#syncConflictError').textContent = (result && result.error) || '保留本机版本失败，请重试。';
          $('#syncConflictError').hidden = false;
          $('#syncConflictKeepLocal').disabled = false;
          $('#syncConflictReload').disabled = false;
          return;
        }
        activeWorkspaceConflict = null;
        $('#syncConflictModal').hidden = true;
        toast('已保留本机版本，正在同步并重新载入');
        setTimeout(function () { window.location.reload(); }, 700);
      })
      .catch(function (error) {
        $('#syncConflictError').textContent = error.message || '同步失败，请检查网络后重试。';
        $('#syncConflictError').hidden = false;
        $('#syncConflictKeepLocal').disabled = false;
        $('#syncConflictReload').disabled = false;
      });
  }

  function backupFileName(suffix) {
    var date = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return 'academic-research-hub-' + (suffix || 'backup') + '-' + date + '.json';
  }

  function downloadBackup(data, suffix) {
    var backup = { format: 'academic-research-hub-backup', version: 1, exportedAt: new Date().toISOString(), data: data };
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a'); link.href = url; link.download = backupFileName(suffix); document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportWorkspaceBackup() {
    if (!account) { toast('请先登录后备份账号数据'); return; }
    flushAllAutoSaves();
    return autoSaveChain.then(function () { return api('/api/backup'); }).then(function (result) {
      if (!result.ok || !result.data) throw new Error(result.error || '无法读取账号数据');
      downloadBackup(result.data, 'backup');
      toast('全部工作台数据已导出');
    }).catch(function (error) { toast(error.message || '导出失败，请检查网络'); });
  }

  function importWorkspaceBackup(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 20000000) { toast('备份文件不能超过 20 MB'); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast('无法读取所选备份文件'); };
    reader.onload = function () {
      var backup;
      try { backup = JSON.parse(String(reader.result || '')); } catch (error) { toast('文件不是有效的 JSON 备份'); return; }
      if (!backup || backup.format !== 'academic-research-hub-backup' || backup.version !== 1 || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) { toast('备份文件格式无效或版本不受支持'); return; }
      if (!confirm('恢复将替换此账号当前的全部工作台数据。继续前会先自动下载当前数据备份。确定恢复吗？')) return;
      flushAllAutoSaves();
      autoSaveChain.then(function () { return api('/api/backup'); }).then(function (current) {
        if (!current.ok || !current.data) throw new Error(current.error || '无法创建恢复前备份');
        downloadBackup(current.data, 'before-restore');
        return api('/api/backup', { method: 'POST', body: JSON.stringify({ backup: backup }) });
      }).then(function (result) {
        if (!result.ok) throw new Error(result.error || '恢复失败');
        closeBackupModal(); toast('备份已恢复，正在重新载入工作台');
        setTimeout(function () { window.location.reload(); }, 700);
      }).catch(function (error) { toast(error.message || '恢复失败，请检查网络'); });
    };
    reader.readAsText(file);
  }

  function submitAuth(event) {
    event.preventDefault();
    var error = $('#authError'); error.hidden = true;
    api(registering ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#authEmail').value, password: $('#authPassword').value }) })
      .then(function (result) {
        if (!result.ok) throw new Error(result.error || '登录失败');
        setAccount(result.user); closeAuth();
        return api('/api/sync').then(function (sync) {
          if (sync.data && Object.keys(sync.data).length) applySyncData(sync.data); else return syncData();
        });
      }).catch(function (err) { error.textContent = err.message || '登录失败'; error.hidden = false; });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // 轻量 Markdown 渲染器（零依赖，支持日报常用语法）
  function renderMarkdown(md) {
    if (!md) return '';
    var lines = md.split('\n');
    var html = [];
    var inCodeBlock = false;
    var inList = false;
    var listType = '';
    var inQuote = false;

    function closeList() {
      if (inList) {
        html.push('</' + listType + '>');
        inList = false;
        listType = '';
      }
    }
    function closeQuote() {
      if (inQuote) {
        html.push('</blockquote>');
        inQuote = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // 代码块
      if (trimmed.startsWith('```')) {
        closeList(); closeQuote();
        if (inCodeBlock) {
          html.push('</code></pre>');
          inCodeBlock = false;
        } else {
          html.push('<pre><code>');
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) {
        html.push(escapeHtml(line));
        continue;
      }

      // 空行
      if (trimmed === '') {
        closeList(); closeQuote();
        continue;
      }

      // 水平线
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        closeList(); closeQuote();
        html.push('<hr>');
        continue;
      }

      // 标题
      var headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeList(); closeQuote();
        var level = headingMatch[1].length;
        html.push('<h' + level + '>' + renderInline(headingMatch[2]) + '</h' + level + '>');
        continue;
      }

      // 引用
      if (trimmed.startsWith('>')) {
        closeList();
        if (!inQuote) {
          html.push('<blockquote>');
          inQuote = true;
        }
        html.push('<p>' + renderInline(trimmed.replace(/^>\s?/, '')) + '</p>');
        continue;
      } else {
        closeQuote();
      }

      // 无序列表
      if (/^[-*+]\s+/.test(trimmed)) {
        if (!inList || listType !== 'ul') {
          closeList();
          html.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        html.push('<li>' + renderInline(trimmed.replace(/^[-*+]\s+/, '')) + '</li>');
        continue;
      }

      // 有序列表
      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList || listType !== 'ol') {
          closeList();
          html.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        html.push('<li>' + renderInline(trimmed.replace(/^\d+\.\s+/, '')) + '</li>');
        continue;
      }

      // 普通段落
      closeList();
      html.push('<p>' + renderInline(trimmed) + '</p>');
    }

    closeList(); closeQuote();
    if (inCodeBlock) html.push('</code></pre>');
    return html.join('\n');
  }

  // 行内 Markdown：加粗、斜体、行内代码、链接、HTML上标下标
  function renderInline(text) {
    // 先保护 <sup>/<sub> 等安全行内 HTML 标签（escapeHtml 会转义 <>）
    var protectedTags = [];
    var protoText = text.replace(/<(sup|sub|b|i|em|strong|br\s*\/?)>([\s\S]*?)<\/\1>/gi, function (m, tag, inner) {
      var idx = protectedTags.length;
      protectedTags.push('<' + tag + '>' + inner + '</' + tag + '>');
      return '\x00TAG' + idx + '\x00';
    });
    // 自闭合标签 <br/>
    protoText = protoText.replace(/<br\s*\/?>/gi, function (m) {
      var idx = protectedTags.length;
      protectedTags.push('<br>');
      return '\x00TAG' + idx + '\x00';
    });

    var escaped = escapeHtml(protoText);
    // 行内代码
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 加粗
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体（不与加粗冲突）
    escaped = escaped.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // 图片 ![alt](url)（必须在普通链接规则之前）
    escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    // 链接 [text](url)
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 还原被保护的 HTML 标签
    for (var i = 0; i < protectedTags.length; i++) {
      escaped = escaped.replace('\x00TAG' + i + '\x00', protectedTags[i]);
    }
    return escaped;
  }

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  // 数字滚动动画
  function countUp(el, target, duration) {
    if (!el) return;
    duration = duration || 1200;
    var start = performance.now();
    var isFloat = String(target).indexOf('.') > -1;
    function step() {
      var elapsed = performance.now() - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = target * eased;
      el.textContent = isFloat ? val.toFixed(1) : Math.round(val);
      if (progress < 1) setTimeout(step, 16);
    }
    step();
  }

  function formatDate(d) {
    var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + days[d.getDay()];
  }

  // ===== 主题切换 =====
  function initTheme() {
    // ?theme=dark|light 可临时覆盖（方便对比 / 截图 / 分享）
    var q = (location.search.match(/[?&]theme=(light|dark)/) || [])[1];
    var saved = q || localStorage.getItem('academic-workbench-theme');
    state.theme = saved || 'light';
    state.palette = localStorage.getItem('academic-workbench-palette') || (state.theme === 'dark' ? 'midnight' : 'paper');
    if (state.palette === 'midnight') state.theme = 'dark';
    applyTheme();
  }

  function applyTheme() {
    if (state.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.documentElement.setAttribute('data-palette', state.palette || 'paper');
    var select = $('#themeSelect');
    if (select) select.value = state.palette || 'paper';
    $$('[data-theme-palette]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.themePalette === (state.palette || 'paper'));
    });
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    state.palette = state.theme === 'dark' ? 'midnight' : 'paper';
    localStorage.setItem('academic-workbench-theme', state.theme);
    localStorage.setItem('academic-workbench-palette', state.palette);

    // 从按钮位置扩开的圆形揭示（不支持 View Transition 时直接切）
    var root = document.documentElement;
    var btn = $('#themeToggle');
    if (btn) {
      var r = btn.getBoundingClientRect();
      root.style.setProperty('--reveal-x', Math.round(r.left + r.width / 2) + 'px');
      root.style.setProperty('--reveal-y', Math.round(r.top + r.height / 2) + 'px');
    }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && typeof document.startViewTransition === 'function') {
      try {
        root.classList.add('theme-switching');
        var t = document.startViewTransition(applyTheme);
        var done = function () { root.classList.remove('theme-switching'); };
        if (t && t.finished && t.finished.finally) { t.finished.finally(done); }
        else { setTimeout(done, 700); }
        return;
      } catch (err) {
        root.classList.remove('theme-switching');
      }
    }
    applyTheme();
  }

  function selectThemePalette(palette) {
    var palettes = ['paper', 'midnight', 'ocean', 'forest', 'violet', 'rose', 'amber', 'slate'];
    if (palettes.indexOf(palette) === -1) return;
    state.palette = palette;
    state.theme = palette === 'midnight' ? 'dark' : 'light';
    localStorage.setItem('academic-workbench-theme', state.theme);
    localStorage.setItem('academic-workbench-palette', palette);
    applyTheme();
  }

  // ===== 导航切换 =====
  function switchPanel(panel) {
    if (RETIRED_PANELS.indexOf(panel) >= 0) panel = 'dashboard';
    var prev = state.panel;
    if (prev === 'journal-tracker' && panel !== prev && trackerArticleDetailId) closeTrackerArticleDetail();
    if (prev && prev !== panel) scrollMemory[prev] = window.scrollY || 0;
    state.panel = panel;
    $$('.nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.panel === panel);
    });
    $$('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + panel);
    });
    $('#panelTitle').textContent = PANEL_TITLES[panel] || '';
    staggerCards(panel);
    // 面板切换时懒加载数据
    if (panel === 'literature') loadLiteratureAll();
    if (panel === 'frontier') loadFrontier();
    if (panel === 'hotspots') loadHotspots();
    if (panel === 'weekly') loadWeekly();
    if (panel === 'pdf') checkPdfHealth();
    if (panel === 'translations') loadTranslations();
    if (panel === 'readings') loadReadings();
    if (panel === 'knowledge-base') loadKnowledgeBase();
    if (panel === 'note-studio') loadNoteStudio();
    if (panel === 'prompt-library') loadPromptLibrary();
    if (panel === 'research-projects') loadResearchProjects();
    if (panel === 'references') loadReferenceLibrary();
    if (panel === 'journal-tracker') loadJournalTracker();
    if (panel === 'focus') focusRenderAll();   // 专注面板：进度/统计/记录实时刷新
    refreshUnreadBadges();   // 进入即视为已读，红点立刻消
    positionNavInk(true);
    syncHash(panel);
    restoreScroll(panel);
  }

  function staggerCards(panel) {
    var container = $('#panel-' + panel);
    if (!container) return;
    var cards = container.querySelectorAll('.card, .section-card, .news-item, .todo-card, .timeline-item, .journal-card, .glossary-item, .query-item, .arxiv-item, .hs-item, .sum-card');
    cards.forEach(function (card, i) {
      card.style.animationDelay = (Math.min(i, 11) * 0.045) + 's';
    });
  }

  // ===== 数据加载 =====
  /* 品牌副标题：显示研究领域名（来自 data/settings.json 的 field_name）*/
  function applyFieldName(name) {
    if (!name) return;
    var sub = $('#brandSub');
    if (sub) sub.textContent = name;
    document.title = '学术工作台 · ' + name;
  }

  function loadOverview() {
    return api('/api/overview').then(function (data) {
      state.overview = data;
      renderOverview();
      renderSections();
      renderTodayBoard(); renderWeekReview();
      applyFieldName(data.field_name);
    });
  }

  function loadNews() {
    return api('/api/news').then(function (data) {
      state.news = data;
      renderNews();
      renderWeather();
      if (state.overview) {
        var newsCount = 0;
        if (data && data.data && data.data.news) {
          Object.values(data.data.news).forEach(function (src) {
            newsCount += (src.items || []).length;
          });
        }
        var el = $('#statNews');
        if (el) countUp(el, newsCount, 1000);
      }
    });
  }

  function loadTodos() {
    return api('/api/todos').then(function (data) {
      state.todos = data || [];
      renderTodos();
      renderDashboardTodos();
      updateTodoBadge();
      renderTodayBoard(); renderWeekReview();
    });
  }

  function loadJournal() {
    return api('/api/journal').then(function (data) {
      state.journal = data || [];
      renderJournal();
      renderDashboardJournal();
      // 周回顾里的「日志条数」读的是 state.journal —— 别处几个数据源都重算了，
      // 唯独这里漏掉，导致那一格永远是加载时的 0。
      renderWeekReview();
    });
  }

  function loadLiteratureAll() {
    var promises = [];
    if (!state.lit.journals) {
      promises.push(api('/api/literature/journals').then(function (d) { state.lit.journals = d; renderJournals(); renderJournalFilters(); }));
    }
    if (!state.lit.glossary) {
      promises.push(api('/api/literature/glossary').then(function (d) { state.lit.glossary = d; renderGlossary(); }));
    }
    if (!state.lit.queries) {
      promises.push(api('/api/literature/queries').then(function (d) { state.lit.queries = d; renderQueries(); }));
    }
    return Promise.all(promises);
  }

  function loadFrontier() {
    return api('/api/frontier').then(function (data) {
      state.frontier = data;
      renderFrontier();
      renderTodayBoard(); renderWeekReview();
    });
  }

  function loadAll() {
    return Promise.all([loadOverview(), loadNews(), loadTodos(), loadJournal()]);
  }

  // ===== 渲染：概览 =====
  function renderOverview() {
    var phd = state.overview.phd;
    /* 学业进度由入学和预计毕业日期计算。 */
    var phdLabel = phd.label || '学业进度';
    var cardLabel = $('#phdCardLabel');
    if (cardLabel) cardLabel.textContent = phd.stage ? (phdLabel + ' · ' + phd.stage) : phdLabel;
    var miniLabel = $('#phdMiniLabel');
    if (miniLabel) miniLabel.textContent = phdLabel;

    if (phd.configured) {
      countUp($('#phdPercent'), phd.percent, 1500);
      countUp($('#phdPercentMini'), phd.percent, 1500);
      setTimeout(function () {
        $('#phdBarFill').style.width = phd.percent + '%';
        $('#phdBarMini').style.width = phd.percent + '%';
      }, 100);
      $('#phdDays').innerHTML = '已读 <strong>' + phd.elapsed_days + '</strong> 天 · 剩余 <strong>' + phd.remain_days + '</strong> 天';
      $('#phdStartDate').textContent = phd.start;
      $('#phdEndDate').textContent = phd.end;
      var miniRange = $('#phdMiniRange');
      if (miniRange) miniRange.textContent = phd.start.slice(0, 7).replace('-', '.') + ' — ' + phd.end.slice(0, 7).replace('-', '.');
    } else {
      /* 未配置学制：明确说出来，不要拿别人的日期算出假进度 */
      $('#phdPercent').textContent = '—';
      $('#phdPercentMini').textContent = '—';
      $('#phdBarFill').style.width = '0%';
      $('#phdBarMini').style.width = '0%';
      $('#phdStartDate').textContent = '待设置';
      $('#phdEndDate').textContent = '待设置';
      $('#phdDays').textContent = '未设置入学与预计毕业日期';
      var miniRange2 = $('#phdMiniRange');
      if (miniRange2) miniRange2.textContent = '未设置学制';
    }
    renderGraduation();
    renderAcademicRecords();

    var tree = state.overview.tree;
    var fileCount = 0, dirCount = 0;
    (function count(node) {
      if (node.type === 'file') fileCount++;
      else {
        dirCount++;
        (node.children || []).forEach(count);
      }
    })(tree);
    countUp($('#statFiles'), fileCount, 1000);
    countUp($('#statDirs'), dirCount, 1000);

    var newsCount = 0;
    if (state.news && state.news.data && state.news.data.news) {
      Object.values(state.news.data.news).forEach(function (src) {
        newsCount += (src.items || []).length;
      });
    }
    countUp($('#statNews'), newsCount, 1000);
  }

  function renderDashboardTodos() {
    var container = $('#dashboardTodos');
    var pending = state.todos.filter(function (t) { return !t.done; }).slice(0, 4);
    if (pending.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无待办，享受当下。</div>';
      return;
    }
    container.innerHTML = pending.map(function (t) {
      return '<div class="todo-mini-item' + (t.done ? ' done' : '') + '">' +
        '<div class="todo-mini-check"></div>' +
        '<span class="todo-mini-text">' + escapeHtml(t.text) + '</span></div>';
    }).join('');
  }

  function renderDashboardJournal() {
    var container = $('#dashboardJournal');
    var recent = state.journal.slice(0, 3);
    if (recent.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">还没有研究日志，开始记录吧。</div>';
      return;
    }
    container.innerHTML = recent.map(function (j) {
      return '<div class="journal-mini-item">' +
        '<div class="journal-mini-date">' + escapeHtml(j.date || j.created || '') + '</div>' +
        '<div class="journal-mini-text">' + escapeHtml((j.content || '').slice(0, 80)) + ((j.content || '').length > 80 ? '…' : '') + '</div></div>';
    }).join('');
  }

  function updateTodoBadge() {
    var pending = state.todos.filter(function (t) { return !t.done; }).length;
    $('#navTodoBadge').textContent = pending;
    $('#navTodoBadge').style.display = pending > 0 ? '' : 'none';
  }

  // ===== 渲染：天气 =====
  var WEATHER_CODE_MAP = {
    0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
    45: '雾', 48: '雾凇',
    51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
    56: '冻毛毛雨', 57: '强冻毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨',
    66: '冻雨', 67: '强冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '小阵雨', 81: '阵雨', 82: '大阵雨',
    85: '小阵雪', 86: '大阵雪',
    95: '雷暴', 96: '雷暴伴小冰雹', 99: '雷暴伴大冰雹'
  };

  function renderWeather() {
    var w = state.news && state.news.data ? state.news.data.weather : null;
    var el = $('#weatherText');
    if (!w) { el.textContent = '天气暂不可用'; return; }
    var cur = w.current || {};
    var temp = cur.temp;
    // 和风天气直接返回中文 text，优先使用；回退到代码映射
    var desc = cur.text || WEATHER_CODE_MAP[cur.code] || ('天气代码 ' + cur.code);
    // 今天的最高/最低气温
    var today = (w.daily && w.daily[0]) || {};
    var tmax = today.tmax;
    var tmin = today.tmin;
    var range = '';
    if (tmax !== undefined && tmin !== undefined) {
      range = ' · ' + Math.round(tmin) + '° / ' + Math.round(tmax) + '°';
    }
    // 体感温度（如果有）
    var feels = '';
    if (cur.feels_like !== undefined) {
      feels = ' · 体感' + Math.round(cur.feels_like) + '°';
    }
    // 风向风力（如果有）
    var wind = '';
    if (cur.wind_dir && cur.wind_scale !== undefined) {
      wind = ' · ' + cur.wind_dir + cur.wind_scale + '级';
    }
    el.textContent = (w && w.city ? w.city + ' ' : '') + (temp !== undefined ? Math.round(temp) + '°C · ' : '') + desc + range + feels + wind;
    // 渲染天气模态框数据（打开时直接显示）
    renderWeatherModal(w);
  }

  /* ===== 天气图标系统（V4）=====
     全部为线性 SVG，统一 24 网格 / 1.7 描边 / currentColor，
     因此能自动继承所在位置的字色，亮暗主题一致，不再出现 emoji 的五彩突兀感。 */
  var WX_PATH = {
    // —— 天气状况 ——
    sun:      '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
    partly:   '<circle cx="8.4" cy="8.2" r="3.1"/><path d="M8.4 2.7v1.5M2.9 8.2h1.5M4.4 4.2l1.1 1.1M12.4 4.2l-1.1 1.1"/><path d="M17.4 19.4H9.4a3.4 3.4 0 0 1-.3-6.8 4.6 4.6 0 0 1 8.5 1.3 2.8 2.8 0 0 1-.2 5.5z"/>',
    cloud:    '<path d="M17.6 18.6H7.6a3.9 3.9 0 0 1-.4-7.8 5.2 5.2 0 0 1 9.8 1.5 3.2 3.2 0 0 1 .6 6.3z"/>',
    rain:     '<path d="M17.4 15.2H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M9.4 18l-1.2 2.8M13.4 18l-1.2 2.8M17.4 18l-1.2 2.8"/>',
    rainHeavy:'<path d="M17.4 14.6H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M9 17.6l-1.8 4M13.2 17.6l-1.8 4M17.4 17.6l-1.8 4"/>',
    thunder:  '<path d="M17.4 14.4H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M12.8 16.4l-2.4 4h2.9l-1.2 3.4"/>',
    snow:     '<path d="M17.4 14.6H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M9.4 18v2.8M8.2 18.7l2.4 1.4M10.6 18.7l-2.4 1.4M15.6 18v2.8M14.4 18.7l2.4 1.4M16.8 18.7l-2.4 1.4"/>',
    fog:      '<path d="M4.6 9.4h11.2"/><path d="M7.8 12.8h12"/><path d="M3.8 16.2h11.6"/>',
    wind:     '<path d="M3 8h9a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3 12.5h13.6a2.6 2.6 0 1 1-2.6 2.6"/><path d="M3 17h7.2a2.2 2.2 0 1 1-2.2 2.2"/>',
    // —— 详情字段 ——
    thermo:   '<path d="M13.8 13.6V5.4a1.8 1.8 0 0 0-3.6 0v8.2a3.8 3.8 0 1 0 3.6 0z"/><path d="M12 8.4v6.6"/>',
    humidity: '<path d="M12 3.4c3.4 3.7 5.6 6.3 5.6 9.1a5.6 5.6 0 0 1-11.2 0c0-2.8 2.2-5.4 5.6-9.1z"/>',
    gauge:    '<path d="M6.1 17.9A8.4 8.4 0 1 1 17.9 17.9"/><path d="M12 12.4l3.6-3"/><circle cx="12" cy="12.4" r="1.15" fill="currentColor" stroke="none"/>',
    eye:      '<path d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
    uv:       '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
    sunrise:  '<path d="M3.4 18.6h17.2"/><path d="M7.8 14.6a4.2 4.2 0 0 1 8.4 0"/><path d="M12 3.6v2.6"/><path d="M6.2 6.6l1.5 1.5M17.8 6.6l-1.5 1.5"/>',
    // —— 生活指数 ——
    activity: '<path d="M3.4 12h3l2.2-5.2 3.2 10.4 2.4-5.2h4.4"/>',
    car:      '<path d="M4.4 15.2h15.2"/><path d="M6.4 15.2l1.4-4.2h8.4l1.4 4.2"/><circle cx="8" cy="17.4" r="1.4"/><circle cx="16" cy="17.4" r="1.4"/>',
    shirt:    '<path d="M9.4 4.4L5.6 6.8l1.6 3 1.2-.6v8.6h7.2V9.2l1.2.6 1.6-3-3.8-2.4"/><path d="M9.4 4.4a2.6 2.6 0 0 0 5.2 0"/>',
    pin:      '<path d="M12 20.6s5.8-5 5.8-9.2a5.8 5.8 0 1 0-11.6 0c0 4.2 5.8 9.2 5.8 9.2z"/><circle cx="12" cy="11.2" r="2.2"/>',
    pollen:   '<path d="M4.4 19.6C4.4 11.6 9.6 6.4 19.6 6.4c0 9.6-5.2 13.2-11.6 13.2z"/><path d="M8.2 15.8c1.6-3.4 3.8-5.6 7-7"/>',
    fish:     '<path d="M3.6 12c3-4.6 7-4.6 10.4-2.2l4 2.2-4 2.2C10.6 16.6 6.6 16.6 3.6 12z"/><circle cx="8.2" cy="11.2" r=".95" fill="currentColor" stroke="none"/>',
    hanger:   '<path d="M12 7.4a2.1 2.1 0 1 1 2.1-2.1"/><path d="M12 7.4L4.4 14.4h15.2z"/>',
    sparkle:  '<path d="M12 3.6l1.7 4.7 4.7 1.7-4.7 1.7L12 16.4l-1.7-4.7L5.6 10l4.7-1.7z"/><path d="M18.4 16l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
    route:    '<circle cx="6.6" cy="6.6" r="2.4"/><circle cx="17.4" cy="17.4" r="2.4"/><path d="M6.6 9v5a3.6 3.6 0 0 0 3.6 3.6h5"/>',
    smile:    '<circle cx="12" cy="12" r="8.4"/><path d="M8.6 14.2a4.6 4.6 0 0 0 6.8 0"/><circle cx="9.2" cy="9.6" r=".95" fill="currentColor" stroke="none"/><circle cx="14.8" cy="9.6" r=".95" fill="currentColor" stroke="none"/>',
    dot:      '<circle cx="12" cy="12" r="6.6"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  };

  // 注意：多字关键词必须排在单字之前，否则「晴间多云」会被「晴」抢先匹配
  var WEATHER_ICON_MAP = {
    '晴间多云': 'partly', '多云': 'partly', '少云': 'partly', '晴': 'sun',
    '雷阵雨': 'thunder', '雷暴': 'thunder', '暴雨': 'rainHeavy',
    '大雨': 'rainHeavy', '中雨': 'rain', '小雨': 'rain', '阵雨': 'rain',
    '大雪': 'snow', '中雪': 'snow', '小雪': 'snow', '阵雪': 'snow', '雨夹雪': 'snow',
    '浮尘': 'wind', '扬沙': 'wind', '霾': 'fog', '雾': 'fog', '阴': 'cloud',
  };

  function wxSvg(key, cls) {
    var path = WX_PATH[key] || WX_PATH.thermo;
    return '<svg class="wx-ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + path + '</svg>';
  }

  function getWeatherIcon(text) {
    if (!text) return wxSvg('thermo');
    for (var key in WEATHER_ICON_MAP) {
      if (text.indexOf(key) >= 0) return wxSvg(WEATHER_ICON_MAP[key]);
    }
    return wxSvg('thermo');
  }

  // 生活指数 → 图标（按名称关键词匹配）
  function indexIconKey(name) {
    var n = name || '';
    if (n.indexOf('运动') >= 0) return 'activity';
    if (n.indexOf('洗车') >= 0) return 'car';
    if (n.indexOf('穿衣') >= 0) return 'shirt';
    if (n.indexOf('紫外线') >= 0) return 'uv';
    if (n.indexOf('旅游') >= 0) return 'pin';
    if (n.indexOf('过敏') >= 0) return 'pollen';
    if (n.indexOf('感冒') >= 0) return 'thermo';
    if (n.indexOf('钓鱼') >= 0) return 'fish';
    if (n.indexOf('晾晒') >= 0) return 'hanger';
    if (n.indexOf('化妆') >= 0) return 'sparkle';
    if (n.indexOf('交通') >= 0) return 'route';
    if (n.indexOf('舒适') >= 0) return 'smile';
    if (n.indexOf('空气') >= 0 || n.indexOf('污染') >= 0 || n.indexOf('扩散') >= 0) return 'wind';
    return 'dot';
  }

  // 把页面里所有 [data-wx-ico] 占位符渲染成对应图标（单一数据源，避免 HTML/JS 各写一份）
  function paintWxIcons(root) {
    var list = (root || document).querySelectorAll('[data-wx-ico]');
    for (var i = 0; i < list.length; i++) {
      list[i].innerHTML = wxSvg(list[i].getAttribute('data-wx-ico'));
    }
  }

  // 空气质量颜色
  function getAqiColor(aqi) {
    if (aqi <= 50) return { bg: 'rgba(82,196,26,0.12)', text: '#52C41A' };
    if (aqi <= 100) return { bg: 'rgba(250,173,20,0.12)', text: '#D48806' };
    if (aqi <= 150) return { bg: 'rgba(250,140,22,0.12)', text: '#D46B08' };
    if (aqi <= 200) return { bg: 'rgba(234,102,104,0.12)', text: '#CF1322' };
    if (aqi <= 300) return { bg: 'rgba(114,46,209,0.12)', text: '#722ED1' };
    return { bg: 'rgba(122,59,27,0.12)', text: '#7A3B1B' };
  }

  // 预警级别颜色
  function getAlertColor(severity) {
    if (!severity) return '#999';
    var s = severity.toLowerCase();
    if (s.indexOf('红') >= 0 || s === 'severe' || s === 'extreme') return '#CF1322';
    if (s.indexOf('橙') >= 0 || s === 'moderate') return '#D46B08';
    if (s.indexOf('黄') >= 0 || s === 'minor') return '#D48806';
    if (s.indexOf('蓝') >= 0) return '#1677FF';
    return '#999';
  }

  // 天气模态框：打开/关闭
  function openWeatherModal() {
    var modal = $('#weatherModal');
    if (modal) modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeWeatherModal() {
    var modal = $('#weatherModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function renderWeatherModal(w) {
    if (!w || !w.current) return;
    var cur = w.current;
    var today = (w.daily && w.daily[0]) || {};

    // 模态框标题图标 + 当前天气大图标（SVG，需用 innerHTML）
    if ($('#wModalIcon')) $('#wModalIcon').innerHTML = getWeatherIcon(cur.text);
    if ($('#wModalNowIcon')) $('#wModalNowIcon').innerHTML = getWeatherIcon(cur.text);
    // 当前温度
    if ($('#wModalTemp')) $('#wModalTemp').textContent = cur.temp !== undefined ? Math.round(cur.temp) : '--';
    // 天气描述
    if ($('#wModalDesc')) $('#wModalDesc').textContent = cur.text || '--';
    // 体感
    if ($('#wModalFeels')) {
      var range = '';
      if (today.tmin !== undefined && today.tmax !== undefined) {
        range = Math.round(today.tmin) + '° / ' + Math.round(today.tmax) + '°';
      }
      $('#wModalFeels').textContent = '体感 ' + (cur.feels_like !== undefined ? Math.round(cur.feels_like) + '°' : '--') +
        (range ? ' · ' + range : '');
    }
    // 详细信息
    if ($('#wModalHumidity')) $('#wModalHumidity').textContent = cur.humidity !== undefined ? cur.humidity + '%' : '--';
    if ($('#wModalWind')) $('#wModalWind').textContent = (cur.wind_dir || '') + (cur.wind_scale !== undefined ? cur.wind_scale + '级' : '');
    if ($('#wModalPressure')) $('#wModalPressure').textContent = cur.pressure !== undefined ? Math.round(cur.pressure) + ' hPa' : '--';
    if ($('#wModalVisibility')) $('#wModalVisibility').textContent = cur.visibility !== undefined ? (cur.visibility >= 1000 ? (cur.visibility / 1000).toFixed(1) + ' km' : cur.visibility + ' m') : '--';
    if ($('#wModalUV')) $('#wModalUV').textContent = cur.uv_index !== undefined ? cur.uv_index : '--';
    if ($('#wModalSun')) $('#wModalSun').textContent = (today.sunrise || '--') + ' / ' + (today.sunset || '--');

    // 3天预报
    var forecastEl = $('#wModalForecast');
    if (forecastEl && w.daily) {
      var html = '';
      var todayStr = new Date().toISOString().slice(0, 10);
      w.daily.forEach(function (day, i) {
        var isToday = day.date === todayStr;
        var dateLabel = isToday ? '今天' : (i === 1 ? '明天' : (i === 2 ? '后天' : day.date.slice(5)));
        html += '<div class="weather-forecast-day">' +
          '<div class="weather-forecast-date' + (isToday ? ' today' : '') + '">' + dateLabel + '</div>' +
          '<div class="weather-forecast-icon">' + getWeatherIcon(day.text) + '</div>' +
          '<div class="weather-forecast-temp">' + Math.round(day.tmax) + '° <span class="low">/ ' + Math.round(day.tmin) + '°</span></div>' +
          '<div class="weather-forecast-desc">' + (day.text || '') + '</div>' +
          (day.precip_prob > 0 ? '<div class="weather-forecast-precip">' + wxSvg('humidity', 'wx-ico-xs') + '<span>' + Math.round(day.precip_prob * 100) + '%</span></div>' : '') +
          '</div>';
      });
      forecastEl.innerHTML = html;
    }

    // 空气质量
    var aqi = w.air_quality;
    if (aqi && aqi.aqi !== undefined) {
      var aqiBlock = $('#wModalAqiBlock');
      var colors = getAqiColor(aqi.aqi);
      // 环形表盘：AQI 0–300 映射为 0–100% 弧长（r=18 → 周长 113.1）
      if (aqiBlock) aqiBlock.style.setProperty('--aqi-color', colors.text);
      var aqiArc = $('#wModalAqiArc');
      if (aqiArc) {
        var circ = 2 * Math.PI * 18;
        var pct = Math.max(0.03, Math.min(1, aqi.aqi / 300));
        aqiArc.style.strokeDasharray = circ.toFixed(2);
        aqiArc.style.strokeDashoffset = (circ * (1 - pct)).toFixed(2);
      }
      if ($('#wModalAqiValue')) {
        $('#wModalAqiValue').textContent = aqi.aqi;
        $('#wModalAqiValue').style.color = colors.text;
      }
      if ($('#wModalAqiCategory')) {
        $('#wModalAqiCategory').textContent = aqi.category || '--';
        $('#wModalAqiCategory').style.color = colors.text;
      }
    }

    // 天气指数
    var indicesEl = $('#wModalIndices');
    if (indicesEl && w.indices) {
      var html2 = '';
      w.indices.forEach(function (idx) {
        html2 += '<div class="weather-index-tag" title="' + escapeHtml(idx.text || '') + '">' +
          '<span class="weather-index-ico">' + wxSvg(indexIconKey(idx.name)) + '</span>' +
          '<span class="weather-index-name">' + escapeHtml(idx.name || '') + '</span>' +
          '<span class="weather-index-category">' + escapeHtml(idx.category || '') + '</span>' +
          '</div>';
      });
      indicesEl.innerHTML = html2;
    }

    // 天气预警
    var alertsEl = $('#wModalAlerts');
    if (alertsEl && w.alerts && w.alerts.length > 0) {
      alertsEl.style.display = 'block';
      var html3 = '';
      w.alerts.forEach(function (a) {
        var color = getAlertColor(a.severity);
        html3 += '<div class="weather-alert-item">' +
          '<span class="weather-alert-badge" style="background:' + color + '">' + escapeHtml(a.severity || '预警') + '</span>' +
          '<span class="weather-alert-event">' + escapeHtml(a.event || '') + '</span>' +
          '<span class="weather-alert-sender">' + escapeHtml(a.sender || '') + '</span>' +
          '</div>';
      });
      alertsEl.innerHTML = html3;
    } else if (alertsEl) {
      alertsEl.style.display = 'none';
    }
  }

  // ===== 渲染：待办 =====
  function renderTodos() {
    var container = $('#todoBoard');
    if (state.todos.length === 0) {
      container.innerHTML = '<div class="todo-empty"><div class="todo-empty-icon">' + HS_ICONS.check + '</div><div class="todo-empty-text">还没有待办，加一条开始吧</div></div>';
      return;
    }
    var priorityMap = { '高': 'high', '普通': 'medium', '低': 'low' };
    var active = state.todos.filter(function (t) { return !t.done; });
    var done = state.todos.filter(function (t) { return t.done; });
    // 未完成按优先级排序：高>普通>低，同级按id倒序
    var priorityOrder = { '高': 0, '普通': 1, '低': 2 };
    active.sort(function (a, b) {
      var pa = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 1;
      var pb = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 1;
      if (pa !== pb) return pa - pb;
      return (b.id || 0) - (a.id || 0);
    });
    done.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });

    function renderCard(t, i) {
      var p = priorityMap[t.priority] || 'medium';
      return '<div class="todo-card' + (t.done ? ' done' : '') + '" data-id="' + t.id + '" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="todo-priority-bar ' + p + '"></div>' +
        '<div class="todo-card-body">' +
        '<button class="todo-card-check" data-action="toggle" data-id="' + t.id + '" aria-label="切换完成"></button>' +
        '<div class="todo-card-content">' +
        '<div class="todo-card-text">' + escapeHtml(t.text) + '</div>' +
        '<div class="todo-card-meta">' +
        '<span class="todo-priority-tag ' + p + '">' + escapeHtml(t.priority || '普通') + '</span>' +
        '<span>' + escapeHtml(t.created || '') + '</span>' +
        '</div></div>' +
        '<div class="todo-card-actions">' +
        (!t.done ? '<button class="todo-card-pomo" data-action="pomo" data-id="' + t.id + '" title="开始 25 分钟专注"><svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="9" y1="2" x2="15" y2="2"/></svg>' + ((pomoCounts[t.id] || 0) > 0 ? ' ×' + pomoCounts[t.id] : '') + '</button>' : '') +
        '<button class="todo-card-delete" data-action="delete" data-id="' + t.id + '" aria-label="删除">×</button>' +
        '</div></div></div>';
    }

    var html = '';
    if (active.length > 0) {
      html += '<div class="todo-group" data-group="active">' +
        '<div class="todo-group-header" data-toggle="active">' +
        '<span class="todo-group-title">进行中</span>' +
        '<span class="todo-group-count">' + active.length + '</span>' +
        '<span class="todo-group-toggle">▼</span></div>' +
        '<div class="todo-group-body">' + active.map(renderCard).join('') + '</div></div>';
    }
    if (done.length > 0) {
      var collapsed = state.todoDoneCollapsed !== false; // 默认折叠
      html += '<div class="todo-group' + (collapsed ? ' collapsed' : '') + '" data-group="done">' +
        '<div class="todo-group-header" data-toggle="done">' +
        '<span class="todo-group-title">已完成</span>' +
        '<span class="todo-group-count">' + done.length + '</span>' +
        '<span class="todo-group-toggle">▼</span></div>' +
        '<div class="todo-group-body">' + done.map(renderCard).join('') + '</div></div>';
    }
    container.innerHTML = html;
  }

  // ===== 渲染：资讯 =====
  function renderNews() {
    var tabsContainer = $('#newsTabs');
    var listContainer = $('#newsList');
    var newsData = (state.news && state.news.data && state.news.data.news) || {};
    // 科技爱好者周刊有独立板块，不在资讯面板里重复出现
    var sources = Object.entries(newsData).filter(function (s) { return s[0] !== 'ruanyf_weekly'; });

    if (sources.length === 0) {
      listContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:48px 0;">暂无资讯，点击右上角「更新资讯」拉取。</div>';
      tabsContainer.innerHTML = '';
      return;
    }

    var tabs = [{ key: 'all', name: '全部' }].concat(sources.map(function (s) { return { key: s[0], name: s[1].name }; }));
    tabsContainer.innerHTML = tabs.map(function (t) {
      return '<button class="news-tab' + (state.activeNewsTab === t.key ? ' active' : '') + '" data-tab="' + t.key + '">' + escapeHtml(t.name) + '</button>';
    }).join('');

    var items = [];
    if (state.activeNewsTab === 'all') {
      sources.forEach(function (s) {
        (s[1].items || []).forEach(function (item) {
          items.push(Object.assign({ _source: s[1].name }, item));
        });
      });
    } else {
      var src = newsData[state.activeNewsTab];
      if (src) {
        (src.items || []).forEach(function (item) {
          items.push(Object.assign({ _source: src.name }, item));
        });
      }
    }

    // 「只看相关」：按后端算好的领域相关度过滤（阈值 30）
    if (state.relevanceOnly) {
      items = items.filter(function (it) { return (it.relevance || 0) >= 30; });
    }

    // 源不可达提示：失败源不再静默消失
    var failed;
    if (state.activeNewsTab === 'all') {
      failed = sources.filter(function (s) { return s[1].ok === false; });
    } else {
      var cur = newsData[state.activeNewsTab];
      failed = (cur && cur.ok === false) ? [[state.activeNewsTab, cur]] : [];
    }

    if (items.length === 0) {
      if (failed.length) {
        var err = (failed[0][1].error || '').replace(/<[^>]+>/g, '');
        listContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px 0;">' +
          '<div>「' + escapeHtml(failed[0][1].name) + '」暂时不可达，已自动重试未成功。</div>' +
          (err ? '<div style="font-size:11px;margin-top:8px;opacity:.7;">' + escapeHtml(err) + '</div>' : '') +
          '<div style="font-size:11px;margin-top:8px;opacity:.7;">点右上角「更新资讯」可再试。</div></div>';
      } else {
        listContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px 0;">这个源今天没抓到东西，换个源看看</div>';
      }
      return;
    }

    var noticeHtml = '';
    if (failed.length && state.activeNewsTab === 'all') {
      noticeHtml = '<div style="color:var(--text-muted);font-size:11.5px;text-align:center;padding:10px 12px;margin-bottom:4px;">' +
        escapeHtml(failed.map(function (s) { return s[1].name; }).join('、')) +
        ' 暂时不可达（已自动重试），其余来源正常。</div>';
    }
    listContainer.innerHTML = noticeHtml + items.map(function (item, i) {
      var title = item.title || '无标题';
      var link = item.link || '#';
      var date = item.date || item.pubDate || item.updated || '';
      var summary = item.summary || item.description || item.content || '';
      if (summary.length > 200) summary = summary.slice(0, 200) + '…';
      return '<a class="news-item" href="' + escapeHtml(link) + '" target="_blank" rel="noopener" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="news-title">' + escapeHtml(title) + '</div>' +
        (item.title_zh ? '<div class="news-title-zh">' + escapeHtml(item.title_zh) + '</div>' : '') +
        '<div class="news-meta"><span>' + escapeHtml(item._source || '') + '</span>' + (date ? '<span>' + escapeHtml(date) + '</span>' : '') +
          (item.pdf ? '<button class="news-transcribe-btn" data-pdf="' + escapeHtml(item.pdf) + '" data-title="' + escapeHtml(item.title_zh || title) + '" title="下载开放获取 PDF 并直接送转写">送转写</button>' : '') +
          '<button class="news-quick-add-btn" data-title="' + escapeHtml(item.title_zh || title) + '" data-title-en="' + escapeHtml(item.title_zh ? title : '') + '" data-url="' + escapeHtml(link) + '" data-summary="' + escapeHtml(summary) + '" data-source="' + escapeHtml(item._source || '') + '" title="只收录标题与摘要到卡片库，不转写全文">收录</button>' +
        '</div>' +
        '<div class="news-flags">' +
          (isAlreadyInLibrary(title) ? '<span class="news-owned">已入库</span>' : '') +
          (item.matched && item.matched.length ? '<span class="news-matched">相关：' + item.matched.map(function (m) { return escapeHtml(m); }).join(' · ') + '</span>' : '') +
        '</div>' +
        (summary ? '<div class="news-summary">' + escapeHtml(summary) + '</div>' : '') +
        '</a>';
    }).join('');
  }

  // ===== 已入库标记：资讯条目 ↔ 卡片库标题匹配 =====
  function titleWords(t) {
    return String(t || '').toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return w.length > 3; });
  }

  function isAlreadyInLibrary(title) {
    var words = titleWords(title);
    if (!words.length) return false;
    for (var i = 0; i < (summaryAll || []).length; i++) {
      var lib = titleWords(summaryAll[i].title).concat(titleWords(summaryAll[i].title_en));
      var common = 0;
      for (var j = 0; j < words.length; j++) {
        if (lib.indexOf(words[j]) >= 0) common++;
      }
      if (common >= 3) return true;   // 3 个以上实词重合即视为同一篇
    }
    return false;
  }

  // ===== 今日工作台（概览顶部动线入口） =====
  function todayStr() {
    var d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function todayWeek() {
    return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date().getDay()];
  }

  function renderTodayBoard() {
    var board = $('#todayBoard');
    if (!board) return;

    var pending = (state.todos || []).filter(function (t) { return !t.done; });
    var todoHtml = '<div class="today-head"><div><div class="today-title">今日 · ' + todayStr() + ' ' + todayWeek() + '</div><div class="today-sub">待办 ' + pending.length + ' 项</div></div><button class="btn-goto" data-goto="todos">查看全部待办</button></div>' +
      '<div class="today-grid"><div class="today-col"><div class="today-col-head">今日待办<span class="today-count">' + pending.length + '</span></div>';
    if (!pending.length) {
      todoHtml += '<div class="today-empty">没有未完成的待办</div>';
    } else {
      todoHtml += pending.slice(0, 4).map(function (t) {
        return '<div class="today-todo" data-goto="todos"><span class="today-todo-dot"></span><span class="today-todo-text">' + escapeHtml(t.text) + '</span></div>';
      }).join('');
      if (pending.length > 4) todoHtml += '<div class="today-more" data-goto="todos">还有 ' + (pending.length - 4) + ' 项…</div>';
    }
    board.innerHTML = todoHtml + '</div></div>';
    return;

    var fr = (state.frontier && state.frontier.items) || [];
    var hs = (state.hotspots && state.hotspots.items) || [];
    var wk = (state.weekly && state.weekly.items) || [];
    var papers = (summaryAll || []).slice(0, 3);
    var today = new Date().toISOString().slice(0, 10);

    var freshCount = 0;
    if (fr.length && fr[0].date === today) freshCount++;
    if (hs.length && hs[0].date === today) freshCount++;

    var html = '';
    html += '<div class="today-head">' +
      '<div class="today-title">今日 · ' + todayStr() + ' ' + todayWeek() + '</div>' +
      '<div class="today-sub">' +
      (pending.length ? '待办 ' + pending.length + ' 项' : '待办已清空') +
      ' · ' + (freshCount ? '今日新出 ' + freshCount + ' 份情报' : '情报今日暂无更新') +
      ' · 卡片库 ' + (summaryAll || []).length + ' 篇' +
      '</div>' +
      '</div>';

    html += '<div class="today-grid">';

    // 1. 今日待办
    html += '<div class="today-col">' +
      '<div class="today-col-head">今日待办<span class="today-count">' + pending.length + '</span></div>';
    if (!pending.length) {
      html += '<div class="today-empty">没有未完成的待办</div>';
    } else {
      html += pending.slice(0, 4).map(function (t, i) {
        return '<div class="today-todo" data-goto="todos">' +
          '<span class="today-todo-dot"></span>' +
          '<span class="today-todo-text">' + escapeHtml(t.text) + '</span>' +
          '</div>';
      }).join('');
      if (pending.length > 4) {
        html += '<div class="today-more" data-goto="todos">还有 ' + (pending.length - 4) + ' 项…</div>';
      }
    }
    html += '</div>';

    // 2. 今日情报
    html += '<div class="today-col">' +
      '<div class="today-col-head">今日情报</div>';
    var feeds = [];
    if (fr.length) feeds.push({ panel: 'frontier', name: '前沿瞭望', latest: fr[0].date, isNew: fr[0].date === today });
    if (hs.length) feeds.push({ panel: 'hotspots', name: '热点日报', latest: hs[0].date + ' ' + (hs[0].session || ''), isNew: hs[0].date === today });
    if (wk.length) feeds.push({ panel: 'weekly', name: '科技周报', latest: '第 ' + wk[0].issue + ' 期', isNew: false });
    if (!feeds.length) {
      html += '<div class="today-empty">最近还没有情报归档</div>';
    } else {
      html += feeds.map(function (f) {
        return '<div class="today-feed" data-goto="' + f.panel + '">' +
          (f.isNew ? '<span class="today-new">新</span>' : '') +
          '<span class="today-feed-name">' + escapeHtml(f.name) + '</span>' +
          '<span class="today-feed-latest">' + escapeHtml(f.latest) + '</span>' +
          '</div>';
      }).join('');
    }
    html += '</div>';

    // 3. 最近论文
    html += '<div class="today-col">' +
      '<div class="today-col-head">最近论文<span class="today-count">' + (summaryAll || []).length + '</span></div>';
    if (!papers.length) {
      html += '<div class="today-empty">卡片库还是空的</div>';
    } else {
      html += papers.map(function (s) {
        var t = s.title || s.title_en || '未命名论文';
        return '<div class="today-paper" data-goto="summaries">' +
          '<span class="today-paper-title">' + escapeHtml(t) + '</span>' +
          '<span class="today-paper-date">' + escapeHtml((s.created_at || '').slice(0, 10)) + '</span>' +
          '</div>';
      }).join('');
    }
    html += '</div>';

    html += '</div>';
    board.innerHTML = html;
  }

  // ===== 资讯：开放获取条目一键送转写（bioRxiv / medRxiv 等） =====
  function sendToTranscribe(url, title) {
    toast('正在下载 PDF 并入队转写…');
    api('/api/pdf/from-url', {
      method: 'POST',
      body: JSON.stringify({ url: url, title: title, source: '资讯' })
    }).then(function (d) {
      if (!d.ok) { toast('送转写失败：' + (d.error || '未知错误')); return; }
      toast('已入队，正在转写（' + (Math.round(d.size / 1048576 * 10) / 10) + ' MB）');
      state.pdf.title = title || '';
      state.pdf.jobId = d.jobId;
      switchPanel('pdf');
      if (typeof pollPdfStatus === 'function') pollPdfStatus();
    }).catch(function () {
      toast('送转写失败：请求异常');
    });
  }

  // ===== 资讯：一键轻收录（只存元数据入卡片库，不转写全文） =====
  function quickAddFromNews(ds) {
    api('/api/pdf/summary/quick-add', {
      method: 'POST',
      body: JSON.stringify({
        title: ds.title || '',
        title_en: ds.titleEn || '',
        url: ds.url || '',
        abstract: ds.summary || '',
        source: ds.source || '资讯'
      })
    }).then(function (d) {
      if (!d.ok) { toast('收录失败：' + (d.error || '未知错误')); return; }
      toast('已收进卡片库，只存了标题和摘要');
      if (typeof loadSummaryCards === 'function') loadSummaryCards();
    }).catch(function () { toast('收录失败：请求异常'); });
  }

  // ===== 渲染：科技爱好者周刊（hs-item 归档风格，与其余日报面板统一） =====
  function loadWeekly(force) {
    var container = $('#weeklyList');
    if (!container) return;
    return api('/api/weekly' + (force ? '?refresh=1' : '')).then(function (data) {
      state.weekly = data;
      renderWeekly();
      renderTodayBoard(); renderWeekReview();
    }).catch(function () {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.weekly + '</div>' +
        '<div class="hs-empty-text">周刊加载失败</div>' +
        '<div class="hs-empty-hint">点上方「刷新」重试；数据来自 GitHub 开源仓库，需要网络可达</div>' +
        '</div>';
    });
  }

  // ===== 侧栏「未读」徽标：期刊类面板显示未读篇数（红），点开即已读 =====
  // 阅读记录只存「读到哪个最新标识」，不逐条记状态：够用且零维护
  function readMark(key) {
    try { return localStorage.getItem('wb_read_' + key) || ''; } catch (e) { return ''; }
  }

  function setReadMark(key, latest) {
    try { if (latest) localStorage.setItem('wb_read_' + key, latest); } catch (e) {}
  }

  // items 需按「新 → 旧」排列；keyOf 返回可字典序比较的标识（文件名 / 补零期号）
  function applyUnreadBadge(badge, storeKey, panelName, items, keyOf) {
    if (!badge) return;
    var list = items || [];
    if (!list.length) {
      badge.hidden = true;
      badge.style.display = 'none';
      badge.classList.remove('is-unread');
      return;
    }
    var latest = String(keyOf(list[0]) || '');
    var viewing = (state.panel === panelName);   // 正看着这个面板 → 视为已读
    if (viewing && latest) setReadMark(storeKey, latest);
    var mark = viewing ? latest : readMark(storeKey);
    var unread = 0;
    if (mark) {
      list.forEach(function (it) { if (String(keyOf(it) || '') > mark) unread++; });
    } else {
      unread = list.length;   // 从未打开过 → 全部算未读
    }
    badge.hidden = false;
    badge.style.display = '';
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.add('is-unread');
      badge.title = unread + ' 篇未读，点开即标记已读';
    } else {
      badge.textContent = String(list.length);
      badge.classList.remove('is-unread');
      badge.title = '共 ' + list.length + ' 篇，已读完';
    }
  }

  // 用内存里已加载的数据重算三个期刊徽标（切面板时立即消红点）。
  // 只在对应数据已加载时更新——否则会把「还没加载」误当成「没有内容」而藏掉徽标。
  function refreshUnreadBadges() {
    if (state.frontier) {
      applyUnreadBadge($('#navFrontierBadge'), 'frontier', 'frontier',
        state.frontier.items || [], function (it) { return it.file || ''; });
    }
    if (state.hotspots) {
      applyUnreadBadge($('#navHotspotBadge'), 'hotspots', 'hotspots',
        state.hotspots.items || [], function (it) { return it.file || ''; });
    }
    if (state.weekly) {
      applyUnreadBadge($('#navWeeklyBadge'), 'weekly', 'weekly',
        state.weekly.items || [], function (it) { return String(it.issue || '').padStart(4, '0'); });
    }
  }

  // 周刊发布日期文案：源文件里没有日期，后端从该期文件的提交记录取。
  // 用户曾因看不到日期而误以为列表是「当期」，故明确标注发布日 + 相对时间。
  function weeklyDateLabel(dateStr) {
    var s = String(dateStr || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '每周五更新';
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '每周五更新';
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    var rel;
    if (days <= 0) rel = '今天';
    else if (days === 1) rel = '昨天';
    else if (days < 7) rel = days + ' 天前';
    else rel = Math.floor(days / 7) + ' 周前';
    return s + ' 发布 · ' + rel;
  }

  function renderWeekly() {
    var container = $('#weeklyList');
    if (!container) return;
    var d = state.weekly || {};
    var items = d.items || [];
    refreshUnreadBadges();   // 徽标归侧栏统一管：未读红点 / 已读总数
    if (!items.length) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.weekly + '</div>' +
        '<div class="hs-empty-text">还没抓到周刊</div>' +
        '<div class="hs-empty-hint">' + (d.ok === false ? '仓库暂时不可达，点上方「刷新」重试。' : '点上方「刷新」拉取最新一期。') + '</div>' +
        '</div>';
      return;
    }
    container.innerHTML = items.map(function (item, i) {
      var topic = item.topic || '';
      var title = topic || ('科技爱好者周刊 · 第 ' + (item.issue || '') + ' 期');
      return '<a class="hs-item" href="' + escapeHtml(item.link || '#') + '" target="_blank" rel="noopener" style="animation-delay:' + (i * 0.04) + 's">' +
        '<span class="hs-session hs-session-wk">第 ' + escapeHtml(String(item.issue || '?')) + ' 期</span>' +
        '<div class="hs-item-main">' +
          '<div class="hs-item-title">' + escapeHtml(title) + '</div>' +
          '<div class="hs-item-meta">阮一峰 · ' + escapeHtml(weeklyDateLabel(item.date)) + '</div>' +
        '</div>' +
        '<div class="hs-item-arrow">阅读原文 ↗</div>' +
        '</a>';
    }).join('');
  }

  // ===== 渲染：文件夹 =====
  function renderSections() {
    var container = $('#sectionsGrid');
    var sections = (state.overview && state.overview.sections) || [];
    container.innerHTML = sections.map(function (s, i) {
      var icon = SECTION_ICONS[s.folder] || SECTION_ICONS['08_临时中转'];
      return '<div class="section-card" data-path="' + escapeHtml(s.folder) + '" style="animation-delay:' + (i * 0.06) + 's">' +
        '<div class="section-icon">' + icon + '</div>' +
        '<div class="section-name">' + escapeHtml(s.label) + '</div>' +
        '<div class="section-path">' + escapeHtml(s.folder) + '/</div>' +
        '<div class="section-stats"><span>' + s.count + '</span> 个文件</div>' +
        '</div>';
    }).join('');
  }

  // ===== 渲染：研究日志（时间线） =====
  function renderJournalTypeFilters() {
    var container = $('#journalTypeFilters');
    var types = ['全部', '日常', '想法', '问题', '进展'];
    var counts = { '全部': state.journal.length };
    state.journal.forEach(function (j) {
      var t = j.type || '日常';
      counts[t] = (counts[t] || 0) + 1;
    });
    container.innerHTML = types.map(function (t) {
      return '<button class="journal-filter' + (state.journalTypeFilter === t ? ' active' : '') + '" data-type="' + t + '">' + t + (counts[t] ? ' (' + counts[t] + ')' : '') + '</button>';
    }).join('');
  }

  function renderJournal() {
    renderJournalTypeFilters();
    var container = $('#journalTimeline');
    if (state.journal.length === 0) {
      container.innerHTML = '<div class="todo-empty"><div class="todo-empty-icon">' + HS_ICONS.journal + '</div><div class="todo-empty-text">还没有日志记录，写下第一条吧</div></div>';
      return;
    }
    var items = state.journal;
    if (state.journalTypeFilter && state.journalTypeFilter !== '全部') {
      items = items.filter(function (j) { return (j.type || '日常') === state.journalTypeFilter; });
    }
    if (items.length === 0) {
      container.innerHTML = '<div class="todo-empty"><div class="todo-empty-text">该类型暂无日志</div></div>';
      return;
    }
    container.innerHTML = items.map(function (j, i) {
      var type = j.type || '日常';
      return '<div class="timeline-item" style="animation-delay:' + (i * 0.08) + 's">' +
        '<div class="timeline-dot"></div>' +
        '<div class="journal-card">' +
        '<div class="journal-card-head">' +
        '<span class="journal-card-date">' + escapeHtml(j.date || j.created || '') + '</span>' +
        '<span class="journal-type-tag ' + type + '">' + escapeHtml(type) + '</span>' +
        '<button class="journal-delete-btn" data-action="delete-journal" data-id="' + j.id + '" aria-label="删除日志">×</button>' +
        '</div>' +
        '<div class="journal-card-text">' + renderJournalText(j.content) + '</div>' +
        '</div></div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：期刊地图
  // ============================================================
  function renderJournalFilters() {
    var container = $('#journalFilters');
    if (!state.lit.journals) return;
    var layers = [];
    var seen = {};
    state.lit.journals.items.forEach(function (j) {
      var label = j.layer_label || ('第' + j.layer + '层');
      if (!seen[label]) { seen[label] = true; layers.push({ key: j.layer, label: label }); }
    });
    var html = '<button class="journal-filter' + (state.journalFilter === 'all' ? ' active' : '') + '" data-filter="all">全部 (' + state.lit.journals.items.length + ')</button>';
    layers.forEach(function (l) {
      var count = state.lit.journals.items.filter(function (j) { return j.layer === l.key; }).length;
      html += '<button class="journal-filter' + (state.journalFilter === l.key ? ' active' : '') + '" data-filter="' + l.key + '">' + escapeHtml(l.label) + ' (' + count + ')</button>';
    });
    container.innerHTML = html;
  }

  function renderJournals() {
    var container = $('#journalGrid');
    if (!state.lit.journals) return;
    var items = state.lit.journals.items;
    if (state.journalFilter !== 'all') {
      items = items.filter(function (j) { return j.layer === state.journalFilter; });
    }
    if (items.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:32px;">这个分类下还没有期刊</div>';
      return;
    }
    container.innerHTML = items.map(function (j, i) {
      var metrics = j.metrics || {};
      var sjr = metrics.sjr ? metrics.sjr : '—';
      var h = metrics.h_index ? metrics.h_index : '—';
      return '<div class="journal-card" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="journal-card-head">' +
        '<div class="journal-name">' + (j.url ? '<a href="' + escapeHtml(j.url) + '" target="_blank" rel="noopener">' + escapeHtml(j.name) + '</a>' : escapeHtml(j.name)) + '</div>' +
        '<span class="journal-layer-tag">' + escapeHtml(j.layer_label || '') + '</span>' +
        '</div>' +
        '<div class="journal-publisher">' + escapeHtml(j.publisher || '') + (j.oa_mode ? ' · ' + escapeHtml(j.oa_mode) : '') + '</div>' +
        '<div class="journal-metrics">' +
        (sjr !== '—' ? '<span>SJR <strong>' + escapeHtml(String(sjr)) + '</strong></span>' : '') +
        (h !== '—' ? '<span>h-index <strong>' + escapeHtml(String(h)) + '</strong></span>' : '') +
        (j.frequency ? '<span>' + escapeHtml(j.frequency) + '</span>' : '') +
        '</div>' +
        (j.scope ? '<div class="journal-scope">' + escapeHtml(j.scope) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：术语表
  // ============================================================
  function renderGlossary() {
    var container = $('#glossaryList');
    if (!state.lit.glossary) return;
    var items = state.lit.glossary.items;
    var q = state.glossaryQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(function (g) {
        return (g.term || '').toLowerCase().indexOf(q) > -1 ||
          (g.full_name || '').toLowerCase().indexOf(q) > -1 ||
          (g.zh || '').toLowerCase().indexOf(q) > -1 ||
          (g.plain_explanation || '').toLowerCase().indexOf(q) > -1;
      });
    }
    if (items.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px;">没有匹配的术语，换个说法试试</div>';
      return;
    }
    container.innerHTML = items.map(function (g, i) {
      return '<div class="glossary-item" style="animation-delay:' + (i * 0.03) + 's">' +
        '<div class="glossary-term">' + escapeHtml(g.term || '') + '</div>' +
        (g.full_name && g.full_name !== '—' ? '<div class="glossary-full">' + escapeHtml(g.full_name) + '</div>' : '') +
        (g.zh && g.zh !== '—' ? '<div class="glossary-zh">' + escapeHtml(g.zh) + '</div>' : '') +
        (g.plain_explanation ? '<div class="glossary-explain">' + escapeHtml(g.plain_explanation) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：检索式库
  // ============================================================
  function renderQueries() {
    var container = $('#queryList');
    if (!state.lit.queries) return;
    container.innerHTML = state.lit.queries.items.map(function (q, i) {
      return '<div class="query-item" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="query-label">' + escapeHtml(q.label || '') + '</div>' +
        '<div class="query-code">' + escapeHtml(q.query || '') + '</div>' +
        '<div class="query-meta">' +
        (q.returned_count ? '<span class="count">返回 ' + q.returned_count + ' 条</span>' : '') +
        (q.verified_on ? '<span>验证于 ' + escapeHtml(q.verified_on) + '</span>' : '') +
        '<button class="btn-copy" data-query="' + i + '">复制</button>' +
        '</div>' +
        (q.purpose ? '<div class="query-purpose">' + escapeHtml(q.purpose) + '</div>' : '') +
        (q.query_syntax_note ? '<div class="query-purpose" style="color:var(--text-muted);">语法：' + escapeHtml(q.query_syntax_note) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：arXiv 追踪（领域可在 server.py 里配，按需拉取）
  // ============================================================
  function loadArxiv(force) {
    return api('/api/lit/arxiv' + (force ? '?refresh=1' : '')).then(function (data) {
      state.lit.arxiv = data;
      renderArxiv();
    });
  }

  function renderArxiv() {
    var container = $('#arxivList');
    if (!container || !state.lit.arxiv) return;
    var d = state.lit.arxiv;
    if (!d.ok) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.signal + '</div>' +
        '<div class="hs-empty-text">arXiv 暂时连不上</div>' +
        '<div class="hs-empty-hint">' + escapeHtml(d.error || '网络层受阻') + '<br>arXiv 出口网络恢复后点「刷新」即可；不影响其他文献工具</div>' +
        '</div>';
      return;
    }
    if (!d.items.length) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px;">暂无条目</div>';
      return;
    }
    container.innerHTML = d.items.map(function (p, i) {
      return '<div class="arxiv-item" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="arxiv-main">' +
        '<a class="arxiv-title" href="' + escapeHtml(p.link) + '" target="_blank" rel="noopener">' + escapeHtml(p.title) + '</a>' +
        (p.summary ? '<div class="arxiv-abs">' + escapeHtml(p.summary) + '</div>' : '') +
        '<div class="arxiv-meta">' +
        '<span class="arxiv-id">' + escapeHtml((p.link || '').replace('http://arxiv.org/abs/', 'arXiv:').replace('https://arxiv.org/abs/', 'arXiv:')) + '</span>' +
        (p.authors ? '<span>' + escapeHtml(p.authors) + '</span>' : '') +
        '<span>' + escapeHtml(p.date || '') + '</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 前沿瞭望（双通道学术雷达，报纸风归档，每期独立 HTML）
  // ============================================================
  // 归档报纸注入工具：每期 HTML 的 <style> 在 <head> 里，只注入 body 会丢样式；
  // 这里把 <style> 提取出来、将选择器限定在 frame 容器内再一并注入——
  // 面板内保持原版式、不污染工作台全局，且样式随 frame.innerHTML 清空而自动移除。
  function extractStyleCss(html) {
    var out = '', re = /<style[^>]*>([\s\S]*?)<\/style>/gi, m;
    while ((m = re.exec(html)) !== null) out += m[1] + '\n';
    return out;
  }
  function scopeCssText(css, scopeSel) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    function scopeSelectors(sel) {
      var parts = sel.split(',').map(function (s) {
        s = s.trim();
        if (!s || /^@/.test(s)) return s;
        if (s === 'html' || s === 'body' || s === ':root' || s === 'html body') return scopeSel;
        if (s === '*') return scopeSel + ' *';
        if (s.indexOf(scopeSel) === 0) return s;
        return scopeSel + ' ' + s;
      }).filter(function (x) { return x; });
      return parts.join(', ');
    }
    function walk(text) {
      var out = '', i = 0, n = text.length;
      while (i < n) {
        var bracePos = text.indexOf('{', i);
        if (bracePos === -1) { out += text.slice(i); break; }
        var prelude = text.slice(i, bracePos).trim();
        if (/^@import/i.test(prelude)) {
          var semi = text.indexOf(';', i);
          if (semi === -1) { out += text.slice(i); break; }
          out += text.slice(i, semi + 1); i = semi + 1; continue;
        }
        var depth = 1, j = bracePos + 1;
        while (j < n && depth > 0) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
        if (j > n) { out += text.slice(i); break; }
        var block = text.slice(bracePos + 1, j - 1);
        if (/^@(media|supports)/i.test(prelude)) {
          out += prelude + '{' + walk(block) + '}';
        } else if (/^@/i.test(prelude)) {
          out += text.slice(i, j); // @keyframes / @font-face 等不含页面选择器，原样保留
        } else {
          var scoped = scopeSelectors(prelude);
          out += (scoped || prelude) + '{' + block + '}';
        }
        i = j;
      }
      return out;
    }
    return walk(css);
  }
  // 归档刊物（前沿瞭望 / 热点日报）是自带样式的独立 HTML，颜色写死为亮色报纸配色，
  // 所以切暗色时外壳变了、文章里不变。这里做一份「暗色重映射」，与亮色版一起注入：
  // 暗色版整体挂在 [data-theme="dark"] 前缀下，切主题由浏览器自动切换，无需重刷。
  var PAPER_DARK_MAP = {
    '#fbfaf5': '#14171a', '#f5f3ee': '#181c1f', '#f0eee5': '#1d2225', '#efece3': '#212629',
    '#1b1e1d': '#e7e5e0', '#2b2f2d': '#c7ccc8', '#4b5350': '#a6aea9', '#8a938e': '#7f8884',
    '#d8d4c6': '#2c3236', '#0f766e': '#5eead4', '#b45309': '#f0b429', '#2563eb': '#6cb2ff',
    '#059669': '#34d399', '#dc2626': '#f87171'
  };

  function darkenPaperCss(css) {
    return css.replace(/#[0-9a-fA-F]{6}\b/g, function (c) {
      return darkenPaperHex(c);
    }).replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g,
      function (m, r, g, b, a) {
        // 亮色刊物里的浅阴影（中灰 + 低透明度）在暗底上等于看不见，改成暗阴影
        var lum = (Number(r) + Number(g) + Number(b)) / 3;
        if (lum > 30 && Number(a) < 0.6) return 'rgba(0, 0, 0, 0.5)';
        return m;
      });
  }

  // 已知的设计系统色优先用精选暗色值；未命中的（各期模板色值不完全一致，
  // 如热点日报用 #fbf6e7 / #141414）按亮度与色差自动推断，保证不漏。
  function _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }

  function _hslToHex(h, s, l) {
    function f(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
    }
    function to(x) { var v = Math.round(x * 255); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + to(r) + to(g) + to(b);
  }

  function darkenPaperHex(hex) {
    var key = hex.toLowerCase();
    if (PAPER_DARK_MAP[key]) return PAPER_DARK_MAP[key];
    var r = parseInt(key.slice(1, 3), 16), g = parseInt(key.slice(3, 5), 16), b = parseInt(key.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
    var hsl = _rgbToHsl(r, g, b), h = hsl[0], s = hsl[1], l = hsl[2];
    var chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;   // 相对色差，比 HSL 饱和度更靠谱
    if (chroma > 0.18) {
      // 有彩色（品牌 / 语义色）：保住色相，提亮到暗底上看得清的明度
      return _hslToHex(h, Math.max(s, 0.5), Math.min(0.8, Math.max(l, 0.68)));
    }
    // 无彩色：亮纸底压到暗面，墨色提成亮字，中间灰按亮度半反转
    var nl;
    if (l > 0.75) nl = 0.07 + (1 - l) * 0.25;
    else if (l > 0.25) nl = 0.5 + (0.5 - l) * 0.55;
    else nl = 0.88 - l * 0.45;
    return _hslToHex(h, Math.min(s, 0.18), nl);
  }

  function injectArchivedPaper(frame, html) {
    var bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    var content = bodyMatch ? bodyMatch[1] : html;
    var css = extractStyleCss(html);
    var styleHtml = '';
    if (css && frame.id) {
      var light = scopeCssText(css, '#' + frame.id);
      var dark = scopeCssText(darkenPaperCss(css), '[data-theme="dark"] #' + frame.id);
      styleHtml = '<style data-paper-scope="' + frame.id + '">' + light + '\n' + dark + '</style>';
    }
    frame.innerHTML = styleHtml + content;
  }

  function renderFrontier() {
    var container = $('#frontierList');
    if (!container) return;
    var items = (state.frontier && state.frontier.items) || [];
    refreshUnreadBadges();   // 徽标归侧栏统一管：未读红点 / 已读总数
    if (items.length === 0) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.frontier + '</div>' +
        '<div class="hs-empty-text">前沿瞭望还没出过一期</div>' +
        '<div class="hs-empty-hint">每天自动生成一期；也可将报纸风 HTML 放入 09_工作台程序/data/frontier/ 目录（命名 YYYY-MM-DD.html）</div>' +
        '</div>';
      return;
    }
    var lastDate = null;
    var html = [];
    items.forEach(function (d, i) {
      if (d.date !== lastDate) {
        if (lastDate !== null) html.push('</div>');
        html.push('<div class="hs-day-group"><div class="hs-day-label">' + escapeHtml(d.date) + '</div>');
        lastDate = d.date;
      }
      var sizeKb = (d.size / 1024).toFixed(1);
      html.push(
        '<div class="hs-item" data-file="' + escapeHtml(d.file) + '" style="animation-delay:' + (i * 0.04) + 's">' +
          '<span class="hs-session hs-session-fr">双通道</span>' +
          '<div class="hs-item-main">' +
            '<div class="hs-item-title">前沿瞭望 · ' + escapeHtml(d.date) + '</div>' +
            '<div class="hs-item-meta">' + sizeKb + ' KB · 归档于 ' + escapeHtml(d.modified || '') + '</div>' +
          '</div>' +
          '<div class="hs-item-arrow">展开 →</div>' +
        '</div>'
      );
    });
    html.push('</div>');
    container.innerHTML = html.join('');
  }

  function openFrontier(file) {
    var url = '/frontier/' + encodeURIComponent(file);
    $('#frontierOpenTab').href = url;
    $('#frontierDetailTitle').textContent = '前沿瞭望 · ' + file.replace(/\.html$/, '');
    $('#frontierListView').style.display = 'none';
    $('#frontierDetailView').style.display = 'block';
    pushReportHash('frontier', file);
    var frame = $('#frontierFrame');
    frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">加载中…</div>';
    // fetch HTML，提取 body 内容直接注入（自动继承工作台主题）
    fetch(url).then(function (resp) { return resp.text(); }).then(function (html) {
      injectArchivedPaper(frame, html);
    }).catch(function () {
      frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--danger);">加载失败，请返回重试</div>';
    });
    var scrollBox = document.querySelector('.main-content') || document.querySelector('.main');
    if (scrollBox) scrollBox.scrollTop = 0;
  }

  function closeFrontier() {
    $('#frontierFrame').innerHTML = '';
    $('#frontierListView').style.display = 'block';
    $('#frontierDetailView').style.display = 'none';
  }

  // ============================================================
  // 热点日报（报纸风归档，每期独立 HTML，iframe 原版式渲染）
  // ============================================================
  function loadHotspots() {
    return api('/api/hotspots').then(function (data) {
      state.hotspots = data;
      renderHotspots();
      renderTodayBoard(); renderWeekReview();
    });
  }

  function renderHotspots() {
    var container = $('#hotspotList');
    if (!container) return;
    var items = (state.hotspots && state.hotspots.items) || [];
    refreshUnreadBadges();   // 徽标归侧栏统一管：未读红点 / 已读总数
    if (items.length === 0) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.hotspot + '</div>' +
        '<div class="hs-empty-text">热点日报还没出过一期</div>' +
        '<div class="hs-empty-hint">定时任务每天 10:00 / 16:00 自动生成；也可将报纸风 HTML 放入 09_工作台程序/data/hotspots/ 目录</div>' +
        '</div>';
      return;
    }
    var lastDate = null;
    var html = [];
    items.forEach(function (d, i) {
      if (d.date !== lastDate) {
        if (lastDate !== null) html.push('</div>');
        html.push('<div class="hs-day-group"><div class="hs-day-label">' + escapeHtml(d.date) + '</div>');
        lastDate = d.date;
      }
      var sizeKb = (d.size / 1024).toFixed(1);
      var isAm = d.session.indexOf('上午') !== -1;
      html.push(
        '<div class="hs-item" data-file="' + escapeHtml(d.file) + '" style="animation-delay:' + (i * 0.04) + 's">' +
          '<span class="hs-session ' + (isAm ? 'hs-session-am' : 'hs-session-pm') + '">' + escapeHtml(d.session || '日报') + '</span>' +
          '<div class="hs-item-main">' +
            '<div class="hs-item-title">热点日报 · ' + escapeHtml(d.date) + ' ' + escapeHtml(d.session || '') + '</div>' +
            '<div class="hs-item-meta">' + sizeKb + ' KB · 归档于 ' + escapeHtml(d.modified || '') + '</div>' +
          '</div>' +
          '<div class="hs-item-arrow">展开 →</div>' +
        '</div>'
      );
    });
    html.push('</div>');
    container.innerHTML = html.join('');
  }

  function openHotspot(file) {
    var url = '/hotspot/' + encodeURIComponent(file);
    $('#hotspotOpenTab').href = url;
    var stem = file.replace(/\.html$/, '');
    $('#hotspotDetailTitle').textContent = '热点日报 · ' + stem;
    $('#hotspotsListView').style.display = 'none';
    $('#hotspotsDetailView').style.display = 'block';
    pushReportHash('hotspots', file);
    var frame = $('#hotspotFrame');
    frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">加载中…</div>';
    // fetch HTML，提取 body 内容直接注入（不再用 iframe，自动继承工作台主题）
    fetch(url).then(function (resp) { return resp.text(); }).then(function (html) {
      injectArchivedPaper(frame, html);
    }).catch(function () {
      frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--danger);">加载失败，请返回重试</div>';
    });
    var scrollBox = document.querySelector('.main-content') || document.querySelector('.main');
    if (scrollBox) scrollBox.scrollTop = 0;
  }

  function closeHotspot() {
    $('#hotspotFrame').innerHTML = '';
    $('#hotspotsListView').style.display = 'block';
    $('#hotspotsDetailView').style.display = 'none';
  }

  // ============================================================
  // PDF 转写（双引擎：本地 MinerU / 云端加速）
  // ============================================================
  // 文件上限（与引擎卡片标注一致；云端 Precision 官方限制 200MB/200页）
  var PDF_LIMITS = { cloud: { mb: 200 }, local: { mb: 500 } };

  function formatBytes(n) {
    if (n === null || n === undefined) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  // 校验文件格式与大小，返回 {ok, msg}
  function validatePdfFile(file, engine) {
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) return { ok: false, msg: '仅支持 PDF 格式' };
    var limit = (PDF_LIMITS[engine] || PDF_LIMITS.local).mb;
    var sizeMb = file.size / 1024 / 1024;
    if (sizeMb > limit) {
      return { ok: false, msg: '文件 ' + sizeMb.toFixed(1) + 'MB，超出' + (engine === 'cloud' ? '云端' : '本地') + '上限 ' + limit + 'MB' };
    }
    return { ok: true, msg: '' };
  }

  function showPdfFileError(msg) {
    var el = $('#pdfFileError');
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; }
    else { el.hidden = true; el.textContent = ''; }
  }

  function checkPdfHealth() {
    api('/api/pdf/health').then(function (d) {
      state.pdf.health = d;
      renderPdfHealth();
    }).catch(function () {
      state.pdf.health = { ok: false, local: false, cloud: false, down: true };
      renderPdfHealth();
    });
  }

  function renderPdfHealth() {
    var h = state.pdf.health;
    var statusEl = $('#pdfWorkerStatus');
    applyPdfModelLabels();
    if (!h || !statusEl) return;
    var cloudRadio = document.querySelector('input[name="pdfEngine"][value="cloud"]');
    if (h.down) {
      statusEl.textContent = '转写引擎未启动（worker 8766）';
      statusEl.className = 'pdf-worker-status bad';
    } else {
      statusEl.textContent = (h.local ? '本地就绪' : '本地未就绪') + ' · ' + (h.cloud ? '云端就绪' : '云端未配置');
      statusEl.className = 'pdf-worker-status ' + ((h.local || h.cloud) ? 'ok' : 'bad');
    }
    if (cloudRadio) {
      cloudRadio.disabled = !h.cloud;
      var cloudLabel = cloudRadio.closest('.pdf-engine-opt');
      if (cloudLabel) cloudLabel.classList.toggle('disabled', !h.cloud);
      if (!h.cloud && cloudRadio.checked) {
        var localRadio = document.querySelector('input[name="pdfEngine"][value="local"]');
        if (localRadio && h.local) localRadio.checked = true;
      }
    }
    checkPdfTokenReminder();
    updatePdfStartState();
  }

  // MinerU Token 90天到期提醒：最后10天在面板显示 banner，每天首次进入弹一次 toast
  function checkPdfTokenReminder() {
    var banner = $('#pdfTokenBanner');
    var textEl = $('#pdfTokenText');
    if (!banner || !textEl) return;
    var h = state.pdf.health;
    var token = h && h.token;
    if (!token || typeof token.daysLeft !== 'number' || token.daysLeft > 10) {
      banner.hidden = true;
      return;
    }
    var days = token.daysLeft;
    banner.className = 'pdf-token-banner' + (days <= 3 ? ' urgent' : '');
    textEl.textContent = 'MinerU 云端 Token 还有 ' + days + ' 天到期（' + token.expiresAt + '），请及时更新，否则云端加速将不可用。';
    banner.hidden = false;
    // 每天第一次进入 PDF 面板时弹一次 toast（不重复打扰）
    var today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('pdf_token_reminded_date') !== today) {
      localStorage.setItem('pdf_token_reminded_date', today);
      setTimeout(function () { toast('注意：MinerU Token 还有 ' + days + ' 天到期，请及时更新'); }, 800);
    }
  }

  function getPdfEngine() {
    var r = document.querySelector('input[name="pdfEngine"]:checked');
    return r ? r.value : 'local';
  }

  function updatePdfStartState() {
    var btn = $('#pdfStartBtn');
    if (!btn) return;
    var h = state.pdf.health;
    var engineOk = !!h && !h.down && (getPdfEngine() === 'local' ? !!h.local : !!h.cloud);
    var fileOk = !!state.pdf.file && (!state.pdf.file || validatePdfFile(state.pdf.file, getPdfEngine()).ok);
    btn.disabled = !fileOk || state.pdf.running || !engineOk;
    btn.textContent = state.pdf.running ? '转写中…' : '开始转写';
  }

  function handlePdfFile(file) {
    if (!file) return;
    var engine = getPdfEngine();
    var v = validatePdfFile(file, engine);
    if (!v.ok) {
      toast(v.msg);
      showPdfFileError(v.msg);
      return;
    }
    showPdfFileError('');
    state.pdf.file = file;
    state.pdf.title = '';
    $('#pdfFileName').textContent = file.name;
    $('#pdfFileMeta').textContent = formatBytes(file.size);
    $('#pdfFileInfo').hidden = false;
    $('#pdfDropzone').classList.add('has-file');
    updatePdfStartState();
  }

  function clearPdfFile() {
    if (state.pdf.running) return;
    state.pdf.file = null;
    state.pdf.title = '';
    $('#pdfFileInput').value = '';
    $('#pdfFileInfo').hidden = true;
    $('#pdfDropzone').classList.remove('has-file');
    showPdfFileError('');
    updatePdfStartState();
  }

  function setPdfProgress(pct) {
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    // 服务端按阶段给基准百分比；前端蠕动值不回退，避免看着焦虑
    if (pct < state.pdf.progress && pct < 99) pct = state.pdf.progress;
    state.pdf.progress = pct;
    var fill = $('#pdfProgressFill');
    fill.classList.remove('indeterminate', 'failed');
    fill.style.width = pct + '%';
    var pctEl = $('#pdfProgressPct');
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  }

  function startPdfCreep() {
    stopPdfCreep();
    state.pdf.creepTimer = setInterval(function () {
      if (!state.pdf.running) { stopPdfCreep(); return; }
      if (state.pdf.progress < 92) setPdfProgress(state.pdf.progress + 0.6);
    }, 1000);
  }

  function stopPdfCreep() {
    if (state.pdf.creepTimer) {
      clearInterval(state.pdf.creepTimer);
      state.pdf.creepTimer = null;
    }
  }

  function showPdfProgress(stage, engine) {
    $('#pdfProgressCard').hidden = false;
    $('#pdfResultCard').hidden = true;
    $('#pdfProgressStage').textContent = stage;
    $('#pdfProgressEngine').textContent = engine ? ('引擎：' + (engine === 'cloud' ? '云端加速' : '本地解析')) : '';
    state.pdf.progress = 0;
    setPdfProgress(0);
    startPdfCreep();
  }

  // 轮询时只更新阶段文字和百分比，不重置进度
  function updatePdfStage(stage, pct) {
    if (stage) $('#pdfProgressStage').textContent = stage;
    if (typeof pct === 'number') setPdfProgress(pct);
  }

  function hidePdfError() {
    var box = $('#pdfErrorBox');
    box.hidden = true;
    box.textContent = '';
  }

  function showPdfError(msg) {
    var box = $('#pdfErrorBox');
    box.hidden = false;
    box.innerHTML = '<strong>转写失败：</strong>' + escapeHtml(msg) +
      '<div class="pdf-error-hint">请检查上方引擎状态；云端失败可切换本地解析重试，本地失败可查看 data/pdf_worker.log。</div>';
  }

  function failPdfJob(msg) {
    state.pdf.running = false;
    clearPdfTimer();
    stopPdfCreep();
    var fill = $('#pdfProgressFill');
    fill.classList.remove('indeterminate');
    fill.classList.add('failed');
    fill.style.width = '100%';
    var pctEl = $('#pdfProgressPct');
    if (pctEl) pctEl.textContent = '';
    $('#pdfProgressStage').textContent = '转写失败';
    showPdfError(msg);
    updatePdfStartState();
  }

  function clearPdfTimer() {
    if (state.pdf.timer) {
      clearInterval(state.pdf.timer);
      state.pdf.timer = null;
    }
  }

  function startPdfJob() {
    var file = state.pdf.file;
    if (!file || state.pdf.running) return;
    var engine = getPdfEngine();
    state.pdf.running = true;
    updatePdfStartState();
    hidePdfError();
    showPdfProgress('上传文件中…', engine);

    fetch('/api/pdf/upload?name=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    }).then(function (r) { return r.json(); }).then(function (up) {
      if (!up.ok) throw new Error(up.error || '上传失败');
      showPdfProgress('已上传，提交解析任务…', engine);
      return api('/api/pdf/submit', {
        method: 'POST',
        body: JSON.stringify({
          pdfPath: up.pdfPath,
          engine: engine,
          formula: $('#pdfOptFormula').checked,
          table: $('#pdfOptTable').checked,
        }),
      });
    }).then(function (sub) {
      if (!sub.ok) throw new Error(sub.error || '提交失败');
      state.pdf.jobId = sub.jobId;
      showPdfProgress('排队中…', engine);
      pollPdfStatus();
    }).catch(function (e) {
      failPdfJob((e && e.message) ? e.message : String(e));
    });
  }

  function pollPdfStatus() {
    clearPdfTimer();
    var miss = 0;
    state.pdf.timer = setInterval(function () {
      api('/api/pdf/status?jobId=' + encodeURIComponent(state.pdf.jobId)).then(function (st) {
        miss = 0;
        if (st.status === 'queued' || st.status === 'running') {
          updatePdfStage(st.progressText || '解析中…', st.progress);
        } else if (st.status === 'done') {
          clearPdfTimer();
          stopPdfCreep();
          setPdfProgress(100);
          updatePdfStage('正在加载结果…', 100);
          loadPdfResult();
        } else if (st.status === 'error') {
          clearPdfTimer();
          failPdfJob(st.error || '解析失败');
        }
      }).catch(function () {
        miss += 1;
        if (miss >= 8) failPdfJob('无法连接转写引擎（连续多次无响应）');
      });
    }, 1500);
  }

  function loadPdfResult() {
    api('/api/pdf/result?jobId=' + encodeURIComponent(state.pdf.jobId)).then(function (d) {
      if (!d.ok) throw new Error(d.error || '读取结果失败');
      state.pdf.running = false;
      state.pdf.markdown = d.markdown;
      updatePdfStartState();
      $('#pdfProgressCard').hidden = true;
      // 重置翻译状态（新PDF加载时清空上一篇的翻译状态）
      if (pdfTransState.watchdog) { clearInterval(pdfTransState.watchdog); }
      pdfTransState = { running: false, cancelled: false, chunks: [], results: [], nextAssign: 0, doneCount: 0, inFlight: 0, imgMapping: [], watchdog: null };
      $('#pdfTransTabBadge').hidden = true;
      $('#pdfTransProgress').hidden = true;
      $('#pdfTransResultWrap').hidden = true;
      $('#pdfTransContent').innerHTML = '';
      // 重置摘要面板
      pdfSumState = { running: false };
      $('#pdfSumTabBadge').hidden = true;
      $('#pdfSumProgress').hidden = true;
      $('#pdfSumResultWrap').hidden = true;
      $('#pdfSumContent').innerHTML = '';
      $('#pdfSumEmpty').hidden = false;
      $('#pdfSumNote').textContent = '';
      // 重置精读面板的显示（新 PDF 不该沿用上一篇的精读）。
      // 注意：正在跑的精读任务在服务端，切/换 PDF 都不该打断它 ——
      // 所以这里只清面板，不动 readTaskState（浮动进度条继续显示）。
      $('#pdfReadTabBadge').hidden = !readIsRunning(state.pdf.jobId);
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadResultWrap').hidden = true;
      $('#pdfReadContent').innerHTML = '';
      $('#pdfReadEmpty').hidden = false;
      // 结果头部：以论文名为主标题（文件名美化 / 送转写来源标题），路径不再裸露——定位交给「打开文件夹」
      var t = state.pdf.title || (state.pdf.file && state.pdf.file.name ? String(state.pdf.file.name).replace(/\.pdf$/i, '') : '');
      if (!t) {
        var segs = String(d.savedPath || '').split('/');
        t = segs.length >= 2 ? segs[segs.length - 2] : '';
      }
      t = t.replace(/_\d{1,4}$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
      var titleEl = $('#pdfResultTitle');
      titleEl.textContent = t || '转写结果';
      titleEl.title = t || '';
      renderPdfPreview(d.markdown);
      renderPdfAssets(d.markdown, state.pdf.jobId);
      var imgs = d.images || [];
      var metaBits = [];
      if (d.chars) metaBits.push(Number(d.chars).toLocaleString('en-US') + ' 字');
      if (imgs.length) metaBits.push('图片 ' + imgs.length + ' 张');
      $('#pdfResultMeta').textContent = metaBits.join(' · ');
      switchPdfView(state.pdf.view || 'preview');
      $('#pdfResultCard').hidden = false;
      toast('转写完成');
    }).catch(function (e) {
      failPdfJob((e && e.message) ? e.message : String(e));
    });
  }

  function renderPdfPreview(md) {
    var html = renderMarkdown(md);
    var jid = state.pdf.jobId;
    html = rewritePdfImagePaths(html, jid);
    $('#pdfPreview').innerHTML = html;
    numberPdfFigures($('#pdfPreview'));
    bindPdfImageLightbox('#pdfPreview');
  }

  function switchPdfView(mode) {
    state.pdf.view = mode;
    $$('.pdf-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.pdfview === mode);
    });
    $('#pdfPreview').hidden = (mode !== 'preview');
    $('#pdfAssets').hidden = (mode !== 'assets');
    $('#pdfTranslation').hidden = (mode !== 'translation');
    $('#pdfSummary').hidden = (mode !== 'summary');
    $('#pdfReading').hidden = (mode !== 'reading');
    if (mode === 'translation') checkPdfTranslationCache();
    if (mode === 'reading') checkPdfReadingCache();
  }

  // ===== 全文翻译（模型见 llm_config.json 的 models.translation，5路并行）=====
  var PDF_TRANS_CONCURRENCY = 5;
  var pdfTransState = { running: false, cancelled: false, chunks: [], results: [], nextAssign: 0, doneCount: 0, inFlight: 0, imgMapping: [], watchdog: null };

  function checkPdfTranslationCache() {
    if (!state.pdf.jobId) return;
    // 如果翻译正在进行中，不重置UI（进度条和已翻译内容保持显示）
    if (pdfTransState.running && !pdfTransState.cancelled) return;
    api('/api/pdf/translation?jobId=' + encodeURIComponent(state.pdf.jobId)).then(function (d) {
      if (d && d.exists && d.translated) {
        showPdfTranslationResult(d.translated);
      } else {
        // 显示开始翻译界面，估算段数和时间（5路并行，每段约3.5秒）
        var md = state.pdf.markdown || '';
        var chunks = chunkPdfMarkdown(md);
        var est = Math.ceil(chunks.length * 3.5 / PDF_TRANS_CONCURRENCY / 60);
        // 只更新「估算」这一段文本：模型名由 applyPdfModelLabels() 写进
        // #pdfTransModelName，早先这里用 textContent 整体覆盖说明文字，
        // 既抹掉了 span 结构、又把模型名写死成了已停用的 Qwen3.8-Max
        applyPdfModelLabels();
        var estEl = $('#pdfTransEst');
        if (estEl) {
          estEl.textContent = ' 全文约 ' + chunks.length + ' 段，' + PDF_TRANS_CONCURRENCY +
            ' 路并行，预计 ' + (est > 0 ? est + ' 分钟' : '不到 1 分钟') + '。';
        }
        $('#pdfTransEmpty').hidden = false;
        $('#pdfTransProgress').hidden = true;
        $('#pdfTransResultWrap').hidden = true;
      }
    }).catch(function () {
      $('#pdfTransEmpty').hidden = false;
    });
  }

  function chunkPdfMarkdown(md) {
    if (!md) return [];
    var paragraphs = md.split(/\n\n+/);
    var chunks = [];
    var current = '';
    var maxChars = 2500;
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i];
      if (current.length + p.length + 2 > maxChars && current) {
        chunks.push(current.trim());
        current = p;
      } else {
        current = current ? current + '\n\n' + p : p;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  // 保护图片标记：将 ![alt](url) 替换为 [[IMG:n]] 占位符，返回 {text, mapping}
  function protectPdfImages(md) {
    var mapping = [];
    var text = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, url) {
      var idx = mapping.length;
      mapping.push({ alt: alt, url: url });
      return '[[IMG:' + idx + ']]';
    });
    return { text: text, mapping: mapping };
  }

  // 还原图片标记：将 [[IMG:n]] 替换回 ![alt](url)
  function restorePdfImages(text, mapping) {
    if (!mapping || !mapping.length) return text;
    return text.replace(/\[\[IMG:(\d+)\]\]/g, function (m, idx) {
      var i = parseInt(idx, 10);
      if (mapping[i]) {
        return '![' + mapping[i].alt + '](' + mapping[i].url + ')';
      }
      return m;
    });
  }

  // 将 HTML 中的 images/ 相对路径重写为 worker 资源接口
  function rewritePdfImagePaths(html, jobId) {
    return html.replace(/src="images\/([^"]+)"/g, function (m, name) {
      return 'src="/api/pdf/asset?jobId=' + encodeURIComponent(jobId) + '&file=images/' + encodeURIComponent(name) + '"';
    });
  }

  // 给容器内的图片按出现顺序编号（图 1、图 2…），并添加标注
  function numberPdfFigures(container) {
    if (!container) return;
    var imgs = container.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      // 跳过已经编号过的（父元素是 .pdf-figure）
      if (img.parentNode && img.parentNode.classList && img.parentNode.classList.contains('pdf-figure')) continue;
      var wrapper = document.createElement('span');
      wrapper.className = 'pdf-figure';
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      var label = document.createElement('span');
      label.className = 'pdf-figure-num';
      label.textContent = '图 ' + (i + 1);
      wrapper.appendChild(label);
    }
  }

  function startPdfTranslation() {
    var md = state.pdf.markdown || '';
    if (!md) { toast('还没有可翻译的正文，先转写完'); return; }
    // 保护图片标记，避免 LLM 翻译时丢失
    var imgProtected = protectPdfImages(md);
    var chunks = chunkPdfMarkdown(imgProtected.text);
    if (!chunks.length) { toast('还没有可翻译的正文，先转写完'); return; }
    pdfTransState = {
      running: true, cancelled: false,
      chunks: chunks,
      results: new Array(chunks.length).fill(null),
      nextAssign: 0, doneCount: 0, inFlight: 0,
      imgMapping: imgProtected.mapping, watchdog: null
    };
    $('#pdfTransEmpty').hidden = true;
    $('#pdfTransProgress').hidden = false;
    $('#pdfTransResultWrap').hidden = true;
    $('#pdfTransTabBadge').hidden = false;
    updatePdfTransProgress();
    // 看门狗：每秒检查是否有 worker 掉线（切换标签页/网络抖动），自动补位
    pdfTransState.watchdog = setInterval(function () {
      if (pdfTransState.running && !pdfTransState.cancelled) pumpPdfTransWorkers();
    }, 1000);
    pumpPdfTransWorkers();
  }

  // 维持最多 PDF_TRANS_CONCURRENCY 个并行请求
  function pumpPdfTransWorkers() {
    if (pdfTransState.cancelled || !pdfTransState.running) return;
    while (pdfTransState.inFlight < PDF_TRANS_CONCURRENCY &&
           pdfTransState.nextAssign < pdfTransState.chunks.length) {
      translateOnePdfChunk(pdfTransState.nextAssign++);
    }
    if (pdfTransState.doneCount >= pdfTransState.chunks.length) {
      finishPdfTranslation();
    }
  }

  function translateOnePdfChunk(idx) {
    pdfTransState.inFlight++;
    var chunk = pdfTransState.chunks[idx];
    api('/api/pdf/llm/translate', {
      method: 'POST',
      body: JSON.stringify({ text: chunk })
    }).then(function (d) {
      pdfTransState.inFlight--;
      if (pdfTransState.cancelled) return;
      pdfTransState.results[idx] = d.ok ? d.translated : ('> [翻译失败，保留原文]\n\n' + chunk);
      pdfTransState.doneCount++;
      updatePdfTransProgress();
      renderPdfTransPartial();
      pumpPdfTransWorkers();
    }).catch(function () {
      pdfTransState.inFlight--;
      if (pdfTransState.cancelled) return;
      pdfTransState.results[idx] = '> [翻译出错，保留原文]\n\n' + chunk;
      pdfTransState.doneCount++;
      updatePdfTransProgress();
      renderPdfTransPartial();
      pumpPdfTransWorkers();
    });
  }

  // 按原始顺序拼接已完成的段落并渲染（未完成的段落跳过，完成后自动补上）
  function renderPdfTransPartial() {
    var parts = [];
    for (var i = 0; i < pdfTransState.results.length; i++) {
      if (pdfTransState.results[i] !== null) parts.push(pdfTransState.results[i]);
    }
    var partial = restorePdfImages(parts.join('\n\n'), pdfTransState.imgMapping);
    var html = rewritePdfImagePaths(renderMarkdown(partial), state.pdf.jobId);
    $('#pdfTransContent').innerHTML = html;
    numberPdfFigures($('#pdfTransContent'));
    $('#pdfTransResultWrap').hidden = false;
  }

  function finishPdfTranslation() {
    pdfTransState.running = false;
    if (pdfTransState.watchdog) { clearInterval(pdfTransState.watchdog); pdfTransState.watchdog = null; }
    $('#pdfTransTabBadge').hidden = true;
    var full = pdfTransState.results.join('\n\n');
    var translated = restorePdfImages(full.trim(), pdfTransState.imgMapping);
    $('#pdfTransProgress').hidden = true;
    showPdfTranslationResult(translated);
    // 保存到后端缓存
    api('/api/pdf/translation/save', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId, translated: translated })
    }).catch(function () {});
    toast('翻译完成');
  }

  function updatePdfTransProgress() {
    var total = pdfTransState.chunks.length;
    var done = pdfTransState.doneCount;
    var pct = total ? Math.round(done / total * 100) : 0;
    $('#pdfTransProgressText').textContent = '已完成 ' + done + ' / ' + total + ' 段（' + pct + '%），' + pdfTransState.inFlight + ' 段并行翻译中…';
    $('#pdfTransProgressFill').style.width = pct + '%';
  }

  function cancelPdfTranslation() {
    pdfTransState.cancelled = true;
    pdfTransState.running = false;
    if (pdfTransState.watchdog) { clearInterval(pdfTransState.watchdog); pdfTransState.watchdog = null; }
    $('#pdfTransTabBadge').hidden = true;
    $('#pdfTransProgress').hidden = true;
    // 拼接已完成的部分展示
    var parts = [];
    for (var i = 0; i < pdfTransState.results.length; i++) {
      if (pdfTransState.results[i] !== null) parts.push(pdfTransState.results[i]);
    }
    if (parts.length) {
      showPdfTranslationResult(restorePdfImages(parts.join('\n\n'), pdfTransState.imgMapping));
    } else {
      $('#pdfTransEmpty').hidden = false;
    }
    toast('已取消翻译');
  }

  function showPdfTranslationResult(translated) {
    $('#pdfTransEmpty').hidden = true;
    $('#pdfTransProgress').hidden = true;
    var html = rewritePdfImagePaths(renderMarkdown(translated), state.pdf.jobId);
    $('#pdfTransContent').innerHTML = html;
    numberPdfFigures($('#pdfTransContent'));
    $('#pdfTransResultWrap').hidden = false;
    bindPdfImageLightbox('#pdfTransContent');
  }

  // ===== 总结摘要（模型名从后端 llm_config 读取，支持三级深度）=====
  var pdfSumState = { running: false, lastResult: null };
  var SUM_DEPTH_LABELS = { quick: "快速速览", standard: "标准精读", deep: "深度学术评价" };
  var SUM_DEPTH_TIMES = { quick: "约5秒", standard: "约20-30秒", deep: "约1分钟" };

  // 模型 id → 展示名。改 llm_config.json 换模型后界面文案自动跟着变，不要再写死字符串。
  var MODEL_PRETTY = {
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "deepseek-v4-pro": "DeepSeek V4 Pro",
    "kimi-k3": "Kimi K3",
    "qwen3.8-max": "Qwen3.8 Max",
    "qwen3.8-flash": "Qwen3.8 Flash"
  };

  function prettyModelName(id) {
    if (!id) return '';
    if (MODEL_PRETTY[id]) return MODEL_PRETTY[id];
    return id.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  // 取某个任务当前生效的模型（数据来自 /api/pdf/health 的 models 字段）
  function pdfModelName(task) {
    var models = (state.pdf.health && state.pdf.health.models) || {};
    var id = models[task || 'summarize'] || models.summarize || models.default || 'qwen3.8-flash';
    return prettyModelName(id);
  }

  // 把生效的模型名写进界面文案（点击前的说明 + 生成中的占位 + 标签页 tooltip）
  function applyPdfModelLabels() {
    var name = pdfModelName('summarize');
    var desc = $('#pdfSumModelName');
    if (desc) desc.textContent = name;
    var placeholder = $('#pdfSumProgressText');
    if (placeholder) placeholder.textContent = name + ' 正在阅读全文并生成摘要…';
    // 翻译说明里的模型名同样从配置取，避免写死后与 llm_config.json 不一致
    var tDesc = $('#pdfTransModelName');
    if (tDesc) tDesc.textContent = pdfModelName('translation');
    var rDesc = $('#pdfReadModelName');
    if (rDesc) rDesc.textContent = pdfModelName('annotate');
    // 标签页 tooltip 也别写死模型名（换模型后 tooltip 会跟着变）
    var sumTab = document.querySelector('.pdf-tab[data-pdfview="summary"]');
    if (sumTab) sumTab.title = name + ' 生成结构化文献摘要';
    var transTab = document.querySelector('.pdf-tab[data-pdfview="translation"]');
    if (transTab) transTab.title = pdfModelName('translation') + ' 整篇译成中文，分段并行，结果会缓存';
    var readTab = document.querySelector('.pdf-tab[data-pdfview="reading"]');
    if (readTab) readTab.title = pdfModelName('annotate') + ' 生成逐段对照的精读长文：原文一段、译文一段，重点处附解读';
  }

  function startPdfSummary(depth) {
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    if (pdfSumState.running) return;
    depth = depth || 'standard';
    pdfSumState.running = true;
    $('#pdfSumEmpty').hidden = true;
    $('#pdfSumResultWrap').hidden = true;
    $('#pdfSumProgress').hidden = false;
    $('#pdfSumTabBadge').hidden = false;
    // 更新进度提示
    var progressText = $('#pdfSumProgress').querySelector('.pdf-translation-progress-text');
    if (progressText) {
      progressText.textContent = pdfModelName('summarize') + ' 正在生成【' + SUM_DEPTH_LABELS[depth] + '】，' + SUM_DEPTH_TIMES[depth] + '…';
    }
    // 禁用所有深度按钮
    $$('.sum-depth-btn').forEach(function (b) { b.disabled = true; });
    api('/api/pdf/llm/summarize', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId, depth: depth })
    }).then(function (d) {
      pdfSumState.running = false;
      $('#pdfSumTabBadge').hidden = true;
      $('#pdfSumProgress').hidden = true;
      $$('.sum-depth-btn').forEach(function (b) { b.disabled = false; });
      if (!d.ok) {
        $('#pdfSumEmpty').hidden = false;
        $('#pdfSumNote').textContent = '生成失败：' + (d.error || '未知错误');
        return;
      }
      pdfSumState.lastResult = d;
      renderPdfSummary(d);
    }).catch(function (e) {
      pdfSumState.running = false;
      $('#pdfSumTabBadge').hidden = true;
      $('#pdfSumProgress').hidden = true;
      $$('.sum-depth-btn').forEach(function (b) { b.disabled = false; });
      $('#pdfSumEmpty').hidden = false;
      $('#pdfSumNote').textContent = '请求失败：' + ((e && e.message) ? e.message : String(e));
    });
  }

  function renderPdfSummary(d) {
    var html = '';

    // 一句话概括（突出显示）
    if (d.one_liner) {
      html += '<div class="sum-oneliner">' + escapeHtml(d.one_liner) + '</div>';
    }

    // 创新点（quick 模式）
    if (d.innovation) {
      html += '<h3>创新点</h3><p>' + escapeHtml(d.innovation).replace(/\n/g, '<br>') + '</p>';
    }

    // 中文摘要
    var zh = d.abstract_zh || d.summary_zh;
    if (zh) {
      html += '<h3>中文摘要</h3><p>' + escapeHtml(zh).replace(/\n/g, '<br>') + '</p>';
    }

    // 英文摘要
    var en = d.abstract_en || d.abstract;
    if (en) {
      html += '<h3>Abstract</h3><p class="sum-abstract-en">' + escapeHtml(en).replace(/\n/g, '<br>') + '</p>';
    }

    // 关键词
    if (d.keywords) {
      var kws = d.keywords.split(/[,，]/).map(function (k) { return k.trim(); }).filter(Boolean);
      html += '<h3>关键词</h3><p>' + kws.map(function (k) {
        return '<span class="pdf-kw-tag">' + escapeHtml(k) + '</span>';
      }).join(' ') + '</p>';
    }

    // 研究问题与意义
    if (d.research_question) {
      html += '<h3>研究问题与意义</h3><p>' + escapeHtml(d.research_question).replace(/\n/g, '<br>') + '</p>';
    }

    // 方法论架构
    if (d.methodology) {
      html += '<h3>方法论架构</h3><p>' + escapeHtml(d.methodology).replace(/\n/g, '<br>') + '</p>';
    }

    // 关键发现
    if (d.key_findings && d.key_findings.length) {
      html += '<h3>关键发现</h3><ul class="sum-findings">';
      d.key_findings.forEach(function (f) {
        html += '<li>' + escapeHtml(f) + '</li>';
      });
      html += '</ul>';
    }

    // 理论贡献（deep 模式）
    if (d.theoretical_contribution) {
      html += '<h3>理论贡献</h3><p>' + escapeHtml(d.theoretical_contribution).replace(/\n/g, '<br>') + '</p>';
    }

    // 关键突破（deep 模式，带重要度星级）
    if (d.breakthroughs && d.breakthroughs.length) {
      html += '<h3>关键突破</h3><div class="sum-breakthroughs">';
      d.breakthroughs.forEach(function (b, i) {
        var title = b.title || ('突破' + (i + 1));
        var desc = b.description || b.desc || '';
        var imp = b.importance || b.importance_level || 3;
        var why = b.why || '';
        var stars = '';
        for (var s = 0; s < 5; s++) { stars += s < imp ? '★' : '☆'; }
        html += '<div class="sum-breakthrough-item">';
        html += '<div class="sum-breakthrough-title"><span class="sum-breakthrough-num">' + (i + 1) + '</span>' + escapeHtml(title) + '<span class="sum-breakthrough-stars">' + stars + '</span></div>';
        if (desc) html += '<div class="sum-breakthrough-desc">' + escapeHtml(desc) + '</div>';
        if (why) html += '<div class="sum-breakthrough-why">为什么重要：' + escapeHtml(why) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // 优势与局限（双栏）
    if ((d.strengths && d.strengths.length) || (d.limitations && d.limitations.length)) {
      html += '<div class="sum-sl-grid">';
      if (d.strengths && d.strengths.length) {
        html += '<div class="sum-sl-card sum-strengths"><h4>主要优势</h4><ul>';
        d.strengths.forEach(function (s) { html += '<li>' + escapeHtml(s) + '</li>'; });
        html += '</ul></div>';
      }
      if (d.limitations && d.limitations.length) {
        html += '<div class="sum-sl-card sum-limitations"><h4>主要局限</h4><ul>';
        d.limitations.forEach(function (l) {
          var content = typeof l === 'object' ? (l.content || l.text || '') : l;
          var severity = typeof l === 'object' ? (l.severity || '') : '';
          html += '<li>' + escapeHtml(content) + (severity ? ' <span class="sum-severity sum-severity-' + severity + '">[' + severity + ']</span>' : '') + '</li>';
        });
        html += '</ul></div>';
      }
      html += '</div>';
    }

    // 待改进与疑惑清单（deep 模式）
    if (d.questions && d.questions.length) {
      html += '<h3>待改进与疑惑清单</h3><div class="sum-questions">';
      d.questions.forEach(function (q, i) {
        var question = q.question || q.text || q.content || ('问题' + (i + 1));
        var type = q.type || '';
        var impact = q.impact || '';
        var typeClass = type === '关键问题' ? 'critical' : (type === '方法问题' ? 'method' : 'understanding');
        html += '<div class="sum-question-item sum-question-' + typeClass + '">';
        if (type) html += '<span class="sum-question-type">' + escapeHtml(type) + '</span>';
        html += '<div class="sum-question-text">' + escapeHtml(question) + '</div>';
        if (impact) html += '<div class="sum-question-impact">影响：' + escapeHtml(impact) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // 对研究的启示
    if (d.implications) {
      html += '<h3>对研究的启示</h3><p>' + escapeHtml(d.implications).replace(/\n/g, '<br>') + '</p>';
    }

    // 进一步研究方向（deep 模式）
    if (d.future_directions && d.future_directions.length) {
      html += '<h3>进一步研究方向</h3><ul class="sum-findings">';
      d.future_directions.forEach(function (f) {
        html += '<li>' + escapeHtml(f) + '</li>';
      });
      html += '</ul>';
    }

    $('#pdfSumContent').innerHTML = html;
    var meta = d.model ? ('模型：' + prettyModelName(d.model) + ' · ' + d.tokens + ' tokens') : '';
    if (d.depth) meta += ' · ' + SUM_DEPTH_LABELS[d.depth];
    $('#pdfSumMeta').textContent = meta;
    $('#pdfSumResultWrap').hidden = false;
  }

  // ===== 图片灯箱：点击放大查看 =====
  function bindPdfImageLightbox(containerSelector) {
    var container = document.querySelector(containerSelector);
    if (!container) return;
    var imgs = container.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener('click', function (e) {
        e.preventDefault();
        openPdfImageLightbox(this.src, this.alt || '');
      });
    }
  }

  function openPdfImageLightbox(src, alt) {
    if (!src) return;
    $('#pdfImgLightboxImg').src = src;
    $('#pdfImgLightboxCaption').textContent = alt || '';
    $('#pdfImgLightboxCaption').hidden = !alt;
    $('#pdfImgLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePdfImageLightbox() {
    $('#pdfImgLightbox').hidden = true;
    $('#pdfImgLightboxImg').src = '';
    document.body.style.overflow = '';
  }

  // ===== 保存摘要 =====
  function savePdfSummary() {
    if (!pdfSumState.lastResult) { toast('还没生成摘要，没东西可存'); return; }
    var btn = $('#pdfSumSaveBtn');
    var btnHtml = btn ? btn.innerHTML : '';   // 记住原图标+文字，恢复时 innerHTML 回写（textContent 会吃掉 SVG）
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    api('/api/pdf/summary/save', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId, summary: pdfSumState.lastResult })
    }).then(function (d) {
      if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }
      if (d.ok) {
        toast('摘要已保存到卡片库');
        if (typeof loadSummaryCards === 'function') loadSummaryCards();
      } else {
        toast('保存失败：' + (d.error || '未知错误'));
      }
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }
      toast('保存请求失败');
    });
  }

  // ===== 摘要卡片库 =====
  var summaryFilter = 'all';
  var summaryQuery = '';
  var summaryTagActive = '';
  var summaryAll = [];
  var summaryCurrentId = '';

  function loadSummaryCards() {
    api('/api/pdf/summaries').then(function (d) {
      if (d.ok) {
        summaryAll = d.summaries || [];
        renderSummaryCards();
        renderTodayBoard(); renderWeekReview();
        var badge = $('#navSummaryBadge');
        if (badge) {
          if ((d.summaries || []).length > 0) {
            badge.style.display = '';
            badge.textContent = d.summaries.length;
          } else {
            badge.style.display = 'none';
          }
        }
      }
    }).catch(function () {});
  }

  function renderSummaryCards() {
    var list = $('#summaryCardList');
    var empty = $('#summaryEmpty');
    if (!list) return;

    var filtered = summaryAll;
    if (summaryFilter !== 'all') {
      filtered = filtered.filter(function (s) { return s.depth === summaryFilter; });
    }
    if (summaryQuery.trim()) {
      var q = summaryQuery.trim().toLowerCase();
      filtered = filtered.filter(function (s) {
        var hay = [s.title, s.title_en, s.keywords, s.one_liner, (s.tags || []).join(' ')].join(' ').toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    if (summaryTagActive) {
      filtered = filtered.filter(function (s) { return (s.tags || []).indexOf(summaryTagActive) >= 0; });
    }

    renderSummaryTagFilter();

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        var et = empty.querySelector('.sum-empty-title');
        var ed = empty.querySelector('.sum-empty-desc');
        var narrowing = summaryQuery.trim() || summaryTagActive || summaryFilter !== 'all';
        if (et) et.textContent = narrowing ? '没有匹配的卡片' : '还没有保存的摘要';
        if (ed) ed.textContent = narrowing ? '换个关键词，或清除上方的筛选条件' : '转写完一份 PDF，切到「摘要」标签生成，点「保存」就进卡片库了';
      }
      return;
    }
    if (empty) empty.hidden = true;

    list.classList.toggle('sum-select-on', sumSelectMode);
    var depthIcons = {
      quick: '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      standard: '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      deep: '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>'
    };
    var depthLabels = { quick: '快速', standard: '标准', deep: '深度' };
    var depthClass = { quick: 'sum-depth-quick', standard: 'sum-depth-standard', deep: 'sum-depth-deep' };

    var html = '';
    filtered.forEach(function (s) {
      var title = s.title || s.title_en || '未命名论文';
      var year = s.year ? ' · ' + s.year : '';
      var keywords = s.keywords ? s.keywords.split(/[,，]/).slice(0, 4).map(function (k) {
        return '<span class="sum-card-kw">' + escapeHtml(k.trim()) + '</span>';
      }).join('') : '';

      var selected = sumSelected.indexOf(s.id) >= 0;
      html += '<div class="sum-card' + (selected ? ' selected' : '') + '" data-id="' + escapeHtml(s.id) + '">';
      html += '<button class="sum-card-check" data-check="' + escapeHtml(s.id) + '" aria-label="勾选这篇论文"></button>';
      html += '<div class="sum-card-header">';
      html += '<span class="sum-card-depth ' + (depthClass[s.depth] || '') + '">' + (depthIcons[s.depth] || '') + (depthLabels[s.depth] || s.depth) + '</span>';
      html += '<span class="sum-card-date">' + escapeHtml(s.created_at || '') + '</span>';
      html += '</div>';
      html += '<div class="sum-card-title">' + escapeHtml(title) + '<span class="sum-card-year">' + escapeHtml(year) + '</span></div>';
      if (s.one_liner) {
        html += '<div class="sum-card-oneliner">' + escapeHtml(s.one_liner) + '</div>';
      }
      if (keywords) {
        html += '<div class="sum-card-keywords">' + keywords + '</div>';
      }
      if (s.tags && s.tags.length) {
        html += '<div class="sum-card-tags">' + s.tags.map(function (t) {
          return '<span class="sum-card-tag"># ' + escapeHtml(t) + '</span>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });
    list.innerHTML = html;

    list.querySelectorAll('.sum-card').forEach(function (card) {
      card.addEventListener('click', function () {
        // 勾选模式下点卡片 = 切换选中；普通模式 = 打开详情
        if (sumSelectMode) { toggleSumSelect(this.dataset.id); return; }
        openSummaryDetail(this.dataset.id);
      });
    });
  }

  // ===== 勾选模式 + 浮动操作条 + BibTeX 导出 + 综述草稿 =====
  var sumSelectMode = false;
  var sumSelected = [];

  function toggleSumSelect(id) {
    var idx = sumSelected.indexOf(id);
    if (idx >= 0) sumSelected.splice(idx, 1); else sumSelected.push(id);
    renderSummaryCards();
    updateSumActionBar();
  }

  function setSumSelectMode(on) {
    sumSelectMode = !!on;
    if (!sumSelectMode) { sumSelected = []; }
    var btn = $('#summarySelectToggle');
    if (btn) btn.classList.toggle('active', sumSelectMode);
    renderSummaryCards();
    updateSumActionBar();
  }

  function updateSumActionBar() {
    var bar = $('#sumActionBar');
    if (!bar) return;
    var count = sumSelected.length;
    $('#sumActionCount').textContent = '已选 ' + count + ' 篇';
    $('#sumActionReview').textContent = count > 1 ? '生成综述草稿' : '生成综述草稿（需 ≥2 篇）';
    bar.hidden = !sumSelectMode;
  }

  function downloadTextFile(text, filename) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

  function exportBibtex() {
    var ids = sumSelectMode && sumSelected.length ? sumSelected.slice() : null;
    api('/api/pdf/summaries/bibtex', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids: ids } : {})
    }).then(function (d) {
      if (!d.ok) { toast('导出失败：' + (d.error || '未知错误')); return; }
      downloadTextFile(d.bibtex, '学术工作台-文献库.bib');
      toast('已导出 ' + d.count + ' 条 BibTeX');
    }).catch(function () { toast('导出失败：请求异常'); });
  }

  var reviewMarkdown = '';
  var reviewSources = [];

  function openReviewModal() {
    if (sumSelected.length < 2) { toast('综述至少需要勾选 2 篇论文'); return; }
    $('#reviewTopicInput').value = '';
    $('#reviewModalStatus').hidden = true;
    $('#reviewModalBody').hidden = true;
    $('#reviewCopyBtn').hidden = true;
    $('#reviewDownloadBtn').hidden = true;
    $('#reviewRunBtn').disabled = false;
    $('#reviewModal').hidden = false;
    setTimeout(function () { $('#reviewTopicInput').focus(); }, 40);
  }

  function closeReviewModal() {
    $('#reviewModal').hidden = true;
  }

  function runReview() {
    var btn = $('#reviewRunBtn');
    var status = $('#reviewModalStatus');
    btn.disabled = true;
    status.hidden = false;
    status.textContent = '正在基于 ' + sumSelected.length + ' 篇论文生成综述草稿…（约需十几秒）';
    api('/api/pdf/review', {
      method: 'POST',
      body: JSON.stringify({ ids: sumSelected.slice(), topic: $('#reviewTopicInput').value.trim() })
    }).then(function (d) {
      btn.disabled = false;
      if (!d.ok) {
        status.textContent = '生成失败：' + (d.error || '未知错误');
        return;
      }
      reviewMarkdown = d.markdown || '';
      reviewSources = d.sources || [];
      status.hidden = true;
      var body = $('#reviewModalBody');
      body.hidden = false;
      body.innerHTML = renderMarkdown(reviewMarkdown);
      linkifyCitations(body, reviewSources);
      $('#reviewCopyBtn').hidden = false;
      $('#reviewDownloadBtn').hidden = false;
      toast('综述草稿已生成（' + d.count + ' 篇 · ' + (d.model || '') + '）');
    }).catch(function () {
      btn.disabled = false;
      status.textContent = '生成失败：请求异常';
    });
  }

  function renderSummaryTagFilter() {
    var box = $('#summaryTagFilter');
    if (!box) return;
    var counts = {};
    summaryAll.forEach(function (s) {
      (s.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!keys.length) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<button class="sum-tag-btn' + (summaryTagActive ? '' : ' active') + '" data-tag="">全部</button>' +
      keys.map(function (t) {
        return '<button class="sum-tag-btn' + (summaryTagActive === t ? ' active' : '') + '" data-tag="' + escapeHtml(t) + '">' +
          escapeHtml(t) + '<span class="sum-tag-count">' + counts[t] + '</span></button>';
      }).join('');
  }

  function saveSummaryTags(tags) {
    if (!summaryCurrentId) return;
    api('/api/pdf/summary/tags', {
      method: 'POST',
      body: JSON.stringify({ id: summaryCurrentId, tags: tags })
    }).then(function (d) {
      if (!d.ok) { toast('标签保存失败：' + (d.error || '')); return; }
      // 同步本地全量数据，列表与筛选立即更新
      summaryAll = summaryAll.map(function (s) {
        return s.id === summaryCurrentId ? Object.assign({}, s, { tags: d.tags }) : s;
      });
      renderSummaryCards();
      renderSummaryTagChips(d.tags);
    }).catch(function () { toast('标签保存失败'); });
  }

  function renderSummaryTagChips(tags) {
    var box = $('#summaryTagChips');
    if (!box) return;
    tags = tags || [];
    if (!tags.length) {
      box.innerHTML = '<span class="sum-tag-empty">还没有标签</span>';
      return;
    }
    box.innerHTML = tags.map(function (t) {
      return '<span class="sum-tag-chip" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) +
        '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
    }).join('');
  }

  // ===== 标签自动建议：AI 读摘要 → 3-5 个候选 → 勾选采纳 =====
  // 按卡片独立存状态（tagSuggestCache[cardId]）：切换卡片时各自的建议/加载态
  // 互不干扰，本会话内来回切也保留；请求回包只刷新当前显示的那张卡。
  var tagSuggestCache = {};   // cardId -> { loading, tags:[], selected:[idx], error }

  function suggestSummaryTags() {
    var id = summaryCurrentId;
    if (!id) return;
    var prev = tagSuggestCache[id];
    if (prev && prev.loading) return;   // 该卡已在建议中，忽略重复点击
    tagSuggestCache[id] = { loading: true, tags: [], selected: [], error: '' };
    renderTagSuggestArea();
    api('/api/pdf/summary/suggest-tags', {
      method: 'POST',
      body: JSON.stringify({ id: id })
    }).then(function (d) {
      var ok = !!(d && d.ok && (d.tags || []).length);
      tagSuggestCache[id] = {
        loading: false,
        tags: ok ? d.tags : [],
        selected: [],
        error: ok ? '' : ((d && d.error) || '未取得建议，请重试')
      };
      renderTagSuggestArea();
    }).catch(function () {
      tagSuggestCache[id] = { loading: false, tags: [], selected: [], error: '请求异常，请重试' };
      renderTagSuggestArea();
    });
  }

  // 按「当前卡片」渲染建议区（切卡时由 openSummaryDetail 调用以恢复各自状态）
  function renderTagSuggestArea() {
    var btn = $('#summaryTagAiBtn');
    var box = $('#summaryTagSuggest');
    if (!btn || !box) return;
    var entry = tagSuggestCache[summaryCurrentId];
    if (!entry) {
      btn.disabled = false;
      btn.textContent = 'AI 建议';
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    if (entry.loading) {
      btn.disabled = true;
      btn.textContent = '分析中…';
      box.hidden = false;
      box.innerHTML = '<span class="sum-tag-suggest-hint">正在读摘要内容…</span>';
      return;
    }
    btn.disabled = false;
    btn.textContent = 'AI 建议';
    box.hidden = false;
    if (!entry.tags.length) {
      box.innerHTML = '<span class="sum-tag-suggest-hint">' + escapeHtml(entry.error || '未取得建议，请重试') + '</span>';
      return;
    }
    box.innerHTML = '<span class="sum-tag-suggest-label">AI 建议</span>' +
      entry.tags.map(function (t, i) {
        var on = entry.selected.indexOf(i) >= 0;
        return '<button class="sum-tag-suggest-chip' + (on ? ' selected' : '') + '" data-si="' + i + '">' + escapeHtml(t) + '</button>';
      }).join('') +
      '<button class="sum-tag-suggest-adopt" id="sumTagAdoptBtn">采纳选中</button>' +
      '<button class="sum-tag-suggest-close" id="sumTagSuggestClose" title="收起这条建议">×</button>';
  }

  function toggleSuggestChip(i) {
    var entry = tagSuggestCache[summaryCurrentId];
    if (!entry || !entry.tags[i]) return;
    var at = entry.selected.indexOf(i);
    if (at >= 0) entry.selected.splice(at, 1); else entry.selected.push(i);
    renderTagSuggestArea();
  }

  function adoptSuggestedTags() {
    var id = summaryCurrentId;
    var entry = tagSuggestCache[id];
    if (!entry) return;
    if (!entry.selected.length) { toast('先点选要采纳的标签'); return; }
    var picked = entry.selected.map(function (i) { return entry.tags[i]; }).filter(Boolean);
    var cur = summaryAll.filter(function (s) { return s.id === id; })[0];
    var tags = (cur && cur.tags) ? cur.tags.slice() : [];
    picked.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
    if (tags.length > 12) tags = tags.slice(0, 12);
    // 已采纳的从候选移除；剩余建议保留，可继续挑
    entry.tags = entry.tags.filter(function (t) { return picked.indexOf(t) < 0; });
    entry.selected = [];
    if (!entry.tags.length) delete tagSuggestCache[id];
    renderTagSuggestArea();
    saveSummaryTags(tags);
    toast('已采纳 ' + picked.length + ' 个标签');
  }

  function closeTagSuggest() {
    delete tagSuggestCache[summaryCurrentId];
    renderTagSuggestArea();
  }

  // ===== 综述引用 [n] → 可点击跳原文卡片 =====
  function linkifyCitations(container, sources) {
    if (!container || !(sources || []).length) return;
    var map = {};
    sources.forEach(function (s) { map[String(s.n)] = s; });
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      if (/\[\d+\]/.test(node.nodeValue)) targets.push(node);
    }
    targets.forEach(function (textNode) {
      var text = textNode.nodeValue;
      var frag = document.createDocumentFragment();
      var last = 0, m;
      var re = /\[(\d+)\]/g;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var src = map[m[1]];
        var a = document.createElement(src ? 'a' : 'span');
        a.className = src ? 'review-cite' : 'review-cite review-cite-missing';
        a.textContent = m[0];
        if (src) {
          a.dataset.cardId = src.id;
          a.title = '跳转到：' + (src.title || '');
        }
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  // ===== 译文库：列表 / 详情 / 检索 / 删除 =====
  var transQuery = '';
  var transCurrentId = '';
  var transLoaded = false;

  function loadTranslations(force) {
    if (transLoaded && !force) return Promise.resolve(state.translations || []);
    return api('/api/pdf/translations').then(function (d) {
      state.translations = (d && d.translations) || [];
      transLoaded = true;
      renderTranslations();
      return state.translations;
    }).catch(function () {
      state.translations = [];
      renderTranslations();
      return [];
    });
  }

  function renderTranslations() {
    var list = $('#transList');
    var empty = $('#transEmpty');
    if (!list) return;
    var items = state.translations || [];
    var badge = $('#navTransBadge');
    if (badge) {
      badge.textContent = items.length;
      // 该徽标在 HTML 上带 hidden 属性，必须清属性而不是只改 style
      badge.hidden = items.length === 0;
    }
    var q = transQuery.trim().toLowerCase();
    var filtered = q ? items.filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(q) >= 0;
    }) : items;

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        var et = empty.querySelector('.sum-empty-title');
        var ed = empty.querySelector('.sum-empty-desc');
        if (et) et.textContent = q ? '没有匹配的译文' : '译文库还是空的';
        if (ed) ed.textContent = q
          ? '换个关键词试试，标题、来源和正文片段都能搜'
          : '在 PDF 转写的「译文」标签翻译完全文后，点「存入译文库」，译文就会归档到这里';
      }
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = filtered.map(function (t, i) {
      var k = Math.max(1, Math.round((t.chars || 0) / 1000));
      return '<div class="trans-item" data-id="' + escapeHtml(t.id) + '" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="trans-item-main">' +
          '<div class="trans-item-title">' + escapeHtml(t.title || '未命名译文') + '</div>' +
          '<div class="trans-item-meta">' + escapeHtml(t.source || '') + ' · ' + k + 'k 字 · ' + escapeHtml(t.created_at || '') + '</div>' +
          (t.excerpt ? '<div class="trans-item-excerpt">' + escapeHtml(t.excerpt) + '</div>' : '') +
        '</div>' +
        '<div class="hs-item-arrow">打开 →</div>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.trans-item').forEach(function (el) {
      el.addEventListener('click', function () { openTranslationDetail(this.dataset.id); });
    });
  }

  function openTranslationDetail(id) {
    api('/api/pdf/translation/get?id=' + encodeURIComponent(id)).then(function (d) {
      if (!d.ok) { toast('打开失败：' + (d.error || '未知错误')); return; }
      var r = d.record || {};
      transCurrentId = id;
      $('#transDetailTitle').textContent = r.title || '未命名译文';
      var k = Math.max(1, Math.round((r.chars || 0) / 1000));
      $('#transDetailMeta').innerHTML =
        '<span>' + escapeHtml(r.source || '') + '</span>' +
        '<span>' + k + 'k 字</span>' +
        '<span>' + escapeHtml(r.created_at || '') + '</span>';
      // 图片仍走资源接口：沿用原任务的 job_id，旧任务图片由跨 job 回退兜住
      var box = $('#transDetailContent');
      box.innerHTML = rewritePdfImagePaths(renderMarkdown(r.markdown || ''), r.job_id || '');
      // 先切换视图再补装饰（图注编号 / 点击放大）：装饰逻辑出错不该挡住阅读
      $('#translationsListView').style.display = 'none';
      $('#translationsDetailView').style.display = '';
      try {
        numberPdfFigures(box);
        bindPdfImageLightbox('#transDetailContent');   // 该函数收选择器字符串，不是元素
      } catch (e) {
        if (window.console) console.warn('译文图注/灯箱初始化失败（不影响阅读）', e);
      }
      var sb = document.querySelector('.main-content') || document.querySelector('.main');
      if (sb) sb.scrollTop = 0;
      var tjob = r.job_id || '';
      renderXrefBar('#transXref', tjob, 'translation');
      ensureXrefData(function () { renderXrefBar('#transXref', tjob, 'translation'); });
    }).catch(function () { toast('打开失败：请求异常'); });
  }

  function closeTranslationDetail() {
    transCurrentId = '';
    $('#translationsDetailView').style.display = 'none';
    $('#translationsListView').style.display = '';
  }

  function deleteTranslation() {
    if (!transCurrentId) return;
    if (!window.confirm('从译文库移除这篇译文？转写任务里的原文不受影响。')) return;
    api('/api/pdf/translation/delete', {
      method: 'POST',
      body: JSON.stringify({ id: transCurrentId })
    }).then(function (d) {
      if (!d.ok) { toast('移除失败：' + (d.error || '未知错误')); return; }
      toast('已从译文库移除');
      closeTranslationDetail();
      loadTranslations(true);
    }).catch(function () { toast('移除失败：请求异常'); });
  }

  function saveCurrentTranslation() {
    if (!state.pdf.jobId) { toast('先转写并翻译全文，再来保存'); return; }
    var btn = $('#pdfTransSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    api('/api/pdf/translation/archive', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId })
    }).then(function (d) {
      if (btn) { btn.disabled = false; btn.textContent = '存入译文库'; }
      if (!d.ok) { toast('保存失败：' + (d.error || '未知错误')); return; }
      toast(d.replaced
        ? '译文已更新（覆盖同一任务的上一版）'
        : '译文已存入译文库（' + Math.max(1, Math.round((d.chars || 0) / 1000)) + 'k 字）');
      loadTranslations(true);   // 徽标与列表立即跟上
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = '存入译文库'; }
      toast('保存失败：请求异常');
    });
  }

  // ===== 原文精读：由服务端按 jobId 生成 =====
  // 早先这套是前端分块并发跑的，只有 PDF 转写面板（当前会话有 markdown）能用 ——
  // 于是在卡片/译文里看到「还没有精读」就是个死胡同，只能回去把整篇重跑一遍。
  // 现在生成挪到 worker：给个 jobId 就读该任务的 result.md 开跑，前端只管
  // 提交 + 轮询进度（分块口径也只有服务端那一份）。
  var readTaskState = { jobId: '', source: '', total: 0, done: 0, timer: null, cancelling: false, rateBase: null };

  function fmtReadEta(seconds) {
    var s = Number(seconds) || 0;
    if (s < 60) return '不到 1 分钟';
    return '约 ' + Math.round(s / 60) + ' 分钟';
  }

  // 剩余时间：以「首次观测到进度」为基线算单段耗时，再乘剩余段数。
  // 基线不能取任务开始时刻 —— 刷新页面接手一个跑了一半的任务时，
  // 用「已跑段数 / 刚经过的几秒」会把剩余时间算得离谱地短。
  function readEtaText() {
    var st = readTaskState;
    var remain = Math.max(0, (st.total || 0) - (st.done || 0));
    if (!st.total || !remain) return '';
    var per = 25;                      // 经验值：单段约 25 秒（实测 21 段 123 秒）
    var base = st.rateBase;
    if (base && st.done > base.done) {
      per = Math.max(4, (Date.now() - base.t) / 1000 / (st.done - base.done));
    }
    var left = remain * per;
    return left < 60 ? '预计还要不到 1 分钟' : '预计还要约 ' + Math.round(left / 60) + ' 分钟';
  }

  function readIsRunning(jobId) {
    return !!(readTaskState.timer && jobId && readTaskState.jobId === jobId);
  }

  // 浮动进度卡：跨面板可见，也是「生成中」的唯一真相
  function renderReadTaskBar() {
    var bar = $('#readTaskBar');
    if (!bar) return;
    if (!readTaskState.timer) {
      bar.hidden = true;
      bar.classList.remove('is-done');
      return;
    }
    bar.hidden = false;
    bar.classList.remove('is-done');
    var pct = readTaskState.total ? Math.round(readTaskState.done / readTaskState.total * 100) : 0;
    var title = $('#readTaskTitle');
    if (title) title.textContent = '原文精读生成中';
    var fill = $('#readTaskFill');
    if (fill) fill.style.width = pct + '%';
    var pctEl = $('#readTaskPct');
    if (pctEl) pctEl.textContent = pct + '%';
    var sub = $('#readTaskSub');
    if (sub) sub.textContent = readTaskState.done + ' / ' + readTaskState.total + ' 段';
    var eta = $('#readTaskEta');
    if (eta) eta.textContent = readEtaText();
    var btn = $('#readTaskCancel');
    if (btn) {
      // 轮询每 2.5 秒会重画一次，正在取消时别把「取消中…」冲掉
      btn.textContent = readTaskState.cancelling ? '取消中…' : '取消';
      btn.disabled = !!readTaskState.cancelling;
    }
  }

  function updatePdfReadProgress() {
    // 只有当下这个 PDF 任务就是正在跑的那个，才把进度写进面板里的进度区
    if (!readIsRunning(state.pdf.jobId)) return;
    var total = readTaskState.total, done = readTaskState.done;
    var pct = total ? Math.round(done / total * 100) : 0;
    var t = $('#pdfReadProgressText');
    if (t) t.textContent = '已完成 ' + done + ' / ' + total + ' 段（' + pct + '%），后台生成中…（可以切到别的面板，跑完会提示你）';
    var fill = $('#pdfReadProgressFill');
    if (fill) fill.style.width = pct + '%';
  }

  function beginReadTask(jobId, source, total) {
    readTaskState.jobId = jobId;
    readTaskState.source = source || 'pdf';
    readTaskState.total = total || 0;
    readTaskState.done = 0;
    readTaskState.cancelling = false;
    readTaskState.rateBase = null;
    if (readTaskState.timer) clearInterval(readTaskState.timer);
    if (readTaskState.source === 'pdf') {
      $('#pdfReadEmpty').hidden = true;
      $('#pdfReadProgress').hidden = false;
      $('#pdfReadResultWrap').hidden = true;
    }
    $('#pdfReadTabBadge').hidden = false;
    renderReadTaskBar();
    updatePdfReadProgress();
    readTaskState.timer = setInterval(pollReadTask, 2500);
    pollReadTask();
  }

  // finished=true 时不是无声消失，而是先变成「已完成」再收起 —— 生成是在后台跑的，
  // 进度卡直接不见了会让人不确定到底跑完没有。
  function endReadTask(finished) {
    var lastSub = readTaskState.done + ' / ' + readTaskState.total + ' 段';
    if (readTaskState.timer) { clearInterval(readTaskState.timer); readTaskState.timer = null; }
    readTaskState.jobId = '';
    readTaskState.done = 0;
    readTaskState.cancelling = false;
    readTaskState.rateBase = null;
    $('#pdfReadTabBadge').hidden = true;
    var bar = $('#readTaskBar');
    if (finished && bar) {
      bar.hidden = false;
      bar.classList.add('is-done');
      var t = $('#readTaskTitle'); if (t) t.textContent = '原文精读已生成';
      var f = $('#readTaskFill'); if (f) f.style.width = '100%';
      var p = $('#readTaskPct'); if (p) p.textContent = '100%';
      var s = $('#readTaskSub'); if (s) s.textContent = lastSub;
      var e = $('#readTaskEta'); if (e) e.textContent = '';
      setTimeout(function () {
        if (!readTaskState.timer) { bar.hidden = true; bar.classList.remove('is-done'); }
      }, 1900);
    } else {
      renderReadTaskBar();
    }
    refreshVisibleXref();   // 关联条上的「精读生成中…」要跟着复原
  }

  function pollReadTask() {
    var jobId = readTaskState.jobId;
    if (!jobId) return;
    api('/api/pdf/reading/status?jobId=' + encodeURIComponent(jobId)).then(function (d) {
      if (!readTaskState.jobId || readTaskState.jobId !== jobId) return;
      if (d && typeof d.done === 'number') {
        readTaskState.done = d.done;
        // 首次拿到非零进度时定为速率基线（刷新后接手一个跑了一半的任务也不会算错）
        if (!readTaskState.rateBase && d.done > 0) {
          readTaskState.rateBase = { t: Date.now(), done: d.done };
        }
      }
      if (d && d.total) readTaskState.total = d.total;
      renderReadTaskBar();
      updatePdfReadProgress();
      refreshVisibleXref();   // 关联条上的「精读生成中 3/19」跟着走
      var st = (d && d.status) || 'none';
      if (st === 'running') return;
      var src = readTaskState.source;
      var err = (d && d.error) || '';
      endReadTask(st === 'done');
      if (st === 'done') onReadTaskDone(jobId, src, (d && d.failed) || 0);
      else if (st === 'cancelled') onReadTaskCancelled(src);
      else if (st === 'error') onReadTaskFail(src, err);
      else onReadTaskFail(src, '任务状态丢了（服务可能重启过），请再点一次');
    }).catch(function () { /* 轮询抖一下不打断，下一轮继续 */ });
  }

  function onReadTaskDone(jobId, src, failed) {
    loadReadings(true).then(function () {
      var hit = findReadingByJob(jobId);
      var sizeTxt = hit ? Math.max(1, Math.round((hit.chars || 0) / 1000)) + 'k 字' : '';
      if (src === 'pdf' && state.pdf.jobId === jobId) {
        api('/api/pdf/reading?jobId=' + encodeURIComponent(jobId)).then(function (d) {
          if (d && d.exists) showPdfReadingResult(d.markdown);
          updateReadArchivedTip();
        });
      } else if (hit) {
        // 从卡片/译文那边点起来的：直接把生成好的精读打开给他
        switchPanel('readings');
        openReadingDetail(hit.id);
      }
      var msg = hit ? ('精读已生成并存进精读库（' + sizeTxt + '）') : '精读已生成';
      if (failed > 0) msg += '，其中 ' + failed + ' 段没成功（已保留原文，可重新生成）';
      toast(msg);
    });
  }

  function onReadTaskFail(src, msg) {
    toast('精读生成失败：' + (msg || '未知错误'));
    if (src === 'pdf' && state.pdf.jobId) {
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadEmpty').hidden = false;
      $('#pdfReadNote').textContent = msg || '';
    }
  }

  function onReadTaskCancelled(src) {
    toast('已取消精读生成');
    if (src === 'pdf' && state.pdf.jobId) {
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadResultWrap').hidden = true;
      $('#pdfReadEmpty').hidden = false;
      checkPdfReadingCache();
    }
  }

  function submitReadTask(jobId, source) {
    if (!jobId) { toast('这篇没有关联的转写任务'); return; }
    if (readIsRunning(jobId)) { toast('这篇正在生成中'); return; }
    if (readTaskState.timer) { toast('还有一个精读任务在跑，等它完成或先取消'); return; }
    api('/api/pdf/reading/generate', {
      method: 'POST',
      body: JSON.stringify({ jobId: jobId })
    }).then(function (d) {
      if (!d || !d.ok) { toast((d && d.error) || '无法开始生成'); return; }
      beginReadTask(jobId, source, d.total);
      if (d.started) toast('开始生成原文精读：共 ' + d.total + ' 段，可以切去干别的，跑完我会告诉你');
      else toast('这篇之前已经在生成，接着看进度');
    }).catch(function () { toast('提交失败：请求异常'); });
  }

  function cancelReadTask() {
    var jobId = readTaskState.jobId;
    if (!jobId) return;
    readTaskState.cancelling = true;
    renderReadTaskBar();
    api('/api/pdf/reading/cancel', { method: 'POST', body: JSON.stringify({ jobId: jobId }) })
      .then(function (d) {
        if (!d || !d.ok) {
          toast((d && d.error) || '取消失败');
          readTaskState.cancelling = false;
          renderReadTaskBar();
        }
        // 成功就不用自己收尾：下一轮轮询看到 cancelled 会收掉浮条
      })
      .catch(function () {
        toast('取消失败：请求异常');
        readTaskState.cancelling = false;
        renderReadTaskBar();
      });
  }

  // 「还没有精读」的一键入口：确认后直接就地生成（不必回 PDF 转写重跑）
  function generateReadingFor(jobId, title) {
    if (!jobId) { toast('这篇没有关联的转写任务'); return; }
    if (readIsRunning(jobId)) { toast('这篇正在生成中：' + readTaskState.done + ' / ' + readTaskState.total + ' 段'); return; }
    if (readTaskState.timer) { toast('还有一个精读任务在跑，等它完成或先取消'); return; }
    api('/api/pdf/reading/plan?jobId=' + encodeURIComponent(jobId)).then(function (p) {
      if (!p || !p.ok) { toast((p && p.error) || '无法生成：读不到这篇的转写结果'); return; }
      var label = title ? ('《' + String(title).slice(0, 32) + '》') : '这篇';
      var msg = '为' + label + '生成原文精读？\n\n' +
        '共 ' + p.total + ' 段，预计 ' + fmtReadEta(p.seconds) + '，' +
        '会调用 ' + p.total + ' 次模型。生成时可以切去干别的，跑完自动存进精读库。';
      if (!window.confirm(msg)) return;
      submitReadTask(jobId, 'xref');
    }).catch(function () { toast('读取预估失败：请求异常'); });
  }

  function showReadPlan(jobId) {
    api('/api/pdf/reading/plan?jobId=' + encodeURIComponent(jobId)).then(function (p) {
      $('#pdfReadEmpty').hidden = false;
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadResultWrap').hidden = true;
      $('#pdfReadNote').textContent = (p && p.ok && p.total)
        ? '全文共 ' + p.total + ' 段，预计 ' + fmtReadEta(p.seconds) + '。生成时可以切去干别的，跑完自动存进精读库。'
        : ((p && p.error) || '还没有可精读的正文，先把 PDF 转写完');
    }).catch(function () {});
  }

  function checkPdfReadingCache() {
    var jobId = state.pdf.jobId;
    if (!jobId) return;
    if (readIsRunning(jobId)) {   // 本地已知在跑：回到进度态
      $('#pdfReadEmpty').hidden = true;
      $('#pdfReadProgress').hidden = false;
      $('#pdfReadResultWrap').hidden = true;
      updatePdfReadProgress();
      return;
    }
    api('/api/pdf/reading?jobId=' + encodeURIComponent(jobId)).then(function (d) {
      if (d && d.exists && d.markdown) { showPdfReadingResult(d.markdown); return; }
      // 没有现成的：先看服务端是不是还在跑（页面刷新过也能接上），否则报预估
      api('/api/pdf/reading/status?jobId=' + encodeURIComponent(jobId)).then(function (s) {
        if (s && s.status === 'running') {
          beginReadTask(jobId, 'pdf', s.total);
          readTaskState.done = s.done || 0;
          renderReadTaskBar();
          updatePdfReadProgress();
          return;
        }
        showReadPlan(jobId);
      }).catch(function () { showReadPlan(jobId); });
    }).catch(function () {});
  }

  function startPdfReading() {
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    submitReadTask(state.pdf.jobId, 'pdf');
  }

  function cancelPdfReading() { cancelReadTask(); }

  // 精读正文里「原文 / 译文 / 解读」三种段落要分层，但 LLM 输出的是 Markdown
  // 的 **解读** 加粗，渲染后是 <p><strong>解读</strong> …</p>。这里在渲染结果上
  // 再加工一层：换成带 class 的段落，样式表就能给三级不同的视觉权重。
  function decorateReadingHtml(html) {
    return html
      .replace(/<p><strong>(原文|译文|解读)<\/strong>[:：]?\s*<\/p>/g, '')
      .replace(/<p><strong>解读<\/strong>[:：]?\s*/g, '<p class="rd-note">')
      .replace(/<p><strong>译文<\/strong>[:：]?\s*/g, '<p class="rd-zh">')
      .replace(/<p><strong>原文<\/strong>[:：]?\s*/g, '<p class="rd-src">');
  }

  function renderPdfReadingInto(markdown) {
    var html = decorateReadingHtml(rewritePdfImagePaths(renderMarkdown(markdown), state.pdf.jobId));
    var box = $('#pdfReadContent');
    box.innerHTML = html;
    numberPdfFigures(box);
  }

  function showPdfReadingResult(markdown) {
    if (!markdown || !markdown.trim()) { $('#pdfReadEmpty').hidden = false; return; }
    $('#pdfReadEmpty').hidden = true;
    $('#pdfReadProgress').hidden = true;
    renderPdfReadingInto(markdown);
    $('#pdfReadResultWrap').hidden = false;
    updateReadArchivedTip();
  }

  function updateReadArchivedTip() {
    var tip = $('#pdfReadArchivedTip');
    if (!tip) return;
    var hit = findReadingByJob(state.pdf.jobId);
    tip.hidden = !hit;
    tip.textContent = hit ? '已存入精读库' : '';
  }

  function copyCurrentReading() {
    var md = $('#pdfReadContent') ? $('#pdfReadContent').innerText : '';
    if (!md) { toast('还没有精读内容'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(md).then(function () { toast('已复制精读全文'); });
    }
  }

  // ===== 精读库：列表 / 详情 / 检索 / 删除 =====
  var readQuery = '';
  var readCurrentId = '';
  var readLoaded = false;

  function loadReadings(force) {
    if (readLoaded && !force) return Promise.resolve(state.readings || []);
    return api('/api/pdf/readings').then(function (d) {
      state.readings = (d && d.readings) || [];
      readLoaded = true;
      renderReadings();
      return state.readings;
    }).catch(function () {
      state.readings = [];
      readLoaded = true;
      renderReadings();
      return [];
    });
  }

  function renderReadings() {
    var list = $('#readList');
    var empty = $('#readEmpty');
    if (!list) return;
    var items = state.readings || [];
    var badge = $('#navReadingBadge');
    if (badge) {
      badge.textContent = items.length;
      badge.hidden = items.length === 0;
    }
    var q = readQuery.trim().toLowerCase();
    var filtered = q ? items.filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(q) >= 0;
    }) : items;

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        var et = empty.querySelector('.sum-empty-title');
        var ed = empty.querySelector('.sum-empty-desc');
        if (et) et.textContent = q ? '没有匹配的精读' : '精读库还是空的';
        if (ed) ed.textContent = q
          ? '换个关键词试试，标题、来源和正文片段都能搜'
          : '在 PDF 转写的「精读」标签生成精读长文，生成完会自动归档到这里';
      }
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = filtered.map(function (t, i) {
      var k = Math.max(1, Math.round((t.chars || 0) / 1000));
      return '<div class="trans-item" data-id="' + escapeHtml(t.id) + '" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="trans-item-main">' +
          '<div class="trans-item-title">' + escapeHtml(t.title || '未命名精读') + '</div>' +
          '<div class="trans-item-meta">' + escapeHtml(t.source || '') + ' · ' + k + 'k 字 · ' + escapeHtml(t.created_at || '') + '</div>' +
          (t.excerpt ? '<div class="trans-item-excerpt">' + escapeHtml(t.excerpt) + '</div>' : '') +
        '</div>' +
        '<div class="hs-item-arrow">打开 →</div>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.trans-item').forEach(function (el) {
      el.addEventListener('click', function () { openReadingDetail(this.dataset.id); });
    });
  }

  function openReadingDetail(id) {
    api('/api/pdf/reading/get?id=' + encodeURIComponent(id)).then(function (d) {
      if (!d.ok) { toast('打开失败：' + (d.error || '未知错误')); return; }
      var r = d.record || {};
      readCurrentId = id;
      $('#readDetailTitle').textContent = r.title || '未命名精读';
      var k = Math.max(1, Math.round((r.chars || 0) / 1000));
      $('#readDetailMeta').innerHTML =
        '<span>' + escapeHtml(r.source || '') + '</span>' +
        '<span>' + k + 'k 字</span>' +
        '<span>' + escapeHtml(r.created_at || '') + '</span>';
      var box = $('#readDetailContent');
      box.innerHTML = decorateReadingHtml(rewritePdfImagePaths(renderMarkdown(r.markdown || ''), r.job_id || ''));
      $('#readingsListView').style.display = 'none';
      $('#readingsDetailView').style.display = '';
      try {
        numberPdfFigures(box);
        bindPdfImageLightbox('#readDetailContent');
      } catch (e) {
        if (window.console) console.warn('精读图注/灯箱初始化失败（不影响阅读）', e);
      }
      renderXrefBar('#readXref', r.job_id || '', 'reading');
      var sb = document.querySelector('.main-content') || document.querySelector('.main');
      if (sb) sb.scrollTop = 0;
    }).catch(function () { toast('打开失败：请求异常'); });
  }

  function closeReadingDetail() {
    readCurrentId = '';
    $('#readingsDetailView').style.display = 'none';
    $('#readingsListView').style.display = '';
  }

  function deleteReading() {
    if (!readCurrentId) return;
    if (!window.confirm('从精读库移除这篇精读？转写任务里的原文件不受影响。')) return;
    api('/api/pdf/reading/delete', {
      method: 'POST',
      body: JSON.stringify({ id: readCurrentId })
    }).then(function (d) {
      if (!d.ok) { toast('移除失败：' + (d.error || '未知错误')); return; }
      toast('已从精读库移除');
      closeReadingDetail();
      loadReadings(true);
    }).catch(function () { toast('移除失败：请求异常'); });
  }

  // ===== 四方互链：摘要卡片 ↔ 译文 ↔ 原文精读 ↔ 原文 PDF =====
  // 用 jobId 做钥匙：摘要卡的 jobId、译文的 job_id、精读的 job_id 指向同一次转写任务。
  function findSummaryByJob(jobId) {
    if (!jobId) return null;
    for (var i = 0; i < summaryAll.length; i++) {
      if (summaryAll[i].jobId === jobId) return summaryAll[i];
    }
    return null;
  }

  function findTranslationByJob(jobId) {
    if (!jobId) return null;
    var list = state.translations || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].job_id === jobId) return list[i];
    }
    return null;
  }

  function findReadingByJob(jobId) {
    if (!jobId) return null;
    var list = state.readings || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].job_id === jobId) return list[i];
    }
    return null;
  }

  // 关联条需要的三个列表：摘要卡已随卡片库加载，译文/精读按需补
  function ensureXrefData(cb) {
    var waits = [];
    if (!transLoaded) waits.push(loadTranslations());
    if (!readLoaded) waits.push(loadReadings());
    if (!waits.length) { cb(); return; }
    Promise.all(waits).then(function () { cb(); }, function () { cb(); });
  }

  function renderXrefBar(sel, jobId, current) {
    var el = $(sel);
    if (!el) return;
    el.dataset.jobId = jobId || '';
    var hasSummary = !!findSummaryByJob(jobId);
    var hasTrans = !!findTranslationByJob(jobId);
    var hasRead = !!findReadingByJob(jobId);
    var busyRead = readIsRunning(jobId);
    function btn(kind, label, on, hint, busy) {
      var cls = 'xref-btn' + (kind === current ? ' is-current'
        : (busy ? ' is-busy' : (on ? ' is-on' : ' is-off')));
      var title = kind === current ? '你已经在这里了'
        : (busy ? '正在生成，点一下看进度'
          : (on ? hint : hint + '（还没有，点一下可以直接生成）'));
      return '<button class="' + cls + '" data-xref="' + kind + '" title="' + escapeHtml(title) + '">' +
        escapeHtml(label) + '</button>';
    }
    // 「还没有」时按钮文案直接说「生成原文精读」——用户一眼就知道点它能补齐，
    // 不必再回 PDF 转写把整篇重跑一遍
    var readLabel = busyRead
      ? ('精读生成中 ' + readTaskState.done + '/' + readTaskState.total)
      : (hasRead ? '原文精读' : '生成原文精读');
    el.innerHTML = '<span class="xref-label">关联</span>' +
      btn('summary', '精读卡片', hasSummary, '跳到这篇的摘要卡片') +
      btn('translation', '译文', hasTrans, '跳到这篇的全文译文') +
      btn('reading', readLabel, hasRead, '跳到这篇的精读长文', busyRead) +
      '<button class="xref-btn xref-pdf" data-xref="pdf" title="在默认浏览器（Edge）里打开这篇的原文 PDF">原文 PDF ↗</button>';
  }

  // 精读任务进度一变，把当前显示着的关联条也刷一遍（按钮上的进度要动）
  function refreshVisibleXref() {
    [['#summaryXref', 'summary'], ['#transXref', 'translation'], ['#readXref', 'reading']].forEach(function (m) {
      var el = $(m[0]);
      if (el && el.dataset.jobId) renderXrefBar(m[0], el.dataset.jobId, m[1]);
    });
  }

  function bindXrefBar(sel) {
    var el = $(sel);
    if (!el) return;
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('.xref-btn');
      if (!btn) return;
      onXrefClick(el.dataset.jobId || '', btn.dataset.xref);
    });
  }

  function onXrefClick(jobId, target) {
    if (target === 'pdf') { openOriginalPdf(jobId); return; }
    if (!jobId) {
      toast('这篇还没有转写任务（只有标题和摘要），先在 PDF 转写里转一次原文');
      return;
    }
    if (target === 'summary') {
      var s = findSummaryByJob(jobId);
      if (!s) { toast('这篇还没有摘要卡片：转写后在「摘要」标签生成，点「保存」即入卡片库'); return; }
      switchPanel('summaries');
      openSummaryDetail(s.id);
      return;
    }
    if (target === 'translation') {
      var t = findTranslationByJob(jobId);
      if (!t) { toast('这篇译文还没进译文库：转写后翻译全文，点「存入译文库」'); return; }
      switchPanel('translations');
      openTranslationDetail(t.id);
      return;
    }
    if (target === 'reading') {
      var r = findReadingByJob(jobId);
      if (r) {
        switchPanel('readings');
        openReadingDetail(r.id);
        return;
      }
      // 还没有 → 不让他回 PDF 转写重跑，就地生成（确认后开始）
      generateReadingFor(jobId, crossLinkTitle(jobId));
    }
  }

  function crossLinkTitle(jobId) {
    var hit = findSummaryByJob(jobId) || findTranslationByJob(jobId);
    return hit ? (hit.title || hit.title_en || '') : '';
  }

  function openOriginalPdf(jobId) {
    if (!jobId) { toast('这篇没有关联的转写任务，找不到原文 PDF'); return; }
    // 由 worker 以 application/pdf 回原件，浏览器（Edge）里直接内嵌打开
    window.open('/api/pdf/original?jobId=' + encodeURIComponent(jobId), '_blank');
  }

  function openSummaryDetail(id) {
    api('/api/pdf/summary?id=' + encodeURIComponent(id)).then(function (d) {
      if (!d.ok) { toast('加载失败：' + (d.error || '')); return; }
      var record = d.record || {};
      var summary = record.summary || {};

      var title = record.title || record.title_en || '未命名论文';
      $('#summaryDetailTitle').textContent = title + (record.year ? ' · ' + record.year : '');
      summaryCurrentId = id;
      renderSummaryTagChips(record.tags || []);
      // 恢复这张卡自己的建议状态（加载中 / 已出建议 / 无），互不串台
      renderTagSuggestArea();

      var container = $('#summaryDetailContent');
      if (container) {
        renderSummaryToElement(summary, container);
      }

      $('#summariesListView').style.display = 'none';
      $('#summariesDetailView').style.display = '';
      renderCardJournalMentions(record, container);
      // 关联条先按已有数据渲染一次，译文库/精读库列表到位后再刷一遍，
      // 免得列表还没加载时把「已有译文」误判成「还没有」
      var jid = record.jobId || '';
      renderXrefBar('#summaryXref', jid, 'summary');
      ensureXrefData(function () { renderXrefBar('#summaryXref', jid, 'summary'); });
    }).catch(function () { toast('加载失败'); });
  }

  // ===== 摘要 ↔ 日志互链：卡片详情显示「日志提及」；日志文本渲染 [[card:标题]] =====
  function renderCardJournalMentions(record, container) {
    if (!container) return;
    var old = container.querySelector('.sum-journal-mentions');
    if (old) old.remove();
    var title = record.title || record.title_en || '';
    if (!title) return;
    var tLower = title.toLowerCase();
    var hits = (state.journal || []).filter(function (j) {
      return (j.content || '').toLowerCase().indexOf(tLower) >= 0;
    });
    var box = document.createElement('div');
    box.className = 'sum-journal-mentions';
    if (hits.length) {
      box.innerHTML = '<div class="sum-mentions-head">日志提及（' + hits.length + '）</div>' +
        hits.slice(0, 3).map(function (j) {
          return '<div class="sum-mention-item"><span class="sum-mention-date">' + escapeHtml(j.date || j.created || '') + '</span>' +
            escapeHtml(String(j.content || '').slice(0, 80)) + '</div>';
        }).join('');
    } else {
      box.innerHTML = '<div class="sum-mentions-head">日志提及</div>' +
        '<div class="sum-mention-item sum-mention-empty">研究日志里还没写过这篇。去日志里用 [[card:' + escapeHtml(title) + ']] 引用它吧</div>';
    }
    container.appendChild(box);
  }

  function renderJournalText(text) {
    var esc = escapeHtml(String(text || ''));
    // [[card:标题]] → 卡片引用链接（点击跳转摘要卡片并打开详情）
    return esc.replace(/\[\[card:([^\]]+)\]\]/g, function (_, title) {
      return '<a class="journal-card-link" data-card-title="' + title + '" href="javascript:void(0)">' + title + '</a>';
    });
  }

  function jumpToCard(title) {
    var t = String(title || '').trim().toLowerCase();
    var hit = null;
    for (var i = 0; i < summaryAll.length; i++) {
      var s = summaryAll[i];
      var a = (s.title || '').toLowerCase();
      var b = (s.title_en || '').toLowerCase();
      if ((a && (a === t || a.indexOf(t) >= 0)) || (b && (b === t || b.indexOf(t) >= 0))) { hit = s; break; }
    }
    if (!hit) { toast('卡片库里没找到「' + title + '」'); return; }
    switchPanel('summaries');
    openSummaryDetail(hit.id);
  }

  // ===== 专注（番茄钟）=====
  // 计时用「结束时间戳」而不是「每秒减 1」：标签页切到后台时浏览器会把 setInterval
  // 降频甚至暂停，减 1 的算法会让计时越来越慢（用户会以为 25 分钟到了、其实还早）。
  // 进行中的一轮同时写进 localStorage，刷新/关标签都能接着跑（此前刷新即丢）。
  var FOCUS_PRESETS = [15, 25, 45, 60];
  var FOCUS_BREAK_SEC = 5 * 60;
  var FOCUS_LOG_KEY = 'wb_focus_log';
  var FOCUS_STATE_KEY = 'wb_focus_state';
  var FOCUS_PRESET_KEY = 'wb_focus_preset';
  var FOCUS_LOG_MAX = 200;
  var FOCUS_TICK_MS = 250;   // 刷新频率：只影响数字与环的顺滑度，不影响计时准确性

  var pomoCounts = {};
  try { pomoCounts = JSON.parse(localStorage.getItem('wb_pomo_counts') || '{}') || {}; } catch (e) { pomoCounts = {}; }

  var focusPreset = 25;
  try {
    var savedPreset = parseInt(localStorage.getItem(FOCUS_PRESET_KEY) || '', 10);
    if (FOCUS_PRESETS.indexOf(savedPreset) >= 0) focusPreset = savedPreset;
  } catch (e) {}

  var focusState = {
    mode: 'focus', totalSec: focusPreset * 60,
    endAt: 0, leftMs: focusPreset * 60000,
    paused: false, running: false, done: false,
    todoId: null, text: '', startedAt: 0, interval: null
  };

  function pomoDayKey(d) {
    var dt = d || new Date();
    return 'wb_pomo_minutes_' + dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
  }

  function pomoMinutesOn(d) {
    return parseInt(localStorage.getItem(pomoDayKey(d)) || '0', 10) || 0;
  }

  // ---------- 记录（单次明细，用于「近 7 天」与记录列表）----------
  function focusLogAll() {
    try {
      var v = JSON.parse(localStorage.getItem(FOCUS_LOG_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function focusLogAdd(entry) {
    var list = focusLogAll();
    list.unshift(entry);
    if (list.length > FOCUS_LOG_MAX) list = list.slice(0, FOCUS_LOG_MAX);
    try { localStorage.setItem(FOCUS_LOG_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function focusIsSameDay(ts, d) {
    if (!ts) return false;
    var a = new Date(ts), b = d || new Date();
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // ---------- 计时核心 ----------
  function focusRemainingMs() {
    if (!focusState.running) return Math.max(0, focusState.leftMs);
    return Math.max(0, focusState.endAt - Date.now());
  }

  function fmtClock(ms) {
    var s = Math.ceil(Math.max(0, ms) / 1000);
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function focusIsActive() {
    return !!(focusState.running || focusState.paused);
  }

  function focusPersist() {
    try {
      localStorage.setItem(FOCUS_STATE_KEY, JSON.stringify({
        mode: focusState.mode, totalSec: focusState.totalSec,
        endAt: focusState.endAt, leftMs: focusState.leftMs,
        paused: focusState.paused, todoId: focusState.todoId,
        text: focusState.text, startedAt: focusState.startedAt
      }));
    } catch (e) {}
  }

  function focusUnpersist() {
    try { localStorage.removeItem(FOCUS_STATE_KEY); } catch (e) {}
  }

  function focusStartTicker() {
    if (focusState.interval) clearInterval(focusState.interval);
    focusState.interval = setInterval(focusTick, FOCUS_TICK_MS);
  }

  function focusStopTicker() {
    if (focusState.interval) { clearInterval(focusState.interval); focusState.interval = null; }
  }

  function focusTick() {
    if (!focusState.running) return;
    if (focusRemainingMs() <= 0) { focusComplete(false); return; }
    focusPaint();
    focusSyncBadge();
  }

  function focusBegin(mode, todoId, text) {
    mode = mode || 'focus';
    var totalSec = mode === 'break' ? FOCUS_BREAK_SEC : focusPreset * 60;
    focusStopTicker();
    focusState = {
      mode: mode, totalSec: totalSec,
      endAt: Date.now() + totalSec * 1000, leftMs: totalSec * 1000,
      paused: false, running: true, done: false,
      todoId: todoId || null, text: text || '',
      startedAt: Date.now(), interval: null
    };
    focusPersist();
    focusStartTicker();
    focusRenderAll();
    return totalSec;
  }

  function focusStart() {
    if (focusIsActive()) { toast('已经有一轮在进行了'); return; }
    var sel = $('#focusTaskSelect');
    var todoId = sel && sel.value ? parseInt(sel.value, 10) : null;
    var t = todoId ? todoById(todoId) : null;
    var kind = t ? '专注' : '自由专注';
    var sec = focusBegin('focus', todoId, t ? t.text : '');
    toast(kind + '开始，' + (sec / 60) + ' 分钟');
  }

  // 从待办卡上的「专注」按钮进来：带着那条待办开始
  function startPomo(id) {
    var t = todoById(id);
    if (!t) return;
    if (focusIsActive()) { toast('已经有一轮在跑了，先结束它'); return; }
    focusBegin('focus', id, t.text);
    var sel = $('#focusTaskSelect');
    if (sel) sel.value = String(id);
    toast('开始专注：' + (t.text.length > 16 ? t.text.slice(0, 16) + '…' : t.text));
  }

  function focusPause() {
    if (!focusState.running) return;
    focusState.leftMs = focusRemainingMs();
    focusState.paused = true;
    focusState.running = false;
    focusStopTicker();
    focusPersist();
    focusRenderAll();
  }

  function focusResume() {
    if (!focusState.paused) return;
    focusState.endAt = Date.now() + focusState.leftMs;
    focusState.paused = false;
    focusState.running = true;
    focusPersist();
    focusStartTicker();
    focusRenderAll();
  }

  // 放弃：把已经专注的那部分记进记录（诚实记录，但不算「完成」）
  function focusGiveUp() {
    if (!focusIsActive()) return;
    var st = focusState;
    var spentSec = Math.max(0, (st.totalSec * 1000 - focusRemainingMs()) / 1000);
    var minutes = Math.round(spentSec / 60);
    if (minutes >= 1) {
      if (st.mode === 'focus') {
        try { localStorage.setItem(pomoDayKey(), String(pomoMinutesOn() + minutes)); } catch (e) {}
      }
      focusLogAdd({
        id: 'f' + Date.now(), mode: st.mode, start: st.startedAt, end: Date.now(),
        minutes: minutes, todoId: st.todoId, text: st.text, completed: false
      });
    }
    focusStopTicker();
    focusUnpersist();
    var wasMin = minutes;
    resetFocusState();
    focusRenderAll();
    renderWeekReview();
    toast(minutes >= 1 ? ('已放弃，' + wasMin + ' 分钟记入专注流水') : '已放弃本轮');
  }

  function resetFocusState() {
    focusState = {
      mode: 'focus', totalSec: focusPreset * 60,
      endAt: 0, leftMs: focusPreset * 60000,
      paused: false, running: false, done: false,
      todoId: null, text: '', startedAt: 0, interval: null
    };
  }

  // silent=true 用于「页面关着时已经跑完」的补记（不弹完成动画）
  function focusComplete(silent) {
    var st = focusState;
    var spentSec = st.running
      ? Math.max(0, (Date.now() - st.startedAt) / 1000)
      : Math.max(0, (st.totalSec * 1000 - st.leftMs) / 1000);
    var minutes = Math.max(1, Math.round(spentSec / 60));
    var isBreak = st.mode === 'break';

    focusLogAdd({
      id: 'f' + Date.now(), mode: st.mode, start: st.startedAt, end: Date.now(),
      minutes: minutes, todoId: st.todoId, text: st.text, completed: true
    });
    if (!isBreak) {
      try { localStorage.setItem(pomoDayKey(), String(pomoMinutesOn() + minutes)); } catch (e) {}
      if (st.todoId) {
        pomoCounts[st.todoId] = (pomoCounts[st.todoId] || 0) + 1;
        try { localStorage.setItem('wb_pomo_counts', JSON.stringify(pomoCounts)); } catch (e) {}
      }
    }
    focusStopTicker();
    focusUnpersist();

    if (silent) { resetFocusState(); focusRenderAll(); renderWeekReview(); return; }

    // 保留一份「刚完成」的状态用于渲染完成态（环变绿 + 扩散波 + 下一步建议）
    focusState = {
      mode: st.mode, totalSec: st.totalSec,
      endAt: 0, leftMs: 0, paused: false, running: false, done: true,
      todoId: st.todoId, text: st.text, startedAt: st.startedAt,
      interval: null, lastMinutes: minutes
    };
    focusRenderAll();
    renderTodos();
    renderWeekReview();
    if (typeof renderTodayBoard === 'function') renderTodayBoard();
    toast(isBreak ? '休息结束，继续加油' : ('专注完成！今日累计 ' + pomoMinutesOn() + ' 分钟'));
  }

  // 启动时恢复未跑完/已跑完的一轮
  function focusRestore() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(FOCUS_STATE_KEY) || 'null'); } catch (e) {}
    if (!raw || !raw.totalSec) return;
    if (raw.paused) {
      focusState = {
        mode: raw.mode || 'focus', totalSec: raw.totalSec,
        endAt: 0, leftMs: raw.leftMs || 0, paused: true, running: false, done: false,
        todoId: raw.todoId || null, text: raw.text || '',
        startedAt: raw.startedAt || Date.now(), interval: null
      };
      focusRenderAll();
      toast('已恢复上一轮（暂停中）：还剩 ' + fmtClock(focusState.leftMs));
      return;
    }
    var left = (raw.endAt || 0) - Date.now();
    if (left > 0) {
      focusState = {
        mode: raw.mode || 'focus', totalSec: raw.totalSec,
        endAt: raw.endAt, leftMs: left, paused: false, running: true, done: false,
        todoId: raw.todoId || null, text: raw.text || '',
        startedAt: raw.startedAt || Date.now(), interval: null
      };
      focusStartTicker();
      focusRenderAll();
      toast('已恢复上一轮，还剩 ' + fmtClock(left));
    } else {
      // 页面没开着的时候已经跑完了：静默补记
      focusState = {
        mode: raw.mode || 'focus', totalSec: raw.totalSec,
        endAt: raw.endAt, leftMs: 0, paused: false, running: false, done: false,
        todoId: raw.todoId || null, text: raw.text || '',
        startedAt: raw.startedAt || Date.now(), interval: null
      };
      focusComplete(true);
    }
  }

  // ---------- 渲染 ----------
  function todoById(id) {
    for (var i = 0; i < state.todos.length; i++) { if (String(state.todos[i].id) === String(id)) return state.todos[i]; }
    return null;
  }

  // 轻量刷新：数字 / 环 / 浮条（每 250ms 一次，别在这里动 DOM 结构）
  function focusPaint() {
    var left = focusRemainingMs();
    var totalMs = Math.max(1, focusState.totalSec * 1000);
    var ratio = Math.min(1, Math.max(0, 1 - left / totalMs));   // 0 → 1 表示「已走过」
    var txt = fmtClock(left);

    var ft = $('#focusTime');
    if (ft) ft.textContent = txt;
    var ring = $('#focusRingProgress');
    if (ring) ring.style.strokeDashoffset = String(678.6 * (1 - ratio));

    // 侧栏徽标与浮条跟随
    var pc = $('#pomoClock');
    if (pc) pc.textContent = txt;
    var pf = $('#pomoRingFg');
    if (pf) pf.style.strokeDashoffset = String(125.66 * (1 - ratio));
    var badge = $('#navFocusBadge');
    if (badge && focusIsActive()) badge.textContent = txt;

    // 文档标题：切到别的标签也能看到剩余时间
    var base = document.title.replace(/^\d{2}:\d{2} · /, '');
    document.title = focusIsActive() ? (txt + ' · ' + base) : base;
  }

  function focusRenderStage() {
    var wrap = $('#focusRingWrap');
    if (!wrap) return;
    wrap.classList.toggle('is-running', !!focusState.running);
    wrap.classList.toggle('is-paused', !!focusState.paused);
    wrap.classList.toggle('is-break', focusState.mode === 'break');
    wrap.classList.toggle('is-done', !!focusState.done);

    var chip = $('#focusModeChip');
    if (chip) chip.textContent = focusState.mode === 'break' ? '休息' : (focusState.done ? '完成' : '专注');

    var label = $('#focusTaskLabel');
    if (label) {
      if (focusState.mode === 'break') {
        label.textContent = focusState.done ? '休息结束' : '离开屏幕，放松一下';
      } else {
        var t = focusState.text || (focusState.todoId ? '' : '自由专注');
        label.textContent = focusState.done
          ? ((focusState.lastMinutes || 0) + ' 分钟已记录')
          : (t || '自由专注');
      }
    }

    var ripples = $('#focusRipples');
    if (ripples) {
      if (focusState.done && !focusLastDone) {
        // 只在「刚变完成」时播放一次扩散波（重复渲染不该反复播）
        ripples.hidden = true;
        /* 强制重排，让动画从头播放 */
        void ripples.offsetWidth;
        ripples.hidden = false;
      } else if (!focusState.done) {
        ripples.hidden = true;
      }
    }
    focusLastDone = !!focusState.done;
    focusPaint();
  }

  function focusRenderControls() {
    var startBtn = $('#focusStartBtn');
    var pauseBtn = $('#focusPauseBtn');
    var giveUpBtn = $('#focusGiveUpBtn');
    var next = $('#focusNext');
    var setup = $('#focusSetupCard');
    if (!startBtn) return;

    var running = focusState.running, paused = focusState.paused, done = focusState.done;
    var active = running || paused;

    startBtn.hidden = active;
    startBtn.textContent = done
      ? (focusState.mode === 'break' ? '再来一轮' : '再专注一轮')
      : (focusState.mode === 'break' ? '开始休息' : '开始专注');

    pauseBtn.hidden = !active;
    if (active) pauseBtn.textContent = paused ? '继续' : '暂停';
    giveUpBtn.hidden = !active;

    // 进行中不让改设置（改了也不该影响这一轮）
    if (setup) {
      setup.style.opacity = active ? '.45' : '';
      setup.style.pointerEvents = active ? 'none' : '';
    }

    if (next) {
      if (done) {
        next.hidden = false;
        if (focusState.mode === 'break') {
          next.innerHTML = '<span class="focus-next-text">休息结束，要不要再来一轮？</span>' +
            '<button class="focus-next-btn" data-focus-next="again">开始专注</button>' +
            '<button class="focus-next-skip" data-focus-next="dismiss">先不用</button>';
        } else {
          next.innerHTML = '<span class="focus-next-text">完成一轮，休息一下再继续？</span>' +
            '<button class="focus-next-btn" data-focus-next="break">休息 5 分钟</button>' +
            '<button class="focus-next-skip" data-focus-next="dismiss">先不用</button>';
        }
      } else {
        next.hidden = true;
        next.innerHTML = '';
      }
    }
  }

  function focusRenderSetup() {
    var box = $('#focusPresets');
    if (box) {
      // 按钮里只放数字（四个一行排得下），单位在标签里说明
      box.innerHTML = FOCUS_PRESETS.map(function (m) {
        return '<button class="focus-preset' + (m === focusPreset ? ' active' : '') + '" data-preset="' + m + '">' + m + '</button>';
      }).join('');
    }
    var sel = $('#focusTaskSelect');
    if (sel) {
      var cur = sel.value;
      var opts = ['<option value="">自由专注（不关联任务）</option>'];
      state.todos.filter(function (t) { return !t.done; }).forEach(function (t) {
        opts.push('<option value="' + t.id + '">' + escapeHtml(t.text.slice(0, 30)) + '</option>');
      });
      sel.innerHTML = opts.join('');
      if (cur) sel.value = cur;
    }
    var hint = $('#focusSetupHint');
    if (hint) {
      var pending = state.todos.filter(function (t) { return !t.done; }).length;
      hint.textContent = pending
        ? ('可以选一条待办绑定这一轮，完成会在待办卡上记一次专注；不选就是自由专注。')
        : '还没有待办，这一轮会是自由专注。';
    }
  }

  function focusRenderToday() {
    var box = $('#focusToday');
    if (!box) return;
    var list = focusLogAll();
    var todayMin = pomoMinutesOn();
    var todayRounds = list.filter(function (e) {
      return e.mode === 'focus' && e.completed && focusIsSameDay(e.start);
    }).length;
    // 连续天数：从今天往前数，只要有专注记录就不算断
    var streak = 0;
    for (var i = 0; i < 400; i++) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var has = pomoMinutesOn(d) > 0 || list.some(function (e) {
        return e.mode === 'focus' && focusIsSameDay(e.start, d);
      });
      if (has) streak++;
      else if (i > 0) break;   // 今天还没开始也不算断
      else if (i === 0) continue;
    }
    box.innerHTML =
      '<div class="focus-stat"><span class="focus-stat-num">' + todayMin + '<em>分</em></span><span class="focus-stat-label">今日专注</span></div>' +
      '<div class="focus-stat"><span class="focus-stat-num">' + todayRounds + '<em>轮</em></span><span class="focus-stat-label">今日完成</span></div>' +
      '<div class="focus-stat"><span class="focus-stat-num">' + streak + '<em>天</em></span><span class="focus-stat-label">连续专注</span></div>';
  }

  function focusRenderBars() {
    var box = $('#focusBars');
    if (!box) return;
    var days = [], max = 0;
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var min = pomoMinutesOn(d);
      if (min > max) max = min;
      days.push({ d: d, min: min, isToday: i === 0 });
    }
    var hint = $('#focusBarsHint');
    if (hint) hint.hidden = max > 0;
    var week = ['日', '一', '二', '三', '四', '五', '六'];
    box.innerHTML = days.map(function (x) {
      var h = max > 0 ? Math.round(x.min / max * 100) : 0;
      var cls = 'focus-bar' + (x.isToday ? ' is-today' : '') + (x.min ? '' : ' is-empty');
      return '<div class="' + cls + '">' +
        '<span class="focus-bar-val">' + (x.min || '') + '</span>' +
        '<div class="focus-bar-track"><div class="focus-bar-fill" style="--h:' + h + '%"></div></div>' +
        '<span class="focus-bar-label">' + (x.isToday ? '今天' : '周' + week[x.d.getDay()]) + '</span>' +
        '</div>';
    }).join('');
  }

  function focusRenderLog() {
    var box = $('#focusLog');
    if (!box) return;
    var list = focusLogAll().slice(0, 12);
    if (!list.length) {
      box.innerHTML = '<div class="focus-log-empty">还没有专注记录。开始第一轮吧。</div>';
      return;
    }
    box.innerHTML = list.map(function (e, i) {
      var t = new Date(e.start || Date.now());
      var hm = function (n) { return (n < 10 ? '0' : '') + n; };
      var when = (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + hm(t.getHours()) + ':' + hm(t.getMinutes());
      var isBreak = e.mode === 'break';
      var cls = 'focus-log-item' + (isBreak ? ' is-break' : '') + (e.completed ? '' : ' is-giving-up');
      var title = isBreak ? '休息' : (e.text || '自由专注');
      var status = e.completed ? '' : ' · 中途放弃';
      return '<div class="' + cls + '" style="--i:' + i + '">' +
        '<span class="focus-log-dot"></span>' +
        '<div class="focus-log-main">' +
        '<div class="focus-log-title' + (e.text || isBreak ? '' : ' is-empty') + '">' + escapeHtml(title) + '</div>' +
        '<div class="focus-log-meta">' + when + status + '</div>' +
        '</div>' +
        '<span class="focus-log-min">' + (isBreak ? '休息 ' : '') + e.minutes + ' 分</span>' +
        '</div>';
    }).join('');
  }

  function focusSyncBadge() {
    var badge = $('#navFocusBadge');
    if (!badge) return;
    var active = focusIsActive();
    badge.hidden = !active;
    badge.classList.toggle('is-timing', active);
    badge.classList.toggle('is-paused', !!focusState.paused);
    badge.textContent = active ? fmtClock(focusRemainingMs()) : '';
  }

  function focusRenderFloating() {
    var bar = $('#pomoTimer');
    if (!bar) return;
    var active = focusIsActive();
    bar.hidden = !active;
    if (!active) return;
    var task = $('#pomoTask');
    if (task) {
      var name = focusState.mode === 'break' ? '休息' : (focusState.text || '自由专注');
      task.textContent = (focusState.paused ? '已暂停 · ' : '') + (name.length > 14 ? name.slice(0, 14) + '…' : name);
    }
    var pauseBtn = $('#pomoPauseBtn');
    if (pauseBtn) pauseBtn.textContent = focusState.paused ? '继续' : '暂停';
  }

  function focusRenderAll() {
    focusRenderStage();
    focusRenderControls();
    focusRenderSetup();
    focusRenderToday();
    focusRenderBars();
    focusRenderLog();
    focusSyncBadge();
    focusRenderFloating();
  }

  var focusLastDone = false;   // 用于「完成瞬间只播一次扩散波」

  function renderWeekReview() {
    var box = $('#weekReview');
    if (!box) return;
    var now = new Date();
    var day = now.getDay() || 7;
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    function inWeek(dateStr) {
      var d = new Date(String(dateStr || '').replace(' ', 'T'));
      return !isNaN(d.getTime()) && d >= monday;
    }
    var todosNew = state.todos.filter(function (t) { return inWeek(t.created); }).length;
    var todosDone = state.todos.filter(function (t) { return t.done && inWeek(t.created); }).length;
    var journalN = state.journal.filter(function (j) { return inWeek(j.date || j.created); }).length;
    var cardsN = summaryAll.filter(function (s) { return inWeek(s.created_at); }).length;
    var pomoMin = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      if (d >= monday) pomoMin += pomoMinutesOn(d);
    }
    var fmt = function (d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
    box.hidden = false;
    box.innerHTML =
      '<div class="week-review-head"><span class="week-review-title">本周回顾</span>' +
      '<span class="week-review-range">' + fmt(monday) + ' – ' + fmt(now) + '</span></div>' +
      '<div class="week-review-grid">' +
      '<div class="week-cell"><span class="week-num">' + cardsN + '</span><span class="week-label">新增卡片</span></div>' +
      '<div class="week-cell"><span class="week-num">' + todosDone + '<em>/' + todosNew + '</em></span><span class="week-label">完成/新增待办</span></div>' +
      '<div class="week-cell"><span class="week-num">' + journalN + '</span><span class="week-label">日志条数</span></div>' +
      '<div class="week-cell"><span class="week-num">' + pomoMin + '<em> 分钟</em></span><span class="week-label">专注时长</span></div>' +
      '</div>';
  }

  function renderSummaryToElement(d, el) {
    var html = '';
    if (d.one_liner) html += '<div class="sum-oneliner">' + escapeHtml(d.one_liner) + '</div>';
    if (d.innovation) html += '<h3>创新点</h3><p>' + escapeHtml(d.innovation).replace(/\n/g, '<br>') + '</p>';
    if (d.abstract_zh) html += '<h3>中文摘要</h3><p>' + escapeHtml(d.abstract_zh).replace(/\n/g, '<br>') + '</p>';
    if (d.abstract_en) html += '<h3>Abstract</h3><p class="sum-abstract-en">' + escapeHtml(d.abstract_en).replace(/\n/g, '<br>') + '</p>';
    if (d.keywords) {
      var kws = d.keywords.split(/[,，]/).map(function (k) { return k.trim(); }).filter(Boolean);
      html += '<h3>关键词</h3><p>' + kws.map(function (k) { return '<span class="pdf-kw-tag">' + escapeHtml(k) + '</span>'; }).join(' ') + '</p>';
    }
    if (d.research_question) html += '<h3>研究问题与意义</h3><p>' + escapeHtml(d.research_question).replace(/\n/g, '<br>') + '</p>';
    if (d.methodology) html += '<h3>方法论架构</h3><p>' + escapeHtml(d.methodology).replace(/\n/g, '<br>') + '</p>';
    if (d.key_findings && d.key_findings.length) {
      html += '<h3>关键发现</h3><ul class="sum-findings">';
      d.key_findings.forEach(function (f) { html += '<li>' + escapeHtml(f) + '</li>'; });
      html += '</ul>';
    }
    if (d.theoretical_contribution) html += '<h3>理论贡献</h3><p>' + escapeHtml(d.theoretical_contribution).replace(/\n/g, '<br>') + '</p>';
    if (d.breakthroughs && d.breakthroughs.length) {
      html += '<h3>关键突破</h3><div class="sum-breakthroughs">';
      d.breakthroughs.forEach(function (b, i) {
        var title = b.title || ('突破' + (i + 1));
        var desc = b.description || b.desc || '';
        var imp = b.importance || b.importance_level || 3;
        var why = b.why || '';
        var stars = '';
        for (var s = 0; s < 5; s++) { stars += s < imp ? '★' : '☆'; }
        html += '<div class="sum-breakthrough-item">';
        html += '<div class="sum-breakthrough-title"><span class="sum-breakthrough-num">' + (i + 1) + '</span>' + escapeHtml(title) + '<span class="sum-breakthrough-stars">' + stars + '</span></div>';
        if (desc) html += '<div class="sum-breakthrough-desc">' + escapeHtml(desc) + '</div>';
        if (why) html += '<div class="sum-breakthrough-why">为什么重要：' + escapeHtml(why) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    if ((d.strengths && d.strengths.length) || (d.limitations && d.limitations.length)) {
      html += '<div class="sum-sl-grid">';
      if (d.strengths && d.strengths.length) {
        html += '<div class="sum-sl-card sum-strengths"><h4>主要优势</h4><ul>';
        d.strengths.forEach(function (s) { html += '<li>' + escapeHtml(s) + '</li>'; });
        html += '</ul></div>';
      }
      if (d.limitations && d.limitations.length) {
        html += '<div class="sum-sl-card sum-limitations"><h4>主要局限</h4><ul>';
        d.limitations.forEach(function (l) {
          var content = typeof l === 'object' ? (l.content || l.text || '') : l;
          var severity = typeof l === 'object' ? (l.severity || '') : '';
          html += '<li>' + escapeHtml(content) + (severity ? ' <span class="sum-severity sum-severity-' + severity + '">[' + severity + ']</span>' : '') + '</li>';
        });
        html += '</ul></div>';
      }
      html += '</div>';
    }
    if (d.questions && d.questions.length) {
      html += '<h3>待改进与疑惑清单</h3><div class="sum-questions">';
      d.questions.forEach(function (q, i) {
        var question = q.question || q.text || q.content || ('问题' + (i + 1));
        var type = q.type || '';
        var impact = q.impact || '';
        var typeClass = type === '关键问题' ? 'critical' : (type === '方法问题' ? 'method' : 'understanding');
        html += '<div class="sum-question-item sum-question-' + typeClass + '">';
        if (type) html += '<span class="sum-question-type">' + escapeHtml(type) + '</span>';
        html += '<div class="sum-question-text">' + escapeHtml(question) + '</div>';
        if (impact) html += '<div class="sum-question-impact">影响：' + escapeHtml(impact) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    if (d.implications) html += '<h3>对研究的启示</h3><p>' + escapeHtml(d.implications).replace(/\n/g, '<br>') + '</p>';
    if (d.future_directions && d.future_directions.length) {
      html += '<h3>进一步研究方向</h3><ul class="sum-findings">';
      d.future_directions.forEach(function (f) { html += '<li>' + escapeHtml(f) + '</li>'; });
      html += '</ul>';
    }
    el.innerHTML = html;
  }

  function initPdfImageLightbox() {
    $('#pdfImgLightboxClose').addEventListener('click', closePdfImageLightbox);
    $('#pdfImgLightboxOverlay').addEventListener('click', closePdfImageLightbox);
    $('#pdfImgLightboxImg').addEventListener('click', closePdfImageLightbox);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#pdfImgLightbox').hidden) {
        closePdfImageLightbox();
      }
    });
  }

  // ===== 从 Markdown 提取非文字元素（图片 / 公式 / 表格）=====
  function extractPdfAssets(md) {
    var assets = { images: [], formulas: [], tables: [] };
    if (!md) return assets;
    var lines = md.split('\n');
    var seenImg = {};
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      // 块级公式 $$...$$（单行或跨行）
      if (trimmed.startsWith('$$')) {
        var buf = [trimmed];
        var singleLine = trimmed.length > 4 && trimmed.endsWith('$$');
        if (!singleLine) {
          i++;
          while (i < lines.length && !lines[i].trim().endsWith('$$')) {
            buf.push(lines[i]);
            i++;
          }
          if (i < lines.length) buf.push(lines[i]);
        }
        assets.formulas.push(buf.join('\n'));
        i++;
        continue;
      }

      // 独立成行的公式 $...$
      if (/^\$[^$]+\$$/.test(trimmed) && trimmed.length > 2) {
        assets.formulas.push(trimmed);
        i++;
        continue;
      }

      // 表格：连续以 | 开头的行
      if (trimmed.startsWith('|')) {
        var tbuf = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tbuf.push(lines[i]);
          i++;
        }
        if (tbuf.length >= 2) assets.tables.push(tbuf.join('\n'));
        continue;
      }

      // 图片（行内或独立行，按 src 去重）
      var imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
      var m;
      while ((m = imgRe.exec(line)) !== null) {
        if (!seenImg[m[2]]) {
          seenImg[m[2]] = true;
          assets.images.push({ alt: m[1], src: m[2] });
        }
      }
      i++;
    }
    return assets;
  }

  // Markdown 表格 → HTML <table>
  function markdownTableToHtml(md) {
    var rows = md.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.indexOf('|') === 0; });
    if (rows.length < 2) return '';
    function splitRow(row) {
      return row.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
    }
    var header = splitRow(rows[0]);
    var body = rows.slice(2).map(splitRow);
    var html = '<table><thead><tr>';
    header.forEach(function (h) { html += '<th>' + escapeHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    body.forEach(function (r) {
      html += '<tr>';
      r.forEach(function (c) { html += '<td>' + renderInline(c) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  // 渲染「图片公式」汇总视图
  function renderPdfAssets(md, jobId) {
    var container = $('#pdfAssets');
    if (!container) return;
    var assets = extractPdfAssets(md);
    var total = assets.images.length + assets.formulas.length + assets.tables.length;
    if (total === 0) {
      container.innerHTML = '<div class="pdf-assets-empty">未检测到图片、公式或表格（本文可能为纯文字文档）</div>';
      return;
    }
    var html = '';
    if (assets.images.length) {
      html += '<div class="pdf-assets-section"><div class="pdf-assets-title">图片（' + assets.images.length + '）</div><div class="pdf-assets-grid">';
      assets.images.forEach(function (img, idx) {
        var url = img.src.indexOf('images/') === 0
          ? '/api/pdf/asset?jobId=' + encodeURIComponent(jobId) + '&file=' + encodeURIComponent(img.src)
          : img.src;
        html += '<div class="pdf-assets-img"><img src="' + url + '" alt="' + escapeHtml(img.alt) + '" loading="lazy" title="' + escapeHtml(img.src) + '"><div class="pdf-assets-img-name">图 ' + (idx + 1) + '</div></div>';
      });
      html += '</div></div>';
    }
    if (assets.formulas.length) {
      html += '<div class="pdf-assets-section"><div class="pdf-assets-title">公式（' + assets.formulas.length + '）</div>';
      assets.formulas.forEach(function (f, idx) {
        html += '<div class="pdf-formula-box"><div class="pdf-formula-num">公式 ' + (idx + 1) + '</div><pre><code>' + escapeHtml(f) + '</code></pre></div>';
      });
      html += '</div>';
    }
    if (assets.tables.length) {
      html += '<div class="pdf-assets-section"><div class="pdf-assets-title">表格（' + assets.tables.length + '）</div>';
      assets.tables.forEach(function (t, idx) {
        html += '<div class="pdf-table-wrap"><div class="pdf-table-num">表格 ' + (idx + 1) + '</div>' + markdownTableToHtml(t) + '</div>';
      });
      html += '</div>';
    }
    container.innerHTML = html;
    bindPdfImageLightbox('#pdfAssets');
  }

  function copyPdfMarkdown() {
    var text = state.pdf.markdown || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制 Markdown 全文'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制 Markdown 全文');
    }
  }

  function downloadPdfMarkdown() {
    var text = state.pdf.markdown || '';
    if (!text) return;
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'result.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function retryPdfJob() {
    $('#pdfResultCard').hidden = true;
    if (state.pdf.file) startPdfJob();
    else { $('#pdfProgressCard').hidden = true; toast('再选一次 PDF'); }
  }

  function openPdfJobFolder() {
    if (!state.pdf.jobId) { toast('没有可打开的任务'); return; }
    fetch('/api/pdf/open-folder?jobId=' + encodeURIComponent(state.pdf.jobId))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) toast('文件夹已打开');
        else toast('打开失败：' + (d.error || '未知错误'));
      })
      .catch(function () { toast('打开文件夹请求失败'); });
  }

  // ===== P0 一键入库 =====
  function setPdfIngestBusy(busy) {
    var btn = $('#pdfIngestConfirm');
    btn.disabled = busy;
    btn.textContent = busy ? '处理中…' : '确认入库';
  }
  function showPdfIngestError(msg) {
    var box = $('#pdfIngestError');
    box.textContent = msg || '';
    box.hidden = !msg;
  }
  function fillPdfThemeOptions(lib) {
    var dl = $('#piThemeList');
    dl.innerHTML = '';
    var seen = {};
    var cats = (lib && lib.categories) || {};
    Object.keys(cats).forEach(function (cat) {
      (cats[cat] || []).forEach(function (t) {
        if (!seen[t.theme]) {
          seen[t.theme] = 1;
          var o = document.createElement('option');
          o.value = t.theme;
          dl.appendChild(o);
        }
      });
    });
  }
  function openPdfIngest() {
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    state.pdf.draft = null;
    $('#pdfIngestError').hidden = true;
    $('#pdfIngestDone').hidden = true;
    $('#pdfIngestFooter').hidden = false;
    $('#piTitle').value = '';
    $('#piAuthors').value = '';
    $('#piYear').value = '';
    $('#piJournal').value = '';
    $('#piDoi').value = '';
    $('#piAbstract').value = '';
    $('#piKeywords').value = '';
    $('#piSummaryZh').value = '';
    $('#piTheme').value = '';
    $('#piCategory').value = '精读';
    $('#piPriority').value = '参考';
    $('#piMakeNotes').checked = true;
    var hint = $('#pdfIngestHint');
    hint.hidden = false;
    hint.textContent = '正在提取元数据…';
    setPdfIngestBusy(true);
    $('#pdfIngestModal').hidden = false;
    Promise.all([
      api('/api/pdf/library'),
      api('/api/pdf/metadata', { method: 'POST', body: JSON.stringify({ jobId: state.pdf.jobId }) })
    ]).then(function (arr) {
      var lib = arr[0], draft = arr[1];
      fillPdfThemeOptions(lib);
      if (!draft.ok) throw new Error(draft.error || '元数据提取失败');
      state.pdf.draft = draft;
      var m = draft.meta || {};
      $('#piTitle').value = m.title || '';
      $('#piAuthors').value = draft.authorsText || (m.authors || []).join('、');
      $('#piYear').value = m.year || '';
      $('#piJournal').value = m.journal || '';
      $('#piDoi').value = m.doi || '';
      $('#piAbstract').value = m.abstract || '';
      $('#piKeywords').value = (m.keywords || []).join(', ');
      var hints = (draft.notes || []).join('；');
      hint.textContent = hints ? ('元数据为自动提取，请核对：' + hints) : '元数据为自动提取，请核对后入库';
    }).catch(function (e) {
      hint.textContent = '自动提取未成功，可手动填写：' + ((e && e.message) || e);
    }).then(function () { setPdfIngestBusy(false); });
  }
  function closePdfIngest() {
    $('#pdfIngestModal').hidden = true;
  }
  function runPdfAiSummarize() {
    var btn = $('#piAiBtn');
    var btnHtml = btn ? btn.innerHTML : '';   // 恢复时 innerHTML 回写，保住图标
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    btn.disabled = true;
    btn.textContent = 'AI 分析中…（约15秒）';
    showPdfIngestError('');
    api('/api/pdf/llm/summarize', { method: 'POST', body: JSON.stringify({ jobId: state.pdf.jobId }) })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'AI 补全失败');
        if (d.abstract) $('#piAbstract').value = d.abstract;
        if (d.keywords) $('#piKeywords').value = d.keywords;
        if (d.summary_zh) $('#piSummaryZh').value = d.summary_zh;
        toast('AI 补全完成（' + (d.tokens || 0) + ' tokens，模型 ' + (d.model || '') + '）');
      })
      .catch(function (e) {
        showPdfIngestError('AI 补全失败：' + ((e && e.message) || String(e)) + '（不影响手动填写和入库）');
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = btnHtml;
      });
  }
  function confirmPdfIngest() {
    var title = $('#piTitle').value.trim();
    var theme = $('#piTheme').value.trim();
    if (!title) { showPdfIngestError('请填写标题'); return; }
    if (!theme) { showPdfIngestError('请填写或选择研究主题'); return; }
    showPdfIngestError('');
    var base = (state.pdf.draft && state.pdf.draft.meta) || {};
    var payload = {
      jobId: state.pdf.jobId,
      category: $('#piCategory').value,
      theme: theme,
      priority: $('#piPriority').value,
      makeNotes: $('#piMakeNotes').checked,
      meta: {
        title: title,
        authorsText: $('#piAuthors').value.trim(),
        year: $('#piYear').value.trim(),
        journal: $('#piJournal').value.trim(),
        doi: $('#piDoi').value.trim(),
        abstract: $('#piAbstract').value.trim(),
        keywords: $('#piKeywords').value.trim(),
        summaryZh: $('#piSummaryZh').value.trim(),
        pages: base.pages || 0,
        chars: base.chars || 0
      }
    };
    setPdfIngestBusy(true);
    api('/api/pdf/ingest', { method: 'POST', body: JSON.stringify(payload) }).then(function (d) {
      setPdfIngestBusy(false);
      if (!d.ok) throw new Error(d.error || '入库失败');
      $('#pdfIngestFooter').hidden = true;
      $('#pdfIngestDone').hidden = false;
      $('#piDonePaper').textContent = '文献目录：' + d.paperDir;
      $('#piDoneNote').textContent = d.notePath ? ('读书札记：' + d.notePath) : '（未生成札记）';
      toast('已存入文献库');
    }).catch(function (e) {
      setPdfIngestBusy(false);
      showPdfIngestError(((e && e.message) || String(e)));
    });
  }

  // ===== 选中文字→引用到札记 =====
  var pdfSelState = { text: '', visible: false };

  function initPdfSelectionToolbar() {
    var preview = $('#pdfPreview');
    if (!preview) return;

    // 监听预览区内的鼠标抬起（选中完成）
    preview.addEventListener('mouseup', function (e) {
      // 延迟一帧，确保 selection 已更新
      setTimeout(function () { handlePdfSelection(e); }, 10);
    });

    // 点击工具栏外部时隐藏
    document.addEventListener('mousedown', function (e) {
      var toolbar = $('#pdfSelToolbar');
      if (toolbar && !toolbar.hidden && !toolbar.contains(e.target)) {
        // 如果点击的是预览区且有选中，不隐藏（mouseup 会重新定位）
        if (!preview.contains(e.target)) {
          hidePdfSelToolbar();
        }
      }
    });

    // 滚动时隐藏工具栏（位置会失效）
    var scrollContainer = preview.closest('.panel') || window;
    scrollContainer.addEventListener('scroll', hidePdfSelToolbar, true);

    // 按钮点击
    $('#pdfSelQuoteBtn').addEventListener('click', function () {
      if (pdfSelState.text) {
        quotePdfSelectionToNote(pdfSelState.text);
      }
    });
  }

  function handlePdfSelection(e) {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (!text || text.length < 2) {
      hidePdfSelToolbar();
      return;
    }
    // 确认选中范围在预览区内
    var preview = $('#pdfPreview');
    if (sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      if (!preview.contains(range.commonAncestorContainer)) {
        hidePdfSelToolbar();
        return;
      }
    }
    pdfSelState.text = text;
    showPdfSelToolbar(e.clientX, e.clientY, text.length);
  }

  function showPdfSelToolbar(x, y, charCount) {
    var toolbar = $('#pdfSelToolbar');
    if (!toolbar) return;
    toolbar.hidden = false;
    pdfSelState.visible = true;

    // 显示字数
    $('#pdfSelCount').textContent = charCount + ' 字';

    // 定位：在鼠标位置上方，超出视口则调整
    var tbW = toolbar.offsetWidth || 180;
    var tbH = toolbar.offsetHeight || 40;
    var left = x - tbW / 2;
    var top = y - tbH - 10;

    // 边界修正
    if (left < 8) left = 8;
    if (left + tbW > window.innerWidth - 8) left = window.innerWidth - tbW - 8;
    if (top < 8) top = y + 16; // 放不下就放下面

    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
  }

  function hidePdfSelToolbar() {
    var toolbar = $('#pdfSelToolbar');
    if (toolbar) toolbar.hidden = true;
    pdfSelState.visible = false;
    pdfSelState.text = '';
  }

  function quotePdfSelectionToNote(text) {
    var btn = $('#pdfSelQuoteBtn');
    var jobId = state.pdf.jobId;
    if (!jobId) {
      toast('没找到这次的转写任务');
      return;
    }
    btn.disabled = true;
    btn.textContent = '追加中…';

    api('/api/pdf/note/quote', {
      method: 'POST',
      body: JSON.stringify({ jobId: jobId, text: text, section: '九' })
    }).then(function (d) {
      btn.disabled = false;
      btn.textContent = '引用到札记';
      if (d.ok) {
        toast('已追加到札记「可引用段落摘录」（' + d.chars + ' 字）');
        hidePdfSelToolbar();
        // 清除选中
        window.getSelection().removeAllRanges();
      } else {
        toast('失败：' + (d.error || '未知错误'));
      }
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = '引用到札记';
      toast('请求失败：' + ((e && e.message) || String(e)));
    });
  }

  // ===== 文献追踪：期刊订阅、每日抓取结果与文献库互通 =====
  function journalTrackerRequest(payload) {
    if (typeof window.__academicJournalTracker !== 'function') return Promise.reject(new Error('文献追踪仅在已登录的浏览器云端版中可用'));
    return window.__academicJournalTracker(payload || { action: 'list' });
  }

  function setTrackerStatus(message, isError) {
    var element = $('#trackerStatus');
    if (!element) return;
    element.hidden = !message;
    element.textContent = message || '';
    element.classList.toggle('is-error', Boolean(isError));
  }

  function applyJournalTrackerData(result) {
    state.journalTracker = {
      subscriptions: Array.isArray(result && result.subscriptions) ? result.subscriptions : [],
      articles: Array.isArray(result && result.articles) ? result.articles : [],
      refreshLogs: Array.isArray(result && result.refreshLogs) ? result.refreshLogs : [],
    };
    state.journalTrackerLoaded = true;
    renderJournalTracker();
  }

  function autoRefreshStaleJournalTracker() {
    var subscriptions = state.journalTracker.subscriptions || [];
    var now = Date.now();
    var due = subscriptions.filter(function (item) { return isTrackerSubscriptionDue(item, now); });
    if (!due.length || state.journalTrackerRefreshingAll || state.journalTrackerRefreshingCategory || state.journalTrackerRetryingFailed || now - state.journalTrackerAutoRefreshAt < 5 * 60 * 1000) return;
    state.journalTrackerAutoRefreshAt = now;
    try { localStorage.setItem(journalTrackerAutoRefreshStorageKey, String(now)); } catch (_) {}
    setTrackerStatus('有 ' + due.length + ' 本期刊到达自动检查时间，正在更新…', false);
    journalTrackerRequest({ action: 'refresh-due' }).then(function (result) {
      applyJournalTrackerData(result);
      var results = Array.isArray(result.results) ? result.results : [];
      if (!results.length) { setTrackerStatus('', false); return; }
      var failed = results.filter(function (item) { return !item.ok; }).length;
      setTrackerStatus(failed ? failed + ' 本期刊暂时更新失败；系统会按退避间隔自动重试。' : '到期的期刊订阅已自动更新。', Boolean(failed));
    }).catch(function (error) {
      setTrackerStatus((error && error.message) || '期刊自动更新失败，请稍后手动重试。', true);
    });
  }

  function trackerRetryDelayMs(item, now) {
    if (!item || !item.last_error) return 24 * 60 * 60 * 1000;
    var lastSuccess = Date.parse(item.last_success_at || '');
    if (!lastSuccess) return 15 * 60 * 1000;
    var failureAge = Math.max(0, (now || Date.now()) - lastSuccess);
    if (failureAge < 60 * 60 * 1000) return 10 * 60 * 1000;
    if (failureAge < 6 * 60 * 60 * 1000) return 30 * 60 * 1000;
    if (failureAge < 24 * 60 * 60 * 1000) return 2 * 60 * 60 * 1000;
    return 6 * 60 * 60 * 1000;
  }

  function isTrackerSubscriptionDue(item, now) {
    if (!item || item.enabled === false) return false;
    var checkedAt = Date.parse(item.last_checked_at || '');
    return !checkedAt || (now || Date.now()) - checkedAt >= trackerRetryDelayMs(item, now);
  }

  function loadJournalTracker(force) {
    if (state.journalTrackerLoading) return Promise.resolve();
    if (state.journalTrackerLoaded && !force) { renderJournalTracker(); autoRefreshStaleJournalTracker(); return Promise.resolve(); }
    state.journalTrackerLoading = true;
    setTrackerStatus('正在载入期刊订阅与最新文章…', false);
    return journalTrackerRequest({ action: 'list' }).then(function (result) {
      applyJournalTrackerData(result);
      setTrackerStatus('', false);
      autoRefreshStaleJournalTracker();
    }).catch(function (error) {
      setTrackerStatus((error && error.message) || '文献追踪载入失败', true);
      renderJournalTracker();
    }).then(function () { state.journalTrackerLoading = false; });
  }

  function trackerDateLabel(value, withTime) {
    if (!value) return '尚未检查';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    var today = new Date();
    var sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    var day = sameDay ? '今天' : (date.getFullYear() === today.getFullYear() ? (date.getMonth() + 1) + '月' + date.getDate() + '日' : date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日');
    if (!withTime) return day;
    return day + ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  function trackerSubscriptionMap() {
    var result = {};
    (state.journalTracker.subscriptions || []).forEach(function (item) { result[String(item.id)] = item; });
    return result;
  }

  var trackerEasyScholarSettingsKey = 'academic-workbench-easyscholar-settings-v1';
  var trackerEasyScholarRanksKey = 'academic-workbench-easyscholar-ranks-v1';
  var trackerEasyScholarRanks = Object.create(null);
  var trackerEasyScholarPending = Object.create(null);
  var trackerEasyScholarAutoAttempted = Object.create(null);
  var trackerEasyScholarErrors = Object.create(null);
  try { trackerEasyScholarRanks = JSON.parse(localStorage.getItem(trackerEasyScholarRanksKey) || '{}') || Object.create(null); } catch (_) {}
  function trackerEasyScholarSettings() {
    try { return JSON.parse(localStorage.getItem(trackerEasyScholarSettingsKey) || '{}') || {}; } catch (_) { return {}; }
  }
  function trackerEasyScholarCacheKey(subscription) { return String(subscription.issn || subscription.id || '').replace(/[^\w-]/g, '').toUpperCase(); }
  function trackerEasyScholarRank(subscription) { return trackerEasyScholarRanks[trackerEasyScholarCacheKey(subscription)] || null; }
  function trackerEasyScholarLabels(rank) {
    var labels = [['sci', 'SCI/JCR'], ['ssci', 'SSCI'], ['sciUp', '中科院升级版'], ['sciBase', '中科院基础版'], ['sciUpSmall', '中科院小类'], ['sciUpTop', '中科院Top'], ['jci', 'JCI'], ['sciif', '影响因子'], ['jcr', 'JCR分区']];
    return labels.filter(function (entry) { return rank && rank[entry[0]] !== undefined && rank[entry[0]] !== null && String(rank[entry[0]]).trim(); })
      .map(function (entry) { return { label: entry[1], value: String(rank[entry[0]]).slice(0, 80) }; });
  }
  function trackerEasyScholarRankMarkup(subscription) {
    if (!subscription || !subscription.id) return '';
    var saved = trackerEasyScholarRank(subscription);
    var labels = saved ? trackerEasyScholarLabels(saved.rank) : [];
    var tags = labels.slice(0, 3).map(function (item) { return '<span class="tracker-rank-chip">' + escapeHtml(item.label + ' ' + item.value) + '</span>'; }).join('');
    var detail = saved && saved.updatedAt ? '<small title="EasyScholar · ' + escapeHtml(saved.updatedAt) + '">分区数据 · ' + escapeHtml(trackerDateLabel(saved.updatedAt, false)) + '</small>' : '';
    var settings = trackerEasyScholarSettings();
    var emptyLabel = saved ? 'EasyScholar 暂无分区数据' : (trackerEasyScholarPending[String(subscription.id)] ? '正在获取分区…' : (trackerEasyScholarErrors[String(subscription.id)] ? '自动获取失败，可重试' : (settings.secretKey ? '分区数据尚未返回' : '配置 EasyScholar 后自动显示分区')));
    return '<div class="tracker-rank-row tracker-rank-under-title" aria-label="期刊分区">' + (tags || '<span class="tracker-rank-empty">' + emptyLabel + '</span>') + '<button type="button" class="tracker-rank-query" data-tracker-journal-rank="' + escapeHtml(subscription.id) + '">' + (saved ? '刷新分区' : '查询分区') + '</button></div>' + detail;
  }
  function openTrackerEasyScholarSettings() {
    $('#trackerEasyScholarKey').value = trackerEasyScholarSettings().secretKey || '';
    $('#trackerEasyScholarOverlay').hidden = false;
    $('#trackerEasyScholarKey').focus();
  }
  function closeTrackerEasyScholarSettings() { $('#trackerEasyScholarOverlay').hidden = true; }
  function saveTrackerEasyScholarSettings(event) {
    event.preventDefault();
    var secretKey = $('#trackerEasyScholarKey').value.trim();
    if (!secretKey) { toast('请填写 EasyScholar Open API Secret Key'); return; }
    try { localStorage.setItem(trackerEasyScholarSettingsKey, JSON.stringify({ secretKey: secretKey, savedAt: new Date().toISOString() })); }
    catch (_) { toast('浏览器无法保存密钥，请检查本机存储空间'); return; }
    closeTrackerEasyScholarSettings();
    trackerEasyScholarAutoAttempted = Object.create(null);
    trackerEasyScholarErrors = Object.create(null);
    renderJournalTracker();
    toast('EasyScholar 密钥已保存，正在自动获取已追踪期刊的分区');
  }
  function queryTrackerJournalRank(id, button, options) {
    options = options || {};
    var subscription = (state.journalTracker.subscriptions || []).filter(function (item) { return String(item.id) === String(id); })[0];
    if (!subscription) return;
    var pendingKey = String(id);
    if (trackerEasyScholarPending[pendingKey]) return;
    var secretKey = trackerEasyScholarSettings().secretKey;
    if (!secretKey) { openTrackerEasyScholarSettings(); return; }
    trackerEasyScholarPending[pendingKey] = true;
    var originalText = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = '查询中…'; }
    journalTrackerRequest({ action: 'easyScholar-rank', secretKey: secretKey, publicationName: subscription.journal_title || subscription.issn })
      .then(function (result) {
        if (!result || !result.rank || !Object.keys(result.rank).length) {
          if (!result || result.easyScholarVersion !== 1) throw new Error('当前 Supabase journal-tracker 可能尚未部署 EasyScholar 分区接口');
          throw new Error('EasyScholar 已连接，但该期刊没有可显示的分区字段；请核对期刊名称或 EasyScholar 权限/额度');
        }
        trackerEasyScholarRanks[trackerEasyScholarCacheKey(subscription)] = { rank: result.rank, updatedAt: new Date().toISOString(), source: 'EasyScholar' };
        delete trackerEasyScholarErrors[pendingKey];
        try { localStorage.setItem(trackerEasyScholarRanksKey, JSON.stringify(trackerEasyScholarRanks)); } catch (_) {}
        renderJournalTracker();
        if (!options.quiet) toast('已获取 ' + (subscription.journal_title || subscription.issn) + ' 的期刊分区');
      }).catch(function (error) {
        delete trackerEasyScholarPending[pendingKey];
        if (button) { button.disabled = false; button.textContent = originalText || '查询分区'; }
        var message = (error && error.message) || 'EasyScholar 查询失败';
        if (/EasyScholar.*(404|未部署|not found)|函数.*(未更新|未部署)/i.test(message)) message += '；请重新部署 Supabase 的 journal-tracker 函数（需包含 EasyScholar-rank 支持）。';
        trackerEasyScholarErrors[pendingKey] = message;
        if (!options.quiet) toast(message);
        else renderJournalTracker();
      }).then(function () { delete trackerEasyScholarPending[pendingKey]; });
  }

  function autoQueryTrackerJournalRanks(subscriptions) {
    if (!trackerEasyScholarSettings().secretKey) return;
    (subscriptions || []).forEach(function (subscription) {
      var id = String(subscription.id);
      if (!id || trackerEasyScholarRank(subscription) || trackerEasyScholarAutoAttempted[id]) return;
      trackerEasyScholarAutoAttempted[id] = true;
      queryTrackerJournalRank(id, null, { quiet: true });
    });
  }

  var trackerArticleDetailId = '';
  function renderTrackerArticleDetail() {
    var detail = $('#trackerArticleDetail');
    if (!detail) return;
    var article = (state.journalTracker.articles || []).filter(function (item) { return String(item.id) === String(trackerArticleDetailId); })[0];
    if (!article) { trackerArticleDetailId = ''; detail.hidden = true; $('#trackerHero').hidden = false; $('#trackerStats').hidden = false; $('#trackerLayout').hidden = false; return; }
    var journal = trackerSubscriptionMap()[String(article.subscription_id)] || {};
    var title = article.title || '未命名文章';
    var authors = Array.isArray(article.authors) && article.authors.length ? article.authors.join('；') : '作者信息暂缺';
    var keywords = Array.isArray(article.keywords) ? article.keywords : [];
    var sourceUrl = article.url || (article.doi ? 'https://doi.org/' + article.doi : '');
    var isRead = article.is_read === true;
    var desktopImported = Boolean(trackerZoteroImported['desktop:' + (article.doi || article.id)]);
    detail.innerHTML = '<button type="button" class="tracker-detail-back" data-tracker-back-to-list>← 返回文献列表</button>' +
      '<div class="tracker-detail-scroll"><div class="tracker-article-meta"><span class="tracker-article-journal">' + escapeHtml(journal.journal_title || '期刊') + '</span><span class="tracker-read-badge ' + (isRead ? 'is-read' : 'is-unread') + '">' + (isRead ? '已读' : '未读') + '</span><span>' + escapeHtml(article.publication_date || '日期暂缺') + '</span>' + (article.doi ? '<span>DOI ' + escapeHtml(article.doi) + '</span>' : '') + '</div>' +
      '<h2 class="tracker-detail-title">' + escapeHtml(title) + '</h2>' + trackerEasyScholarRankMarkup(journal) +
      '<section class="tracker-detail-section"><h3>作者</h3><p>' + escapeHtml(authors) + '</p></section>' +
      '<section class="tracker-detail-section"><h3>摘要 <span>' + escapeHtml(article.abstract_source || '来源暂缺') + '</span></h3><p class="tracker-article-abstract">' + escapeHtml(article.abstract || '该数据源尚未提供摘要。') + '</p></section>' +
      '<section class="tracker-detail-section"><h3>关键词</h3>' + (keywords.length ? '<div class="tracker-keywords">' + keywords.map(function (keyword) { return '<span>' + escapeHtml(keyword) + '</span>'; }).join('') + '</div><div class="tracker-provenance">关键词来源：' + escapeHtml(article.keyword_source || '未标明') + '</div>' : '<p>该数据源尚未提供关键词。</p>') + '</section>' +
      '<section class="tracker-detail-section"><h3>来源与标识</h3><p>期刊：' + escapeHtml(journal.journal_title || '未标明') + '</p><p>元数据来源：' + escapeHtml((article.metadata_sources || []).join('、') || '未标明') + '</p>' + (article.doi ? '<p>DOI：' + escapeHtml(article.doi) + '</p>' : '') + '</section>' +
      '<div class="tracker-article-actions">' + (sourceUrl ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener">打开原文</a>' : '') + '<button type="button" data-tracker-read-toggle="' + escapeHtml(article.id) + '" data-tracker-is-read="' + isRead + '">' + (isRead ? '标为未读' : '标为已读') + '</button><button type="button" data-tracker-save-ref="' + escapeHtml(article.id) + '">加入文献库</button><button type="button" data-tracker-zotero-desktop="' + escapeHtml(article.id) + '">' + (desktopImported ? '重新导入' : '导入Zotero') + '</button></div></div>';
    detail.hidden = false;
    $('#trackerHero').hidden = true; $('#trackerStats').hidden = true; $('#trackerLayout').hidden = true;
  }
  function openTrackerArticleDetail(id) {
    trackerArticleDetailId = String(id || '');
    renderTrackerArticleDetail();
    if (!$('#trackerArticleDetail').hidden) $('#trackerArticleDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeTrackerArticleDetail() {
    var closingId = trackerArticleDetailId;
    var article = (state.journalTracker.articles || []).filter(function (item) { return String(item.id) === String(closingId); })[0];
    trackerArticleDetailId = '';
    $('#trackerArticleDetail').hidden = true; $('#trackerHero').hidden = false; $('#trackerStats').hidden = false; $('#trackerLayout').hidden = false;
    if (article && article.is_read !== true) {
      saveTrackedArticleRead(closingId, true).then(function () { toast('已读完并标记为已读'); }).catch(function (error) {
        toast('已返回列表，但已读状态保存失败：' + ((error && error.message) || '请稍后重试'));
      });
    }
  }

  function trackerVisibleArticles() {
    var articles = state.journalTracker.articles || [];
    var subscriptionById = trackerSubscriptionMap();
    var needle = (state.journalTrackerQuery || '').trim().toLowerCase();
    return articles.filter(function (article) {
      if (state.journalTrackerFilter !== 'all' && String(article.subscription_id) !== String(state.journalTrackerFilter)) return false;
      if (state.trackerJournalCategoryFilter !== 'all') {
        var subscription = subscriptionById[String(article.subscription_id)] || {};
        if ((String(subscription.category || '').trim() || '未分类') !== state.trackerJournalCategoryFilter) return false;
      }
      if (state.journalTrackerReadFilter === 'unread' && article.is_read === true) return false;
      if (state.journalTrackerReadFilter === 'read' && article.is_read !== true) return false;
      if (!needle) return true;
      return [article.title, (article.authors || []).join(' '), (article.keywords || []).join(' '), article.abstract].join(' ').toLowerCase().indexOf(needle) >= 0;
    });
  }

  function renderJournalTracker() {
    if (!$('#trackerArticles')) return;
    var subscriptions = state.journalTracker.subscriptions || [];
    autoQueryTrackerJournalRanks(subscriptions);
    var articles = state.journalTracker.articles || [];
    var subscriptionById = trackerSubscriptionMap();
    $('#trackerJournalCount').textContent = subscriptions.length;
    $('#trackerArticleCount').textContent = articles.length;
    $('#trackerSubscriptionCount').textContent = subscriptions.length;
    var checks = subscriptions.map(function (item) { return item.last_checked_at; }).filter(Boolean).sort().reverse();
    $('#trackerLastCheck').textContent = checks.length ? trackerDateLabel(checks[0], true) : '尚未检查';
    var refreshLogs = state.journalTracker.refreshLogs || [];
    var failingSubscriptions = subscriptions.filter(function (item) { return item.enabled !== false && Boolean(item.last_error); });
    var runHistory = $('#trackerRunHistory');
    runHistory.hidden = !refreshLogs.length && !failingSubscriptions.length;
    if (!runHistory.hidden) {
      var latestLog = refreshLogs[0];
      var recentFailures = failingSubscriptions.slice(0, 4).map(function (item) {
        return '<li><b>' + escapeHtml(item.journal_title || item.issn) + '</b><span title="' + escapeHtml(item.last_error || '') + '">' + escapeHtml(item.last_error || '抓取失败') + '</span></li>';
      }).join('');
      var sourceLabels = { scheduled: '后台定时', automatic: '自动检查', manual: '手动检查', category: '分类检查', retry: '失败重试' };
      var logRows = refreshLogs.slice(0, 8).map(function (log) {
        var journal = subscriptionById[String(log.subscription_id)] || {};
        var logTitle = journal.journal_title || journal.issn || '已移除的期刊';
        var outcome = log.ok ? (log.error ? '完成·有提示' : '成功') : '失败';
        var outcomeClass = log.ok ? (log.error ? 'is-warning' : 'is-success') : 'is-error';
        var detail = log.error ? '<small title="' + escapeHtml(log.error) + '">' + escapeHtml(log.error) + '</small>' : '';
        return '<li><time>' + escapeHtml(trackerDateLabel(log.checked_at, true)) + '</time><span class="tracker-run-log-title" title="' + escapeHtml(logTitle) + '">' + escapeHtml(logTitle) + '</span><span class="tracker-run-source">' + escapeHtml(sourceLabels[log.source] || '检查') + '</span><b class="' + outcomeClass + '">' + outcome + '</b><span class="tracker-run-count">+' + Number(log.article_count || 0) + ' 篇</span>' + detail + '</li>';
      }).join('');
      runHistory.innerHTML = '<div class="tracker-run-banner' + (failingSubscriptions.length ? ' has-failures' : '') + '"><div class="tracker-run-banner-title"><span class="tracker-run-indicator"></span><div><b>' + (failingSubscriptions.length ? '后台更新需要关注' : '后台更新运行正常') + '</b><span>' + (failingSubscriptions.length ? failingSubscriptions.length + ' 本期刊存在抓取问题，将按退避间隔自动重试。' : latestLog ? '最近检查：' + escapeHtml(trackerDateLabel(latestLog.checked_at, true)) + '；关闭网页后仍会定时检查。' : '关闭网页后仍会定时检查。') + '</span></div></div>' + (recentFailures ? '<ul class="tracker-run-failures">' + recentFailures + '</ul>' : '') + (logRows ? '<details class="tracker-run-details"><summary>最近检查记录（' + refreshLogs.length + '）</summary><ol>' + logRows + '</ol></details>' : '') + '</div>';
    }
    var unreadCount = articles.filter(function (article) { return article.is_read !== true; }).length;
    var unreadLabel = $('#trackerUnreadCount');
    if (unreadLabel) { unreadLabel.textContent = unreadCount + ' 篇未读'; unreadLabel.hidden = unreadCount === 0; }
    var markAllReadButton = $('#trackerMarkAllRead');

    var journalCategories = Array.from(new Set(subscriptions.map(function (item) { return String(item.category || '').trim() || '未分类'; })))
      .sort(function (left, right) { if (left === '未分类') return -1; if (right === '未分类') return 1; return left.localeCompare(right, 'zh-CN'); });
    var categoryRefreshButton = $('#trackerRefreshCategory');
    var refreshCategory = state.trackerJournalCategoryFilter;
    var refreshSubscriptions = subscriptions.filter(function (item) { return (String(item.category || '').trim() || '未分类') === refreshCategory && item.enabled !== false; });
    var failureScopeSubscriptions = subscriptions.filter(function (item) {
      if (item.enabled === false) return false;
      if (state.journalTrackerFilter !== 'all' && String(item.id) !== String(state.journalTrackerFilter)) return false;
      if (state.trackerJournalCategoryFilter !== 'all' && (String(item.category || '').trim() || '未分类') !== state.trackerJournalCategoryFilter) return false;
      return true;
    });
    var failedSubscriptions = failureScopeSubscriptions.filter(function (item) { return Boolean(item.last_error); });
    var retryFailedButton = $('#trackerRetryFailed');
    var trackerRefreshBusy = Boolean(state.journalTrackerRefreshingAll || state.journalTrackerRefreshingCategory || state.journalTrackerRetryingFailed);
    categoryRefreshButton.hidden = refreshCategory === 'all';
    categoryRefreshButton.disabled = refreshCategory === 'all' || refreshSubscriptions.length === 0 || trackerRefreshBusy;
    categoryRefreshButton.textContent = state.journalTrackerRefreshingCategory === refreshCategory ? '正在刷新…' : '刷新此分类（' + refreshSubscriptions.length + '）';
    categoryRefreshButton.title = refreshCategory === 'all' ? '先选择一个期刊分类' : refreshSubscriptions.length ? '仅检查“' + refreshCategory + '”中的 ' + refreshSubscriptions.length + ' 本启用期刊' : '该分类没有启用中的期刊';
    retryFailedButton.hidden = failedSubscriptions.length === 0;
    retryFailedButton.disabled = trackerRefreshBusy;
    retryFailedButton.textContent = state.journalTrackerRetryingFailed ? '正在重试…' : '仅重试失败（' + failedSubscriptions.length + '）';
    retryFailedButton.title = state.journalTrackerFilter !== 'all'
      ? '仅重试当前选中的失败期刊'
      : state.trackerJournalCategoryFilter !== 'all'
        ? '仅重试“' + state.trackerJournalCategoryFilter + '”分类中的失败期刊'
        : '仅重试全部启用且上次抓取失败的期刊';
    $('#trackerRefresh').disabled = trackerRefreshBusy;
    $('#trackerRefresh').textContent = state.journalTrackerRefreshingAll ? '正在检查…' : '立即检查更新';
    var addCategorySelect = $('#trackerAddCategory');
    var addCategoryValue = state.trackerAddCategory === undefined ? '__default__' : state.trackerAddCategory;
    var addCategoryOptions = journalCategories.filter(function (category) { return category !== '未分类'; });
    if (addCategoryValue && addCategoryValue !== '__default__' && addCategoryOptions.indexOf(addCategoryValue) < 0) addCategoryOptions.push(addCategoryValue);
    addCategorySelect.innerHTML = '<option value="__default__">新期刊归入未分类；已有期刊保持原分类</option><option value="">未分类（手动指定）</option>' + addCategoryOptions.sort(function (left, right) { return left.localeCompare(right, 'zh-CN'); }).map(function (category) {
      return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>';
    }).join('') + '<option value="__new_category__">＋新建分类…</option>';
    addCategorySelect.value = addCategoryValue;
    var categoryManageButton = $('#trackerCategoryManageToggle');
    categoryManageButton.textContent = state.trackerCategoryManageMode ? '完成' : '管理分类';
    categoryManageButton.setAttribute('aria-pressed', String(Boolean(state.trackerCategoryManageMode)));
    var categoryOptions = '<option value="">未分类</option>' + journalCategories.filter(function (category) { return category !== '未分类'; }).map(function (category) {
      return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>';
    }).join('') + '<option value="__new_category__">＋ 新建分类…</option>';
    var selectedJournalIds = Object.keys(state.trackerSelectedJournalIds || {}).filter(function (id) { return state.trackerSelectedJournalIds[id]; });
    var bulkTools = state.trackerCategoryManageMode ? '<div class="tracker-category-bulk-tools"><span>已选 ' + selectedJournalIds.length + ' 本期刊</span><select id="trackerBulkCategory" aria-label="批量移动到分类">' + categoryOptions + '</select><button type="button" data-tracker-bulk-apply' + (selectedJournalIds.length ? '' : ' disabled') + '>批量移动</button><button type="button" data-tracker-bulk-clear>取消选择</button></div>' : '';
    $('#trackerSubscriptions').classList.toggle('is-managing-categories', Boolean(state.trackerCategoryManageMode));
    function renderTrackerSubscription(item) {
      var status = item.last_error ? item.last_error : (item.last_success_at ? '更新于 ' + trackerDateLabel(item.last_success_at, true) : '等待首次检查');
      var checkedAt = Date.parse(item.last_checked_at || '');
      var checkStatus = checkedAt ? '最近检查 ' + trackerDateLabel(item.last_checked_at, true) : '尚未检查';
      if (item.last_error && checkedAt) checkStatus += ' · 下次重试 ' + trackerDateLabel(new Date(checkedAt + trackerRetryDelayMs(item, Date.now())).toISOString(), true);
      var isSelected = String(state.journalTrackerFilter) === String(item.id);
      var isBulkSelected = Boolean(state.trackerSelectedJournalIds && state.trackerSelectedJournalIds[String(item.id)]);
      var currentCategory = String(item.category || '').trim();
      var itemCategoryOptions = '<option value=""' + (!currentCategory ? ' selected' : '') + '>未分类</option>' + journalCategories.filter(function (category) { return category !== '未分类'; }).map(function (category) {
        return '<option value="' + escapeHtml(category) + '"' + (category === currentCategory ? ' selected' : '') + '>' + escapeHtml(category) + '</option>';
      }).join('') + '<option value="__new_category__">＋ 新建分类…</option>';
      return '<div class="tracker-subscription' + (item.last_error ? ' is-error' : '') + (isSelected ? ' is-selected' : '') + (isBulkSelected ? ' is-bulk-selected' : '') + '">' +
        (state.trackerCategoryManageMode ? '<label class="tracker-bulk-select"><input type="checkbox" data-tracker-bulk-select="' + escapeHtml(item.id) + '"' + (isBulkSelected ? ' checked' : '') + '><span class="sr-only">选择 ' + escapeHtml(item.journal_title || item.issn) + '</span></label>' : '') +
        '<button type="button" class="tracker-subscription-main" data-tracker-select-journal="' + escapeHtml(item.id) + '" aria-pressed="' + isSelected + '" aria-label="查看期刊：' + escapeHtml(item.journal_title || item.issn) + '" title="' + escapeHtml(item.journal_title || item.issn) + '">' +
        '<b title="' + escapeHtml(item.journal_title || item.issn) + '">' + escapeHtml(item.journal_title || item.issn) + '</b><span>' + escapeHtml(String(item.issn || '').indexOf('MANUAL-') === 0 ? (item.publisher === '按刊名检索' ? '按刊名检索' : '手动 RSS') : (item.issn || '')) + '</span></button>' +
        '<select class="tracker-subscription-category" data-tracker-category="' + escapeHtml(item.id) + '" aria-label="设置 ' + escapeHtml(item.journal_title || item.issn) + ' 的分类">' + itemCategoryOptions + '</select>' +
        '<em title="' + escapeHtml(status) + '">' + escapeHtml(status) + '</em>' +
        '<small class="tracker-check-time" title="' + escapeHtml(item.last_error ? status + '；按失败持续时间自动退避重试' : '期刊最近一次检查时间') + '">' + escapeHtml(checkStatus) + '</small>' +
        '<div class="tracker-feed-config"><input type="url" data-tracker-feed-input="' + escapeHtml(item.id) + '" value="' + escapeHtml(item.feed_url || '') + '" placeholder="官网 RSS / Atom 地址" aria-label="' + escapeHtml(item.journal_title || item.issn) + ' RSS 地址"><button type="button" data-tracker-feed-save="' + escapeHtml(item.id) + '">保存 RSS</button></div>' +
        '<button type="button" data-tracker-remove="' + escapeHtml(item.id) + '" title="停止追踪" aria-label="停止追踪 ' + escapeHtml(item.journal_title || item.issn) + '">×</button></div>';
    }
    $('#trackerSubscriptions').innerHTML = '<div class="tracker-category-toolbar">' + (state.trackerCategoryManageMode ? '勾选期刊后可批量移动；分类名称可重命名或删除。' : '可按分类整理和折叠追踪期刊。') + '</div>' + bulkTools + (subscriptions.length ? journalCategories.map(function (category) {
      var grouped = subscriptions.filter(function (item) { return (String(item.category || '').trim() || '未分类') === category; });
      var isCollapsed = Boolean(state.trackerJournalCategoryCollapsed[category]);
      var categoryActions = state.trackerCategoryManageMode && category !== '未分类' ? '<div class="tracker-journal-category-actions"><button type="button" data-tracker-category-rename="' + escapeHtml(category) + '">重命名</button><button type="button" data-tracker-category-delete="' + escapeHtml(category) + '">删除</button></div>' : '';
      return '<section class="tracker-journal-category"><div class="tracker-journal-category-heading"><button type="button" class="tracker-journal-category-toggle" data-tracker-category-toggle="' + escapeHtml(category) + '" aria-expanded="' + !isCollapsed + '"><span>' + escapeHtml(category) + '</span><b>' + grouped.length + '</b><span aria-hidden="true">' + (isCollapsed ? '▸' : '▾') + '</span></button>' + categoryActions + '</div><div class="tracker-journal-category-items"' + (isCollapsed ? ' hidden' : '') + '>' + grouped.map(renderTrackerSubscription).join('') + '</div></section>';
    }).join('') : '<div class="tracker-empty"><b>还没有追踪期刊</b><span>输入期刊名称搜索；添加后可在每本期刊下选择或新建分类。</span></div>');

    var select = $('#trackerJournalFilter');
    var selected = state.journalTrackerFilter;
    select.innerHTML = '<option value="all">全部期刊</option>' + subscriptions.map(function (item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.journal_title || item.issn) + '</option>'; }).join('');
    if (selected !== 'all' && subscriptions.some(function (item) { return String(item.id) === String(selected); })) select.value = selected;
    else { state.journalTrackerFilter = 'all'; select.value = 'all'; }

    var categoryCounts = {};
    articles.forEach(function (article) {
      var subscription = subscriptionById[String(article.subscription_id)] || {};
      var category = String(subscription.category || '').trim() || '未分类';
      if (!categoryCounts[category]) categoryCounts[category] = { total: 0, unread: 0 };
      categoryCounts[category].total += 1;
      if (article.is_read !== true) categoryCounts[category].unread += 1;
    });
    var categoryFilter = $('#trackerCategoryFilter');
    var selectedCategory = state.trackerJournalCategoryFilter;
    categoryFilter.innerHTML = '<option value="all">全部分类</option>' + journalCategories.map(function (category) {
      var counts = categoryCounts[category] || { total: 0, unread: 0 };
      return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + ' · ' + counts.total + ' 篇 / ' + counts.unread + ' 未读</option>';
    }).join('');
    if (selectedCategory !== 'all' && journalCategories.indexOf(selectedCategory) >= 0) categoryFilter.value = selectedCategory;
    else { state.trackerJournalCategoryFilter = 'all'; categoryFilter.value = 'all'; }

    var visible = trackerVisibleArticles();
    var visibleUnread = visible.filter(function (article) { return article.is_read !== true; });
    if (markAllReadButton) {
      markAllReadButton.disabled = visibleUnread.length === 0;
      markAllReadButton.textContent = '标为已读（' + visibleUnread.length + '）';
      markAllReadButton.title = visibleUnread.length ? '仅标记当前筛选范围内的 ' + visibleUnread.length + ' 篇未读文章' : '当前筛选范围没有未读文章';
    }
    var emptyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><circle cx="17" cy="17" r="4"/><path d="M20 20l2 2"/></svg>';
    function renderArticleCard(article) {
      var journal = subscriptionById[String(article.subscription_id)] || {};
      var authors = Array.isArray(article.authors) && article.authors.length ? article.authors.join('；') : '作者信息暂缺';
      var keywords = Array.isArray(article.keywords) ? article.keywords : [];
      var abstractText = article.abstract || '';
      var sourceUrl = article.url || (article.doi ? 'https://doi.org/' + article.doi : '');
      var isRead = article.is_read === true;
      var desktopImported = Boolean(trackerZoteroImported['desktop:' + (article.doi || article.id)]);
      return '<article class="tracker-article' + (isRead ? '' : ' is-unread') + '">' +
      '<div class="tracker-article-meta"><span class="tracker-article-journal">' + escapeHtml(journal.journal_title || '期刊') + '</span><span class="tracker-read-badge ' + (isRead ? 'is-read' : 'is-unread') + '">' + (isRead ? '已读' : '未读') + '</span><span>' + escapeHtml(article.publication_date || '日期暂缺') + '</span>' + (article.doi ? '<span>DOI ' + escapeHtml(article.doi) + '</span>' : '') + '</div>' +
        '<h4><button type="button" class="tracker-article-title" data-tracker-open-detail="' + escapeHtml(article.id) + '">' + escapeHtml(article.title || '未命名文章') + '</button></h4>' + trackerEasyScholarRankMarkup(journal) + '<p class="tracker-article-authors">' + escapeHtml(authors) + '</p>' +
        (keywords.length ? '<div class="tracker-keywords">' + keywords.map(function (keyword) { return '<span>' + escapeHtml(keyword) + '</span>'; }).join('') + '</div><div class="tracker-provenance">关键词来源：' + escapeHtml(article.keyword_source || '未标明') + '</div>' : '<div class="tracker-provenance">该数据源尚未提供关键词</div>') +
        '<div class="tracker-provenance">文章 / 元数据来源：' + escapeHtml((article.metadata_sources || []).join('、') || '未标明') + '</div>' +
        '<details' + (abstractText ? '' : ' disabled') + '><summary>' + (abstractText ? '查看摘要 · ' + escapeHtml(article.abstract_source || '元数据') : '摘要暂未公开') + '</summary>' + (abstractText ? '<p class="tracker-article-abstract">' + escapeHtml(abstractText) + '</p>' : '') + '</details>' +
        '<div class="tracker-article-actions">' + (sourceUrl ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener">打开原文</a>' : '') + '<button type="button" data-tracker-read-toggle="' + escapeHtml(article.id) + '" data-tracker-is-read="' + isRead + '">' + (isRead ? '标为未读' : '标为已读') + '</button><button type="button" data-tracker-save-ref="' + escapeHtml(article.id) + '">加入文献库</button><button type="button" data-tracker-zotero-desktop="' + escapeHtml(article.id) + '">' + (desktopImported ? '重新导入' : '导入Zotero') + '</button></div></article>';
    }
    function renderArticleGroup(key, label, items) {
      if (!items.length) return '';
      var collapsed = Boolean(state.trackerCollapsedGroups[key]);
      var sortMode = state.trackerArticleSorts[key] === 'oldest' ? 'oldest' : 'newest';
      var sortedItems = items.map(function (article, index) {
        var publishedAt = Date.parse(article.publication_date || '');
        return { article: article, index: index, publishedAt: Number.isFinite(publishedAt) ? publishedAt : null };
      }).sort(function (left, right) {
        if (left.publishedAt === null && right.publishedAt !== null) return 1;
        if (left.publishedAt !== null && right.publishedAt === null) return -1;
        if (left.publishedAt !== null && right.publishedAt !== null && left.publishedAt !== right.publishedAt) {
          return sortMode === 'oldest' ? left.publishedAt - right.publishedAt : right.publishedAt - left.publishedAt;
        }
        return left.index - right.index;
      }).map(function (item) { return item.article; });
      var pageSize = 15;
      var pageCount = Math.max(1, Math.ceil(sortedItems.length / pageSize));
      var currentPage = Math.max(1, Math.min(pageCount, Number(state.trackerArticlePages[key]) || 1));
      state.trackerArticlePages[key] = currentPage;
      var startIndex = (currentPage - 1) * pageSize;
      var pageItems = sortedItems.slice(startIndex, startIndex + pageSize);
      var pager = pageCount > 1 ? '<nav class="tracker-article-pager" aria-label="' + label + '分页"><button type="button" data-tracker-page="' + key + '" data-tracker-page-delta="-1"' + (currentPage <= 1 ? ' disabled' : '') + '>上一页</button><span>第 ' + currentPage + ' / ' + pageCount + ' 页 · ' + (startIndex + 1) + '–' + Math.min(startIndex + pageSize, sortedItems.length) + ' / ' + sortedItems.length + ' 篇</span><label>跳至 <input type="number" data-tracker-page-input="' + key + '" min="1" max="' + pageCount + '" step="1" value="' + currentPage + '" aria-label="跳转到' + label + '页码，最大 ' + pageCount + ' 页"> 页</label><button type="button" data-tracker-page-jump="' + key + '">跳转</button><button type="button" data-tracker-page="' + key + '" data-tracker-page-delta="1"' + (currentPage >= pageCount ? ' disabled' : '') + '>下一页</button></nav>' : '';
      return '<section class="tracker-article-group" data-tracker-group-section="' + key + '"><div class="tracker-article-group-header"><button type="button" class="tracker-article-group-toggle" data-tracker-group-toggle="' + key + '" aria-expanded="' + !collapsed + '"><span>' + label + '</span><b>' + sortedItems.length + '</b><span class="tracker-group-chevron" aria-hidden="true">' + (collapsed ? '▸' : '▾') + '</span></button><label class="tracker-article-sort">排序<select data-tracker-sort="' + key + '" aria-label="' + label + '排序"><option value="newest"' + (sortMode === 'newest' ? ' selected' : '') + '>最新优先</option><option value="oldest"' + (sortMode === 'oldest' ? ' selected' : '') + '>最早优先</option></select></label></div><div class="tracker-article-group-items"' + (collapsed ? ' hidden' : '') + '>' + pageItems.map(renderArticleCard).join('') + pager + '</div></section>';
    }
    if (visible.length) {
      var unreadArticles = visible.filter(function (article) { return article.is_read !== true; });
      var readArticles = visible.filter(function (article) { return article.is_read === true; });
      $('#trackerArticles').innerHTML = renderArticleGroup('unread', '未读文章', unreadArticles) + renderArticleGroup('read', '已读文章', readArticles);
    } else $('#trackerArticles').innerHTML = '<div class="tracker-empty">' + emptyIcon + '<b>' + (articles.length ? '没有匹配的文章' : '等待第一批最新文章') + '</b><span>' + (subscriptions.length ? '点击“立即检查更新”，系统会优先读取官网 RSS，并由 Semantic Scholar 与 Crossref 补充元数据。' : '先在左侧添加要追踪的期刊，首次添加后会立即抓取近期文章。') + '</span></div>';

    renderTrackerArticleDetail();

    var badge = $('#navTrackerBadge');
    badge.textContent = unreadCount;
    badge.hidden = !unreadCount || state.panel === 'journal-tracker';
  }

  function searchTrackerJournals(event) {
    event.preventDefault();
    var query = $('#trackerJournalQuery').value.trim();
    if (query.length < 2) { toast('请输入期刊名称或 ISSN'); return; }
    var formButton = $('#trackerSearchForm button');
    formButton.disabled = true; formButton.textContent = '查找中…';
    setTrackerStatus('', false);
    journalTrackerRequest({ action: 'search', query: query }).then(function (result) {
      var journals = Array.isArray(result.journals) ? result.journals : [];
      renderTrackerJournalCandidates(journals, query);
    }).catch(function (error) { setTrackerStatus((error && error.message) || '期刊查找失败', true); }).then(function () { formButton.disabled = false; formButton.textContent = '查找'; });
  }

  function renderTrackerJournalCandidates(journals, query) {
    var container = $('#trackerSearchResults');
    container.hidden = false;
    if (journals.length) {
      container.innerHTML = journals.map(function (journal) { var fullTitle = journal.title || journal.issn; return '<div class="tracker-search-result"><div><b title="' + escapeHtml(fullTitle) + '" aria-label="期刊全名：' + escapeHtml(fullTitle) + '">' + escapeHtml(fullTitle) + '</b><span>' + escapeHtml(journal.issn) + (journal.publisher ? ' · ' + escapeHtml(journal.publisher) : '') + '</span></div><button type="button" data-tracker-add="' + escapeHtml(journal.issn) + '" aria-label="追踪 ' + escapeHtml(fullTitle) + '">追踪</button></div>'; }).join('');
    } else if (query && /\p{Script=Han}/u.test(query)) {
      container.innerHTML = '<div class="tracker-search-result"><div><b title="' + escapeHtml(query) + '" aria-label="期刊全名：' + escapeHtml(query) + '">' + escapeHtml(query) + '</b><span>未找到期刊目录记录；可尝试按刊名检索 Crossref 文章，或填写官网 RSS / Atom。</span></div><button type="button" data-tracker-add-title="1" aria-label="按刊名追踪 ' + escapeHtml(query) + '">按刊名追踪</button></div>';
    } else {
      container.innerHTML = '<div class="tracker-empty"><b>没有找到期刊</b><span>请检查名称，或改用 ISSN 搜索。</span></div>';
    }
  }

  function addTrackerJournalDirect() {
    var query = $('#trackerJournalQuery').value.trim();
    if (query.length < 2) { toast('请输入期刊全名或 ISSN'); return; }
    var button = $('#trackerDirectAdd');
    button.disabled = true;
    button.textContent = '添加中…';
    setTrackerStatus('正在匹配期刊并开始获取近期文章…', false);
    var category = $('#trackerAddCategory').value;
    var addPayload = { action: 'add', query: query, issn: $('#trackerJournalIssn').value.trim(), feedUrl: $('#trackerFeedUrl').value.trim() };
    if (category !== '__default__' && category !== '__new_category__') addPayload.category = category;
    journalTrackerRequest(addPayload).then(function (result) {
      applyJournalTrackerData(result);
      $('#trackerSearchResults').hidden = true;
      $('#trackerJournalQuery').value = '';
      $('#trackerJournalIssn').value = '';
      $('#trackerFeedUrl').value = '';
      state.trackerAddCategory = '__default__';
      $('#trackerAddCategory').value = '__default__';
      setTrackerStatus(result.warning ? '订阅已保存，但首次检查未找到文章：' + result.warning : '', false);
      toast(result.warning ? '订阅已保存；可为该期刊补充官网 RSS' : '期刊已加入追踪，正在按设置自动更新');
    }).catch(function (error) {
      var message = (error && error.message) || '直接添加期刊失败';
      if (/多个期刊|相近期刊|候选列表/.test(message)) {
        journalTrackerRequest({ action: 'search', query: query }).then(function (result) {
          renderTrackerJournalCandidates(Array.isArray(result.journals) ? result.journals : [], query);
          setTrackerStatus('匹配到多个期刊，请按 ISSN 选择准确的那一本。', false);
        }).catch(function (searchError) { setTrackerStatus((searchError && searchError.message) || message, true); });
      } else setTrackerStatus(message, true);
    }).then(function () { button.disabled = false; button.textContent = '直接添加'; });
  }

  function addTrackerJournal(issn, button) {
    if (button) { button.disabled = true; button.textContent = '添加中…'; }
    setTrackerStatus('正在创建订阅并抓取近期文章，首次更新可能需要十几秒…', false);
    var feedUrl = $('#trackerFeedUrl').value.trim();
    var category = $('#trackerAddCategory').value;
    var addPayload = { action: 'add', issn: issn, feedUrl: feedUrl };
    if (category !== '__default__' && category !== '__new_category__') addPayload.category = category;
    journalTrackerRequest(addPayload).then(function (result) {
      applyJournalTrackerData(result);
      $('#trackerSearchResults').hidden = true;
      $('#trackerJournalQuery').value = '';
      $('#trackerJournalIssn').value = '';
      $('#trackerFeedUrl').value = '';
      state.trackerAddCategory = '__default__';
      $('#trackerAddCategory').value = '__default__';
      setTrackerStatus(result.warning ? '订阅已保存，但首次检查未找到文章：' + result.warning : '', false);
      toast(result.warning ? '订阅已保存；可为该期刊补充官网 RSS' : '期刊已加入每日追踪');
    }).catch(function (error) {
      setTrackerStatus((error && error.message) || '添加期刊失败', true);
      if (button) { button.disabled = false; button.textContent = '追踪'; }
    });
  }

  function saveTrackerFeed(id, button) {
    var input = $('[data-tracker-feed-input="' + CSS.escape(String(id)) + '"]');
    if (!input) return;
    var feedUrl = input.value.trim();
    button.disabled = true;
    button.textContent = '保存中…';
    journalTrackerRequest({ action: 'set-feed', id: id, feedUrl: feedUrl }).then(function (result) {
      applyJournalTrackerData(result);
      toast(feedUrl ? 'RSS 地址已保存并开始同步' : '已清除 RSS 地址，将使用 Crossref 后备');
    }).catch(function (error) {
      toast((error && error.message) || '保存 RSS 地址失败');
      button.disabled = false;
      button.textContent = '保存 RSS';
    });
  }

  function saveTrackerJournalCategory(id, category) {
    journalTrackerRequest({ action: 'set-category', id: id, category: category }).then(function (result) {
      applyJournalTrackerData(result);
      toast(category ? '期刊已归入「' + category + '」' : '期刊已移至未分类');
    }).catch(function (error) {
      renderJournalTracker();
      toast((error && error.message) || '保存期刊分类失败');
    });
  }

  function cleanTrackerCategoryName(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
  }

  function runTrackerCategoryAction(payload, successMessage) {
    journalTrackerRequest(payload).then(function (result) {
      state.trackerSelectedJournalIds = {};
      applyJournalTrackerData(result);
      toast(successMessage);
    }).catch(function (error) {
      toast((error && error.message) || '分类操作失败');
    });
  }

  function renameTrackerCategory(category) {
    var proposed = window.prompt('将分类「' + category + '」重命名为（最多 60 个字符）：', category);
    if (proposed === null) return;
    var nextName = cleanTrackerCategoryName(proposed);
    if (!nextName || nextName === '未分类' || nextName === '__new_category__') { toast('请输入有效的分类名称'); return; }
    if (nextName === category) return;
    var exists = (state.journalTracker.subscriptions || []).some(function (item) { return cleanTrackerCategoryName(item.category) === nextName; });
    if (exists && !confirm('分类「' + nextName + '」已存在。继续后会将两个分类合并，是否继续？')) return;
    runTrackerCategoryAction({ action: 'rename-category', from: category, to: nextName }, exists ? '分类已合并' : '分类已重命名');
  }

  function deleteTrackerCategory(category) {
    if (!confirm('删除分类「' + category + '」？其中的期刊不会删除，会移入“未分类”。')) return;
    runTrackerCategoryAction({ action: 'delete-category', category: category }, '分类已删除，期刊已移入未分类');
  }

  function applyTrackerBulkCategory() {
    var ids = Object.keys(state.trackerSelectedJournalIds || {}).filter(function (id) { return state.trackerSelectedJournalIds[id]; });
    if (!ids.length) { toast('请先选择期刊'); return; }
    var category = $('#trackerBulkCategory').value;
    if (category === '__new_category__') {
      var proposed = window.prompt('输入新的期刊分类名称（最多 60 个字符）：');
      if (proposed === null) return;
      category = cleanTrackerCategoryName(proposed);
      if (!category || category === '未分类' || category === '__new_category__') { toast('请输入有效的分类名称'); return; }
    }
    runTrackerCategoryAction({ action: 'set-categories', ids: ids, category: category }, category ? '已将 ' + ids.length + ' 本期刊移动到「' + category + '」' : '已将 ' + ids.length + ' 本期刊移入未分类');
  }

  function removeTrackerJournal(id) {
    var subscription = (state.journalTracker.subscriptions || []).filter(function (item) { return String(item.id) === String(id); })[0];
    if (!subscription || !confirm('停止追踪“' + (subscription.journal_title || subscription.issn) + '”？已抓取的该期刊文章也会删除。')) return;
    journalTrackerRequest({ action: 'remove', id: id }).then(function (result) { applyJournalTrackerData(result); toast('已停止追踪该期刊'); }).catch(function (error) { toast((error && error.message) || '删除失败'); });
  }

  function refreshJournalTracker() {
    if (state.journalTrackerRefreshingAll || state.journalTrackerRefreshingCategory || state.journalTrackerRetryingFailed) return;
    var button = $('#trackerRefresh');
    state.journalTrackerRefreshingAll = true;
    renderJournalTracker();
    button.disabled = true; button.textContent = '正在检查…';
    setTrackerStatus('正在逐个检查期刊更新并补齐摘要、主题词…', false);
    journalTrackerRequest({ action: 'refresh' }).then(function (result) {
      applyJournalTrackerData(result);
      var failed = (result.results || []).filter(function (item) { return !item.ok; }).length;
      setTrackerStatus(failed ? failed + ' 个期刊暂时抓取失败，其他期刊已完成更新。' : '', Boolean(failed));
      toast(failed ? '检查完成，部分期刊需稍后重试' : '文献追踪已更新');
    }).catch(function (error) { setTrackerStatus((error && error.message) || '检查更新失败', true); }).then(function () {
      state.journalTrackerRefreshingAll = false;
      renderJournalTracker();
    });
  }

  function refreshTrackerCategory() {
    var category = state.trackerJournalCategoryFilter;
    if (category === 'all' || state.journalTrackerRefreshingAll || state.journalTrackerRefreshingCategory || state.journalTrackerRetryingFailed) return;
    var subscriptions = (state.journalTracker.subscriptions || []).filter(function (item) { return (String(item.category || '').trim() || '未分类') === category && item.enabled !== false; });
    if (!subscriptions.length) { toast('该分类没有启用中的期刊'); return; }
    state.journalTrackerRefreshingCategory = category;
    renderJournalTracker();
    setTrackerStatus('正在检查“' + category + '”中的 ' + subscriptions.length + ' 本期刊…', false);
    journalTrackerRequest({ action: 'refresh-category', category: category }).then(function (result) {
      applyJournalTrackerData(result);
      var results = Array.isArray(result.results) ? result.results : [];
      var failed = results.filter(function (item) { return !item.ok; }).length;
      var succeeded = results.length - failed;
      setTrackerStatus('分类“' + category + '”检查完成：' + succeeded + ' 本成功' + (failed ? '，' + failed + ' 本失败' : '') + '。', Boolean(failed));
      toast(failed ? '分类检查完成，部分期刊稍后重试' : '分类“' + category + '”已更新');
    }).catch(function (error) {
      setTrackerStatus((error && error.message) || '分类检查更新失败', true);
    }).then(function () {
      state.journalTrackerRefreshingCategory = '';
      renderJournalTracker();
    });
  }

  function retryFailedTrackerJournals() {
    if (state.journalTrackerRefreshingAll || state.journalTrackerRefreshingCategory || state.journalTrackerRetryingFailed) return;
    var category = state.trackerJournalCategoryFilter;
    var journalId = state.journalTrackerFilter;
    var failedSubscriptions = (state.journalTracker.subscriptions || []).filter(function (item) {
      if (item.enabled === false || !item.last_error) return false;
      if (journalId !== 'all' && String(item.id) !== String(journalId)) return false;
      if (category !== 'all' && (String(item.category || '').trim() || '未分类') !== category) return false;
      return true;
    });
    if (!failedSubscriptions.length) { toast('当前范围没有需要重试的失败期刊'); return; }
    state.journalTrackerRetryingFailed = true;
    renderJournalTracker();
    var scopeLabel = journalId !== 'all'
      ? '当前期刊'
      : category !== 'all' ? '分类“' + category + '”' : '全部期刊';
    setTrackerStatus('正在重试' + scopeLabel + '中的 ' + failedSubscriptions.length + ' 本失败期刊…', false);
    var payload = { action: 'retry-failed', category: category === 'all' ? 'all' : category };
    if (journalId !== 'all') payload.journalId = journalId;
    journalTrackerRequest(payload).then(function (result) {
      applyJournalTrackerData(result);
      var results = Array.isArray(result.results) ? result.results : [];
      var failed = results.filter(function (item) { return !item.ok; }).length;
      var succeeded = results.length - failed;
      setTrackerStatus(results.length
        ? '失败期刊重试完成：' + succeeded + ' 本恢复' + (failed ? '，仍有 ' + failed + ' 本失败' : '') + '。'
        : '当前范围已没有需要重试的失败期刊。', Boolean(failed));
      toast(results.length ? (failed ? '重试完成，仍有期刊失败' : '失败期刊已恢复') : '当前范围没有需要重试的失败期刊');
    }).catch(function (error) {
      setTrackerStatus((error && error.message) || '重试失败期刊时出错', true);
    }).then(function () {
      state.journalTrackerRetryingFailed = false;
      renderJournalTracker();
    });
  }

  function saveTrackedArticleToLibrary(id) {
    var article = (state.journalTracker.articles || []).filter(function (item) { return String(item.id) === String(id); })[0];
    if (!article) return;
    var journal = trackerSubscriptionMap()[String(article.subscription_id)] || {};
    api('/api/references', { method: 'POST', body: JSON.stringify({ action: 'create' }) }).then(function (created) {
      if (!created.ok || !created.referenceLibrary || !created.referenceLibrary.items[0]) throw new Error(created.error || '无法新建文献');
      var referenceId = created.referenceLibrary.items[0].id;
      return api('/api/references', { method: 'POST', body: JSON.stringify({ action: 'save', id: referenceId, title: article.title, authors: (article.authors || []).join('；'), year: String(article.publication_date || '').slice(0, 4), type: '期刊论文', source: journal.journal_title || '', locator: '', doi: article.doi || '', url: article.url || '', tags: (article.keywords || []).join('，'), projectId: '', knowledgeDocId: '', notes: article.abstract || '' }) });
    }).then(function (saved) {
      if (!saved.ok) throw new Error(saved.error || '保存失败');
      state.referenceLibrary = saved.referenceLibrary;
      toast('已加入“文献与引用”');
    }).catch(function (error) { toast((error && error.message) || '加入文献库失败'); });
  }

  var trackerZoteroImportedKey = 'academic-workbench-zotero-imported-v1';
  var trackerZoteroImported = Object.create(null);
  var trackerZoteroBridgeChannel = 'academic-workbench-zotero-bridge-v1';
  var trackerZoteroBridgeRequests = Object.create(null);
  var trackerZoteroPendingImports = Object.create(null);
  var trackerZoteroPendingArticleId = '';
  var trackerZoteroPendingButton = null;
  try { trackerZoteroImported = JSON.parse(localStorage.getItem(trackerZoteroImportedKey) || '{}') || Object.create(null); } catch (_) {}
  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== location.origin || !event.data || event.data.channel !== trackerZoteroBridgeChannel || event.data.type !== 'result') return;
    var requestId = String(event.data.requestId || '');
    var pending = trackerZoteroBridgeRequests[requestId];
    if (!pending) return;
    clearTimeout(pending.timeout);
    delete trackerZoteroBridgeRequests[requestId];
    if (event.data.ok) pending.resolve(event.data.result || {});
    else pending.reject(new Error(event.data.error || 'Zotero 桌面端未能确认导入'));
  });
  function openTrackerZoteroSetup() { $('#trackerZoteroTestResult').textContent = ''; $('#trackerZoteroOverlay').hidden = false; }
  function closeTrackerZoteroSetup() { $('#trackerZoteroOverlay').hidden = true; }
  function trackerZoteroCreators(article) {
    return (Array.isArray(article.authors) ? article.authors : []).map(function (author) {
      var name = String(author || '').trim();
      if (!name) return null;
      var parts = name.split(/\s*,\s*/);
      if (parts.length > 1) return { creatorType: 'author', firstName: parts.slice(1).join(' '), lastName: parts[0] };
      var words = name.split(/\s+/);
      return words.length > 1 ? { creatorType: 'author', firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] } : { creatorType: 'author', name: name };
    }).filter(Boolean);
  }
  function createTrackedZoteroItem(article) {
    var journal = trackerSubscriptionMap()[String(article.subscription_id)] || {};
    return {
      itemType: 'journalArticle', title: article.title || '未命名文章', creators: trackerZoteroCreators(article),
      publicationTitle: journal.journal_title || '', date: article.publication_date || '', DOI: article.doi || '',
      url: article.url || (article.doi ? 'https://doi.org/' + article.doi : ''), abstractNote: article.abstract || '',
      tags: (Array.isArray(article.keywords) ? article.keywords : []).filter(Boolean).map(function (tag) { return { tag: String(tag) }; })
    };
  }
  function persistTrackerZoteroImport(storageKey, value) {
    trackerZoteroImported[storageKey] = value;
    try { localStorage.setItem(trackerZoteroImportedKey, JSON.stringify(trackerZoteroImported)); } catch (_) {}
  }
  function requestTrackerZoteroBridge(type, payload, timeoutMs) {
    var requestId = 'zotero-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () { delete trackerZoteroBridgeRequests[requestId]; reject(new Error('未检测到桌面桥接扩展。请先在 Chrome 加载 zotero-bridge 扩展，再刷新工作台。')); }, timeoutMs || 4000);
      trackerZoteroBridgeRequests[requestId] = { resolve: resolve, reject: reject, timeout: timeout };
      window.postMessage({ channel: trackerZoteroBridgeChannel, type: type, requestId: requestId, payload: payload || {} }, location.origin);
    });
  }
  function testTrackerZoteroConnection() {
    var result = $('#trackerZoteroTestResult');
    result.textContent = '正在检测…';
    requestTrackerZoteroBridge('ping', {}, 5000).then(function (response) {
      result.textContent = '已连接' + (response.version ? ' · Zotero ' + response.version : ' · Zotero Connector 正在运行');
    }).catch(function (error) { result.textContent = (error && error.message) || '连接失败'; });
  }
  function openTrackerZoteroTargetPicker(id, button) {
    var article = (state.journalTracker.articles || []).filter(function (item) { return String(item.id) === String(id); })[0];
    if (!article) return;
    if (trackerZoteroPendingImports[String(id)]) return;
    trackerZoteroPendingArticleId = String(id);
    trackerZoteroPendingButton = button || document.querySelector('[data-tracker-zotero-desktop="' + CSS.escape(String(id)) + '"]');
    if (trackerZoteroPendingButton) { trackerZoteroPendingButton.disabled = true; trackerZoteroPendingButton.textContent = '读取分类…'; }
    requestTrackerZoteroBridge('collections', {}, 7000).then(function (response) {
      var targets = Array.isArray(response.targets) ? response.targets : [];
      if (!targets.length) throw new Error('Zotero 没有返回可用文库或分类，请升级 Zotero Connector 后重试');
      var select = $('#trackerZoteroTargetSelect');
      select.innerHTML = targets.map(function (target) {
        var indent = '　'.repeat(Math.max(0, Math.min(8, Number(target.level || 0))));
        return '<option value="' + escapeHtml(target.id) + '">' + escapeHtml(indent + target.name) + '</option>';
      }).join('');
      var currentTarget = response.id !== undefined && response.id !== null ? 'C' + response.id : 'L' + response.libraryID;
      if (targets.some(function (target) { return String(target.id) === currentTarget; })) select.value = currentTarget;
      $('#trackerZoteroTargetOverlay').hidden = false;
      if (trackerZoteroPendingButton) { trackerZoteroPendingButton.disabled = false; trackerZoteroPendingButton.textContent = trackerZoteroImported['desktop:' + (article.doi || article.id)] ? '重新导入' : '导入Zotero'; }
    }).catch(function (error) {
      if (trackerZoteroPendingButton) { trackerZoteroPendingButton.disabled = false; trackerZoteroPendingButton.textContent = trackerZoteroImported['desktop:' + (article.doi || article.id)] ? '重新导入' : '导入Zotero'; }
      trackerZoteroPendingArticleId = ''; trackerZoteroPendingButton = null;
      toast((error && error.message) || '读取 Zotero 分类失败');
    });
  }
  function closeTrackerZoteroTargetPicker() {
    $('#trackerZoteroTargetOverlay').hidden = true;
    if (trackerZoteroPendingButton) trackerZoteroPendingButton.disabled = false;
    trackerZoteroPendingArticleId = ''; trackerZoteroPendingButton = null;
  }
  function confirmTrackerZoteroTarget() {
    var id = trackerZoteroPendingArticleId;
    var targetId = $('#trackerZoteroTargetSelect').value;
    var button = trackerZoteroPendingButton;
    var article = (state.journalTracker.articles || []).filter(function (item) { return String(item.id) === String(id); })[0];
    if (!article || !targetId) { toast('请选择 Zotero 文库或分类'); return; }
    $('#trackerZoteroTargetOverlay').hidden = true;
    trackerZoteroPendingArticleId = ''; trackerZoteroPendingButton = null;
    importTrackedArticleToZoteroDesktop(id, button, targetId);
  }
  function importTrackedArticleToZoteroDesktop(id, button, targetId) {
    var article = (state.journalTracker.articles || []).filter(function (item) { return String(item.id) === String(id); })[0];
    if (!article || trackerZoteroPendingImports[String(id)]) return;
    trackerZoteroPendingImports[String(id)] = true;
    var storageKey = 'desktop:' + (article.doi || article.id);
    var target = button || document.querySelector('[data-tracker-zotero-desktop="' + CSS.escape(String(id)) + '"]');
    if (target) { target.disabled = true; target.textContent = '发送中…'; }
    var articleItem = createTrackedZoteroItem(article);
    articleItem.id = 'academic-workbench-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    var connectorPayload = {
      items: [articleItem],
      uri: articleItem.url || 'https://silencelight-eco.github.io/academic-research-hub/',
      sessionID: 'academic-workbench-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
    };
    connectorPayload.target = targetId;
    requestTrackerZoteroBridge('import', connectorPayload, 20000).then(function (result) {
      persistTrackerZoteroImport(storageKey, { importedAt: new Date().toISOString(), status: 'confirmed', result: result });
      toast(result.collectionApplied === false ? '条目已导入 Zotero，但分类移动失败；请检查 Connector 版本后手动归类' : 'Zotero 桌面端已确认接收条目并归入所选分类');
      renderJournalTracker();
    }).catch(function (error) {
      if (target) { target.disabled = false; target.textContent = trackerZoteroImported[storageKey] ? '重新导入' : '导入Zotero'; }
      toast((error && error.message) || '桌面导入失败，请先测试本机连接');
    }).then(function () { delete trackerZoteroPendingImports[String(id)]; });
  }
  function handleTrackerArticleAction(event) {
    var readButton = event.target.closest('[data-tracker-read-toggle]');
    if (readButton) { setTrackedArticleRead(readButton.dataset.trackerReadToggle, readButton.dataset.trackerIsRead !== 'true', readButton); return; }
    var desktopButton = event.target.closest('[data-tracker-zotero-desktop]');
    if (desktopButton) { openTrackerZoteroTargetPicker(desktopButton.dataset.trackerZoteroDesktop, desktopButton); return; }
    var saveButton = event.target.closest('[data-tracker-save-ref]');
    if (saveButton) saveTrackedArticleToLibrary(saveButton.dataset.trackerSaveRef);
  }

  function saveTrackedArticleRead(id, isRead) {
    return journalTrackerRequest({ action: 'set-read', id: id, isRead: isRead }).then(function (result) {
      if (result.readStateVersion !== 1 || !(result.articles || []).some(function (article) { return String(article.id) === String(id) && article.is_read === isRead; })) {
        throw new Error('云端文献追踪函数尚未更新，阅读状态未保存。请在 Supabase 重新部署 journal-tracker 后重试。');
      }
      if (isRead) { state.trackerCollapsedGroups.read = true; try { localStorage.setItem('academic-workbench-tracker-collapsed-v1', JSON.stringify(state.trackerCollapsedGroups)); } catch (_) {} }
      applyJournalTrackerData(result);
      return result;
    });
  }

  function setTrackedArticleRead(id, isRead, button) {
    var previousText = button.textContent;
    button.disabled = true;
    button.textContent = '保存中…';
    saveTrackedArticleRead(id, isRead).then(function () {
      toast(isRead ? '已标记为已读' : '已标记为未读');
    }).catch(function (error) {
      button.disabled = false;
      button.textContent = previousText;
      toast((error && error.message) || '阅读状态保存失败');
    });
  }

  function markAllTrackedArticlesRead(button) {
    var selectedArticles = trackerVisibleArticles().filter(function (article) { return article.is_read !== true; });
    if (!selectedArticles.length) return;
    var scope = [];
    if (state.journalTrackerFilter !== 'all') {
      var selectedSubscription = (state.journalTracker.subscriptions || []).filter(function (item) { return String(item.id) === String(state.journalTrackerFilter); })[0];
      scope.push('期刊：' + (selectedSubscription ? selectedSubscription.journal_title || selectedSubscription.issn : '当前期刊'));
    } else if (state.trackerJournalCategoryFilter !== 'all') scope.push('分类：' + state.trackerJournalCategoryFilter);
    else scope.push('全部期刊');
    var query = (state.journalTrackerQuery || '').trim();
    if (query) scope.push('搜索词：' + query);
    if (state.journalTrackerReadFilter === 'unread') scope.push('仅未读');
    if (!confirm('将当前筛选范围内的 ' + selectedArticles.length + ' 篇未读文章标记为已读？\n范围：' + scope.join('；'))) return;
    button.disabled = true;
    button.textContent = '正在标记…';
    var selectedIds = selectedArticles.map(function (article) { return String(article.id); });
    journalTrackerRequest({ action: 'mark-selected-read', ids: selectedIds }).then(function (result) {
      var updatedArticles = result.articles || [];
      var selectedStillUnread = updatedArticles.some(function (article) { return selectedIds.indexOf(String(article.id)) >= 0 && article.is_read !== true; });
      if (result.readStateVersion !== 1 || selectedStillUnread) {
        throw new Error('云端文献追踪函数尚未更新，阅读状态未保存。请在 Supabase 重新部署 journal-tracker 后重试。');
      }
      state.trackerCollapsedGroups.read = true;
      try { localStorage.setItem('academic-workbench-tracker-collapsed-v1', JSON.stringify(state.trackerCollapsedGroups)); } catch (_) {}
      applyJournalTrackerData(result);
      toast('已将 ' + Number(result.updatedCount || 0) + ' 篇文章标记为已读');
    }).catch(function (error) {
      toast((error && error.message) || '批量标记失败');
    }).then(function () {
      var current = $('#trackerMarkAllRead');
      if (current) {
        var currentUnread = trackerVisibleArticles().filter(function (article) { return article.is_read !== true; }).length;
        current.disabled = currentUnread === 0;
        current.textContent = '标为已读（' + currentUnread + '）';
      }
    });
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 导航
    $$('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () { switchPanel(btn.dataset.panel); });
    });

    $('#trackerSearchForm').addEventListener('submit', searchTrackerJournals);
    $('#trackerDirectAdd').addEventListener('click', addTrackerJournalDirect);
    $('#trackerRefresh').addEventListener('click', refreshJournalTracker);
    $('#trackerRefreshCategory').addEventListener('click', refreshTrackerCategory);
    $('#trackerRetryFailed').addEventListener('click', retryFailedTrackerJournals);
    $('#trackerMarkAllRead').addEventListener('click', function () { markAllTrackedArticlesRead(this); });
    $('#trackerSearchResults').addEventListener('click', function (event) { if (event.target.closest('[data-tracker-add-title]')) { addTrackerJournalDirect(); return; } var button = event.target.closest('[data-tracker-add]'); if (button) addTrackerJournal(button.dataset.trackerAdd, button); });
    $('#trackerCategoryManageToggle').addEventListener('click', function () { state.trackerCategoryManageMode = !state.trackerCategoryManageMode; if (!state.trackerCategoryManageMode) state.trackerSelectedJournalIds = {}; renderJournalTracker(); });
    $('#trackerSubscriptions').addEventListener('click', function (event) {
      var renameButton = event.target.closest('[data-tracker-category-rename]');
      if (renameButton) { renameTrackerCategory(renameButton.dataset.trackerCategoryRename); return; }
      var deleteButton = event.target.closest('[data-tracker-category-delete]');
      if (deleteButton) { deleteTrackerCategory(deleteButton.dataset.trackerCategoryDelete); return; }
      if (event.target.closest('[data-tracker-bulk-apply]')) { applyTrackerBulkCategory(); return; }
      if (event.target.closest('[data-tracker-bulk-clear]')) { state.trackerSelectedJournalIds = {}; renderJournalTracker(); }
    });
    $('#trackerSubscriptions').addEventListener('change', function (event) {
      var checkbox = event.target.closest('[data-tracker-bulk-select]');
      if (!checkbox) return;
      if (checkbox.checked) state.trackerSelectedJournalIds[checkbox.dataset.trackerBulkSelect] = true;
      else delete state.trackerSelectedJournalIds[checkbox.dataset.trackerBulkSelect];
      renderJournalTracker();
    });
    $('#trackerSubscriptions').addEventListener('click', function (event) { var categoryToggle = event.target.closest('[data-tracker-category-toggle]'); if (categoryToggle) { var category = categoryToggle.dataset.trackerCategoryToggle; state.trackerJournalCategoryCollapsed[category] = !state.trackerJournalCategoryCollapsed[category]; try { localStorage.setItem('academic-workbench-journal-categories-collapsed-v1', JSON.stringify(state.trackerJournalCategoryCollapsed)); } catch (_) {} renderJournalTracker(); return; } var rankButton = event.target.closest('[data-tracker-journal-rank]'); if (rankButton) { queryTrackerJournalRank(rankButton.dataset.trackerJournalRank, rankButton); return; } var selectButton = event.target.closest('[data-tracker-select-journal]'); if (selectButton) { state.journalTrackerFilter = selectButton.dataset.trackerSelectJournal; state.trackerJournalCategoryFilter = 'all'; state.trackerArticlePages = { unread: 1, read: 1 }; renderJournalTracker(); $('#trackerArticles').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; } var saveButton = event.target.closest('[data-tracker-feed-save]'); if (saveButton) { saveTrackerFeed(saveButton.dataset.trackerFeedSave, saveButton); return; } var button = event.target.closest('[data-tracker-remove]'); if (button) removeTrackerJournal(button.dataset.trackerRemove); });
    $('#trackerSubscriptions').addEventListener('change', function (event) { var categorySelect = event.target.closest('[data-tracker-category]'); if (!categorySelect) return; var selectedCategory = categorySelect.value; if (selectedCategory === '__new_category__') { var name = window.prompt('输入新的期刊分类名称（最多 60 个字符）：'); if (name === null) { renderJournalTracker(); return; } selectedCategory = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60); if (!selectedCategory || selectedCategory === '未分类' || selectedCategory === '__new_category__') { renderJournalTracker(); toast('请输入有效的分类名称'); return; } } saveTrackerJournalCategory(categorySelect.dataset.trackerCategory, selectedCategory); });
    $('#trackerAddCategory').addEventListener('change', function () {
      var selectedCategory = this.value;
      if (selectedCategory === '__new_category__') {
        var proposed = window.prompt('输入新的期刊分类名称（最多 60 个字符）：');
        if (proposed === null) { state.trackerAddCategory = '__default__'; this.value = '__default__'; return; }
        selectedCategory = cleanTrackerCategoryName(proposed);
        if (!selectedCategory || selectedCategory === '未分类' || selectedCategory === '__default__' || selectedCategory === '__new_category__') {
          state.trackerAddCategory = '__default__';
          this.value = '__default__';
          toast('请输入有效的分类名称');
          return;
        }
        var existingOption = Array.from(this.options).some(function (option) { return option.value === selectedCategory; });
        if (!existingOption) {
          var newOption = document.createElement('option');
          newOption.value = selectedCategory;
          newOption.textContent = selectedCategory;
          this.insertBefore(newOption, this.options[this.options.length - 1]);
        }
      }
      state.trackerAddCategory = selectedCategory;
      this.value = selectedCategory;
    });
    $('#trackerArticles').addEventListener('click', function (event) { var jumpButton = event.target.closest('[data-tracker-page-jump]'); if (jumpButton) { var jumpGroup = jumpButton.dataset.trackerPageJump; if (jumpGroup === 'unread' || jumpGroup === 'read') { var pageInput = jumpButton.closest('.tracker-article-pager').querySelector('[data-tracker-page-input]'); var requestedPage = pageInput ? Number(pageInput.value) : 1; var matchedArticles = trackerVisibleArticles().filter(function (article) { return jumpGroup === 'read' ? article.is_read === true : article.is_read !== true; }); var maximumPage = Math.max(1, Math.ceil(matchedArticles.length / 15)); state.trackerArticlePages[jumpGroup] = Math.max(1, Math.min(maximumPage, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1)); renderJournalTracker(); var jumpSection = $('#trackerArticles').querySelector('[data-tracker-group-section="' + jumpGroup + '"]'); if (jumpSection) jumpSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } return; } var pageButton = event.target.closest('[data-tracker-page]'); if (pageButton) { var pageGroup = pageButton.dataset.trackerPage; if (pageGroup === 'unread' || pageGroup === 'read') { state.trackerArticlePages[pageGroup] = Math.max(1, (Number(state.trackerArticlePages[pageGroup]) || 1) + Number(pageButton.dataset.trackerPageDelta || 0)); renderJournalTracker(); var groupSection = $('#trackerArticles').querySelector('[data-tracker-group-section="' + pageGroup + '"]'); if (groupSection) groupSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } return; } var groupButton = event.target.closest('[data-tracker-group-toggle]'); if (groupButton) { var group = groupButton.dataset.trackerGroupToggle; state.trackerCollapsedGroups[group] = !state.trackerCollapsedGroups[group]; try { localStorage.setItem('academic-workbench-tracker-collapsed-v1', JSON.stringify(state.trackerCollapsedGroups)); } catch (_) {} renderJournalTracker(); return; } var rankButton = event.target.closest('[data-tracker-journal-rank]'); if (rankButton) { queryTrackerJournalRank(rankButton.dataset.trackerJournalRank, rankButton); return; } if (event.target.closest('[data-tracker-open-detail]')) { openTrackerArticleDetail(event.target.closest('[data-tracker-open-detail]').dataset.trackerOpenDetail); return; } handleTrackerArticleAction(event); });
    $('#trackerArticles').addEventListener('change', function (event) { var sortSelect = event.target.closest('[data-tracker-sort]'); if (!sortSelect) return; var sortGroup = sortSelect.dataset.trackerSort; if (sortGroup !== 'unread' && sortGroup !== 'read') return; state.trackerArticleSorts[sortGroup] = sortSelect.value === 'oldest' ? 'oldest' : 'newest'; state.trackerArticlePages[sortGroup] = 1; renderJournalTracker(); });
    $('#trackerArticles').addEventListener('keydown', function (event) { if (event.key !== 'Enter' || !event.target.closest('[data-tracker-page-input]')) return; event.preventDefault(); var pager = event.target.closest('.tracker-article-pager'); var jumpButton = pager && pager.querySelector('[data-tracker-page-jump]'); if (jumpButton) jumpButton.click(); });
    $('#trackerArticleDetail').addEventListener('click', function (event) { if (event.target.closest('[data-tracker-back-to-list]')) { closeTrackerArticleDetail(); return; } var rankButton = event.target.closest('[data-tracker-journal-rank]'); if (rankButton) { queryTrackerJournalRank(rankButton.dataset.trackerJournalRank, rankButton); return; } handleTrackerArticleAction(event); });
    $('#trackerEasyScholarSetup').addEventListener('click', openTrackerEasyScholarSettings);
    $('#trackerEasyScholarCancel').addEventListener('click', closeTrackerEasyScholarSettings);
    $('#trackerEasyScholarOverlay').addEventListener('click', function (event) { if (event.target === this) closeTrackerEasyScholarSettings(); });
    $('#trackerEasyScholarForm').addEventListener('submit', saveTrackerEasyScholarSettings);
    $('#trackerZoteroSetup').addEventListener('click', openTrackerZoteroSetup);
    $('#trackerZoteroTest').addEventListener('click', testTrackerZoteroConnection);
    $('#trackerZoteroCancel').addEventListener('click', closeTrackerZoteroSetup);
    $('#trackerZoteroOverlay').addEventListener('click', function (event) { if (event.target === this) closeTrackerZoteroSetup(); });
    $('#trackerZoteroTargetCancel').addEventListener('click', closeTrackerZoteroTargetPicker);
    $('#trackerZoteroTargetConfirm').addEventListener('click', confirmTrackerZoteroTarget);
    $('#trackerZoteroTargetOverlay').addEventListener('click', function (event) { if (event.target === this) closeTrackerZoteroTargetPicker(); });
    $('#trackerArticleSearch').addEventListener('input', function () { state.journalTrackerQuery = this.value; state.trackerArticlePages = { unread: 1, read: 1 }; renderJournalTracker(); });
    $('#trackerJournalFilter').addEventListener('change', function () { state.journalTrackerFilter = this.value; state.trackerJournalCategoryFilter = 'all'; state.trackerArticlePages = { unread: 1, read: 1 }; renderJournalTracker(); });
    $('#trackerCategoryFilter').addEventListener('change', function () { state.trackerJournalCategoryFilter = this.value; state.journalTrackerFilter = 'all'; state.trackerArticlePages = { unread: 1, read: 1 }; renderJournalTracker(); });
    $('#trackerReadFilter').addEventListener('change', function () { state.journalTrackerReadFilter = this.value; state.trackerArticlePages = { unread: 1, read: 1 }; if (this.value === 'read') state.trackerCollapsedGroups.read = false; if (this.value === 'unread') state.trackerCollapsedGroups.unread = false; renderJournalTracker(); });

    // 概览里的"查看全部"
    $$('.btn-goto').forEach(function (btn) {
      btn.addEventListener('click', function () { switchPanel(btn.dataset.goto); });
    });

    // 今日工作台：动态内容，用事件委托跳转面板
    var todayBoardEl = $('#todayBoard');
    if (todayBoardEl) {
      todayBoardEl.addEventListener('click', function (e) {
        var el = e.target.closest('[data-goto]');
        if (!el) return;
        switchPanel(el.dataset.goto);
      });
    }

    // 主题切换
    $('#themeToggle').addEventListener('click', toggleTheme);
    $('#themeSelect').addEventListener('change', function () { selectThemePalette(this.value); });
    $$('[data-theme-palette]').forEach(function (button) {
      button.addEventListener('click', function () { selectThemePalette(button.dataset.themePalette); });
    });
    $('#accountButton').addEventListener('click', function () { if (account) openAccountMenu(); else openAuth(); });
    $('#backupOpen').addEventListener('click', openBackupModal);
    $('#backupModalClose').addEventListener('click', closeBackupModal);
    $('#backupModalBackdrop').addEventListener('click', closeBackupModal);
    $('#backupExport').addEventListener('click', exportWorkspaceBackup);
    $('#backupImport').addEventListener('click', function () { $('#backupFileInput').click(); });
    $('#backupFileInput').addEventListener('change', importWorkspaceBackup);
    $('#syncConflictReload').addEventListener('click', useCloudWorkspace);
    $('#syncConflictKeepLocal').addEventListener('click', keepLocalWorkspace);
    window.addEventListener('academic-workspace-conflict', function (event) { showWorkspaceConflict(event.detail); });
    $('#versionHistoryClose').addEventListener('click', closeVersionHistory);
    $('#versionHistoryBackdrop').addEventListener('click', closeVersionHistory);
    $('#versionHistoryList').addEventListener('click', function (event) { var entry = event.target.closest('[data-version-index]'); if (entry) renderVersionHistory(Number(entry.dataset.versionIndex)); });
    $('#versionHistoryRestore').addEventListener('click', restoreSelectedVersion);
    $('#authClose').addEventListener('click', closeAuth);
    $('#authModalBackdrop').addEventListener('click', closeAuth);
    $('#authSwitch').addEventListener('click', toggleAuthMode);
    $('#authForgot').addEventListener('click', requestPasswordReset);
    $('#authForm').addEventListener('submit', submitAuth);
    $('#changePasswordButton').addEventListener('click', openPasswordModal);
    $('#logoutButton').addEventListener('click', logoutAccount);
    $('#passwordModalClose').addEventListener('click', closePasswordModal);
    $('#passwordModalBackdrop').addEventListener('click', closePasswordModal);
    $('#passwordForm').addEventListener('submit', submitPasswordChange);
    document.addEventListener('click', function (event) { var menu = $('#accountMenu'); if (menu && !menu.hidden && !menu.contains(event.target) && !$('#accountButton').contains(event.target)) closeAccountMenu(); });
    window.addEventListener('academic-password-recovery', openPasswordModal);
    if (window.__academicPasswordRecovery) openPasswordModal();
    $('#progressModalClose').addEventListener('click', closeProgressModal);
    $('#progressModalBackdrop').addEventListener('click', closeProgressModal);
    $('#progressForm').addEventListener('submit', saveStudyDates);

    // 天气：点击右上角角标打开模态框
    var weatherChip = $('#weatherChip');
    if (weatherChip) {
      weatherChip.style.cursor = 'pointer';
      weatherChip.addEventListener('click', openWeatherModal);
    }
    // 天气模态框：关闭按钮 + 遮罩
    var weatherModalClose = $('#weatherModalClose');
    if (weatherModalClose) weatherModalClose.addEventListener('click', closeWeatherModal);
    var weatherModalOverlay = $('#weatherModalOverlay');
    if (weatherModalOverlay) weatherModalOverlay.addEventListener('click', closeWeatherModal);
    // ESC 键关闭模态框
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeWeatherModal();
    });

    // 待办添加
    $('#todoAddBtn').addEventListener('click', addTodo);
    $('#todoInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addTodo(); });

    // 待办列表事件委托
    $('#todoBoard').addEventListener('click', function (e) {
      // 分组折叠
      var groupHeader = e.target.closest('.todo-group-header');
      if (groupHeader) {
        var group = groupHeader.closest('.todo-group');
        if (group) {
          group.classList.toggle('collapsed');
          if (group.dataset.group === 'done') {
            state.todoDoneCollapsed = group.classList.contains('collapsed');
          }
        }
        return;
      }
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var id = parseInt(btn.dataset.id);
      if (btn.dataset.action === 'toggle') toggleTodo(id);
      else if (btn.dataset.action === 'delete') deleteTodo(id);
      else if (btn.dataset.action === 'pomo') startPomo(id);
    });

    // 日志类型筛选
    $('#journalTypeFilters').addEventListener('click', function (e) {
      var filter = e.target.closest('.journal-filter');
      if (!filter) return;
      state.journalTypeFilter = filter.dataset.type;
      renderJournal();
    });

    // 日志删除（事件委托）
    $('#journalTimeline').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="delete-journal"]');
      if (!btn) return;
      deleteJournal(parseInt(btn.dataset.id));
    });

    // 日志 → 摘要卡片互链跳转（事件委托）
    $('#journalTimeline').addEventListener('click', function (e) {
      var link = e.target.closest('.journal-card-link');
      if (!link) return;
      jumpToCard(link.dataset.cardTitle);
    });

    // 论文添加
    $('#pubAddBtn').addEventListener('click', addPublication);
    $('#phdConfigureBtn').addEventListener('click', configureStudyProgress);
    $('#gradCJrnlAchieved').addEventListener('change', saveGraduationCounts);
    $('#gradCJrnlRequired').addEventListener('change', saveGraduationCounts);

    $('#kbNewDoc').addEventListener('click', newKnowledgeDoc);
    $('#kbNewFolder').addEventListener('click', newKnowledgeFolder);
    $('#noteTitle').addEventListener('input', function () { renderNotePreview(); queueNoteAutoSave(); });
    $('#noteEditor').addEventListener('input', function () { renderNotePreview(); queueNoteAutoSave(); });
    bindNoteTextColor();
    $('#noteStyle').addEventListener('change', function () { renderNotePreview(); queueNoteAutoSave(); });
    $('#noteSave').addEventListener('click', saveNoteStudio);
    $('#noteHistory').addEventListener('click', function () { openVersionHistory('note'); });
    $('#noteCopy').addEventListener('click', copyNoteForWechat);
    $('#noteNew').addEventListener('click', newNoteStudio);
    $('#noteTrash').addEventListener('click', function () { state.noteTrashOpen = !state.noteTrashOpen; renderNoteStudio(); });
    document.addEventListener('click', function (e) { var clearTrash = e.target.closest('[data-empty-trash]'); if (clearTrash) emptyRecycleBin(clearTrash.dataset.emptyTrash); });
    $('#noteDelete').addEventListener('click', trashNoteStudio);
    $('#noteList').addEventListener('click', function (e) { var restore = e.target.closest('[data-note-restore]'); if (restore) { restoreNoteStudio(restore.dataset.noteRestore); return; } var purge = e.target.closest('[data-note-purge]'); if (purge) { purgeNoteStudio(purge.dataset.notePurge); return; } var note = e.target.closest('[data-note-id]'); if (!note) return; state.noteId = Number(note.dataset.noteId); renderNoteStudio(); });
    $('#promptNew').addEventListener('click', newPrompt);
    $('#promptSave').addEventListener('click', savePrompt);
    $('#promptHistory').addEventListener('click', function () { openVersionHistory('prompt'); });
    $('#promptCopy').addEventListener('click', copyPromptResult);
    $('#promptDelete').addEventListener('click', trashPrompt);
    $('#promptTrash').addEventListener('click', function () { state.promptTrashOpen = !state.promptTrashOpen; renderPromptLibrary(); });
    ['promptTitle', 'promptCategory', 'promptTags', 'promptBody'].forEach(function (id) { $('#' + id).addEventListener('input', function () { renderPromptResult(); queuePromptAutoSave(); }); });
    $('#promptVariables').addEventListener('input', renderPromptResult);
    $('#promptList').addEventListener('click', function (e) { var restore = e.target.closest('[data-prompt-restore]'); if (restore) { restorePrompt(restore.dataset.promptRestore); return; } var purge = e.target.closest('[data-prompt-purge]'); if (purge) { purgePrompt(purge.dataset.promptPurge); return; } var category = e.target.closest('[data-prompt-category]'); if (category) { state.promptCategoryFilter = category.dataset.promptCategory; var first = (state.promptLibrary.prompts || []).filter(function (item) { return state.promptCategoryFilter === 'all' || (item.category || '通用') === state.promptCategoryFilter; })[0]; state.promptId = first ? first.id : null; renderPromptLibrary(); return; } var prompt = e.target.closest('[data-prompt-id]'); if (!prompt) return; state.promptId = Number(prompt.dataset.promptId); renderPromptLibrary(); });
    $('#projectNew').addEventListener('click', newResearchProject);
    $('#projectSave').addEventListener('click', saveResearchProject);
    $('#projectDelete').addEventListener('click', trashResearchProject);
    $('#projectTrash').addEventListener('click', function () { state.projectTrashOpen = !state.projectTrashOpen; renderResearchProjects(); });
    $('#projectList').addEventListener('click', function (e) { var restore = e.target.closest('[data-project-restore]'); if (restore) { restoreResearchProject(restore.dataset.projectRestore); return; } var purge = e.target.closest('[data-project-purge]'); if (purge) { purgeResearchProject(purge.dataset.projectPurge); return; } var category = e.target.closest('[data-project-category]'); if (category) { state.projectCategoryFilter = category.dataset.projectCategory; var first = (state.researchProjects.projects || []).filter(function (item) { return state.projectCategoryFilter === 'all' || ((item.category || '通用').trim() || '通用') === state.projectCategoryFilter; })[0]; state.projectId = first ? first.id : null; renderResearchProjects(); return; } var project = e.target.closest('[data-project-id]'); if (!project) return; state.projectId = Number(project.dataset.projectId); renderResearchProjects(); });
    ['projectTitle', 'projectCategory', 'projectStatus', 'projectProgress', 'projectStart', 'projectEnd', 'projectGoal', 'projectMembers', 'projectMilestones', 'projectResources'].forEach(function (id) { $('#' + id).addEventListener('input', function () { renderProjectSummary(); queueResearchProjectAutoSave(); }); });
    $('#projectStatus').addEventListener('change', function () { renderProjectSummary(); queueResearchProjectAutoSave(); });
    $('#refNew').addEventListener('click', newReference);
    $('#refSave').addEventListener('click', saveReference);
    $('#refDelete').addEventListener('click', trashReference);
    $('#refTrash').addEventListener('click', function () { state.referenceTrashOpen = !state.referenceTrashOpen; renderReferenceLibrary(); });
    $('#refImport').addEventListener('click', importReferenceBibtex);
    $('#refFetchDoi').addEventListener('click', fetchReferenceDoi);
    $('#refCopyCitation').addEventListener('click', function () { copyReference(referenceCitation(activeReference()), '引用'); });
    $('#refCopyBibtex').addEventListener('click', function () { copyReference(referenceBibtex(activeReference()), 'BibTeX'); });
    $('#refSearch').addEventListener('input', function () { state.referenceQuery = this.value; renderReferenceLibrary(); });
    $('#refTypeFilter').addEventListener('change', function () { state.referenceTypeFilter = this.value; renderReferenceLibrary(); });
    $('#refList').addEventListener('click', function (e) { var restore = e.target.closest('[data-ref-restore]'); if (restore) { restoreReference(restore.dataset.refRestore); return; } var purge = e.target.closest('[data-ref-purge]'); if (purge) { purgeReference(purge.dataset.refPurge); return; } var item = e.target.closest('[data-ref-id]'); if (!item) return; state.referenceId = item.dataset.refId; renderReferenceLibrary(); });
    referenceFields().forEach(function (id) { $('#' + id).addEventListener('input', queueReferenceAutoSave); $('#' + id).addEventListener('change', queueReferenceAutoSave); });
    $('#kbTrashToggle').addEventListener('click', function () { state.kbTrashOpen = !state.kbTrashOpen; state.kbDraft = null; renderKnowledgeBase(); });
    $('#kbFolders').addEventListener('click', function (e) { var remove = e.target.closest('[data-kb-delete-folder]'); if (remove) { deleteKnowledgeFolder(remove.dataset.kbDeleteFolder); return; } var item = e.target.closest('[data-kb-folder]'); if (!item) return; state.kbFolderId = item.dataset.kbFolder; renderKnowledgeBase(); });
    $('#kbDocs').addEventListener('click', function (e) { var restore = e.target.closest('[data-kb-restore-trash]'); if (restore) { restoreKnowledgeTrash(restore.dataset.kbRestoreTrash); return; } var purge = e.target.closest('[data-kb-purge-trash]'); if (purge) { purgeKnowledgeTrash(purge.dataset.kbPurgeTrash); return; } var remove = e.target.closest('[data-kb-delete-doc]'); if (remove) { deleteKnowledgeDoc(remove.dataset.kbDeleteDoc); return; } var heading = e.target.closest('[data-kb-heading]'); if (heading) { state.kbDocId = Number(heading.dataset.kbDoc); state.kbDraft = null; state.kbHeadingTarget = heading.dataset.kbHeading; state.kbEditorMode = 'rich'; renderKnowledgeBase(); setTimeout(scrollToKnowledgeHeading, 0); return; } var item = e.target.closest('[data-kb-doc]'); if (!item) return; state.kbDocId = Number(item.dataset.kbDoc); state.kbDraft = null; renderKnowledgeBase(); });
    $('#kbDocs').addEventListener('dragstart', function (e) { var item = e.target.closest('[data-kb-doc]'); if (!item) return; state.kbDraggingDocId = Number(item.dataset.kbDoc); item.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
    $('#kbDocs').addEventListener('dragend', function () { state.kbDraggingDocId = null; $$('.kb-doc.is-dragging').forEach(function (item) { item.classList.remove('is-dragging'); }); });
    $('#kbDocs').addEventListener('dragover', function (e) { if (state.kbDraggingDocId) e.preventDefault(); });
    $('#kbDocs').addEventListener('drop', function (e) { var target = e.target.closest('[data-kb-doc]'); if (!target || !state.kbDraggingDocId) return; e.preventDefault(); reorderKnowledgeDoc(state.kbDraggingDocId, Number(target.dataset.kbDoc)); });
    $('#kbEditor').addEventListener('click', function (e) { var history = e.target.closest('[data-version-history]'); if (history) { openVersionHistory('knowledge'); return; } var action = e.target.closest('[data-kb-command]'); if (action) { runKnowledgeRichCommand(action.dataset.kbCommand); return; } var toggle = e.target.closest('[data-kb-mode]'); if (!toggle) return; state.kbDraft = readKnowledgeDraft(); state.kbEditorMode = toggle.dataset.kbMode; renderKnowledgeBase(); });
    $('#kbEditor').addEventListener('input', function (e) { if (e.target.closest('#kbDocTitle, #kbDocContent, #kbRichEditor')) queueKnowledgeAutoSave(); });
    $('#kbEditor').addEventListener('change', function (e) { if (e.target.closest('#kbDocFolder')) queueKnowledgeAutoSave(); });
    window.addEventListener('message', function (event) {
      if (event.origin !== location.origin || !event.data) return;
      if (event.data.type === 'academic-research-hub-open-knowledge-base') { switchPanel('knowledge-base'); return; }
      if (event.data.type === 'academic-research-hub-request-data-code-migration' && event.source) {
        api('/api/data-code-library').then(function (res) {
          if (!res.ok) return;
          event.source.postMessage({ type: 'academic-research-hub-data-code-migration', library: res.dataCodeLibrary || { items: [], trash: [] } }, event.origin);
        }).catch(function () {});
      }
    });
    window.addEventListener('pagehide', flushAutoSavesOnPageHide);

    // 论文删除（事件委托）
    $('#pubList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="delete-pub"]');
      if (!btn) return;
      deletePublication(parseInt(btn.dataset.id));
    });

    $$('.academic-record-grid').forEach(function (grid) { grid.addEventListener('click', function (e) {
      var add = e.target.closest('[data-academic-add]');
      if (add) { academicEditorKind = add.dataset.academicAdd || ''; renderAcademicRecords(); return; }
      var cancel = e.target.closest('[data-academic-cancel]');
      if (cancel) { academicEditorKind = ''; renderAcademicRecords(); return; }
      var remove = e.target.closest('[data-academic-delete]');
      if (remove) deleteAcademicRecord(parseInt(remove.dataset.academicDelete));
    }); grid.addEventListener('dblclick', function (e) {
      if (e.target.closest('button, input, textarea, select, form')) return;
      var card = e.target.closest('.academic-record-card');
      if (!card) return;
      academicEditorKind = card.dataset.academicKind || '';
      renderAcademicRecords();
    }); grid.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-academic-form]');
      if (!form) return;
      e.preventDefault();
      saveAcademicRecord(form);
    }); });

    // 资讯 tab
    $('#newsTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.news-tab');
      if (!tab) return;
      state.activeNewsTab = tab.dataset.tab;
      renderNews();
    });

    // 文件夹点击
    $('#sectionsGrid').addEventListener('click', function (e) {
      var card = e.target.closest('.section-card');
      if (!card) return;
      openFolder(card.dataset.path);
    });

    // 日志添加
    $('#journalAddBtn').addEventListener('click', addJournal);

    // 刷新资讯
    var refreshBtn = $('#refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshNews);

    // 资讯：开放获取条目「送转写」（捕获阶段拦截，避免触发外链跳转）
    var newsListEl = $('#newsList');
    if (newsListEl) {
      newsListEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.news-transcribe-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        sendToTranscribe(btn.dataset.pdf, btn.dataset.title || '');
      }, true);
      // 资讯：一键轻收录（只存元数据，不转写）
      newsListEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.news-quick-add-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        quickAddFromNews(btn.dataset);
      }, true);
    }

    // 资讯：只看与研究领域相关
    var relToggle = $('#newsRelToggle');
    if (relToggle) {
      relToggle.addEventListener('click', function () {
        state.relevanceOnly = !state.relevanceOnly;
        this.classList.toggle('active', state.relevanceOnly);
        renderNews();
      });
    }

    // ===== 摘要卡片：勾选模式 / 浮动操作条 / BibTeX / 综述模态 =====
    var selToggle = $('#summarySelectToggle');
    if (selToggle) {
      selToggle.addEventListener('click', function () { setSumSelectMode(!sumSelectMode); });
    }
    var actClear = $('#sumActionClear');
    if (actClear) actClear.addEventListener('click', function () { sumSelected = []; renderSummaryCards(); updateSumActionBar(); });
    var actBib = $('#sumActionBib');
    if (actBib) actBib.addEventListener('click', exportBibtex);
    var bibBtn = $('#summaryBibBtn');
    if (bibBtn) bibBtn.addEventListener('click', exportBibtex);
    var actReview = $('#sumActionReview');
    if (actReview) actReview.addEventListener('click', openReviewModal);
    var rvClose = $('#reviewModalClose');
    if (rvClose) rvClose.addEventListener('click', closeReviewModal);
    var rvOverlay = $('#reviewModalOverlay');
    if (rvOverlay) rvOverlay.addEventListener('click', closeReviewModal);
    var rvRun = $('#reviewRunBtn');
    if (rvRun) {
      rvRun.addEventListener('click', runReview);
      $('#reviewTopicInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') runReview();
      });
    }
    var rvCopy = $('#reviewCopyBtn');
    if (rvCopy) {
      rvCopy.addEventListener('click', function () {
        if (!reviewMarkdown) return;
        navigator.clipboard.writeText(reviewMarkdown).then(function () { toast('综述草稿已复制'); },
          function () { toast('复制失败，请手动选择文本'); });
      });
    }
    var rvDl = $('#reviewDownloadBtn');
    if (rvDl) {
      rvDl.addEventListener('click', function () {
        if (reviewMarkdown) downloadTextFile(reviewMarkdown, '综述草稿.md');
      });
    }

    // ===== 专注浮条（其他面板也能看到正在跑的一轮）=====
    var pomoPause = $('#pomoPauseBtn');
    if (pomoPause) {
      pomoPause.addEventListener('click', function (e) {
        e.stopPropagation();
        if (focusState.paused) focusResume(); else focusPause();
      });
    }
    var pomoStop = $('#pomoStopBtn');
    if (pomoStop) {
      pomoStop.addEventListener('click', function (e) { e.stopPropagation(); focusGiveUp(); });
    }
    // 点浮条空白处 → 跳到专注面板
    var pomoTimer = $('#pomoTimer');
    if (pomoTimer) {
      pomoTimer.addEventListener('click', function () { switchPanel('focus'); });
    }

    // ===== 专注面板 =====
    var focusStartBtn = $('#focusStartBtn');
    if (focusStartBtn) {
      focusStartBtn.addEventListener('click', function () {
        // 完成态的按钮承担「再来一轮」：先清掉完成态再开始
        if (focusState.done) { resetFocusState(); focusRenderAll(); }
        focusStart();
      });
    }
    var focusPauseBtn = $('#focusPauseBtn');
    if (focusPauseBtn) {
      focusPauseBtn.addEventListener('click', function () {
        if (focusState.paused) focusResume(); else focusPause();
      });
    }
    var focusGiveUpBtn = $('#focusGiveUpBtn');
    if (focusGiveUpBtn) focusGiveUpBtn.addEventListener('click', focusGiveUp);

    var focusPresets = $('#focusPresets');
    if (focusPresets) {
      focusPresets.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-preset]');
        if (!btn) return;
        if (focusIsActive()) { toast('这一轮进行中，结束后再改时长'); return; }
        focusPreset = parseInt(btn.dataset.preset, 10) || 25;
        try { localStorage.setItem(FOCUS_PRESET_KEY, String(focusPreset)); } catch (err) {}
        if (!focusState.done) { focusState.totalSec = focusPreset * 60; focusState.leftMs = focusPreset * 60000; }
        focusRenderAll();
      });
    }

    var focusNext = $('#focusNext');
    if (focusNext) {
      focusNext.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-focus-next]');
        if (!btn) return;
        var act = btn.dataset.focusNext;
        if (act === 'dismiss') { resetFocusState(); focusRenderAll(); return; }
        var wasBreak = focusState.mode === 'break';
        resetFocusState();
        focusRenderAll();
        if (act === 'break') focusBegin('break');
        else if (act === 'again') focusStart();
        if (wasBreak && act === 'again') toast('开始专注 ' + focusPreset + ' 分钟');
      });
    }

    // ===== 标签 AI 建议 =====
    var tagAiBtn = $('#summaryTagAiBtn');
    if (tagAiBtn) tagAiBtn.addEventListener('click', suggestSummaryTags);
    var tagSuggest = $('#summaryTagSuggest');
    if (tagSuggest) {
      tagSuggest.addEventListener('click', function (e) {
        var chip = e.target.closest('.sum-tag-suggest-chip');
        if (chip) { toggleSuggestChip(parseInt(chip.dataset.si, 10)); return; }
        if (e.target.closest('#sumTagAdoptBtn')) { adoptSuggestedTags(); return; }
        if (e.target.closest('#sumTagSuggestClose')) { closeTagSuggest(); }
      });
    }

    // ===== 综述引用 [n] 点击 → 跳原文卡片 =====
    var rvBody = $('#reviewModalBody');
    if (rvBody) {
      rvBody.addEventListener('click', function (e) {
        var a = e.target.closest('.review-cite');
        if (!a) return;
        var cid = a.dataset.cardId;
        if (!cid) return;
        closeReviewModal();
        switchPanel('summaries');
        openSummaryDetail(cid);
      });
    }

    // 文献工具子标签页
    $('#litTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.lit-tab');
      if (!tab) return;
      state.activeLitTab = tab.dataset.lit;
      $$('.lit-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      $$('.lit-subpanel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'lit-' + state.activeLitTab);
      });
      if (state.activeLitTab === 'arxiv' && !state.lit.arxiv) loadArxiv();
      staggerCards('literature');
    });

    // 期刊筛选
    $('#journalFilters').addEventListener('click', function (e) {
      var btn = e.target.closest('.journal-filter');
      if (!btn) return;
      state.journalFilter = btn.dataset.filter;
      renderJournalFilters();
      renderJournals();
    });

    // 术语搜索
    $('#glossarySearch').addEventListener('input', function (e) {
      state.glossaryQuery = e.target.value;
      renderGlossary();
    });

    // 检索式复制
    $('#queryList').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-copy');
      if (!btn) return;
      var idx = parseInt(btn.dataset.query);
      var q = state.lit.queries.items[idx];
      if (q && q.query) {
        navigator.clipboard.writeText(q.query).then(function () {
          toast('检索式已复制');
        }).catch(function () {
          // 降级：用 textarea
          var ta = document.createElement('textarea');
          ta.value = q.query;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast('检索式已复制');
        });
      }
    });

    // arXiv 追踪刷新
    $('#arxivRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadArxiv(true).then(function () {
        btn.classList.remove('loading');
        toast('arXiv 列表已刷新');
      });
    });

    // 前沿瞭望：列表点击 / 返回 / 刷新 / 打开归档目录
    $('#frontierList').addEventListener('click', function (e) {
      var item = e.target.closest('.hs-item');
      if (!item) return;
      openFrontier(item.dataset.file);
    });
    $('#frontierBackBtn').addEventListener('click', closeFrontier);
    $('#frontierRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadFrontier().then(function () {
        btn.classList.remove('loading');
        toast('前沿瞭望归档已刷新');
      });
    });
    $('#frontierFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/frontier' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });

    // 热点日报：列表点击 / 返回 / 刷新 / 打开归档目录
    $('#hotspotList').addEventListener('click', function (e) {
      var item = e.target.closest('.hs-item');
      if (!item) return;
      openHotspot(item.dataset.file);
    });
    $('#hotspotBackBtn').addEventListener('click', closeHotspot);
    $('#hotspotRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadHotspots().then(function () {
        btn.classList.remove('loading');
        toast('热点日报归档已刷新');
      });
    });
    $('#hotspotFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/hotspots' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });

    // ===== 摘要卡片库 =====
    $$('.sum-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.sum-filter-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        summaryFilter = this.dataset.filter;
        loadSummaryCards();
      });
    });
    $('#summaryRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadSummaryCards();
      setTimeout(function () { btn.classList.remove('loading'); toast('摘要卡片已刷新'); }, 500);
    });
    $('#summaryFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/summaries' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });

    // ===== 译文库 =====
    $('#transFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/translations' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });
    $('#transRefreshBtn').addEventListener('click', function () {
      transLoaded = false;
      loadTranslations(true);
      toast('已刷新译文列表');
    });
    $('#transSearch').addEventListener('input', function () {
      transQuery = this.value || '';
      renderTranslations();
    });
    $('#transBackBtn').addEventListener('click', closeTranslationDetail);
    $('#transDeleteBtn').addEventListener('click', deleteTranslation);
    $('#pdfTransSaveBtn').addEventListener('click', saveCurrentTranslation);

    // ===== 原文精读（PDF 面板的「精读」标签）=====
    $('#pdfReadStartBtn').addEventListener('click', startPdfReading);
    $('#pdfReadCancelBtn').addEventListener('click', cancelPdfReading);
    $('#pdfReadRetryBtn').addEventListener('click', function () {
      if (readTaskState.timer) { toast('正在生成中，等它跑完或先取消'); return; }
      startPdfReading();
    });
    $('#readTaskCancel').addEventListener('click', cancelReadTask);
    $('#pdfReadCopyBtn').addEventListener('click', copyCurrentReading);

    // ===== 精读库面板 =====
    $('#readRefreshBtn').addEventListener('click', function () {
      readLoaded = false;
      loadReadings(true);
      toast('已刷新精读列表');
    });
    $('#readSearch').addEventListener('input', function () {
      readQuery = this.value || '';
      renderReadings();
    });
    $('#readBackBtn').addEventListener('click', closeReadingDetail);
    $('#readDeleteBtn').addEventListener('click', deleteReading);
    $('#readFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/readings' })
      }).then(function (r) { if (!r.ok) toast('文件夹没打开，可能路径不对'); });
    });

    // ===== 关联条：三个详情页共用一套点击委托 =====
    bindXrefBar('#summaryXref');
    bindXrefBar('#transXref');
    bindXrefBar('#readXref');

    // 译文库 / 精读库列表提前取一次：侧栏徽标与「关联」条都要用（无正文，很轻）
    loadTranslations();
    loadReadings();

    // ===== 科技爱好者周刊 =====
    $('#weeklyRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadWeekly(true).then(function () {
        btn.classList.remove('loading');
        toast('周刊已刷新');
      });
    });
    $('#weeklyArchiveBtn').addEventListener('click', function () {
      window.open('https://github.com/ruanyf/weekly/tree/master/docs', '_blank', 'noopener');
    });
    $('#summaryBackBtn').addEventListener('click', function () {
      $('#summariesDetailView').style.display = 'none';
      $('#summariesListView').style.display = '';
    });

    // 摘要卡片：全文检索
    var sSearch = $('#summarySearch');
    if (sSearch) {
      sSearch.addEventListener('input', function () {
        summaryQuery = this.value || '';
        renderSummaryCards();
      });
    }
    // 摘要卡片：标签筛选
    var sTagFilter = $('#summaryTagFilter');
    if (sTagFilter) {
      sTagFilter.addEventListener('click', function (e) {
        var btn = e.target.closest('.sum-tag-btn');
        if (!btn) return;
        summaryTagActive = btn.dataset.tag || '';
        renderSummaryCards();
      });
    }
    // 摘要卡片：详情内标签编辑（点 chip 删除）
    var sChips = $('#summaryTagChips');
    if (sChips) {
      sChips.addEventListener('click', function (e) {
        var chip = e.target.closest('.sum-tag-chip');
        if (!chip) return;
        var cur = summaryAll.filter(function (s) { return s.id === summaryCurrentId; })[0];
        var tags = ((cur && cur.tags) || []).filter(function (t) { return t !== chip.dataset.tag; });
        saveSummaryTags(tags);
      });
    }
    // 摘要卡片：详情内标签编辑（回车添加）
    var sTagInput = $('#summaryTagInput');
    if (sTagInput) {
      sTagInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var val = (this.value || '').trim();
        if (!val) return;
        var cur = summaryAll.filter(function (s) { return s.id === summaryCurrentId; })[0];
        var tags = (cur && cur.tags) ? cur.tags.slice() : [];
        if (tags.indexOf(val) < 0) tags.push(val);
        this.value = '';
        saveSummaryTags(tags);
      });
    }

    // 初始化加载摘要卡片
    loadSummaryCards();

    // ===== PDF 转写 =====
    var dz = $('#pdfDropzone');
    var fileInput = $('#pdfFileInput');
    // 点击选择文件（点到已选文件信息区不重复触发）
    dz.addEventListener('click', function (e) {
      if (e.target.closest('#pdfFileInfo')) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) handlePdfFile(fileInput.files[0]);
    });
    // 拖拽
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('dragging');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('dragging');
      });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handlePdfFile(f);
    });
    $('#pdfFileClear').addEventListener('click', function (e) {
      e.stopPropagation();
      clearPdfFile();
    });
    // 引擎切换：重新校验已选文件大小（不同引擎上限不同）
    $$('input[name="pdfEngine"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (state.pdf.file) {
          var v = validatePdfFile(state.pdf.file, getPdfEngine());
          if (!v.ok) { showPdfFileError(v.msg); toast(v.msg); }
          else showPdfFileError('');
        }
        updatePdfStartState();
      });
    });
    // 开始转写
    $('#pdfStartBtn').addEventListener('click', startPdfJob);
    // 结果视图切换：双栏 / 仅预览 / 仅源码
    $$('.pdf-tab').forEach(function (t) {
      t.addEventListener('click', function () { switchPdfView(t.dataset.pdfview); });
    });
    $('#pdfCopyBtn').addEventListener('click', copyPdfMarkdown);
    $('#pdfDownloadBtn').addEventListener('click', downloadPdfMarkdown);
    $('#pdfRetryBtn').addEventListener('click', retryPdfJob);
    $('#pdfOpenFolderBtn').addEventListener('click', openPdfJobFolder);
    // P0 一键入库
    $('#pdfIngestBtn').addEventListener('click', openPdfIngest);
    $('#pdfIngestClose').addEventListener('click', closePdfIngest);
    $('#pdfIngestCancel').addEventListener('click', closePdfIngest);
    $('#pdfIngestOverlay').addEventListener('click', closePdfIngest);
    $('#pdfIngestConfirm').addEventListener('click', confirmPdfIngest);
    $('#piAiBtn').addEventListener('click', runPdfAiSummarize);
    // 全文翻译
    $('#pdfTransStartBtn').addEventListener('click', startPdfTranslation);
    $('#pdfTransCancelBtn').addEventListener('click', cancelPdfTranslation);
    $('#pdfTransRetryBtn').addEventListener('click', function () {
      if (confirm('重新翻译将覆盖当前译文，确定继续？')) {
        startPdfTranslation();
      }
    });
    // 同步两个深度按钮组的 active 状态
    function setSumDepthActive(depth) {
      $$('.sum-depth-btn, .sum-switch-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.depth === depth);
      });
    }

    // 空状态的三个大深度按钮
    $$('.sum-depth-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var depth = this.dataset.depth;
        setSumDepthActive(depth);
        startPdfSummary(depth);
      });
    });

    // 结果区域的小切换按钮
    $$('.sum-switch-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var depth = this.dataset.depth;
        setSumDepthActive(depth);
        startPdfSummary(depth);
      });
    });

    // 保存按钮
    $('#pdfSumSaveBtn').addEventListener('click', savePdfSummary);

    $('#pdfSumRetryBtn').addEventListener('click', function () {
      // 重新生成时使用当前选中的深度
      var active = document.querySelector('.sum-switch-btn.active') || document.querySelector('.sum-depth-btn.active');
      var depth = active ? active.dataset.depth : 'standard';
      startPdfSummary(depth);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#pdfIngestModal').hidden) closePdfIngest();
    });
  }

  // ===== 操作：待办 =====
  function addTodo() {
    var input = $('#todoInput');
    var prioritySelect = $('#todoPriority');
    var text = input.value.trim();
    if (!text) return;
    var priority = prioritySelect ? prioritySelect.value : '普通';
    api('/api/todos', { method: 'POST', body: JSON.stringify({ action: 'add', text: text, priority: priority }) })
      .then(function (res) {
        if (res.ok) {
          state.todos = res.todos;
          input.value = '';
          renderTodos();
          renderDashboardTodos();
          updateTodoBadge();
          toast('已添加待办');
        }
      });
  }

  function toggleTodo(id) {
    api('/api/todos', { method: 'POST', body: JSON.stringify({ action: 'toggle', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.todos = res.todos;
          renderTodos();
          renderDashboardTodos();
          updateTodoBadge();
        }
      });
  }

  function deleteTodo(id) {
    api('/api/todos', { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.todos = res.todos;
          renderTodos();
          renderDashboardTodos();
          updateTodoBadge();
          toast('已删除');
        }
      });
  }

  // ===== 操作：日志 =====
  function addJournal() {
    var input = $('#journalInput');
    var typeSelect = $('#journalType');
    var content = input.value.trim();
    if (!content) return;
    var type = typeSelect ? typeSelect.value : '日常';
    api('/api/journal', { method: 'POST', body: JSON.stringify({ content: content, type: type }) })
      .then(function (res) {
        if (res.ok) {
          state.journal = res.journal;
          input.value = '';
          renderJournal();
          renderDashboardJournal();
          toast('已记录');
        }
      });
  }

  function deleteJournal(id) {
    if (!confirm('确定删除这条日志？')) return;
    api('/api/journal', { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.journal = res.journal;
          renderJournal();
          renderDashboardJournal();
          toast('已删除');
        }
      });
  }

  // ===== 毕业条件 & 论文 =====
  function renderGraduation() {
    var grad = (state.overview && state.overview.graduation) || { c_journal: { required: 2, achieved: 0, items: [] } };
    var cj = grad.c_journal;
    $('#gradCJrnlAchieved').value = cj.achieved;
    $('#gradCJrnlRequired').value = cj.required;
    $('#gradCJrnlName').textContent = cj.label || 'C刊/SCI论文';
    $('#gradCJrnlHint').textContent = '需发表 ' + cj.required + ' 篇 ' + (cj.label || 'C刊/SCI论文');
    var pct = cj.required > 0 ? Math.min(100, cj.achieved / cj.required * 100) : 0;
    $('#gradCJrnlBar').style.width = pct + '%';
    // 论文列表
    var pubList = $('#pubList');
    if (cj.items && cj.items.length > 0) {
      pubList.innerHTML = cj.items.map(function (p) {
        return '<div class="pub-item">' +
          '<div class="pub-info">' +
          '<span class="pub-title">' + escapeHtml(p.title || '') + '</span>' +
          (p.journal ? '<span class="pub-journal">' + escapeHtml(p.journal) + '</span>' : '') +
          (p.date ? '<span class="pub-date">' + escapeHtml(p.date) + '</span>' : '') +
          '</div>' +
          '<button class="pub-delete" data-action="delete-pub" data-id="' + p.id + '" aria-label="删除">×</button>' +
          '</div>';
      }).join('');
    } else {
      pubList.innerHTML = '<div class="pub-empty">暂无论文记录，发表后点击上方按钮登记</div>';
    }
  }

  function addPublication() {
    var title = prompt('论文标题：');
    if (!title || !title.trim()) return;
    var journal = prompt('发表期刊（可选）：') || '';
    var date = prompt('发表时间（可选，如 2026-09）：') || '';
    api('/api/publications', { method: 'POST', body: JSON.stringify({ action: 'add', title: title.trim(), type: 'c_journal', journal: journal.trim(), date: date.trim() }) })
      .then(function (res) {
        if (res.ok) {
          state.overview.graduation = res.graduation;
          renderGraduation();
          toast('已登记论文');
        }
      });
  }

  function deletePublication(id) {
    if (!confirm('确定删除这条论文记录？')) return;
    api('/api/publications', { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.overview.graduation = res.graduation;
          renderGraduation();
          toast('已删除');
        }
      });
  }

  function configureStudyProgress() {
    var current = (state.overview && state.overview.phd) || {};
    $('#progressStart').value = current.start || '';
    $('#progressEnd').value = current.end || '';
    $('#progressError').hidden = true;
    $('#progressModal').hidden = false;
  }

  function closeProgressModal() { $('#progressModal').hidden = true; $('#progressError').hidden = true; }

  function saveStudyDates(event) {
    event.preventDefault();
    var start = $('#progressStart').value;
    var end = $('#progressEnd').value;
    var error = $('#progressError');
    if (!start || !end || Date.parse(end) <= Date.parse(start)) { error.textContent = '预计毕业日期必须晚于入学日期'; error.hidden = false; return; }
    var remainDays = 0;
    var elapsedDays = 0;
    remainDays = Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));
    elapsedDays = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 86400000));
    var totalDays = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
    var percent = Math.max(0, Math.min(100, Math.round(elapsedDays / totalDays * 100)));
    api('/api/study-progress', { method: 'POST', body: JSON.stringify({ label: '学业进度', stage: '', percent: percent, start: start, end: end, elapsed_days: elapsedDays, remain_days: remainDays }) }).then(function (res) {
      if (!res.ok) { toast(res.error || '请先登录后保存'); return; }
      state.overview.phd = res.phd; renderOverview(); closeProgressModal(); toast('学习时间已保存');
    });
  }

  function saveGraduationCounts() {
    var achieved = Number($('#gradCJrnlAchieved').value);
    var required = Number($('#gradCJrnlRequired').value);
    if (!Number.isInteger(achieved) || !Number.isInteger(required) || achieved < 0 || required < 0) { toast('请输入非负整数'); renderGraduation(); return; }
    api('/api/graduation-settings', { method: 'POST', body: JSON.stringify({ label: 'C刊/SCI论文', achieved: achieved, required: required }) }).then(function (res) {
      if (!res.ok) { toast(res.error || '请先登录后保存'); return; }
      state.overview.graduation = res.graduation; renderGraduation(); toast('毕业条件已保存');
    });
  }

  // ===== 学术履历：基金 / 获奖 / 会议 =====
  function renderAcademicRecords() {
    var roots = $$('.academic-record-grid');
    if (!roots.length) return;
    var records = (state.overview && state.overview.academic_records) || {};
    var groups = [
      { key: 'funding', title: '基金项目', hint: '主持或参与的课题', add: '+ 登记基金' },
      { key: 'awards', title: '学术获奖', hint: '竞赛、荣誉与表彰', add: '+ 登记获奖' },
      { key: 'conferences', title: '学术会议', hint: '参会、报告与海报', add: '+ 登记会议' }
    ];
    var markup = groups.map(function (group) {
      var items = Array.isArray(records[group.key]) ? records[group.key] : [];
      var latest = items.slice(0, 2).map(function (item) {
        var details = item.details || {};
        if (group.key === 'conferences') {
          var fields = [
            details.location ? '<span><b>地点</b>' + escapeHtml(details.location) + '</span>' : '',
            details.time ? '<span><b>时间</b>' + escapeHtml(details.time) + '</span>' : '',
            details.paper ? '<span><b>报告论文</b>' + escapeHtml(details.paper) + '</span>' : ''
          ].filter(Boolean).join('');
          if (!fields && item.meta) fields = '<span><b>备注</b>' + escapeHtml(item.meta) + '</span>';
          if (!fields) fields = '<span class="academic-conference-empty">尚未补充会议详情</span>';
          return '<li class="academic-conference-entry"><div class="academic-conference-main"><span class="academic-record-title">' + escapeHtml(item.title || '') + '</span><div class="academic-conference-fields">' + fields + '</div></div><button class="academic-record-delete" data-academic-delete="' + item.id + '" aria-label="删除">×</button></li>';
        }
        var displayMeta = item.meta || [details.location, details.time, details.paper].filter(Boolean).join(' · ') || item.date || '';
        return '<li><span class="academic-record-title">' + escapeHtml(item.title || '') + '</span><span class="academic-record-meta" title="' + escapeHtml(displayMeta) + '">' + escapeHtml(displayMeta) + '</span><button class="academic-record-delete" data-academic-delete="' + item.id + '" aria-label="删除">×</button></li>';
      }).join('');
      var editor = '';
      if (academicEditorKind === group.key) {
        var fields = '<label>名称<input name="title" required maxlength="160" placeholder="填写' + group.title + '名称"></label>';
        if (group.key === 'conferences') fields += '<label>会议地点<input name="location" maxlength="160" placeholder="如：北京"></label><label>会议时间<input name="time" maxlength="80" placeholder="如：2026-09-19"></label><label>报告论文/题目<input name="paper" maxlength="240" placeholder="填写报告论文或题目"></label>';
        else fields += '<label>补充说明<input name="meta" maxlength="240" placeholder="可填写单位、等级、项目编号或角色"></label>';
        editor = '<form class="academic-record-editor" data-academic-form data-academic-kind="' + group.key + '"><div class="academic-editor-fields">' + fields + '</div><div class="academic-editor-actions"><button type="submit">保存</button><button type="button" data-academic-cancel>取消</button></div></form>';
      }
      return '<article class="academic-record-card academic-' + group.key + '" data-academic-kind="' + group.key + '"><div class="academic-record-top"><div><div class="academic-record-kicker">' + group.title + '</div><div class="academic-record-count">' + items.length + '</div></div><span class="academic-record-hint">' + group.hint + '</span></div>' + (editor || (latest ? '<ul class="academic-record-list">' + latest + '</ul>' : '<div class="academic-record-empty">尚未登记</div>')) + (editor ? '' : '<button class="academic-record-add" type="button" data-academic-add="' + group.key + '">' + group.add + '</button>') + '</article>';
    }).join('');
    roots.forEach(function (root) { root.innerHTML = markup; });
  }

  function saveAcademicRecord(form) {
    var kind = form.dataset.academicKind;
    var title = (form.elements.title.value || '').trim();
    if (!title) { form.elements.title.focus(); return; }
    var details = kind === 'conferences' ? {
      location: (form.elements.location.value || '').trim(),
      time: (form.elements.time.value || '').trim(),
      paper: (form.elements.paper.value || '').trim()
    } : {};
    var meta = kind === 'conferences' ? [details.location, details.time, details.paper].filter(Boolean).join(' · ') : (form.elements.meta.value || '').trim();
    api('/api/academic-records', { method: 'POST', body: JSON.stringify({ action: 'add', kind: kind, title: title, meta: meta, details: details }) }).then(function (res) {
      if (!res.ok) { toast(res.error || '请先登录后登记'); return; }
      state.overview.academic_records = res.records;
      academicEditorKind = '';
      renderAcademicRecords();
      toast(kind === 'conferences' ? '已登记学术会议' : '已登记学术履历');
    });
  }

  function deleteAcademicRecord(id) {
    if (!confirm('确定删除这条学术履历？')) return;
    api('/api/academic-records', { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) }).then(function (res) {
      if (!res.ok) return;
      state.overview.academic_records = res.records; renderAcademicRecords();
    });
  }

  // ===== 数据与代码：版本、关联关系与复现检查 =====
  function loadDataCodeLibrary() { return Promise.all([api('/api/data-code-library'), api('/api/research-projects')]).then(function (results) { var res = results[0], projects = results[1]; if (!res.ok) { toast(res.error || '请先登录后使用数据与代码'); return; } state.dataCodeLibrary = Object.assign({ items: [], trash: [] }, res.dataCodeLibrary || {}); if (projects.ok) state.researchProjects = Object.assign({ projects: [], trash: [] }, projects.researchProjects || {}); if (!state.dataCodeId && state.dataCodeLibrary.items[0]) state.dataCodeId = state.dataCodeLibrary.items[0].id; renderDataCodeLibrary(); }); }
  function activeDataCodeItem() { return (state.dataCodeLibrary.items || []).filter(function (item) { return Number(item.id) === Number(state.dataCodeId); })[0] || null; }
  function dataCodeFields() { return ['dcTitle', 'dcCategory', 'dcKind', 'dcProject', 'dcPaper', 'dcVersion', 'dcSource', 'dcCoverage', 'dcEnvironment', 'dcLocation', 'dcDescription', 'dcVariables', 'dcRunOrder']; }
  function pipelinePaperTitles() { try { var fields = JSON.parse(localStorage.getItem('research-hub-fields-v1') || '{}'); return Array.from(new Set(Object.keys(fields).map(function (key) { return fields[key] && fields[key].title; }).filter(Boolean))); } catch (error) { return []; } }
  function renderDataCodeLibrary() {
    var library = state.dataCodeLibrary || { items: [], trash: [] }, items = library.items || [], trash = library.trash || [], list = $('#dcList');
    $('#dcTrash').textContent = state.dataCodeTrashOpen ? '返回资源库' : '回收站' + (trash.length ? ' (' + trash.length + ')' : '');
    if (state.dataCodeTrashOpen) { list.innerHTML = recycleBinToolbar('dataCode', '数据与代码', trash.length) + (trash.length ? trash.map(function (entry) { return '<div class="dc-trash-row"><div><b>' + escapeHtml((entry.item || {}).title || '未命名资源') + '</b><span>' + escapeHtml(entry.deletedAt || '') + '</span></div><div><button type="button" data-dc-restore="' + entry.id + '">恢复</button><button type="button" data-dc-purge="' + entry.id + '">彻底删除</button></div></div>'; }).join('') : '<div class="dc-list-empty">回收站为空</div>'); dataCodeFields().forEach(function (id) { $('#' + id).value = ''; $('#' + id).disabled = true; }); $$('[data-dc-check]').forEach(function (box) { box.checked = false; box.disabled = true; }); $('#dcDelete').hidden = true; renderDataCodeProgress(); return; }
    var categories = Array.from(new Set(items.map(function (item) { return (item.category || '通用').trim() || '通用'; }))).sort();
    var visible = state.dataCodeCategoryFilter === 'all' ? items : items.filter(function (item) { return ((item.category || '通用').trim() || '通用') === state.dataCodeCategoryFilter; });
    if (!visible.some(function (item) { return Number(item.id) === Number(state.dataCodeId); })) state.dataCodeId = visible[0] ? visible[0].id : null;
    var active = activeDataCodeItem();
    list.innerHTML = items.length ? '<div class="dc-category-list"><button type="button" class="dc-category' + (state.dataCodeCategoryFilter === 'all' ? ' is-active' : '') + '" data-dc-category="all">全部 <span>' + items.length + '</span></button>' + categories.map(function (category) { return '<button type="button" class="dc-category' + (state.dataCodeCategoryFilter === category ? ' is-active' : '') + '" data-dc-category="' + escapeHtml(category) + '">' + escapeHtml(category) + '<span>' + items.filter(function (item) { return ((item.category || '通用').trim() || '通用') === category; }).length + '</span></button>'; }).join('') + '</div><div class="dc-list-label">资源记录 <span>' + visible.length + '</span></div>' + (visible.length ? visible.map(function (item) { var checks = item.checks || {}, done = Object.keys(checks).filter(function (key) { return checks[key]; }).length; return '<button type="button" class="dc-list-item' + (Number(item.id) === Number(state.dataCodeId) ? ' is-active' : '') + '" data-dc-id="' + item.id + '"><b>' + escapeHtml(item.title || '未命名资源') + '</b><span>' + escapeHtml(item.category || '通用') + ' · ' + escapeHtml(item.kind || '数据集') + ' · 复现 ' + done + '/5</span></button>'; }).join('') : '<div class="dc-list-empty">此分类暂无资源</div>') : '<div class="dc-list-empty">还没有数据或代码记录<br>点击右上角新建</div>';
    dataCodeFields().forEach(function (id) { $('#' + id).disabled = !active; }); $$('[data-dc-check]').forEach(function (box) { box.disabled = !active; }); $('#dcDelete').hidden = !active;
    $('#dcProject').innerHTML = '<option value="">未关联</option>' + ((state.researchProjects && state.researchProjects.projects) || []).map(function (project) { return '<option value="' + project.id + '">' + escapeHtml(project.title || '未命名项目') + '</option>'; }).join(''); $('#dcPaperOptions').innerHTML = pipelinePaperTitles().map(function (title) { return '<option value="' + escapeHtml(title) + '"></option>'; }).join('');
    $('#dcTitle').value = active ? active.title || '' : ''; $('#dcCategory').value = active ? active.category || '通用' : ''; $('#dcKind').value = active ? active.kind || '数据集' : '数据集'; $('#dcProject').value = active ? String(active.projectId || '') : ''; $('#dcPaper').value = active ? active.paperTitle || '' : ''; $('#dcVersion').value = active ? active.version || '' : ''; $('#dcSource').value = active ? active.source || '' : ''; $('#dcCoverage').value = active ? active.coverage || '' : ''; $('#dcEnvironment').value = active ? active.environment || '' : ''; $('#dcLocation').value = active ? active.location || '' : ''; $('#dcDescription').value = active ? active.description || '' : ''; $('#dcVariables').value = active ? active.variables || '' : ''; $('#dcRunOrder').value = active ? active.runOrder || '' : '';
    $$('[data-dc-check]').forEach(function (box) { box.checked = Boolean(active && active.checks && active.checks[box.dataset.dcCheck]); }); renderDataCodeProgress();
  }
  function renderDataCodeProgress() { var boxes = $$('[data-dc-check]'), done = boxes.filter(function (box) { return box.checked; }).length, percent = Math.round(done / Math.max(1, boxes.length) * 100), target = $('#dcReproProgress'); if (target) target.innerHTML = '<div><span>复现完整度</span><b>' + percent + '%</b></div><i><em style="width:' + percent + '%"></em></i>'; }
  function newDataCodeItem() { api('/api/data-code-library', { method: 'POST', body: JSON.stringify({ action: 'create' }) }).then(function (res) { if (!res.ok) { toast(res.error || '新建失败'); return; } state.dataCodeLibrary = res.dataCodeLibrary; state.dataCodeTrashOpen = false; state.dataCodeCategoryFilter = 'all'; state.dataCodeId = res.dataCodeLibrary.items[0].id; renderDataCodeLibrary(); $('#dcTitle').focus(); }); }
  function readDataCodePayload() { var checks = {}; $$('[data-dc-check]').forEach(function (box) { checks[box.dataset.dcCheck] = box.checked; }); return { action: 'save', id: state.dataCodeId, title: $('#dcTitle').value, category: $('#dcCategory').value, kind: $('#dcKind').value, projectId: $('#dcProject').value, paperTitle: $('#dcPaper').value, version: $('#dcVersion').value, source: $('#dcSource').value, coverage: $('#dcCoverage').value, environment: $('#dcEnvironment').value, location: $('#dcLocation').value, description: $('#dcDescription').value, variables: $('#dcVariables').value, runOrder: $('#dcRunOrder').value, checks: checks }; }
  function persistDataCodeItem(body, automatic) { return api('/api/data-code-library', { method: 'POST', body: JSON.stringify(body) }).then(function (res) { if (!res.ok) throw new Error(res.error || '保存失败'); state.dataCodeLibrary = res.dataCodeLibrary; state.dataCodeCategoryFilter = (body.category || '通用').trim() || '通用'; if (!automatic) { renderDataCodeLibrary(); toast('数据与代码记录已同步保存'); } }); }
  function queueDataCodeAutoSave() { if (!state.dataCodeId || state.dataCodeTrashOpen) return; var body = readDataCodePayload(); queueAutoSave('data-code:' + body.id, body, persistDataCodeItem); }
  function saveDataCodeItem() { if (!state.dataCodeId) return; var body = readDataCodePayload(); return saveImmediately('data-code:' + body.id, body, persistDataCodeItem); }
  function trashDataCodeItem() { if (!state.dataCodeId || !confirm('确定将此资源移入回收站吗？')) return; api('/api/data-code-library', { method: 'POST', body: JSON.stringify({ action: 'trash', id: state.dataCodeId }) }).then(function (res) { if (!res.ok) { toast(res.error || '移入回收站失败'); return; } state.dataCodeLibrary = res.dataCodeLibrary; state.dataCodeId = null; renderDataCodeLibrary(); toast('资源已移入回收站'); }); }
  function restoreDataCodeItem(id) { api('/api/data-code-library', { method: 'POST', body: JSON.stringify({ action: 'restore', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '恢复失败'); return; } state.dataCodeLibrary = res.dataCodeLibrary; renderDataCodeLibrary(); toast('资源已恢复'); }); }
  function purgeDataCodeItem(id) { if (!confirm('确定彻底删除此资源记录吗？此操作无法恢复。')) return; api('/api/data-code-library', { method: 'POST', body: JSON.stringify({ action: 'purge', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '彻底删除失败'); return; } state.dataCodeLibrary = res.dataCodeLibrary; renderDataCodeLibrary(); toast('已彻底删除'); }); }

  // ===== 文献与引用：可同步的个人文献库 =====
  function loadReferenceLibrary() {
    return Promise.all([api('/api/references'), api('/api/research-projects'), api('/api/knowledge-base')]).then(function (results) {
      var library = results[0];
      if (!library.ok) { toast(library.error || '请先登录后使用文献与引用'); return; }
      state.referenceLibrary = Object.assign({ items: [], trash: [] }, library.referenceLibrary || {});
      if (results[1].ok) state.researchProjects = Object.assign({ projects: [], trash: [] }, results[1].researchProjects || {});
      if (results[2].ok) state.knowledgeBase = Object.assign({ folders: [], docs: [] }, results[2].knowledgeBase || {});
      if (!state.referenceId && state.referenceLibrary.items[0]) state.referenceId = state.referenceLibrary.items[0].id;
      renderReferenceLibrary();
    });
  }

  function activeReference() { return (state.referenceLibrary.items || []).filter(function (item) { return String(item.id) === String(state.referenceId); })[0] || null; }
  function referenceFields() { return ['refTitle', 'refAuthors', 'refYear', 'refType', 'refSource', 'refLocator', 'refTags', 'refDoi', 'refUrl', 'refProject', 'refKnowledge', 'refNotes']; }
  function referenceAuthorToken(value) { return (String(value || '').split(/[；;，,]/)[0].trim().replace(/\s+/g, '') || 'anonymous').replace(/[^\w\u4e00-\u9fff-]/g, '').slice(0, 20); }
  function referenceKey(item) { return referenceAuthorToken(item.authors) + (String(item.year || '').replace(/\D/g, '').slice(0, 4) || 'n.d.'); }
  function referenceCitation(item) {
    if (!item) return '';
    var author = item.authors || '作者未知'; var year = item.year || 'n.d.';
    var citation = author + ' (' + year + '). ' + (item.title || '未命名文献') + '.';
    if (item.source) citation += ' ' + item.source + '.';
    if (item.locator) citation += ' ' + item.locator + '.';
    if (item.doi) citation += ' https://doi.org/' + item.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
    else if (item.url) citation += ' ' + item.url;
    return citation;
  }
  function referenceBibtex(item) {
    if (!item) return '';
    var typeMap = { '期刊论文': 'article', '书籍': 'book', '会议论文': 'inproceedings', '报告': 'techreport', '网页': 'misc' };
    var fields = [['author', item.authors], ['title', item.title], ['year', item.year], [item.type === '书籍' ? 'publisher' : item.type === '会议论文' ? 'booktitle' : item.type === '报告' ? 'institution' : 'journal', item.source], ['pages', item.locator], ['doi', item.doi], ['url', item.url]];
    return '@' + (typeMap[item.type] || 'misc') + '{' + referenceKey(item) + ',\n' + fields.filter(function (field) { return field[1]; }).map(function (field) { return '  ' + field[0] + ' = {' + String(field[1]).replace(/[{}]/g, '') + '}'; }).join(',\n') + '\n}';
  }
  function renderReferencePreview() {
    var active = activeReference();
    var citation = referenceCitation(active), bibtex = referenceBibtex(active);
    $('#refCitationPreview').textContent = citation || '选择或新建一篇文献后，这里会生成引用。';
    $('#refBibtex').textContent = bibtex;
  }
  function renderReferenceLibrary() {
    var library = state.referenceLibrary || { items: [], trash: [] }, items = library.items || [], trash = library.trash || [], list = $('#refList');
    $('#refTrash').textContent = state.referenceTrashOpen ? '返回文献库' : '回收站' + (trash.length ? ' (' + trash.length + ')' : '');
    if (state.referenceTrashOpen) {
      list.innerHTML = recycleBinToolbar('reference', '文献与引用', trash.length) + (trash.length ? trash.map(function (entry) { return '<div class="ref-trash-row"><div><b>' + escapeHtml((entry.item || {}).title || '未命名文献') + '</b><span>' + escapeHtml(entry.deletedAt || '') + '</span></div><div><button type="button" data-ref-restore="' + entry.id + '">恢复</button><button type="button" data-ref-purge="' + entry.id + '">彻底删除</button></div></div>'; }).join('') : '<div class="ref-empty">回收站为空</div>');
      referenceFields().forEach(function (id) { $('#' + id).value = ''; $('#' + id).disabled = true; }); $('#refDelete').hidden = true; renderReferencePreview(); return;
    }
    var needle = (state.referenceQuery || '').trim().toLowerCase();
    var visible = items.filter(function (item) { var content = [item.title, item.authors, item.tags, item.source, item.doi].join(' ').toLowerCase(); return (!needle || content.indexOf(needle) >= 0) && (state.referenceTypeFilter === 'all' || item.type === state.referenceTypeFilter); });
    if (!visible.some(function (item) { return String(item.id) === String(state.referenceId); })) state.referenceId = visible[0] ? visible[0].id : null;
    var active = activeReference();
    list.innerHTML = '<div class="ref-list-label">我的文献 <span>' + visible.length + '/' + items.length + '</span></div>' + (visible.length ? visible.map(function (item) { return '<button type="button" class="ref-list-item' + (String(item.id) === String(state.referenceId) ? ' is-active' : '') + '" data-ref-id="' + item.id + '"><b>' + escapeHtml(item.title || '未命名文献') + '</b><span>' + escapeHtml(item.authors || '作者待补充') + ' · ' + escapeHtml(item.year || '年份待补充') + '</span><i>' + escapeHtml(item.type || '期刊论文') + '</i></button>'; }).join('') : '<div class="ref-empty">还没有匹配的文献<br>点击右上角新建或导入 BibTeX</div>');
    $('#refProject').innerHTML = '<option value="">未关联</option>' + ((state.researchProjects && state.researchProjects.projects) || []).map(function (project) { return '<option value="' + project.id + '">' + escapeHtml(project.title || '未命名项目') + '</option>'; }).join('');
    $('#refKnowledge').innerHTML = '<option value="">未关联</option>' + ((state.knowledgeBase && state.knowledgeBase.docs) || []).map(function (doc) { return '<option value="' + doc.id + '">' + escapeHtml(doc.title || '未命名文档') + '</option>'; }).join('');
    referenceFields().forEach(function (id) { $('#' + id).disabled = !active; }); $('#refDelete').hidden = !active;
    $('#refTitle').value = active ? active.title || '' : ''; $('#refAuthors').value = active ? active.authors || '' : ''; $('#refYear').value = active ? active.year || '' : ''; $('#refType').value = active ? active.type || '期刊论文' : '期刊论文'; $('#refSource').value = active ? active.source || '' : ''; $('#refLocator').value = active ? active.locator || '' : ''; $('#refTags').value = active ? active.tags || '' : ''; $('#refDoi').value = active ? active.doi || '' : ''; $('#refUrl').value = active ? active.url || '' : ''; $('#refProject').value = active ? String(active.projectId || '') : ''; $('#refKnowledge').value = active ? String(active.knowledgeDocId || '') : ''; $('#refNotes').value = active ? active.notes || '' : '';
    renderReferencePreview();
  }
  function readReferencePayload() { return { action: 'save', id: state.referenceId, title: $('#refTitle').value, authors: $('#refAuthors').value, year: $('#refYear').value, type: $('#refType').value, source: $('#refSource').value, locator: $('#refLocator').value, tags: $('#refTags').value, doi: $('#refDoi').value, url: $('#refUrl').value, projectId: $('#refProject').value, knowledgeDocId: $('#refKnowledge').value, notes: $('#refNotes').value }; }
  function persistReference(body, automatic) { return api('/api/references', { method: 'POST', body: JSON.stringify(body) }).then(function (res) { if (!res.ok) throw new Error(res.error || '保存失败'); state.referenceLibrary = res.referenceLibrary; if (!automatic) { renderReferenceLibrary(); toast('文献已同步保存'); } }); }
  function queueReferenceAutoSave() { if (!state.referenceId || state.referenceTrashOpen) return; var body = readReferencePayload(); renderReferencePreview(); queueAutoSave('reference:' + body.id, body, persistReference); }
  function saveReference() { if (!state.referenceId) return; return saveImmediately('reference:' + state.referenceId, readReferencePayload(), persistReference); }
  function newReference() { return api('/api/references', { method: 'POST', body: JSON.stringify({ action: 'create' }) }).then(function (res) { if (!res.ok) { toast(res.error || '新建失败'); return false; } state.referenceLibrary = res.referenceLibrary; state.referenceTrashOpen = false; state.referenceId = res.referenceLibrary.items[0].id; renderReferenceLibrary(); $('#refTitle').focus(); return true; }); }
  function trashReference() { if (!state.referenceId || !confirm('确定将此文献移入回收站吗？')) return; api('/api/references', { method: 'POST', body: JSON.stringify({ action: 'trash', id: state.referenceId }) }).then(function (res) { if (!res.ok) { toast(res.error || '移入回收站失败'); return; } state.referenceLibrary = res.referenceLibrary; state.referenceId = null; renderReferenceLibrary(); toast('文献已移入回收站'); }); }
  function restoreReference(id) { api('/api/references', { method: 'POST', body: JSON.stringify({ action: 'restore', id: id }) }).then(function (res) { if (res.ok) { state.referenceLibrary = res.referenceLibrary; renderReferenceLibrary(); } }); }
  function purgeReference(id) { if (!confirm('确定彻底删除这篇文献吗？此操作无法恢复。')) return; api('/api/references', { method: 'POST', body: JSON.stringify({ action: 'purge', id: id }) }).then(function (res) { if (res.ok) { state.referenceLibrary = res.referenceLibrary; renderReferenceLibrary(); } }); }
  function copyReference(value, label) { if (!value) { toast('暂无可复制内容'); return; } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { toast(label + '已复制'); }); else { var area = document.createElement('textarea'); area.value = value; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); toast(label + '已复制'); } }
  function importReferenceBibtex() { var raw = prompt('粘贴一条 BibTeX 文献：'); if (!raw || !raw.trim()) return; var fields = {}; raw.replace(/(\w+)\s*=\s*[{"]([^}"]+)[}"]/g, function (_, key, value) { fields[key.toLowerCase()] = value.trim(); return _; }); if (!fields.title) { toast('未识别到 BibTeX 标题'); return; } newReference().then(function (created) { if (!created) return; $('#refTitle').value = fields.title || ''; $('#refAuthors').value = fields.author || ''; $('#refYear').value = fields.year || ''; $('#refSource').value = fields.journal || fields.booktitle || fields.publisher || fields.institution || ''; $('#refLocator').value = [fields.volume, fields.number ? '(' + fields.number + ')' : '', fields.pages].filter(Boolean).join(', '); $('#refDoi').value = fields.doi || ''; $('#refUrl').value = fields.url || ''; queueReferenceAutoSave(); }); }
  function fetchReferenceDoi() { var doi = ($('#refDoi').value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ''); if (!doi) { toast('请先输入 DOI'); return; } var button = $('#refFetchDoi'); button.disabled = true; button.textContent = '获取中…'; var requester = window.__nativeFetch || window.fetch.bind(window); requester('https://api.crossref.org/works/' + encodeURIComponent(doi)).then(function (res) { if (!res.ok) throw new Error('未找到该 DOI'); return res.json(); }).then(function (data) { var item = data.message || {}; $('#refTitle').value = (item.title || [])[0] || $('#refTitle').value; $('#refAuthors').value = (item.author || []).map(function (author) { return [author.family, author.given].filter(Boolean).join(', '); }).join('; ') || $('#refAuthors').value; $('#refYear').value = String((((item.published || item.issued || {})['date-parts'] || [[]])[0][0]) || $('#refYear').value || ''); $('#refSource').value = (item['container-title'] || [])[0] || item.publisher || $('#refSource').value; $('#refLocator').value = [item.volume, item.issue ? '(' + item.issue + ')' : '', item.page].filter(Boolean).join(', '); $('#refUrl').value = item.URL || $('#refUrl').value; queueReferenceAutoSave(); toast('已根据 DOI 补全可用信息'); }).catch(function (error) { toast(error.message || 'DOI 自动补全失败，请手动填写'); }).finally(function () { button.disabled = false; button.textContent = 'DOI 自动补全'; }); }

  // ===== 研究项目：目标、阶段、里程碑与回收站 =====
  function loadResearchProjects() { return api('/api/research-projects').then(function (res) { if (!res.ok) { toast(res.error || '请先登录后使用项目管理'); return; } state.researchProjects = Object.assign({ projects: [], trash: [] }, res.researchProjects || {}); if (!state.projectId && state.researchProjects.projects[0]) state.projectId = state.researchProjects.projects[0].id; renderResearchProjects(); }); }
  function activeResearchProject() { return (state.researchProjects.projects || []).filter(function (project) { return Number(project.id) === Number(state.projectId); })[0] || null; }
  function projectFields() { return ['projectTitle', 'projectCategory', 'projectStatus', 'projectProgress', 'projectStart', 'projectEnd', 'projectGoal', 'projectMembers', 'projectMilestones', 'projectResources']; }
  function renderResearchProjects() {
    var collection = state.researchProjects || { projects: [], trash: [] }, projects = collection.projects || [], trash = collection.trash || [], list = $('#projectList');
    $('#projectTrash').textContent = state.projectTrashOpen ? '返回项目' : '回收站' + (trash.length ? ' (' + trash.length + ')' : '');
    if (state.projectTrashOpen) { list.innerHTML = recycleBinToolbar('project', '研究项目', trash.length) + (trash.length ? trash.map(function (entry) { return '<div class="project-trash-row"><div><b>' + escapeHtml((entry.item || {}).title || '未命名项目') + '</b><span>' + escapeHtml(entry.deletedAt || '') + '</span></div><div><button type="button" data-project-restore="' + entry.id + '">恢复</button><button type="button" data-project-purge="' + entry.id + '">彻底删除</button></div></div>'; }).join('') : '<div class="project-list-empty">回收站为空</div>'); projectFields().forEach(function (id) { $('#' + id).value = ''; $('#' + id).disabled = true; }); $('#projectDelete').hidden = true; $('#projectSummary').innerHTML = '<div class="project-summary-empty">可在左侧恢复误删项目。</div>'; return; }
    var categories = Array.from(new Set(projects.map(function (project) { return (project.category || '通用').trim() || '通用'; }))).sort();
    var visible = state.projectCategoryFilter === 'all' ? projects : projects.filter(function (project) { return ((project.category || '通用').trim() || '通用') === state.projectCategoryFilter; });
    if (!visible.some(function (project) { return Number(project.id) === Number(state.projectId); })) state.projectId = visible[0] ? visible[0].id : null;
    var active = activeResearchProject();
    list.innerHTML = projects.length ? '<div class="project-category-list"><button type="button" class="project-category' + (state.projectCategoryFilter === 'all' ? ' is-active' : '') + '" data-project-category="all">全部 <span>' + projects.length + '</span></button>' + categories.map(function (category) { return '<button type="button" class="project-category' + (state.projectCategoryFilter === category ? ' is-active' : '') + '" data-project-category="' + escapeHtml(category) + '">' + escapeHtml(category) + '<span>' + projects.filter(function (project) { return ((project.category || '通用').trim() || '通用') === category; }).length + '</span></button>'; }).join('') + '</div><div class="project-list-label">我的项目 <span>' + visible.length + '</span></div>' + (visible.length ? visible.map(function (project) { return '<button type="button" class="project-list-item' + (Number(project.id) === Number(state.projectId) ? ' is-active' : '') + '" data-project-id="' + project.id + '"><b>' + escapeHtml(project.title || '未命名项目') + '</b><span>' + escapeHtml(project.category || '通用') + ' · ' + escapeHtml(project.status || '规划中') + ' · ' + Math.max(0, Math.min(100, Number(project.progress) || 0)) + '%</span></button>'; }).join('') : '<div class="project-list-empty">此分类暂无项目</div>') : '<div class="project-list-empty">还没有研究项目<br>点击右上角新建</div>';
    projectFields().forEach(function (id) { $('#' + id).disabled = !active; }); $('#projectDelete').hidden = !active;
    $('#projectTitle').value = active ? active.title || '' : ''; $('#projectCategory').value = active ? active.category || '通用' : ''; $('#projectStatus').value = active ? active.status || '规划中' : '规划中'; $('#projectProgress').value = active ? Math.max(0, Math.min(100, Number(active.progress) || 0)) : 0; $('#projectStart').value = active ? active.start || '' : ''; $('#projectEnd').value = active ? active.end || '' : ''; $('#projectGoal').value = active ? active.goal || '' : ''; $('#projectMembers').value = active ? active.members || '' : ''; $('#projectMilestones').value = active ? active.milestones || '' : ''; $('#projectResources').value = active ? active.resources || '' : '';
    renderProjectSummary();
  }
  function renderProjectSummary() { var summary = $('#projectSummary'); if (!summary) return; if (!state.projectId || state.projectTrashOpen) return; var progress = Math.max(0, Math.min(100, Number($('#projectProgress').value) || 0)); var milestones = ($('#projectMilestones').value || '').split(/\r?\n/).filter(Boolean); var resources = ($('#projectResources').value || '').split(/\r?\n/).filter(Boolean); summary.innerHTML = '<div class="project-summary-kicker">项目概览</div><h2>' + escapeHtml($('#projectTitle').value || '未命名项目') + '</h2><div class="project-status-pill is-' + escapeHtml($('#projectStatus').value) + '">' + escapeHtml($('#projectStatus').value) + '</div><div class="project-progress"><div><span>完成进度</span><b>' + progress + '%</b></div><i><em style="width:' + progress + '%"></em></i></div><dl><div><dt>分类</dt><dd>' + escapeHtml($('#projectCategory').value || '通用') + '</dd></div><div><dt>起止日期</dt><dd>' + escapeHtml($('#projectStart').value || '未设置') + ' — ' + escapeHtml($('#projectEnd').value || '未设置') + '</dd></div><div><dt>成员</dt><dd>' + escapeHtml($('#projectMembers').value || '未设置') + '</dd></div></dl><section><h3>关键里程碑</h3>' + (milestones.length ? '<ul>' + milestones.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>' : '<p>尚未设置</p>') + '</section><section><h3>关联资源</h3>' + (resources.length ? '<ul>' + resources.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>' : '<p>尚未设置</p>') + '</section>'; }
  function newResearchProject() { api('/api/research-projects', { method: 'POST', body: JSON.stringify({ action: 'create' }) }).then(function (res) { if (!res.ok) { toast(res.error || '新建失败'); return; } state.researchProjects = res.researchProjects; state.projectTrashOpen = false; state.projectCategoryFilter = 'all'; state.projectId = res.researchProjects.projects[0].id; renderResearchProjects(); $('#projectTitle').focus(); }); }
  function readResearchProjectPayload() { return { action: 'save', id: state.projectId, title: $('#projectTitle').value, category: $('#projectCategory').value, status: $('#projectStatus').value, progress: $('#projectProgress').value, start: $('#projectStart').value, end: $('#projectEnd').value, goal: $('#projectGoal').value, members: $('#projectMembers').value, milestones: $('#projectMilestones').value, resources: $('#projectResources').value }; }
  function persistResearchProject(body, automatic) { return api('/api/research-projects', { method: 'POST', body: JSON.stringify(body) }).then(function (res) { if (!res.ok) throw new Error(res.error || '保存失败'); state.researchProjects = res.researchProjects; state.projectCategoryFilter = (body.category || '通用').trim() || '通用'; if (!automatic) { renderResearchProjects(); toast('项目已同步保存'); } }); }
  function queueResearchProjectAutoSave() { if (!state.projectId || state.projectTrashOpen) return; var body = readResearchProjectPayload(); queueAutoSave('project:' + body.id, body, persistResearchProject); }
  function saveResearchProject() { if (!state.projectId) return; var body = readResearchProjectPayload(); return saveImmediately('project:' + body.id, body, persistResearchProject); }
  function trashResearchProject() { if (!state.projectId || !confirm('确定将此项目移入回收站吗？')) return; api('/api/research-projects', { method: 'POST', body: JSON.stringify({ action: 'trash', id: state.projectId }) }).then(function (res) { if (!res.ok) { toast(res.error || '移入回收站失败'); return; } state.researchProjects = res.researchProjects; state.projectId = null; renderResearchProjects(); toast('项目已移入回收站'); }); }
  function restoreResearchProject(id) { api('/api/research-projects', { method: 'POST', body: JSON.stringify({ action: 'restore', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '恢复失败'); return; } state.researchProjects = res.researchProjects; renderResearchProjects(); toast('项目已恢复'); }); }
  function purgeResearchProject(id) { if (!confirm('确定彻底删除项目吗？此操作无法恢复。')) return; api('/api/research-projects', { method: 'POST', body: JSON.stringify({ action: 'purge', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '彻底删除失败'); return; } state.researchProjects = res.researchProjects; renderResearchProjects(); toast('已彻底删除'); }); }

  function versionHistoryItem(type, id) {
    var source = type === 'note' ? state.noteStudio && state.noteStudio.notes : type === 'prompt' ? state.promptLibrary && state.promptLibrary.prompts : state.knowledgeBase && state.knowledgeBase.docs;
    return (source || []).filter(function (item) { return String(item.id) === String(id); })[0] || null;
  }

  function openVersionHistory(type) {
    var item = type === 'note' ? activeNoteStudio() : type === 'prompt' ? activePrompt() : ((state.knowledgeBase && state.knowledgeBase.docs) || []).filter(function (doc) { return String(doc.id) === String(state.kbDocId); })[0];
    if (!item) { toast('请先选择要查看的内容'); return; }
    if (!Array.isArray(item.versions) || !item.versions.length) { toast('此内容还没有旧版本；修改并自动保存后会开始记录'); return; }
    activeVersionHistory = { type: type, id: item.id, index: 0 };
    var title = type === 'note' ? '笔记版本记录' : type === 'prompt' ? '提示词版本记录' : '文档版本记录';
    $('#versionHistoryTitle').textContent = title + ' · ' + (item.title || '未命名');
    $('#versionHistoryList').innerHTML = item.versions.map(function (version, index) { return '<button type="button" class="version-history-entry' + (index === 0 ? ' is-active' : '') + '" data-version-index="' + index + '">版本 ' + (item.versions.length - index) + '<span>' + escapeHtml(formatVersionTimestamp(version.savedAt)) + '</span></button>'; }).join('');
    $('#versionHistoryModal').hidden = false;
    renderVersionHistory(0);
  }

  function formatVersionTimestamp(value) {
    if (!value) return '时间未知';
    var date = new Date(value);
    return isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderVersionHistory(index) {
    if (!activeVersionHistory) return;
    var item = versionHistoryItem(activeVersionHistory.type, activeVersionHistory.id);
    var versions = item && Array.isArray(item.versions) ? item.versions : [];
    var version = versions[index];
    if (!version) return;
    activeVersionHistory.index = index;
    $$('[data-version-index]', $('#versionHistoryList')).forEach(function (entry) { entry.classList.toggle('is-active', Number(entry.dataset.versionIndex) === index); });
    $('#versionHistoryTime').textContent = formatVersionTimestamp(version.savedAt);
    $('#versionHistoryPreviewTitle').textContent = version.title || '未命名';
    $('#versionHistoryContent').textContent = activeVersionHistory.type === 'note' ? version.markdown || '' : activeVersionHistory.type === 'prompt' ? version.body || '' : version.content || '';
    $('#versionHistoryRestore').disabled = false;
  }

  function closeVersionHistory() { $('#versionHistoryModal').hidden = true; activeVersionHistory = null; }

  function restoreSelectedVersion() {
    if (!activeVersionHistory) return;
    var item = versionHistoryItem(activeVersionHistory.type, activeVersionHistory.id);
    var version = item && item.versions && item.versions[activeVersionHistory.index];
    if (!version) { toast('所选版本已不可用'); closeVersionHistory(); return; }
    if (!confirm('恢复此版本？当前内容会先自动存入版本记录。')) return;
    var type = activeVersionHistory.type;
    var endpoint = type === 'note' ? '/api/note-studio' : type === 'prompt' ? '/api/prompt-library' : '/api/knowledge-base';
    var body = type === 'note'
      ? { action: 'save', id: item.id, title: version.title, markdown: version.markdown, style: version.style }
      : type === 'prompt'
        ? { action: 'save', id: item.id, title: version.title, category: version.category, tags: version.tags, body: version.body }
        : { action: 'save-doc', id: item.id, title: version.title, content: version.content, folderId: version.folderId };
    flushAllAutoSaves();
    autoSaveChain.then(function () { return api(endpoint, { method: 'POST', body: JSON.stringify(body) }); }).then(function (result) {
      if (!result.ok) { toast(result.error || '恢复版本失败'); return; }
      if (type === 'note') { state.noteStudio = result.noteStudio; renderNoteStudio(); }
      else if (type === 'prompt') { state.promptLibrary = result.promptLibrary; renderPromptLibrary(); }
      else { state.knowledgeBase = result.knowledgeBase; state.kbDraft = null; renderKnowledgeBase(); }
      closeVersionHistory(); toast('已恢复所选版本');
    }).catch(function () { toast('恢复版本失败，请检查网络'); });
  }

  // ===== 提示词库：模板变量、复制与回收站 =====
  function loadPromptLibrary() { return api('/api/prompt-library').then(function (res) { if (!res.ok) { toast(res.error || '请先登录后使用提示词库'); return; } state.promptLibrary = Object.assign({ prompts: [], trash: [] }, res.promptLibrary || {}); if (!state.promptId && state.promptLibrary.prompts[0]) state.promptId = state.promptLibrary.prompts[0].id; renderPromptLibrary(); }); }
  function activePrompt() { return (state.promptLibrary.prompts || []).filter(function (prompt) { return Number(prompt.id) === Number(state.promptId); })[0] || null; }
  function renderPromptLibrary() {
    var library = state.promptLibrary || { prompts: [], trash: [] }, prompts = library.prompts || [], trash = library.trash || [], list = $('#promptList');
    var fields = ['promptTitle', 'promptCategory', 'promptTags', 'promptBody'];
    $('#promptTrash').textContent = state.promptTrashOpen ? '返回提示词库' : '回收站' + (trash.length ? ' (' + trash.length + ')' : '');
    if (state.promptTrashOpen) { list.innerHTML = recycleBinToolbar('prompt', '提示词', trash.length) + (trash.length ? trash.map(function (entry) { return '<div class="prompt-trash-row"><div><b>' + escapeHtml((entry.item || {}).title || '未命名提示词') + '</b><span>' + escapeHtml(entry.deletedAt || '') + '</span></div><div><button type="button" data-prompt-restore="' + entry.id + '">恢复</button><button type="button" data-prompt-purge="' + entry.id + '">彻底删除</button></div></div>'; }).join('') : '<div class="prompt-list-empty">回收站为空</div>'); fields.forEach(function (id) { $('#' + id).value = ''; $('#' + id).disabled = true; }); $('#promptDelete').hidden = true; $('#promptVariables').innerHTML = ''; $('#promptResult').textContent = '可在左侧恢复误删的提示词。'; return; }
    var categories = Array.from(new Set(prompts.map(function (prompt) { return (prompt.category || '通用').trim() || '通用'; }))).sort();
    var visible = state.promptCategoryFilter === 'all' ? prompts : prompts.filter(function (prompt) { return ((prompt.category || '通用').trim() || '通用') === state.promptCategoryFilter; });
    if (!visible.some(function (prompt) { return Number(prompt.id) === Number(state.promptId); })) state.promptId = visible[0] ? visible[0].id : null;
    var active = activePrompt();
    list.innerHTML = prompts.length ? '<div class="prompt-category-list"><button type="button" class="prompt-category' + (state.promptCategoryFilter === 'all' ? ' is-active' : '') + '" data-prompt-category="all">全部 <span>' + prompts.length + '</span></button>' + categories.map(function (category) { return '<button type="button" class="prompt-category' + (state.promptCategoryFilter === category ? ' is-active' : '') + '" data-prompt-category="' + escapeHtml(category) + '">' + escapeHtml(category) + '<span>' + prompts.filter(function (prompt) { return ((prompt.category || '通用').trim() || '通用') === category; }).length + '</span></button>'; }).join('') + '</div><div class="prompt-list-label">提示词 <span>' + visible.length + '</span></div>' + (visible.length ? visible.map(function (prompt) { return '<button type="button" class="prompt-list-item' + (Number(prompt.id) === Number(state.promptId) ? ' is-active' : '') + '" data-prompt-id="' + prompt.id + '"><b>' + escapeHtml(prompt.title || '未命名提示词') + '</b><span>' + escapeHtml(prompt.category || '通用') + ' · ' + escapeHtml(prompt.updated || '') + '</span></button>'; }).join('') : '<div class="prompt-list-empty">此分类暂无提示词</div>') : '<div class="prompt-list-empty">还没有提示词<br>点击右上角新建</div>';
    fields.forEach(function (id) { $('#' + id).disabled = !active; }); $('#promptDelete').hidden = !active;
    $('#promptTitle').value = active ? active.title || '' : ''; $('#promptCategory').value = active ? active.category || '' : ''; $('#promptTags').value = active ? active.tags || '' : ''; $('#promptBody').value = active ? active.body || '' : '';
    renderPromptResult();
  }
  function promptVariables(text) { var seen = {}; return (String(text || '').match(/{{\s*([\w\u4e00-\u9fa5-]+)\s*}}/g) || []).map(function (item) { return item.replace(/{{\s*|\s*}}/g, ''); }).filter(function (name) { if (seen[name]) return false; seen[name] = true; return true; }); }
  function renderPromptResult() { var body = $('#promptBody').value || '', variables = promptVariables(body), container = $('#promptVariables'); var existing = {}; $$('[data-prompt-var]', container).forEach(function (input) { existing[input.dataset.promptVar] = input.value; }); container.innerHTML = variables.length ? variables.map(function (name) { return '<label>' + escapeHtml(name) + '<input data-prompt-var="' + escapeHtml(name) + '" placeholder="填写 ' + escapeHtml(name) + '" value="' + escapeHtml(existing[name] || '') + '"></label>'; }).join('') : '<div class="prompt-variable-empty">此提示词没有变量，可直接复制。</div>'; var values = {}; $$('[data-prompt-var]', container).forEach(function (input) { values[input.dataset.promptVar] = input.value; }); $('#promptResult').textContent = body.replace(/{{\s*([\w\u4e00-\u9fa5-]+)\s*}}/g, function (_, name) { return values[name] || '{{ ' + name + ' }}'; }); }
  function newPrompt() { api('/api/prompt-library', { method: 'POST', body: JSON.stringify({ action: 'create' }) }).then(function (res) { if (!res.ok) { toast(res.error || '新建失败'); return; } state.promptLibrary = res.promptLibrary; state.promptTrashOpen = false; state.promptId = res.promptLibrary.prompts[0].id; renderPromptLibrary(); $('#promptTitle').focus(); }); }
  function readPromptPayload() { return { action: 'save', id: state.promptId, title: $('#promptTitle').value, category: $('#promptCategory').value, tags: $('#promptTags').value, body: $('#promptBody').value }; }
  function persistPrompt(body, automatic) { return api('/api/prompt-library', { method: 'POST', body: JSON.stringify(body) }).then(function (res) { if (!res.ok) throw new Error(res.error || '保存失败'); state.promptLibrary = res.promptLibrary; if (!automatic) { renderPromptLibrary(); toast('提示词已同步保存'); } }); }
  function queuePromptAutoSave() { if (!state.promptId || state.promptTrashOpen) return; var body = readPromptPayload(); queueAutoSave('prompt:' + body.id, body, persistPrompt); }
  function savePrompt() { if (!state.promptId) return; var body = readPromptPayload(); return saveImmediately('prompt:' + body.id, body, persistPrompt); }
  function trashPrompt() { if (!state.promptId || !confirm('确定将这条提示词移入回收站吗？')) return; api('/api/prompt-library', { method: 'POST', body: JSON.stringify({ action: 'trash', id: state.promptId }) }).then(function (res) { if (!res.ok) { toast(res.error || '移入回收站失败'); return; } state.promptLibrary = res.promptLibrary; state.promptId = null; renderPromptLibrary(); toast('提示词已移入回收站'); }); }
  function restorePrompt(id) { api('/api/prompt-library', { method: 'POST', body: JSON.stringify({ action: 'restore', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '恢复失败'); return; } state.promptLibrary = res.promptLibrary; renderPromptLibrary(); toast('提示词已恢复'); }); }
  function purgePrompt(id) { if (!confirm('确定彻底删除吗？此操作无法恢复。')) return; api('/api/prompt-library', { method: 'POST', body: JSON.stringify({ action: 'purge', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '彻底删除失败'); return; } state.promptLibrary = res.promptLibrary; renderPromptLibrary(); toast('已彻底删除'); }); }
  function copyPromptResult() { var text = $('#promptResult').textContent.trim(); if (!text) { toast('请先填写提示词内容'); return; } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('已复制提示词'); }); else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制提示词'); } }

  // ===== 公众号笔记：Markdown 编辑、富文本复制与账号同步 =====
  function loadNoteStudio() {
    return api('/api/note-studio').then(function (res) {
      if (!res.ok) { toast(res.error || '请先登录后使用笔记'); return; }
      state.noteStudio = Object.assign({ notes: [], trash: [] }, res.noteStudio || {});
      if (!state.noteId && state.noteStudio.notes[0]) state.noteId = state.noteStudio.notes[0].id;
      renderNoteStudio();
    });
  }

  function activeNoteStudio() { return (state.noteStudio.notes || []).filter(function (note) { return Number(note.id) === Number(state.noteId); })[0] || null; }

  function renderNoteStudio() {
    var studio = state.noteStudio || { notes: [], trash: [] }; var notes = studio.notes || []; var trash = studio.trash || [];
    var list = $('#noteList'); var editor = $('#noteEditor'); var title = $('#noteTitle'); var style = $('#noteStyle'); var remove = $('#noteDelete');
    $('#noteTrash').textContent = state.noteTrashOpen ? '返回笔记' : '回收站' + (trash.length ? ' (' + trash.length + ')' : '');
    if (state.noteTrashOpen) {
      list.innerHTML = recycleBinToolbar('note', '笔记', trash.length) + (trash.length ? trash.map(function (entry) { return '<div class="note-trash-row"><div><b>' + escapeHtml((entry.item || {}).title || '未命名笔记') + '</b><span>' + escapeHtml(entry.deletedAt || '') + '</span></div><div><button type="button" data-note-restore="' + entry.id + '">恢复</button><button type="button" data-note-purge="' + entry.id + '">彻底删除</button></div></div>'; }).join('') : '<div class="note-list-empty">回收站为空</div>');
      title.value = ''; title.disabled = true; editor.value = ''; editor.disabled = true; style.disabled = true; remove.hidden = true; $('#notePreview').innerHTML = '<div class="note-empty">可在左侧恢复误删笔记。</div>'; return;
    }
    if (!notes.some(function (note) { return Number(note.id) === Number(state.noteId); })) state.noteId = notes[0] ? notes[0].id : null;
    var active = activeNoteStudio();
    list.innerHTML = notes.length ? '<div class="note-list-label">我的笔记 <span>' + notes.length + '</span></div>' + notes.map(function (note) { return '<button type="button" class="note-list-item' + (Number(note.id) === Number(state.noteId) ? ' is-active' : '') + '" data-note-id="' + note.id + '"><b>' + escapeHtml(note.title || '未命名笔记') + '</b><span>' + escapeHtml(note.updated || '') + '</span></button>'; }).join('') : '<div class="note-list-empty">还没有笔记<br>点击右上角新建</div>';
    title.disabled = !active; editor.disabled = !active; style.disabled = !active; remove.hidden = !active;
    title.value = active ? active.title || '' : ''; editor.value = active ? active.markdown || '' : ''; style.value = active ? active.style || 'paper' : 'paper';
    renderNotePreview();
  }

  function renderNotePreview() {
    var preview = $('#notePreview'); if (!preview) return;
    var markdown = $('#noteEditor') ? $('#noteEditor').value : '';
    var title = $('#noteTitle') ? $('#noteTitle').value.trim() : '';
    preview.dataset.noteStyle = $('#noteStyle') ? $('#noteStyle').value : 'paper';
    preview.innerHTML = markdown.trim() ? (title && !/^#\s+/.test(markdown) ? '<h1>' + escapeHtml(title) + '</h1>' : '') + renderKnowledgeMarkdown(markdown) : '<div class="note-empty">从左侧开始写作，这里会生成公众号排版预览。</div>';
    renderKnowledgeFormulas(preview);
  }

  function readNotePayload() { return { action: 'save', id: state.noteId, title: $('#noteTitle').value, markdown: $('#noteEditor').value, style: $('#noteStyle').value }; }
  function persistNoteStudio(body, automatic) { return api('/api/note-studio', { method: 'POST', body: JSON.stringify(body) }).then(function (res) { if (!res.ok) throw new Error(res.error || '保存失败'); state.noteStudio = res.noteStudio; if (!automatic) { renderNoteStudio(); setManualSaveStatus($('#noteSave'), 'saved'); toast('笔记已同步保存'); } }).catch(function (error) { if (!automatic) setManualSaveStatus($('#noteSave'), 'error'); throw error; }); }
  function queueNoteAutoSave() { if (!state.noteId || state.noteTrashOpen) return; var body = readNotePayload(); queueAutoSave('note:' + body.id, body, persistNoteStudio); }
  function saveNoteStudio() { if (!state.noteId) return; var body = readNotePayload(); setManualSaveStatus($('#noteSave'), 'saving'); return saveImmediately('note:' + body.id, body, persistNoteStudio); }

  function newNoteStudio() { api('/api/note-studio', { method: 'POST', body: JSON.stringify({ action: 'create' }) }).then(function (res) { if (!res.ok) { toast(res.error || '新建失败'); return; } state.noteStudio = res.noteStudio; state.noteTrashOpen = false; state.noteId = res.noteStudio.notes[0].id; renderNoteStudio(); $('#noteTitle').focus(); }); }
  function trashNoteStudio() { if (!state.noteId || !confirm('确定将这篇笔记移入回收站吗？')) return; api('/api/note-studio', { method: 'POST', body: JSON.stringify({ action: 'trash', id: state.noteId }) }).then(function (res) { if (!res.ok) { toast(res.error || '移入回收站失败'); return; } state.noteStudio = res.noteStudio; state.noteId = null; renderNoteStudio(); toast('笔记已移入回收站'); }); }
  function restoreNoteStudio(id) { api('/api/note-studio', { method: 'POST', body: JSON.stringify({ action: 'restore', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '恢复失败'); return; } state.noteStudio = res.noteStudio; renderNoteStudio(); toast('笔记已恢复'); }); }
  function purgeNoteStudio(id) { if (!confirm('确定彻底删除这篇笔记吗？此操作无法恢复。')) return; api('/api/note-studio', { method: 'POST', body: JSON.stringify({ action: 'purge', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '彻底删除失败'); return; } state.noteStudio = res.noteStudio; renderNoteStudio(); toast('已彻底删除'); }); }

  function noteCopyHtml() {
    var preview = $('#notePreview');
    var article = preview.cloneNode(true);
    article.removeAttribute('id'); article.removeAttribute('data-note-style');
    article.style.cssText = 'max-width:677px;margin:0 auto;padding:20px 16px;color:#333;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.85;letter-spacing:.05em;box-sizing:border-box;';
    var style = $('#noteStyle').value || 'paper';
    var accent = style === 'mint' ? '#0f766e' : style === 'ink' ? '#1f2937' : '#a16207';
    article.querySelectorAll('h1').forEach(function (el) { el.style.cssText = 'margin:28px 0 18px;padding-bottom:12px;border-bottom:2px solid ' + accent + ';color:#1f2937;font-size:26px;line-height:1.4;font-weight:700;'; });
    article.querySelectorAll('h2').forEach(function (el) { el.style.cssText = 'margin:26px 0 14px;padding-left:10px;border-left:4px solid ' + accent + ';color:#222;font-size:20px;line-height:1.5;font-weight:700;'; });
    article.querySelectorAll('h3').forEach(function (el) { el.style.cssText = 'margin:20px 0 10px;color:' + accent + ';font-size:17px;font-weight:700;'; });
    article.querySelectorAll('p').forEach(function (el) { el.style.cssText = 'margin:0 0 16px;'; });
    article.querySelectorAll('blockquote').forEach(function (el) { el.style.cssText = 'margin:18px 0;padding:12px 15px;border-left:4px solid ' + accent + ';background:#f7f7f5;color:#5b5b5b;'; });
    article.querySelectorAll('ul').forEach(function (el) { el.style.cssText = 'margin:0 0 16px;padding-left:24px;'; });
    article.querySelectorAll('li').forEach(function (el) { el.style.cssText = 'margin:6px 0;'; });
    article.querySelectorAll('pre').forEach(function (el) { el.style.cssText = 'overflow:auto;margin:18px 0;padding:14px;border-radius:6px;background:#282c34;color:#f3f4f6;font-family:monospace;font-size:13px;line-height:1.6;'; });
    article.querySelectorAll('code').forEach(function (el) { if (el.parentElement.tagName.toLowerCase() !== 'pre') el.style.cssText = 'padding:2px 5px;border-radius:3px;background:#f1f1ef;color:#c2410c;font-family:monospace;font-size:.9em;'; });
    article.querySelectorAll('a').forEach(function (el) { el.style.cssText = 'color:' + accent + ';text-decoration:underline;'; });
    return article.outerHTML;
  }

  function bindNoteTextColor() {
    var editor = $('#noteEditor');
    var picker = $('#noteTextColor');
    if (!editor || !picker) return;
    var savedSelection = { start: 0, end: 0 };
    function rememberSelection() { savedSelection = { start: editor.selectionStart, end: editor.selectionEnd }; }
    picker.addEventListener('pointerdown', rememberSelection);
    picker.addEventListener('focus', rememberSelection);
    picker.addEventListener('change', function () {
      var color = normalizeKnowledgeColor(picker.value);
      var start = savedSelection.start;
      var end = savedSelection.end;
      if (!color || start === end) { toast('请先在正文中选中文字，再选择颜色'); return; }
      var selectedText = editor.value.slice(start, end);
      if (!selectedText.trim()) { toast('请先在正文中选中文字，再选择颜色'); return; }
      var opening = '<span style="color:' + color + '">';
      editor.setRangeText(opening + selectedText + '</span>', start, end, 'select');
      editor.focus();
      editor.setSelectionRange(start + opening.length, start + opening.length + selectedText.length);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function copyNoteForWechat() {
    var markdown = ($('#noteEditor').value || '').trim();
    if (!markdown) { toast('请先写一点内容'); return; }
    var html = noteCopyHtml();
    if (navigator.clipboard && window.ClipboardItem) {
      var data = { 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([$('#notePreview').innerText], { type: 'text/plain' }) };
      navigator.clipboard.write([new ClipboardItem(data)]).then(function () { toast('已复制公众号格式，可直接粘贴到编辑器'); }).catch(function () { navigator.clipboard.writeText($('#notePreview').innerText).then(function () { toast('已复制文本，请在公众号编辑器中粘贴'); }); });
    } else {
      var ta = document.createElement('textarea'); ta.value = $('#notePreview').innerText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制文本');
    }
  }

  // ===== 知识库：目录、文档与账号同步 =====
  function loadKnowledgeBase() {
    return api('/api/knowledge-base').then(function (res) {
      if (!res.ok) { toast(res.error || '请先登录后使用知识库'); return; }
      state.knowledgeBase = res.knowledgeBase || { folders: [], docs: [] };
      renderKnowledgeBase();
    });
  }

  function extractKnowledgeHeadings(content) {
    return String(content || '').split(/\r?\n/).map(function (line) {
      // 兼容早期保存的“#标题”写法；重新保存后会统一为标准 Markdown 的“# 标题”。
      var matched = line.match(/^(#{1,4})\s*(\S.*?)\s*$/);
      return matched ? { level: matched[1].length, text: matched[2].trim() } : null;
    }).filter(Boolean).slice(0, 20);
  }

  function renderKnowledgeDocItem(doc) {
    var headings = extractKnowledgeHeadings(doc.content);
    var documentButton = '<div class="kb-doc-row"><button class="kb-doc' + (doc.id === state.kbDocId ? ' is-active' : '') + '" data-kb-doc="' + doc.id + '" draggable="true" title="拖动排序"><b>' + escapeHtml(doc.title || '未命名文档') + '</b><span>' + escapeHtml(doc.updated || '') + '</span></button><button type="button" class="kb-delete-button" data-kb-delete-doc="' + doc.id + '" title="删除文档" aria-label="删除文档">×</button></div>';
    var outline = headings.length ? '<div class="kb-doc-outline" aria-label="文档大纲">' + headings.map(function (heading) { return '<button type="button" class="kb-doc-heading" data-kb-heading="' + escapeHtml(heading.text) + '" data-kb-doc="' + doc.id + '" data-kb-level="' + heading.level + '">' + escapeHtml(heading.text) + '</button>'; }).join('') + '</div>' : '';
    return '<div class="kb-doc-group">' + documentButton + outline + '</div>';
  }

  function scrollToKnowledgeHeading() {
    var wanted = state.kbHeadingTarget;
    if (!wanted) return;
    var target = $$('#kbRichEditor h1, #kbRichEditor h2, #kbRichEditor h3, #kbRichEditor h4, .kb-markdown-preview h1, .kb-markdown-preview h2, .kb-markdown-preview h3, .kb-markdown-preview h4').filter(function (item) { return item.textContent.trim() === wanted; })[0];
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    state.kbHeadingTarget = null;
  }

  function renderKnowledgeBase() {
    var kb = state.knowledgeBase || { folders: [], docs: [] };
    var folders = kb.folders || [];
    var docs = kb.docs || [];
    var trash = kb.trash || [];
    var trashToggle = $('#kbTrashToggle');
    if (trashToggle) trashToggle.textContent = state.kbTrashOpen ? '返回知识库' : '回收站' + (trash.length ? ' (' + trash.length + ')' : '');
    if (state.kbTrashOpen) {
      $('#kbFolders').innerHTML = '<div class="kb-trash-note">回收站中的内容不会自动删除。</div>';
      $('#kbDocs').innerHTML = recycleBinToolbar('knowledge', '知识库', trash.length) + (trash.length ? trash.map(function (entry) { var item = entry.item || {}; return '<div class="kb-trash-item"><div><b>' + escapeHtml(item.title || '未命名项目') + '</b><span>' + (entry.type === 'folder' ? '文件夹' : '文档') + ' · ' + escapeHtml(entry.deletedAt || '') + '</span></div><div><button type="button" data-kb-restore-trash="' + entry.id + '">恢复</button><button type="button" class="kb-purge-button" data-kb-purge-trash="' + entry.id + '">彻底删除</button></div></div>'; }).join('') : '<div class="kb-empty">回收站为空</div>');
      $('#kbEditor').innerHTML = '<div class="kb-editor-empty">可在此恢复误删内容，或选择彻底删除。</div>';
      return;
    }
    var folderId = state.kbFolderId || 'all';
    var visibleDocs = folderId === 'all' ? docs : docs.filter(function (doc) { return String(doc.folderId) === String(folderId); });
    if (!visibleDocs.some(function (doc) { return doc.id === state.kbDocId; })) state.kbDocId = visibleDocs[0] ? visibleDocs[0].id : null;
    var active = docs.filter(function (doc) { return doc.id === state.kbDocId; })[0] || null;
    var draft = state.kbDraft && active && state.kbDraft.id === active.id ? state.kbDraft : active;
    $('#kbFolders').innerHTML = '<button class="kb-folder' + (folderId === 'all' ? ' is-active' : '') + '" data-kb-folder="all">全部文档 <span>' + docs.length + '</span></button>' + folders.map(function (folder) { return '<div class="kb-folder-row"><button class="kb-folder' + (String(folder.id) === String(folderId) ? ' is-active' : '') + '" data-kb-folder="' + folder.id + '">' + escapeHtml(folder.title) + '<span>' + docs.filter(function (doc) { return String(doc.folderId) === String(folder.id); }).length + '</span></button><button type="button" class="kb-delete-button" data-kb-delete-folder="' + folder.id + '" title="删除文件夹" aria-label="删除文件夹">×</button></div>'; }).join('');
    $('#kbDocs').innerHTML = visibleDocs.length ? visibleDocs.map(renderKnowledgeDocItem).join('') : '<div class="kb-empty">此目录还没有文档</div>';
    var mode = state.kbEditorMode || 'edit';
    $('#kbEditor').innerHTML = active ? '<div class="kb-editor-tabs"><button type="button" class="' + (mode === 'edit' ? 'is-active' : '') + '" data-kb-mode="edit">编辑</button><button type="button" class="' + (mode === 'preview' ? 'is-active' : '') + '" data-kb-mode="preview">预览</button><span>Markdown</span></div><input id="kbDocTitle" class="kb-doc-title" value="' + escapeHtml(draft.title || '') + '" placeholder="文档标题"><select id="kbDocFolder"><option value="">未分类</option>' + folders.map(function (folder) { return '<option value="' + folder.id + '"' + (String(folder.id) === String(draft.folderId) ? ' selected' : '') + '>' + escapeHtml(folder.title) + '</option>'; }).join('') + '</select>' + (mode === 'preview' ? '<article class="kb-markdown-preview">' + renderKnowledgeMarkdown(draft.content || '') + '</article>' : '<textarea id="kbDocContent" class="kb-doc-content" placeholder="# 标题\n\n使用 Markdown 记录你的想法、文献笔记和研究材料…">' + escapeHtml(draft.content || '') + '</textarea>') + '<div class="kb-editor-foot"><span>Markdown · 最近更新：' + escapeHtml(active.updated || '尚未保存') + '</span><button id="kbSaveDoc" type="button">立即保存</button></div>' : '<div class="kb-editor-empty">' + (folderId === 'all' ? '选择左侧文档，或新建一篇文档开始记录。' : '此文件夹还没有文档，可在此文件夹中新建文档。') + '</div>';
    var editorFoot = $('.kb-editor-foot', $('#kbEditor'));
    if (editorFoot) { var historyButton = document.createElement('button'); historyButton.type = 'button'; historyButton.dataset.versionHistory = 'knowledge'; historyButton.textContent = '版本记录' + (active.versions && active.versions.length ? ' (' + active.versions.length + ')' : ''); editorFoot.insertBefore(historyButton, $('#kbSaveDoc')); }
    var save = $('#kbSaveDoc'); if (save) save.addEventListener('click', saveKnowledgeDoc);
  }

  const renderKnowledgeBaseStandard = renderKnowledgeBase;
  renderKnowledgeBase = function () {
    state.kbEditorMode = 'rich';
    renderKnowledgeBaseStandard();
    var source = $('#kbDocContent');
    if (!source) return;
    var tabs = $('.kb-editor-tabs');
    if (tabs) tabs.innerHTML = '<button type="button" class="is-active" data-kb-mode="rich">Markdown</button>';
    var rich = document.createElement('div');
    rich.id = 'kbRichEditor'; rich.className = 'kb-rich-editor'; rich.contentEditable = 'true';
    rich.setAttribute('role', 'textbox'); rich.setAttribute('aria-label', '所见即所得文档编辑器');
    rich.innerHTML = renderKnowledgeMarkdown(source.value || '');
    rich.addEventListener('keydown', function (event) {
      if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (autoFormatKnowledgeCurrentLine(rich, true) || autoFormatKnowledgeHeading(rich, true) || autoFormatKnowledgeFormula(rich, true)) event.preventDefault();
    });
    // 不依赖 inputType / data：部分浏览器和中文输入法不会在 input 事件中返回空格字符。
    // 只在当前段落已经符合 Markdown 触发语法时才会转换，因此每次输入检查也不会影响普通文本。
    rich.addEventListener('input', function () { if (!autoFormatKnowledgeCurrentLine(rich, false)) { autoFormatKnowledgeHeading(rich, false); autoFormatKnowledgeFormula(rich, false); } });
    source.replaceWith(rich);
    renderKnowledgeFormulas(rich);
    var toolbar = document.createElement('div');
    toolbar.className = 'kb-rich-toolbar';
    toolbar.innerHTML = '<button type="button" data-kb-command="h1" title="一级标题">H1</button><button type="button" data-kb-command="h2" title="二级标题">H2</button><button type="button" data-kb-command="h3" title="三级标题">H3</button><button type="button" data-kb-command="h4" title="四级标题">H4</button><span class="kb-toolbar-divider" aria-hidden="true"></span><button type="button" data-kb-command="bold" title="加粗"><b>B</b></button><button type="button" data-kb-command="italic" title="斜体"><i>I</i></button><button type="button" data-kb-command="strike" title="删除线"><s>S</s></button><button type="button" data-kb-command="inline-code" title="行内代码">&lt;/&gt;</button><span class="kb-toolbar-divider" aria-hidden="true"></span><button type="button" data-kb-command="list" title="无序列表">列表</button><button type="button" data-kb-command="ordered-list" title="有序列表">1.</button><button type="button" data-kb-command="quote">引用</button><button type="button" data-kb-command="code">代码块</button><button type="button" data-kb-command="divider" title="分隔线">—</button><button type="button" data-kb-command="link">链接</button><span class="kb-font-size-picker" title="先选中文字，再设置字号"><button type="button" data-kb-font-size-toggle aria-expanded="false">字号</button><span id="kbFontSizeMenu" class="kb-font-size-menu" hidden><button type="button" data-kb-font-size="12">12</button><button type="button" data-kb-font-size="14">14</button><button type="button" data-kb-font-size="16">16</button><button type="button" data-kb-font-size="18">18</button><button type="button" data-kb-font-size="20">20</button><button type="button" data-kb-font-size="24">24</button></span></span><label class="kb-color-picker" title="先选中文字，再设置字体颜色">文字颜色 <input id="kbTextColor" type="color" value="#c0392b" aria-label="设置选中文字颜色"></label>';
    rich.before(toolbar);
    toolbar.addEventListener('mousedown', function (event) { if (event.target.closest('button[data-kb-command], button[data-kb-font-size-toggle], button[data-kb-font-size]')) event.preventDefault(); });
    var colorPicker = $('#kbTextColor', toolbar);
    var fontSizeMenu = $('#kbFontSizeMenu', toolbar);
    var fontSizeToggle = $('[data-kb-font-size-toggle]', toolbar);
    var savedRange = null;
    function rememberRichSelection() {
      var selection = window.getSelection();
      if (selection && selection.rangeCount && editorContainsSelection(rich, selection)) savedRange = selection.getRangeAt(0).cloneRange();
    }
    colorPicker.addEventListener('pointerdown', rememberRichSelection);
    colorPicker.addEventListener('focus', rememberRichSelection);
    toolbar.addEventListener('pointerdown', function (event) { if (event.target.closest('[data-kb-font-size-toggle], [data-kb-font-size]')) rememberRichSelection(); });
    colorPicker.addEventListener('change', function () {
      var color = normalizeKnowledgeColor(colorPicker.value);
      var selection = window.getSelection();
      if (!color || !savedRange || !rich.contains(savedRange.commonAncestorContainer) || savedRange.collapsed) { toast('请先在正文中选中文字，再选择颜色'); return; }
      rich.focus();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(savedRange);
      var range = selection.getRangeAt(0);
      if (!range.toString().trim()) { toast('请先在正文中选中文字，再选择颜色'); return; }
      var colored = document.createElement('span');
      colored.style.color = color;
      colored.appendChild(range.extractContents());
      range.insertNode(colored);
      selection.removeAllRanges();
      range.selectNodeContents(colored);
      selection.addRange(range);
      savedRange = null;
      queueKnowledgeAutoSave();
    });
    toolbar.addEventListener('click', function (event) {
      if (event.target.closest('[data-kb-font-size-toggle]')) {
        var willOpen = fontSizeMenu.hidden;
        fontSizeMenu.hidden = !willOpen;
        fontSizeToggle.setAttribute('aria-expanded', String(willOpen));
        return;
      }
      var option = event.target.closest('[data-kb-font-size]');
      if (!option) return;
      var fontSize = normalizeKnowledgeFontSize(option.dataset.kbFontSize);
      fontSizeMenu.hidden = true;
      fontSizeToggle.setAttribute('aria-expanded', 'false');
      if (!fontSize || !savedRange || !rich.contains(savedRange.commonAncestorContainer) || savedRange.collapsed) { toast('请先在正文中选中文字，再选择字号'); return; }
      var selection = window.getSelection();
      rich.focus();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(savedRange);
      var range = selection.getRangeAt(0);
      if (!range.toString().trim()) { toast('请先在正文中选中文字，再选择字号'); return; }
      var sized = document.createElement('span');
      sized.style.fontSize = fontSize + 'px';
      sized.appendChild(range.extractContents());
      range.insertNode(sized);
      selection.removeAllRanges();
      range.selectNodeContents(sized);
      selection.addRange(range);
      savedRange = null;
      queueKnowledgeAutoSave();
    });
  };

  function editorContainsSelection(editor, selection) {
    return !!(selection.anchorNode && selection.focusNode && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode));
  }

  function runKnowledgeRichCommand(command) {
    var editor = $('#kbRichEditor');
    if (!editor) return;
    editor.focus();
    if (/^h[1-4]$/.test(command)) document.execCommand('formatBlock', false, command.toUpperCase());
    else if (command === 'list') document.execCommand('insertUnorderedList', false, null);
    else if (command === 'ordered-list') document.execCommand('insertOrderedList', false, null);
    else if (command === 'quote') document.execCommand('formatBlock', false, 'BLOCKQUOTE');
    else if (command === 'code') document.execCommand('formatBlock', false, 'PRE');
    else if (command === 'strike') document.execCommand('strikeThrough', false, null);
    else if (command === 'divider') document.execCommand('insertHorizontalRule', false, null);
    else if (command === 'inline-code') wrapKnowledgeSelection(editor, 'code');
    else if (command === 'link') { var url = prompt('链接地址（https://…）：'); if (url && /^https?:\/\//i.test(url.trim())) document.execCommand('createLink', false, url.trim()); }
    else document.execCommand(command, false, null);
  }

  function wrapKnowledgeSelection(editor, tagName) {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount || !editorContainsSelection(editor, selection)) return;
    var range = selection.getRangeAt(0);
    if (range.collapsed || !range.toString().trim()) { toast('请先在正文中选中文字'); return; }
    var wrapper = document.createElement(tagName);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    selection.removeAllRanges();
    range.selectNodeContents(wrapper);
    selection.addRange(range);
    queueKnowledgeAutoSave();
  }

  function currentKnowledgeLine(editor) {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !editorContainsSelection(editor, selection)) return null;
    var original = selection.getRangeAt(0).cloneRange();
    try {
      // lineboundary 由浏览器按真实换行计算，适用于已有文档的 <p>、<div>、<br> 等不同结构。
      if (typeof selection.modify !== 'function') return null;
      selection.modify('extend', 'backward', 'lineboundary');
      var lineRange = selection.getRangeAt(0).cloneRange();
      var text = selection.toString().replace(/\u00a0/g, ' ');
      return { range: lineRange, text: text };
    } finally {
      selection.removeAllRanges();
      selection.addRange(original);
    }
  }

  function selectKnowledgeRange(range) {
    var selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function clearKnowledgeLine(range) {
    range.deleteContents();
    range.collapse(true);
    return selectKnowledgeRange(range);
  }

  function autoFormatKnowledgeCurrentLine(editor, beforeSpace) {
    var line = currentKnowledgeLine(editor);
    if (!line) return false;
    var heading = line.text.match(beforeSpace ? /^(#{1,4})\s?([^#\s].*?)$/ : /^(#{1,4})\s?([^#\s].*?)\s+$/);
    if (heading) {
      if (!clearKnowledgeLine(line.range)) return false;
      document.execCommand('formatBlock', false, 'H' + heading[1].length);
      document.execCommand('insertText', false, heading[2]);
      return true;
    }
    var list = line.text.match(beforeSpace ? /^[-*]$/ : /^[-*]\s+$/);
    if (list) {
      if (!clearKnowledgeLine(line.range)) return false;
      document.execCommand('insertUnorderedList', false, null);
      return true;
    }
    var formulaText = beforeSpace ? line.text : line.text.replace(/\s+$/, '');
    var formulaMatch = formulaText.match(/^\$\$([\s\S]+)\$\$$/) || formulaText.match(/^\$([^$]+)\$$/);
    if (!formulaMatch || !clearKnowledgeLine(line.range)) return false;
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    var isBlock = formulaText.indexOf('$$') === 0;
    var formula = document.createElement(isBlock ? 'div' : 'span');
    formula.className = isBlock ? 'kb-formula-block' : 'kb-inline-formula';
    formula.dataset.formula = formulaMatch[1]; formula.contentEditable = 'false';
    formula.setAttribute('aria-label', '公式：' + formulaMatch[1]);
    var insertAt = selection.getRangeAt(0); insertAt.insertNode(formula);
    renderKnowledgeFormula(formula);
    insertAt.setStartAfter(formula); insertAt.collapse(true);
    selection.removeAllRanges(); selection.addRange(insertAt);
    return true;
  }

  function autoFormatKnowledgeHeading(editor, beforeSpace) {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    var node = selection.anchorNode;
    var block = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    while (block && block.parentElement !== editor) block = block.parentElement;
    if (!block || block === editor) block = editor;
    var text = (block.textContent || '').replace(/\u00a0/g, ' ');
    var matched = text.match(beforeSpace ? /^(#{1,4})\s?([^#\s].*?)$/ : /^(#{1,4})\s?([^#\s].*?)\s+$/);
    if (!matched) return false;
    var heading = document.createElement('h' + matched[1].length);
    heading.textContent = matched[2];
    if (block === editor) { editor.textContent = ''; editor.appendChild(heading); }
    else block.replaceWith(heading);
    var range = document.createRange(); range.selectNodeContents(heading); range.collapse(false);
    selection.removeAllRanges(); selection.addRange(range);
    return true;
  }

  function autoFormatKnowledgeFormula(editor, beforeSpace) {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    var node = selection.anchorNode;
    var block = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    while (block && block.parentElement !== editor) block = block.parentElement;
    if (!block || block === editor) block = editor;
    var text = (block.textContent || '').replace(/\u00a0/g, ' ');
    var candidate = beforeSpace ? text : text.replace(/\s+$/, '');
    var matched = candidate.match(/^\$\$([\s\S]+)\$\$$/) || candidate.match(/^\$([^$]+)\$$/);
    if (!matched) return false;
    var isBlock = candidate.indexOf('$$') === 0;
    var formula = document.createElement(isBlock ? 'div' : 'span');
    formula.className = isBlock ? 'kb-formula-block' : 'kb-inline-formula';
    formula.dataset.formula = matched[1]; formula.contentEditable = 'false';
    formula.setAttribute('aria-label', '公式：' + matched[1]);
    if (block === editor) { editor.textContent = ''; editor.appendChild(formula); }
    else block.replaceWith(formula);
    renderKnowledgeFormula(formula);
    var range = document.createRange(); range.setStartAfter(formula); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    return true;
  }

  function renderKnowledgeFormula(element) {
    var formula = element.dataset.formula || '';
    if (window.katex) { try { window.katex.render(formula, element, { displayMode: element.classList.contains('kb-formula-block'), throwOnError: false }); return; } catch (error) {} }
    element.textContent = formula;
  }

  function renderKnowledgeFormulas(root) {
    if (!root) return;
    $$('.kb-inline-formula, .kb-formula-block', root).forEach(renderKnowledgeFormula);
  }

  function richEditorToMarkdown(root) {
    function isBlock(node) {
      return node.nodeType === Node.ELEMENT_NODE && /^(h1|h2|h3|h4|p|div|blockquote|pre|ul|ol|li|hr)$/.test(node.tagName.toLowerCase());
    }
    function walkChildren(parent) {
      var output = '';
      var pendingBreaks = 0;
      var previousBlock = false;
      Array.from(parent.childNodes).forEach(function (child) {
        if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'br') { pendingBreaks += 1; return; }
        var block = isBlock(child);
        if (block) {
          if (previousBlock) output += '\n'.repeat(pendingBreaks + 1);
          else if (pendingBreaks) output += '\n'.repeat(pendingBreaks);
          else if (output) output += '\n';
          output += walk(child);
          previousBlock = true;
        } else {
          if (pendingBreaks) output += '\n'.repeat(pendingBreaks);
          output += walk(child);
          previousBlock = false;
        }
        pendingBreaks = 0;
      });
      if (pendingBreaks) output += '\n'.repeat(pendingBreaks);
      return output;
    }
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      var tag = node.tagName.toLowerCase();
      var inner = walkChildren(node);
      if (node.classList.contains('kb-inline-formula')) return '$' + (node.dataset.formula || '') + '$';
      if (node.classList.contains('kb-formula-block')) return '$$' + (node.dataset.formula || '') + '$$';
      var color = tag === 'font' ? normalizeKnowledgeColor(node.getAttribute('color')) : (tag === 'span' ? normalizeKnowledgeColor(node.style.color) : '');
      var fontSize = tag === 'span' ? normalizeKnowledgeFontSize(node.style.fontSize) : '';
      if (color || fontSize) return '<span style="' + (color ? 'color:' + color : '') + (color && fontSize ? ';' : '') + (fontSize ? 'font-size:' + fontSize + 'px' : '') + '">' + inner + '</span>';
      if (tag === 'h1') return '# ' + inner;
      if (tag === 'h2') return '## ' + inner;
      if (tag === 'h3') return '### ' + inner;
      if (tag === 'h4') return '#### ' + inner;
      if (tag === 'strong' || tag === 'b') return '**' + inner + '**';
      if (tag === 'em' || tag === 'i') return '*' + inner + '*';
      if (tag === 's' || tag === 'strike' || tag === 'del') return '~~' + inner + '~~';
      if (tag === 'code' && node.parentElement && node.parentElement.tagName.toLowerCase() !== 'pre') return '`' + inner + '`';
      if (tag === 'pre') return '```\n' + (node.textContent || '') + '\n```';
      if (tag === 'blockquote') return '> ' + inner.replace(/\n/g, '\n> ');
      if (tag === 'li') return '- ' + inner;
      if (tag === 'ul') return Array.from(node.children).map(function (item) { return walk(item); }).join('\n');
      if (tag === 'ol') return Array.from(node.children).map(function (item, index) { return (index + 1) + '. ' + walkChildren(item); }).join('\n');
      if (tag === 'hr') return '---';
      if (tag === 'a') return '[' + inner + '](' + (node.getAttribute('href') || '') + ')';
      if (tag === 'br') return '\n';
      return inner;
    }
    return walkChildren(root);
  }

  function newKnowledgeDoc() {
    var title = '未命名文档';
    api('/api/knowledge-base', { method: 'POST', body: JSON.stringify({ action: 'create-doc', title: title, folderId: state.kbFolderId === 'all' ? '' : state.kbFolderId }) }).then(function (res) { if (!res.ok) { toast(res.error || '请先登录后创建'); return; } state.knowledgeBase = res.knowledgeBase; state.kbDocId = res.knowledgeBase.docs[0].id; state.kbDraft = null; state.kbEditorMode = 'rich'; renderKnowledgeBase(); });
  }

  function reorderKnowledgeDoc(fromId, toId) {
    if (fromId === toId || !state.knowledgeBase) return;
    var docs = state.knowledgeBase.docs || [];
    var from = docs.findIndex(function (doc) { return doc.id === fromId; });
    var to = docs.findIndex(function (doc) { return doc.id === toId; });
    if (from < 0 || to < 0) return;
    var moved = docs.splice(from, 1)[0]; docs.splice(to, 0, moved);
    state.kbDraggingDocId = null; renderKnowledgeBase();
    api('/api/knowledge-base', { method: 'POST', body: JSON.stringify({ action: 'reorder-docs', ids: docs.map(function (doc) { return doc.id; }) }) }).then(function (res) { if (!res.ok) { toast(res.error || '排序保存失败'); return; } state.knowledgeBase = res.knowledgeBase; renderKnowledgeBase(); toast('文档顺序已同步'); });
  }

  function newKnowledgeFolder() {
    var title = prompt('文件夹名称：');
    if (!title || !title.trim()) return;
    api('/api/knowledge-base', { method: 'POST', body: JSON.stringify({ action: 'create-folder', title: title.trim() }) }).then(function (res) { if (!res.ok) { toast(res.error || '请先登录后创建'); return; } state.knowledgeBase = res.knowledgeBase; renderKnowledgeBase(); });
  }

  function deleteKnowledgeDoc(id) {
    if (!confirm('确定将这篇文档移入回收站吗？')) return;
    api('/api/knowledge-base', { method: 'POST', body: JSON.stringify({ action: 'trash-doc', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '移入回收站失败'); return; } state.knowledgeBase = res.knowledgeBase; state.kbDocId = null; state.kbDraft = null; renderKnowledgeBase(); toast('文档已移入回收站'); });
  }

  function deleteKnowledgeFolder(id) {
    if (!confirm('确定将此文件夹移入回收站吗？其中的文档会保留，并移至“全部文档”。')) return;
    api('/api/knowledge-base', { method: 'POST', body: JSON.stringify({ action: 'trash-folder', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '移入回收站失败'); return; } state.knowledgeBase = res.knowledgeBase; state.kbFolderId = 'all'; renderKnowledgeBase(); toast('文件夹已移入回收站，文档已保留'); });
  }

  function restoreKnowledgeTrash(id) {
    api('/api/knowledge-base', { method: 'POST', body: JSON.stringify({ action: 'restore-trash', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '恢复失败'); return; } state.knowledgeBase = res.knowledgeBase; renderKnowledgeBase(); toast('已恢复到知识库'); });
  }

  function purgeKnowledgeTrash(id) {
    if (!confirm('确定彻底删除吗？此操作无法恢复。')) return;
    api('/api/knowledge-base', { method: 'POST', body: JSON.stringify({ action: 'purge-trash', id: id }) }).then(function (res) { if (!res.ok) { toast(res.error || '彻底删除失败'); return; } state.knowledgeBase = res.knowledgeBase; renderKnowledgeBase(); toast('已彻底删除'); });
  }

  function knowledgePayload() { var draft = readKnowledgeDraft(); return { action: 'save-doc', id: draft.id, title: draft.title, content: draft.content, folderId: draft.folderId }; }
  function persistKnowledgeDoc(body, automatic) { return api('/api/knowledge-base', { method: 'POST', body: JSON.stringify(body) }).then(function (res) { if (!res.ok) throw new Error(res.error || '保存失败'); state.knowledgeBase = res.knowledgeBase; if (!automatic) { state.kbDraft = null; var savedDoc = (res.knowledgeBase.docs || []).filter(function (doc) { return String(doc.id) === String(body.id); })[0]; var row = $('#kbDocs [data-kb-doc="' + body.id + '"]'); if (row && row.parentElement) row.parentElement.outerHTML = renderKnowledgeDocItem(savedDoc || body); var label = $('.kb-editor-foot > span', $('#kbEditor')); if (label && savedDoc) label.textContent = 'Markdown · 最近更新：' + (savedDoc.updated || '已保存'); setManualSaveStatus($('#kbSaveDoc'), 'saved'); toast('Markdown 文档已同步保存'); } }).catch(function (error) { if (!automatic) setManualSaveStatus($('#kbSaveDoc'), 'error'); throw error; }); }
  function queueKnowledgeAutoSave() { if (!state.kbDocId || state.kbTrashOpen) return; var body = knowledgePayload(); queueAutoSave('knowledge:' + body.id, body, persistKnowledgeDoc); }
  function saveKnowledgeDoc() { if (!state.kbDocId) return; var body = knowledgePayload(); setManualSaveStatus($('#kbSaveDoc'), 'saving'); return saveImmediately('knowledge:' + body.id, body, persistKnowledgeDoc); }

  function readKnowledgeDraft() {
    var active = ((state.knowledgeBase && state.knowledgeBase.docs) || []).filter(function (doc) { return doc.id === state.kbDocId; })[0] || {};
    var rich = $('#kbRichEditor');
    return { id: state.kbDocId, title: $('#kbDocTitle') ? $('#kbDocTitle').value : active.title || '', content: $('#kbDocContent') ? $('#kbDocContent').value : (rich ? richEditorToMarkdown(rich) : (state.kbDraft ? state.kbDraft.content : active.content || '')), folderId: $('#kbDocFolder') ? $('#kbDocFolder').value : (state.kbDraft ? state.kbDraft.folderId : active.folderId || '') };
  }

  function renderKnowledgeMarkdown(source) {
    var codeBlocks = [];
    var colorSpans = [];
    var raw = String(source || '').replace(/```([\s\S]*?)```/g, function (_, code) { var token = '@@KB_CODE_' + codeBlocks.length + '@@'; codeBlocks.push('<pre><code>' + escapeHtml(code.trim()) + '</code></pre>'); return token; });
    raw = extractKnowledgeColorTokens(raw, colorSpans);
    var text = escapeHtml(raw);
    var lines = text.split('\n'); var html = []; var listType = '';
    function closeList() { if (listType) { html.push('</' + listType + '>'); listType = ''; } }
    function openList(type) { if (listType !== type) { closeList(); html.push('<' + type + '>'); listType = type; } }
    lines.forEach(function (line) {
      if (/^@@KB_CODE_\d+@@$/.test(line)) { closeList(); html.push(line); return; }
      // 新旧文档都支持：# 标题 和 #标题 在编辑器中都会显示为标题。
      if (/^####\s*\S/.test(line)) { closeList(); html.push('<h4>' + markdownInline(line.replace(/^####\s*/, '')) + '</h4>'); return; }
      if (/^###\s*\S/.test(line)) { closeList(); html.push('<h3>' + markdownInline(line.replace(/^###\s*/, '')) + '</h3>'); return; }
      if (/^##\s*\S/.test(line)) { closeList(); html.push('<h2>' + markdownInline(line.replace(/^##\s*/, '')) + '</h2>'); return; }
      if (/^#\s*\S/.test(line)) { closeList(); html.push('<h1>' + markdownInline(line.replace(/^#\s*/, '')) + '</h1>'); return; }
      if (/^---+\s*$/.test(line)) { closeList(); html.push('<hr>'); return; }
      if (/^>\s?/.test(line)) { closeList(); html.push('<blockquote>' + markdownInline(line.replace(/^>\s?/, '')) + '</blockquote>'); return; }
      if (/^\d+\.\s+/.test(line)) { openList('ol'); html.push('<li>' + markdownInline(line.replace(/^\d+\.\s+/, '')) + '</li>'); return; }
      if (/^[-*]\s+/.test(line)) { openList('ul'); html.push('<li>' + markdownInline(line.replace(/^[-*]\s+/, '')) + '</li>'); return; }
      closeList(); html.push(line ? '<p>' + markdownInline(line) + '</p>' : '<br>');
    });
    closeList();
    return restoreKnowledgeColorTokens(html.join(''), colorSpans).replace(/@@KB_CODE_(\d+)@@/g, function (_, i) { return codeBlocks[Number(i)] || ''; });
  }

  function extractKnowledgeColorTokens(source, colorSpans) {
    var output = '';
    var index = 0;
    var opener = /<span\s+style\s*=\s*(["'])([^"']*)\1\s*>/i;
    while (index < source.length) {
      var opening = opener.exec(source.slice(index));
      if (!opening || opening.index !== 0) { output += source.charAt(index); index += 1; continue; }
      var contentStart = index + opening[0].length;
      var closing = findKnowledgeSpanEnd(source, contentStart);
      if (!closing) { output += opening[0]; index = contentStart; continue; }
      var color = normalizeKnowledgeColor((opening[2].match(/(?:^|;)\s*color\s*:\s*([^;]+)/i) || [])[1]);
      var fontSize = normalizeKnowledgeFontSize((opening[2].match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/i) || [])[1]);
      if (!color && !fontSize) { output += opening[0]; index = contentStart; continue; }
      var colorIndex = colorSpans.length;
      var token = '@@KB_COLOR_' + colorIndex + '@@';
      var content = source.slice(contentStart, closing.start);
      colorSpans.push(null);
      colorSpans[colorIndex] = { color: color, fontSize: fontSize, content: extractKnowledgeColorTokens(content, colorSpans) };
      output += token;
      index = closing.end;
    }
    return output;
  }

  function findKnowledgeSpanEnd(source, start) {
    var tags = /<\/?span\b[^>]*>/gi;
    tags.lastIndex = start;
    var depth = 1;
    var tag;
    while ((tag = tags.exec(source))) {
      if (/^<\//.test(tag[0])) depth -= 1;
      else if (!/\/\s*>$/.test(tag[0])) depth += 1;
      if (depth === 0) return { start: tag.index, end: tags.lastIndex };
    }
    return null;
  }

  function restoreKnowledgeColorTokens(html, colorSpans) {
    return html.replace(/@@KB_COLOR_(\d+)@@/g, function (_, i) {
      var colorSpan = colorSpans[Number(i)];
      if (!colorSpan) return '';
      var styles = [];
      if (colorSpan.color) styles.push('color:' + colorSpan.color);
      if (colorSpan.fontSize) styles.push('font-size:' + colorSpan.fontSize + 'px');
      return '<span style="' + styles.join(';') + '">' + restoreKnowledgeColorTokens(markdownInline(escapeHtml(colorSpan.content)), colorSpans) + '</span>';
    });
  }

  function normalizeKnowledgeColor(value) {
    var color = String(value || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(color)) return color;
    if (/^#[0-9a-f]{3}$/.test(color)) return '#' + color.slice(1).split('').map(function (digit) { return digit + digit; }).join('');
    var rgb = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
    if (!rgb || rgb.slice(1).some(function (part) { return Number(part) > 255; })) return '';
    return '#' + rgb.slice(1).map(function (part) { return Number(part).toString(16).padStart(2, '0'); }).join('');
  }

  function normalizeKnowledgeFontSize(value) {
    var matched = String(value || '').trim().match(/^(12|14|16|18|20|24)(?:px)?$/);
    return matched ? Number(matched[1]) : '';
  }

  function markdownInline(text) {
    return text.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\$([^$]+)\$/g, '<span class="kb-inline-formula" data-formula="$1">$1</span>');
  }

  // ===== 操作：文件夹 =====
  function openFolder(folder) {
    api('/api/open', { method: 'POST', body: JSON.stringify({ path: folder }) })
      .then(function (res) {
        if (res.ok) toast('已在 Finder 中打开');
        else toast('打开失败');
      });
  }

  // ===== 操作：刷新资讯 =====
  function refreshNews() {
    var btn = $('#refreshBtn');
    btn.classList.add('loading');
    btn.querySelector('span').textContent = '更新中…';
    api('/api/refresh', { method: 'POST' })
      .then(function (data) {
        state.news = data;
        renderNews();
        renderWeather();
        renderOverview();
        toast('资讯已更新');
      })
      .catch(function () { toast('更新失败，请检查网络'); })
      .finally(function () {
        btn.classList.remove('loading');
        btn.querySelector('span').textContent = '更新资讯';
      });
  }

  // ============================================================
  // V3 · 交互层
  //   滑动导航胶囊 · ⌘K 命令面板 · URL 深链 · 吸顶顶栏 · 滚动记忆
  // ============================================================

  var scrollMemory = {};

  function rememberScroll() { scrollMemory[state.panel] = window.scrollY || 0; }

  function restoreScroll(panel) {
    var y = scrollMemory[panel] || 0;
    requestAnimationFrame(function () { window.scrollTo(0, y); });
  }

  /* ---------- 滑动导航胶囊 ---------- */
  var navInk = null;

  function ensureNavInk() {
    var nav = $('.sidebar-nav');
    if (!nav) return;
    if (!navInk) {
      navInk = document.createElement('span');
      navInk.className = 'nav-ink';
      nav.insertBefore(navInk, nav.firstChild);
      // 字体换入会改变行高；侧栏尺寸变化也会。两者都要重算，
      // 否则胶囊会停在按旧行高算出的位置（初次加载时最明显）。
      window.addEventListener('resize', function () { positionNavInk(false); });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { positionNavInk(false); });
      }
      if (window.ResizeObserver) {
        try { new ResizeObserver(function () { positionNavInk(false); }).observe(nav); } catch (e) {}
      }
    }
  }

  /* 定位算法：必须用 rect 差值，不能用 active.offsetTop。
     offsetTop 相对「最近的定位祖先」，而 .nav-group 上有 position: relative，
     于是从第三组起 offsetTop 只等于「在该组内的高度」——点「前沿日报」
     （组内第一个）胶囊会落回导航顶部压住「概览」，误差正好是前两组的高度。
     rect 差值不依赖任何祖先的定位方式，同时按 scrollTop/clientTop 校正，
     导航自身滚动时也不会错位。 */
  function positionNavInk(animate) {
    if (!navInk) return;
    var nav = $('.sidebar-nav');
    var active = $('.nav-item.active');
    if (!nav || !active) { navInk.classList.remove('ready'); return; }
    var ir = active.getBoundingClientRect();
    var nr = nav.getBoundingClientRect();
    var y = (ir.top - nr.top) - nav.clientTop + nav.scrollTop;
    var x = (ir.left - nr.left) - nav.clientLeft + nav.scrollLeft;
    if (!animate) navInk.style.transition = 'none';
    navInk.style.height = ir.height + 'px';
    navInk.style.width = ir.width + 'px';
    navInk.style.left = x + 'px';
    navInk.style.transform = 'translateY(' + (Math.round(y * 100) / 100) + 'px)';
    navInk.classList.add('ready');
    if (!animate) {
      void navInk.offsetHeight;
      navInk.style.transition = '';
    }
  }

  /* ---------- 顶栏吸顶态 ---------- */
  function initTopbarStuck() {
    var bar = $('.topbar');
    if (!bar) return;
    var onScroll = function () {
      // 本站滚动容器是 body（body{overflow-y:auto}）：window.scrollY 恒为 0，
      // 原实现只读 window/documentElement → 吸顶态永不生效、顶栏保持透明，
      // 内容滚上来就与「面板标题 + 日期」叠影。必须补 body.scrollTop 这一支。
      // （不能用 bar.getBoundingClientRect().top 判断：topbar 是页面首个元素，未滚动时 top 也是 0）
      var y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      bar.classList.toggle('is-stuck', y > 6);
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- URL 深链：#panel / #hotspots/<文件> ---------- */
  function syncHash(panel) {
    var h = '#' + panel;
    try { sessionStorage.setItem('academic-workbench-last-panel', panel); } catch (err) {}
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (err) { location.hash = panel; }
    }
  }

  function getLastVisitedPanel() {
    var savedPanel = '';
    try { savedPanel = sessionStorage.getItem('academic-workbench-last-panel') || ''; } catch (err) {}
    return $$('.nav-item').some(function (button) { return button.dataset.panel === savedPanel; }) ? savedPanel : 'dashboard';
  }

  function applyHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return false;
    var parts = raw.split('/');
    var panel = parts[0];
    if (!$('.nav-item[data-panel="' + panel + '"]')) return false;
    switchPanel(panel);
    if (parts.length > 1) {
      var file = decodeURIComponent(parts.slice(1).join('/'));
      if (panel === 'hotspots') setTimeout(function () { openHotspot(file); }, 60);
      if (panel === 'frontier') setTimeout(function () { openFrontier(file); }, 60);
    }
    return true;
  }

  function pushReportHash(panel, file) {
    try { history.replaceState(null, '', '#' + panel + '/' + encodeURIComponent(file)); } catch (err) {}
  }

  /* ---------- ⌘K 命令面板 ---------- */
  var CM_ICONS = {
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
  };

  var cmdkItems = [];
  var cmdkIndex = 0;
  var cmdkFiltered = [];

  function buildCmdkItems() {
    var items = [];
    $$('.nav-item').forEach(function (btn) {
      var svg = btn.querySelector('svg');
      var key = btn.dataset.panel;
      items.push({
        group: '前往面板',
        label: PANEL_TITLES[key] || (btn.textContent || '').trim(),
        keys: key,
        icon: svg ? svg.outerHTML : '',
        run: function () { switchPanel(key); }
      });
    });
    items.push({
      group: '动作',
      label: state.theme === 'dark' ? '切换到明亮模式' : '切换到暗夜模式',
      keys: 'theme dark light 主题 明暗',
      icon: CM_ICONS.theme,
      sub: '隐藏玩法：点主题按钮有惊喜',
      run: function () { toggleTheme(); }
    });
    items.push({
      group: '动作', label: '更新资讯', keys: 'refresh news update 刷新 更新',
      icon: CM_ICONS.refresh, run: function () { var btn = $('#refreshBtn'); if (btn) btn.click(); }
    });
    items.push({
      group: '动作', label: '打开热点日报归档目录', keys: 'folder hotspots 归档 目录',
      icon: CM_ICONS.folder,
      run: function () { var b = $('#hotspotFolderBtn'); if (b) b.click(); }
    });
    items.push({
      group: '动作', label: '打开摘要卡片保存目录', keys: 'folder summaries 摘要 目录',
      icon: CM_ICONS.folder,
      run: function () { var b = $('#summaryFolderBtn'); if (b) b.click(); }
    });
    return items;
  }

  // 全局内容搜索：⌘K 输入关键字时跨面板检索（待办 / 文献卡片 / 研究日志）
  function buildCmdkContentItems(q) {
    var needle = (q || '').trim().toLowerCase();
    if (!needle) return [];
    var items = [];
    state.todos.filter(function (t) { return !t.done && (t.text || '').toLowerCase().indexOf(needle) >= 0; })
      .slice(0, 4).forEach(function (t) {
        items.push({
          group: '待办事项', label: t.text, keys: t.text,
          icon: CM_ICONS.check || '', sub: '待办',
          run: function () { switchPanel('todos'); }
        });
      });
    summaryAll.filter(function (s) {
      var hay = [s.title, s.title_en, s.keywords, s.one_liner].join(' ').toLowerCase();
      return hay.indexOf(needle) >= 0;
    }).slice(0, 5).forEach(function (s) {
      var title = s.title || s.title_en || s.id;
      items.push({
        group: '文献卡片', label: title, keys: [s.title, s.title_en, s.one_liner].join(' '),
        icon: CM_ICONS.folder || '', sub: '摘要卡片',
        run: function () { switchPanel('summaries'); openSummaryDetail(s.id); }
      });
    });
    // 译文库 / 精读库也进搜索：否则「搜不到自己存过的东西」会显得很割裂
    (state.translations || []).filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(needle) >= 0;
    }).slice(0, 4).forEach(function (t) {
      items.push({
        group: '译文', label: t.title || '未命名译文', keys: [t.title, t.source].join(' '),
        icon: CM_ICONS.folder || '', sub: '译文库 · ' + Math.max(1, Math.round((t.chars || 0) / 1000)) + 'k 字',
        run: function () { switchPanel('translations'); openTranslationDetail(t.id); }
      });
    });
    (state.readings || []).filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(needle) >= 0;
    }).slice(0, 4).forEach(function (t) {
      items.push({
        group: '原文精读', label: t.title || '未命名精读', keys: [t.title, t.source].join(' '),
        icon: CM_ICONS.book || '', sub: '精读库 · ' + Math.max(1, Math.round((t.chars || 0) / 1000)) + 'k 字',
        run: function () { switchPanel('readings'); openReadingDetail(t.id); }
      });
    });
    state.journal.filter(function (j) { return (j.content || '').toLowerCase().indexOf(needle) >= 0; })
      .slice(0, 4).forEach(function (j) {
        items.push({
          group: '研究日志', label: String(j.content || '').slice(0, 52), keys: j.content || '',
          icon: CM_ICONS.edit || '', sub: j.date || j.created || '',
          run: function () { switchPanel('journal'); }
        });
      });
    return items;
  }

  function renderCmdk(query) {
    var list = $('#cmdkList');
    if (!list) return;
    var q = (query || '').trim().toLowerCase();
    var pool = cmdkItems.concat(buildCmdkContentItems(q));
    cmdkFiltered = pool.filter(function (it) {
      if (!q) return true;
      return (it.label + ' ' + it.keys).toLowerCase().indexOf(q) >= 0;
    });
    if (cmdkIndex >= cmdkFiltered.length) cmdkIndex = cmdkFiltered.length - 1;
    if (cmdkIndex < 0) cmdkIndex = 0;

    if (!cmdkFiltered.length) {
      list.innerHTML = '<div class="cmdk-empty">没有匹配的项</div>';
      return;
    }
    var html = [];
    var lastGroup = '';
    cmdkFiltered.forEach(function (it, i) {
      if (it.group !== lastGroup) {
        html.push('<div class="cmdk-group-label">' + escapeHtml(it.group) + '</div>');
        lastGroup = it.group;
      }
      html.push(
        '<button class="cmdk-item' + (i === cmdkIndex ? ' active' : '') + '" data-i="' + i + '">' +
          it.icon +
          '<span>' + escapeHtml(it.label) + '</span>' +
          (it.sub ? '<span class="cmdk-item-sub">' + escapeHtml(it.sub) + '</span>' : '') +
        '</button>'
      );
    });
    list.innerHTML = html.join('');
  }

  function moveCmdk(delta) {
    if (!cmdkFiltered.length) return;
    cmdkIndex = (cmdkIndex + delta + cmdkFiltered.length) % cmdkFiltered.length;
    var items = $$('.cmdk-item');
    items.forEach(function (el, i) { el.classList.toggle('active', i === cmdkIndex); });
    if (items[cmdkIndex] && items[cmdkIndex].scrollIntoView) {
      items[cmdkIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function openCmdk() {
    var ov = $('#cmdkOverlay');
    if (!ov) return;
    cmdkItems = buildCmdkItems();
    cmdkIndex = 0;
    $('#cmdkInput').value = '';
    renderCmdk('');
    ov.classList.add('open');
    document.body.classList.add('cmdk-open');
    setTimeout(function () { $('#cmdkInput').focus(); }, 30);
  }

  function closeCmdk() {
    var ov = $('#cmdkOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.body.classList.remove('cmdk-open');
  }

  function runCmdk() {
    var it = cmdkFiltered[cmdkIndex];
    if (!it) return;
    closeCmdk();
    setTimeout(function () { it.run(); }, 40);
  }

  function initCmdk() {
    var ov = $('#cmdkOverlay');
    if (!ov) return;

    var opener = $('#cmdkOpen');
    if (opener) opener.addEventListener('click', openCmdk);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeCmdk(); });

    $('#cmdkInput').addEventListener('input', function (e) {
      cmdkIndex = 0;
      renderCmdk(e.target.value);
    });
    $('#cmdkList').addEventListener('click', function (e) {
      var btn = e.target.closest('.cmdk-item');
      if (!btn) return;
      cmdkIndex = parseInt(btn.dataset.i, 10) || 0;
      runCmdk();
    });

    document.addEventListener('keydown', function (e) {
      var open = ov.classList.contains('open');
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (open) closeCmdk(); else openCmdk();
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveCmdk(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCmdk(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); runCmdk(); }
    });
  }

  function initV3() {
    paintWxIcons();
    ensureNavInk();
    positionNavInk(false);
    initTopbarStuck();
    initCmdk();
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pageshow', function () { pendingExitFlush = false; exitFlushStarted = false; });
    window.addEventListener('hashchange', applyHash);
  }

  // ===== 初始化 =====
  function init() {
    // 彻底移除已下线功能的侧栏节点，避免旧版样式或扩展插件将其重新显示。
    $$('.retired-content').forEach(function (node) { node.remove(); });
    $$('.dashboard-retired').forEach(function (node) { node.remove(); });
    initTheme();
    $('#panelDate').textContent = formatDate(new Date());
    initV3();
    bindEvents();
    initPdfSelectionToolbar();
    initPdfImageLightbox();
    // 恢复未跑完的一轮专注（刷新/关标签都能接着跑），并先渲染一次面板
    focusRestore();
    focusRenderAll();
    // 侧栏徽标预取：归档型面板计数启动即加载，不必等用户点进面板（本地轻接口）
    loadFrontier().catch(function () {});
    loadHotspots().catch(function () {});
    loadWeekly().catch(function () {});
    // 切回标签页时立即续跑翻译（看门狗1秒兜底，这里更即时）
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && pdfTransState.running && !pdfTransState.cancelled) {
        pumpPdfTransWorkers();
      }
      // 专注计时用的是时间戳，回前台立刻校准一次（后台标签页会被降频，
      // 也可能在后台期间已经到点）
      if (!document.hidden && focusIsActive()) { focusTick(); focusRenderAll(); }
      if (!document.hidden && account) syncData();
      if (!document.hidden && state.panel === 'journal-tracker' && state.journalTrackerLoaded) autoRefreshStaleJournalTracker();
    });
    window.setInterval(function () {
      if (!document.hidden && state.panel === 'journal-tracker' && state.journalTrackerLoaded) autoRefreshStaleJournalTracker();
    }, 5 * 60 * 1000);
    // The static browser edition restores Supabase's persisted session first.
    // A noncritical data-loading error must never make the header look logged out.
    Promise.resolve(window.__academicAuthReady).catch(function () {}).then(function () {
      return loadAll().catch(function () {});
    }).then(function () {
      return checkAccount();
    }).then(function () {
      focusRenderAll();   // 待办加载完，「关联任务」下拉才有内容
      if (!applyHash()) switchPanel(getLastVisitedPanel());
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
