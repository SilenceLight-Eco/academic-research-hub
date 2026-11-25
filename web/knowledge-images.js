(function () {
  'use strict';
  var uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  var maxBytes = 50 * 1024 * 1024;
  function escape(text) { return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function markup(id, escapedAlt) {
    return '<span class="kb-inline-image" data-kb-image-id="' + id + '" contenteditable="false"><img alt="' + escapedAlt + '" loading="lazy" decoding="async"><button type="button" data-kb-image-retry>正在加载图片…</button></span>';
  }
  function tokenize(text) {
    var images = [], prefix = '@@KB_IMAGE_';
    while (text.includes(prefix)) prefix += '_';
    var protectedText = text.split(/(`[^`]+`)/g).map(function (part, index) {
      if (index % 2) return part;
      return part.replace(/!\[((?:\\.|[^\]\\\n])*)\]\(attachment:([0-9a-f-]{36})\)/gi, function (match, alt, id) {
        if (!uuid.test(id)) return match;
        var token = prefix + images.length + '@@';
        images.push(markup(id.toLowerCase(), alt.replace(/\\([\\[\]])/g, '$1')));
        return token;
      });
    }).join('');
    return { text: protectedText, restore: function (html) { images.forEach(function (image, index) { html = html.split(prefix + index + '@@').join(image); }); return html; } };
  }
  function serialize(node) {
    if (node.hasAttribute('data-kb-image-upload')) return '';
    var id = node.getAttribute('data-kb-image-id');
    if (!id || !uuid.test(id)) return null;
    var image = node.querySelector('img'), alt = image ? image.getAttribute('alt') || '' : '';
    return '![' + alt.replace(/\r?\n/g, ' ').replace(/[\\[\]]/g, '\\$&') + '](attachment:' + id.toLowerCase() + ')';
  }
  async function imageType(blob) {
    if (!blob || !blob.size || blob.size > maxBytes) throw new Error('图片须大于0字节且不超过50 MB');
    var bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    var ascii = function (start, end) { return String.fromCharCode.apply(null, bytes.slice(start, end)); };
    if (bytes.length >= 8 && bytes[0] === 137 && ascii(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (/^GIF8[79]a$/.test(ascii(0, 6))) return 'image/gif';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
    if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32))) return 'image/avif';
    throw new Error('仅支持 PNG、JPEG、GIF、WebP 和 AVIF 图片');
  }
  function create(config) {
    var jobs = new Map(), cache = new Map(), generation = 0, observer = null, downloads = [], downloading = 0;
    var context = function () { return config.context() || {}; };
    function current(job) { var now = context(); return !job.cancelled && job.generation === generation && job.owner === now.owner && job.docId === String(now.id) && job.editor.isConnected; }
    function activeJobs() {
      var now = context();
      jobs.forEach(function (job) { if (job.editor.isConnected && !job.node.isConnected) { job.cancelled = true; job.release(); jobs.delete(job.id); } });
      return Array.from(jobs.values()).filter(function (job) { return job.owner === now.owner && job.docId === String(now.id) && !job.cancelled; });
    }
    function report(text, error) { if (config.report) config.report(text, error); }
    function changed() { config.changed(); }
    function drainDownloads() {
      while (downloading < 3 && downloads.length) {
        var task = downloads.shift(); downloading++;
        (function (item) { Promise.resolve().then(item.work).then(item.resolve, item.reject).finally(function () { downloading--; drainDownloads(); }); })(task);
      }
    }
    function download(work) { return new Promise(function (resolve, reject) { downloads.push({ work: work, resolve: resolve, reject: reject }); drainDownloads(); }); }
    function settled(job) {
      if (!current(job)) { jobs.delete(job.id); return; }
      if (!activeJobs().length && config.idle) config.idle();
    }
    async function run(job) {
      job.failed = false; job.retry.hidden = true; job.label.textContent = '正在上传 ' + job.file.name + '…';
      job.promise = (async function () {
        try {
          var mime = await imageType(job.file);
          if (!current(job)) return;
          var extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' }[mime];
          var name = String(job.file.name || '图片').replace(/\.[^.]*$/, '').slice(0, 180) || '图片';
          var file = new File([job.file], name + '.' + extension, { type: mime });
          var saved = await config.attachments().upload('knowledge', job.docId, file, function (percent) { if (current(job)) job.label.textContent = '正在上传 ' + job.file.name + ' · ' + percent + '%'; });
          if (!current(job)) return;
          if (!saved || !uuid.test(saved.id || '')) throw new Error('图片已上传，但未返回有效的附件编号，请在附件中确认');
          var holder = document.createElement('div'); holder.innerHTML = markup(saved.id, escape(job.file.name));
          var image = holder.firstElementChild;
          job.node.replaceWith(image); jobs.delete(job.id); changed(); hydrate(job.editor);
          report('图片已上传，正在同步文档…');
        } catch (error) {
          if (current(job)) { job.failed = true; job.retry.hidden = false; job.label.textContent = job.file.name + '：' + (error.message || '上传失败'); report('图片上传失败，请重试或移除后继续', true); }
        } finally { settled(job); }
      })();
      return job.promise;
    }
    function selectionRange(editor, fallback) {
      var selection = window.getSelection();
      var range = selection && selection.rangeCount ? selection.getRangeAt(0) : fallback;
      if (!range || !editor.contains(range.commonAncestorContainer)) range = fallback;
      if (!range || !editor.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
      return range.cloneRange();
    }
    function upload(editor, selected, range) {
      var now = context(), files = Array.from(selected || []);
      if (!now.owner || !now.id || !now.active) { report('请先登录并选择知识库文档', true); return false; }
      if (!config.attachments() || !config.attachments().upload) { report('云端图片组件尚未就绪，请稍后重试', true); return false; }
      if (!files.length) return false;
      if (files.length > 10) { report('每次最多插入10张图片，请分批操作', true); return false; }
      if (files.some(function (file) { return !/^(image\/(png|jpeg|gif|webp|avif))$/i.test(file.type) && !/\.(png|jpe?g|gif|webp|avif)$/i.test(file.name); })) { report('请选择 PNG、JPEG、GIF、WebP 或 AVIF 图片', true); return false; }
      range = range || selectionRange(editor); range.collapse(false);
      var batch = files.map(function (file) {
        var node = document.createElement('span'); node.className = 'kb-image-upload'; node.contentEditable = 'false';
        var id = crypto.randomUUID(); node.setAttribute('data-kb-image-upload', id);
        var label = document.createElement('span'), retry = document.createElement('button'), remove = document.createElement('button');
        retry.type = remove.type = 'button'; retry.textContent = '重试'; retry.hidden = true; remove.textContent = '移除';
        node.append(label, retry, remove); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
        var job = { id: id, node: node, label: label, retry: retry, file: file, owner: now.owner, docId: String(now.id), editor: editor, generation: generation };
        job.cancelPromise = new Promise(function (resolve) { job.release = resolve; });
        jobs.set(id, job);
        node.addEventListener('mousedown', function (event) { event.preventDefault(); });
        retry.addEventListener('click', function () { if (job.failed && current(job)) run(job); });
        remove.addEventListener('click', function () { job.cancelled = true; job.release(); jobs.delete(id); node.remove(); changed(); if (!activeJobs().length && config.idle) config.idle(); });
        return job;
      });
      var selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); }
      changed(); batch.forEach(run); return true;
    }
    function loadImage(wrapper) {
      var id = wrapper.getAttribute('data-kb-image-id'), owner = context().owner, epoch = generation;
      var image = wrapper.querySelector('img'), button = wrapper.querySelector('[data-kb-image-retry]');
      if (!image || !button || !uuid.test(id || '')) return;
      button.hidden = false; button.textContent = owner ? '正在加载图片…' : '登录后查看图片';
      if (!owner) return;
      function failed() { if (epoch === generation && owner === context().owner && wrapper.isConnected) { button.hidden = false; button.textContent = '图片加载失败，点击重试'; } }
      if (!cache.has(id)) {
        var entry = { url: null, promise: null }; cache.set(id, entry);
        entry.promise = download(async function () {
          if (epoch !== generation || owner !== context().owner) throw new Error('账号已切换');
          var result = await config.attachments().download(id, { blob: true });
          var mime = await imageType(result.blob);
          if (epoch !== generation || owner !== context().owner) throw new Error('账号已切换');
          entry.url = URL.createObjectURL(new Blob([result.blob], { type: mime }));
          return entry.url;
        }).catch(function (error) { if (cache.get(id) === entry) cache.delete(id); throw error; });
      }
      var pending = cache.get(id);
      pending.promise.then(function (url) {
        if (epoch !== generation || owner !== context().owner || !wrapper.isConnected) return;
        image.onload = function () { button.hidden = true; };
        image.onerror = function () { if (cache.get(id) === pending) { cache.delete(id); URL.revokeObjectURL(url); } failed(); };
        image.src = url;
      }).catch(failed);
    }
    function hydrate(root) {
      root.querySelectorAll('[data-kb-image-id]').forEach(function (wrapper) {
        if (wrapper.dataset.kbImageBound) return;
        wrapper.dataset.kbImageBound = 'true';
        var button = wrapper.querySelector('[data-kb-image-retry]');
        if (button) { button.addEventListener('mousedown', function (event) { event.preventDefault(); }); button.addEventListener('click', function () { loadImage(wrapper); }); }
        if (observer) observer.observe(wrapper); else loadImage(wrapper);
      });
    }
    function bind(editor, toolbar) {
      if (observer) observer.disconnect();
      if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) { observer.unobserve(entry.target); loadImage(entry.target); } }); }, { root: editor, rootMargin: '200px' });
      cache.forEach(function (entry, id) { if (entry.url && !document.querySelector('[data-kb-image-id="' + id + '"]')) { URL.revokeObjectURL(entry.url); cache.delete(id); } });
      activeJobs().forEach(function (job) { if (!job.node.isConnected) { job.editor = editor; editor.appendChild(job.node); } });
      hydrate(editor);
      var remembered = null, picker = document.createElement('input'), button = document.createElement('button');
      picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif'; picker.multiple = true; picker.hidden = true;
      button.type = 'button'; button.textContent = '插入图片'; button.title = '也可直接粘贴截图或拖入图片';
      button.addEventListener('mousedown', function (event) { event.preventDefault(); remembered = selectionRange(editor); });
      button.addEventListener('click', function () { if (!remembered) remembered = selectionRange(editor); picker.click(); });
      picker.addEventListener('change', function () { var files = Array.from(picker.files || []); picker.value = ''; upload(editor, files, selectionRange(editor, remembered)); remembered = null; });
      toolbar.append(button, picker);
      editor.addEventListener('paste', function (event) {
        var data = event.clipboardData, files = data && Array.from(data.files || []);
        if ((!files || !files.length) && data) files = Array.from(data.items || []).filter(function (item) { return item.kind === 'file'; }).map(function (item) { return item.getAsFile(); }).filter(Boolean);
        if (!files || !files.length) return;
        event.preventDefault(); upload(editor, files, selectionRange(editor));
      });
      editor.addEventListener('dragover', function (event) { if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; editor.classList.add('kb-image-dragover'); } });
      editor.addEventListener('dragleave', function (event) { if (!editor.contains(event.relatedTarget)) editor.classList.remove('kb-image-dragover'); });
      editor.addEventListener('drop', function (event) {
        if (!event.dataTransfer || !event.dataTransfer.files.length) return;
        event.preventDefault(); editor.classList.remove('kb-image-dragover');
        var range = document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null;
        upload(editor, event.dataTransfer.files, range && editor.contains(range.commonAncestorContainer) ? range : selectionRange(editor));
      });
    }
    async function wait() {
      var epoch = generation, pending = activeJobs();
      await Promise.all(pending.map(function (job) { return Promise.race([job.promise, job.cancelPromise]); }));
      if (epoch !== generation) throw new Error('账号已切换，已停止图片操作');
      if (activeJobs().some(function (job) { return job.failed; })) throw new Error('图片上传失败，请重试或移除后继续');
      if (activeJobs().length) return wait();
    }
    function reset() {
      generation++; jobs.forEach(function (job) { job.cancelled = true; job.release(); job.node.remove(); }); jobs.clear();
      downloads.splice(0).forEach(function (task) { task.reject(new Error('账号已切换')); });
      if (observer) observer.disconnect(); observer = null;
      cache.forEach(function (entry) { if (entry.url) URL.revokeObjectURL(entry.url); }); cache.clear();
      document.querySelectorAll('[data-kb-image-id] img').forEach(function (image) { image.onload = image.onerror = null; image.removeAttribute('src'); });
    }
    return { bind: bind, hydrate: hydrate, upload: upload, wait: wait, hasPending: function () { return activeJobs().length > 0; }, reset: reset };
  }
  window.__academicKnowledgeImages = { create: create, tokenize: tokenize, serialize: serialize, imageType: imageType };
})();
