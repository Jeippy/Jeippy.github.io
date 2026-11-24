/* Aba Treino: a nota destacada na pauta, respondida pelos botões, pelo teclado do computador ou pelo piano; e o desempenho. */
"use strict";

/* ---------- treino ---------- */
var drillHost=document.getElementById("drill-host");
var drill={notes:[],status:[],idx:0,t0:0,line:0,busy:false,timer:0,interrupted:false};
function startClock(){drill.t0=performance.now();drill.interrupted=false;}
// Se a página some da tela ou perde o foco durante a pergunta, o tempo dessa resposta não conta.
function markPause(){drill.interrupted=true;}
document.addEventListener("visibilitychange",function(){if(document.hidden)markPause();});
window.addEventListener("blur",markPause);
var feedbackEl=document.getElementById("feedback");

function drillGeom(cw){var sp=cw<520?12:16, bo=isGrand()?(BRACE_W+0.35)*sp:0;return {sp:sp,start:bo+4.3*sp,tail:1.7*sp};}
function newDrillLine(){
  clearTimeout(drill.timer);
  var cw=drillHost.clientWidth||640, g=drillGeom(cw);
  var n=clamp(Math.floor((cw-g.start-g.tail)/(4*g.sp)),4,10);
  var notes=[],prev=null;
  for(var i=0;i<n;i++){prev=pickDrill(prev,notes);notes.push(prev);}
  drill.notes=notes;drill.status=notes.map(function(){return null;});drill.idx=0;drill.line++;drill.busy=false;
  startClock();
  drillPrompt();
  renderDrill();
}
function drillPrompt(){setFeedback(midiOn()?"Qual é a nota destacada? Toque-a no piano, na oitava certa.":"Qual é a nota destacada? Responda pelos botões ou pelo teclado.","");}
function renderDrill(){
  var cw=drillHost.clientWidth; if(!cw) return;
  var g=drillGeom(cw), sp=g.sp, n=drill.notes.length;
  var W=Math.max(cw,g.start+g.tail+n*3*sp), slot=(W-g.start-g.tail)/n;
  var items=drill.notes.map(function(nt,i){
    var st=drill.status[i], cur=(i===drill.idx);
    return {x:g.start+slot*(i+0.5),d:nt.d,st:nt.st,dur:1,cls:st||(cur?"cur":""),label:st?nameOf(nt.d):(cur?"?":""),lcls:st||"cur",lsize:0.95*sp};
  });
  var band=drill.idx<n?{x:g.start+slot*drill.idx+0.12*sp,w:slot-0.24*sp}:null;
  drillHost.innerHTML=systemSVG({W:W,sp:sp,staves:staves(),endX:W-1,final:true,items:items,band:band,topPad:isGrand()?5:3.6,bottom:5.4,
    aria:"Pauta de treino com "+n+" notas"+(drill.idx<n?", nota "+(drill.idx+1)+" destacada":"")});
  var cv=coverage();
  document.getElementById("progress").textContent="Pauta "+drill.line+" · nota "+Math.min(drill.idx+1,n)+" de "+n
    +(cv.done?"":" · avaliação inicial: "+cv.seen+" de "+cv.total);
}
function setFeedback(t,cls){feedbackEl.textContent=t;feedbackEl.className="feedback"+(cls?" "+cls:"");}

