/* Aba Partituras: abre as partituras exportadas do MuseScore (MusicXML: .mxl ou .musicxml), guarda as peças no aparelho
   e, com o teclado MIDI, espera a nota certa: a partitura avança quando você toca todas as notas que começam juntas.
   O desenho é do OpenSheetMusicDisplay (vendor/), carregado só quando uma peça abre. */
"use strict";

/* ---------- ajustes e estado ---------- */
var P_ZOOM={pequeno:0.75,medio:1,grande:1.3};
settings.p=Object.assign({mao:"duas",tamanho:"medio",ultima:null},settings.p||{});
if(["duas","direita","esquerda"].indexOf(settings.p.mao)<0) settings.p.mao="duas";
if(!P_ZOOM[settings.p.tamanho]) settings.p.tamanho="medio";
if(typeof settings.p.ultima!=="number") settings.p.ultima=null;

/* rec: a peça aberta. raw: cada posição do cursor da biblioteca, com as notas que começam ali.
   steps: as posições que pedem tecla, já filtradas pela mão (tecla: nota MIDI). idx: a vez. from: onde a rodada começou.
   got: teclas certas já tocadas na vez. err: houve tecla errada na vez. res/dt: resultado e tempo de cada vez.
   two: a peça tem piano (duas pautas): a de cima é a mão direita, a de baixo a esquerda.
   colored: vezes pintadas de outra cor, para voltar ao normal ao recomeçar. */
var P={osmd:null,rec:null,raw:[],steps:[],two:false,lastMn:0,idx:0,from:0,got:{},err:false,res:[],dt:[],t0:null,lastT:null,
  done:false,colored:{},col:null,w:0,list:[],wake:null,tried:false};
var pLibEl=document.getElementById("p-lib"), pListEl=document.getElementById("p-list"), pMsgEl=document.getElementById("p-msg"),
  pFileEl=document.getElementById("p-file"), pViewEl=document.getElementById("p-view"), pHost=document.getElementById("p-host"),
  pTitleEl=document.getElementById("p-title"), pStatusEl=document.getElementById("p-status"), pFb=document.getElementById("p-feedback"),
  pRes=document.getElementById("p-result"), pMaoEl=document.getElementById("p-mao");

/* ---------- peças guardadas no aparelho (IndexedDB) ---------- */
// Cada peça: {id, nome (do arquivo), titulo, compositor, arquivo (Blob), criada, aberta}.
var pDbP=null;
function pDb(){
  if(pDbP) return pDbP;
  var p=new Promise(function(ok,no){
    if(!window.indexedDB){no(new Error("sem IndexedDB"));return;}
    var rq=indexedDB.open("leitura-partitura",1);
    rq.onupgradeneeded=function(){rq.result.createObjectStore("pecas",{keyPath:"id",autoIncrement:true});};
    rq.onsuccess=function(){ok(rq.result);};
    rq.onerror=function(){no(rq.error);};
  });
  p.catch(function(){pDbP=null;});
  return (pDbP=p);
}
function pReq(mode,fn){
  return pDb().then(function(db){return new Promise(function(ok,no){
    var tx=db.transaction("pecas",mode), rq=fn(tx.objectStore("pecas"));
    tx.oncomplete=function(){ok(rq.result);};
    tx.onerror=tx.onabort=function(){no(tx.error);};
  });});
}
function pAll(){return pReq("readonly",function(s){return s.getAll();});}
function pGet(id){return pReq("readonly",function(s){return s.get(id);});}
function pPut(rec){return pReq("readwrite",function(s){return s.put(rec);});}
function pDel(id){return pReq("readwrite",function(s){return s.delete(id);});}

