/* Aba Partituras: abre as partituras exportadas do MuseScore (MusicXML: .mxl ou .musicxml), guarda as peças no aparelho
   e, com o teclado MIDI, espera a nota certa: a partitura avança quando você toca todas as notas que começam juntas.
   O desenho é do OpenSheetMusicDisplay (vendor/), carregado só quando uma peça abre. */
"use strict";

/* ---------- ajustes e estado ---------- */
var P_ZOOM={pequeno:0.75,medio:1,grande:1.3};
settings.p=Object.assign({mao:"duas",tamanho:"medio",ultima:null,modo:"esperar",metro:true},settings.p||{});
if(["duas","direita","esquerda"].indexOf(settings.p.mao)<0) settings.p.mao="duas";
if(settings.p.modo!=="andamento") settings.p.modo="esperar";
settings.p.metro=settings.p.metro!==false;
if(!P_ZOOM[settings.p.tamanho]) settings.p.tamanho="medio";
if(typeof settings.p.ultima!=="number") settings.p.ultima=null;

/* rec: a peça aberta. raw: cada posição do cursor da biblioteca, com as notas que começam ali.
   steps: as posições que pedem tecla, já filtradas pela mão (tecla: nota MIDI). idx: a vez. from: onde a rodada começou.
   got: teclas certas já tocadas na vez. err: houve tecla errada na vez. res/dt: resultado e tempo de cada vez.
   two: a peça tem piano (duas pautas): a de cima é a mão direita, a de baixo a esquerda.
   colored: vezes pintadas de outra cor, para voltar ao normal ao recomeçar. */
var P={osmd:null,rec:null,raw:[],steps:[],worst:[],two:false,lastMn:0,idx:0,from:0,got:{},err:false,res:[],dt:[],t0:null,lastT:null,
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
  if(!o||!P.rec||pViewEl.hidden) return;
  if(P.page) pPageFit();
  if(!pHost.clientWidth) return;
  P.col={"--staff":pCss("--staff"),"--accent":pCss("--accent"),"--ok":pCss("--ok"),"--warn":pCss("--warn"),"--bad":pCss("--bad")};
  // No modo página, páginas A4 com as quebras de linha e de página do arquivo, na escala da página do MuseScore.
  if(P.osmdPage!==P.page){
    P.osmdPage=P.page;
    o.setOptions({pageFormat:P.page?"A4_P":"Endless",newSystemFromXML:P.page,newPageFromXML:P.page,
      drawTitle:P.page,drawSubtitle:P.page,drawComposer:P.page,drawLyricist:P.page,drawCredits:P.page});
  }
  o.Zoom=P.page?pHost.clientWidth/P.pageTenths*P_PAGE_ZOOM[settings.p.tamanho]:P_ZOOM[settings.p.tamanho];
  o.render(); P.w=pHost.clientWidth;
  if(P.page) pPageLayout();
  if(!P.steps.length) return;
  if(P.done) o.cursor.hide(); else pCursor(false);
  Object.keys(P.colored).forEach(function(i){pPaint(+i);});
  pPaint(P.idx);
}
function pResize(){if(P.rec&&P.w&&pHost.clientWidth&&P.w!==pHost.clientWidth) pRender();}

