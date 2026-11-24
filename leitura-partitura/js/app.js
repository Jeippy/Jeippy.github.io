/* Abas, redimensionamento e início do app. Carregado por último: só aqui as funções de todos os arquivos já existem. */
"use strict";

/* ---------- abas ---------- */
var tabs={treino:document.getElementById("tab-treino"),folha:document.getElementById("tab-folha"),ritmo:document.getElementById("tab-ritmo"),acordes:document.getElementById("tab-acordes"),partituras:document.getElementById("tab-partituras")};
var panels={treino:document.getElementById("panel-treino"),folha:document.getElementById("panel-folha"),ritmo:document.getElementById("panel-ritmo"),acordes:document.getElementById("panel-acordes"),partituras:document.getElementById("panel-partituras")};
function applyTabs(){
  var t=settings.tab;
  Object.keys(tabs).forEach(function(k){tabs[k].setAttribute("aria-selected",String(k===t));panels[k].hidden=(k!==t);});
  // Clave, extensão e mapa das notas não valem para o ritmo, os acordes e as partituras.
  var own=(t==="ritmo"||t==="acordes"||t==="partituras");
  document.getElementById("global-settings").hidden=own;
  document.getElementById("map").hidden=own;
  renderHeader();
}
// Título e frase do topo, conforme a aba.
var HEAD_SUB={
  treino:"Pautas novas a cada rodada para treinar o reconhecimento das notas, da 1ª linha às linhas suplementares.",
  folha:"Folhas novas a cada rodada para ler as notas em sequência, com uma ou com as duas mãos.",
  ritmo:"Exercícios de ritmo com metrônomo, para tocar no tempo com uma ou com as duas mãos.",
  acordes:"Os 12 acordes maiores no teclado, com inversões, trocas e metrônomo.",
  partituras:"As partituras que você exporta do MuseScore, para tocar esperando cada nota ou no andamento, com o teclado MIDI conferindo o que você toca."
};
function renderHeader(){
  var t=settings.tab;
  document.getElementById("h1").innerHTML=t==="ritmo"?"Leitura de <em>Ritmo</em>":t==="acordes"?"Acordes <em>Maiores</em>":t==="partituras"?"Suas <em>Partituras</em>"
    :"Leitura em Clave de <em>"+MODE_NAMES[settings.clef]+"</em>";
  document.getElementById("h-sub").textContent=HEAD_SUB[t];
}
// Para a recarga da versão nova (no fim da página): espera terminar a série, o exercício ou a folha em andamento.
window.lpOcupado=function(){return R.state!=="idle"||C.state!=="idle"||(midiOn()&&F.idx>0&&!F.done)||(midiOn()&&!!P.rec&&P.idx>P.from&&!P.done)||P.tm.state!=="idle";};
function showTab(t){
  if(t!=="ritmo") rStop();
  if(t!=="acordes") cStop();
  if(t!=="partituras") pHide();
  settings.tab=t; saveSettings(); applyTabs();
  if(t==="treino"){startClock();renderDrill();} else if(t==="folha") renderSheet(); else if(t==="ritmo") rDraw(); else if(t==="acordes") cRender(); else pShow();
}
Object.keys(tabs).forEach(function(k){tabs[k].addEventListener("click",function(){showTab(k);});});

/* ---------- redimensionamento ---------- */
var lastW={d:0,s:0,r:0,c:0,p:0}, raf=0;
function onResize(){
  cancelAnimationFrame(raf);
  raf=requestAnimationFrame(function(){
    var dw=drillHost.clientWidth, sw=sheetHost.clientWidth, rw=rHost.clientWidth, cw=cHost.clientWidth, pw=pHost.clientWidth;
    if(dw&&dw!==lastW.d){lastW.d=dw;renderDrill();}
    if(sw&&sw!==lastW.s){lastW.s=sw;renderSheet();}
    if(rw&&rw!==lastW.r){lastW.r=rw;rDraw();}
    if(cw&&cw!==lastW.c){lastW.c=cw;cRenderKbd();}
    if(pw&&pw!==lastW.p){lastW.p=pw;pResize();}
  });
}
if(window.ResizeObserver){var ro=new ResizeObserver(onResize);ro.observe(drillHost);ro.observe(sheetHost);ro.observe(rHost);ro.observe(cHost);ro.observe(pHost);}
else window.addEventListener("resize",onResize);

/* ---------- início ---------- */
var h=(location.hash||"").replace("#","");
if(tabs[h]) settings.tab=h;
if(!tabs[settings.tab]) settings.tab="treino";
syncSwitches(); renderPresets(); renderPad(); renderStats(); renderWeak(); renderReset(false); renderMap();
rGenerate(); rRenderControls(); rCalText(); rUI();
cRenderControls(); cRenderStats(); cRenderWeak(); cRenderReset(false);
applyTabs();
newDrillLine(); newSheet(); rDraw(); cNew(); pControls(); if(settings.tab==="partituras") pShow(); midiUI(); midiAuto();
