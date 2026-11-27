/* Testes do app. Rodar na raiz do repositório:  node testes/rodar.js
   Cada teste cria um ambiente novo (testes/ambiente.js), com o localStorage vazio. */
"use strict";
var assert = require("assert");
var criar = require("./ambiente.js").criar;

var testes = [];
function teste(nome, f) { testes.push({ nome: nome, f: f }); }

// Notas do acorde na ordem da inversão, a partir do Dó central.
function notasDe(app, it) {
  var v = app.cVoice(it), p0 = 60 + v[0].pc, p1 = p0 + (v[1].pc - v[0].pc + 12) % 12;
  return [p0, p1, p1 + (v[2].pc - v[1].pc + 12) % 12];
}
// Guarda a volta pendente, como cFinish faz ao terminar uma série.
function fecharSerie(app) { if (app.C.round) app.cstats.rounds[app.C.round.k] = app.C.round.st; }
function contar(lista) { var m = {}; lista.forEach(function (k) { m[k] = (m[k] || 0) + 1; }); return m; }
function valores(m) { return Object.keys(m).map(function (k) { return m[k]; }); }

/* ---------- carregamento ---------- */
teste("o app carrega os 9 arquivos e inicia", function () {
  var app = criar().app;
  assert.strictEqual(app.settings.tab, "treino");
  assert.strictEqual(app.C.items.length, 12);
  assert.ok(app.drill.notes.length >= 4, "a pauta do treino tem notas");
  assert.ok(app.F.on.length > 0, "a folha tem ataques");
  assert.strictEqual(app.lpOcupado(), false);
});

/* ---------- teclado MIDI ---------- */
teste("nota MIDI ↔ nota da pauta", function () {
  var app = criar().app;
  assert.strictEqual(app.dToMidi(28), 60, "Dó central");
  for (var d = 0; d < 70; d++) assert.strictEqual(app.midiToD(app.dToMidi(d)), d);
  [61, 63, 66, 68, 70].forEach(function (k) { assert.strictEqual(app.midiToD(k), null, "tecla preta " + k); });
});

/* ---------- acordes: séries ---------- */
teste("séries de acordes nunca repetem o mesmo acorde seguido", function () {
  var app = criar().app, c = app.settings.c;
  [["bbb"], ["bbb", "bpb"], ["bbb", "bpb", "pbp", "unicos"]].forEach(function (groups) {
    [false, true].forEach(function (inv) {
      ["peso", "todas", "dificeis"].forEach(function (draw) {
        Object.assign(c, { groups: groups, inv: inv, seq: "sorteada", draw: draw, count: 48 });
        // Sem saídas suficientes, "Trocas difíceis" vira o sorteio pelo desempenho, que aceita a mesma fundamental em outra inversão.
        var porTroca = draw === "todas" || (draw === "dificeis" && app.cHardOk());
        for (var rep = 0; rep < 3; rep++) {
          var out = app.cGen(); fecharSerie(app);
          for (var i = 1; i < out.length; i++) {
            assert.ok(!(out[i].pc === out[i - 1].pc && out[i].inv === out[i - 1].inv), "repetido em " + draw);
            if (porTroca) assert.notStrictEqual(out[i].pc, out[i - 1].pc, "mesma fundamental em " + draw + " " + groups.join("+"));
          }
        }
      });
    });
  });
});

teste("Todas as trocas: cada troca uma vez por volta, séries emendadas", function () {
  var app = criar().app;
  Object.assign(app.settings.c, { groups: ["bbb", "bpb", "pbp", "unicos"], inv: false, seq: "sorteada", draw: "todas", count: 24 });
  var trocas = [], ultimo = null;
  for (var s = 0; s < 12; s++) {
    var out = app.cGen(); fecharSerie(app);
    if (ultimo) assert.strictEqual(app.cKey(out[0]), ultimo, "a série começa no último acorde da anterior");
    for (var i = 1; i < out.length; i++) trocas.push(app.cKey(out[i - 1]) + ">" + app.cKey(out[i]));
    ultimo = app.cKey(out[out.length - 1]);
  }
  [0, 1].forEach(function (volta) {
    var v = trocas.slice(volta * 132, volta * 132 + 132), m = contar(v);
    assert.strictEqual(Object.keys(m).length, 132, "volta " + (volta + 1) + ": 132 trocas diferentes");
    var chegadas = contar(v.map(function (t) { return t.split(">")[1]; }));
    valores(chegadas).forEach(function (n) { assert.strictEqual(n, 11, "cada acorde 11 vezes"); });
  });
});