/* ---------- lista de peças ---------- */
var pAsk=null;   // a peça cujo "Remover" espera confirmação
function pMsg(s,cls){pMsgEl.textContent=s;pMsgEl.className="feedback p-msg"+(cls?" "+cls:"");}
function pLibRender(){
  pAll().then(function(l){
    l.sort(function(a,b){return (b.aberta||0)-(a.aberta||0);});
    P.list=l;
    if(!l.length){pListEl.innerHTML='<li class="empty">Nenhuma partitura ainda. Toque em “Abrir arquivo” e escolha um arquivo exportado do MuseScore.</li>';return;}
    pListEl.innerHTML=l.map(function(r){
      var sub=[r.compositor,"aberta em "+new Date(r.aberta||r.criada).toLocaleDateString("pt-BR")].filter(Boolean).join(" · ");
      return '<li><button type="button" class="p-open" data-id="'+r.id+'"><span class="p-t">'+cEsc(r.titulo)+'</span><span class="p-s">'+cEsc(sub)+'</span></button>'
        +(pAsk===r.id?'<span class="p-ask">Remover do aparelho?</span><button type="button" class="txtbtn" data-del="'+r.id+'">Remover</button><button type="button" class="txtbtn" data-keep="1">Cancelar</button>'
          :'<button type="button" class="txtbtn" data-ask="'+r.id+'">Remover</button>')+'</li>';
    }).join("");
  },function(){
    P.list=[];
    pListEl.innerHTML='<li class="empty">Este navegador não deixa guardar partituras no aparelho. Você ainda pode abrir um arquivo, mas ele não fica salvo.</li>';
  });
}
pListEl.addEventListener("click",function(e){
  var b=e.target.closest&&e.target.closest("button"); if(!b) return;
  var d=b.dataset;
  if(d.id) pOpen(+d.id);
  else if(d.ask){pAsk=+d.ask;pLibRender();}
  else if(d.keep){pAsk=null;pLibRender();}
  else if(d.del){
    var id=+d.del; pAsk=null;
    if(settings.p.ultima===id){settings.p.ultima=null;saveSettings();}
    pDel(id).then(pLibRender,pLibRender);
  }
});
pFileEl.addEventListener("change",function(){
  var f=pFileEl.files&&pFileEl.files[0]; pFileEl.value="";
  if(f) pImport(f);
});
// Abre um arquivo escolhido: só guarda se a biblioteca conseguir ler. Um arquivo com o mesmo nome é atualizado.
function pImport(file){
  var nome=file.name||"partitura", blob;
  if(/\.mscz?$/i.test(nome)){pMsg("“"+nome+"” é o arquivo do próprio MuseScore. No MuseScore, use Arquivo › Exportar e escolha MusicXML.","bad");return;}
  pMsg("Abrindo “"+nome+"”…","");
  file.arrayBuffer().then(function(b){blob=new Blob([b]);return pLibLoad();})
  .then(function(){return pOsmd().load(blob);})
  .then(function(){
    var s=P.osmd.Sheet, same=P.list.filter(function(r){return r.nome===nome;})[0], agora=Date.now();
    var rec={nome:nome,titulo:pTitle(s,nome),compositor:String(s.ComposerString||"").trim(),arquivo:blob,criada:same?same.criada:agora,aberta:agora};
    if(same) rec.id=same.id;
    if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(function(){});
    return pPut(rec).then(function(id){rec.id=id;return rec;},function(){return rec;});   // sem IndexedDB: abre sem guardar
  })
  .then(function(rec){pMsg("","");pShowPiece(rec);})
  .catch(function(err){
    if(window.console) console.warn(err);
    pMsg(pLibFail(err)?pLibFail(err):"Não consegui abrir “"+nome+"”. Use um arquivo exportado do MuseScore em Arquivo › Exportar › MusicXML (.mxl ou .musicxml).","bad");
  });
}
function pTitle(s,nome){var t=String(s.TitleString||"").trim();return t||nome.replace(/\.[^.]+$/,"");}
function pOpen(id){
  var rec;
  pMsg("Abrindo…","");
  pGet(id).then(function(r){if(!r)throw new Error("peça não encontrada");rec=r;return pLibLoad();})
  .then(function(){return pOsmd().load(rec.arquivo);})
  .then(function(){rec.aberta=Date.now();pPut(rec).catch(function(){});pMsg("","");pShowPiece(rec);})
  .catch(function(err){
    if(window.console) console.warn(err);
    settings.p.ultima=null; saveSettings();
    pMsg(pLibFail(err)||"Não consegui abrir esta partitura. Exporte de novo do MuseScore e abra o arquivo novo.","bad");
    pLibRender();
  });
}

