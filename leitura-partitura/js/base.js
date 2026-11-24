/* Base do app: constantes da pauta, utilidades comuns, armazenamento (ajustes e estatísticas das notas), som e a conexão
   com o teclado MIDI, que manda cada nota para a aba aberta. */
"use strict";

var SOLF=["Dó","Ré","Mi","Fá","Sol","Lá","Si"];
var LET=["C","D","E","F","G","A","B"];
var SEMI=[0,2,4,5,7,9,11];
// Notas em passos diatônicos: oitava*7 + índice da nota (Dó central = 28).
// base: nota da 1ª linha (Mi na clave de Sol, Sol na de Fá). anchor: linha em que o glifo da clave se apoia.
var CLEFS={
  sol:{base:30,glyph:"#g-clef",anchor:2,name:"Sol"},
  fa:{base:18,glyph:"#f-clef",anchor:6,name:"Fá"}
};
var MODE_NAMES={sol:"Sol",fa:"Fá",grand:"Sol e Fá"};
var CENTRAL_C=28;
var HEAD_W=1.181, WHOLE_W=1.689, REST_W=1.128;   // larguras dos glifos, em espaços
var GAP=6;                                       // espaços entre as duas pautas
var BRACE_W=1.2;                                 // largura da chave que une as pautas

function rng(a,b){var r=[];for(var i=a;i<=b;i++)r.push(i);return r;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function f(v){return Math.round(v*100)/100;}
function letterOf(d){return ((d%7)+7)%7;}
function joinNames(list,n){var a=list.map(n);return a.slice(0,-1).join(", ")+" e "+a[a.length-1];}

/* ---------- utilidades comuns ---------- */
function median(a){if(!a.length)return 0;var s=a.slice().sort(function(x,y){return x-y;}),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function weighted(list,weights){
  var tot=0,i;for(i=0;i<weights.length;i++)tot+=weights[i];
  var r=Math.random()*tot;for(i=0;i<list.length;i++){r-=weights[i];if(r<=0)return list[i];}
  return list[list.length-1];
}
function fmt1(v){return v.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1});}
function rStamp(ts){var now=performance.now();return ts>0&&Math.abs(now-ts)<1000?ts:now;}
function accSym(a){return a<0?"♭":a>0?"♯":"";}
function cNote(L,a){return letterName(L)+accSym(a);}
function cPcName(pc,flat){var s=(flat?PC_FLAT:PC_SHARP)[pc];return cNote(s[0],s[1]);}
function cList(a){return a.length<2?a.join(""):a.slice(0,-1).join(", ")+" e "+a[a.length-1];}
function cEsc(s){return String(s).replace(/[&<>"]/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch];});}
// Grafia de uma nota que não faz parte do acorde: com sustenido ou com bemol, conforme o acorde.
var PC_SHARP=[[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];
var PC_FLAT=[[0,0],[1,-1],[1,0],[2,-1],[2,0],[3,0],[4,-1],[4,0],[5,-1],[5,0],[6,-1],[6,0]];

/* Extensões para uma clave: posições relativas à 1ª linha (0 = 1ª linha, 8 = 5ª linha). */
var PRESETS=[
  {id:"linhas",label:"Linhas",s:[0,2,4,6,8],desc:function(n){return "Só as cinco linhas: "+joinNames([0,2,4,6,8],n)+".";}},
  {id:"espacos",label:"Espaços",s:[1,3,5,7],desc:function(n){return "Só os quatro espaços: "+joinNames([1,3,5,7],n)+".";}},
  {id:"pauta",label:"Pauta inteira",s:rng(0,8),desc:function(n){return "Da 1ª linha ("+n(0)+") à 5ª linha ("+n(8)+"), sem linhas suplementares.";}},
  {id:"vizinhas",label:"Pauta e vizinhas",s:rng(-1,9),desc:function(n){return "Do "+n(-1)+" logo abaixo da pauta ao "+n(9)+" logo acima.";}},
  {id:"graves",label:"Suplementares graves",s:rng(-4,4),desc:function(n){return "Do "+n(-4)+" na 2ª linha suplementar inferior ao "+n(4)+" da 3ª linha"+(settings.clef==="sol"?", passando pelo Dó central.":".");}},
  {id:"agudas",label:"Suplementares agudas",s:rng(4,12),desc:function(n){return "Do "+n(4)+" da 3ª linha ao "+n(12)+" na 2ª linha suplementar superior"+(settings.clef==="fa"?", passando pelo Dó central.":".");}},
  {id:"tudo",label:"Tudo",s:rng(-4,12),desc:function(n){return "Do "+n(-4)+" grave ao "+n(12)+" agudo, com duas linhas suplementares de cada lado.";}}
];
/* Extensões para as duas pautas (piano): posições relativas à 1ª linha de cada clave. */
var GRAND_PRESETS=[
  {id:"posicao",label:"Posição de Dó",sol:rng(-2,2),fa:rng(3,7),fingers:{sol:[1,2,3,4,5],fa:[5,4,3,2,1]},
    desc:function(n){return "Mão direita do Dó central ao "+n(32)+", dedos 1 a 5. Mão esquerda do "+n(21)+" ao "+n(25)+" uma oitava abaixo, dedos 5 a 1. Dá para tocar tudo sem mover as mãos.";}},
  {id:"pautas",label:"Duas pautas",sol:rng(0,8),fa:rng(0,8),
    desc:function(n){return "As linhas e os espaços das duas pautas, sem linhas suplementares. Clave de Fá: do "+n(18)+" ao "+n(26)+". Clave de Sol: do "+n(30)+" ao "+n(38)+".";}},
  {id:"centro",label:"Região do Dó central",sol:rng(-4,2),fa:rng(6,12),
    desc:function(n){return "Clave de Fá do "+n(24)+" da 4ª linha ao "+n(30)+" acima da pauta. Clave de Sol do "+n(26)+" abaixo da pauta ao "+n(32)+" da 2ª linha. O Dó central aparece nas duas pautas, numa linha suplementar.";}},
  {id:"vizinhas",label:"Pautas e vizinhas",sol:rng(-1,9),fa:rng(-1,9),
    desc:function(n){return "As duas pautas e mais uma nota logo abaixo e logo acima de cada uma: clave de Fá do "+n(17)+" ao "+n(27)+", clave de Sol do "+n(29)+" ao "+n(39)+".";}},
  {id:"tudo",label:"Tudo",sol:rng(-4,12),fa:rng(-4,12),
    desc:function(n){return "Do "+n(14)+" duas linhas abaixo da clave de Fá ao "+n(42)+" duas linhas acima da clave de Sol.";}}
];

/* ---------- armazenamento ---------- */
var store={
  get:function(k,fb){try{var v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch(e){return fb;}},
  set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
};
// per[clave:nota] = {n: respostas, w: erros, r: últimos resultados (1 = erro), t: últimos tempos de acerto em ms}
function blankStats(){return {answered:0,correct:0,timeMs:0,timed:0,streak:0,best:0,per:{}};}
var settings=Object.assign({preset:"pauta",gpreset:"posicao",naming:"solfejo",sound:true,tab:"treino",showNames:false,clef:"sol",hands:"alternadas"},store.get("lcs-settings",{}));
if(!MODE_NAMES[settings.clef]) settings.clef="sol";
if(!PRESETS.some(function(p){return p.id===settings.preset;})) settings.preset="pauta";
if(!GRAND_PRESETS.some(function(p){return p.id===settings.gpreset;})) settings.gpreset="posicao";
if(settings.hands!=="juntas") settings.hands="alternadas";
var stats=Object.assign(blankStats(),store.get("lcs-stats",{}));
if(!stats.per||typeof stats.per!=="object") stats.per={};
// Estatísticas antigas eram só da clave de Sol e usavam a nota como chave.
Object.keys(stats.per).forEach(function(k){if(k.indexOf(":")<0){stats.per["sol:"+k]=stats.per[k];delete stats.per[k];}});
if(typeof stats.timed!=="number") stats.timed=stats.answered;
function saveSettings(){store.set("lcs-settings",settings);}
function saveStats(){store.set("lcs-stats",stats);}

function isGrand(){return settings.clef==="grand";}
function staves(){return isGrand()?["sol","fa"]:[settings.clef];}
function curPresets(){return isGrand()?GRAND_PRESETS:PRESETS;}
function curPreset(){
  var id=isGrand()?settings.gpreset:settings.preset, l=curPresets();
  for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i];
  return l[0];
}
// Notas possíveis na extensão atual: {d: nota, st: clave em que aparece}.
function pool(){
  var p=curPreset();
  if(isGrand()) return p.sol.map(function(s){return {d:CLEFS.sol.base+s,st:"sol"};}).concat(p.fa.map(function(s){return {d:CLEFS.fa.base+s,st:"fa"};}));
  var b=CLEFS[settings.clef].base;
  return p.s.map(function(s){return {d:b+s,st:settings.clef};});
}
function staffDs(st){return pool().filter(function(n){return n.st===st;}).map(function(n){return n.d;});}
function perKey(n){return n.st+":"+n.d;}
function nameOf(d){return (settings.naming==="letras"?LET:SOLF)[letterOf(d)];}
function letterName(i){return (settings.naming==="letras"?LET:SOLF)[i];}
function ord(n,fem){return n+(fem?"ª":"º");}
function posName(d,st){
  var s=d-CLEFS[st].base, t;
  if(s>=0&&s<=8){t=(s%2===0)?ord(s/2+1,true)+" linha":ord((s+1)/2,false)+" espaço";}
  else if(s<0){var k=-s;t=(k%2===0)?ord(k/2,true)+" linha suplementar inferior":ord((k+1)/2,false)+" espaço suplementar inferior";}
  else {var k2=s-8;t=(k2%2===0)?ord(k2/2,true)+" linha suplementar superior":ord((k2+1)/2,false)+" espaço suplementar superior";}
  if(isGrand()) t+=" da clave de "+CLEFS[st].name;
  if(d===CENTRAL_C) t+=" (Dó central)";
  return t;
}
function fingerOf(n){
  if(!isGrand()) return null;
  var p=curPreset(); if(!p.fingers) return null;
  var i=p[n.st].indexOf(n.d-CLEFS[n.st].base);
  return i<0?null:p.fingers[n.st][i];
}
function freq(d){var oct=Math.floor(d/7),l=d-oct*7;var midi=12*(oct+1)+SEMI[l];return 440*Math.pow(2,(midi-69)/12);}

/* ---------- som ---------- */
var actx=null;
function play(d){
  if(!settings.sound) return;
  try{
    var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    actx=actx||new AC(); if(actx.state==="suspended") actx.resume();
    var t=actx.currentTime+0.01, fr=freq(d);
    var g=actx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.26,t+0.012); g.gain.exponentialRampToValueAtTime(0.0001,t+1.4); g.connect(actx.destination);
    var o1=actx.createOscillator(); o1.type="triangle"; o1.frequency.value=fr; o1.connect(g);
    var g2=actx.createGain(); g2.gain.value=fr<140?0.6:0.22; g2.connect(g);
    var o2=actx.createOscillator(); o2.type="sine"; o2.frequency.value=fr*2; o2.connect(g2);
    o1.start(t); o2.start(t); o1.stop(t+1.5); o2.stop(t+1.5);
  }catch(e){}
}

/* ---------- teclado MIDI ---------- */
/* Uma conexão para o app todo; cada nota vai para a aba aberta. Treino e Folha conferem a nota tocada, o Ritmo
   usa cada tecla como um toque e os Acordes conferem o conjunto de notas apertadas.
   held: notas apertadas agora (nota MIDI → instante). setT: instante da última mudança no conjunto.
   dirty: houve nota nova desde o último acorde reconhecido; segurar o acorde anterior não conta como erro. */
var MIDI={access:null,state:"off",names:[],held:{},setT:0,dirty:false};
function midiOn(){return MIDI.state==="on";}
function midiConnect(){
  if(!navigator.requestMIDIAccess){MIDI.state="unsupported";midiChanged();return;}
  MIDI.state="wait"; midiUI();
  navigator.requestMIDIAccess().then(function(acc){
    MIDI.access=acc; acc.onstatechange=midiBind; midiBind();
  },function(){MIDI.state="denied";midiChanged();});
}
function midiBind(){
  var names=[];
  MIDI.access.inputs.forEach(function(inp){
    inp.onmidimessage=midiMsg;
    if(inp.state!=="disconnected") names.push(inp.name||"Teclado MIDI");
  });
  MIDI.names=names; MIDI.state=names.length?"on":"none";
  if(!names.length){
    MIDI.held={};
    if(C.state!=="idle"&&C.mode==="midi") cStop("O teclado foi desconectado. Ligue o cabo e comece de novo.");
  }
  midiChanged();
}
// Já com permissão dada antes, conecta sozinho ao abrir o app.
function midiAuto(){
  if(!navigator.requestMIDIAccess){MIDI.state="unsupported";midiUI();return;}
  try{
    if(navigator.permissions) navigator.permissions.query({name:"midi"}).then(function(p){if(p.state==="granted")midiConnect();}).catch(function(){});
  }catch(e){}
}
function midiMsg(e){
  var d=e.data; if(!d||d.length<3) return;
  var st=d[0]&0xF0, nt=d[1], on=st===0x90&&d[2]>0;
  if(!on&&st!==0x80&&st!==0x90) return;
  var t=rStamp(e.timeStamp);
  if(on){if(MIDI.held[nt])return;MIDI.held[nt]=t;MIDI.dirty=true;}
  else {if(!MIDI.held[nt])return;delete MIDI.held[nt];}
  MIDI.setT=t;
  var tab=settings.tab;
  if(tab==="acordes") cOnNotes();
  // Ritmo com as duas mãos: abaixo do Dó central é a esquerda; do Dó central para cima, a direita.
  else if(tab==="ritmo"){if(on)rDown(e.timeStamp,rTwo()&&nt<60?"L":"R","m"+nt);else rUp(e.timeStamp,"m"+nt);}
  else if(on&&tab==="treino") drillKey(nt,t);
  else if(on&&tab==="folha") fKey(nt,t);
}
// Linha de estado do teclado em cada aba. Com data-midi="opt", ela some nos navegadores sem MIDI.
function midiUI(){
  var s=MIDI.state, h;
  if(s==="on") h='<span class="dot ok"></span>'+cEsc(MIDI.names.join(", "));
  else if(s==="wait") h='Procurando o teclado…';
  else if(s==="none") h='Nenhum teclado MIDI encontrado. Ligue o cabo USB.';
  else if(s==="denied") h='Sem permissão para o teclado. Libere “Dispositivos MIDI” nas permissões do site e <button type="button" class="txtbtn midi-btn">tente de novo</button>.';
  else if(s==="unsupported") h=window.isSecureContext===false?'Para usar o teclado MIDI, abra o app pelo endereço https.':'Este navegador não recebe teclado MIDI. No Android, use o Chrome.';
  else h='<button type="button" class="txtbtn midi-btn">Conectar teclado MIDI</button>';
  document.querySelectorAll(".midi-line").forEach(function(el){
    var x=(s==="unsupported"&&el.getAttribute("data-midi")!=="full")?"":h;
    if(el._h!==x){el._h=x;el.innerHTML=x;}
  });
}
function midiChanged(){
  midiUI(); drillHint(); sheetMidiUI(); renderSheet(); rUI(); rCalText(); cRender();
}
document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest(".midi-btn"))midiConnect();});
// Nota MIDI ↔ nota da pauta (passos diatônicos, Dó central = 28 = MIDI 60). Teclas pretas não têm nota na pauta.
var MIDI_L={0:0,2:1,4:2,5:3,7:4,9:5,11:6};
function midiToD(k){var l=MIDI_L[k%12];return l==null?null:(Math.floor(k/12)-1)*7+l;}
function dToMidi(d){return (Math.floor(d/7)+1)*12+SEMI[letterOf(d)];}
// A tecla tocada, dita em relação à nota pedida: "Lá", "Fá♯" ou "o Sol uma oitava abaixo".
function midiDesc(k,d){
  var pd=midiToD(k);
  if(pd==null) return cPcName(k%12,false);
  if(pd!==d&&letterOf(pd)===letterOf(d)){var o=Math.round((pd-d)/7);return "o "+nameOf(pd)+" "+(["","uma oitava","duas oitavas","três oitavas"][Math.abs(o)]||Math.abs(o)+" oitavas")+(o>0?" acima":" abaixo");}
  return nameOf(pd);
}
