const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const start = source.indexOf('  function currentKnowledgeLine(editor)');
const end = source.indexOf('  function selectKnowledgeRange(', start);
assert.notEqual(start, -1, 'currentKnowledgeLine exists');
assert.notEqual(end, -1, 'currentKnowledgeLine has an end marker');

function element(parent, text) {
  const node = {
    nodeType: 1,
    parentElement: parent,
    textContent: text,
    contains(candidate) {
      while (candidate) {
        if (candidate === this) return true;
        candidate = candidate.parentElement;
      }
      return false;
    }
  };
  const textNode = { nodeType: 3, parentElement: node, nodeValue: text };
  node.firstText = textNode;
  return node;
}

function makeRange() {
  return {
    startContainer: null,
    endContainer: null,
    endOffset: 0,
    selectNodeContents(node) { this.startContainer = node; },
    setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; },
    toString() {
      if (!this.endContainer || this.endContainer.nodeType !== 3) return '';
      return this.endContainer.nodeValue.slice(0, this.endOffset);
    }
  };
}

function currentLineFromBlocks(secondLineText, caretOffset) {
  const editor = element(null, '');
  const heading = element(editor, '# A heading');
  const secondLine = element(editor, secondLineText);
  const anchor = secondLine.firstText;
  const original = { endContainer: anchor, endOffset: caretOffset, cloneRange() { return this; } };
  const selection = {
    rangeCount: 1,
    isCollapsed: true,
    anchorNode: anchor,
    focusNode: anchor,
    getRangeAt() { return original; }
  };
  const context = {
    Node: { ELEMENT_NODE: 1 },
    window: { getSelection: () => selection },
    document: { createRange: makeRange },
    editorContainsSelection: () => true
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context.currentKnowledgeLine(editor);
}

test('a star typed after a heading is read only from the new paragraph', () => {
  const result = currentLineFromBlocks('*', 1);
  assert.equal(result.text, '*');
  assert.equal(result.range.startContainer.textContent, '*');
});

test('the list marker and trailing space never include the previous heading', () => {
  const result = currentLineFromBlocks('* ', 2);
  assert.equal(result.text, '* ');
  assert.equal(/^[-*]\s+$/.test(result.text), true);
  assert.equal(result.range.startContainer.textContent, '* ');
});
