const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const poker = require('../web/entertainment-poker.js');
const base = require('../web/entertainment-rules.js').landlord;
function rng(seed) { return () => ((seed = Math.imul(seed,1664525)+1013904223 >>> 0)/4294967296); }
function card(rank,suit=0,deck=0) { return (rank >= 16 ? rank === 16 ? 52 : 53 : (rank-3)*4+suit)+54*deck; }
function cards(rank,n) { return Array.from({length:n},(_,i)=>card(rank,i%4,Math.floor(i/4))); }
function game(kind, hands) { const g = poker.create(kind,rng(1)); if (kind === 'laizi') { g.wildRank = 7; base.bid(g,0,3); } if (hands) { g.hands=hands; g.turn=0; } return g; }
function pattern(ids,g,type) { const result = poker.patterns(ids,g).find(c=>!type || c.pattern.type===type); assert.ok(result, `${g.kind} ${type} ${ids}`); return result.pattern; }

test('poker bundle registers beside the original rules and loads before its UI',()=>{
  const globalThis={AcademicGames:{landlord:base}}; vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/entertainment-poker.js'),'utf8'),{globalThis});
  assert.equal(typeof globalThis.AcademicGames.poker.play,'function');
  const html=fs.readFileSync(path.join(__dirname,'../web/workbench.html'),'utf8'); assert.ok(html.indexOf('entertainment-rules.js')<html.indexOf('entertainment-poker.js')); assert.ok(html.indexOf('entertainment-poker.js')<html.indexOf('entertainment.js?'));
});
test('laizi retains 54 unique cards and team games deal 108 distinct IDs equally',()=>{
  const g = poker.create('laizi',rng(1)); assert.equal(g.phase,'bid'); assert.ok(g.wildRank>=3&&g.wildRank<=15); assert.equal(new Set(g.hands.flat().concat(g.reserve)).size,54);
  for (const kind of ['guandan','fivetenk']) { const g=game(kind); assert.deepEqual(g.hands.map(h=>h.length),[27,27,27,27]); assert.equal(new Set(g.hands.flat()).size,108); }
  assert.equal(poker.label(card(3,0,1)),'♠3'); assert.equal(poker.rank(106),16);
});
test('laizi singles retain printed rank; combinations can substitute but cannot forge jokers',()=>{
  const g=game('laizi'), wild=card(7);
  assert.equal(pattern([wild],g).main,7); const pair=pattern([card(3),wild],g,'pair'); assert.equal(pair.main,3); assert.equal(pair.assigned[0].rank,3);
  assert.equal(poker.patterns([52,wild],g).length,0); assert.equal(poker.patterns([wild,wild],g).length,0); assert.equal(poker.patterns([108],g).length,0);
});
test('laizi compares soft, hard, pure-wild bombs and rocket in the announced order',()=>{
  const g=game('laizi'), soft=pattern(cards(15,3).concat(card(7)),g,'bomb'), hard=pattern(cards(3,4),g,'bomb'), pure=pattern(cards(7,4),g,'bomb'), rocket=pattern([52,53],g,'rocket');
  assert.equal(soft.tier,1); assert.equal(hard.tier,2); assert.equal(pure.tier,3);
  assert.ok(poker.beats(hard,soft)); assert.ok(poker.beats(pure,hard)); assert.ok(poker.beats(rocket,pure)); assert.equal(poker.beats(soft,hard),false);
});
test('laizi fills multiple distinct sequence gaps and supports airplane wings and four-with-two',()=>{
  const g=game('laizi'); g.wildRank=10;
  const run=[card(3),card(4),card(6),card(8),card(10),card(10,1)]; const p=pattern(run,g,'straight'); assert.equal(p.count,6); assert.deepEqual(p.assigned.map(a=>a.rank).sort((a,b)=>a-b),[5,7]);
  pattern(cards(3,3).concat(cards(4,2),card(10),card(8),card(9)),g,'airplane-single');
  pattern(cards(3,3).concat(cards(4,3),card(8),card(9),cards(10,2)),g,'airplane-pair');
  pattern(cards(3,4).concat(cards(4,2)),g,'four-single'); pattern(cards(3,4).concat(cards(4,2),cards(5,2)),g,'four-pair');
});
test('ambiguous laizi cards allow choosing a normal combination or bomb and reject a forged interpretation',()=>{
  const ids=cards(9,3).concat(card(7)), g=game('laizi',[ids.concat(card(3)),[card(4)],[card(5)]]), options=poker.patterns(ids,g);
  assert.ok(options.some(c=>c.pattern.type==='triple-single')); const bomb=options.find(c=>c.pattern.type==='bomb'); assert.ok(bomb);
  const before=JSON.stringify(g); assert.equal(poker.play(g,0,ids,'fake'),false); assert.equal(JSON.stringify(g),before);
  assert.equal(poker.play(g,0,ids,bomb.pattern.key),true); assert.equal(g.last.type,'bomb'); assert.equal(g.hands[0].length,1);
});
test('guandan level cards outrank A but not jokers; only red-heart level cards are wild',()=>{
  const g=game('guandan'); g.level=5;
  assert.ok(poker.wild(g,card(5,1))); assert.ok(poker.wild(g,card(5,1,1))); assert.equal(poker.wild(g,card(5,0)),false);
  assert.ok(poker.beats(pattern(cards(5,2),g,'pair'),pattern(cards(14,2),g,'pair')));
  assert.ok(poker.beats(pattern([52,106],g,'pair'),pattern(cards(5,2),g,'pair')));
  assert.equal(poker.patterns([52,card(5,1)],g).length,0);
});
test('guandan supports fixed runs, A-low sequences, steel plates, and distinct double-deck pairs',()=>{
  const g=game('guandan'); pattern([card(14),card(15),card(3),card(4),card(5)],g,'straight');
  pattern(cards(14,2).concat(cards(15,2),cards(3,2)),g,'pair-run'); pattern(cards(14,3).concat(cards(15,3)),g,'airplane');
  pattern([card(3),card(3,0,1)],g,'pair');
  assert.equal(poker.patterns([3,4,5,6,7,8].map(r=>card(r)),g).length,0);
  assert.equal(poker.patterns(cards(3,3).concat(card(4)),g).length,0);
});
test('guandan flush beats five-card bombs but loses to six, and four jokers beat every bomb',()=>{
  const g=game('guandan'), flush=pattern([3,4,5,6,7].map(r=>card(r)),g,'flush'), five=pattern(cards(14,5),g,'bomb'), six=pattern(cards(3,6),g,'bomb'), kings=pattern([52,53,106,107],g,'rocket');
  assert.ok(poker.beats(flush,five)); assert.ok(poker.beats(six,flush)); assert.ok(poker.beats(kings,six)); assert.equal(poker.beats(five,flush),false);
  const wildFlushes=poker.patterns([3,4,5,6].map(r=>card(r)).concat(card(15,1)),g).filter(c=>c.pattern.type==='flush'); assert.ok(wildFlushes.some(c=>c.pattern.assigned[0].rank===7));
});
test('guandan can form a ten-card bomb from eight real cards and two heart wildcards',()=>{
  const g=game('guandan'), bomb=pattern(cards(3,8).concat(card(15,1),card(15,1,1)),g,'bomb'); assert.equal(bomb.count,10);
});
test('5-10-K distinguishes mixed and suited bombs, suit order, normal bombs and four kings',()=>{
  const g=game('fivetenk'), mixed=pattern([card(5),card(10,1),card(13,2)],g,'510k'), heart=pattern([5,10,13].map(r=>card(r,1)),g,'510k'), spade=pattern([5,10,13].map(r=>card(r)),g,'510k'), bomb=pattern(cards(3,4),g,'bomb'), king=pattern([52,53,106,107],g,'rocket');
  assert.ok(poker.beats(heart,mixed)); assert.ok(poker.beats(spade,heart)); assert.ok(poker.beats(bomb,spade)); assert.ok(poker.beats(king,bomb)); assert.equal(poker.beats(mixed,mixed),false);
  assert.equal(poker.points(Array.from({length:108},(_,i)=>i)),200);
});
test('team players must follow with a larger legal pattern and may not pass on a free lead',()=>{
  const g=game('fivetenk',[[card(3),card(4)],[card(5)],[card(6)],[card(7)]]), before=JSON.stringify(g);
  assert.equal(poker.play(g,0,[]),false); assert.equal(poker.play(g,1,[card(5)]),false); assert.equal(poker.play(g,0,[card(3),card(3)]),false); assert.equal(JSON.stringify(g),before);
  assert.equal(poker.play(g,0,[card(4)]),true); assert.equal(poker.play(g,1,[card(3)]),false);
});
test('finished players are skipped and their partner borrows the next free lead',()=>{
  const g=game('guandan',[[card(3)],[card(4)],[card(5)],[card(6)]]);
  assert.ok(poker.play(g,0,[card(3)])); assert.equal(g.finish[0],0);
  assert.ok(poker.play(g,1,[])); assert.ok(poker.play(g,2,[])); assert.ok(poker.play(g,3,[])); assert.equal(g.turn,2); assert.equal(g.last,null);
});
test('5-10-K captures the table once, then transfers the last hand to the first finisher team',()=>{
  const g=game('fivetenk',[[card(5)],[card(10)],[card(13)],[card(3)]]);
  poker.play(g,0,[card(5)]); poker.play(g,1,[]); poker.play(g,2,[]); poker.play(g,3,[]);
  assert.deepEqual(g.scores,[5,0]); assert.equal(g.pot,0); assert.equal(g.turn,2);
  poker.play(g,2,[card(13)]); poker.play(g,3,[]); poker.play(g,1,[]); assert.equal(g.turn,3);
  poker.play(g,3,[card(3)]); assert.equal(g.phase,'over'); assert.deepEqual(g.finish,[0,2,3,1]); assert.deepEqual(g.scores,[25,0]); assert.equal(g.winner,0);
});
test('full seeded games finish legally, conserve physical cards, preserve partners and total 200 points',()=>{
  for (const kind of ['laizi','guandan','fivetenk']) for (let seed=1;seed<=12;seed++) {
    const g=poker.create(kind,rng(seed)); if(kind==='laizi') base.bid(g,0,3);
    let steps=0,played=[];
    while(g.phase==='play' && steps++<1200) {
      const seat=g.turn, choice=poker.ai(g,seat); assert.equal(poker.play(g,seat,choice.cards,choice.key),true,`${kind} ${seed} ${steps}`); played=played.concat(choice.cards);
      const all=g.hands.flat().concat(played); assert.equal(all.length,kind==='laizi'?54:108); assert.equal(new Set(all).size,all.length);
    }
    assert.equal(g.phase,'over',`${kind} ${seed} stalled`);
    if(kind==='fivetenk') assert.equal(g.scores[0]+g.scores[1],200);
    if(kind==='guandan') assert.equal(g.winner,g.finish[0]%2);
  }
});

test('every generated laizi interpretation independently resolves to a valid classic pattern',()=>{
  for (let seed=1;seed<=20;seed++) {
    const g=game('laizi'); g.hands=poker.create('laizi',rng(seed)).hands;
    for (const hand of g.hands) for (const choice of poker.candidates(hand,g)) {
      const assigned=new Map(choice.pattern.assigned.map(a=>[a.id,a.rank])), counts=new Map(), virtual=[];
      for (const id of choice.cards) { const r=assigned.has(id)?assigned.get(id):poker.rank(id); const n=counts.get(r)||0; counts.set(r,n+1); virtual.push(r>=16?r===16?52:53:card(r,n)); }
      assert.ok([...counts.entries()].every(([r,n])=>n<=(r>=16?1:4)));
      const p=base.pattern(virtual); assert.ok(p); assert.equal(p.type,choice.pattern.type); assert.equal(p.main,choice.pattern.rank);
    }
  }
});
