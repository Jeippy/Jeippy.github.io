/* Ajustes do topo, que valem para o Treino e a Folha: extensão, clave, nomes das notas e som. */
"use strict";

/* ---------- ajustes ---------- */
var presetsEl=document.getElementById("presets");
function renderPresets(){
  var cur=curPreset();
  presetsEl.innerHTML=curPresets().map(function(p){
    return '<button class="chip" role="radio" id="pr-'+p.id+'" data-p="'+p.id+'" aria-checked="'+(p===cur)+'">'+p.label+'</button>';
  }).join("");
  document.getElementById("preset-desc").textContent=isGrand()?cur.desc(nameOf):cur.desc(function(s){return nameOf(CLEFS[settings.clef].base+s);});
}
presetsEl.addEventListener("click",function(e){
  var b=e.target.closest(".chip"); if(!b) return;
  var key=isGrand()?"gpreset":"preset";
  if(b.dataset.p===settings[key]) return;
  settings[key]=b.dataset.p; saveSettings();
  renderPresets(); renderMap(); renderWeak(); newDrillLine(); newSheet();
});
document.querySelectorAll("[data-naming]").forEach(function(b){
  b.addEventListener("click",function(){
    settings.naming=b.dataset.naming; saveSettings(); syncSwitches();
    renderPresets(); renderPad(); renderDrill(); renderSheet(); renderMap(); renderWeak();
    cRenderControls(); cRender(); cRenderWeak();
  });
});
document.querySelectorAll("[data-clef]").forEach(function(b){
  b.addEventListener("click",function(){
    if(b.dataset.clef===settings.clef) return;
    settings.clef=b.dataset.clef; saveSettings(); syncSwitches();
    renderPresets(); renderMap(); renderWeak(); newDrillLine(); newSheet();
  });
});
var swSom=document.getElementById("sw-som");
swSom.addEventListener("click",function(){settings.sound=!settings.sound;saveSettings();syncSwitches();});
function syncSwitches(){
  swSom.setAttribute("aria-checked",String(settings.sound));
  document.getElementById("som-txt").textContent=settings.sound?"Ligado":"Desligado";
  swNames.setAttribute("aria-checked",String(settings.showNames));
  document.querySelectorAll("[data-naming]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.naming===settings.naming));});
  document.querySelectorAll("[data-clef]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.clef===settings.clef));});
  document.querySelectorAll("[data-hands]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.hands===settings.hands));});
  document.getElementById("hands-seg").hidden=!isGrand();
  renderHeader();
  sheetIntro();
}
function sheetIntro(){
  document.getElementById("sheet-intro").textContent=midiOn()
    ? (isGrand()?"Pauta de cima: mão direita. Pauta de baixo: mão esquerda. ":"")+"Toque as notas no teclado, na altura escrita: a folha avança quando você acerta"
      +(isGrand()?", e as notas que começam juntas nas duas pautas vão juntas":"")+". Os erros ficam em vermelho. Na tela, toque numa nota para ouvir."
    : isGrand()
    ? "Pauta de cima: mão direita. Pauta de baixo: mão esquerda. Toque num pulso constante, quatro tempos por compasso, sem parar para corrigir, e depois confira com “Mostrar nomes”. Na tela, toque numa nota para ouvir."
    : "Leia as notas em voz alta num pulso constante, quatro por compasso, sem parar para corrigir. Depois confira com “Mostrar nomes”. Toque numa nota para ouvir.";
}
