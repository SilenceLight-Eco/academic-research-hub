/* Static GitHub Pages adapter: keeps the core workbench data in Supabase. */
(function () {
  'use strict';

  var url = 'https://gqopwqpysoixcgdacurx.supabase.co';
  var key = 'sb_publishable_83K9_IrwPtRpagaYZqEvxw_nOsYpEZs';
  var client = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  // Exposed so the workbench waits until the saved session has been restored.
  window.__academicAuthReady = client.auth.getSession();
  client.auth.onAuthStateChange(function (event) { if (event === 'PASSWORD_RECOVERY') { window.__academicPasswordRecovery = true; window.dispatchEvent(new CustomEvent('academic-password-recovery')); } });
  var workspace = null;
  var workspaceRevision = null;
  var workspaceRevisionKnown = false;
  var workspaceRowExists = false;
  var workspaceBasePayload = null;
  var workspaceSessionGeneration = 0;
  var workspaceLoadPromise = null;
  var workspaceWriteChain = Promise.resolve();
  var pendingWorkspaceConflict = null;
  var activeWritePayload = null;
  var activeWriteRevision = null;
  var applyingBrowserSnapshot = false;
  var saveTimer = null;
  var focusKeys = ['academic-workbench-theme', 'wb_pomo_counts', 'wb_focus_preset', 'wb_focus_log', 'wb_focus_state'];
  var researchHubKeys = ['research-hub-crossref-email', 'research-hub-crossref-citations-v1', 'research-hub-stages-v1', 'research-hub-fields-v1', 'research-hub-cards-v1', 'research-hub-theme'];

  function response(data, status) { return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
  function nowId() { return Date.now(); }
  function nowText() { return new Date().toLocaleString('sv-SE').slice(0, 16).replace('T', ' '); }
  function dateText() { return new Date().toISOString().slice(0, 10); }
  function nextRevision(previous) {
    var timestamp = Date.now();
    var previousTime = Date.parse(previous || '');
    if (!isNaN(previousTime) && timestamp <= previousTime) timestamp = previousTime + 1;
    return new Date(timestamp).toISOString();
  }
  function copyPayload(payload) { return JSON.parse(JSON.stringify(payload || {})); }
  function cloneValue(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function samePayload(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function payloadModifiedAt(payload) {
    var latest = 0;
    var timestampKeys = ['updated', 'updatedAt', 'updated_at', 'modifiedAt', 'modified_at', 'created', 'createdAt', 'created_at', 'deletedAt', 'deleted_at', 'savedAt', 'saved_at'];
    function visit(value, key) {
      if (!value || typeof value !== 'object') {
        if (timestampKeys.indexOf(key) >= 0 && typeof value === 'string') { var parsed = Date.parse(value); if (!isNaN(parsed)) latest = Math.max(latest, parsed); }
        return;
      }
      Object.keys(value).forEach(function (childKey) { visit(value[childKey], childKey); });
    }
    visit(payload, '');
    return latest;
  }
  function mergeWorkspaceValue(base, local, cloud, localModifiedAt, cloudModifiedAt) {
    if (samePayload(local, base)) return cloneValue(cloud);
    if (samePayload(cloud, base)) return cloneValue(local);
    if (samePayload(local, cloud)) return cloneValue(local);
    if (Array.isArray(local) && Array.isArray(cloud)) {
      var keyed = local.concat(cloud, Array.isArray(base) ? base : []).every(function (item) { return item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'id'); });
      if (!keyed) return cloneValue(localModifiedAt > cloudModifiedAt ? local : cloud);
      var localItems = Object.create(null); var cloudItems = Object.create(null); var baseItems = Object.create(null);
      local.forEach(function (item) { localItems[String(item.id)] = item; });
      cloud.forEach(function (item) { cloudItems[String(item.id)] = item; });
      (Array.isArray(base) ? base : []).forEach(function (item) { baseItems[String(item.id)] = item; });
      var first = localModifiedAt > cloudModifiedAt ? local : cloud;
      var second = first === local ? cloud : local;
      var ids = [];
      first.concat(second).forEach(function (item) { var id = String(item.id); if (ids.indexOf(id) < 0) ids.push(id); });
      var result = [];
      ids.forEach(function (id) {
        var hasLocal = Object.prototype.hasOwnProperty.call(localItems, id);
        var hasCloud = Object.prototype.hasOwnProperty.call(cloudItems, id);
        var hasBase = Object.prototype.hasOwnProperty.call(baseItems, id);
        if (!hasLocal && !hasCloud) return;
        if (!hasLocal) { if (hasBase && samePayload(cloudItems[id], baseItems[id])) return; result.push(cloneValue(cloudItems[id])); return; }
        if (!hasCloud) { if (hasBase && samePayload(localItems[id], baseItems[id])) return; result.push(cloneValue(localItems[id])); return; }
        result.push(mergeWorkspaceValue(baseItems[id], localItems[id], cloudItems[id], Math.max(localModifiedAt, payloadModifiedAt(localItems[id])), Math.max(cloudModifiedAt, payloadModifiedAt(cloudItems[id]))));
      });
      return result;
    }
    if (local && cloud && typeof local === 'object' && typeof cloud === 'object' && !Array.isArray(local) && !Array.isArray(cloud)) {
      var baseObject = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
      var keys = Array.from(new Set(Object.keys(baseObject).concat(Object.keys(local), Object.keys(cloud))));
      var merged = {};
      keys.forEach(function (key) {
        var hasBase = Object.prototype.hasOwnProperty.call(baseObject, key);
        var hasLocal = Object.prototype.hasOwnProperty.call(local, key);
        var hasCloud = Object.prototype.hasOwnProperty.call(cloud, key);
        if (!hasLocal && !hasCloud) return;
        if (!hasLocal) { if (hasBase && samePayload(cloud[key], baseObject[key])) return; merged[key] = cloneValue(cloud[key]); return; }
        if (!hasCloud) { if (hasBase && samePayload(local[key], baseObject[key])) return; merged[key] = cloneValue(local[key]); return; }
        merged[key] = mergeWorkspaceValue(baseObject[key], local[key], cloud[key], localModifiedAt, cloudModifiedAt);
      });
      return merged;
    }
    return cloneValue(localModifiedAt > cloudModifiedAt ? local : cloud);
  }
  function resetWorkspaceSession() {
    workspaceSessionGeneration += 1;
    clearTimeout(saveTimer);
    workspace = null;
    workspaceRevision = null;
    workspaceRevisionKnown = false;
    workspaceRowExists = false;
    workspaceBasePayload = null;
    workspaceLoadPromise = null;
    pendingWorkspaceConflict = null;
    activeWritePayload = null;
    activeWriteRevision = null;
  }
  function conflictError(localData, cloudUpdatedAt) {
    pendingWorkspaceConflict = { localData: copyPayload(localData), cloudUpdatedAt: cloudUpdatedAt || '' };
    var error = new Error('另一台设备已保存较新的工作台内容，请选择保留本机版本或载入云端版本。');
    error.workspaceConflict = pendingWorkspaceConflict;
    return error;
  }
  function archiveVersion(item, keys, next) {
    if (!keys.some(function (key) { return String(item[key] == null ? '' : item[key]) !== String(next[key] == null ? '' : next[key]); })) return;
    var versions = Array.isArray(item.versions) ? item.versions : [];
    var lastEdit = Date.parse(item.updated || '');
    var lastSnapshot = versions.length ? Date.parse(versions[0].savedAt || '') : NaN;
    var recentlyEdited = !isNaN(lastEdit) && Date.now() - lastEdit < 60000;
    var recentlyArchived = !isNaN(lastSnapshot) && Date.now() - lastSnapshot < 60000;
    if (versions.length && recentlyEdited && recentlyArchived) return;
    var snapshot = { savedAt: !isNaN(lastEdit) ? new Date(lastEdit).toISOString() : new Date().toISOString() };
    keys.forEach(function (key) { snapshot[key] = item[key] == null ? '' : item[key]; });
    versions.unshift(snapshot);
    item.versions = versions.slice(0, 10);
  }
  function currentPayload() { return workspace || { todos: [], journal: [], publications: [], academicRecords: { funding: [], awards: [], conferences: [] }, knowledgeBase: { folders: [], docs: [] }, noteStudio: { notes: [], trash: [] }, promptLibrary: { prompts: [], trash: [] }, researchProjects: { projects: [], trash: [] }, dataCodeLibrary: { items: [], trash: [] }, studyProgress: {}, graduationConfig: {}, browser: {}, researchHub: {} }; }
  function browserSnapshot() { var result = {}; focusKeys.forEach(function (k) { result[k] = localStorage.getItem(k); }); return result; }
  function researchSnapshot() { var result = {}; researchHubKeys.forEach(function (k) { result[k] = localStorage.getItem(k); }); return result; }
  function graduation(pubs, config) { var items = (pubs || []).filter(function (p) { return p.type === 'c_journal'; }); var settings = config || {}; var required = Math.max(0, Number(settings.required) || 2); var achieved = settings.achieved == null ? items.length : Math.max(0, Number(settings.achieved) || 0); var label = 'C刊/SCI论文'; return { c_journal: { label: label, required: required, achieved: achieved, remaining: Math.max(0, required - achieved), complete: achieved >= required, items: items } }; }
  function overview() { var payload = currentPayload(); var defaults = { configured: false, label: '学业进度', stage: '', percent: 0, start: '', end: '', remain_days: 0 }; return { field_name: 'Academic Research Hub', phd: Object.assign(defaults, payload.studyProgress || {}), graduation: graduation(payload.publications, payload.graduationConfig), academic_records: payload.academicRecords || { funding: [], awards: [], conferences: [] }, sections: [], tree: { name: '浏览器版不访问本地文件', children: [], count: 0 } }; }
  // Read the persisted browser session first. Unlike getUser(), this does not
  // depend on a network round-trip during a page refresh.
  async function getUser() { await window.__academicAuthReady; var result = await client.auth.getSession(); return result.data.session ? result.data.session.user : null; }
  async function loadWorkspace() {
    if (pendingWorkspaceConflict) { workspace = pendingWorkspaceConflict.localData; return workspace; }
    if (workspaceLoadPromise) return workspaceLoadPromise;
    workspaceLoadPromise = loadWorkspaceFromCloud();
    var activeLoad = workspaceLoadPromise;
    try { return await activeLoad; }
    finally { if (workspaceLoadPromise === activeLoad) workspaceLoadPromise = null; }
  }
  async function loadWorkspaceFromCloud() {
    var user = await getUser();
    if (!user) return null;
    var result = await client.from('user_workspaces').select('payload,updated_at').eq('user_id', user.id).maybeSingle();
    if (result.error) throw result.error;
    var establishBase = !workspaceRevisionKnown;
    if (establishBase) { workspaceRowExists = Boolean(result.data); workspaceRevision = result.data ? result.data.updated_at || null : null; workspaceRevisionKnown = true; }
    workspace = (result.data && result.data.payload) || { todos: [], journal: [], publications: [], browser: {}, researchHub: {} };
    workspace.todos = Array.isArray(workspace.todos) ? workspace.todos : [];
    workspace.journal = Array.isArray(workspace.journal) ? workspace.journal : [];
    workspace.publications = Array.isArray(workspace.publications) ? workspace.publications : [];
    workspace.academicRecords = workspace.academicRecords || { funding: [], awards: [], conferences: [] };
    workspace.knowledgeBase = workspace.knowledgeBase || { folders: [], docs: [] };
    workspace.knowledgeBase.folders = Array.isArray(workspace.knowledgeBase.folders) ? workspace.knowledgeBase.folders : [];
    workspace.knowledgeBase.docs = Array.isArray(workspace.knowledgeBase.docs) ? workspace.knowledgeBase.docs : [];
    workspace.noteStudio = workspace.noteStudio || { notes: [], trash: [] };
    if (!Array.isArray(workspace.noteStudio.notes)) { workspace.noteStudio.notes = workspace.noteStudio.markdown ? [{ id: nowId(), title: '未命名笔记', markdown: workspace.noteStudio.markdown, style: workspace.noteStudio.style || 'paper', updated: nowText() }] : []; delete workspace.noteStudio.markdown; delete workspace.noteStudio.style; }
    workspace.noteStudio.trash = Array.isArray(workspace.noteStudio.trash) ? workspace.noteStudio.trash : [];
    workspace.promptLibrary = workspace.promptLibrary || { prompts: [], trash: [] };
    workspace.promptLibrary.prompts = Array.isArray(workspace.promptLibrary.prompts) ? workspace.promptLibrary.prompts : [];
    workspace.promptLibrary.trash = Array.isArray(workspace.promptLibrary.trash) ? workspace.promptLibrary.trash : [];
    workspace.researchProjects = workspace.researchProjects || { projects: [], trash: [] };
    workspace.researchProjects.projects = Array.isArray(workspace.researchProjects.projects) ? workspace.researchProjects.projects : [];
    workspace.researchProjects.trash = Array.isArray(workspace.researchProjects.trash) ? workspace.researchProjects.trash : [];
    workspace.dataCodeLibrary = workspace.dataCodeLibrary || { items: [], trash: [] };
    workspace.dataCodeLibrary.items = Array.isArray(workspace.dataCodeLibrary.items) ? workspace.dataCodeLibrary.items : [];
    workspace.dataCodeLibrary.trash = Array.isArray(workspace.dataCodeLibrary.trash) ? workspace.dataCodeLibrary.trash : [];
    workspace.studyProgress = workspace.studyProgress || {};
    workspace.graduationConfig = workspace.graduationConfig || {};
    ['funding', 'awards', 'conferences'].forEach(function (kind) { if (!Array.isArray(workspace.academicRecords[kind])) workspace.academicRecords[kind] = []; });
    workspace.browser = workspace.browser || {};
    workspace.researchHub = workspace.researchHub || {};
    if (establishBase) workspaceBasePayload = copyPayload(workspace);
    return workspace;
  }
  function saveWorkspace(nextPayload, expectedRevision, forceConflictOverride, modifiedAt) {
    var payload = copyPayload(nextPayload || activeWritePayload || currentPayload());
    var basePayload = copyPayload(workspaceBasePayload || {});
    var baseRevision = arguments.length > 1 ? expectedRevision : activeWriteRevision;
    var localModifiedAt = Math.max(Number(modifiedAt) || Date.now(), payloadModifiedAt(payload));
    var generation = workspaceSessionGeneration;
    var userPromise = getUser();
    payload.browser = browserSnapshot();
    payload.researchHub = researchSnapshot();
    var force = forceConflictOverride === true;
    var queued = workspaceWriteChain.catch(function () {}).then(function () {
      return userPromise.then(function (user) {
        if (!user || generation !== workspaceSessionGeneration) return;
        return commitWorkspace(user, generation, payload, basePayload, baseRevision, force, localModifiedAt, 0);
      });
    });
    workspaceWriteChain = queued.then(function () {}, function () {});
    return queued;
  }
  function notifyCloudReload() {
    window.__academicCloudReloadRequired = true;
    window.dispatchEvent(new CustomEvent('academic-workspace-auto-merged'));
  }
  async function commitWorkspace(user, generation, payload, basePayload, baseRevision, forceConflictOverride, localModifiedAt, attempt) {
    if (generation !== workspaceSessionGeneration) return;
    if (forceConflictOverride) {
      var forcedAt = nextRevision(pendingWorkspaceConflict && pendingWorkspaceConflict.cloudUpdatedAt);
      var forced = await client.from('user_workspaces').upsert({ user_id: user.id, payload: payload, updated_at: forcedAt }, { onConflict: 'user_id' }).select('updated_at').single();
      if (forced.error) throw forced.error;
      if (generation !== workspaceSessionGeneration) return;
      workspaceRevision = forced.data.updated_at || forcedAt;
      workspaceRevisionKnown = true;
      workspaceRowExists = true;
      pendingWorkspaceConflict = null;
      workspace = payload;
      workspaceBasePayload = copyPayload(payload);
      return;
    }
    if (samePayload(payload, workspaceBasePayload) && baseRevision === workspaceRevision) return;
    var updatedAt = nextRevision(baseRevision);
    var row = { user_id: user.id, payload: payload, updated_at: updatedAt };
    var conditionalUpdate = client.from('user_workspaces').update({ payload: payload, updated_at: updatedAt }).eq('user_id', user.id);
    if (baseRevision) conditionalUpdate = conditionalUpdate.eq('updated_at', baseRevision);
    else conditionalUpdate = conditionalUpdate.is('updated_at', null);
    var result = workspaceRowExists
      ? await conditionalUpdate.select('updated_at').maybeSingle()
      : await client.from('user_workspaces').insert(row).select('updated_at').maybeSingle();
    if (result.error && result.error.code !== '23505') throw result.error;
    if (generation !== workspaceSessionGeneration) return;
    if (result.error || !result.data) {
      var latest = await client.from('user_workspaces').select('payload,updated_at').eq('user_id', user.id).maybeSingle();
      if (latest.error) throw latest.error;
      if (generation !== workspaceSessionGeneration) return;
      var latestPayload = latest.data && latest.data.payload || {};
      var latestRevision = latest.data && latest.data.updated_at || null;
      if (!latest.data) {
        workspaceRevision = null;
        workspaceRowExists = false;
        workspaceRevisionKnown = true;
      } else {
        workspaceRevision = latestRevision;
        workspaceRowExists = true;
        workspaceRevisionKnown = true;
      }
      var cloudModifiedAt = Math.max(Date.parse(latestRevision || '') || 0, payloadModifiedAt(latestPayload));
      var merged = mergeWorkspaceValue(basePayload, payload, latestPayload, localModifiedAt, cloudModifiedAt);
      if (!merged || typeof merged !== 'object' || Array.isArray(merged)) merged = copyPayload(latestPayload);
      pendingWorkspaceConflict = null;
      workspace = copyPayload(latestPayload);
      workspaceBasePayload = copyPayload(latestPayload);
      if (samePayload(merged, latestPayload) || attempt >= 4) {
        notifyCloudReload();
        return;
      }
      await commitWorkspace(user, generation, merged, copyPayload(latestPayload), latestRevision, false, localModifiedAt, attempt + 1);
      if (generation !== workspaceSessionGeneration) return;
      notifyCloudReload();
      return;
    }
    workspaceRevision = result.data.updated_at || updatedAt;
    workspaceRevisionKnown = true;
    workspaceRowExists = true;
    workspace = payload;
    workspaceBasePayload = copyPayload(payload);
  }
  function applyBrowser(payload) {
    var values = (payload && payload.browser) || {};
    var previousApplying = applyingBrowserSnapshot;
    applyingBrowserSnapshot = true;
    try {
      focusKeys.concat(researchHubKeys).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(values, k)) values[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, values[k]); });
      Object.keys((payload && payload.researchHub) || {}).forEach(function (k) { if (researchHubKeys.indexOf(k) >= 0) localStorage.setItem(k, payload.researchHub[k]); });
    } finally { applyingBrowserSnapshot = previousApplying; }
  }
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      loadWorkspace().then(function (latestPayload) {
        if (!latestPayload) return;
        return saveWorkspace(copyPayload(latestPayload), workspaceRevision, false, Date.now());
      }).catch(function (error) {
        if (error.workspaceConflict) window.dispatchEvent(new CustomEvent('academic-workspace-conflict', { detail: error.workspaceConflict }));
      });
    }, 750);
  }
  var originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (name, value) {
    var isLocal = this === localStorage;
    var oldValue = isLocal ? this.getItem(name) : null;
    var nextValue = String(value);
    originalSetItem.call(this, name, value);
    if (isLocal && !applyingBrowserSnapshot && oldValue !== nextValue && (focusKeys.indexOf(name) >= 0 || researchHubKeys.indexOf(name) >= 0)) queueSave();
  };

  window.fetch = async function (input, options) {
    var requestUrl = typeof input === 'string' ? input : input.url;
    if (requestUrl.indexOf('/api/') !== 0) return window.__nativeFetch(input, options);
    var method = (options && options.method) || 'GET';
    var path = requestUrl.split('?')[0];
    var body = options && options.body ? JSON.parse(options.body) : {};
    try {
      if (path === '/api/auth/me') { var me = await getUser(); return response({ user: me ? { email: me.email } : null }); }
      if (path === '/api/auth/login') { var login = await client.auth.signInWithPassword({ email: body.email, password: body.password }); if (login.error) return response({ error: login.error.message }, 401); resetWorkspaceSession(); return response({ ok: true, user: { email: login.data.user.email } }); }
      if (path === '/api/auth/register') { var signup = await client.auth.signUp({ email: body.email, password: body.password }); if (signup.error) return response({ error: signup.error.message }, 400); if (signup.data.session) resetWorkspaceSession(); return response({ ok: true, user: { email: body.email } }); }
      if (path === '/api/auth/reset-password') { var reset = await client.auth.resetPasswordForEmail(String(body.email || '').trim(), { redirectTo: location.href.split('#')[0] }); if (reset.error) return response({ error: reset.error.message }, 400); return response({ ok: true }); }
      if (path === '/api/auth/change-password') { var passwordUser = await getUser(); if (!passwordUser) return response({ error: '请先登录' }, 401); if (!body.recovery) { var verified = await client.auth.signInWithPassword({ email: passwordUser.email, password: String(body.currentPassword || '') }); if (verified.error) return response({ error: '当前密码不正确' }, 400); } var changed = await client.auth.updateUser({ password: String(body.password || '') }); if (changed.error) return response({ error: changed.error.message }, 400); return response({ ok: true }); }
      if (path === '/api/auth/logout') { await client.auth.signOut(); resetWorkspaceSession(); return response({ ok: true }); }
      if (path === '/api/sync') {
        if (method === 'GET') { var existing = await loadWorkspace(); if (!existing) return response({ error: '请先登录' }, 401); applyBrowser(existing); return response({ data: existing }); }
        var user = await getUser(); if (!user) return response({ error: '请先登录' }, 401);
        var syncData = await loadWorkspace();
        if (!syncData) return response({ error: '请先登录' }, 401);
        var syncRevision = workspaceRevision;
        var incoming = body.data || {};
        ['todos', 'journal', 'researchHub'].forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(incoming, key) && JSON.stringify(incoming[key]) !== JSON.stringify(workspaceBasePayload && workspaceBasePayload[key])) syncData[key] = incoming[key];
        });
        workspace = syncData;
        activeWritePayload = workspace;
        activeWriteRevision = syncRevision;
        await saveWorkspace(workspace, syncRevision);
        return response({ ok: true });
      }
      var data = await loadWorkspace();
      if (!data && method === 'GET') data = currentPayload();
      if (!data) return response({ error: '请先登录后使用浏览器版工作台' }, 401);
      var dataRevision = workspaceRevision;
      activeWritePayload = data;
      activeWriteRevision = dataRevision;
      if (path === '/api/backup') { if (!await getUser()) return response({ error: '请先登录后使用数据备份' }, 401); if (method === 'GET') return response({ ok: true, data: data }); var backup = body.backup; if (!backup || backup.format !== 'academic-research-hub-backup' || backup.version !== 1 || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) return response({ ok: false, error: '备份文件格式无效或版本不受支持' }, 400); if (JSON.stringify(backup.data).length > 20000000) return response({ ok: false, error: '备份文件超过 20 MB' }, 413); workspace = JSON.parse(JSON.stringify(backup.data)); activeWritePayload = workspace; applyBrowser(workspace); await saveWorkspace(workspace, dataRevision, body.overrideConflict === true); return response({ ok: true, restoredAt: nowText() }); }
      if (path === '/api/note-studio' && body.action === 'save') { var historyNotes = data.noteStudio && data.noteStudio.notes || []; var historyNote = historyNotes.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (historyNote) archiveVersion(historyNote, ['title', 'markdown', 'style'], { title: String(body.title || '未命名笔记').trim(), markdown: String(body.markdown || ''), style: ['paper', 'ink', 'mint'].indexOf(body.style) >= 0 ? body.style : 'paper' }); }
      if (path === '/api/prompt-library' && body.action === 'save') { var historyPrompts = data.promptLibrary && data.promptLibrary.prompts || []; var historyPrompt = historyPrompts.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (historyPrompt) archiveVersion(historyPrompt, ['title', 'category', 'tags', 'body'], { title: String(body.title || '未命名提示词').trim(), category: String(body.category || '通用').trim(), tags: String(body.tags || '').trim(), body: String(body.body || '') }); }
      if (path === '/api/knowledge-base' && body.action === 'save-doc') { var historyDocs = data.knowledgeBase && data.knowledgeBase.docs || []; var historyDoc = historyDocs.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (historyDoc) archiveVersion(historyDoc, ['title', 'content', 'folderId'], { title: String(body.title || '未命名文档').trim(), content: String(body.content || ''), folderId: body.folderId || '' }); }
      if (path === '/api/note-studio') { var notes = data.noteStudio || (data.noteStudio = { notes: [], trash: [] }); notes.notes = Array.isArray(notes.notes) ? notes.notes : []; notes.trash = Array.isArray(notes.trash) ? notes.trash : []; if (method === 'GET') return response({ ok: true, noteStudio: notes }); if (body.action === 'create') notes.notes.unshift({ id: nowId(), title: '未命名笔记', markdown: '', style: 'paper', updated: nowText() }); if (body.action === 'save') notes.notes.forEach(function (note) { if (String(note.id) === String(body.id)) { note.title = String(body.title || '未命名笔记').trim(); note.markdown = String(body.markdown || ''); note.style = ['paper', 'ink', 'mint'].indexOf(body.style) >= 0 ? body.style : 'paper'; note.updated = nowText(); } }); if (body.action === 'trash') { var removedNote = notes.notes.filter(function (note) { return String(note.id) === String(body.id); })[0]; if (removedNote) { notes.trash.unshift({ id: nowId(), item: removedNote, deletedAt: nowText() }); notes.notes = notes.notes.filter(function (note) { return String(note.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredNote = notes.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredNote && restoredNote.item) { notes.notes.unshift(restoredNote.item); notes.trash = notes.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') notes.trash = notes.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') notes.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, noteStudio: notes }); }
      if (path === '/api/prompt-library') { var library = data.promptLibrary || (data.promptLibrary = { prompts: [], trash: [] }); library.prompts = Array.isArray(library.prompts) ? library.prompts : []; library.trash = Array.isArray(library.trash) ? library.trash : []; if (method === 'GET') return response({ ok: true, promptLibrary: library }); if (body.action === 'create') library.prompts.unshift({ id: nowId(), title: '未命名提示词', category: '通用', tags: '', body: '', updated: nowText() }); if (body.action === 'save') library.prompts.forEach(function (prompt) { if (String(prompt.id) === String(body.id)) { prompt.title = String(body.title || '未命名提示词').trim(); prompt.category = String(body.category || '通用').trim(); prompt.tags = String(body.tags || '').trim(); prompt.body = String(body.body || ''); prompt.updated = nowText(); } }); if (body.action === 'trash') { var removedPrompt = library.prompts.filter(function (prompt) { return String(prompt.id) === String(body.id); })[0]; if (removedPrompt) { library.trash.unshift({ id: nowId(), item: removedPrompt, deletedAt: nowText() }); library.prompts = library.prompts.filter(function (prompt) { return String(prompt.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredPrompt = library.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredPrompt && restoredPrompt.item) { library.prompts.unshift(restoredPrompt.item); library.trash = library.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') library.trash = library.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') library.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, promptLibrary: library }); }
      if (path === '/api/research-projects') { var projects = data.researchProjects || (data.researchProjects = { projects: [], trash: [] }); projects.projects = Array.isArray(projects.projects) ? projects.projects : []; projects.trash = Array.isArray(projects.trash) ? projects.trash : []; if (method === 'GET') return response({ ok: true, researchProjects: projects }); if (body.action === 'create') projects.projects.unshift({ id: nowId(), title: '未命名项目', category: '通用', status: '规划中', goal: '', start: '', end: '', progress: 0, members: '', milestones: '', resources: '', updated: nowText() }); if (body.action === 'save') projects.projects.forEach(function (project) { if (String(project.id) === String(body.id)) { project.title = String(body.title || '未命名项目').trim(); project.category = String(body.category || '通用').trim() || '通用'; project.status = ['规划中', '进行中', '已完成', '暂停'].indexOf(body.status) >= 0 ? body.status : '规划中'; project.goal = String(body.goal || ''); project.start = String(body.start || ''); project.end = String(body.end || ''); project.progress = Math.max(0, Math.min(100, Number(body.progress) || 0)); project.members = String(body.members || ''); project.milestones = String(body.milestones || ''); project.resources = String(body.resources || ''); project.updated = nowText(); } }); if (body.action === 'trash') { var removedProject = projects.projects.filter(function (project) { return String(project.id) === String(body.id); })[0]; if (removedProject) { projects.trash.unshift({ id: nowId(), item: removedProject, deletedAt: nowText() }); projects.projects = projects.projects.filter(function (project) { return String(project.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredProject = projects.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredProject && restoredProject.item) { projects.projects.unshift(restoredProject.item); projects.trash = projects.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') projects.trash = projects.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') projects.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, researchProjects: projects }); }
      if (path === '/api/data-code-library') { var dataCode = data.dataCodeLibrary || (data.dataCodeLibrary = { items: [], trash: [] }); dataCode.items = Array.isArray(dataCode.items) ? dataCode.items : []; dataCode.trash = Array.isArray(dataCode.trash) ? dataCode.trash : []; if (method === 'GET') return response({ ok: true, dataCodeLibrary: dataCode }); if (body.action === 'create') dataCode.items.unshift({ id: nowId(), title: '未命名数据资源', category: '通用', kind: '数据集', projectId: '', paperTitle: '', source: '', coverage: '', version: 'v1.0', environment: '', location: '', description: '', variables: '', runOrder: '', checks: {}, updated: nowText() }); if (body.action === 'save') dataCode.items.forEach(function (item) { if (String(item.id) === String(body.id)) { item.title = String(body.title || '未命名数据资源').trim(); item.category = String(body.category || '通用').trim() || '通用'; item.kind = ['数据集', '分析代码', '复现包'].indexOf(body.kind) >= 0 ? body.kind : '数据集'; item.projectId = String(body.projectId || ''); item.paperTitle = String(body.paperTitle || ''); item.source = String(body.source || ''); item.coverage = String(body.coverage || ''); item.version = String(body.version || ''); item.environment = String(body.environment || ''); item.location = String(body.location || ''); item.description = String(body.description || ''); item.variables = String(body.variables || ''); item.runOrder = String(body.runOrder || ''); item.checks = body.checks && typeof body.checks === 'object' ? body.checks : {}; item.updated = nowText(); } }); if (body.action === 'trash') { var removedDataCode = dataCode.items.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (removedDataCode) { dataCode.trash.unshift({ id: nowId(), item: removedDataCode, deletedAt: nowText() }); dataCode.items = dataCode.items.filter(function (item) { return String(item.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredDataCode = dataCode.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredDataCode && restoredDataCode.item) { dataCode.items.unshift(restoredDataCode.item); dataCode.trash = dataCode.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') dataCode.trash = dataCode.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') dataCode.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, dataCodeLibrary: dataCode }); }
      if (path === '/api/overview') return response(overview());
      if (path === '/api/study-progress' && method === 'POST') {
        var percent = Math.max(0, Math.min(100, Number(body.percent) || 0));
        data.studyProgress = { configured: true, label: String(body.label || '学业进度').trim() || '学业进度', stage: String(body.stage || '').trim(), percent: percent, start: String(body.start || '').trim(), end: String(body.end || '').trim(), elapsed_days: Number(body.elapsed_days) || 0, remain_days: Number(body.remain_days) || 0 };
        await saveWorkspace(data, dataRevision); return response({ ok: true, phd: overview().phd });
      }
      if (path === '/api/graduation-settings' && method === 'POST') {
        var required = Math.max(0, Math.floor(Number(body.required) || 0));
        var achieved = Math.max(0, Math.floor(Number(body.achieved) || 0));
        data.graduationConfig = { label: 'C刊/SCI论文', achieved: achieved, required: required };
        await saveWorkspace(data, dataRevision); return response({ ok: true, graduation: graduation(data.publications, data.graduationConfig) });
      }
      if (path === '/api/news') return response({ ok: true, data: { news: {}, weather: null } });
      if (path === '/api/todos') {
        if (method === 'GET') return response(data.todos);
        if (body.action === 'add' && String(body.text || '').trim()) data.todos.push({ id: nowId(), text: String(body.text).trim(), done: false, created: nowText(), deadline: body.deadline || '', priority: body.priority || '普通' });
        if (body.action === 'toggle') data.todos.forEach(function (item) { if (item.id === body.id) item.done = !item.done; });
        if (body.action === 'delete') data.todos = data.todos.filter(function (item) { return item.id !== body.id; });
        await saveWorkspace(data, dataRevision); return response({ ok: true, todos: data.todos });
      }
      if (path === '/api/journal') {
        if (method === 'GET') return response(data.journal);
        if (body.action === 'delete') data.journal = data.journal.filter(function (item) { return item.id !== body.id; });
        else if (String(body.content || '').trim()) data.journal.unshift({ id: nowId(), date: body.date || dateText(), type: body.type || '日常', content: String(body.content).trim(), created: nowText() });
        await saveWorkspace(data, dataRevision); return response({ ok: true, journal: data.journal });
      }
      if (path === '/api/publications') {
        if (method === 'GET') return response({ publications: data.publications, graduation: graduation(data.publications, data.graduationConfig) });
        if (body.action === 'add' && String(body.title || '').trim()) data.publications.push({ id: nowId(), title: String(body.title).trim(), type: body.type || 'c_journal', journal: String(body.journal || '').trim(), date: String(body.date || '').trim(), note: String(body.note || '').trim(), created: nowText() });
        if (body.action === 'delete') data.publications = data.publications.filter(function (item) { return item.id !== body.id; });
        await saveWorkspace(data, dataRevision); return response({ ok: true, publications: data.publications, graduation: graduation(data.publications, data.graduationConfig) });
      }
      if (path === '/api/academic-records') {
        var records = data.academicRecords || (data.academicRecords = { funding: [], awards: [], conferences: [] });
        if (body.action === 'add' && ['funding', 'awards', 'conferences'].indexOf(body.kind) >= 0 && String(body.title || '').trim()) records[body.kind].unshift({ id: nowId(), title: String(body.title).trim(), meta: String(body.meta || '').trim(), details: body.details && typeof body.details === 'object' ? body.details : {}, date: dateText() });
        if (body.action === 'delete') ['funding', 'awards', 'conferences'].forEach(function (kind) { records[kind] = records[kind].filter(function (item) { return item.id !== body.id; }); });
        await saveWorkspace(data, dataRevision); return response({ ok: true, records: records });
      }
      if (path === '/api/knowledge-base') {
        var kb = data.knowledgeBase || (data.knowledgeBase = { folders: [], docs: [] });
        kb.folders = Array.isArray(kb.folders) ? kb.folders : [];
        kb.docs = Array.isArray(kb.docs) ? kb.docs : [];
        kb.trash = Array.isArray(kb.trash) ? kb.trash : [];
        if (method === 'GET') return response({ ok: true, knowledgeBase: kb });
        if (body.action === 'create-folder' && String(body.title || '').trim()) kb.folders.push({ id: nowId(), title: String(body.title).trim() });
        if (body.action === 'create-doc') kb.docs.unshift({ id: nowId(), title: String(body.title || '未命名文档').trim(), content: String(body.content || '').trim(), format: 'markdown', folderId: body.folderId || '', updated: nowText() });
        if (body.action === 'save-doc') kb.docs.forEach(function (doc) { if (doc.id === body.id) { doc.title = String(body.title || '未命名文档').trim(); doc.content = String(body.content || ''); doc.format = 'markdown'; doc.folderId = body.folderId || ''; doc.updated = nowText(); } });
        if (body.action === 'trash-doc') { var removedDoc = kb.docs.filter(function (doc) { return String(doc.id) === String(body.id); })[0]; if (removedDoc) { kb.trash.unshift({ id: nowId(), type: 'doc', item: removedDoc, deletedAt: nowText() }); kb.docs = kb.docs.filter(function (doc) { return String(doc.id) !== String(body.id); }); } }
        if (body.action === 'trash-folder') { var removedFolder = kb.folders.filter(function (folder) { return String(folder.id) === String(body.id); })[0]; if (removedFolder) { var documentIds = kb.docs.filter(function (doc) { return String(doc.folderId) === String(body.id); }).map(function (doc) { return doc.id; }); kb.trash.unshift({ id: nowId(), type: 'folder', item: removedFolder, documentIds: documentIds, deletedAt: nowText() }); kb.folders = kb.folders.filter(function (folder) { return String(folder.id) !== String(body.id); }); kb.docs.forEach(function (doc) { if (String(doc.folderId) === String(body.id)) doc.folderId = ''; }); } }
        if (body.action === 'restore-trash') { var restored = kb.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restored && restored.item) { if (restored.type === 'doc' && !kb.docs.some(function (doc) { return String(doc.id) === String(restored.item.id); })) kb.docs.unshift(restored.item); if (restored.type === 'folder' && !kb.folders.some(function (folder) { return String(folder.id) === String(restored.item.id); })) { kb.folders.push(restored.item); kb.docs.forEach(function (doc) { if ((restored.documentIds || []).some(function (docId) { return String(docId) === String(doc.id); }) && !doc.folderId) doc.folderId = restored.item.id; }); } kb.trash = kb.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } }
        if (body.action === 'purge-trash') kb.trash = kb.trash.filter(function (entry) { return String(entry.id) !== String(body.id); });
        if (body.action === 'purge-all-trash') kb.trash = [];
        if (body.action === 'reorder-docs' && Array.isArray(body.ids)) { var rank = {}; body.ids.forEach(function (id, index) { rank[String(id)] = index; }); kb.docs.sort(function (a, b) { return (rank[String(a.id)] == null ? 999999 : rank[String(a.id)]) - (rank[String(b.id)] == null ? 999999 : rank[String(b.id)]); }); }
        await saveWorkspace(data, dataRevision); return response({ ok: true, knowledgeBase: kb });
      }
      return response({ ok: false, error: '此功能需要本地 Python 服务' }, 501);
    } catch (error) {
      if (error.workspaceConflict) return response({ ok: false, workspaceConflict: error.workspaceConflict, error: error.message }, 409);
      return response({ ok: false, error: error.message || '云端同步失败' }, 500);
    }
  };
})(window.__nativeFetch = window.fetch.bind(window));