teste("Trocas difíceis: acordes por igual e só trocas difíceis", function () {
  var app = criar().app;
  [[["bbb", "bpb", "pbp", "unicos"], false, 12, 40], [["bbb", "bpb", "pbp", "unicos"], true, 36, 20]].forEach(function (cfg) {
    Object.assign(app.settings.c, { groups: cfg[0], inv: cfg[1], seq: "sorteada", draw: "dificeis", count: cfg[2] });
    app.cstats.rounds = {};
    var items = app.cSetItems(), porChave = {}, seq = [];
    items.forEach(function (it) { porChave[app.cKey(it)] = it; });
    for (var s = 0; s < cfg[3]; s++) { seq = seq.concat(app.cGen().map(app.cKey)); fecharSerie(app); }
    var m = valores(contar(seq));
    assert.ok(Math.max.apply(null, m) - Math.min.apply(null, m) <= 2, "contagens parecidas: " + Math.min.apply(null, m) + " a " + Math.max.apply(null, m));
    // Sem histórico, difícil = entre as maiores notas de movimento das saídas de A ou das chegadas a B.
    var take = Math.max(3, Math.ceil((items.length - items.length / app.cRoots().length) / 3)), limSai = {}, limChega = {};
    items.forEach(function (a) {
      var o = items.filter(function (b) { return b.pc !== a.pc; });
      limSai[app.cKey(a)] = o.map(function (b) { return app.cMove(a, b); }).sort(function (x, y) { return y - x; })[take - 1];
      limChega[app.cKey(a)] = o.map(function (b) { return app.cMove(b, a); }).sort(function (x, y) { return y - x; })[take - 1];
    });
    for (var i = 1; i < seq.length; i++) {
      var h = app.cMove(porChave[seq[i - 1]], porChave[seq[i]]);
      assert.ok(h >= limSai[seq[i - 1]] || h >= limChega[seq[i]], "troca fácil: " + seq[i - 1] + ">" + seq[i]);
    }
  });
});

teste("Um com todos: o fixo vai e volta para cada um, e a série seguinte fixa o próximo", function () {
  var app = criar().app;
  Object.assign(app.settings.c, { groups: ["bbb", "bpb", "pbp", "unicos"], inv: false, seq: "ancora", count: 12 });
  app.cNew();
  for (var s = 0; s < 13; s++) {
    var out = app.C.items, A = s % 12, trocas = {};
    assert.strictEqual(out.length, 23, "o tamanho da série não depende de “Série”");
    out.forEach(function (it, i) {
      if (i % 2 === 0) assert.ok(it.pc === A && it.inv === 0, "série " + s + ": o fixo nas posições pares");
      else assert.strictEqual(it.pc, (A + (i + 1) / 2) % 12, "série " + s + ": os outros subindo a partir do fixo");
      if (i) trocas[app.cKey(out[i - 1]) + ">" + app.cKey(it)] = 1;
    });
    assert.strictEqual(Object.keys(trocas).length, 22, "cada troca com o fixo uma vez, nos dois sentidos");
    app.cFinish();
    var txt = app.document.getElementById("c-result").innerHTML, prox = app.cName(app.cItemOfKey((s + 1) % 12 + ":0"));
    if (s === 11) assert.ok(txt.indexOf("Volta completa") >= 0, "o Si fecha a volta");
    else assert.ok(txt.indexOf("Na próxima série, " + prox + " com cada um.") >= 0, "série " + s + ": " + txt);
  }
  assert.strictEqual(app.C.items[0].pc, 1, "depois da volta, recomeça do Dó: a 14ª série fixa o Ré♭");
});

teste("Um com todos com inversões: cada posição é um fixo, sem as outras posições dele", function () {
  var app = criar().app;
  Object.assign(app.settings.c, { groups: ["bbb"], inv: true, seq: "ancora" });
  var fixos = [], esperado = ["0:0", "0:1", "0:2", "5:0", "5:1", "5:2", "7:0", "7:1", "7:2"];
  for (var s = 0; s < 9; s++) {
    var out = app.cGen(); fecharSerie(app);
    assert.strictEqual(out.length, 13, "1 + 2 × 6 acordes");
    fixos.push(app.cKey(out[0]));
    var outros = out.filter(function (it, i) { return i % 2 === 1; }).map(app.cKey);
    assert.ok(outros.every(function (k) { return +k.split(":")[0] !== out[0].pc; }), "sem as outras posições do fixo");
    if (s === 5) assert.deepEqual(outros, ["7:0", "7:1", "7:2", "0:0", "0:1", "0:2"], "do seguinte ao fixo, dando a volta");
  }
  assert.deepEqual(fixos, esperado);
});

