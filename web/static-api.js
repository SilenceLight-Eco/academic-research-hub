/* Static GitHub Pages adapter: keeps the core workbench data in Supabase. */
(function () {
  'use strict';

  var url = 'https://gqopwqpysoixcgdacurx.supabase.co';
  var key = 'sb_publishable_83K9_IrwPtRpagaYZqEvxw_nOsYpEZs';
  var client = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  // Exposed so the workbench waits until the saved session has been restored.
  window.__academicAuthReady = client.auth.getSession();
  var workspace = null;
  var saveTimer = null;
  var focusKeys = ['academic-workbench-theme', 'wb_pomo_counts', 'wb_focus_preset', 'wb_focus_log', 'wb_focus_state'];
  var researchHubKeys = ['research-hub-crossref-email', 'research-hub-crossref-citations-v1', 'research-hub-stages-v1', 'research-hub-fields-v1', 'research-hub-cards-v1', 'research-hub-theme'];

  function response(data, status) { return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
  function nowId() { return Date.now(); }
  function nowText() { return new Date().toLocaleString('sv-SE').slice(0, 16).replace('T', ' '); }
  function dateText() { return new Date().toISOString().slice(0, 10); }
  function currentPayload() { return workspace || { todos: [], journal: [], publications: [], academicRecords: { funding: [], awards: [], conferences: [] }, knowledgeBase: { folders: [], docs: [] }, studyProgress: {}, graduationConfig: {}, browser: {}, researchHub: {} }; }
  function browserSnapshot() { var result = {}; focusKeys.forEach(function (k) { result[k] = localStorage.getItem(k); }); return result; }
  function researchSnapshot() { var result = {}; researchHubKeys.forEach(function (k) { result[k] = localStorage.getItem(k); }); return result; }
  function graduation(pubs, config) { var items = (pubs || []).filter(function (p) { return p.type === 'c_journal'; }); var settings = config || {}; var required = Math.max(0, Number(settings.required) || 2); var achieved = settings.achieved == null ? items.length : Math.max(0, Number(settings.achieved) || 0); var label = 'C刊/SCI论文'; return { c_journal: { label: label, required: required, achieved: achieved, remaining: Math.max(0, required - achieved), complete: achieved >= required, items: items } }; }
  function overview() { var payload = currentPayload(); var defaults = { configured: false, label: '学业进度', stage: '', percent: 0, start: '', end: '', remain_days: 0 }; return { field_name: 'Academic Research Hub', phd: Object.assign(defaults, payload.studyProgress || {}), graduation: graduation(payload.publications, payload.graduationConfig), academic_records: payload.academicRecords || { funding: [], awards: [], conferences: [] }, sections: [], tree: { name: '浏览器版不访问本地文件', children: [], count: 0 } }; }
  // Read the persisted browser session first. Unlike getUser(), this does not
  // depend on a network round-trip during a page refresh.
  async function getUser() { await window.__academicAuthReady; var result = await client.auth.getSession(); return result.data.session ? result.data.session.user : null; }
  async function loadWorkspace() {
    var user = await getUser();
    if (!user) return null;
    var result = await client.from('user_workspaces').select('payload').eq('user_id', user.id).maybeSingle();
    if (result.error) throw result.error;
    workspace = (result.data && result.data.payload) || { todos: [], journal: [], publications: [], browser: {}, researchHub: {} };
    workspace.todos = Array.isArray(workspace.todos) ? workspace.todos : [];
    workspace.journal = Array.isArray(workspace.journal) ? workspace.journal : [];
    workspace.publications = Array.isArray(workspace.publications) ? workspace.publications : [];
    workspace.academicRecords = workspace.academicRecords || { funding: [], awards: [], conferences: [] };
    workspace.knowledgeBase = workspace.knowledgeBase || { folders: [], docs: [] };
    workspace.knowledgeBase.folders = Array.isArray(workspace.knowledgeBase.folders) ? workspace.knowledgeBase.folders : [];
    workspace.knowledgeBase.docs = Array.isArray(workspace.knowledgeBase.docs) ? workspace.knowledgeBase.docs : [];
    workspace.studyProgress = workspace.studyProgress || {};
    workspace.graduationConfig = workspace.graduationConfig || {};
    ['funding', 'awards', 'conferences'].forEach(function (kind) { if (!Array.isArray(workspace.academicRecords[kind])) workspace.academicRecords[kind] = []; });
    workspace.browser = workspace.browser || {};
    workspace.researchHub = workspace.researchHub || {};
    return workspace;
  }
  async function saveWorkspace() {
    var user = await getUser();
    if (!user) return;
    var payload = currentPayload();
    payload.browser = browserSnapshot();
    payload.researchHub = researchSnapshot();
    var result = await client.from('user_workspaces').upsert({ user_id: user.id, payload: payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (result.error) throw result.error;
  }
  function applyBrowser(payload) {
    var values = (payload && payload.browser) || {};
    focusKeys.concat(researchHubKeys).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(values, k)) values[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, values[k]); });
    Object.keys((payload && payload.researchHub) || {}).forEach(function (k) { if (researchHubKeys.indexOf(k) >= 0) localStorage.setItem(k, payload.researchHub[k]); });
  }
  function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { saveWorkspace().catch(function () {}); }, 750); }
  var originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (name, value) { originalSetItem.call(this, name, value); if (this === localStorage && (focusKeys.indexOf(name) >= 0 || researchHubKeys.indexOf(name) >= 0)) queueSave(); };

  window.fetch = async function (input, options) {
    var requestUrl = typeof input === 'string' ? input : input.url;
    if (requestUrl.indexOf('/api/') !== 0) return window.__nativeFetch(input, options);
    var method = (options && options.method) || 'GET';
    var path = requestUrl.split('?')[0];
    var body = options && options.body ? JSON.parse(options.body) : {};
    try {
      if (path === '/api/auth/me') { var me = await getUser(); return response({ user: me ? { email: me.email } : null }); }
      if (path === '/api/auth/login') { var login = await client.auth.signInWithPassword({ email: body.email, password: body.password }); if (login.error) return response({ error: login.error.message }, 401); workspace = null; return response({ ok: true, user: { email: login.data.user.email } }); }
      if (path === '/api/auth/register') { var signup = await client.auth.signUp({ email: body.email, password: body.password }); if (signup.error) return response({ error: signup.error.message }, 400); if (signup.data.session) workspace = null; return response({ ok: true, user: { email: body.email } }); }
      if (path === '/api/auth/logout') { await client.auth.signOut(); workspace = null; return response({ ok: true }); }
      if (path === '/api/sync') {
        if (method === 'GET') { var existing = await loadWorkspace(); if (!existing) return response({ error: '请先登录' }, 401); applyBrowser(existing); return response({ data: existing }); }
        var user = await getUser(); if (!user) return response({ error: '请先登录' }, 401);
        workspace = Object.assign(currentPayload(), body.data || {}); await saveWorkspace(); return response({ ok: true });
      }
      var data = await loadWorkspace();
      if (!data && method === 'GET') data = currentPayload();
      if (!data) return response({ error: '请先登录后使用浏览器版工作台' }, 401);
      if (path === '/api/overview') return response(overview());
      if (path === '/api/study-progress' && method === 'POST') {
        var percent = Math.max(0, Math.min(100, Number(body.percent) || 0));
        data.studyProgress = { configured: true, label: String(body.label || '学业进度').trim() || '学业进度', stage: String(body.stage || '').trim(), percent: percent, start: String(body.start || '').trim(), end: String(body.end || '').trim(), elapsed_days: Number(body.elapsed_days) || 0, remain_days: Number(body.remain_days) || 0 };
        await saveWorkspace(); return response({ ok: true, phd: overview().phd });
      }
      if (path === '/api/graduation-settings' && method === 'POST') {
        var required = Math.max(0, Math.floor(Number(body.required) || 0));
        var achieved = Math.max(0, Math.floor(Number(body.achieved) || 0));
        data.graduationConfig = { label: 'C刊/SCI论文', achieved: achieved, required: required };
        await saveWorkspace(); return response({ ok: true, graduation: graduation(data.publications, data.graduationConfig) });
      }
      if (path === '/api/news') return response({ ok: true, data: { news: {}, weather: null } });
      if (path === '/api/todos') {
        if (method === 'GET') return response(data.todos);
        if (body.action === 'add' && String(body.text || '').trim()) data.todos.push({ id: nowId(), text: String(body.text).trim(), done: false, created: nowText(), deadline: body.deadline || '', priority: body.priority || '普通' });
        if (body.action === 'toggle') data.todos.forEach(function (item) { if (item.id === body.id) item.done = !item.done; });
        if (body.action === 'delete') data.todos = data.todos.filter(function (item) { return item.id !== body.id; });
        await saveWorkspace(); return response({ ok: true, todos: data.todos });
      }
      if (path === '/api/journal') {
        if (method === 'GET') return response(data.journal);
        if (body.action === 'delete') data.journal = data.journal.filter(function (item) { return item.id !== body.id; });
        else if (String(body.content || '').trim()) data.journal.unshift({ id: nowId(), date: body.date || dateText(), type: body.type || '日常', content: String(body.content).trim(), created: nowText() });
        await saveWorkspace(); return response({ ok: true, journal: data.journal });
      }
      if (path === '/api/publications') {
        if (method === 'GET') return response({ publications: data.publications, graduation: graduation(data.publications, data.graduationConfig) });
        if (body.action === 'add' && String(body.title || '').trim()) data.publications.push({ id: nowId(), title: String(body.title).trim(), type: body.type || 'c_journal', journal: String(body.journal || '').trim(), date: String(body.date || '').trim(), note: String(body.note || '').trim(), created: nowText() });
        if (body.action === 'delete') data.publications = data.publications.filter(function (item) { return item.id !== body.id; });
        await saveWorkspace(); return response({ ok: true, publications: data.publications, graduation: graduation(data.publications, data.graduationConfig) });
      }
      if (path === '/api/academic-records') {
        var records = data.academicRecords || (data.academicRecords = { funding: [], awards: [], conferences: [] });
        if (body.action === 'add' && ['funding', 'awards', 'conferences'].indexOf(body.kind) >= 0 && String(body.title || '').trim()) records[body.kind].unshift({ id: nowId(), title: String(body.title).trim(), meta: String(body.meta || '').trim(), details: body.details && typeof body.details === 'object' ? body.details : {}, date: dateText() });
        if (body.action === 'delete') ['funding', 'awards', 'conferences'].forEach(function (kind) { records[kind] = records[kind].filter(function (item) { return item.id !== body.id; }); });
        await saveWorkspace(); return response({ ok: true, records: records });
      }
      if (path === '/api/knowledge-base') {
        var kb = data.knowledgeBase || (data.knowledgeBase = { folders: [], docs: [] });
        kb.folders = Array.isArray(kb.folders) ? kb.folders : [];
        kb.docs = Array.isArray(kb.docs) ? kb.docs : [];
        if (method === 'GET') return response({ ok: true, knowledgeBase: kb });
        if (body.action === 'create-folder' && String(body.title || '').trim()) kb.folders.push({ id: nowId(), title: String(body.title).trim() });
        if (body.action === 'create-doc') kb.docs.unshift({ id: nowId(), title: String(body.title || '未命名文档').trim(), content: String(body.content || '').trim(), format: 'markdown', folderId: body.folderId || '', updated: nowText() });
        if (body.action === 'save-doc') kb.docs.forEach(function (doc) { if (doc.id === body.id) { doc.title = String(body.title || '未命名文档').trim(); doc.content = String(body.content || ''); doc.format = 'markdown'; doc.folderId = body.folderId || ''; doc.updated = nowText(); } });
        await saveWorkspace(); return response({ ok: true, knowledgeBase: kb });
      }
      return response({ ok: false, error: '此功能需要本地 Python 服务' }, 501);
    } catch (error) { return response({ error: error.message || '云端同步失败' }, 500); }
  };
})(window.__nativeFetch = window.fetch.bind(window));
