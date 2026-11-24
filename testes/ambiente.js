/* Ambiente de testes: roda os scripts do app em Node, numa página falsa e com um relógio controlado.
   Os scripts são carregados na mesma ordem do index.html, num contexto só (como no navegador), então as funções e as
   variáveis de cima de cada arquivo ficam em env.app (por exemplo env.app.cGen, env.app.C). */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");

var ARQUIVOS = ["base", "pauta", "treino", "folha", "ajustes", "ritmo", "acordes", "partituras", "app"];
var DIR = path.join(__dirname, "..", "leitura-partitura", "js");

// Elemento falso: aceita tudo o que o app faz com os elementos, sem desenhar nada.
function elemento() {
  return {
    hidden: false, disabled: false, textContent: "", innerHTML: "", value: "", className: "", style: {}, dataset: {},
    children: [], clientWidth: 800, _ouvintes: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function () {}, getAttribute: function () { return null; },
    addEventListener: function (t, f) { (this._ouvintes[t] = this._ouvintes[t] || []).push(f); },
    querySelector: function () { return elemento(); }, querySelectorAll: function () { return []; },
    getBoundingClientRect: function () { return { top: 0, bottom: 100 }; },
    scrollIntoView: function () {}, closest: function () { return null; }, setPointerCapture: function () {},
    get offsetWidth() { return 0; }
  };
}

/* opcoes.armazenado: conteúdo inicial do localStorage, como {"lcs-settings": "..."}.
   opcoes.hash: o #aba da URL. */
function criar(opcoes) {
  opcoes = opcoes || {};
  var els = {}, armazenado = Object.assign({}, opcoes.armazenado || {}), agora = 1000, timers = [], seq = 0;
  var doc = {
    hidden: false, visibilityState: "visible",
    getElementById: function (id) { return els[id] || (els[id] = elemento()); },
    querySelector: function () { return elemento(); }, querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  var ctx = {
    document: doc, navigator: {}, location: { hash: opcoes.hash || "", protocol: "file:" }, innerHeight: 800,
    localStorage: {
      getItem: function (k) { return k in armazenado ? armazenado[k] : null; },
      setItem: function (k, v) { armazenado[k] = String(v); },
      removeItem: function (k) { delete armazenado[k]; }
    },
    performance: { now: function () { return agora; } },
    setTimeout: function (f, ms) { var id = ++seq; timers.push({ id: id, f: f, em: agora + (ms || 0) }); return id; },
    clearTimeout: function (id) { timers.forEach(function (t) { if (t.id === id) t.f = null; }); },
    requestAnimationFrame: function () { return 1; }, cancelAnimationFrame: function () {},
    ResizeObserver: function () { this.observe = function () {}; },
    addEventListener: function () {}, console: console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ARQUIVOS.forEach(function (n) {
    vm.runInContext(fs.readFileSync(path.join(DIR, n + ".js"), "utf8"), ctx, { filename: n + ".js" });
  });
  return {
    app: ctx, els: els, armazenado: armazenado,
    agora: function () { return agora; },
    // Avança o relógio até "ate", em passos de 16 ms (um quadro), rodando os timers vencidos e, se dada, a função quadro.
    avancar: function (ate, quadro) {
      while (agora < ate) {
        agora = Math.min(ate, agora + 16);
        timers.forEach(function (t) { if (t.f && t.em <= agora) { var f = t.f; t.f = null; f(); } });
        if (quadro) quadro();
      }
    },
    // Mensagem MIDI como as do teclado: 0x90 aperta, 0x80 solta.
    tecla: function (aperta, nota) { ctx.midiMsg({ data: [aperta ? 0x90 : 0x80, nota, aperta ? 80 : 0], timeStamp: agora }); }
  };
}

module.exports = { criar: criar, ARQUIVOS: ARQUIVOS };
