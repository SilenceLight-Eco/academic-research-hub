importScripts('vendor/diff-9.0.0.min.js', 'revision-compare-core.js');
self.onmessage = function (event) {
  try { self.postMessage({ ok: true, result: RevisionCompareCore.compare(event.data.before, event.data.after) }); }
  catch (error) { self.postMessage({ ok: false, error: error.message || '版本对比失败，请重试' }); }
};