var pad=document.getElementById("pad");
function renderPad(){
  var h="";
  for(var i=0;i<7;i++){
    var kb=settings.naming==="letras"?String(i+1):LET[i]+" · "+(i+1);
    h+='<button class="key" data-l="'+i+'" id="key-'+i+'" aria-label="'+SOLF[i]+' ('+LET[i]+')"><span class="nm">'+letterName(i)+'</span><span class="kb">'+kb+'</span></button>';
  }
  pad.innerHTML=h;
  drillHint();
}
function drillHint(){
  if(drill.notes.length&&drill.idx===0&&!drill.busy) drillPrompt();   // pauta ainda sem resposta: ajusta a pergunta
  document.getElementById("hint").textContent=midiOn()
    ? "Com o teclado MIDI, toque a nota na altura escrita: o mesmo nome em outra oitava conta como erro. Os botões continuam valendo."
    : settings.naming==="letras"
    ? "Teclado: letras C D E F G A B ou números 1 a 7."
    : "Teclado: letras C D E F G A B (Dó = C) ou números 1 a 7 (Dó = 1).";
}
function flashKey(i,kind){
  var el=document.getElementById("key-"+i); if(!el) return;
  el.classList.remove("is-ok","is-bad"); void el.offsetWidth; el.classList.add("is-"+kind);
  clearTimeout(el._t); el._t=setTimeout(function(){el.classList.remove("is-"+kind);},520);
}
// Teclas que chegam quase juntas (até 70 ms) contam como uma resposta só, para uma tecla vizinha esbarrada junto com
// a certa não virar erro na nota seguinte. Vale a certa, se estiver entre elas; senão, a primeira.
var drillKeys=null;
function drillKey(k,t){
  if(drill.busy||drill.idx>=drill.notes.length) return;
  if(drillKeys){drillKeys.k.push(k);return;}
  drillKeys={k:[k],t:t};
  setTimeout(function(){
    var b=drillKeys; drillKeys=null;
    if(drill.busy||drill.idx>=drill.notes.length) return;
    var want=dToMidi(drill.notes[drill.idx].d);
    answer(null,b.k.indexOf(want)>=0?want:b.k[0],b.t);
  },70);
}
// li: botão da letra (0 = Dó). key: nota MIDI tocada no piano, que precisa estar na oitava escrita; at: quando foi tocada.
function answer(li,key,at){
  if(drill.busy||drill.idx>=drill.notes.length) return;
  var nt=drill.notes[drill.idx], d=nt.d, midi=key!=null, kd=midi?midiToD(key):null;
  var ok=midi?kd===d:letterOf(d)===li;
  if(midi) li=kd==null?null:letterOf(kd);
  // Respostas muito acima do seu tempo típico contam como pausa: o acerto ou erro vale, o tempo não.
  var dt=(at!=null?at:performance.now())-drill.t0, ref=typicalMs(), limit=clamp(4*(ref||3000),8000,20000);
  var timed=!drill.interrupted&&dt<=limit;
  stats.answered++;
  if(timed){stats.timeMs+=dt;stats.timed++;}
  var pk=perKey(nt), p=stats.per[pk]||(stats.per[pk]={n:0,w:0});
  if(!p.r) p.r=[]; if(!p.t) p.t=[];
  p.n++; p.r.push(ok?0:1); if(p.r.length>RECENT) p.r.shift();
  if(ok){
    stats.correct++;stats.streak++;if(stats.streak>stats.best)stats.best=stats.streak;
    if(timed){p.t.push(Math.round(dt));if(p.t.length>TIMES)p.t.shift();}
  }
  else {p.w++;stats.streak=0;}
  drill.status[drill.idx]=ok?"ok":"bad";
  if(!midi) play(d);   // com o teclado, o próprio piano já soa
  if(li!=null) flashKey(li,ok?"ok":"bad");
  if(!ok) flashKey(letterOf(d),"ok");
  var fg=fingerOf(nt), fgTxt=fg?" "+(nt.st==="sol"?"Mão direita":"Mão esquerda")+", dedo "+fg+".":"";
  var msg=ok?(timed?"Certo em "+fmt1(dt/1000)+" s: ":"Certo: ")+nameOf(d)+", "+posName(d,nt.st)+"."+fgTxt+(timed?"":" Tempo não contado porque houve uma pausa.")
            :"Era "+nameOf(d)+", "+posName(d,nt.st)+"."+fgTxt+(midi?" Você tocou "+midiDesc(key,d)+".":" Você marcou "+letterName(li)+".");
  drill.idx++;
  saveStats(); renderStats(); renderWeak();
  if(drill.idx>=drill.notes.length){
    drill.busy=true;
    var c=drill.status.filter(function(x){return x==="ok";}).length;
    setFeedback(msg+" Pauta completa: "+c+" de "+drill.notes.length+".",ok?"ok":"bad");
    renderDrill();
    drill.timer=setTimeout(newDrillLine,1600);
  } else {
    setFeedback(msg,ok?"ok":"bad");
    startClock();
    renderDrill();
  }
}
pad.addEventListener("click",function(e){var b=e.target.closest(".key");if(b)answer(+b.dataset.l);});
document.getElementById("btn-skip").addEventListener("click",newDrillLine);
document.addEventListener("keydown",function(e){
  if(settings.tab!=="treino"||e.metaKey||e.ctrlKey||e.altKey) return;
  var k=(e.key||"").toLowerCase(), i="cdefgab".indexOf(k);
  if(k.length!==1) return;
  if(i<0&&k>="1"&&k<="7") i=+k-1;
  if(i<0) return;
  e.preventDefault();
  if(!e.repeat) answer(i);   // segurar a tecla não responde várias notas seguidas
});

