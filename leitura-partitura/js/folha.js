/* Aba Folha de leitura (geração e desenho da folha, acompanhamento pelo teclado MIDI) e o Mapa das notas. */
"use strict";

/* ---------- folha de leitura ---------- */
// Cada compasso guarda, por clave, eventos {b: tempo inicial 0-3, dur: 1/2/4, d: nota} ou pausas {b, dur, rest:true}.
var sheetHost=document.getElementById("sheet-host");
var sheet={staves:["sol"],measures:[]};
var CHORDS={I:[0,2,4],IV:[3,5,0],V:[4,6,1]};   // Dó-Mi-Sol, Fá-Lá-Dó, Sol-Si-Ré
function ev(b,dur,d){return {b:b,dur:dur,d:d};}
function rest(b,dur){return {b:b,dur:dur,rest:true};}

function genSingle(st,M){
  var ds=staffDs(st), prev=null, out=[];
  for(var m=0;m<M;m++){
    var e=[];
    for(var k=0;k<4;k++){prev=pickMelodic(ds,prev);e.push(ev(k,1,prev));}
    var o={}; o[st]=e; out.push(o);
  }
  return out;
}
// Mãos alternadas: em cada compasso só uma mão toca de cada vez; a outra descansa.
function genAlternating(M){
  var ds={sol:staffDs("sol"),fa:staffDs("fa")}, pr={sol:null,fa:null}, out=[], last="", pats=["R","L","RL","LR"];
  function q(st,b){pr[st]=pickMelodic(ds[st],pr[st]);return ev(b,1,pr[st]);}
  for(var m=0;m<M;m++){
    var pat=weighted(pats,[3,3,2,2].map(function(w,i){return pats[i]===last?w*0.4:w;})), o;
    last=pat;
    if(pat==="R") o={sol:[q("sol",0),q("sol",1),q("sol",2),q("sol",3)],fa:[rest(0,4)]};
    else if(pat==="L") o={fa:[q("fa",0),q("fa",1),q("fa",2),q("fa",3)],sol:[rest(0,4)]};
    else if(pat==="RL") o={sol:[q("sol",0),q("sol",1),rest(2,2)],fa:[rest(0,2),q("fa",2),q("fa",3)]};
    else o={fa:[q("fa",0),q("fa",1),rest(2,2)],sol:[rest(0,2),q("sol",2),q("sol",3)]};
    out.push(o);
  }
  return out;
}
// Mãos juntas: a direita toca semínimas; a esquerda segura notas longas do acorde do compasso, sempre abaixo da direita.
function genTogether(M){
  var rh=staffDs("sol"), lh=staffDs("fa"), prR=null, prL=null, out=[], prevC="I";
  for(var m=0;m<M;m++){
    var c=(m===0||m===M-1)?"I":(m===M-2)?"V":weighted(["I","IV","V"],[prevC==="I"?1:2.2,prevC==="IV"?0.6:1.6,prevC==="V"?0.6:1.6]);
    prevC=c;
    var ct=CHORDS[c], inChord=function(d){return ct.indexOf(letterOf(d))>=0;};
    var boost=function(d){return inChord(d)?3:1;};
    var sol=[], minR=Infinity;
    for(var k=0;k<4;k++){prR=pickMelodic(rh,prR,k%2===0?boost:null);sol.push(ev(k,1,prR));minR=Math.min(minR,prR);}
    var below=lh.filter(function(d){return d<minR;}); if(!below.length) below=lh;
    var tones=below.filter(inChord); if(!tones.length) tones=below;
    var roots=tones.filter(function(d){return letterOf(d)===ct[0];}); if(!roots.length) roots=tones;
    var near=function(set,ref){return weighted(set,set.map(function(d){return ref==null?1:1/(1+Math.abs(d-ref));}));};
    var fa;
    if(Math.random()<0.6||tones.length<2){prL=near(roots,prL);fa=[ev(0,4,prL)];}
    else {
      var a=near(roots,prL), others=tones.filter(function(d){return d!==a;}), b=others.length?near(others,a):a;
      prL=b; fa=[ev(0,2,a),ev(2,2,b)];
    }
    out.push({sol:sol,fa:fa});
  }
  return out;
}
function newSheet(){
  var ms;
  if(!isGrand()) ms=genSingle(settings.clef,24);
  else ms=settings.hands==="juntas"?genTogether(16):genAlternating(16);
  sheet={staves:staves(),measures:ms};
  fBuild(); renderSheet();
}
function renderSheet(){
  var cw=sheetHost.clientWidth; if(!cw) return;
  var sts=sheet.staves, grand=sts.length>1, sp=cw<520?9:10, bo=grand?(BRACE_W+0.35)*sp:0;
  var clefEnd=bo+0.45*sp+2.75*sp, tsX=clefEnd+0.9*sp;
  var firstStart=tsX+1.8*sp+1.1*sp, otherStart=clefEnd+1.3*sp, mMin=4*3.1*sp+1.6*sp, M=sheet.measures.length;
  var m=clamp(Math.floor((cw-1-firstStart)/mMin),1,4);
  while(M%m) m--;
  F.mps=m;
  var systems=M/m, out=[], show=settings.showNames, ls=Math.max(11,1.15*sp);
  for(var sy=0;sy<systems;sy++){
    var start=sy===0?firstStart:otherStart, endX=cw-1, mW=(endX-start)/m, inner=mW-1.6*sp;
    var items=[], bars=[];
    for(var j=0;j<m;j++){
      if(j>0) bars.push(start+j*mW);
      var mx=start+j*mW, meas=sheet.measures[sy*m+j];
      sts.forEach(function(st){
        (meas[st]||[]).forEach(function(e){
          var x=(e.rest&&e.dur===4)?mx+1.0*sp+inner/2:mx+1.0*sp+inner*(e.b+0.5)/4;
          items.push(e.rest?{x:x,st:st,rest:true,dur:e.dur}:{x:x,st:st,d:e.d,dur:e.dur,hit:inner/4,cls:fCls(e),label:show?nameOf(e.d):"",lsize:ls});
        });
      });
    }
    out.push(systemSVG({W:cw,sp:sp,staves:sts,endX:endX,ts:sy===0,tsX:tsX,mnum:sy>0?(sy*m+1):null,bars:bars,
      final:sy===systems-1,endBar:sy<systems-1,items:items,topPad:(grand&&show)?5:3.6,bottom:show?5.2:3.1,
      aria:"Linha "+(sy+1)+" da folha, compassos "+(sy*m+1)+" a "+(sy*m+m)}));
  }
  // Com nomes nas duas pautas, separa os sistemas para os nomes de baixo não se confundirem com os do sistema seguinte.
  sheetHost.style.gap=(grand&&show)?Math.round(1.6*sp)+"px":"0px";
  sheetHost.innerHTML=out.join("");
}
document.getElementById("btn-newsheet").addEventListener("click",newSheet);
var swNames=document.getElementById("sw-names");
swNames.addEventListener("click",function(){settings.showNames=!settings.showNames;saveSettings();syncSwitches();renderSheet();});
document.querySelectorAll("[data-hands]").forEach(function(b){
  b.addEventListener("click",function(){
    if(b.dataset.hands===settings.hands) return;
    settings.hands=b.dataset.hands; saveSettings(); syncSwitches(); newSheet();
  });
});

