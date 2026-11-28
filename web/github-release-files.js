(function () {
  'use strict';
  var MAX_BYTES = 2 * 1024 * 1024 * 1024 - 1;
  var kinds = ['paper', 'supplement', 'data', 'code', 'result'];
  function source(repo, tag) {
    repo = String(repo || '').trim(); tag = String(tag || '').trim();
    if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.split('/')[1] === '.' || repo.split('/')[1] === '..' || repo.length > 180) throw new Error('仓库请填写 用户名/仓库名');
    if (!tag || tag.length > 120 || /[\x00-\x20?#]/.test(tag)) throw new Error('请填写有效的 Release 标签');
    return { repo: repo.toLowerCase(), tag: tag };
  }
  function releaseUrl(repo, tag) { var value = source(repo, tag); return 'https://github.com/' + value.repo + '/releases/tag/' + encodeURIComponent(value.tag); }
  function parseAssetUrl(value) {
    var url;
    try { url = new URL(String(value || '').trim()); } catch (_) { throw new Error('请粘贴完整的 GitHub Release 附件下载链接'); }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new Error('仅支持不含令牌参数的 github.com Release 下载链接');
    var parts;
    try { parts = url.pathname.slice(1).split('/').map(decodeURIComponent); } catch (_) { throw new Error('附件链接编码无效'); }
    if (parts.length < 6 || parts[2] !== 'releases' || parts[3] !== 'download') throw new Error('请使用 Release 附件的下载链接，而不是源码、发布页或网页链接');
    var name = parts.pop(), ref = source(parts[0] + '/' + parts[1], parts.slice(4).join('/'));
    if (!name || name.length > 255 || /[\x00-\x1f/\\]/.test(name)) throw new Error('附件文件名无效');
    return { repo: ref.repo, tag: ref.tag, name: name, url: 'https://github.com/' + ref.repo + '/releases/download/' + encodeURIComponent(ref.tag) + '/' + encodeURIComponent(name) };
  }
  function validateFiles(files) {
    if (!Array.isArray(files) || files.length > 200) throw new Error('每个复现任务最多关联200个 GitHub 附件');
    var ids = new Set(), links = new Set();
    return files.map(function (file) {
      if (!file || typeof file.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(file.id) || ids.has(file.id) || kinds.indexOf(file.kind) < 0) throw new Error('GitHub 附件编号或分类无效');
      ids.add(file.id);
      var ref = parseAssetUrl(file.url), linkKey = file.kind + ':' + ref.url;
      if (links.has(linkKey)) throw new Error('同一分类不能重复关联相同附件');
      links.add(linkKey);
      if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 || /[\x00-\x1f]/.test(file.name)) throw new Error('附件名称无效');
      if (file.size !== null && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_BYTES)) throw new Error('GitHub 附件大小无效，每个文件须小于2 GiB');
      if (file.assetId !== null && (!Number.isSafeInteger(file.assetId) || file.assetId < 1)) throw new Error('GitHub 附件标识无效');
      if (typeof file.addedAt !== 'string' || !Number.isFinite(Date.parse(file.addedAt))) throw new Error('附件关联时间无效');
      return { id: file.id, kind: file.kind, name: file.name, url: ref.url, repo: ref.repo, tag: ref.tag, size: file.size, assetId: file.assetId, addedAt: file.addedAt };
    });
  }
  async function readRelease(repo, tag, fetcher) {
    var ref = source(repo, tag), base = 'https://api.github.com/repos/' + ref.repo;
    fetcher = fetcher || window.__nativeFetch || window.fetch.bind(window);
    async function get(path) {
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetcher(base + path, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          if (response.status === 404) throw new Error('未找到已发布的公开 Release，请先在 GitHub 上传并保存；也可直接粘贴附件链接');
          if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制读取，请稍后重试，或直接粘贴附件下载链接');
          throw new Error('读取 GitHub Release 失败（HTTP ' + response.status + '）');
        }
        return await response.json();
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('读取 GitHub 超时，请重试或直接粘贴附件链接');
        if (error.name === 'TypeError') throw new Error('无法连接 GitHub，请检查网络或直接粘贴附件下载链接');
        throw error;
      } finally { clearTimeout(timer); }
    }
    var release = await get('/releases/tags/' + encodeURIComponent(ref.tag));
    if (!release || release.draft || release.tag_name !== ref.tag || !Number.isSafeInteger(release.id) || release.id < 1) throw new Error('Release 尚未公开发布或标签不匹配');
    var result = [], seen = new Set(), truncated = false;
    for (var page = 1; page <= 5; page++) {
      var assets = await get('/releases/' + release.id + '/assets?per_page=100&page=' + page);
      if (!Array.isArray(assets)) throw new Error('GitHub 返回的附件列表格式无效');
      assets.forEach(function (asset) {
        if (!asset || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.id) || asset.id < 1 || seen.has(asset.id)) return;
        var parsed = parseAssetUrl(asset.browser_download_url);
        if (parsed.repo !== ref.repo || parsed.tag !== ref.tag || typeof asset.name !== 'string' || asset.name.length > 255 || /[\x00-\x1f]/.test(asset.name) || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > MAX_BYTES) throw new Error('GitHub 附件来源或大小校验失败');
        seen.add(asset.id); result.push({ repo: ref.repo, tag: ref.tag, assetId: asset.id, name: asset.name, size: asset.size, url: parsed.url });
      });
      if (assets.length < 100) break;
      if (page === 5) truncated = true;
    }
    return { assets: result, truncated: truncated };
  }
  window.__academicGitHubReleases = { maxBytes: MAX_BYTES, source: source, releaseUrl: releaseUrl, parseAssetUrl: parseAssetUrl, validateFiles: validateFiles, readRelease: readRelease };
})();