/* ---------- desempenho ---------- */
function renderStats(){
  var a=stats.answered;
  var rows=[
    ["Respostas",a],
    ["Acertos",stats.correct],
    ["Precisão",a?Math.round(stats.correct/a*100)+"%":"—"],
    ["Tempo médio",stats.timed?fmt1(stats.timeMs/stats.timed/1000)+" s":"—"],
    ["Sequência",stats.streak],
    ["Melhor sequência",stats.best]
  ];
  document.getElementById("figs").innerHTML=rows.map(function(r){return "<div><dt>"+r[0]+"</dt><dd>"+r[1]+"</dd></div>";}).join("");
}
function renderWeak(){
  var cv=coverage(), ref=typicalMs(), noteEl=document.getElementById("weak-note"), el=document.getElementById("weak-list");
  if(!cv.done){
    noteEl.textContent="Avaliação inicial: "+cv.seen+" de "+cv.total+" notas desta extensão já foram respondidas duas vezes. Até completar, as que faltam aparecem com mais frequência.";
  } else {
    noteEl.textContent="Todas as "+cv.total+" notas desta extensão foram avaliadas"+(ref?". Seu tempo típico é de "+fmt1(ref/1000)+" s por nota":"")
      +". As que você erra ou demora mais aparecem com mais frequência; as outras continuam aparecendo para não esquecer.";
  }
  var list=pool().map(function(n){var i=noteInfo(n,ref);i.d=n.d;i.st=n.st;return i;})
    .filter(function(x){return !x.fresh&&(x.errs>0||x.slow>=0.3);})
    .sort(function(a,b){return b.weight-a.weight;}).slice(0,5);
  if(!list.length){
    el.innerHTML='<li class="empty">'+(cv.done?"Nenhuma nota se destaca agora: você está acertando todas num tempo parecido.":"Termine a avaliação inicial para ver aqui as notas que pedem mais treino.")+'</li>';
    return;
  }
  el.innerHTML=list.map(function(x){
    var parts=[];
    if(x.errs>0) parts.push('<b>'+x.errs+' de '+x.tot+' erradas</b>');
    if(x.med) parts.push(x.slow>=0.3?'<i>'+fmt1(x.med/1000)+' s</i>':fmt1(x.med/1000)+' s');
    return '<li><span class="wn">'+nameOf(x.d)+'</span><span class="wp">'+posName(x.d,x.st)+'</span><span class="wr">'+parts.join(" · ")+'</span></li>';
  }).join("");
}
var resetEl=document.getElementById("reset");
function renderReset(confirming){
  resetEl.innerHTML=confirming
    ? '<span>Apagar todo o histórico?</span><button class="txtbtn" id="rs-yes">Apagar</button><button class="txtbtn" id="rs-no">Cancelar</button>'
    : '<button class="txtbtn" id="rs-ask">Zerar estatísticas</button>';
}
resetEl.addEventListener("click",function(e){
  var id=e.target.id;
  if(id==="rs-ask") renderReset(true);
  else if(id==="rs-no") renderReset(false);
  else if(id==="rs-yes"){stats=blankStats();saveStats();renderStats();renderWeak();renderReset(false);}
});