function hearFrom(e){
  var g=e.target.closest(".nt[data-d]"); if(!g) return;
  play(+g.getAttribute("data-d"));
  g.classList.add("lit"); clearTimeout(g._t); g._t=setTimeout(function(){g.classList.remove("lit");},600);
}
sheetHost.addEventListener("click",hearFrom);

/* ---------- folha de leitura: teclado MIDI ---------- */
/* Com o teclado ligado, a folha acompanha a leitura no seu tempo. Cada ataque é o conjunto de notas que começam
   juntas (nas duas pautas, com as mãos juntas): ele se completa quando você aperta todas, em qualquer ordem, e a folha
   avança. Uma tecla fora do ataque é erro: o ataque fica vermelho e espera as notas certas.
   dt: tempo entre completar um ataque e completar o seguinte; o primeiro não tem. mps: compassos por linha. */
var F={on:[],idx:0,got:{},err:false,res:[],dt:[],lastT:null,done:false,mps:1};
var sheetFb=document.getElementById("sheet-feedback"), sheetRes=document.getElementById("sheet-result");
function fFeedback(t,cls){sheetFb.textContent=t||"";sheetFb.className="feedback"+(cls?" "+cls:"");}
function fBuild(){
  var by={};
  sheet.measures.forEach(function(meas,m){
    sheet.staves.forEach(function(st){
      (meas[st]||[]).forEach(function(e){
        if(e.rest) return;
        var k=m*4+e.b; (by[k]||(by[k]={m:m,evs:[]})).evs.push({d:e.d,st:st,e:e});
      });
    });
  });
  F.on=Object.keys(by).map(Number).sort(function(a,b){return a-b;}).map(function(k){return by[k];});
  F.on.forEach(function(o,i){o.evs.forEach(function(x){x.e.oi=i;});});   // oi: o ataque de cada nota, para o desenho
  F.idx=0; F.got={}; F.err=false; F.res=[]; F.dt=[]; F.lastT=null; F.done=false;
  sheetRes.hidden=true; sheetMidiUI();
}
function fCls(e){
  if(!midiOn()||e.oi==null) return "";
  if(e.oi<F.idx) return F.res[e.oi]||"";
  return e.oi===F.idx&&!F.done?(F.err?"bad":"cur"):"";
}
// O que a folha pede agora, com a mão quando há duas pautas: "Sol na mão direita e Dó na mão esquerda".
function fWant(o){
  var two=sheet.staves.length>1;
  return cList(o.evs.map(function(x){return nameOf(x.d)+(two?(x.st==="sol"?" na mão direita":" na mão esquerda"):"");}));
}
function fKey(k,t){
  if(!midiOn()||F.done||F.idx>=F.on.length) return;
  var o=F.on[F.idx], want=o.evs.map(function(x){return dToMidi(x.d);});
  if(want.indexOf(k)<0){
    var kd=midiToD(k), near=o.evs.filter(function(x){return kd!=null&&letterOf(kd)===letterOf(x.d);})[0]||o.evs[0];
    F.err=true;
    fFeedback((o.evs.length>1?"Eram ":"Era ")+fWant(o)+". Você tocou "+midiDesc(k,near.d)+".","bad");
    renderSheet(); return;
  }
  F.got[k]=1;
  if(!want.every(function(w){return F.got[w];})) return;
  var dt=F.lastT!=null?t-F.lastT:null; if(dt!=null&&dt>10000) dt=null;   // parada longa: o tempo não conta
  F.res[F.idx]=F.err?"bad":"ok"; F.dt[F.idx]=dt;
  F.lastT=t; F.idx++; F.got={}; F.err=false;
  fFeedback("");
  if(F.idx>=F.on.length){F.done=true;renderSheet();fResult();return;}
  renderSheet();
  // Ao passar para outra linha, rola a folha para ela ficar à vista.
  var sy=Math.floor(F.on[F.idx].m/F.mps), el=sheetHost.children[sy];
  if(sy!==Math.floor(F.on[F.idx-1].m/F.mps)&&el) el.scrollIntoView({block:"nearest",behavior:"smooth"});
}
function fResult(){
  var n=F.on.length, ok=F.res.filter(function(r){return r==="ok";}).length, per={}, all=[], lines=[];
  function mean(a){return a.reduce(function(s,x){return s+x;},0)/a.length;}
  F.dt.forEach(function(dt,i){if(dt==null)return;all.push(dt);var m=F.on[i].m;(per[m]||(per[m]=[])).push(dt);});
  var html='<p class="r-score">'+ok+' de '+n+' certas de primeira</p>';
  if(all.length){
    var slowM=-1, slowV=0;
    Object.keys(per).forEach(function(m){var v=mean(per[m]);if(v>slowV){slowV=v;slowM=+m;}});
    lines.push("Tempo médio por nota: "+fmt1(mean(all)/1000)+" s. Compasso mais demorado: "+(slowM+1)+", com "+fmt1(slowV/1000)+" s por nota.");
  }
  lines.push(ok<n?"As notas em vermelho tiveram erro. Toque a folha de novo, mais devagar, antes de passar para outra."
    :all.length&&mean(all)>1500?"Sem erros. Agora tente manter a mesma demora em todas as notas, como um pulso."
    :"Sem erros e sem parar: passe para uma folha nova.");
  lines.forEach(function(s){html+='<p class="r-line">'+s+'</p>';});
  html+='<p class="r-legend"><span class="dot ok"></span>certa de primeira &nbsp; <span class="dot bad"></span>com erro. O tempo de cada nota vai de completar a anterior até completar ela; a primeira não conta.</p>'
    +'<div class="r-actions"><button type="button" class="btn" id="sheet-again">Tocar de novo</button></div>';
  sheetRes.innerHTML=html; sheetRes.hidden=false;
  sheetRes.scrollIntoView({block:"nearest",behavior:"smooth"});
}
sheetRes.addEventListener("click",function(e){
  if(e.target.id!=="sheet-again") return;
  fBuild(); renderSheet(); sheetHost.scrollIntoView({block:"start",behavior:"smooth"});
});
// Mostra a linha de avisos da folha só com o teclado ligado.
function sheetMidiUI(){
  var on=midiOn();
  sheetFb.hidden=!on;
  if(on&&!F.done&&F.idx===0&&!F.err) fFeedback("Toque a nota destacada. A folha avança quando você acerta.","");
  sheetIntro();
}