/* ---------- notas da peça ---------- */
// Percorre a peça com o cursor da biblioteca e guarda, em cada posição, as notas que começam ali.
// Pausas, apojaturas, notas pequenas e notas invisíveis não pedem tecla. Numa peça com piano, só o piano conta.
// Para o andamento, cada posição guarda também: T, o instante na peça em semibreves, já com as repetições desdobradas;
// pos, o instante dentro do compasso; bpm, o andamento ali (em semínimas); len, a nota mais longa que começa ali;
// e o compasso: md (duração real, menor numa anacruse), num/den (fórmula) e impl (anacruse).
function pCollect(){
  var o=P.osmd, sh=o.Sheet, insts=sh.Instruments.filter(function(i){return i.Visible!==false;}),
    piano=insts.filter(function(i){return i.Staves.length>1;}), use=piano.length?piano:insts, bpm0=sh.DefaultStartTempoInBpm||80;
  P.two=piano.length>0; P.raw=[];
  // ni: um número por nota do desenho, o mesmo nas repetições.
  var nis=new Map();
  function pNi(n){if(!nis.has(n))nis.set(n,nis.size);return nis.get(n);}
  o.cursor.reset();
  var it=o.cursor.Iterator.clone(), guard=0;
  while(!it.EndReached&&guard++<50000){
    var notes=[], m=it.CurrentMeasureIndex, sm=sh.SourceMeasures[m], len=0, ts=sm&&sm.ActiveTimeSignature,
      et=it.CurrentEnrolledTimestamp||it.currentTimeStamp, rt=it.CurrentRelativeInMeasureTimestamp;
    it.CurrentVisibleVoiceEntries().forEach(function(ve){
      if(ve.IsGrace) return;
      ve.Notes.forEach(function(n){
        if(n.isRest()||n.IsCueNote||n.PrintObject===false||!n.ParentStaff) return;
        var inst=n.ParentStaff.ParentInstrument; if(use.indexOf(inst)<0) return;
        var k=n.halfTone+12, L=MIDI_L[n.Pitch.FundamentalNote]; if(L==null) return;
        var acc=((k-SEMI[L])%12+18)%12-6;
        if(n.Length) len=Math.max(len,n.Length.RealValue);
        notes.push({k:k,L:L,acc:acc,d:midiToD(k-acc),st:P.two?Math.min(inst.Staves.indexOf(n.ParentStaff),1):0,ni:pNi(n),
          cont:!!(n.NoteTie&&n.NoteTie.StartNote!==n),n:n});
      });
    });
    P.raw.push({ri:P.raw.length,m:m,mn:sm?sm.MeasureNumber:m+1,it:it.clone(),notes:notes,
      T:et?et.RealValue:0, pos:rt?rt.RealValue:0, bpm:it.CurrentBpm>0?it.CurrentBpm:bpm0, len:len,
      md:sm?sm.Duration.RealValue:1, num:ts?ts.Numerator:4, den:ts?ts.Denominator:4, impl:!!(sm&&sm.ImplicitMeasure)});
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
  if(!P.page) pViewEl.scrollIntoView({block:"start"});
  pWakeOn(); pPageTenths(rec);
}
function pClose(){
  if(P.page) pPageOff();
  pTHalt(); P.rec=null; P.steps=[]; P.raw=[]; P.colored={}; settings.p.ultima=null; saveSettings();
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
function pHide(){pTStop("");pWakeOff();}

/* ---------- tocar: esperar a nota certa ---------- */
// Recomeça na vez i. Serve aos dois modos: esperar a nota e no andamento.
function pReset(i){
  var old=Object.keys(P.colored);
  if(P.tm.state!=="idle") pTHalt();
  P.idx=i; P.from=i; P.got={}; P.err=false; P.res=[]; P.dt=[]; P.t0=null; P.lastT=null; P.done=false; P.colored={}; P.worst=[];
  old.forEach(function(j){pPaint(+j);});
  pPaint(i); pCursor(true); pRes.hidden=true; pStatus(); pHint(); pControls();
}
// Cor de cada vez: a atual em destaque (vermelha depois de um erro); as tocadas, verdes ou vermelhas.
// No andamento: verde no tempo, amarela um pouco fora, vermelha fora do tempo, faltando ou com tecla errada.
function pColorOf(i){
  if(pTempo()){
    if(P.res[i]) return P.res[i]==="ok"?"--ok":P.res[i]==="near"?"--warn":"--bad";
    return i===P.idx&&!P.done?"--accent":"";
  }
  if(!midiOn()) return "";
  if(i===P.idx&&!P.done) return P.err?"--bad":"--accent";
  return P.res[i]==="bad"?"--bad":P.res[i]==="ok"?"--ok":"";
}
// Numa repetição, a mesma nota do desenho é tocada mais de uma vez: ela fica com a pior cor da rodada
// (P.worst, pelo número da nota, ni). A vez atual fica em destaque por cima.
var P_RANK={"--ok":1,"--warn":2,"--bad":3}, P_BY_RANK=["--staff","--ok","--warn","--bad"];
function pPaint(i){
  var s=P.steps[i]; if(!s||!P.osmd) return;
  var v=pColorOf(i), r=P_RANK[v]||0;
  if(v) P.colored[i]=1; else delete P.colored[i];
  s.paint.forEach(function(x){if(r>(P.worst[x.ni]||0))P.worst[x.ni]=r;});
  if(!P.col) return;
  s.paint.forEach(function(x){
    var c=P.col[v==="--accent"?v:P_BY_RANK[P.worst[x.ni]||0]], g=P.osmd.EngravingRules.GNote(x.n);
    if(c&&g&&g.setColor){try{g.setColor(c);}catch(e){}}
  });
}
function pCursor(scroll){
  var o=P.osmd, s=P.steps[Math.min(P.idx,P.steps.length-1)];
  if(!o||!s||!o.cursor) return;
  o.cursor.show(); o.cursor.iterator=s.it.clone(); o.cursor.update();
  var el=o.cursor.cursorElement;
  if(P.page){pPageView();return;}
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
  if(pTempo()){
    if(P.tm.state!=="idle") return;
    pFeedback(midiOn()?"Toque a primeira nota para começar no andamento, ou toque em “Começar” para ter um compasso de contagem."
      :"Toque em “Começar”: depois de um compasso de contagem, o cursor anda no andamento. Com o teclado MIDI, o app também confere cada nota no tempo.","");
    return;
  }
  if(!midiOn()) pFeedback("Ligue o teclado MIDI para a partitura conferir as notas. Sem ele, use os botões para andar pelos compassos.","");
  else if(P.idx===P.from&&!P.err) pFeedback("Toque as notas destacadas. A partitura avança quando você acerta todas as que começam juntas.","");
}
// rel: no andamento, o instante atual em ms contado da primeira nota (negativo na contagem).
function pStatus(rel){
  var s=P.steps[Math.min(P.idx,P.steps.length-1)], T=P.tm, txt;
  if(P.done) txt="Fim da peça";
  else if(T.state==="starting") txt="Preparando…";
  else if(T.state==="run"&&rel<-20){
    var c=0; for(var j=0;j<T.beats.length&&T.beats[j].count;j++) if(T.beats[j].rel-T.lat<=rel) c++;
    txt=c?"Contagem: "+c:"Prepare-se";
  }
  else txt=s?"Compasso "+s.mn+" de "+P.lastMn:"";
  if(pStatusEl.textContent!==txt) pStatusEl.textContent=txt;
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
  if(!midiOn()||!P.rec||!P.steps.length) return;
  if(pTempo()){pTKey(k,t);return;}
  if(P.done||P.idx>=P.steps.length) return;
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
  if(P.t0!=null&&P.lastT-P.t0>=1000) lines.push("Do primeiro ao último acerto: "+pDur(P.lastT-P.t0)+".");
  if(order.length){
    var worst=order.slice().sort(function(a,b){return errM[b]-errM[a];}).slice(0,5).sort(function(a,b){return a-b;});
    var many=worst.length>1;
    lines.push((many?"Compassos com mais erros: ":"Compasso com erro: ")+cList(worst.map(String))+". Volte "+(many?"a eles":"a ele")+" com o botão ◀ Compasso e toque devagar, antes de tocar a peça inteira de novo.");
  } else lines.push("Sem erros. Na próxima, tente não parar entre uma nota e outra.");
  lines.forEach(function(s){html+='<p class="r-line">'+s+'</p>';});
  html+='<p class="r-legend"><span class="dot ok"></span>certa de primeira &nbsp; <span class="dot bad"></span>com erro. As notas que começam juntas contam como uma.</p>'
    +'<div class="r-actions"><button type="button" class="btn" id="p-again">Tocar de novo</button><button type="button" class="btn alt" id="p-res-close">Fechar</button></div>';
  pRes.innerHTML=html; pRes.hidden=false;
  pRes.scrollIntoView({block:"nearest",behavior:"smooth"});
}
pRes.addEventListener("click",function(e){
  if(e.target.id==="p-res-close") pRes.hidden=true;
  else if(e.target.id==="p-again") pReset(P.from);
});

/* ---------- tocar no andamento ---------- */
/* A peça anda sozinha no andamento. Ela começa na primeira nota que você toca, ou depois de um compasso de contagem
   no botão "Começar". Cada tecla é conferida no instante em que a nota devia soar, com as mesmas medidas do Ritmo:
   até good ms é no tempo, até near ms é um pouco adiantada ou atrasada, e até win ms (metade da distância às vezes
   vizinhas) ainda é a tecla daquela vez, mas fora do tempo.
   anchor: o instante (performance.now) em que a primeira nota da rodada devia soar. lat: a calibração do teclado,
   feita no Ritmo; os cliques saem lat ms antes, porque o seu toque chega lat ms depois. rel[i]: o tempo da vez i em ms,
   contado da primeira. hit[i][tecla]: o desvio de cada tecla certa. wrong[i]: teclas erradas perto da vez i.
   fin: a primeira vez ainda aberta. beats: os cliques (count: da contagem, antes da primeira nota). ci: o próximo a agendar. */
P.tm={state:"idle",anchor:0,lat:0,rel:[],win:[],near:[],good:[],hit:[],wrong:[],fin:0,end:0,beats:[],ci:0,bus:null,raf:0};
function pTempo(){return settings.p.modo==="andamento";}
function pFileBpm(){var b=P.raw.length&&P.raw[0].bpm;return b>0?b:80;}
function pBpm(){return P.rec&&P.rec.bpm||Math.round(pFileBpm());}
// fac: quanto cada trecho fica mais lento (>1) ou mais rápido (<1) que na partitura.
function pFac(){return P.rec&&P.rec.bpm?pFileBpm()/P.rec.bpm:1;}
// O tempo de cada posição em ms desde o começo da peça, com o andamento de cada trecho.
function pTimeline(raw,fac){
  var ms=[], acc=0;
  for(var i=0;i<raw.length;i++){ms.push(acc);if(i+1<raw.length)acc+=(raw[i+1].T-raw[i].T)*240000/raw[i].bpm*fac;}
  return ms;
}
// Os compassos na ordem em que são tocados (com repetições), a partir das posições: S é o início, em semibreves.
function pBars(raw){
  var bars=[];
  raw.forEach(function(r){
    var S=r.T-r.pos, b=bars[bars.length-1];
    if(!b||Math.abs(b.S-S)>1e-6) bars.push({S:S,D:r.md,num:r.num,den:r.den,impl:r.impl,ri:r.ri});
  });
  return bars;
}
// Os tempos de um compasso: em 6/8, 9/8 e 12/8, a semínima pontuada; nos outros, a unidade da fórmula.
// off: numa anacruse, os tempos que faltam antes dela, para o 1º tempo do compasso seguinte cair no acento.
function pBarBeats(b){
  var bl=b.den===8&&b.num%3===0&&b.num>3?3/8:1/b.den, nom=b.num/b.den;
  return {bl:bl,nom:nom,per:Math.max(1,Math.round(nom/bl)),off:b.impl&&b.D<nom-1e-6?Math.round((nom-b.D)/bl):0};
}
// Os cliques da rodada que começa na vez from, em ms contados da primeira nota: um compasso de contagem e os tempos
// do compasso antes da primeira nota (count), depois o metrônomo até o fim. acc: o 1º tempo do compasso.
function pBeats(raw,ms,fac,steps,from){
  var r0=raw[steps[from].ri], T0=r0.T, m0=ms[r0.ri], bars=pBars(raw), bi=0, out=[], k, j=r0.ri;
  while(bi+1<bars.length&&bars[bi+1].ri<=r0.ri) bi++;
  var bf=bars[bi], g=pBarBeats(bf), W=240000/r0.bpm*fac, V=bf.S-g.off*g.bl;
  function before(T){return -(T0-T)*W;}
  function msAt(T){while(j+1<raw.length&&raw[j+1].T<=T+1e-9)j++;return ms[j]+(T-raw[j].T)*240000/raw[j].bpm*fac-m0;}
  for(k=0;k<g.per;k++) out.push({rel:before(V-g.nom+k*g.bl),acc:k===0,count:true});
  for(k=0;k<g.off;k++) out.push({rel:before(V+k*g.bl),acc:k===0,count:true});
  for(var b=bi;b<bars.length;b++){
    var B=bars[b], gb=pBarBeats(B);
    for(k=0;k*gb.bl<B.D-1e-6;k++){
      var T=B.S+k*gb.bl, acc=(k+gb.off)%gb.per===0;
      if(T<T0-1e-6){if(b===bi)out.push({rel:before(T),acc:acc,count:true});continue;}
      out.push({rel:msAt(T),acc:acc,count:false});
    }
  }
  return out;
}
// Prepara a rodada que começa na vez from: o tempo e as janelas de cada vez, o fim e os cliques.
function pTPlan(from){
  var T=P.tm, fac=pFac(), ms=pTimeline(P.raw,fac), n=P.steps.length, m0=ms[P.steps[from].ri], i;
  T.rel=[]; T.win=[]; T.near=[]; T.good=[]; T.hit=[]; T.wrong=[];
  for(i=0;i<n;i++){T.rel.push(ms[P.steps[i].ri]-m0);T.hit.push({});T.wrong.push(0);}
  for(i=0;i<n;i++){
    var h=0.5*Math.min(i>from?T.rel[i]-T.rel[i-1]:Infinity,i<n-1?T.rel[i+1]-T.rel[i]:Infinity);
    T.win.push(Math.min(1000,h)); T.near.push(Math.min(180,h)); T.good.push(Math.min(60,0.5*Math.min(180,h)));
  }
  // A rodada acaba depois da última vez: o que durar mais entre a janela dela e a nota mais longa (até 2 s).
  var last=P.raw[P.steps[n-1].ri];
  T.end=T.rel[n-1]+Math.max(T.win[n-1],Math.min(2000,(last.len||0.25)*240000/last.bpm*fac));
  T.beats=pBeats(P.raw,ms,fac,P.steps,from); T.ci=0; T.fin=from;
}
function pLat(){return midiOn()?rLatOf(true):0;}
// Liga o som do metrônomo, se o navegador deixar. Chamada também nos toques da tela, que liberam o som.
function pTBus(){
  var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null;
  try{
    actx=actx||new AC(); if(actx.state==="suspended") actx.resume();
    if(!P.tm.bus&&P.tm.state!=="idle"){var g=actx.createGain();g.connect(actx.destination);P.tm.bus=g;}
  }catch(e){return null;}
  return actx;
}
// A primeira nota começa a rodada: a contagem não toca, e o metrônomo entra no tempo seguinte.
function pTStartNote(t){
  var T=P.tm;
  pTPlan(P.from); T.lat=pLat(); T.anchor=t; T.state="run";
  while(T.ci<T.beats.length&&T.beats[T.ci].rel<=30) T.ci++;
  if(settings.p.metro) pTBus();
  pTRun();
}
// Botão Começar (com um compasso de contagem) ou Parar.
function pTGo(){
  var T=P.tm;
  if(T.state!=="idle"){pTStop("");return;}
  if(!P.steps.length) return;
  if(P.done) pReset(P.from);
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){pFeedback("Este navegador não consegue tocar a contagem.","bad");return;}
  actx=actx||new AC();
  var ctx=actx;
  T.state="starting"; pControls(); pStatus();
  Promise.resolve(ctx.state==="suspended"?ctx.resume():null).then(function(){
    if(T.state!=="starting") return;
    pTPlan(P.from); T.lat=pLat(); T.state="run"; pTBus();
    // O primeiro clique da contagem soa daqui a 0,35 s; a primeira nota cai no seu lugar depois dele.
    T.anchor=rPerfAt(ctx,ctx.currentTime+0.35)-T.beats[0].rel+T.lat;
    pTRun();
  }).catch(function(){T.state="idle";pControls();pFeedback("Não foi possível ligar o som. Toque em “Começar” de novo.","bad");});
}
function pTRun(){pControls();pFeedback(midiOn()?"":"Sem o teclado MIDI, o cursor anda no andamento, mas o app não confere as notas.","");pTTick();}
// Agenda os cliques do próximo 1,5 s no relógio de áudio. Sem o metrônomo, só a contagem toca.
function pTClicks(now){
  var T=P.tm, ctx=actx;
  if(!ctx||!T.bus||ctx.state!=="running") return;
  while(T.ci<T.beats.length){
    var b=T.beats[T.ci], perf=T.anchor+b.rel-T.lat;
    if(perf>now+1500) break;
    T.ci++;
    if(!b.count&&!settings.p.metro) continue;
    var at=rCtxAt(ctx,perf);
    if(at>ctx.currentTime+0.005) rClick(ctx,T.bus,at,b.acc);
  }
}
function pTTick(){
  var T=P.tm; if(T.state!=="run") return;
  var now=performance.now(), rel=now-T.anchor, n=P.steps.length, c=P.idx;
  pTClicks(now);
  // O cursor passa para a vez seguinte um pouco antes do tempo dela, para os olhos chegarem antes da mão.
  while(c+1<n&&T.rel[c+1]<=rel+40) c++;
  if(c!==P.idx){var old=P.idx;P.idx=c;pPaint(old);pPaint(c);pCursor(true);}
  while(T.fin<n&&rel>T.rel[T.fin]+T.win[T.fin]){pTJudge(T.fin,true);T.fin++;}
  pStatus(rel);
  if(rel>T.end){pTFinish();return;}
  T.raf=requestAnimationFrame(pTTick);
}
// Classe da vez i: "ok", "near" ou "bad"; null enquanto ela ainda espera teclas. closed: a janela dela já passou.
function pTClass(i,closed){
  var T=P.tm, s=P.steps[i], c="ok";
  if(T.wrong[i]) return "bad";
  for(var j=0;j<s.keys.length;j++){
    var d=T.hit[i][s.keys[j]];
    if(d==null){if(closed)return "bad";c=null;continue;}
    var a=Math.abs(d);
    if(a>T.near[i]) return "bad";
    if(a>T.good[i]&&c) c="near";
  }
  return c;
}
function pTJudge(i,closed){
  if(!midiOn()) return;
  var c=pTClass(i,closed);
  if(c&&c!==P.res[i]){P.res[i]=c;pPaint(i);}
}
function pTKey(k,t){
  var T=P.tm;
  if(T.state==="idle"){
    if(P.done) return;
    var s=P.steps[P.idx];
    if(s.keys.indexOf(k)<0){pFeedback((P.from>0?"Este trecho":"A peça")+" começa com "+pWant(s)+". Você tocou "+pDesc(k,s)+".","bad");return;}
    pTStartNote(t);
  }
  if(T.state==="run") pTHit(k,t);
}
// Uma tecla na rodada: vai para a vez aberta mais perto no tempo que pede essa tecla e ainda não a recebeu.
// Se nenhuma pede, é tecla errada, e conta na vez mais perto. Na contagem e depois do fim, não conta.
function pTHit(k,t){
  var T=P.tm, n=P.steps.length, rel=t-T.anchor, best=-1, bd=Infinity, i;
  if(rel<T.rel[P.from]-T.win[P.from]||rel>T.end) return;
  for(i=T.fin;i<n&&T.rel[i]-T.win[i]<=rel;i++){
    if(rel>T.rel[i]+T.win[i]||P.steps[i].keys.indexOf(k)<0||T.hit[i][k]!=null) continue;
    var d=Math.abs(rel-T.rel[i]); if(d<bd){bd=d;best=i;}
  }
  if(best>=0){T.hit[best][k]=rel-T.rel[best];pTJudge(best,false);return;}
  for(i=Math.max(P.from,P.idx-4);i<=Math.min(n-1,P.idx+4);i++){var e=Math.abs(rel-T.rel[i]);if(e<bd){bd=e;best=i;}}
  if(best>=0){T.wrong[best]++;pTJudge(best,best<T.fin);}
}
// Para o relógio e o som, sem mexer no resultado.
function pTHalt(){
  var T=P.tm;
  cancelAnimationFrame(T.raf); T.state="idle";
  if(T.bus){try{T.bus.disconnect();}catch(e){}T.bus=null;}
}
function pTStop(msg){
  if(P.tm.state==="idle") return;
  pTHalt(); pReset(P.from);
  if(msg) pFeedback(msg,"");
}
function pTFinish(){
  var T=P.tm, n=P.steps.length;
  while(T.fin<n){pTJudge(T.fin,true);T.fin++;}
  pTHalt(); P.done=true;
  if(P.osmd&&P.osmd.cursor) P.osmd.cursor.hide();
  pPaint(P.idx); pStatus(); pControls();
  if(midiOn()) pTResult();
  else pFeedback("Fim da peça. Com o teclado MIDI ligado, o app confere cada nota no tempo.","");
}
function pPl(n,s,p){return n+" "+(n===1?s:p);}
// Resultado da rodada no andamento: notas no tempo, o que saiu fora e os compassos que pedem treino.
function pTResult(){
  var T=P.tm, n=P.steps.length, tot=0, ok=0, early=0, late=0, off=0, miss=0, wrong=0, devs=[], prob={}, order=[];
  for(var i=P.from;i<n;i++){
    var s=P.steps[i], pr=0;
    s.keys.forEach(function(k){
      tot++;
      var d=T.hit[i][k];
      if(d==null){miss++;pr++;return;}
      if(!(i===P.from&&d===0)) devs.push(d);   // a nota que começou a rodada marca o tempo: não tem desvio
      var a=Math.abs(d);
      if(a<=T.good[i]) ok++;
      else if(a<=T.near[i]){if(d<0)early++;else late++;pr+=0.5;}
      else {off++;pr++;}
    });
    wrong+=T.wrong[i]; pr+=T.wrong[i];
    if(pr>0){if(prob[s.mn]==null){prob[s.mn]=0;order.push(s.mn);}prob[s.mn]+=pr;}
  }
  var html='<p class="r-score">'+ok+' de '+tot+' notas no tempo</p>', lines=[], parts=[];
  lines.push("A "+pBpm()+" bpm"+(P.from>0?", do compasso "+P.steps[P.from].mn+" ao fim":"")+".");
  if(early) parts.push(pPl(early,"um pouco adiantada","um pouco adiantadas"));
  if(late) parts.push(pPl(late,"um pouco atrasada","um pouco atrasadas"));
  if(off) parts.push(pPl(off,"fora do tempo","fora do tempo"));
  if(miss) parts.push(pPl(miss,"que faltou","que faltaram"));
  if(wrong) parts.push(pPl(wrong,"tecla errada","teclas erradas"));
  if(parts.length) lines.push("Além delas: "+cList(parts)+".");
  var med=devs.length>=4?median(devs):0;
  if(Math.abs(med)>=25) lines.push("No geral, você "+(med<0?"adiantou":"atrasou")+" cerca de "+Math.round(Math.abs(med))+" ms.");
  if(order.length){
    var worst=order.slice().sort(function(a,b){return prob[b]-prob[a];}).slice(0,5).sort(function(a,b){return a-b;});
    lines.push((worst.length>1?"Compassos para treinar: ":"Compasso para treinar: ")+cList(worst.map(String))+".");
  }
  var r=tot?ok/tot:0;
  lines.push(r>=0.9&&!miss&&!wrong?"Quase tudo no tempo: experimente subir 5 bpm."
    :r<0.6?"Baixe o andamento uns 10 bpm e toque de novo; depois suba aos poucos."
    :"Toque devagar os compassos marcados, no modo Esperar a nota, e depois a peça de novo neste andamento.");
  if(!settings.r.calMidi) lines.push("Para a medida do tempo descontar o atraso do teclado, calibre-o uma vez na aba Ritmo, tocando no piano.");
  lines.forEach(function(x){html+='<p class="r-line">'+x+'</p>';});
  html+='<p class="r-legend"><span class="dot ok"></span>no tempo &nbsp; <span class="dot near"></span>um pouco fora &nbsp; <span class="dot bad"></span>fora do tempo, faltou ou tecla errada.</p>'
    +'<div class="r-actions"><button type="button" class="btn" id="p-again">Tocar de novo</button><button type="button" class="btn alt" id="p-res-close">Fechar</button></div>';
  pRes.innerHTML=html; pRes.hidden=false;
  pRes.scrollIntoView({block:"nearest",behavior:"smooth"});
}

/* ---------- navegar pelos compassos ---------- */
// Um grupo são as vezes seguidas do mesmo compasso (com repetições, o mesmo compasso pode voltar mais adiante).
function pGroup(i){while(i>0&&P.steps[i-1].m===P.steps[i].m)i--;return i;}
function pJump(dir){
  if(!P.steps.length) return;
  if(P.tm.state!=="idle") pTHalt();
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
var pBpmEl=document.getElementById("p-bpm"), pGoEl=document.getElementById("p-go");
function pControls(){
  var tempo=pTempo(), run=P.tm.state!=="idle";
  pMaoEl.hidden=!P.two;
  document.querySelectorAll("[data-pmodo]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.pmodo===settings.p.modo));b.disabled=run;});
  document.querySelectorAll("[data-pmao]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.pmao===settings.p.mao));b.disabled=run;});
  document.querySelectorAll("[data-ptam]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.ptam===settings.p.tamanho));});
  document.getElementById("p-tempo").hidden=!tempo;
  pGoEl.hidden=!tempo||!P.steps.length; pGoEl.textContent=run?"Parar":"Começar"; pGoEl.className="btn"+(run?" alt":"");
  document.getElementById("p-exit").hidden=!P.page;
  if(!P.raw.length) return;
  var bpm=pBpm(), orig=Math.round(pFileBpm()), changes=P.raw.some(function(r){return Math.abs(r.bpm-P.raw[0].bpm)>0.5;});
  pBpmEl.value=bpm; document.getElementById("p-bpm-val").textContent=bpm;
  [pBpmEl,document.getElementById("p-bpm-down"),document.getElementById("p-bpm-up")].forEach(function(el){el.disabled=run;});
  document.getElementById("p-orig").innerHTML=(bpm!==orig?'na partitura: '+orig+' · <button type="button" class="txtbtn" id="p-bpm-orig">voltar</button>':'como na partitura')
    +(changes?'. As mudanças de andamento da peça mantêm a proporção.':'');
  var sw=document.getElementById("sw-pmetro"); sw.setAttribute("aria-checked",String(settings.p.metro));
}
document.querySelectorAll("[data-pmodo]").forEach(function(b){
  b.addEventListener("click",function(){
    if(settings.p.modo===b.dataset.pmodo) return;
    settings.p.modo=b.dataset.pmodo; saveSettings();
    if(P.rec&&P.steps.length) pReset(pGroup(Math.min(P.idx,P.steps.length-1))); else pControls();
    if(pTempo()) pTBus();   // o toque no botão deixa o som do metrônomo pronto
  });
});
document.querySelectorAll("[data-pmao]").forEach(function(b){
  b.addEventListener("click",function(){
    if(settings.p.mao===b.dataset.pmao) return;
    settings.p.mao=b.dataset.pmao; saveSettings(); pControls(); pSteps();
  });
});
// Andamento da peça aberta: guardado com ela; null é o da partitura.
function pSetBpm(v,save){
  if(!P.rec||!P.raw.length) return;
  v=clamp(Math.round(v),20,240);
  P.rec.bpm=v===Math.round(pFileBpm())?null:v;
  pControls();
  if(save&&P.rec.id) pPut(P.rec).catch(function(){});
}
pBpmEl.addEventListener("input",function(){pSetBpm(+pBpmEl.value,false);});
pBpmEl.addEventListener("change",function(){pSetBpm(+pBpmEl.value,true);});
document.getElementById("p-bpm-down").addEventListener("click",function(){pSetBpm(pBpm()-5,true);});
document.getElementById("p-bpm-up").addEventListener("click",function(){pSetBpm(pBpm()+5,true);});
document.getElementById("p-orig").addEventListener("click",function(e){if(e.target.id==="p-bpm-orig")pSetBpm(pFileBpm(),true);});
document.getElementById("sw-pmetro").addEventListener("click",function(){
  settings.p.metro=!settings.p.metro; saveSettings(); pControls();
  if(settings.p.metro) pTBus();
});
pGoEl.addEventListener("click",pTGo);
document.querySelectorAll("[data-ptam]").forEach(function(b){
  b.addEventListener("click",function(){
    if(settings.p.tamanho===b.dataset.ptam) return;
    settings.p.tamanho=b.dataset.ptam; saveSettings(); pControls(); pRender(); pCursor(true);
  });
});
// O teclado foi ligado ou desligado: a cor da vez e o aviso mudam.
function pMidiUI(){if(P.rec&&P.steps.length){pPaint(P.idx);pHint();}}

/* ---------- modo página ---------- */
/* Tela cheia com o tablet em pé: a peça em páginas A4, uma por tela, com as quebras de linha e de página do arquivo e
   o título, como a página impressa. A página vira pela metade: quando o cursor passa da divisa entre linhas mais perto
   do meio (split), a metade de cima já mostra as primeiras linhas da página seguinte, até a última divisa dela que cabe
   acima do split (top). Assim a próxima linha está sempre à vista.
   pageTenths: a largura da página do MuseScore em décimos de espaço da pauta (A4 com a pauta padrão: 1190,88), que dá a
   escala. pl: por página, as faixas das linhas [cima, baixo] em px. pH: a altura da página. pg/pgY: a página e a altura
   do cursor, guardadas para quando ele some no fim. */
var P_A4=297/210, P_PAGE_ZOOM={pequeno:0.85,medio:1,grande:1.2};
P.page=false; P.osmdPage=false; P.pageTenths=1190.88; P.pl=[]; P.pH=0; P.pg=0; P.pgY=0;
// Num .musicxml, a largura da página vem no próprio texto; num .mxl (compactado), fica a do padrão.
function pPageTenths(rec){
  P.pageTenths=1190.88;
  if(!rec||!rec.arquivo||!rec.arquivo.slice) return;
  rec.arquivo.slice(0,200000).text().then(function(t){
    if(P.rec!==rec||t.slice(0,2)==="PK") return;
    var m=/<page-width>\s*([\d.]+)\s*</.exec(t), v=m&&parseFloat(m[1]);
    if(v>300&&v<5000&&Math.abs(v-P.pageTenths)>1){P.pageTenths=v;if(P.page)pRender();}
  }).catch(function(){});
}
// A divisa entre linhas mais perto do meio da página, em px; null com menos de duas linhas.
function pPageSplit(bands,H){
  var best=null, bd=Infinity;
  for(var i=0;i+1<bands.length;i++){var b=(bands[i][1]+bands[i+1][0])/2, d=Math.abs(b-H/2);if(d<bd){bd=d;best=b;}}
  return best;
}
// Até onde a página seguinte aparece em cima: depois da última linha dela que termina acima do split; null se nenhuma cabe.
function pPageTopCut(bands,split){
  var c=null;
  for(var i=0;i<bands.length&&bands[i][1]<=split;i++) c=i+1<bands.length?Math.min(split,(bands[i][1]+bands[i+1][0])/2):split;
  return c;
}
// O tamanho da página: a largura da tela, ou menos, para a página inteira caber acima da barra.
function pPageFit(){
  var foot=pViewEl.querySelector(".p-foot"), fh=foot?foot.offsetHeight:90,
    w=Math.floor(Math.min(window.innerWidth,(window.innerHeight-fh-6)/P_A4));
  pHost.style.width=w+"px"; pHost.style.height=Math.ceil(w*P_A4)+"px";
}
function pPageLayout(){
  var o=P.osmd, u=10*o.Zoom, gs=o.GraphicSheet;
  P.pH=pHost.clientWidth*P_A4;
  P.pl=(gs&&gs.MusicPages||[]).map(function(pg){
    return {bands:pg.MusicSystems.map(function(s){var ps=s.PositionAndShape,y=ps.AbsolutePosition.y;return [(y+ps.BorderTop)*u,(y+ps.BorderBottom)*u];})};
  });
}
// Mostra a página do cursor, ou a metade de baixo dela com o começo da seguinte em cima.
function pPageView(){
  var o=P.osmd, els=pHost.querySelectorAll('[id^="osmdCanvasPage"]');
  if(!o||!els.length) return;
  var cur=o.cursor&&o.cursor.cursorElement;
  if(cur&&!o.cursor.Hidden&&cur.parentNode){
    var m=/osmdCanvasPage(\d+)/.exec(cur.parentNode.id||"");
    if(m) P.pg=+m[1]-1;
    P.pgY=(parseFloat(cur.style.top)||0)+(parseFloat(cur.style.height)||0)/2;
  }
  var n=Math.min(P.pg,els.length-1), pl=P.pl[n], split=pl?pPageSplit(pl.bands,P.pH):null, nx=P.pl[n+1],
    top=nx&&split!=null?pPageTopCut(nx.bands,split):null, half=top!=null&&P.pgY>split;
  for(var i=0;i<els.length;i++){
    var el=els[i];
    el.style.display=i===n||(half&&i===n+1)?"":"none";
    el.style.clipPath=half&&i===n?"inset("+split+"px 0 0 0)":half&&i===n+1?"inset(0 0 "+Math.max(0,P.pH-top)+"px 0)":"";
  }
  var ln=document.getElementById("p-split");
  if(!ln){ln=document.createElement("div");ln.id="p-split";ln.className="p-split";pHost.appendChild(ln);}
  ln.hidden=!half; if(half) ln.style.top=split+"px";
}
function pPageOn(){
  if(P.page||!P.rec) return;
  P.page=true; P.pg=0; P.pgY=0;
  document.documentElement.classList.add("p-paging"); pViewEl.classList.add("p-page");
  var de=document.documentElement, rq=de.requestFullscreen||de.webkitRequestFullscreen;
  if(rq){
    try{
      var pr=rq.call(de);
      // Em tela cheia, o Chrome deixa travar o tablet em pé, para ele não girar na estante.
      if(pr&&pr.then) pr.then(function(){try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock("portrait").catch(function(){});}catch(e){}}).catch(function(){});
    }catch(e){}
  }
  pControls(); pRender(); pCursor(false);
}
function pPageOff(){
  if(!P.page) return;
  P.page=false;
  document.documentElement.classList.remove("p-paging"); pViewEl.classList.remove("p-page");
  pHost.style.width=""; pHost.style.height="";
  var ln=document.getElementById("p-split"); if(ln) ln.hidden=true;
  try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();}catch(e){}
  if(document.fullscreenElement||document.webkitFullscreenElement){try{(document.exitFullscreen||document.webkitExitFullscreen).call(document);}catch(e){}}
  pControls(); pRender(); pCursor(true);
}
document.getElementById("p-page").addEventListener("click",pPageOn);
document.getElementById("p-exit").addEventListener("click",pPageOff);
// O gesto de voltar do Android (ou o Esc) sai da tela cheia; o modo página sai junto.
document.addEventListener("fullscreenchange",function(){if(!document.fullscreenElement&&P.page)pPageOff();});
document.addEventListener("webkitfullscreenchange",function(){if(!document.webkitFullscreenElement&&P.page)pPageOff();});
// O tablet girou ou a janela mudou: a página volta a caber na tela.
window.addEventListener("resize",function(){
  if(!P.page||!P.rec) return;
  var w=pHost.clientWidth; pPageFit();
  if(pHost.clientWidth!==w) pRender();
});

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
document.addEventListener("visibilitychange",function(){
  if(document.hidden){if(P.tm.state!=="idle")pTStop("O app saiu da tela e a peça parou. Toque a primeira nota ou “Começar” para recomeçar.");}
  else if(P.rec&&settings.tab==="partituras") pWakeOn();
});