teste("Um com todos: “Nova série” pula o fixo; mudar um ajuste ou parar a série, não", function () {
  var env = criar(), app = env.app;
  Object.assign(app.settings.c, { groups: ["bbb", "bpb", "pbp", "unicos"], inv: false, seq: "ancora" });
  app.cNew();
  assert.strictEqual(app.C.items[0].pc, 0);
  env.els["c-new"]._ouvintes.click[0]();
  assert.strictEqual(app.C.items[0].pc, 1, "Nova série: o Ré♭");
  assert.ok(env.armazenado["lcs-chords"].indexOf('"next":"1:0"') >= 0, "o fixo da série à vista fica guardado no aparelho");
  app.cSet("hands", "esquerda");
  assert.strictEqual(app.C.items[0].pc, 1, "mudar a mão não pula o fixo");
  app.C.state = "run"; app.cStop(); app.cNew();
  assert.strictEqual(app.C.items[0].pc, 1, "série interrompida não avança");
  app.settings.c.groups = ["bbb"]; app.cNew();
  assert.strictEqual(app.C.items[0].pc, 0, "outro conjunto de acordes tem a sua própria volta");
  // O ajuste salvo volta no carregamento; um valor desconhecido vira a sorteada.
  var app2 = criar({ armazenado: { "lcs-settings": JSON.stringify({ c: { seq: "ancora" } }) } }).app;
  assert.strictEqual(app2.settings.c.seq, "ancora");
  assert.strictEqual(app2.C.items.length, 5, "Dó, Fá, Dó, Sol, Dó");
  assert.strictEqual(criar({ armazenado: { "lcs-settings": JSON.stringify({ c: { seq: "outra" } }) } }).app.settings.c.seq, "sorteada");
});