/* ---------- mapa ---------- */
var mapHost=document.getElementById("map-host");
mapHost.addEventListener("click",hearFrom);
function renderMap(){
  var p=curPreset(), grand=isGrand(), fing=!!p.fingers&&grand;
  var list=pool().sort(function(a,b){return a.d-b.d||(a.st==="fa"?-1:1);});
  var sp=10, bo=grand?(BRACE_W+0.35)*sp:0, start=bo+4.3*sp, slot=3.6*sp, tail=1.7*sp, n=list.length, W=start+n*slot+tail;
  var cnt={sol:0,fa:0};
  var items=list.map(function(nt,i){
    var it={x:start+slot*(i+0.5),d:nt.d,st:nt.st,dur:1,hit:slot,label:nameOf(nt.d),lsize:12};
    if(fing) it.finger=p.fingers[nt.st][cnt[nt.st]++];
    return it;
  });
  mapHost.innerHTML=systemSVG({W:W,sp:sp,staves:staves(),endX:W-1,final:true,items:items,topPad:grand?(fing?6.8:5):3.6,bottom:fing?6.8:5.4,fixed:true,
    aria:"Mapa das notas de "+nameOf(list[0].d)+" a "+nameOf(list[n-1].d)});
  document.getElementById("map-summary").textContent="Mapa das notas: "+p.label.charAt(0).toLowerCase()+p.label.slice(1);
  document.getElementById("map-note").textContent="Todas as notas da extensão escolhida, da mais grave à mais aguda."
    +(fing?" Os números em azul são os dedos: 1 é o polegar e 5 o mínimo, nas duas mãos.":"")+" Toque numa nota para ouvir.";
}
