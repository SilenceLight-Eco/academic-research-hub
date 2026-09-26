/* Static GitHub Pages adapter: keeps the core workbench data in Supabase. */
(function () {
  'use strict';

  var url = 'https://gqopwqpysoixcgdacurx.supabase.co';
  var key = 'sb_publishable_83K9_IrwPtRpagaYZqEvxw_nOsYpEZs';
  var client = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  // Exposed so the workbench waits until the saved session has been restored.
  window.__academicAuthReady = client.auth.getSession();
  // MyMemory uses this contact email to apply its higher daily usage limit.
  // Return an empty string when signed out so callers can use anonymous access.
  window.__academicGetCurrentUserEmail = async function () {
    await window.__academicAuthReady;
    var result = await client.auth.getSession();
    return result && result.data && result.data.session && result.data.session.user
      ? String(result.data.session.user.email || '')
      : '';
  };
  window.__academicJournalTracker = async function (payload) {
    var sessionResult = await client.auth.getSession();
    var session = sessionResult && sessionResult.data && sessionResult.data.session;
    if (!session) throw new Error('请先登录后使用文献追踪');
    var result = await window.__nativeFetch(url + '/functions/v1/journal-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': key },
      body: JSON.stringify(payload || { action: 'list' })
    });
    var data = await result.json().catch(function () { return {}; });
    if (!result.ok || !data.ok) throw new Error(data.error || '文献追踪服务暂时不可用');
    return data;
  };
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
  var researchHubKeys = ['research-hub-crossref-email', 'research-hub-crossref-citations-v1', 'research-hub-stages-v1', 'research-hub-fields-v1', 'research-hub-cards-v1', 'research-hub-theme', 'research-hub-unassigned-data-code-v1', 'academic-workbench-tracker-display-v1', 'academic-workbench-journal-categories-v1', 'academic-workbench-journal-category-order-v1', 'academic-workbench-journal-category-colors-v1'];

  function response(data, status) { return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
  function nowId() { return Date.now(); }
  function nowText() { return new Date().toLocaleString('sv-SE').slice(0, 16).replace('T', ' '); }
  function variableImportFields(item) {
    var fields = {};
    ['name', 'role', 'paper', 'definition', 'measure', 'measureReferences', 'source'].forEach(function (key) {
      fields[key] = item && Object.prototype.hasOwnProperty.call(item, key) ? cloneValue(item[key]) : { __variableImportMissing: true };
    });
    return fields;
  }
  function variableImportFingerprint(value) {
    var text = JSON.stringify(value);
    var hashA = 2166136261, hashB = 5381;
    for (var i = 0; i < text.length; i += 1) { var code = text.charCodeAt(i); hashA = Math.imul(hashA ^ code, 16777619); hashB = Math.imul(hashB ^ code, 2246822519); }
    return text.length + ':' + (hashA >>> 0).toString(36) + ':' + (hashB >>> 0).toString(36);
  }
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
  function currentPayload() { return workspace || { todos: [], journal: [], publications: [], academicRecords: { funding: [], awards: [], conferences: [] }, academicRecordDrafts: {}, knowledgeBase: { folders: [], docs: [] }, noteStudio: { notes: [], trash: [] }, promptLibrary: { prompts: [], trash: [] }, researchProjects: { projects: [], trash: [] }, variableLibrary: { items: [], trash: [] }, dataCodeLibrary: { items: [], trash: [] }, studyProgress: {}, graduationConfig: {}, browser: {}, researchHub: {} }; }
  function browserSnapshot() { var result = {}; focusKeys.forEach(function (k) { result[k] = localStorage.getItem(k); }); return result; }
  function researchSnapshot() { var result = {}; researchHubKeys.forEach(function (k) { result[k] = localStorage.getItem(k); }); return result; }
  function graduation(pubs, config) { var items = (pubs || []).filter(function (p) { return p.type === 'c_journal'; }); var settings = config || {}; var required = Math.max(0, Number(settings.required) || 2); var achieved = settings.achieved == null ? items.length : Math.max(0, Number(settings.achieved) || 0); var label = 'C刊/SCI论文'; return { c_journal: { label: label, required: required, achieved: achieved, remaining: Math.max(0, required - achieved), complete: achieved >= required, items: items } }; }
  function overview() { var payload = currentPayload(); var defaults = { configured: false, label: '学业进度', stage: '', percent: 0, start: '', end: '', remain_days: 0 }; return { field_name: 'Academic Research Hub', phd: Object.assign(defaults, payload.studyProgress || {}), graduation: graduation(payload.publications, payload.graduationConfig), academic_records: payload.academicRecords || { funding: [], awards: [], conferences: [] }, academic_record_drafts: payload.academicRecordDrafts || {}, sections: [], tree: { name: '浏览器版不访问本地文件', children: [], count: 0 } }; }
  // Read the persisted browser session first. Unlike getUser(), this does not
  // depend on a network round-trip during a page refresh.
  async function getUser() { await window.__academicAuthReady; var result = await client.auth.getSession(); return result.data.session ? result.data.session.user : null; }
  var attachmentBucket = 'research-attachments';
  var attachmentTusPromise = null;
  function attachmentContext(kind, id) {
    var validKind = ['knowledge', 'project', 'reference', 'paper'].indexOf(kind) >= 0;
    var validId = /^[A-Za-z0-9_-]{1,120}$/.test(String(id || ''));
    if (!validKind || !validId) throw new Error('请先选择已保存的文档、项目或论文');
    return { kind: kind, id: String(id) };
  }
  async function attachmentSession() {
    await window.__academicAuthReady;
    var result = await client.auth.getSession();
    if (result.error || !result.data || !result.data.session) throw new Error('请先登录后使用云端附件');
    return result.data.session;
  }
  function loadAttachmentTus() {
    if (window.tus && window.tus.Upload) return Promise.resolve(window.tus);
    if (!attachmentTusPromise) attachmentTusPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js';
      script.onload = function () { window.tus && window.tus.Upload ? resolve(window.tus) : reject(new Error('大文件上传组件未加载')); };
      script.onerror = function () { reject(new Error('大文件上传组件加载失败，请检查网络')); };
      document.head.appendChild(script);
    }).catch(function (error) { attachmentTusPromise = null; throw error; });
    return attachmentTusPromise;
  }
  async function uploadLargeAttachment(file, path, session, onProgress) {
    var tus = await loadAttachmentTus();
    return new Promise(function (resolve, reject) {
      var upload = new tus.Upload(file, {
        endpoint: 'https://gqopwqpysoixcgdacurx.storage.supabase.co/storage/v1/upload/resumable',
        retryDelays: [0, 3000, 5000, 10000],
        headers: { authorization: 'Bearer ' + session.access_token, apikey: key },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: { bucketName: attachmentBucket, objectName: path, contentType: file.type || 'application/octet-stream', cacheControl: '3600' },
        onError: reject,
        onProgress: function (sent, total) { if (onProgress) onProgress(Math.round(sent / Math.max(total, 1) * 100)); },
        onSuccess: resolve
      });
      upload.findPreviousUploads().then(function (previous) {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(reject);
    });
  }
  window.__academicAttachments = {
    list: async function (kind, id) {
      var context = attachmentContext(kind, id);
      await attachmentSession();
      var result = await client.from('research_attachments')
        .select('id,file_name,file_size,content_type,created_at')
        .eq('context_kind', context.kind).eq('context_id', context.id)
        .order('created_at', { ascending: false }).limit(200);
      if (result.error) throw result.error;
      return result.data || [];
    },
    upload: async function (kind, id, file, onProgress) {
      var context = attachmentContext(kind, id);
      var session = await attachmentSession();
      if (!file || !file.name || file.size > 50 * 1024 * 1024) throw new Error('请选择不超过 50 MB 的文件');
      if (file.name.length > 255) throw new Error('文件名不能超过 255 个字符');
      var extension = (file.name.match(/\.([A-Za-z0-9]{1,12})$/) || [,'bin'])[1].toLowerCase();
      var path = session.user.id + '/' + context.kind + '/' + crypto.randomUUID() + '.' + extension;
      var storage = client.storage.from(attachmentBucket);
      if (file.size > 6 * 1024 * 1024) {
        await uploadLargeAttachment(file, path, session, onProgress);
      } else {
        var uploaded = await storage.upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (uploaded.error) throw uploaded.error;
        if (onProgress) onProgress(100);
      }
      var result = await client.from('research_attachments').insert({
        user_id: session.user.id, context_kind: context.kind, context_id: context.id,
        object_path: path, file_name: file.name, file_size: file.size,
        content_type: file.type || 'application/octet-stream'
      }).select('id,file_name,file_size,content_type,created_at').single();
      if (result.error) {
        await storage.remove([path]).catch(function () {});
        throw result.error;
      }
      return result.data;
    },
    download: async function (id) {
      await attachmentSession();
      var record = await client.from('research_attachments').select('object_path,file_name').eq('id', id).single();
      if (record.error) throw record.error;
      var downloaded = await client.storage.from(attachmentBucket).download(record.data.object_path);
      if (downloaded.error) throw downloaded.error;
      return { blob: downloaded.data, name: record.data.file_name };
    },
    remove: async function (id) {
      await attachmentSession();
      var record = await client.from('research_attachments').select('object_path').eq('id', id).single();
      if (record.error) throw record.error;
      var removed = await client.storage.from(attachmentBucket).remove([record.data.object_path]);
      if (removed.error) throw removed.error;
      var deleted = await client.from('research_attachments').delete().eq('id', id);
      if (deleted.error) throw deleted.error;
    }
  };
  async function readAllOwnRows(table, columns, orderColumn) {
    var rows = [], pageSize = 500;
    for (var offset = 0; ; offset += pageSize) {
      var query = client.from(table).select(columns || '*');
      if (orderColumn) query = query.order(orderColumn, { ascending: true });
      query = query.range(offset, offset + pageSize - 1);
      var result = await query;
      if (result.error) throw result.error;
      rows = rows.concat(result.data || []);
      if (!result.data || result.data.length < pageSize) return rows;
      if (rows.length > 100000) throw new Error('备份数据过多，请联系管理员');
    }
  }
  window.__academicBackup = {
    getAutomaticBackupPreferences: async function () {
      await attachmentSession();
      var result = await client.from('automatic_backup_preferences').select('enabled,updated_at').maybeSingle();
      if (result.error) throw result.error;
      return result.data || { enabled: false, updated_at: null };
    },
    setAutomaticBackupEnabled: async function (enabled) {
      var session = await attachmentSession();
      var result = await client.from('automatic_backup_preferences').upsert({ user_id: session.user.id, enabled: enabled === true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('enabled,updated_at').single();
      if (result.error) throw result.error;
      return result.data;
    },
    createAutomaticBackupNow: async function () {
      var session = await attachmentSession();
      var response = await window.__nativeFetch(url + '/functions/v1/automatic-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': key },
        body: JSON.stringify({ action: 'manual' })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || '生成云端快照失败');
      return data;
    },
    listAutomaticBackups: async function () {
      await attachmentSession();
      var result = await client.from('automatic_backups').select('id,created_at,workspace_bytes,subscription_count,article_count,attachment_count').order('created_at', { ascending: false }).limit(30);
      if (result.error) throw result.error;
      return result.data || [];
    },
    getAutomaticBackup: async function (id) {
      await attachmentSession();
      var result = await client.from('automatic_backups').select('id,created_at,payload').eq('id', id).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    exportJournal: async function () {
      await attachmentSession();
      var results = await Promise.all([
        readAllOwnRows('journal_subscriptions'),
        readAllOwnRows('journal_articles', '*', 'discovered_at'),
        readAllOwnRows('journal_tracker_refresh_logs', 'id,user_id,subscription_id,checked_at,source,ok,article_count,error', 'checked_at')
      ]);
      function withoutUserId(rows) { return rows.map(function (row) { var safe = Object.assign({}, row); delete safe.user_id; return safe; }); }
      return { subscriptions: withoutUserId(results[0]), articles: withoutUserId(results[1]), refreshLogs: withoutUserId(results[2]) };
    },
    restoreJournal: async function (snapshot) {
      var session = await attachmentSession(), userId = session.user.id;
      var subscriptions = Array.isArray(snapshot && snapshot.subscriptions) ? snapshot.subscriptions : [];
      var articles = Array.isArray(snapshot && snapshot.articles) ? snapshot.articles : [];
      var idByIssn = {};
      for (var offset = 0; offset < subscriptions.length; offset += 100) {
        var batch = subscriptions.slice(offset, offset + 100).map(function (row) {
          var safe = Object.assign({}, row, { user_id: userId });
          delete safe.id;
          return safe;
        });
        var saved = await client.from('journal_subscriptions').upsert(batch, { onConflict: 'user_id,issn' }).select('id,issn');
        if (saved.error) throw saved.error;
        (saved.data || []).forEach(function (row) { idByIssn[row.issn] = row.id; });
      }
      // Resolve archived subscription IDs against the current account's rows too,
      // so restoring into another account maps articles to that account's IDs.
      var current = await readAllOwnRows('journal_subscriptions', 'id,issn', 'created_at');
      current.forEach(function (row) { idByIssn[row.issn] = row.id; });
      var archivedIssnById = {};
      subscriptions.forEach(function (row) { archivedIssnById[row.id] = row.issn; });
      for (var articleOffset = 0; articleOffset < articles.length; articleOffset += 100) {
        var articleBatch = articles.slice(articleOffset, articleOffset + 100).map(function (row) {
          var safe = Object.assign({}, row, { user_id: userId });
          var issn = archivedIssnById[row.subscription_id];
          if (issn && idByIssn[issn]) safe.subscription_id = idByIssn[issn];
          delete safe.id;
          return safe;
        }).filter(function (row) { return Boolean(row.subscription_id); });
        if (!articleBatch.length) continue;
        var savedArticles = await client.from('journal_articles').upsert(articleBatch, { onConflict: 'subscription_id,article_key' });
        if (savedArticles.error) throw savedArticles.error;
      }
      return { subscriptions: subscriptions.length, articles: articles.length };
    },
    exportAttachments: async function () {
      await attachmentSession();
      var records = await readAllOwnRows('research_attachments', '*', 'created_at');
      var result = [];
      for (var i = 0; i < records.length; i += 1) {
        var item = records[i];
        var downloaded = await client.storage.from(attachmentBucket).download(item.object_path);
        if (downloaded.error) throw downloaded.error;
        result.push({ metadata: item, blob: downloaded.data });
      }
      return result;
    },
    restoreAttachments: async function (items) {
      await attachmentSession();
      var restored = 0;
      for (var i = 0; i < (items || []).length; i += 1) {
        var item = items[i], metadata = item && item.metadata, blob = item && item.blob;
        if (!metadata || !blob || !metadata.file_name || !metadata.context_kind || !metadata.context_id) continue;
        var exists = await client.from('research_attachments').select('id')
          .eq('context_kind', metadata.context_kind).eq('context_id', metadata.context_id)
          .eq('file_name', metadata.file_name).eq('file_size', metadata.file_size).limit(1);
        if (exists.error) throw exists.error;
        if ((exists.data || []).length) continue;
        var file = new File([blob], metadata.file_name, { type: metadata.content_type || 'application/octet-stream' });
        await window.__academicAttachments.upload(metadata.context_kind, metadata.context_id, file);
        restored += 1;
      }
      return restored;
    }
  };
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
    workspace.academicRecordDrafts = workspace.academicRecordDrafts && typeof workspace.academicRecordDrafts === 'object' ? workspace.academicRecordDrafts : {};
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
    workspace.variableLibrary = workspace.variableLibrary || { items: [], trash: [] };
    workspace.variableLibrary.items = Array.isArray(workspace.variableLibrary.items) ? workspace.variableLibrary.items : [];
    workspace.variableLibrary.trash = Array.isArray(workspace.variableLibrary.trash) ? workspace.variableLibrary.trash : [];
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
        if (pendingWorkspaceConflict && !force) {
          pendingWorkspaceConflict.localData = copyPayload(payload);
          throw conflictError(payload, pendingWorkspaceConflict.cloudUpdatedAt);
        }
        return commitWorkspace(user, generation, payload, basePayload, baseRevision, force, localModifiedAt, 0);
      });
    });
    workspaceWriteChain = queued.then(function () {}, function () {});
    return queued;
  }
  function notifyCloudMerge() {
    window.__academicCloudRefreshRequired = true;
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
      if (samePayload(merged, latestPayload)) {
        notifyCloudMerge();
        return;
      }
      if (attempt >= 4) throw conflictError(merged, latestRevision);
      await commitWorkspace(user, generation, merged, copyPayload(latestPayload), latestRevision, false, localModifiedAt, attempt + 1);
      if (generation !== workspaceSessionGeneration) return;
      notifyCloudMerge();
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
      Object.keys((payload && payload.researchHub) || {}).forEach(function (k) {
        if (researchHubKeys.indexOf(k) < 0) return;
        if ((k === 'academic-workbench-tracker-display-v1' || k === 'academic-workbench-journal-categories-v1' || k === 'academic-workbench-journal-category-order-v1' || k === 'academic-workbench-journal-category-colors-v1') && payload.researchHub[k] == null) return;
        if (payload.researchHub[k] == null) localStorage.removeItem(k);
        else localStorage.setItem(k, payload.researchHub[k]);
      });
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
      if (path === '/api/prompt-library' && body.action === 'reorder') {
        var orderedLibrary = data.promptLibrary || (data.promptLibrary = { prompts: [], trash: [], categories: ['通用'] });
        orderedLibrary.prompts = Array.isArray(orderedLibrary.prompts) ? orderedLibrary.prompts : [];
        orderedLibrary.trash = Array.isArray(orderedLibrary.trash) ? orderedLibrary.trash : [];
        orderedLibrary.categories = Array.isArray(orderedLibrary.categories) ? orderedLibrary.categories : [];
        var editedPrompt = body.currentPrompt;
        if (editedPrompt && editedPrompt.id != null) orderedLibrary.prompts.forEach(function (prompt) { if (String(prompt.id) === String(editedPrompt.id)) { prompt.title = String(editedPrompt.title || '未命名提示词').trim(); prompt.category = String(editedPrompt.category || '通用').trim() || '通用'; prompt.tags = String(editedPrompt.tags || '').trim(); prompt.body = String(editedPrompt.body || ''); prompt.updated = nowText(); } });
        if (body.movePromptId != null && String(body.movePromptCategory || '').trim()) orderedLibrary.prompts.forEach(function (prompt) { if (String(prompt.id) === String(body.movePromptId)) prompt.category = String(body.movePromptCategory).trim().slice(0, 40); });
        var requestedCategories = Array.isArray(body.categories) ? body.categories.map(function (item) { return String(item || '').trim().slice(0, 40); }).filter(Boolean) : [];
        var allPromptCategories = orderedLibrary.prompts.map(function (prompt) { return String(prompt.category || '通用').trim() || '通用'; });
        orderedLibrary.categories = Array.from(new Set(requestedCategories.concat(orderedLibrary.categories, allPromptCategories)));
        var promptById = new Map(orderedLibrary.prompts.map(function (prompt) { return [String(prompt.id), prompt]; }));
        var nextPromptOrder = [];
        (Array.isArray(body.promptIds) ? body.promptIds : []).forEach(function (id) { var prompt = promptById.get(String(id)); if (prompt && nextPromptOrder.indexOf(prompt) < 0) nextPromptOrder.push(prompt); });
        orderedLibrary.prompts.forEach(function (prompt) { if (nextPromptOrder.indexOf(prompt) < 0) nextPromptOrder.push(prompt); });
        orderedLibrary.prompts = nextPromptOrder;
        await saveWorkspace(data, dataRevision);
        return response({ ok: true, promptLibrary: orderedLibrary });
      }
      if (path === '/api/prompt-library' && (body.action === 'rename-category' || body.action === 'delete-category')) {
        var promptLibrary = data.promptLibrary || (data.promptLibrary = { prompts: [], trash: [], categories: ['通用'] });
        promptLibrary.prompts = Array.isArray(promptLibrary.prompts) ? promptLibrary.prompts : [];
        promptLibrary.trash = Array.isArray(promptLibrary.trash) ? promptLibrary.trash : [];
        promptLibrary.categories = Array.isArray(promptLibrary.categories) ? promptLibrary.categories : [];
        var oldCategory = String(body.category || '').trim();
        var managedCategory = oldCategory === '通用' ? '通用' : oldCategory;
        var categoryExists = managedCategory && (managedCategory === '通用' || promptLibrary.categories.indexOf(managedCategory) >= 0 || promptLibrary.prompts.some(function (prompt) { return String(prompt.category || '通用').trim() === managedCategory; }));
        if (!managedCategory || (managedCategory === '通用' && body.action === 'rename-category')) return response({ ok: false, error: '“通用”默认文件夹不能重命名' }, 400);
        if (!categoryExists) return response({ ok: false, error: '找不到该文件夹，可能已被移除' }, 404);
        var nextCategory = String(body.newCategory || '').trim().slice(0, 40);
        if (body.action === 'rename-category') {
          if (!nextCategory) return response({ ok: false, error: '文件夹名称不能为空' }, 400);
          if (promptLibrary.categories.some(function (item) { return String(item).toLocaleLowerCase() === nextCategory.toLocaleLowerCase() && String(item) !== managedCategory; }) || promptLibrary.prompts.some(function (prompt) { return String(prompt.category || '通用').toLocaleLowerCase() === nextCategory.toLocaleLowerCase() && String(prompt.category || '通用') !== managedCategory; })) return response({ ok: false, error: '已存在同名文件夹' }, 409);
        }
        var currentPrompt = body.currentPrompt;
        if (currentPrompt && currentPrompt.id != null) promptLibrary.prompts.forEach(function (prompt) { if (String(prompt.id) === String(currentPrompt.id)) { prompt.title = String(currentPrompt.title || '未命名提示词').trim(); prompt.category = String(currentPrompt.category || '通用').trim() || '通用'; prompt.tags = String(currentPrompt.tags || '').trim(); prompt.body = String(currentPrompt.body || ''); prompt.updated = nowText(); } });
        var destinationCategory = body.action === 'delete-category' ? String(body.destinationCategory || '').trim().slice(0, 40) : nextCategory;
        if (body.action === 'delete-category') {
          if (!destinationCategory || destinationCategory === managedCategory) destinationCategory = promptLibrary.categories.concat(promptLibrary.prompts.map(function (prompt) { return String(prompt.category || '通用').trim(); })).filter(function (item) { return item && item !== managedCategory; }).sort()[0] || '未分类';
          if (destinationCategory === managedCategory) destinationCategory = '未分类';
          if (promptLibrary.categories.indexOf(destinationCategory) < 0) promptLibrary.categories.push(destinationCategory);
        }
        promptLibrary.prompts.forEach(function (prompt) { if (String(prompt.category || '通用').trim() === managedCategory) prompt.category = destinationCategory; });
        promptLibrary.trash.forEach(function (entry) { if (entry.item && String(entry.item.category || '通用').trim() === managedCategory) entry.item.category = destinationCategory; });
        promptLibrary.categories = promptLibrary.categories.map(function (item) { return String(item) === managedCategory ? destinationCategory : String(item); }).filter(function (item, index, all) { return item && all.indexOf(item) === index; });
        if (managedCategory !== '通用' && promptLibrary.categories.indexOf('通用') < 0) promptLibrary.categories.unshift('通用');
        await saveWorkspace(data, dataRevision);
        return response({ ok: true, promptLibrary: promptLibrary });
      }
      if (path === '/api/backup') { if (!await getUser()) return response({ error: '请先登录后使用数据备份' }, 401); if (method === 'GET') return response({ ok: true, data: data }); var backup = body.backup; if (!backup || backup.format !== 'academic-research-hub-backup' || backup.version !== 1 || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) return response({ ok: false, error: '备份文件格式无效或版本不受支持' }, 400); if (JSON.stringify(backup.data).length > 20000000) return response({ ok: false, error: '备份文件超过 20 MB' }, 413); workspace = JSON.parse(JSON.stringify(backup.data)); activeWritePayload = workspace; applyBrowser(workspace); await saveWorkspace(workspace, dataRevision, body.overrideConflict === true); return response({ ok: true, restoredAt: nowText() }); }
      if (path === '/api/note-studio' && body.action === 'save') { var historyNotes = data.noteStudio && data.noteStudio.notes || []; var historyNote = historyNotes.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (historyNote) archiveVersion(historyNote, ['title', 'markdown', 'style'], { title: String(body.title || '未命名笔记').trim(), markdown: String(body.markdown || ''), style: ['paper', 'ink', 'mint'].indexOf(body.style) >= 0 ? body.style : 'paper' }); }
      if (path === '/api/prompt-library' && body.action === 'save') { var historyPrompts = data.promptLibrary && data.promptLibrary.prompts || []; var historyPrompt = historyPrompts.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (historyPrompt) archiveVersion(historyPrompt, ['title', 'category', 'tags', 'body'], { title: String(body.title || '未命名提示词').trim(), category: String(body.category || '通用').trim(), tags: String(body.tags || '').trim(), body: String(body.body || '') }); }
      if (path === '/api/knowledge-base' && body.action === 'save-doc') { var historyDocs = data.knowledgeBase && data.knowledgeBase.docs || []; var historyDoc = historyDocs.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (historyDoc) archiveVersion(historyDoc, ['title', 'content', 'folderId'], { title: String(body.title || '未命名文档').trim(), content: String(body.content || ''), folderId: body.folderId || '' }); }
      if (path === '/api/note-studio') { var notes = data.noteStudio || (data.noteStudio = { notes: [], trash: [] }); notes.notes = Array.isArray(notes.notes) ? notes.notes : []; notes.trash = Array.isArray(notes.trash) ? notes.trash : []; if (method === 'GET') return response({ ok: true, noteStudio: notes }); if (body.action === 'create') notes.notes.unshift({ id: nowId(), title: '未命名笔记', markdown: '', style: 'paper', feishuUrl: '', feishuDocId: '', feishuExportedAt: '', updated: nowText() }); if (body.action === 'save') notes.notes.forEach(function (note) { if (String(note.id) === String(body.id)) { note.title = String(body.title || '未命名笔记').trim(); note.markdown = String(body.markdown || ''); note.style = ['paper', 'ink', 'mint'].indexOf(body.style) >= 0 ? body.style : 'paper'; if (typeof body.feishuUrl === 'string') note.feishuUrl = body.feishuUrl.trim().slice(0, 2048); if (typeof body.feishuDocId === 'string') note.feishuDocId = body.feishuDocId.trim().slice(0, 256); if (typeof body.feishuExportedAt === 'string') note.feishuExportedAt = body.feishuExportedAt.trim().slice(0, 64); note.updated = nowText(); } }); if (body.action === 'trash') { var removedNote = notes.notes.filter(function (note) { return String(note.id) === String(body.id); })[0]; if (removedNote) { notes.trash.unshift({ id: nowId(), item: removedNote, deletedAt: nowText() }); notes.notes = notes.notes.filter(function (note) { return String(note.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredNote = notes.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredNote && restoredNote.item) { notes.notes.unshift(restoredNote.item); notes.trash = notes.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') notes.trash = notes.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') notes.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, noteStudio: notes }); }
      if (path === '/api/prompt-library') { var library = data.promptLibrary || (data.promptLibrary = { prompts: [], trash: [], categories: ['通用'] }); library.prompts = Array.isArray(library.prompts) ? library.prompts : []; library.trash = Array.isArray(library.trash) ? library.trash : []; library.categories = Array.isArray(library.categories) ? library.categories : []; if (method === 'GET') return response({ ok: true, promptLibrary: library }); if (body.action === 'add-category') { var categoryName = String(body.category || '').trim().slice(0, 40); if (!categoryName) return response({ ok: false, error: '请输入分类名称' }, 400); if (!library.categories.some(function (item) { return String(item).toLocaleLowerCase() === categoryName.toLocaleLowerCase(); })) library.categories.push(categoryName); } if (body.action === 'create') { var promptCategory = String(body.category || '通用').trim() || '通用'; if (!library.categories.some(function (item) { return String(item) === promptCategory; })) library.categories.push(promptCategory); library.prompts.unshift({ id: nowId(), title: '未命名提示词', category: promptCategory, tags: '', body: '', updated: nowText() }); } if (body.action === 'save') library.prompts.forEach(function (prompt) { if (String(prompt.id) === String(body.id)) { prompt.title = String(body.title || '未命名提示词').trim(); prompt.category = String(body.category || '通用').trim(); if (!library.categories.some(function (item) { return String(item) === prompt.category; })) library.categories.push(prompt.category); prompt.tags = String(body.tags || '').trim(); prompt.body = String(body.body || ''); prompt.updated = nowText(); } }); if (body.action === 'trash') { var removedPrompt = library.prompts.filter(function (prompt) { return String(prompt.id) === String(body.id); })[0]; if (removedPrompt) { library.trash.unshift({ id: nowId(), item: removedPrompt, deletedAt: nowText() }); library.prompts = library.prompts.filter(function (prompt) { return String(prompt.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredPrompt = library.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredPrompt && restoredPrompt.item) { library.prompts.unshift(restoredPrompt.item); library.trash = library.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') library.trash = library.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') library.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, promptLibrary: library }); }
      if (path === '/api/variable-library') {
        var variableLibrary = data.variableLibrary || (data.variableLibrary = { items: [], trash: [] });
        variableLibrary.items = Array.isArray(variableLibrary.items) ? variableLibrary.items : [];
        variableLibrary.trash = Array.isArray(variableLibrary.trash) ? variableLibrary.trash : [];
        if (method === 'GET') return response({ ok: true, variableLibrary: variableLibrary });
        var variableRoles = ['被解释变量', '核心解释变量', '控制变量', '机制变量', '调节变量', '经济后果变量', '异质性分析变量', '其他'];
        var duplicateId = null;
        var importedIds = [];
        if (body.action === 'import' && Array.isArray(body.items)) {
          var requestedUpdateIds = body.updateExisting && Array.isArray(body.updateIds) ? Array.from(new Set(body.updateIds.slice(0, 500).map(String))) : [];
          var missingUpdateIds = requestedUpdateIds.filter(function (id) { return !variableLibrary.items.some(function (item) { return String(item.id) === id; }); });
          if (missingUpdateIds.length) return response({ ok: false, error: '部分待更新变量已在预览后发生变化，请重新导入并检查预览' }, 409);
          var undoCreated = [], undoUpdated = [];
          var importedVariables = body.items.slice(0, 500).map(function (source) {
            source = source || {};
            var role = variableRoles.indexOf(source.role) >= 0 ? source.role : '其他';
            var entries = (Array.isArray(source.measureReferences) ? source.measureReferences : []).slice(0, 100).map(function (entry) { entry = entry || {}; var measures = Array.isArray(entry.measures) ? entry.measures.slice(0, 30).map(function (value) { return String(value || '').slice(0, 20000); }) : [String(entry.measure || '').slice(0, 20000)]; if (!measures.length) measures = ['']; var papers = Array.isArray(entry.papers) ? entry.papers.slice(0, 30).map(function (value) { return String(value || '').trim().slice(0, 500); }) : [String(entry.paper || '').trim().slice(0, 500)]; if (!papers.length) papers = ['']; return { role: [role], source: String(entry.source || '').slice(0, 20000), measure: measures[0], measures: measures, paper: papers[0], papers: papers }; });
            if (!entries.length) entries.push({ role: [role], source: '', measure: '', paper: '' });
            var first = entries[0];
            var existingVariable = source.id != null && requestedUpdateIds.indexOf(String(source.id)) >= 0 ? variableLibrary.items.filter(function (item) { return String(item.id) === String(source.id); })[0] : null;
            if (existingVariable) {
              var beforeFields = variableImportFields(existingVariable);
              existingVariable.name = String(source.name || existingVariable.name || '未命名变量').trim().slice(0, 200);
              existingVariable.role = [role];
              existingVariable.paper = first.paper;
              existingVariable.definition = String(source.definition || '').slice(0, 20000);
              existingVariable.measure = first.measure;
              existingVariable.measureReferences = entries;
              existingVariable.source = first.source;
              existingVariable.updated = nowText();
              undoUpdated.push({ id: String(existingVariable.id), name: existingVariable.name, before: beforeFields, afterFingerprint: variableImportFingerprint(variableImportFields(existingVariable)) });
              importedIds.push(existingVariable.id);
              return null;
            }
            var id = nowId();
            while (variableLibrary.items.some(function (item) { return String(item.id) === String(id); }) || variableLibrary.trash.some(function (entry) { return String(entry.item && entry.item.id) === String(id); }) || importedIds.some(function (existingId) { return String(existingId) === String(id); })) id += 1;
            importedIds.push(id);
            var createdVariable = { id: id, name: String(source.name || '未命名变量').trim().slice(0, 200), role: [role], symbol: '', unit: '', paper: first.paper, definition: String(source.definition || '').slice(0, 20000), measure: first.measure, measureReferences: entries, source: first.source, notes: '', updated: nowText() };
            undoCreated.push({ id: String(id), name: createdVariable.name, fingerprint: variableImportFingerprint(createdVariable) });
            return createdVariable;
          }).filter(Boolean);
          variableLibrary.items = importedVariables.concat(variableLibrary.items);
          var importHistory = Array.isArray(variableLibrary.importHistory) ? variableLibrary.importHistory.slice() : [];
          if (variableLibrary.importUndo && !importHistory.some(function (entry) { return entry && entry.id && entry.id === variableLibrary.importUndo.id; })) {
            var legacyImport = Object.assign({}, variableLibrary.importUndo);
            legacyImport.id = legacyImport.id || 'legacy-' + String(legacyImport.createdAt || nowId());
            importHistory.unshift(legacyImport);
          }
          var importRecord = { id: String(nowId()) + '-' + Math.random().toString(36).slice(2, 8), createdAt: nowText(), created: undoCreated, updated: undoUpdated };
          importHistory.unshift(importRecord);
          variableLibrary.importHistory = importHistory.slice(0, 10);
          variableLibrary.importUndo = importRecord;
        }
        if (body.action === 'undo-import') {
          var availableImportHistory = Array.isArray(variableLibrary.importHistory) ? variableLibrary.importHistory.slice() : [];
          if (!availableImportHistory.length && variableLibrary.importUndo) {
            var legacyUndo = Object.assign({}, variableLibrary.importUndo);
            legacyUndo.id = legacyUndo.id || 'legacy-' + String(legacyUndo.createdAt || nowId());
            availableImportHistory.push(legacyUndo);
          }
          var requestedImportId = body.importId == null ? '' : String(body.importId);
          var importUndo = requestedImportId ? availableImportHistory.filter(function (entry) { return String(entry.id) === requestedImportId; })[0] : availableImportHistory[0];
          if (!importUndo || (!Array.isArray(importUndo.created) && !Array.isArray(importUndo.updated))) return response({ ok: false, error: '没有可撤销的 CSV 导入记录' }, 404);
          var createdUndo = Array.isArray(importUndo.created) ? importUndo.created : [];
          var updatedUndo = Array.isArray(importUndo.updated) ? importUndo.updated : [];
          var importConflicts = [];
          createdUndo.forEach(function (entry) {
            var item = variableLibrary.items.filter(function (candidate) { return String(candidate.id) === String(entry.id); })[0];
            if (item && variableImportFingerprint(item) !== entry.fingerprint) importConflicts.push({ id: String(item.id), name: String(item.name || entry.name || '未命名变量'), reason: '新增后内容已修改' });
          });
          updatedUndo.forEach(function (entry) {
            var item = variableLibrary.items.filter(function (candidate) { return String(candidate.id) === String(entry.id); })[0];
            if (!item) {
              var trashed = variableLibrary.trash.filter(function (candidate) { return String(candidate.item && candidate.item.id) === String(entry.id); })[0];
              importConflicts.push({ id: String(entry.id), name: String(trashed && trashed.item && trashed.item.name || entry.name || '变量已不存在'), reason: trashed ? '变量已在回收站' : '变量已被删除' });
            } else if (variableImportFingerprint(variableImportFields(item)) !== entry.afterFingerprint) {
              importConflicts.push({ id: String(item.id), name: String(item.name || entry.name || '未命名变量'), reason: '导入后字段已修改' });
            }
          });
          if (importConflicts.length) return response({ ok: false, error: '以下变量在导入后已变化，为避免覆盖新内容，本批次撤销已停止；未更改任何数据', conflicts: importConflicts }, 409);
          var movedToTrash = 0;
          createdUndo.forEach(function (entry) {
            var item = variableLibrary.items.filter(function (candidate) { return String(candidate.id) === String(entry.id); })[0];
            if (!item) return;
            var trashId = nowId();
            while (variableLibrary.trash.some(function (candidate) { return String(candidate.id) === String(trashId); })) trashId += 1;
            variableLibrary.trash.unshift({ id: trashId, item: item, deletedAt: nowText() });
            variableLibrary.items = variableLibrary.items.filter(function (candidate) { return String(candidate.id) !== String(entry.id); });
            movedToTrash += 1;
          });
          updatedUndo.forEach(function (entry) {
            var item = variableLibrary.items.filter(function (candidate) { return String(candidate.id) === String(entry.id); })[0];
            Object.keys(entry.before || {}).forEach(function (key) {
              var value = entry.before[key];
              if (value && value.__variableImportMissing === true) delete item[key];
              else item[key] = cloneValue(value);
            });
            item.updated = nowText();
          });
          availableImportHistory = availableImportHistory.filter(function (entry) { return String(entry.id) !== String(importUndo.id); });
          variableLibrary.importHistory = availableImportHistory;
          variableLibrary.importUndo = availableImportHistory[0] || null;
          var undoneCounts = { createdMovedToTrash: movedToTrash, updatedRestored: updatedUndo.length };
        }
        if (body.action === 'reorder' && Array.isArray(body.ids)) {
          var variableOrderIds = body.ids.slice(0, 5000).map(String);
          var variableOrderSeen = Object.create(null);
          var reorderedVariables = [];
          variableOrderIds.forEach(function (id) {
            if (variableOrderSeen[id]) return;
            var orderedVariable = variableLibrary.items.filter(function (item) { return String(item.id) === id; })[0];
            if (orderedVariable) { reorderedVariables.push(orderedVariable); variableOrderSeen[id] = true; }
          });
          variableLibrary.items.forEach(function (item) { if (!variableOrderSeen[String(item.id)]) reorderedVariables.push(item); });
          variableLibrary.items = reorderedVariables;
        }
        if (body.action === 'create') { var createRoles = (Array.isArray(body.role) ? body.role : [body.role]).filter(function (role, index, all) { return variableRoles.indexOf(role) >= 0 && all.indexOf(role) === index; }); variableLibrary.items.push({ id: nowId(), name: '新变量', role: createRoles.length ? createRoles : ['被解释变量'], symbol: '', unit: '', paper: '', definition: '', measure: '', measureReferences: [], source: '', notes: '', updated: nowText() }); }
        if (body.action === 'duplicate') {
          var sourceVariable = variableLibrary.items.filter(function (item) { return String(item.id) === String(body.id); })[0];
          if (!sourceVariable) return response({ ok: false, error: '找不到要复制的变量' }, 404);
          var currentVariable = body.currentVariable || {};
          if (String(currentVariable.id) === String(sourceVariable.id)) {
            sourceVariable.name = String(currentVariable.name || sourceVariable.name || '未命名变量').trim().slice(0, 200);
            var duplicateRoles = (Array.isArray(currentVariable.role) ? currentVariable.role : [currentVariable.role]).filter(function (role, index, all) { return variableRoles.indexOf(role) >= 0 && all.indexOf(role) === index; });
            if (duplicateRoles.length) sourceVariable.role = duplicateRoles;
            sourceVariable.paper = String(currentVariable.paper || '').trim().slice(0, 500);
            sourceVariable.definition = String(currentVariable.definition || '').slice(0, 20000);
            sourceVariable.measure = String(currentVariable.measure || '').slice(0, 20000);
            if (Array.isArray(currentVariable.measureReferences)) sourceVariable.measureReferences = currentVariable.measureReferences.slice(0, 100).map(function (entry) { entry = entry || {}; var entryRoles = (Array.isArray(entry.role) ? entry.role : [entry.role]).filter(function (role, index, all) { return variableRoles.indexOf(role) >= 0 && all.indexOf(role) === index; }); var measures = Array.isArray(entry.measures) ? entry.measures.slice(0, 30).map(function (value) { return String(value || '').slice(0, 20000); }) : [String(entry.measure || '').slice(0, 20000)]; if (!measures.length) measures = ['']; var papers = Array.isArray(entry.papers) ? entry.papers.slice(0, 30).map(function (value) { return String(value || '').trim().slice(0, 500); }) : [String(entry.paper || '').trim().slice(0, 500)]; if (!papers.length) papers = ['']; return { role: entryRoles.length ? entryRoles : ['其他'], source: String(entry.source || '').slice(0, 20000), measure: measures[0], measures: measures, paper: papers[0], papers: papers }; });
            if (sourceVariable.measureReferences.length) { sourceVariable.role = sourceVariable.measureReferences[0].role; sourceVariable.source = sourceVariable.measureReferences[0].source; sourceVariable.measure = sourceVariable.measureReferences[0].measure; sourceVariable.paper = sourceVariable.measureReferences[0].paper; }
            sourceVariable.source = String(currentVariable.source || '').slice(0, 20000);
            sourceVariable.notes = String(currentVariable.notes || '').slice(0, 20000);
            sourceVariable.updated = nowText();
          }
          var clonedVariable = JSON.parse(JSON.stringify(sourceVariable));
          clonedVariable.id = nowId();
          clonedVariable.name = String(sourceVariable.name || '未命名变量') + '（副本）';
          clonedVariable.updated = nowText();
          variableLibrary.items.unshift(clonedVariable);
          duplicateId = clonedVariable.id;
        }
        if (body.action === 'save') variableLibrary.items.forEach(function (item) {
          if (String(item.id) !== String(body.id)) return;
          item.name = String(body.name || '未命名变量').trim().slice(0, 200);
          var saveRoles = (Array.isArray(body.role) ? body.role : [body.role]).filter(function (role, index, all) { return variableRoles.indexOf(role) >= 0 && all.indexOf(role) === index; });
          item.role = saveRoles.length ? saveRoles : ['其他'];
          if (Object.prototype.hasOwnProperty.call(body, 'symbol')) item.symbol = String(body.symbol || '').trim().slice(0, 80);
          if (Object.prototype.hasOwnProperty.call(body, 'unit')) item.unit = String(body.unit || '').trim().slice(0, 200);
          item.paper = String(body.paper || '').trim().slice(0, 500);
          item.definition = String(body.definition || '').slice(0, 20000);
          item.measure = String(body.measure || '').slice(0, 20000);
          if (Array.isArray(body.measureReferences)) item.measureReferences = body.measureReferences.slice(0, 100).map(function (entry) { entry = entry || {}; var entryRoles = (Array.isArray(entry.role) ? entry.role : [entry.role]).filter(function (role, index, all) { return variableRoles.indexOf(role) >= 0 && all.indexOf(role) === index; }); var measures = Array.isArray(entry.measures) ? entry.measures.slice(0, 30).map(function (value) { return String(value || '').slice(0, 20000); }) : [String(entry.measure || '').slice(0, 20000)]; if (!measures.length) measures = ['']; var papers = Array.isArray(entry.papers) ? entry.papers.slice(0, 30).map(function (value) { return String(value || '').trim().slice(0, 500); }) : [String(entry.paper || '').trim().slice(0, 500)]; if (!papers.length) papers = ['']; return { role: entryRoles.length ? entryRoles : ['其他'], source: String(entry.source || '').slice(0, 20000), measure: measures[0], measures: measures, paper: papers[0], papers: papers }; });
          if (item.measureReferences.length) { item.role = item.measureReferences[0].role; item.source = item.measureReferences[0].source; item.measure = item.measureReferences[0].measure; item.paper = item.measureReferences[0].paper; }
          item.source = String(body.source || '').slice(0, 20000);
          item.notes = String(body.notes || '').slice(0, 20000);
          item.updated = nowText();
        });
        if (body.action === 'trash') {
          var removedVariable = variableLibrary.items.filter(function (item) { return String(item.id) === String(body.id); })[0];
          if (removedVariable) { variableLibrary.trash.unshift({ id: nowId(), item: removedVariable, deletedAt: nowText() }); variableLibrary.items = variableLibrary.items.filter(function (item) { return String(item.id) !== String(body.id); }); }
        }
        if (body.action === 'restore') {
          var restoredVariable = variableLibrary.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0];
          if (restoredVariable && restoredVariable.item) { variableLibrary.items.unshift(restoredVariable.item); variableLibrary.trash = variableLibrary.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); }
        }
        if (body.action === 'purge') variableLibrary.trash = variableLibrary.trash.filter(function (entry) { return String(entry.id) !== String(body.id); });
        if (body.action === 'purge-all') variableLibrary.trash = [];
        await saveWorkspace(data, dataRevision);
        return response({ ok: true, variableLibrary: variableLibrary, duplicateId: duplicateId, importedIds: importedIds, undone: undoneCounts || null });
      }
      if (path === '/api/references' && method === 'POST' && (body.action === 'merge-duplicates' || body.action === 'unmerge' || body.action === 'batch-enrich')) {
        var mergeLibrary = data.referenceLibrary || (data.referenceLibrary = { items: [], trash: [] });
        mergeLibrary.items = Array.isArray(mergeLibrary.items) ? mergeLibrary.items : [];
        mergeLibrary.trash = Array.isArray(mergeLibrary.trash) ? mergeLibrary.trash : [];
        if (body.action === 'unmerge') {
          var unmergeItem = mergeLibrary.items.find(function (item) { return String(item.id) === String(body.id); });
          if (!unmergeItem || !unmergeItem.mergedInto) return response({ ok: false, error: '找不到已合并的文献' }, 404);
          delete unmergeItem.mergedInto; delete unmergeItem.mergedAt; unmergeItem.updated = nowText();
          await saveWorkspace(data, dataRevision);
          return response({ ok: true, referenceLibrary: mergeLibrary });
        }
        if (body.action === 'batch-enrich') {
          var enrichmentEntries = Array.isArray(body.entries) ? body.entries.slice(0, 20) : [];
          var enrichmentFields = ['title', 'authors', 'year', 'source', 'locator', 'url', 'abstract', 'keywords', 'abstractSource', 'keywordsSource'];
          var enrichmentUpdated = 0, enrichmentFilled = 0;
          enrichmentEntries.forEach(function (entry) {
            if (!entry || entry.id == null || !entry.fields || typeof entry.fields !== 'object' || Array.isArray(entry.fields)) return;
            var reference = mergeLibrary.items.find(function (item) { return String(item.id) === String(entry.id); });
            if (!reference || reference.mergedInto) return;
            var itemUpdated = false;
            enrichmentFields.forEach(function (field) {
              if (!Object.prototype.hasOwnProperty.call(entry.fields, field)) return;
              var currentValue = String(reference[field] || '').trim();
              if (currentValue && !(field === 'title' && currentValue === '未命名文献')) return;
              var suggestedValue = String(entry.fields[field] || '').trim();
              if (!suggestedValue) return;
              if (field === 'year') suggestedValue = suggestedValue.replace(/[^0-9]/g, '').slice(0, 4);
              else suggestedValue = suggestedValue.slice(0, field === 'abstract' ? 20000 : field === 'keywords' ? 5000 : field === 'title' || field === 'authors' ? 2000 : field === 'url' ? 2048 : field.indexOf('Source') >= 0 ? 120 : 1000);
              if (!suggestedValue) return;
              reference[field] = suggestedValue; itemUpdated = true; enrichmentFilled += 1;
            });
            if (itemUpdated) { reference.updated = nowText(); enrichmentUpdated += 1; }
          });
          if (!enrichmentUpdated) return response({ ok: false, error: '没有可安全补全的空白字段；已有信息未被覆盖' }, 409);
          await saveWorkspace(data, dataRevision);
          return response({ ok: true, referenceLibrary: mergeLibrary, updatedCount: enrichmentUpdated, filledFieldCount: enrichmentFilled });
        }
        var primaryRef = mergeLibrary.items.find(function (item) { return String(item.id) === String(body.primaryId); });
        var mergeIds = Array.isArray(body.duplicateIds) ? Array.from(new Set(body.duplicateIds.map(String))).filter(function (id) { return id && id !== String(body.primaryId); }).slice(0, 50) : [];
        var duplicateRefs = mergeLibrary.items.filter(function (item) { return mergeIds.indexOf(String(item.id)) >= 0; });
        if (!primaryRef || primaryRef.mergedInto) return response({ ok: false, error: '主条目不存在或已是合并别名' }, 409);
        if (!mergeIds.length || duplicateRefs.length !== mergeIds.length || duplicateRefs.some(function (item) { return item.mergedInto; })) return response({ ok: false, error: '重复项已变化，请重新检查后再合并' }, 409);
        var mergeFields = ['title', 'authors', 'year', 'type', 'source', 'locator', 'doi', 'url', 'projectId', 'knowledgeDocId'];
        function meaningfulReferenceValue(key, value) { var text = String(value || '').trim(); return !!text && !(key === 'title' && text === '未命名文献'); }
        function mergeReferenceTags(values) {
          var result = [], seen = Object.create(null);
          values.join('；').split(/[；;,，]+/).forEach(function (tag) { var clean = tag.trim(); var key = clean.toLocaleLowerCase(); if (clean && !seen[key]) { seen[key] = true; result.push(clean); } });
          return result.join('；');
        }
        duplicateRefs.forEach(function (duplicate) {
          mergeFields.forEach(function (key) { if (!meaningfulReferenceValue(key, primaryRef[key]) && meaningfulReferenceValue(key, duplicate[key])) primaryRef[key] = duplicate[key]; });
          primaryRef.tags = mergeReferenceTags([primaryRef.tags || '', duplicate.tags || '']);
          var primaryNotes = String(primaryRef.notes || '').trim(), duplicateNotes = String(duplicate.notes || '').trim();
          if (duplicateNotes && duplicateNotes !== primaryNotes && primaryNotes.indexOf(duplicateNotes) < 0) primaryRef.notes = (primaryNotes ? primaryNotes + '\n\n' : '') + '—— 合并自：' + String(duplicate.title || '未命名文献') + ' ——\n' + duplicateNotes;
          duplicate.mergedInto = String(primaryRef.id); duplicate.mergedAt = nowText(); duplicate.updated = nowText();
        });
        primaryRef.updated = nowText();
        await saveWorkspace(data, dataRevision);
        return response({ ok: true, referenceLibrary: mergeLibrary, mergedCount: duplicateRefs.length });
      }
      if (path === '/api/research-projects' && method === 'POST' && body.action === 'save' && Array.isArray(body.links)) {
        var linkTypes = ['paper', 'reference', 'variable', 'knowledge', 'note'];
        var validLinks = body.links.slice(0, 100).filter(function (link) {
          return link && linkTypes.indexOf(link.type) >= 0 && typeof link.id === 'string' && link.id.length > 0 && link.id.length <= 128;
        }).map(function (link) { return { type: link.type, id: link.id }; });
        var linkedProject = ((data.researchProjects || {}).projects || []).find(function (project) { return String(project.id) === String(body.id); });
        if (linkedProject) linkedProject.links = validLinks.filter(function (link, index) {
          return validLinks.findIndex(function (other) { return other.type === link.type && other.id === link.id; }) === index;
        });
      }
      if (path === '/api/research-projects') { var projects = data.researchProjects || (data.researchProjects = { projects: [], trash: [] }); projects.projects = Array.isArray(projects.projects) ? projects.projects : []; projects.trash = Array.isArray(projects.trash) ? projects.trash : []; if (method === 'GET') return response({ ok: true, researchProjects: projects }); if (body.action === 'create') projects.projects.unshift({ id: nowId(), title: '未命名项目', category: '通用', status: '规划中', goal: '', start: '', end: '', progress: 0, members: '', milestones: '', resources: '', links: [], updated: nowText() }); if (body.action === 'save') projects.projects.forEach(function (project) { if (String(project.id) === String(body.id)) { project.title = String(body.title || '未命名项目').trim(); project.category = String(body.category || '通用').trim() || '通用'; project.status = ['规划中', '进行中', '已完成', '暂停'].indexOf(body.status) >= 0 ? body.status : '规划中'; project.goal = String(body.goal || ''); project.start = String(body.start || ''); project.end = String(body.end || ''); project.progress = Math.max(0, Math.min(100, Number(body.progress) || 0)); project.members = String(body.members || ''); project.milestones = String(body.milestones || ''); project.resources = String(body.resources || ''); project.updated = nowText(); } }); if (body.action === 'trash') { var removedProject = projects.projects.filter(function (project) { return String(project.id) === String(body.id); })[0]; if (removedProject) { projects.trash.unshift({ id: nowId(), item: removedProject, deletedAt: nowText() }); projects.projects = projects.projects.filter(function (project) { return String(project.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredProject = projects.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredProject && restoredProject.item) { projects.projects.unshift(restoredProject.item); projects.trash = projects.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') projects.trash = projects.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') projects.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, researchProjects: projects }); }
      if (path === '/api/data-code-library') { var dataCode = data.dataCodeLibrary || (data.dataCodeLibrary = { items: [], trash: [] }); dataCode.items = Array.isArray(dataCode.items) ? dataCode.items : []; dataCode.trash = Array.isArray(dataCode.trash) ? dataCode.trash : []; if (method === 'GET') return response({ ok: true, dataCodeLibrary: dataCode }); if (body.action === 'create') dataCode.items.unshift({ id: nowId(), title: '未命名数据资源', category: '通用', kind: '数据集', projectId: '', paperTitle: '', source: '', coverage: '', version: 'v1.0', environment: '', location: '', description: '', variables: '', runOrder: '', checks: {}, updated: nowText() }); if (body.action === 'save') dataCode.items.forEach(function (item) { if (String(item.id) === String(body.id)) { item.title = String(body.title || '未命名数据资源').trim(); item.category = String(body.category || '通用').trim() || '通用'; item.kind = ['数据集', '分析代码', '复现包'].indexOf(body.kind) >= 0 ? body.kind : '数据集'; item.projectId = String(body.projectId || ''); item.paperTitle = String(body.paperTitle || ''); item.source = String(body.source || ''); item.coverage = String(body.coverage || ''); item.version = String(body.version || ''); item.environment = String(body.environment || ''); item.location = String(body.location || ''); item.description = String(body.description || ''); item.variables = String(body.variables || ''); item.runOrder = String(body.runOrder || ''); item.checks = body.checks && typeof body.checks === 'object' ? body.checks : {}; item.updated = nowText(); } }); if (body.action === 'trash') { var removedDataCode = dataCode.items.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (removedDataCode) { dataCode.trash.unshift({ id: nowId(), item: removedDataCode, deletedAt: nowText() }); dataCode.items = dataCode.items.filter(function (item) { return String(item.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredDataCode = dataCode.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredDataCode && restoredDataCode.item) { dataCode.items.unshift(restoredDataCode.item); dataCode.trash = dataCode.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') dataCode.trash = dataCode.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') dataCode.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, dataCodeLibrary: dataCode }); }
      if (path === '/api/references') { var references = data.referenceLibrary || (data.referenceLibrary = { items: [], trash: [] }); references.items = Array.isArray(references.items) ? references.items : []; references.trash = Array.isArray(references.trash) ? references.trash : []; if (method === 'GET') return response({ ok: true, referenceLibrary: references }); if (body.action === 'create') references.items.unshift({ id: nowId(), title: '未命名文献', authors: '', year: '', type: '期刊论文', source: '', locator: '', doi: '', url: '', abstract: '', abstractSource: '', keywords: '', keywordsSource: '', tags: '', projectId: '', knowledgeDocId: '', notes: '', updated: nowText() }); if (body.action === 'save') references.items.forEach(function (item) { if (String(item.id) === String(body.id)) { item.title = String(body.title || '未命名文献').trim(); item.authors = String(body.authors || '').trim(); item.year = String(body.year || '').replace(/[^0-9]/g, '').slice(0, 4); item.type = ['期刊论文', '书籍', '会议论文', '报告', '网页'].indexOf(body.type) >= 0 ? body.type : '期刊论文'; item.source = String(body.source || '').trim(); item.locator = String(body.locator || '').trim(); item.doi = String(body.doi || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ''); item.url = String(body.url || '').trim(); item.abstract = String(body.abstract || '').slice(0, 20000); item.abstractSource = String(body.abstractSource || '').slice(0, 120); item.keywords = String(body.keywords || '').slice(0, 5000); item.keywordsSource = String(body.keywordsSource || '').slice(0, 120); item.tags = String(body.tags || '').trim(); item.projectId = String(body.projectId || ''); item.knowledgeDocId = String(body.knowledgeDocId || ''); item.notes = String(body.notes || ''); item.updated = nowText(); } }); if (body.action === 'trash') { var removedReference = references.items.filter(function (item) { return String(item.id) === String(body.id); })[0]; if (removedReference) { references.trash.unshift({ id: nowId(), item: removedReference, deletedAt: nowText() }); references.items = references.items.filter(function (item) { return String(item.id) !== String(body.id); }); } } if (body.action === 'restore') { var restoredReference = references.trash.filter(function (entry) { return String(entry.id) === String(body.id); })[0]; if (restoredReference && restoredReference.item) { references.items.unshift(restoredReference.item); references.trash = references.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); } } if (body.action === 'purge') references.trash = references.trash.filter(function (entry) { return String(entry.id) !== String(body.id); }); if (body.action === 'purge-all') references.trash = []; await saveWorkspace(data, dataRevision); return response({ ok: true, referenceLibrary: references }); }
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
        var recordDrafts = data.academicRecordDrafts || (data.academicRecordDrafts = {});
        if (body.action === 'save-draft' && ['funding', 'awards', 'conferences'].indexOf(body.kind) >= 0) recordDrafts[body.kind] = body.draft && typeof body.draft === 'object' ? body.draft : {};
        if (body.action === 'clear-draft' && ['funding', 'awards', 'conferences'].indexOf(body.kind) >= 0) delete recordDrafts[body.kind];
        if (body.action === 'add' && ['funding', 'awards', 'conferences'].indexOf(body.kind) >= 0 && String(body.title || '').trim()) { records[body.kind].unshift({ id: nowId(), title: String(body.title).trim(), meta: String(body.meta || '').trim(), details: body.details && typeof body.details === 'object' ? body.details : {}, date: dateText() }); delete recordDrafts[body.kind]; }
        if (body.action === 'delete') ['funding', 'awards', 'conferences'].forEach(function (kind) { records[kind] = records[kind].filter(function (item) { return item.id !== body.id; }); });
        await saveWorkspace(data, dataRevision); return response({ ok: true, records: records, drafts: recordDrafts });
      }
      if (path === '/api/knowledge-base') {
        var kb = data.knowledgeBase || (data.knowledgeBase = { folders: [], docs: [] });
        kb.folders = Array.isArray(kb.folders) ? kb.folders : [];
        kb.docs = Array.isArray(kb.docs) ? kb.docs : [];
        kb.trash = Array.isArray(kb.trash) ? kb.trash : [];
        if (method === 'GET') return response({ ok: true, knowledgeBase: kb });
        if (body.action === 'create-folder' && String(body.title || '').trim()) kb.folders.push({ id: nowId(), title: String(body.title).trim() });
        if (body.action === 'create-doc') kb.docs.unshift({ id: nowId(), title: String(body.title || '未命名文档').trim(), content: String(body.content || '').trim(), format: 'markdown', folderId: body.folderId || '', feishuUrl: '', feishuDocId: '', feishuExportedAt: '', updated: nowText() });
        if (body.action === 'save-doc') kb.docs.forEach(function (doc) { if (doc.id === body.id) { doc.title = String(body.title || '未命名文档').trim(); doc.content = String(body.content || ''); doc.format = 'markdown'; doc.folderId = body.folderId || ''; if (typeof body.feishuUrl === 'string') doc.feishuUrl = body.feishuUrl.trim().slice(0, 2048); if (typeof body.feishuDocId === 'string') doc.feishuDocId = body.feishuDocId.trim().slice(0, 256); if (typeof body.feishuExportedAt === 'string') doc.feishuExportedAt = body.feishuExportedAt.trim().slice(0, 64); doc.updated = nowText(); } });
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