teste("Cromática: sobe e desce pelo teclado; com inversões, troca de posição na virada", function () {
  var app = criar().app, c = app.settings.c;
  function semRepetir(out) {
    for (var i = 1; i < out.length; i++) assert.ok(!(out[i].pc === out[i - 1].pc && out[i].inv === out[i - 1].inv), "repetido em " + i);
  }
  Object.assign(c, { groups: ["bbb", "bpb", "pbp", "unicos"], inv: false, seq: "cromatica", count: 24 });
  var out = app.cGen();
  assert.deepEqual(out.map(function (it) { return it.pc; }), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1]);
  assert.ok(out.every(function (it) { return it.inv === 0; }));
  semRepetir(out);
  c.groups = ["bbb"]; c.count = 12;
  assert.deepEqual(app.cGen().map(app.cName), ["Dó", "Fá", "Sol", "Fá", "Dó", "Fá", "Sol", "Fá", "Dó", "Fá", "Sol", "Fá"]);
  Object.assign(c, { groups: ["bbb", "bpb", "pbp", "unicos"], inv: true, count: 48 });
  out = app.cGen();
  assert.strictEqual(out.length, 48);
  semRepetir(out);
  [[0, 0, true], [1, 1, false], [2, 2, true], [3, 0, false]].forEach(function (p) {
    var trecho = out.slice(p[0] * 12, p[0] * 12 + 12);
    assert.ok(trecho.every(function (it) { return it.inv === p[1]; }), "trecho " + p[0] + " na posição " + p[1]);
    assert.deepEqual(trecho.map(function (it) { return it.pc; }), p[2] ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

teste("Inversões: cada acorde sobe e desce pelas posições, do Dó ao Si", function () {
  var env = criar(), app = env.app, c = app.settings.c;
  Object.assign(c, { groups: ["bbb", "bpb", "pbp", "unicos"], inv: false, count: 12 });
  app.cSet("seq", "inversoes");
  var out = app.C.items;
  assert.strictEqual(out.length, 84, "7 por acorde, sem depender de “Série”");
  for (var k = 0; k < 12; k++) {
    var bloco = out.slice(k * 7, k * 7 + 7);
    assert.ok(bloco.every(function (it) { return it.pc === k; }), "bloco " + k);
    assert.deepEqual(bloco.map(function (it) { return it.inv; }), [0, 1, 2, 0, 2, 1, 0]);
  }
  for (var i = 1; i < out.length; i++) assert.ok(!(out[i].pc === out[i - 1].pc && out[i].inv === out[i - 1].inv), "repetido em " + i);
  assert.ok(app.cSub(out[0]).indexOf("posição fundamental") >= 0, "a fundamental aparece como posição");
  assert.strictEqual(env.els["f-ccount"].hidden, true, "o tamanho da série é o dos blocos");
  assert.strictEqual(env.els["f-cinv"].hidden, true, "as posições já vêm da sequência");
  c.inv = true; assert.strictEqual(app.cGen().length, 84, "o ajuste de posição não muda nada");
  app.cSet("seq", "cromatica");
  assert.strictEqual(env.els["f-ccount"].hidden, false);
  assert.strictEqual(env.els["f-cinv"].hidden, false);
});

/* ---------- acordes: metrônomo ---------- */
function serieMetro(env, cfg) {
  var app = env.app, c = app.settings.c;
  app.settings.tab = "acordes"; app.MIDI.state = "on";
  Object.assign(c, { groups: cfg.groups || ["bbb"], inv: !!cfg.inv, seq: "sorteada", draw: "peso", count: cfg.count || 12, pace: "metro", beats: cfg.beats || 4 });
  app.cNew();
  var C = app.C;
  Object.assign(C, { state: "run", mode: "midi", pace: "metro", N: c.beats, beatMs: cfg.beatMs || 1000, startPerf: 10000, idx: 0, slot: -1, fin: 0, open: -1 });
  C.res = C.items.map(function () { return { st: null, err: false, dt: null, off: null, played: null }; });
  app.MIDI.dirty = false; app.MIDI.held = {};
  var held = [];
  return {
    C: C, cT: function (k) { return C.startPerf + k * C.N * C.beatMs; },
    ate: function (t) { env.avancar(t, function () { if (C.state === "run") app.cTick(); }); },
    tocar: function (ns) { held.forEach(function (n) { env.tecla(false, n); }); ns.forEach(function (n) { env.tecla(true, n); }); held = ns.slice(); },
    notas: function (k) { return notasDe(app, C.items[k]); }
  };
}

teste("Acordes com metrônomo: acorde errado perto da troca conta como erro", function () {
  var env = criar(), m = serieMetro(env, {});
  m.ate(m.cT(0)); m.tocar(m.notas(0)); m.ate(m.cT(0) + 100);
  assert.strictEqual(m.C.res[0].st, "ok");
  // errado 700 ms antes da vez do acorde 1, segurado na virada e corrigido depois
  m.ate(m.cT(1) - 700); m.tocar(m.notas(1).map(function (n) { return n + 1; })); m.ate(m.cT(1) + 300);
  m.tocar(m.notas(1)); m.ate(m.cT(1) + 400);
  assert.strictEqual(m.C.res[1].err, true, "errado antes da vez abrir");
  assert.strictEqual(m.C.res[1].st, "bad");
  // errado 100 ms antes da troca, dentro do meio tempo
  m.ate(m.cT(2) - 100); m.tocar(m.notas(2).map(function (n) { return n + 1; })); m.ate(m.cT(2) + 400);
  m.tocar(m.notas(2)); m.ate(m.cT(2) + 500);
  assert.strictEqual(m.C.res[2].err, true, "errado no meio tempo antes da troca");
});

teste("Acordes com metrônomo: acorde apertado na contagem fica fora da média", function () {
  var env = criar(), m = serieMetro(env, {});
  m.ate(m.cT(0) - 1500); m.tocar(m.notas(0)); m.ate(m.cT(0) + 100);
  assert.strictEqual(m.C.res[0].early, true);
  assert.strictEqual(m.C.res[0].st, "near");
  assert.strictEqual(m.C.res[0].off, -500, "meio tempo adiantado");
});

teste("Acordes com metrônomo: série certa com trocas graduais não tem erro falso", function () {
  var env = criar(), m = serieMetro(env, { groups: ["bbb", "bpb"], inv: true, count: 24, beats: 2, beatMs: 500 }), app = env.app;
  var held = [];
  for (var k = 0; k < m.C.items.length; k++) {
    var ns = m.notas(k);
    m.ate(m.cT(k) - 60); held.slice(0, 2).forEach(function (n) { env.tecla(false, n); });
    m.ate(m.cT(k) - 30);
    ns.forEach(function (n) { env.tecla(true, n); m.ate(env.agora() + 12); });
    held.slice(2).forEach(function (n) { env.tecla(false, n); });
    held = ns;
  }
  m.ate(m.cT(m.C.items.length) - 100);
  m.C.res.forEach(function (r, i) { assert.strictEqual(r.st, "ok", "acorde " + (i + 1) + ": " + r.st + (r.err ? " com erro" : "")); });
  assert.ok(app.C.state === "run");
});

/* ---------- treino ---------- */
teste("Treino com teclado: teclas em até 70 ms são uma resposta só", function () {
  var env = criar(), app = env.app;
  app.settings.tab = "treino"; app.MIDI.state = "on"; app.newDrillLine();
  function alvo() { return app.dToMidi(app.drill.notes[app.drill.idx].d); }
  // Solta as teclas entre as respostas, como no piano: uma tecla ainda apertada não manda um aperto novo.
  function soltar() { Object.keys(app.MIDI.held).forEach(function (n) { env.tecla(false, +n); }); }
  var k = alvo(); env.tecla(true, k); env.avancar(env.agora() + 15); env.tecla(true, k + 2); env.avancar(env.agora() + 100);
  assert.deepEqual([app.drill.status[0], app.drill.idx], ["ok", 1], "certa e depois a vizinha");
  soltar(); k = alvo(); env.tecla(true, k + 1); env.avancar(env.agora() + 20); env.tecla(true, k); env.avancar(env.agora() + 100);
  assert.deepEqual([app.drill.status[1], app.drill.idx], ["ok", 2], "vizinha e depois a certa");
  soltar(); k = alvo(); env.tecla(true, k + 12); env.avancar(env.agora() + 100);
  assert.deepEqual([app.drill.status[2], app.drill.idx], ["bad", 3], "oitava errada");
});

/* ---------- folha ---------- */
teste("Folha: nenhum ataque pede a mesma tecla duas vezes", function () {
  var app = criar().app, s = app.settings;
  ["posicao", "pautas", "centro", "vizinhas", "tudo"].forEach(function (gp) {
    ["alternadas", "juntas"].forEach(function (hands) {
      Object.assign(s, { clef: "grand", gpreset: gp, hands: hands });
      for (var rep = 0; rep < 30; rep++) {
        app.newSheet();
        app.F.on.forEach(function (o) {
          var ks = o.evs.map(function (x) { return x.d; });
          assert.strictEqual(new Set(ks).size, ks.length, gp + " " + hands);
        });
      }
    });
  });
});

/* ---------- ritmo ---------- */
teste("Ritmo: no Segurar, a porcentagem conta a nota inteira", function () {
  var app = criar().app, R = app.R, A = 10000;
  // 4/4 a 60 bpm: semínima, semínima, mínima | semínima, pausa, mínima (posições em semicolcheias)
  var m0 = [{ pos: 0, dur: 4, rest: false }, { pos: 4, dur: 4, rest: false }, { pos: 8, dur: 8, rest: false }];
  var m1 = [{ pos: 0, dur: 4, rest: false }, { pos: 4, dur: 4, rest: true }, { pos: 8, dur: 8, rest: false }];
  Object.assign(app.settings.r, { mode: "segurar", hands: "uma", meter: 4 });
  Object.assign(R, { ex: { meter: 4, measures: [m0, m1] }, beatMs: 1000, meter: 4, totalMs: 8000, anchor: A, auto: false, midi: false });
  R.taps = [{ t: A, h: "R", up: A + 900 }, { t: A + 1000, h: "R", up: A + 1900 }, { t: A + 2000, h: "R", up: A + 3950 },
    { t: A + 4000, h: "R", up: A + 4950 }, { t: A + 6000, h: "R", up: A + 7990 }];
  var r = app.rEvaluate().hands.R;
  assert.deepEqual([r.ok, r.full, r.total], [5, 5, 5], "tudo certo");
  R.taps[2].up = A + 2600;   // a mínima solta cedo
  r = app.rEvaluate().hands.R;
  assert.deepEqual([r.ok, r.full, r.dEarly], [5, 4, 1], "começou no tempo, mas soltou cedo");
  app.settings.r.mode = "bater";
  r = app.rEvaluate().hands.R;
  assert.strictEqual(r.full, r.ok, "no Bater, inteira = no tempo");
});

teste("Ritmo: a calibração vai para a entrada usada", function () {
  function calibrar(prefixo) {
    var env = criar(), app = env.app, R = app.R;
    app.MIDI.state = "on";   // o teclado está conectado nos dois casos
    Object.assign(R, { state: "run", kind: "cal", midi: true, src: 0, beatMs: 60000 / 90, meter: 4, startPerf: 10000, taps: [], active: {} });
    R.anchor = R.startPerf; R.totalMs = 12 * R.beatMs;
    for (var k = 0; k < 12; k++) { var t = R.startPerf + k * R.beatMs + 40; env.avancar(t); app.rDown(t, "R", prefixo + k); app.rUp(t + 50, prefixo + k); }
    app.rFinish();
    return app.settings.r;
  }
  var tela = calibrar("p");
  assert.deepEqual([tela.calibrated, tela.latency, tela.calMidi], [true, 40, false], "tocando na tela");
  var piano = calibrar("m");
  assert.deepEqual([piano.calMidi, piano.latMidi, piano.calibrated], [true, 40, false], "tocando no piano");
});

/* ---------- partituras ---------- */
// Uma posição do cursor da biblioteca, como pCollect monta. notas: [tecla MIDI, pauta (0 = de cima), "lig" se continua uma ligadura].
// Teclas pretas são escritas como sustenido. tempo: o instante e o compasso, para o andamento ({T, pos, bpm, ...});
// sem ele, a posição fica num 4/4 a 60 bpm, uma semínima depois da anterior.
function posicao(app, ri, m, notas, tempo) {
  return Object.assign({ ri: ri, m: m, mn: m + 1, it: { clone: function () { return {}; } }, notes: notas.map(function (x) {
    var k = x[0], L = app.MIDI_L[k % 12], acc = 0;
    if (L == null) { L = app.MIDI_L[(k - 1) % 12]; acc = 1; }
    return { k: k, L: L, acc: acc, d: app.midiToD(k - acc), st: x[1], cont: x[2] === "lig", n: {} };
  }), T: ri / 4, pos: ri / 4 - m, bpm: 60, len: 0.25, md: 1, num: 4, den: 4, impl: false }, tempo || {});
}
// Uma peça aberta, sem desenho: o cursor e as cores da biblioteca viram funções vazias.
function abrirPeca(env, raw, two) {
  var app = env.app, P = app.P;
  app.settings.tab = "partituras"; app.MIDI.state = "on";
  P.osmd = { EngravingRules: { GNote: function () { return null; } }, cursor: { show: function () {}, hide: function () {}, update: function () {} } };
  P.rec = { titulo: "teste" }; P.raw = raw; P.two = two; P.lastMn = raw[raw.length - 1].mn;
  P.steps = app.pBuild(raw, app.pMao()); app.pReset(0);
  return P;
}
function pecaTeste(app) {
  return [
    posicao(app, 0, 0, [[60, 0], [48, 1]]),           // Dó central e Dó grave
    posicao(app, 1, 0, [[64, 0], [67, 0], [64, 0]]),  // Mi e Sol (o Mi em duas vozes)
    posicao(app, 2, 1, [[64, 0, "lig"], [43, 1]]),    // o Mi continua ligado; só o Sol grave começa
    posicao(app, 3, 1, [[64, 0, "lig"]]),             // só a ligadura: não pede tecla
    posicao(app, 4, 2, [[66, 0], [50, 1]])            // Fá♯ e Ré
  ];
}

teste("Partituras: vezes de tocar por mão, sem ligaduras e sem repetir tecla", function () {
  var app = criar().app, raw = pecaTeste(app);
  function teclas(mao) { return app.pBuild(raw, mao).map(function (s) { return s.keys.slice().sort().join("+"); }); }
  assert.deepEqual(teclas("duas"), ["48+60", "64+67", "43", "50+66"]);
  assert.deepEqual(teclas("direita"), ["60", "64+67", "66"]);
  assert.deepEqual(teclas("esquerda"), ["48", "43", "50"]);
});

teste("Partituras: espera as notas certas, marca o erro e mostra o resultado", function () {
  var env = criar(), app = env.app, P = abrirPeca(env, pecaTeste(app), true);
  env.tecla(true, 48); env.avancar(env.agora() + 30);
  assert.strictEqual(P.idx, 0, "falta o Dó central");
  env.tecla(true, 60); env.tecla(false, 60); env.tecla(false, 48);
  assert.strictEqual(P.idx, 1, "acorde completo, em qualquer ordem");
  assert.strictEqual(app.lpOcupado(), true, "a peça em andamento segura a recarga");
  env.tecla(true, 65);
  assert.strictEqual(P.err, true);
  assert.strictEqual(env.els["p-feedback"].textContent, "Eram Mi e Sol na mão direita. Você tocou Fá.");
  env.tecla(false, 65); env.tecla(true, 64); env.tecla(true, 67); env.tecla(false, 64); env.tecla(false, 67);
  assert.deepEqual([P.idx, P.res[1]], [2, "bad"], "certa depois do erro conta como erro");
  env.tecla(true, 43); env.tecla(false, 43);
  env.tecla(true, 50); env.tecla(true, 66);
  assert.strictEqual(P.done, true);
  assert.deepEqual(P.res, ["ok", "bad", "ok", "ok"]);
  assert.ok(env.els["p-result"].innerHTML.indexOf("3 de 4 certas de primeira") >= 0);
  assert.ok(env.els["p-result"].innerHTML.indexOf("Compasso com erro: 1.") >= 0);
  assert.strictEqual(app.lpOcupado(), false);
});

teste("Partituras: tecla errada na oitava e sustenido sem tocar", function () {
  var env = criar(), app = env.app, P = abrirPeca(env, pecaTeste(app), true);
  app.settings.p.mao = "direita"; app.pSteps();
  env.tecla(true, 48);
  assert.strictEqual(env.els["p-feedback"].textContent, "Era Dó. Você tocou o Dó uma oitava abaixo.");
  env.tecla(false, 48); env.tecla(true, 60); env.tecla(false, 60); env.tecla(true, 64); env.tecla(true, 67);
  env.tecla(false, 64); env.tecla(false, 67); env.tecla(true, 65);
  assert.strictEqual(env.els["p-feedback"].textContent, "Era Fá♯. Você tocou Fá.");
  env.tecla(true, 54);
  assert.strictEqual(env.els["p-feedback"].textContent, "Era Fá♯. Você tocou o Fá♯ uma oitava abaixo.");
  env.tecla(true, 63);
  assert.strictEqual(env.els["p-feedback"].textContent, "Era Fá♯. Você tocou Ré♯.");
});

teste("Partituras: os botões andam de compasso em compasso", function () {
  var env = criar(), app = env.app, P = abrirPeca(env, pecaTeste(app), true);
  function compasso() { return P.steps[P.idx].m; }
  app.pJump(1); assert.deepEqual([compasso(), P.idx], [1, 2]);
  app.pJump(1); assert.deepEqual([compasso(), P.idx], [2, 3]);
  app.pJump(1); assert.strictEqual(P.idx, 3, "no último compasso, fica");
  app.pJump(-1); assert.deepEqual([compasso(), P.idx], [1, 2]);
  env.tecla(true, 43); env.tecla(false, 43); env.tecla(true, 50); env.tecla(true, 66);
  assert.ok(env.els["p-result"].innerHTML.indexOf("Do compasso 2 ao fim.") >= 0);
  app.pJump(0); assert.deepEqual([P.idx, P.done, P.res.length], [0, false, 0], "do início, sem resultados");
  // Trocar a mão recomeça no compasso em que estava.
  app.pJump(1); app.settings.p.mao = "esquerda"; app.pSteps();
  assert.deepEqual([compasso(), P.steps[P.idx].keys], [1, [43]]);
});

teste("Partituras no andamento: contagem com anacruse e mudança de andamento", function () {
  var app = criar().app;
  // Anacruse de 1 tempo em 4/4 a 60 bpm (semibreve = 4 s); no compasso 2, o andamento vai para 120.
  var raw = [
    posicao(app, 0, 0, [[67, 0]], { T: 0, pos: 0, md: 0.25, impl: true }),
    posicao(app, 1, 1, [[60, 0]], { T: 0.25, pos: 0 }),
    posicao(app, 2, 1, [[62, 0]], { T: 0.5, pos: 0.25 }),
    posicao(app, 3, 1, [[64, 0]], { T: 0.75, pos: 0.5, len: 0.5 }),
    posicao(app, 4, 2, [[65, 0]], { T: 1.25, pos: 0, bpm: 120, len: 1 })
  ];
  var steps = app.pBuild(raw, "duas"), ms = app.pTimeline(raw, 1);
  assert.deepEqual(ms, [0, 1000, 2000, 3000, 5000]);
  var b = app.pBeats(raw, ms, 1, steps, 0);
  // Um compasso inteiro de contagem e os três tempos antes da anacruse; ela cai no 4º tempo, sem acento.
  assert.deepEqual(b.filter(function (x) { return x.count; }).map(function (x) { return [x.rel, x.acc]; }),
    [[-7000, true], [-6000, false], [-5000, false], [-4000, false], [-3000, true], [-2000, false], [-1000, false]]);
  assert.deepEqual(b.filter(function (x) { return !x.count; }).map(function (x) { return [x.rel, x.acc]; }),
    [[0, false], [1000, true], [2000, false], [3000, false], [4000, false], [5000, true], [5500, false], [6000, false], [6500, false]]);
  // Pela metade do andamento, tudo leva o dobro do tempo; começando no compasso 2, a contagem é um compasso só.
  assert.deepEqual(app.pTimeline(raw, 2), [0, 2000, 4000, 6000, 10000]);
  var c = app.pBeats(raw, ms, 1, steps, 4).filter(function (x) { return x.count; }).map(function (x) { return x.rel; });
  assert.deepEqual(c, [-2000, -1500, -1000, -500]);
});

function pecaAndamento(app) {
  return [
    posicao(app, 0, 0, [[60, 0]]),
    posicao(app, 1, 0, [[62, 0]]),
    posicao(app, 2, 0, [[64, 0], [48, 1]]),
    posicao(app, 3, 0, [[65, 0]]),
    posicao(app, 4, 1, [[67, 0]], { pos: 0 })
  ];
}
teste("Partituras no andamento: começa na 1ª nota e confere cada nota no tempo", function () {
  var env = criar(), app = env.app;
  app.settings.p.modo = "andamento";
  var P = abrirPeca(env, pecaAndamento(app), true), T = P.tm;
  function tocar(em, k) { env.avancar(em, app.pTTick); env.tecla(true, k); env.tecla(false, k); }
  env.avancar(10000);
  env.tecla(true, 62); env.tecla(false, 62);
  assert.strictEqual(T.state, "idle", "tecla errada não começa");
  assert.strictEqual(env.els["p-feedback"].textContent, "A peça começa com Dó na mão direita. Você tocou Ré.");
  tocar(10000, 60);
  assert.deepEqual([T.state, T.anchor], ["run", 10000], "a primeira nota marca o tempo");
  assert.strictEqual(app.lpOcupado(), true);
  tocar(11030, 62);    // 30 ms atrasada: no tempo
  tocar(11900, 64);    // 100 ms adiantada: um pouco fora
  tocar(12010, 48);
  tocar(12600, 70);    // tecla errada, mais perto da 4ª vez
  tocar(13000, 65);
  env.avancar(15100, app.pTTick);   // a 5ª vez passa sem ser tocada
  assert.strictEqual(T.state, "idle");
  assert.deepEqual(P.res.slice(0, 5), ["ok", "ok", "near", "bad", "bad"]);
  var html = env.els["p-result"].innerHTML;
  assert.ok(html.indexOf("4 de 6 notas no tempo") >= 0, html);
  assert.ok(html.indexOf("Além delas: 1 um pouco adiantada, 1 que faltou e 1 tecla errada.") >= 0, html);
  assert.ok(html.indexOf("Compassos para treinar: 1 e 2.") >= 0, html);
  assert.strictEqual(app.lpOcupado(), false);
});

teste("Partituras no andamento: Parar recomeça sem resultado", function () {
  var env = criar(), app = env.app;
  app.settings.p.modo = "andamento";
  Object.assign(app.settings.r, { calMidi: true, latMidi: 50 });
  var P = abrirPeca(env, pecaAndamento(app), true), T = P.tm;
  env.avancar(20000); env.tecla(true, 60); env.tecla(false, 60);
  assert.strictEqual(T.lat, 50, "os cliques usam a calibração do teclado feita no Ritmo");
  env.avancar(21100, app.pTTick); env.tecla(true, 62);   // 100 ms atrasada
  assert.deepEqual([P.idx, P.res[1]], [1, "near"]);
  app.pTGo();
  assert.deepEqual([T.state, P.idx, P.res.length, P.done], ["idle", 0, 0, false]);
});

teste("Partituras: numa repetição, a nota fica com a pior cor das passagens", function () {
  var env = criar(), app = env.app;
  // Dó e Ré, repetidos: as posições 2 e 3 são as mesmas notas do desenho (ni 0 e 1).
  var raw = [posicao(app, 0, 0, [[60, 0]]), posicao(app, 1, 0, [[62, 0]]), posicao(app, 2, 0, [[60, 0]]), posicao(app, 3, 0, [[62, 0]])];
  raw.forEach(function (r, i) { r.notes[0].ni = i % 2; });
  var P = abrirPeca(env, raw, false);
  env.tecla(true, 64); env.tecla(false, 64); env.tecla(true, 60); env.tecla(false, 60);   // erra o Dó na 1ª passagem
  env.tecla(true, 62); env.tecla(false, 62); env.tecla(true, 60); env.tecla(false, 60);   // acerta tudo na 2ª
  env.tecla(true, 62); env.tecla(false, 62);
  assert.deepEqual(P.res, ["bad", "ok", "ok", "ok"]);
  assert.deepEqual(P.worst, [3, 1], "o Dó continua vermelho");
  app.pReset(0);
  assert.deepEqual(P.worst, [], "recomeçar limpa as cores");
});

teste("Partituras no modo página: onde a página vira pela metade", function () {
  var app = criar().app;
  // As linhas de uma página A4 de 1131 px (6 linhas) e da seguinte, em px, como pPageLayout mede.
  var p1 = [[101, 236], [259, 363], [392, 503], [521, 630], [656, 772], [788, 904]];
  var p2 = [[34, 146], [166, 282], [300, 409], [433, 550], [567, 677], [702, 818]];
  var split = app.pPageSplit(p1, 1131);
  assert.strictEqual(split, 512, "a divisa entre a 3ª e a 4ª linha, a mais perto do meio");
  assert.strictEqual(app.pPageTopCut(p2, split), 421, "em cima cabem as 3 primeiras linhas da página seguinte");
  assert.strictEqual(app.pPageSplit([[100, 300]], 1131), null, "uma linha só: vira a página inteira");
  assert.strictEqual(app.pPageTopCut([[30, 600]], split), null, "se a 1ª linha da seguinte não cabe, vira a página inteira");
});

/* ---------- rodar ---------- */
var falhas = 0, t0 = Date.now();
testes.forEach(function (t) {
  var a = Date.now();
  try { t.f(); console.log("ok    " + t.nome + "  (" + (Date.now() - a) + " ms)"); }
  catch (e) { falhas++; console.log("FALHA " + t.nome + "\n      " + (e && e.message || e)); }
});
console.log("\n" + (testes.length - falhas) + " de " + testes.length + " testes passaram em " + (Date.now() - t0) + " ms.");
process.exitCode = falhas ? 1 : 0;