/* ---------- desenho (OpenSheetMusicDisplay) ---------- */
var pLibP=null;
function pLibLoad(){
  if(window.opensheetmusicdisplay) return Promise.resolve();
  if(!pLibP) pLibP=new Promise(function(ok,no){
    var s=document.createElement("script");
    s.src="vendor/opensheetmusicdisplay.min.js";
    s.onload=function(){ok();};
    s.onerror=function(){pLibP=null;s.parentNode.removeChild(s);no(new Error("biblioteca"));};
    document.head.appendChild(s);
  });
  return pLibP;
}
function pLibFail(err){return err&&err.message==="biblioteca"?"Não consegui carregar o desenho das partituras. Abra o app uma vez com internet e tente de novo.":"";}
function pCss(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
// As cores da partitura vêm do tema do app (claro ou escuro).
function pThemeOpts(){var ink=pCss("--ink");return {defaultColorMusic:pCss("--staff"),defaultColorLabel:ink,defaultColorTitle:ink};}
function pCursorOpts(){return {type:0,color:pCss("--accent"),alpha:0.35,follow:false};}
function pOsmd(){
  if(!P.osmd) P.osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(pHost,Object.assign({
    autoResize:false, backend:"svg", drawTitle:false, drawSubtitle:false, drawComposer:false, drawLyricist:false,
    drawCredits:false, drawPartNames:false, drawPartAbbreviations:false, cursorsOptions:[pCursorOpts()]
  },pThemeOpts()));
  return P.osmd;
}
// O aparelho trocou entre o tema claro e o escuro: redesenha com as cores novas.
function pTheme(){
  if(!P.osmd) return;
  P.osmd.setOptions(Object.assign({cursorsOptions:[pCursorOpts()]},pThemeOpts()));
  pRender();
}
if(window.matchMedia){var pMq=matchMedia("(prefers-color-scheme: dark)");if(pMq.addEventListener)pMq.addEventListener("change",pTheme);}
// Desenha a peça na largura atual e devolve o cursor e as cores ao ponto em que estavam.
function pRender(){
  var o=P.osmd;
  if(!o||!P.rec||pViewEl.hidden||!pHost.clientWidth) return;
  P.col={"--staff":pCss("--staff"),"--accent":pCss("--accent"),"--ok":pCss("--ok"),"--bad":pCss("--bad")};
  o.Zoom=P_ZOOM[settings.p.tamanho];
  o.render(); P.w=pHost.clientWidth;
  if(!P.steps.length) return;
  if(P.done) o.cursor.hide(); else pCursor(false);
  Object.keys(P.colored).forEach(function(i){pPaint(+i);});
  pPaint(P.idx);
}
function pResize(){if(P.rec&&P.w&&pHost.clientWidth&&P.w!==pHost.clientWidth) pRender();}

/* ---------- notas da peça ---------- */
// Percorre a peça com o cursor da biblioteca e guarda, em cada posição, as notas que começam ali.
// Pausas, apojaturas, notas pequenas e notas invisíveis não pedem tecla. Numa peça com piano, só o piano conta.
function pCollect(){
  var o=P.osmd, sh=o.Sheet, insts=sh.Instruments.filter(function(i){return i.Visible!==false;}),
    piano=insts.filter(function(i){return i.Staves.length>1;}), use=piano.length?piano:insts;
  P.two=piano.length>0; P.raw=[];
  o.cursor.reset();
  var it=o.cursor.Iterator.clone(), guard=0;
  while(!it.EndReached&&guard++<50000){
    var notes=[], m=it.CurrentMeasureIndex, sm=sh.SourceMeasures[m];
    it.CurrentVisibleVoiceEntries().forEach(function(ve){
      if(ve.IsGrace) return;
      ve.Notes.forEach(function(n){
        if(n.isRest()||n.IsCueNote||n.PrintObject===false||!n.ParentStaff) return;
        var inst=n.ParentStaff.ParentInstrument; if(use.indexOf(inst)<0) return;
        var k=n.halfTone+12, L=MIDI_L[n.Pitch.FundamentalNote]; if(L==null) return;
        var acc=((k-SEMI[L])%12+18)%12-6;
        notes.push({k:k,L:L,acc:acc,d:midiToD(k-acc),st:P.two?Math.min(inst.Staves.indexOf(n.ParentStaff),1):0,
          cont:!!(n.NoteTie&&n.NoteTie.StartNote!==n),n:n});
      });
    });
    P.raw.push({ri:P.raw.length,m:m,mn:sm?sm.MeasureNumber:m+1,it:it.clone(),notes:notes});
    it.moveToNextVisibleVoiceEntry(false);
  }
  P.lastMn=P.raw.reduce(function(a,r){return Math.max(a,r.mn);},0);   // com "D.C.", a peça não termina no último compasso
}
// As vezes de tocar: posições com alguma nota que começa ali (a continuação de uma ligadura não pede tecla de novo).
// mao: "duas", "direita" (pauta de cima) ou "esquerda" (pauta de baixo).
// paint: as notas que mudam de cor com a vez, inclusive as continuações de ligadura, que vão com a vez em que aparecem
// (ou com a anterior, quando não há nota nova).
function pBuild(raw,mao){
  var out=[];
  raw.forEach(function(r){
    var all=r.notes.filter(function(x){return mao==="duas"||(mao==="direita"?x.st===0:x.st===1);}),
      ns=all.filter(function(x){return !x.cont;});
    if(!ns.length){if(out.length)out[out.length-1].paint=out[out.length-1].paint.concat(all);return;}
    var seen={}, keys=[];
    ns.forEach(function(x){if(!seen[x.k]){seen[x.k]=1;keys.push(x.k);}});
    out.push({ri:r.ri,m:r.m,mn:r.mn,it:r.it,notes:ns,keys:keys,paint:all});
  });
  return out;
}
function pMao(){return P.two?settings.p.mao:"duas";}
// Refaz as vezes (a mão mudou) e recomeça do compasso em que estava.
function pSteps(){
  var ri=P.steps.length?P.steps[pGroup(Math.min(P.idx,P.steps.length-1))].ri:0;
  P.steps=pBuild(P.raw,pMao());
  var i=0; while(i<P.steps.length-1&&P.steps[i].ri<ri) i++;
  pReset(P.steps.length&&P.steps[i].ri>=ri?i:0);
}

/* ---------- abrir e fechar uma peça ---------- */
function pShowPiece(rec){
  P.rec=rec; settings.p.ultima=rec.id||null; saveSettings();
  pLibEl.hidden=true; pViewEl.hidden=false; pTitleEl.textContent=rec.titulo;
  P.steps=[]; P.colored={}; P.idx=0; P.done=false;
  pControls(); pRender(); pCollect(); pControls();
  P.steps=pBuild(P.raw,pMao()); pReset(0);
  pViewEl.scrollIntoView({block:"start"});
  pWakeOn();
}
function pClose(){
  P.rec=null; P.steps=[]; P.raw=[]; P.colored={}; settings.p.ultima=null; saveSettings();
  if(P.osmd){try{P.osmd.clear();}catch(e){}}
  pViewEl.hidden=true; pLibEl.hidden=false; pWakeOff(); pLibRender();
}
document.getElementById("p-back").addEventListener("click",pClose);
// Ao entrar na aba: reabre a última peça, se houver; ao voltar para ela, redesenha se a largura mudou.
function pShow(){
  if(P.rec){pViewEl.hidden=false;pLibEl.hidden=true;pResize();pWakeOn();return;}
  pViewEl.hidden=true; pLibEl.hidden=false; pLibRender();
  if(settings.p.ultima!=null&&!P.tried){P.tried=true;pOpen(settings.p.ultima);}
}
function pHide(){pWakeOff();}

/* ---------- tocar: esperar a nota certa ---------- */
function pReset(i){
  var old=Object.keys(P.colored);
  P.idx=i; P.from=i; P.got={}; P.err=false; P.res=[]; P.dt=[]; P.t0=null; P.lastT=null; P.done=false; P.colored={};
  old.forEach(function(j){pPaint(+j);});
  pPaint(i); pCursor(true); pRes.hidden=true; pStatus(); pHint();
}
// Cor de cada vez: a atual em destaque (vermelha depois de um erro); as tocadas, verdes ou vermelhas.
function pColorOf(i){
  if(!midiOn()) return "";
  if(i===P.idx&&!P.done) return P.err?"--bad":"--accent";
  return P.res[i]==="bad"?"--bad":P.res[i]==="ok"?"--ok":"";
}
function pPaint(i){
  var s=P.steps[i]; if(!s||!P.osmd) return;
  var v=pColorOf(i), c=P.col&&P.col[v||"--staff"];
  if(v) P.colored[i]=1; else delete P.colored[i];
  if(!c) return;
  s.paint.forEach(function(x){
    var g=P.osmd.EngravingRules.GNote(x.n);
    if(g&&g.setColor){try{g.setColor(c);}catch(e){}}
  });
}
function pCursor(scroll){
  var o=P.osmd, s=P.steps[Math.min(P.idx,P.steps.length-1)];
  if(!o||!s||!o.cursor) return;
  o.cursor.show(); o.cursor.iterator=s.it.clone(); o.cursor.update();
  var el=o.cursor.cursorElement;
  if(scroll&&el&&el.getBoundingClientRect){
    var r=el.getBoundingClientRect();
    if(r.top<70||r.bottom>window.innerHeight-90) el.scrollIntoView({block:"center",behavior:"smooth"});
  }
}
function pFeedback(s,cls){pFb.textContent=s;pFb.className="feedback"+(cls?" "+cls:"");}
function pHint(){
  if(!P.rec) return;
  if(!P.steps.length){pFeedback("Esta partitura não tem notas para tocar"+(pMao()!=="duas"?" com essa mão":"")+".","");return;}
  if(P.done) return;
  if(!midiOn()) pFeedback("Ligue o teclado MIDI para a partitura conferir as notas. Sem ele, use os botões para andar pelos compassos.","");
  else if(P.idx===P.from&&!P.err) pFeedback("Toque as notas destacadas. A partitura avança quando você acerta todas as que começam juntas.","");
}
function pStatus(){
  var s=P.steps[Math.min(P.idx,P.steps.length-1)];
  pStatusEl.textContent=P.done?"Fim da peça":s?"Compasso "+s.mn+" de "+P.lastMn:"";
}
// O que a vez pede, do grave para o agudo: "Mi e Sol na mão direita e Dó na mão esquerda".
function pWant(s){
  var ns=s.notes.slice().sort(function(a,b){return a.k-b.k;});
  function names(l){var seen={},o=[];l.forEach(function(x){var t=cNote(x.L,x.acc);if(!seen[t]){seen[t]=1;o.push(t);}});return cList(o);}
  if(!P.two||pMao()!=="duas") return names(ns);
  var r=ns.filter(function(x){return x.st===0;}), l=ns.filter(function(x){return x.st!==0;}), out=[];
  if(r.length) out.push(names(r)+" na mão direita");
  if(l.length) out.push(names(l)+" na mão esquerda");
  return out.join(" e ");
}
// A tecla errada, dita em relação ao que a vez pede: "Lá", "Si♭" ou "o Fá♯ uma oitava abaixo".
function pDesc(k,s){
  var same=s.notes.filter(function(x){return (x.k-k)%12===0;})[0];
  if(same){
    var o=Math.round((k-same.k)/12), n=Math.abs(o);
    return "o "+cNote(same.L,same.acc)+" "+(["","uma oitava","duas oitavas","três oitavas"][n]||n+" oitavas")+(o>0?" acima":" abaixo");
  }
  var kd=midiToD(k);
  return kd!=null?nameOf(kd):cPcName(k%12,s.notes.some(function(x){return x.acc<0;}));
}
function pKey(k,t){
  if(!midiOn()||!P.rec||P.done||P.idx>=P.steps.length) return;
  var s=P.steps[P.idx];
  if(s.keys.indexOf(k)<0){
    if(!P.err){P.err=true;pPaint(P.idx);}
    pFeedback((s.keys.length>1?"Eram ":"Era ")+pWant(s)+". Você tocou "+pDesc(k,s)+".","bad");
    return;
  }
  P.got[k]=1;
  if(!s.keys.every(function(w){return P.got[w];})) return;
  if(P.t0==null) P.t0=t;
  var dt=P.lastT!=null?t-P.lastT:null; if(dt!=null&&dt>10000) dt=null;   // parada longa: o tempo não conta
  P.res[P.idx]=P.err?"bad":"ok"; P.dt[P.idx]=dt; P.lastT=t;
  var prev=P.idx; P.idx++; P.got={}; P.err=false;
  pPaint(prev);
  if(P.idx>=P.steps.length){
    P.done=true; if(P.osmd&&P.osmd.cursor) P.osmd.cursor.hide();
    pFeedback("",""); pStatus(); pResult(); return;
  }
  pPaint(P.idx); pCursor(true); pFeedback("",""); pStatus();
}
function pDur(ms){var s=Math.round(ms/1000),m=Math.floor(s/60);return m?m+" min "+(s%60)+" s":s+" s";}
function pResult(){
  var ok=0, n=0, errM={}, order=[];
  for(var i=P.from;i<P.steps.length;i++){
    if(!P.res[i]) continue;
    n++;
    if(P.res[i]==="ok"){ok++;continue;}
    var mn=P.steps[i].mn; if(!errM[mn]){errM[mn]=0;order.push(mn);} errM[mn]++;
  }
  var html='<p class="r-score">'+ok+' de '+n+' certas de primeira</p>', lines=[];
  if(P.from>0) lines.push("Do compasso "+P.steps[P.from].mn+" ao fim.");
  if(P.t0!=null&&P.lastT>P.t0) lines.push("Do primeiro ao último acerto: "+pDur(P.lastT-P.t0)+".");
  if(order.length){
    var worst=order.slice().sort(function(a,b){return errM[b]-errM[a];}).slice(0,5).sort(function(a,b){return order.indexOf(a)-order.indexOf(b);});
    var many=worst.length>1;
    lines.push((many?"Compassos com mais erros: ":"Compasso com erro: ")+cList(worst.map(String))+". Volte "+(many?"a eles":"a ele")+" com o botão ◀ Compasso e toque devagar, antes de tocar a peça inteira de novo.");
  } else lines.push("Sem erros. Na próxima, tente não parar entre uma nota e outra.");
  lines.forEach(function(s){html+='<p class="r-line">'+s+'</p>';});
  html+='<p class="r-legend"><span class="dot ok"></span>certa de primeira &nbsp; <span class="dot bad"></span>com erro. As notas que começam juntas contam como uma.</p>'
    +'<div class="r-actions"><button type="button" class="btn" id="p-again">Tocar de novo</button></div>';
  pRes.innerHTML=html; pRes.hidden=false;
  pRes.scrollIntoView({block:"nearest",behavior:"smooth"});
}
pRes.addEventListener("click",function(e){
  if(e.target.id!=="p-again") return;
  pReset(P.from);
});

/* ---------- navegar pelos compassos ---------- */
// Um grupo são as vezes seguidas do mesmo compasso (com repetições, o mesmo compasso pode voltar mais adiante).
function pGroup(i){while(i>0&&P.steps[i-1].m===P.steps[i].m)i--;return i;}
function pJump(dir){
  if(!P.steps.length) return;
  var cur=Math.min(P.idx,P.steps.length-1), g=pGroup(cur), i;
  if(dir===0) i=0;
  else if(dir<0) i=g>0?pGroup(g-1):0;
  else {i=g;while(i<P.steps.length&&P.steps[i].m===P.steps[g].m)i++;if(i>=P.steps.length)return;}
  pReset(i);
}
document.getElementById("p-ini").addEventListener("click",function(){pJump(0);});
document.getElementById("p-prev").addEventListener("click",function(){pJump(-1);});
document.getElementById("p-next").addEventListener("click",function(){pJump(1);});

/* ---------- controles ---------- */
function pControls(){
  pMaoEl.hidden=!P.two;
  document.querySelectorAll("[data-pmao]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.pmao===settings.p.mao));});
  document.querySelectorAll("[data-ptam]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.ptam===settings.p.tamanho));});
}
document.querySelectorAll("[data-pmao]").forEach(function(b){
  b.addEventListener("click",function(){
    if(settings.p.mao===b.dataset.pmao) return;
    settings.p.mao=b.dataset.pmao; saveSettings(); pControls(); pSteps();
  });
});
document.querySelectorAll("[data-ptam]").forEach(function(b){
  b.addEventListener("click",function(){
    if(settings.p.tamanho===b.dataset.ptam) return;
    settings.p.tamanho=b.dataset.ptam; saveSettings(); pControls(); pRender(); pCursor(true);
  });
});
// O teclado foi ligado ou desligado: a cor da vez e o aviso mudam.
function pMidiUI(){if(P.rec&&P.steps.length){pPaint(P.idx);pHint();}}

/* ---------- tela acesa com a partitura aberta ---------- */
function pWakeOn(){
  if(P.wake||!navigator.wakeLock) return;
  try{
    navigator.wakeLock.request("screen").then(function(w){
      if(!P.rec||settings.tab!=="partituras"){try{w.release();}catch(e){}return;}
      P.wake=w;
      w.addEventListener("release",function(){if(P.wake===w)P.wake=null;});
    }).catch(function(){});
  }catch(e){}
}
function pWakeOff(){if(P.wake){try{P.wake.release();}catch(e){}P.wake=null;}}
document.addEventListener("visibilitychange",function(){if(!document.hidden&&P.rec&&settings.tab==="partituras")pWakeOn();});
