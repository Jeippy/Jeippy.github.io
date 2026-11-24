/* Aba Ritmo: geração dos exercícios, desenho, metrônomo, toques (tela, teclado do computador ou piano), avaliação e calibração. */
"use strict";

/* ---------- ritmo ---------- */
// Durações em semicolcheias: semibreve 16, mínima 8, semínima 4 (um tempo), colcheia 2, semicolcheia 1.
var RFIGS=[
  {id:"semibreve",label:"Semibreve"},
  {id:"minpont",label:"Mínima pontuada"},
  {id:"minima",label:"Mínima"},
  {id:"pontcol",label:"Semínima pontuada e colcheia"},
  {id:"seminima",label:"Semínima",locked:true},
  {id:"colcheias",label:"Colcheias"},
  {id:"semicol",label:"Semicolcheias"},
  {id:"pausas",label:"Pausas"}
];
var LV1=["seminima","minima","semibreve"], LV2=LV1.concat(["minpont","pausas"]), LV3=LV2.concat(["colcheias"]), LV4=LV3.concat(["pontcol"]), LV5=LV4.concat(["semicol"]);
var RLEVELS=[
  {figs:LV1,desc:"Nível 1: semínimas, mínimas e semibreves. Um toque no começo de cada nota, contando os tempos que ela dura."},
  {figs:LV2,desc:"Nível 2: entram a mínima pontuada, que dura 3 tempos, e as pausas, que são tempos sem tocar."},
  {figs:LV3,desc:"Nível 3: entram as colcheias, dois toques dentro de um tempo."},
  {figs:LV4,desc:"Nível 4: entra a semínima pontuada seguida de colcheia, um ritmo que ocupa dois tempos."},
  {figs:LV5,desc:"Nível 5: entram as semicolcheias, quatro toques dentro de um tempo."}
];
// Células de ritmo. ev = [duração, 1 se pausa]; beats = tempos ocupados; even = começa em tempo ímpar só no 3/4; start0 = só no 1º tempo.
var CELLS=[
  {beats:1,ev:[[4]],need:[],w:3},
  {beats:1,ev:[[4,1]],need:["pausas"],w:0.9},
  {beats:1,ev:[[2],[2]],need:["colcheias"],w:2.2},
  {beats:1,ev:[[2,1],[2]],need:["colcheias","pausas"],w:0.7},
  {beats:1,ev:[[2],[2,1]],need:["colcheias","pausas"],w:0.4},
  {beats:1,ev:[[1],[1],[1],[1]],need:["semicol"],w:1},
  {beats:1,ev:[[2],[1],[1]],need:["semicol","colcheias"],w:0.8},
  {beats:1,ev:[[1],[1],[2]],need:["semicol","colcheias"],w:0.8},
  {beats:2,ev:[[8]],need:["minima"],w:2,even:true},
  {beats:2,ev:[[8,1]],need:["minima","pausas"],w:0.4,even:true},
  {beats:2,ev:[[6],[2]],need:["pontcol"],w:1.3,even:true},
  {beats:3,ev:[[12]],need:["minpont"],w:1.2,start0:true},
  {beats:4,ev:[[16]],need:["semibreve"],w:0.9,start0:true}
];
CELLS.forEach(function(c){c.rest=c.ev.some(function(e){return !!e[1];});});
var R_COUNTS=[2,4,8,12,16];

// latency/calibrated: atraso do toque na tela; latMidi/calMidi: do teclado MIDI, que é bem menor.
settings.r=Object.assign({meter:4,bpm:70,figs:LV1.slice(),metro:"sempre",latency:0,calibrated:false,latMidi:0,calMidi:false,cursor:false,hands:"uma",measures:4,view:"pagina",mode:"bater",start:"toque",tapSound:true},settings.r||{});
(function(r){
  if([2,3,4].indexOf(r.meter)<0) r.meter=4;
  r.bpm=clamp(Math.round(+r.bpm||70),40,160);
  if(!Array.isArray(r.figs)) r.figs=LV1.slice();
  r.figs=r.figs.filter(function(x){return RFIGS.some(function(fg){return fg.id===x;});});
  if(r.figs.indexOf("seminima")<0) r.figs.push("seminima");
  if(r.metro!=="contagem") r.metro="sempre";
  r.latency=clamp(Math.round(+r.latency||0),-150,400);
  r.latMidi=clamp(Math.round(+r.latMidi||0),-150,400);
  r.calMidi=r.calMidi===true;
  r.cursor=r.cursor===true;
  if(r.hands!=="duas") r.hands="uma";
  r.measures=R_COUNTS.indexOf(+r.measures)>=0?+r.measures:4;
  if(r.view!=="rolando") r.view="pagina";
  if(r.mode!=="segurar") r.mode="bater";
  if(r.start!=="contagem") r.start="toque";
  r.tapSound=r.tapSound!==false;
})(settings.r);

// anchor: instante do primeiro toque, que marca o início do exercício e serve de referência para os outros.
// midi: o teclado MIDI estava ligado ao começar, então vale a calibração dele.
var R={ex:null,state:"idle",kind:"ex",auto:false,midi:false,taps:[],active:{},result:null,msg:"",startPerf:0,countPerf:0,anchor:null,beatMs:0,totalMs:0,meter:4,bus:null,raf:0,L:null,wake:null};
function rCalOf(midi){return midi?settings.r.calMidi:settings.r.calibrated;}
function rLatOf(midi){return rCalOf(midi)?(midi?settings.r.latMidi:settings.r.latency):0;}
var rHost=document.getElementById("r-host"), rGo=document.getElementById("r-go"), rResult=document.getElementById("r-result");
var rNum=document.getElementById("r-num"), rLbl=document.getElementById("r-lbl");
var rPads={R:document.getElementById("r-pad"),L:document.getElementById("r-pad-l")};
function rTwo(){return settings.r.hands==="duas";}
function rHold(){return settings.r.mode==="segurar";}

function rGenerate(){
  var meter=settings.r.meter, figs=settings.r.figs, ms=[];
  for(var m=0;m<settings.r.measures;m++){
    var b=0, evs=[], rests=0;
    while(b<meter){
      var cands=CELLS.filter(function(c){
        if(c.beats>meter-b) return false;
        if(!c.need.every(function(x){return figs.indexOf(x)>=0;})) return false;
        if(c.start0&&b!==0) return false;
        if(c.even&&meter!==3&&b%2!==0) return false;
        if(c.rest&&(rests>=1||(m===0&&b===0))) return false;   // no máximo uma pausa por compasso; nunca no começo
        return true;
      });
      var c=weighted(cands,cands.map(function(x){return x.w;})), pos=b*4;
      c.ev.forEach(function(e){evs.push({pos:pos,dur:e[0],rest:!!e[1]});pos+=e[0];});
      if(c.rest) rests++;
      b+=c.beats;
    }
    ms.push(evs);
  }
  R.ex={meter:meter,measures:ms};
}
// Linhas de um compasso: R = ritmo (mão direita); L = pulso da mão esquerda, uma semínima por tempo.
function rLines(mi){
  var o={R:R.ex.measures[mi]};
  if(rTwo()){o.L=[];for(var b=0;b<R.ex.meter;b++)o.L.push({pos:b*4,dur:4,rest:false});}
  return o;
}
function rKey(h,mi,ei,pos){return h==="R"?"R"+mi+"_"+ei:"L"+(mi*R.ex.meter+pos/4);}

/* Layout. Página: compassos quebrados em linhas, espaçamento pela duração. Rolando: uma faixa só, com espaço
   proporcional ao tempo, para a rolagem ter velocidade constante. */
function rLayout(cw,strip){
  var sp=cw<520?10:12, meter=R.ex.meter, N=R.ex.measures.length, two=rTwo(), lines=two?["R","L"]:["R"];
  var bo=two?(BRACE_W+0.35)*sp:0, head=bo+4.2*sp, lead=bo+0.8*sp, pre=1.4*sp, post=0.9*sp, umin=0.95*sp;
  var gapL=Math.round(7.5*sp), sysH=Math.round((two?17.4:9.6)*sp);
  var slots=[];
  for(var mi=0;mi<N;mi++){
    var ls=rLines(mi), set={};
    lines.forEach(function(h){ls[h].forEach(function(e){set[e.pos]=1;});});
    var ps=Object.keys(set).map(Number).sort(function(a,b){return a-b;});
    slots.push(ps.map(function(p,k){return {pos:p,gap:(k<ps.length-1?ps[k+1]:meter*4)-p};}));
  }
  function wOf(s){return 1.5+1.4*Math.sqrt(s.gap);}
  var mw=slots.map(function(ss){return ss.reduce(function(a,s){return a+wOf(s);},0);});
  var ev=[], anchors=[], bars=[], sys=[], L={sp:sp,two:two,meter:meter,strip:strip,bo:bo};
  function addEvents(mi,s,xOf){
    var ls=rLines(mi);
    lines.forEach(function(h){ls[h].forEach(function(e,ei){
      ev.push({h:h,key:rKey(h,mi,ei,e.pos),s:s,m:mi,cx:xOf(e.pos),pos:e.pos,dur:e.dur,rest:e.rest});
    });});
  }
  if(strip){
    var minGap=16; slots.forEach(function(ss){ss.forEach(function(s){minGap=Math.min(minGap,s.gap);});});
    var pxb=sp*Math.max(6,2.7*4/minGap), x0=head+1.2*sp, y1=Math.round(5*sp)+0.5;
    sys.push({y1:y1,y2:two?y1+gapL:null,first:true,last:true});
    for(mi=0;mi<N;mi++){
      (function(mi){addEvents(mi,0,function(pos){return x0+(mi*meter*4+pos)/4*pxb;});})(mi);
      if(mi>0) bars.push({x:x0+mi*meter*pxb-1.0*sp,s:0});
    }
    anchors=[{t:0,x:x0,s:0},{t:N*meter*4,x:x0+N*meter*pxb,s:0}];
    L.W=Math.ceil(x0+N*meter*pxb+0.6*sp); L.pxb=pxb; L.x0=x0; L.H=sysH; L.hitX=Math.round(Math.max(3*sp,0.3*cw));
  } else {
    var per=1;
    [4,3,2,1].some(function(k){
      if(N%k) return false;
      for(var s=0;s<N/k;s++){var need=(s===0?head:lead)+2;for(var j=0;j<k;j++)need+=pre+post+mw[s*k+j]*umin;if(need>cw)return false;}
      per=k;return true;
    });
    for(var s=0;s<N/per;s++){
      var y=Math.round(s*sysH+5*sp)+0.5, x=(s===0?head:lead)+1, end=cw-1, tw=0, j;
      for(j=0;j<per;j++) tw+=mw[s*per+j];
      var u=(end-x-per*(pre+post))/tw;
      sys.push({y1:y,y2:two?y+gapL:null,first:s===0,last:s===N/per-1});
      for(j=0;j<per;j++){
        var m2=s*per+j, slot=x+pre, posX={};
        slots[m2].forEach(function(sl){var cx=slot+0.6*sp;posX[sl.pos]=cx;anchors.push({t:m2*meter*4+sl.pos,x:cx,s:s});slot+=wOf(sl)*u;});
        addEvents(m2,s,function(pos){return posX[pos];});
        x=slot+post;
        anchors.push({t:(m2+1)*meter*4,x:x,s:s});
        if(j<per-1) bars.push({x:x,s:s});
      }
    }
    L.W=cw; L.H=(N/per)*sysH;
  }
  L.sys=sys; L.ev=ev; L.anchors=anchors; L.bars=bars;
  return L;
}
// Posição na pauta de um instante (em semicolcheias desde o início do exercício).
function rPos(L,t){
  var a=L.anchors, k=0;
  for(var i=0;i<a.length;i++){if(a[i].t<=t)k=i;else break;}
  var A=a[k], B=a[k+1];
  if(!B||B.s!==A.s||B.t===A.t) return {x:A.x,s:A.s};
  return {x:A.x+(B.x-A.x)*(t-A.t)/(B.t-A.t),s:A.s};
}
function rDraw(){
  var cw=rHost.clientWidth; if(!cw||!R.ex) return;
  var strip=settings.r.view==="rolando"&&!R.result;
  var L=rLayout(cw,strip); R.L=L;
  var sp=L.sp, p=[], res=R.result, W=L.W, lw=Math.max(1,f(0.1*sp)), bw=Math.max(1,f(0.13*sp)), sw=Math.max(1,f(0.12*sp)), hw=HEAD_W*sp;
  var xs=1+L.bo;
  function yOf(S,h){return h==="L"?S.y2:S.y1;}
  L.sys.forEach(function(S){
    var top=S.y1-2*sp, bot=(L.two?S.y2:S.y1)+2*sp;
    [S.y1].concat(L.two?[S.y2]:[]).forEach(function(y){
      p.push('<line class="sl" x1="'+f(xs)+'" x2="'+(W-1)+'" y1="'+y+'" y2="'+y+'" stroke-width="'+lw+'"/>');
      if(S.first){
        p.push('<use href="#g-ts'+L.meter+'" class="gl" transform="translate('+f(xs+0.9*sp)+' '+f(y-sp)+') scale('+sp+')"/>');
        p.push('<use href="#g-ts4" class="gl" transform="translate('+f(xs+0.9*sp)+' '+f(y+sp)+') scale('+sp+')"/>');
      }
    });
    if(L.two){
      p.push('<use href="#g-brace" class="gl" transform="translate(1 '+f(top)+') scale('+f(BRACE_W*sp)+' '+f(bot-top)+')"/>');
      p.push('<line class="bar" x1="'+f(xs+bw/2)+'" x2="'+f(xs+bw/2)+'" y1="'+f(top)+'" y2="'+f(bot)+'" stroke-width="'+bw+'"/>');
      if(S.first){
        p.push('<text class="hand-lbl" x="'+f(xs+0.9*sp)+'" y="'+f(S.y1-2.6*sp)+'" font-size="'+f(Math.max(11,1.15*sp))+'">m.d.</text>');
        p.push('<text class="hand-lbl" x="'+f(xs+0.9*sp)+'" y="'+f(S.y2-2.6*sp)+'" font-size="'+f(Math.max(11,1.15*sp))+'">m.e.</text>');
      }
    }
    if(S.last){
      var tw=0.5*sp, tx=W-1-tw, thin=tx-0.4*sp-bw/2;
      p.push('<rect class="thick" x="'+f(tx)+'" y="'+f(top)+'" width="'+f(tw)+'" height="'+f(bot-top)+'"/>');
      p.push('<line class="bar" x1="'+f(thin)+'" x2="'+f(thin)+'" y1="'+f(top)+'" y2="'+f(bot)+'" stroke-width="'+bw+'"/>');
    } else {
      p.push('<line class="bar" x1="'+f(W-1-bw/2)+'" x2="'+f(W-1-bw/2)+'" y1="'+f(top)+'" y2="'+f(bot)+'" stroke-width="'+bw+'"/>');
    }
  });
  L.bars.forEach(function(b){var S=L.sys[b.s];p.push('<line class="bar" x1="'+f(b.x)+'" x2="'+f(b.x)+'" y1="'+f(S.y1-2*sp)+'" y2="'+f((L.two?S.y2:S.y1)+2*sp)+'" stroke-width="'+bw+'"/>');});
  // Colcheias e semicolcheias do mesmo tempo ganham barra; as sozinhas ganham bandeirola.
  var groups=[];
  ["R","L"].forEach(function(h){
    var cur=[];
    function flush(){if(cur.length>=2)groups.push(cur);else if(cur.length===1)cur[0].flag=true;cur=[];}
    L.ev.forEach(function(e){
      if(e.h!==h) return;
      if(e.rest||e.dur>=4){flush();return;}
      var pv=cur[cur.length-1];
      if(pv&&(pv.m!==e.m||Math.floor(pv.pos/4)!==Math.floor(e.pos/4)||pv.pos+pv.dur!==e.pos)) flush();
      cur.push(e);
    });
    flush();
  });
  L.ev.forEach(function(e){
    var y=yOf(L.sys[e.s],e.h);
    if(e.rest){
      var g=e.dur===16?["#g-restw",1.128]:e.dur===8?["#g-resth",1.128]:e.dur===4?["#g-restq",1.081]:e.dur===2?["#g-rest8",0.989]:["#g-rest16",1.281];
      p.push('<use href="'+g[0]+'" class="gl" transform="translate('+f(e.cx-g[1]*sp/2)+' '+f(y)+') scale('+sp+')"/>');
      return;
    }
    var whole=e.dur>=16, w=whole?WHOLE_W*sp:hw, xl=e.cx-w/2, sx=e.cx+hw/2-sw/2;
    var q='<g class="nt '+(res?(res.cls[e.key]||""):"")+'">';
    if(!whole) q+='<line class="stem" x1="'+f(sx)+'" x2="'+f(sx)+'" y1="'+f(y-0.168*sp)+'" y2="'+f(y-3.5*sp)+'" stroke-width="'+sw+'"/>';
    q+='<use href="'+(whole?"#g-headw":e.dur>=8?"#g-headh":"#g-head")+'" class="head" transform="translate('+f(xl)+' '+f(y)+') scale('+sp+')"/>';
    if(e.dur===12||e.dur===6||e.dur===3) q+='<use href="#g-dot" class="head" transform="translate('+f(xl+w+0.3*sp)+' '+f(y-0.5*sp)+') scale('+sp+')"/>';
    if(e.flag) q+='<use href="'+(e.dur===1?"#g-flag16":"#g-flag8")+'" class="head" transform="translate('+f(sx-sw/2)+' '+f(y-3.5*sp)+') scale('+sp+')"/>';
    p.push(q+'</g>');
  });
  groups.forEach(function(g){
    var y=yOf(L.sys[g[0].s],g[0].h), top=y-3.5*sp, x1=g[0].cx+hw/2-sw, x2=g[g.length-1].cx+hw/2;
    p.push('<rect class="beam" x="'+f(x1)+'" y="'+f(top)+'" width="'+f(x2-x1)+'" height="'+f(0.5*sp)+'"/>');
    for(var k=0;k<g.length-1;k++) if(g[k].dur===1&&g[k+1].dur===1){
      var a=g[k].cx+hw/2-sw, b=g[k+1].cx+hw/2;
      p.push('<rect class="beam" x="'+f(a)+'" y="'+f(top+0.75*sp)+'" width="'+f(b-a)+'" height="'+f(0.5*sp)+'"/>');
    }
  });
  // Barra de um instante a outro na mesma linha de pauta (se passar para a linha seguinte, vai até a borda).
  function span(a16,b16){
    var A=rPos(L,a16), B=rPos(L,Math.max(a16,b16-0.001));
    return {s:A.s,x1:A.x,x2:B.s===A.s?B.x:W-1};
  }
  if(res) Object.keys(res.hands).forEach(function(h){
    var hr=res.hands[h], bh=0.42*sp;
    if(res.hold) hr.exp.forEach(function(e){
      var sp2=span(e.t16,e.e16), y=yOf(L.sys[sp2.s],h);
      p.push('<rect class="hold-exp" x="'+f(sp2.x1)+'" y="'+f(y+3*sp-bh/2)+'" width="'+f(Math.max(2,sp2.x2-sp2.x1-0.3*sp))+'" height="'+f(bh)+'" rx="'+f(bh/2)+'"/>');
    });
    hr.ticks.forEach(function(tk){
      var ps=rPos(L,tk.t16), y=yOf(L.sys[ps.s],h);
      if(res.hold&&tk.u16!=null){
        // Nota emendada: a barra desce um pouco para aparecer por baixo da nota seguinte.
        var sp2=span(tk.t16,tk.u16), hc=tk.hs==="ok"?"ok":tk.hs==="bad"?"bad":"near", dy=tk.hs==="overlap"?0.6*sp:0;
        p.push('<rect class="hold '+hc+'" x="'+f(sp2.x1)+'" y="'+f(y+3*sp-bh/2+dy)+'" width="'+f(Math.max(2,sp2.x2-sp2.x1))+'" height="'+f(bh)+'" rx="'+f(bh/2)+'"/>');
      }
      p.push('<line class="tick '+tk.c+'" x1="'+f(ps.x)+'" x2="'+f(ps.x)+'" y1="'+f(y+2.2*sp)+'" y2="'+f(y+3.8*sp)+'"/>');
    });
  });
  var aria='Exercício de ritmo em '+L.meter+' por 4, '+R.ex.measures.length+' compassos'+(L.two?', duas mãos':'');
  if(strip){
    rHost.innerHTML='<div class="r-strip"><div class="r-track" id="r-track"><svg width="'+W+'" height="'+L.H+'" viewBox="0 0 '+W+' '+L.H+'" role="img" aria-label="'+aria+'" xmlns="http://www.w3.org/2000/svg">'+p.join("")+'</svg></div>'+(settings.r.cursor?'<div class="r-hit" style="left:'+L.hitX+'px"></div>':'')+'</div>';
    rScroll(0);
  } else {
    var S0=L.sys[0];
    p.push('<rect id="r-cursor" class="rcur" x="0" y="0" width="'+f(Math.max(2,0.2*sp))+'" height="'+f((L.two?S0.y2-S0.y1:0)+7.6*sp)+'" rx="1" visibility="hidden"/>');
    rHost.innerHTML='<svg class="staff" viewBox="0 0 '+W+' '+L.H+'" role="img" aria-label="'+aria+'" xmlns="http://www.w3.org/2000/svg">'+p.join("")+'</svg>';
  }
}
// Barra de acompanhamento (opcional). Página inteira: barra que anda a partir do primeiro toque. Rolando: linha fixa onde as notas passam.
function rCursor(t16){
  var c=document.getElementById("r-cursor"); if(!c||!R.L||R.L.strip) return;
  if(t16==null){c.setAttribute("visibility","hidden");return;}
  var L=R.L, ps=rPos(L,t16), y=L.sys[ps.s].y1, w=Math.max(2,0.2*L.sp);
  c.setAttribute("x",f(ps.x-w/2)); c.setAttribute("y",f(y-4.6*L.sp)); c.setAttribute("visibility","visible");
}
// Rolando: a faixa anda para a esquerda e cada nota cruza a linha fixa no seu tempo.
function rScroll(t16){
  var tr=document.getElementById("r-track"); if(!tr||!R.L||!R.L.strip) return;
  tr.style.transform="translateX("+f(R.L.hitX-(R.L.x0+t16/4*R.L.pxb))+"px)";
}

// Converte entre o relógio de áudio (segundos) e o relógio dos toques (performance.now, em ms).
function rPerfAt(ctx,t){
  try{
    if(ctx.getOutputTimestamp){var ts=ctx.getOutputTimestamp();if(ts&&ts.performanceTime>0&&ts.contextTime>0)return ts.performanceTime+(t-ts.contextTime)*1000;}
  }catch(e){}
  return performance.now()+(t-ctx.currentTime)*1000+((ctx.outputLatency||ctx.baseLatency||0)*1000);
}
function rCtxAt(ctx,perf){
  try{
    if(ctx.getOutputTimestamp){var ts=ctx.getOutputTimestamp();if(ts&&ts.performanceTime>0&&ts.contextTime>0)return ts.contextTime+(perf-ts.performanceTime)/1000;}
  }catch(e){}
  return ctx.currentTime+(perf-performance.now())/1000-(ctx.outputLatency||ctx.baseLatency||0);
}
function rClick(ctx,dest,t,accent){
  var o=ctx.createOscillator(), g=ctx.createGain();
  o.type="sine"; o.frequency.value=accent?1760:1175;
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(accent?0.6:0.38,t+0.002); g.gain.exponentialRampToValueAtTime(0.0001,t+0.06);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t+0.07);
}
// Metrônomo do exercício: começa no primeiro toque. A calibração adianta os cliques para soarem junto com o seu toque.
function rScheduleFrom(anchor){
  var ctx=actx; if(!ctx||!R.bus) return;
  var lat=rLatOf(R.midi), n=R.ex.measures.length*R.meter;
  for(var k=1;k<n;k++){
    var t=rCtxAt(ctx,anchor-lat+k*R.beatMs);
    if(t>ctx.currentTime+0.005) rClick(ctx,R.bus,t,k%R.meter===0);
  }
}
/* Som do toque. Bater: bloco de madeira, curto e de ataque marcado (agudo na mão direita, grave na esquerda);
   soa bem até no alto-falante do celular. Segurar: nota de piano que soa enquanto você segura e para quando solta. */
var rNoise=null;
function rNoiseBuf(ctx){
  if(rNoise) return rNoise;
  var n=Math.floor(ctx.sampleRate*0.03), b=ctx.createBuffer(1,n,ctx.sampleRate), d=b.getChannelData(0);
  for(var i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  return (rNoise=b);
}
function rWood(ctx,dest,t,low){
  var f0=low?520:820;
  [[1,0.55,0.07],[2.37,0.22,0.035]].forEach(function(pt){
    var o=ctx.createOscillator(), g=ctx.createGain(), fr=f0*pt[0];
    o.type="sine"; o.frequency.setValueAtTime(fr*1.06,t); o.frequency.exponentialRampToValueAtTime(fr,t+0.012);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(pt[1],t+0.0015); g.gain.exponentialRampToValueAtTime(0.0001,t+pt[2]*3);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t+pt[2]*3+0.02);
  });
  var ns=ctx.createBufferSource(), bp=ctx.createBiquadFilter(), ng=ctx.createGain();
  ns.buffer=rNoiseBuf(ctx); bp.type="bandpass"; bp.frequency.value=f0*3; bp.Q.value=1.2;
  ng.gain.setValueAtTime(0.25,t); ng.gain.exponentialRampToValueAtTime(0.0001,t+0.02);
  ns.connect(bp); bp.connect(ng); ng.connect(dest); ns.start(t); ns.stop(t+0.03);
}
function rPiano(ctx,dest,t,freq){
  var out=ctx.createGain(), oscs=[];
  out.gain.setValueAtTime(0.0001,t); out.gain.exponentialRampToValueAtTime(0.3,t+0.005); out.gain.setTargetAtTime(0.0001,t+0.005,1.6);
  out.connect(dest);
  [[1,1],[2,0.45],[3,0.22],[4,0.1],[5,0.05]].forEach(function(pt){
    var o=ctx.createOscillator(), g=ctx.createGain();
    o.type="sine"; o.frequency.value=freq*pt[0]*(1+0.0008*pt[0]);
    g.gain.setValueAtTime(pt[1],t); g.gain.setTargetAtTime(pt[1]*0.25,t,0.5/pt[0]);   // os parciais agudos somem antes, como no piano
    o.connect(g); g.connect(out); o.start(t); o.stop(t+8); oscs.push(o);
  });
  return {stop:function(){
    var n=ctx.currentTime;
    out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(Math.max(0.0001,out.gain.value),n); out.gain.setTargetAtTime(0.0001,n,0.035);
    oscs.forEach(function(o){try{o.stop(n+0.25);}catch(e){}});
  }};
}
function rTapSound(h){
  if(!settings.r.tapSound||!actx||!R.bus||R.kind==="cal") return null;
  var ctx=actx, low=rTwo()&&h==="L";
  if(rHold()) return rPiano(ctx,R.bus,ctx.currentTime,low?130.81:523.25);   // Dó3 na esquerda, Dó5 na direita
  rWood(ctx,R.bus,ctx.currentTime,low); return null;
}
function rPadText(num,lbl){num=String(num);if(rNum.textContent!==num)rNum.textContent=num;if(rLbl.textContent!==lbl)rLbl.textContent=lbl;}
function rUI(){
  var run=R.state!=="idle", two=rTwo();
  document.getElementById("r-controls").disabled=run;
  document.getElementById("r-new").disabled=run;
  document.getElementById("r-calib").disabled=run;
  rPads.L.hidden=!two;
  rPads.R.classList.toggle("live",R.state==="run"); rPads.L.classList.toggle("live",R.state==="run");
  var hold=rHold(), midi=midiOn();
  document.getElementById("r-pad-r-title").textContent=two?"Mão direita":(hold?"Segure aqui":"Toque aqui");
  document.getElementById("r-pad-r-sub").textContent=midi?(two?"ritmo · do Dó central para cima":(hold?"ou segure uma tecla do piano":"ou uma tecla do piano"))
    :two?"ritmo · tecla J":(hold?"ou segure a barra de espaço":"ou use a barra de espaço");
  document.getElementById("r-pad-l-sub").textContent=midi?"pulso · abaixo do Dó central":"pulso · tecla F";
  document.getElementById("r-hint").textContent=midi
    ?"Com o teclado MIDI, qualquer tecla vale como toque"+(two?": abaixo do Dó central é a mão esquerda; do Dó central para cima, a direita.":".")
      +(hold?" Segure a tecla pelo tempo da nota.":"")+" O app não toca o som do toque, porque o piano já soa."
    :two?(hold?"No computador: segure F para a mão esquerda e J para a direita. Esc para parar.":"No computador: F para a mão esquerda e J para a direita. Esc para parar.")
    :(hold?"No computador, segure a barra de espaço. Esc para parar.":"No computador, toque com a barra de espaço. Esc para parar.");
  rGo.textContent=run?"Parar":(R.result?"Tocar de novo":"Começar");
  var auto=settings.r.start==="contagem";
  var startTxt=auto?(two?"O metrônomo conta um compasso e o exercício começa logo em seguida: entre com as duas mãos no tempo 1.":"O metrônomo conta um compasso e o exercício começa logo em seguida: entre no tempo 1.")
    :(two?"Depois da contagem, comece com as duas mãos juntas no primeiro tempo: esse toque marca o início.":"O metrônomo conta um compasso; depois, toque a primeira nota quando estiver pronto. Esse toque marca o início, e as outras notas são medidas a partir dele.");
  if(!run) rPadText("",R.msg||(R.result?"Aperte “Tocar de novo” para repetir este exercício ou “Novo exercício” para outro."
    :"Aperte “Começar”. "+startTxt+(two?" A esquerda toca todos os tempos e a direita, o ritmo.":"")+(hold?" Segure cada nota pelo tempo que ela dura; nas pausas, solte.":"")));
  document.getElementById("r-status").textContent=R.ex.measures.length+" compassos de "+R.ex.meter+"/4 · "+settings.r.bpm+" bpm"+(two?" · duas mãos":"");
}
function rStart(kind){
  if(R.state!=="idle") return;
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){R.msg="Este navegador não consegue tocar o metrônomo.";rUI();return;}
  actx=actx||new AC();
  var ctx=actx;
  R.state="starting"; R.kind=kind; R.msg=""; R.midi=midiOn(); R.src=0;
  if(kind==="ex"){R.result=null;rResult.hidden=true;rDraw();}
  rUI();
  Promise.resolve(ctx.state==="suspended"?ctx.resume():null).then(function(){
    if(R.state!=="starting") return;
    var bpm=kind==="cal"?90:settings.r.bpm, meter=kind==="cal"?4:R.ex.meter, beat=60/bpm;
    var bus=ctx.createGain(); bus.connect(ctx.destination); R.bus=bus;
    var T0=ctx.currentTime+0.35, exBeats=kind==="cal"?12:R.ex.measures.length*meter, k;
    for(k=0;k<meter;k++) rClick(ctx,bus,T0+k*beat,k===0);
    // Na calibração os cliques seguem direto; no exercício, o metrônomo espera o primeiro toque.
    R.auto=kind==="ex"&&settings.r.start==="contagem";
    if(kind==="cal"||(R.auto&&settings.r.metro==="sempre")) for(k=0;k<exBeats;k++) rClick(ctx,bus,T0+(meter+k)*beat,k%meter===0);
    R.beatMs=beat*1000; R.meter=meter; R.countPerf=rPerfAt(ctx,T0); R.startPerf=R.countPerf+meter*R.beatMs; R.totalMs=exBeats*R.beatMs;
    R.anchor=(kind==="cal"||R.auto)?R.startPerf:null;   // início automático: o tempo 1 vem logo após a contagem
    R.taps=[]; R.active={}; R.state="run"; rUI();
    try{if(navigator.wakeLock)navigator.wakeLock.request("screen").then(function(w){if(R.state==="idle"){try{w.release();}catch(e){}}else R.wake=w;}).catch(function(){});}catch(e){}
    R.raf=requestAnimationFrame(rTick);
  }).catch(function(){R.state="idle";R.msg="Não foi possível ligar o som. Toque em “Começar” de novo.";rUI();});
}
function rTick(){
  if(R.state!=="run") return;
  var now=performance.now(), cal=R.kind==="cal", k=Math.floor((now-R.countPerf)/R.beatMs);
  if(cal){
    var el=now-R.startPerf;
    rPadText(el<R.totalMs?(((k%R.meter)+R.meter)%R.meter)+1:"",el<0?"Toque junto com cada clique":"Continue tocando junto com os cliques");
  } else if(R.anchor==null||now<R.anchor){
    rPadText(k>=0&&k<R.meter?k+1:"",k<R.meter?"Contagem: prepare-se":(rTwo()?"Comece com as duas mãos juntas":"Toque a primeira nota para começar"));
  } else {
    rPadText("",rTwo()?"Esquerda em todos os tempos, direita no ritmo"+(rHold()?", segurando cada nota":""):(rHold()?"Segure cada nota pelo tempo dela; solte nas pausas":"Toque no começo de cada nota"));
    var t16=Math.min(now-R.anchor,R.totalMs)/R.beatMs*4;
    if(R.L&&R.L.strip) rScroll(t16); else if(settings.r.cursor) rCursor(t16);
  }
  if(R.anchor!=null&&now-R.anchor>R.totalMs+450){rFinish();return;}
  R.raf=requestAnimationFrame(rTick);
}
// Cada toque guarda quando apertou (t) e quando soltou (up). id separa dedos e teclas, para as duas mãos ao mesmo tempo.
function rDown(ts,h,id){
  if(R.state!=="run"||R.active[id]) return;
  var t=rStamp(ts), pad=rPads[h]||rPads.R;
  pad.classList.add("hit"); clearTimeout(pad._t);
  if(!rHold()) pad._t=setTimeout(function(){pad.classList.remove("hit");},90);
  // Toques durante a contagem não contam. No início pelo 1º toque, o primeiro depois dela (ou até meio tempo antes) começa o exercício.
  if(R.kind!=="cal"&&t<R.startPerf-0.5*R.beatMs){R.active[id]={h:h,ignored:true};return;}
  // A entrada do primeiro toque que conta (tecla do piano ou tela) decide qual calibração vale e qual é gravada.
  if(!R.src){R.src=1;R.midi=id.charAt(0)==="m";}
  if(R.anchor==null){R.anchor=t;if(settings.r.metro==="sempre")rScheduleFrom(t);}
  // Tecla do piano (id "m…"): o piano já soa, então o app não toca o som do toque.
  var press={t:t,h:h,up:null,voice:id.charAt(0)==="m"?null:rTapSound(h)}; R.taps.push(press); R.active[id]=press;
}
function rUp(ts,id){
  var p=R.active[id]; if(!p) return;
  delete R.active[id];
  if(!p.ignored) p.up=rStamp(ts);
  if(p.voice){p.voice.stop();p.voice=null;}
  var still=Object.keys(R.active).some(function(k){return R.active[k].h===p.h;});
  if(rHold()&&!still) (rPads[p.h]||rPads.R).classList.remove("hit");
}
function rRelease(){
  if(R.bus){try{R.bus.disconnect();}catch(e){}R.bus=null;}
  if(R.wake){try{R.wake.release();}catch(e){}R.wake=null;}
  cancelAnimationFrame(R.raf);
  R.active={}; rPads.R.classList.remove("hit"); rPads.L.classList.remove("hit");
}
function rStop(){if(R.state==="idle")return;R.state="idle";rRelease();rCursor(null);rScroll(0);rUI();}
function rFinish(){
  R.state="idle"; rRelease();
  if(R.kind==="cal") rCalFinish();
  else {R.result=rEvaluate();rDraw();rShowResult();}
  rUI();
}

/* Avaliação, mão por mão. O primeiro toque é o tempo zero. Cada toque vai para a nota mais próxima da sua mão,
   dentro de uma janela que encolhe quando as notas são rápidas. Verde: até a metade da janela (no máximo 60 ms).
   Amarelo: dentro da janela. Vermelho: nota sem toque ou toque sem nota. Como tudo é medido a partir do seu
   toque, o atraso do aparelho se anula. */
// Notas de uma mão, com duração (len), se vem pausa depois (nextRest) e se é a última (last).
function rNotesFor(h){
  var beatMs=R.beatMs, meter=R.ex.meter, out=[], flat=[];
  if(h==="R") R.ex.measures.forEach(function(evs,m){evs.forEach(function(e,ei){flat.push({key:"R"+m+"_"+ei,t:(m*meter*4+e.pos)/4*beatMs,t16:m*meter*4+e.pos,m:m,pos:e.pos,dur:e.dur,rest:e.rest});});});
  else for(var b=0;b<R.ex.measures.length*meter;b++) flat.push({key:"L"+b,t:b*beatMs,t16:b*4,beat:b,dur:4,rest:false});
  flat.forEach(function(e,i){
    if(e.rest) return;
    var nx=flat[i+1];
    e.len=e.dur/4*beatMs; e.nextRest=!!(nx&&nx.rest); e.last=!nx;
    out.push(e);
  });
  return out;
}
function rMatch(notes,taps){
  var beatMs=R.beatMs, hold=rHold();
  notes.forEach(function(n,k){
    var a=k>0?n.t-notes[k-1].t:Infinity, b=k<notes.length-1?notes[k+1].t-n.t:Infinity;
    n.win=Math.min(180,0.5*Math.min(a,b)); n.good=Math.min(60,0.5*n.win);
  });
  var match=notes.map(function(){return null;}), extras=[];
  taps.forEach(function(tp){
    var best=-1, bd=Infinity;
    notes.forEach(function(n,k){var d=Math.abs(tp.t-n.t);if(d<bd){bd=d;best=k;}});
    if(best<0||bd>notes[best].win){extras.push(tp);return;}
    if(match[best]===null) match[best]=tp;
    else if(bd<Math.abs(match[best].t-notes[best].t)){extras.push(match[best]);match[best]=tp;}
    else extras.push(tp);
  });
  // full: notas inteiras certas. No Segurar, começou no tempo e durou certo; no Bater, é o mesmo que ok.
  var r={cls:{},dev:{},missed:[],ticks:[],exp:[],ok:0,near:0,miss:0,full:0,extras:extras.map(function(x){return x.t;}),extra:extras.length,total:notes.length,ndev:0,median:0,
         dTotal:0,dOk:0,dEarly:0,dRest:0,dOverlap:0}, devs=[], endAll=R.totalMs+300;
  function u16(tp){return (tp.up==null?endAll:tp.up)/beatMs*4;}
  notes.forEach(function(n,k){
    var tp=match[k];
    if(hold) r.exp.push({t16:n.t16,e16:n.t16+n.dur});
    if(tp===null){r.cls[n.key]="bad";r.miss++;r.missed.push(n.key);return;}
    var d=tp.t-n.t, c=Math.abs(d)<=n.good?"ok":"near";
    devs.push(d); r.dev[n.key]=d; r.cls[n.key]=c; if(c==="ok")r.ok++;else r.near++;
    var tk={t16:tp.t/beatMs*4,c:c};
    if(hold){
      /* Fim da nota. Notas longas (a partir da semínima pontuada), a última e as que vêm antes de uma pausa precisam
         durar quase o valor escrito; antes de uma pausa, a mão tem de sair logo; e nenhuma pode emendar na próxima. */
      var up=tp.up==null?endAll:tp.up, end=n.t+n.len, st="ok";
      var tolE=Math.max(150,0.25*n.len), tolL=Math.max(120,0.25*beatMs), nx=match[k+1];
      if((n.dur>=6||n.nextRest||n.last)&&up<end-tolE) st="early";
      else if(n.nextRest&&up>end+tolL) st="rest";
      else if(!n.nextRest&&!n.last&&nx&&up>nx.t+30) st="overlap";
      r.dTotal++; if(st==="ok")r.dOk++; else if(st==="early")r.dEarly++; else if(st==="rest")r.dRest++; else r.dOverlap++;
      tk.u16=u16(tp); tk.hs=st;
      if(c==="ok"&&st==="ok") r.full++;
    }
    else if(c==="ok") r.full++;
    r.ticks.push(tk);
  });
  extras.forEach(function(tp){var tk={t16:Math.max(0,tp.t)/beatMs*4,c:"bad"};if(hold){tk.u16=u16(tp);tk.hs="bad";}r.ticks.push(tk);});
  r.ndev=devs.length; r.median=devs.length?median(devs):0;
  return r;
}
function rEvaluate(){
  var two=rTwo(), res={two:two,hold:rHold(),auto:R.auto,hands:{},cls:{},insights:[]};
  // No início automático o relógio é o do metrônomo, então o atraso calibrado do aparelho é descontado dos toques.
  var base=R.anchor+(R.auto?rLatOf(R.midi):0);
  (two?["R","L"]:["R"]).forEach(function(h){
    var taps=R.taps.filter(function(x){return x.h===h;}).map(function(x){return {t:x.t-base,up:x.up==null?null:x.up-base};})
      .filter(function(x){return x.t>-Math.min(0.5*R.beatMs,300)&&x.t<R.totalMs+300;}).sort(function(a,b){return a.t-b.t;});
    var m=rMatch(rNotesFor(h),taps); res.hands[h]=m;
    Object.keys(m.cls).forEach(function(k){res.cls[k]=m.cls[k];});
  });
  if(two){
    // Erros típicos de coordenação entre as mãos.
    var Lr=res.hands.L, Rn=rNotesFor("R"), meter=R.ex.meter, busy={}, has={};
    var off=Rn.filter(function(n){return n.pos%4!==0;}).map(function(n){return n.t;});
    var copies=Lr.extras.filter(function(t){return off.some(function(o){return Math.abs(o-t)<70;});}).length;
    if(copies>=2) res.insights.push("A mão esquerda está acompanhando o ritmo da direita. Ela deve tocar só os tempos, como um metrônomo.");
    Rn.forEach(function(n){var b=n.m*meter+Math.floor(n.pos/4);has[b]=1;if(n.pos%4!==0)busy[b]=1;});
    var dB=[], dC=[];
    Object.keys(Lr.dev).forEach(function(k){(busy[+k.slice(1)]?dB:dC).push(Math.abs(Lr.dev[k]));});
    function mean(a){return a.reduce(function(s,x){return s+x;},0)/a.length;}
    if(dB.length>=2&&dC.length>=2&&mean(dB)-mean(dC)>25) res.insights.push("A mão esquerda perde o pulso nos tempos em que a direita toca notas rápidas.");
    var quiet=Lr.missed.filter(function(k){return !has[+k.slice(1)];}).length;
    if(quiet>=2) res.insights.push("A mão esquerda parou nos tempos em que a direita segura uma nota longa ou faz pausa. Mantenha o pulso mesmo sem a direita tocar.");
  }
  return res;
}
function rHandLine(name,role,r){
  var pct=r.total?Math.round(r.full/r.total*100):0;
  return '<p class="r-line"><b>'+name+'</b> ('+role+'): '+pct+'% · <span class="dot ok"></span>'+r.ok+' no tempo · <span class="dot near"></span>'+r.near+' um pouco fora · <span class="dot bad"></span>'+r.miss+' sem toque · '+r.extra+' a mais</p>';
}
function rTend(r,who){
  if(r.ndev<3) return "";
  if(Math.abs(r.median)<15) return who?"":"Seus toques ficaram centrados no tempo.";
  return (who||"Você")+" tende a "+(r.median<0?"adiantar":"atrasar")+" cerca de "+Math.round(Math.abs(r.median))+" ms.";
}
// A porcentagem conta notas inteiras certas: no Segurar, a nota precisa começar no tempo e durar certo.
function rShowResult(){
  var res=R.result, Rr=res.hands.R, html, tip, ok, tot, extra, lines=[], unit=res.hold?"% certas":"% no tempo";
  if(!res.two){
    ok=Rr.full; tot=Rr.total; extra=Rr.extra;
    html='<p class="r-score">'+(tot?Math.round(ok/tot*100):0)+unit+'</p>'
      +'<p class="r-line"><span class="dot ok"></span>No tempo: '+Rr.ok+' · <span class="dot near"></span>Um pouco fora: '+Rr.near+' · <span class="dot bad"></span>Faltaram: '+Rr.miss+' · Toques a mais: '+Rr.extra+'</p>';
    lines.push(rTend(Rr,""));
  } else {
    var Lr=res.hands.L; ok=Rr.full+Lr.full; tot=Rr.total+Lr.total; extra=Rr.extra+Lr.extra;
    html='<p class="r-score">'+Math.round(ok/tot*100)+unit+'</p>'+rHandLine("Mão direita","ritmo",Rr)+rHandLine("Mão esquerda","pulso",Lr);
    lines=res.insights.concat([rTend(Rr,"A mão direita"),rTend(Lr,"A mão esquerda")]);
  }
  var pct=tot?Math.round(ok/tot*100):0;
  var H={t:0,ok:0,e:0,r:0,o:0};
  if(res.hold){
    Object.keys(res.hands).forEach(function(h){var x=res.hands[h];H.t+=x.dTotal;H.ok+=x.dOk;H.e+=x.dEarly;H.r+=x.dRest;H.o+=x.dOverlap;});
    if(H.t){
      html+='<p class="r-line"><b>Duração:</b> '+H.ok+' de '+H.t+' certas · <span class="dot near"></span>soltou cedo: '+H.e+' · invadiu a pausa: '+H.r+' · emendou na próxima: '+H.o+'</p>';
      if(H.e>=2&&H.e>=H.r&&H.e>=H.o) lines.push("Você está soltando as notas longas antes da hora. Continue contando os tempos até o fim da mínima e da semibreve.");
      else if(H.r>=2&&H.r>=H.o) lines.push("Nas pausas, levante a mão logo que a pausa começa.");
      else if(H.o>=2) lines.push("Solte cada nota antes de tocar a próxima, como faria com a tecla do piano.");
    }
  }
  if(ok===tot&&extra===0&&H.ok===H.t) tip=(res.two?"As duas mãos no tempo. ":"Tudo no tempo. ")+"Experimente subir o andamento em 5 bpm"+(settings.r.metro==="sempre"?" ou deixar o metrônomo só na contagem.":".");
  else if(pct<60) tip=res.two?"Diminua o andamento. Se precisar, pratique a mão esquerda sozinha contando os tempos em voz alta e depois junte a direita.":"Diminua o andamento e conte os tempos em voz alta enquanto toca.";
  else tip=res.hold?"Repita este exercício até todas as notas e barras ficarem verdes.":"Repita este exercício até todas as notas ficarem verdes.";
  lines.push(tip);
  lines.filter(Boolean).forEach(function(s){html+='<p class="r-line">'+s+'</p>';});
  html+='<p class="r-legend">'+(res.auto?'O exercício começou logo após a contagem'+(rCalOf(R.midi)?', com o atraso calibrado descontado dos toques. ':(R.midi?'. Calibre o atraso do teclado MIDI para a avaliação ficar justa. ':'. Calibre o atraso deste aparelho para a avaliação ficar justa. '))
    :(res.two?'O seu primeiro toque, de qualquer das mãos, é a referência: a primeira nota dessa mão sempre fica verde, e a da outra mão mostra a diferença entre as duas. '
      :'O seu primeiro toque é a referência, por isso a primeira nota sempre fica verde. '))+'Os traços embaixo de cada linha mostram onde você tocou: à esquerda da nota é adiantado, à direita é atrasado.'
    +(res.hold?' A barra colorida é quanto você segurou; a faixa clara atrás dela é a duração escrita. Na porcentagem, só conta como certa a nota que começou no tempo e durou certo.':'')+'</p>';
  rResult.innerHTML=html; rResult.hidden=false;
}
// A calibração mostrada e feita é a da entrada em uso: o teclado MIDI, se estiver ligado, ou o toque na tela.
function rCalText(){
  var r=settings.r, midi=midiOn(), how="Com início logo após a contagem, ela é descontada dos seus toques; com início no seu 1º toque, ela adianta o metrônomo.";
  document.getElementById("r-calib-txt").textContent=midi
    ?(r.calMidi?"Compensação de atraso do teclado MIDI: "+r.latMidi+" ms. "+how
      :"Teclado MIDI sem calibração. O atraso dele é bem menor que o do toque na tela: calibre uma vez tocando uma tecla junto com os cliques.")
    :(r.calibrated?"Compensação de atraso: "+r.latency+" ms. "+how
      :"Sem calibração. Calibre uma vez neste aparelho se for usar o início logo após a contagem, ou se o metrônomo parecer atrasado em relação aos seus toques.");
}
// Calibração: 4 cliques de preparação e 12 para medir. O atraso é a mediana da diferença entre toque e clique.
function rCalFinish(){
  var offs=[];
  R.taps.forEach(function(tp){
    var rel=tp.t-R.startPerf, k=Math.round(rel/R.beatMs);
    if(k<0||k>=12) return;
    var d=rel-k*R.beatMs; if(Math.abs(d)<0.35*R.beatMs) offs.push(d);
  });
  if(offs.length<6){R.msg="Não deu para medir. Toque junto com cada clique até o fim e tente de novo.";return;}
  var lat=clamp(Math.round(median(offs)),-150,400);
  if(R.midi){settings.r.latMidi=lat;settings.r.calMidi=true;} else {settings.r.latency=lat;settings.r.calibrated=true;}
  saveSettings(); rCalText();
  R.msg="Calibração "+(R.midi?"do teclado MIDI ":"")+"feita: "+lat+" ms. Agora aperte “"+(R.result?"Tocar de novo":"Começar")+"”.";
}

function tempoName(b){return b<60?"Largo":b<66?"Larghetto":b<76?"Adagio":b<108?"Andante":b<120?"Moderato":b<156?"Allegro":"Vivace";}
function sameSet(a,b){return a.length===b.length&&a.every(function(x){return b.indexOf(x)>=0;});}
function rRenderControls(){
  var r=settings.r;
  document.querySelectorAll("[data-meter]").forEach(function(b){b.setAttribute("aria-checked",String(+b.dataset.meter===r.meter));});
  document.querySelectorAll("[data-metro]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.metro===r.metro));});
  document.querySelectorAll("[data-hands-r]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.handsR===r.hands));});
  document.querySelectorAll("[data-view]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.view===r.view));});
  document.querySelectorAll("[data-rmode]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.rmode===r.mode));});
  document.querySelectorAll("[data-start]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.start===r.start));});
  document.getElementById("sw-tapsnd").setAttribute("aria-checked",String(r.tapSound));
  document.getElementById("tapsnd-txt").textContent=r.tapSound?(r.mode==="segurar"?"Ligado · piano":"Ligado · bloco de madeira"):"Desligado";
  document.getElementById("r-counts").innerHTML=R_COUNTS.map(function(n){
    return '<button type="button" role="radio" id="rc-'+n+'" data-count="'+n+'" aria-checked="'+(n===r.measures)+'">'+n+'</button>';
  }).join("");
  document.getElementById("sw-cursor").setAttribute("aria-checked",String(r.cursor));
  document.getElementById("cursor-txt").textContent=r.cursor?"Ligada":"Desligada";
  document.getElementById("bpm").value=r.bpm;
  document.getElementById("bpm-val").textContent=r.bpm;
  document.getElementById("bpm-name").textContent=tempoName(r.bpm);
  var lv=-1;
  RLEVELS.forEach(function(L,i){if(sameSet(L.figs,r.figs))lv=i;});
  document.getElementById("r-levels").innerHTML=RLEVELS.map(function(L,i){
    return '<button type="button" class="chip" role="radio" id="lv-'+(i+1)+'" data-level="'+i+'" aria-checked="'+(i===lv)+'">'+(i+1)+'</button>';
  }).join("");
  document.getElementById("r-figs").innerHTML=RFIGS.map(function(fg){
    return '<button type="button" class="chip" role="checkbox" id="fg-'+fg.id+'" data-fig="'+fg.id+'" aria-checked="'+(r.figs.indexOf(fg.id)>=0)+'"'
      +(fg.locked?' aria-disabled="true" title="A semínima é o tempo e fica sempre ativa"':'')+'>'+fg.label+'</button>';
  }).join("");
  var d=lv>=0?RLEVELS[lv].desc:"Combinação personalizada de figuras.";
  if(r.meter===2&&(r.figs.indexOf("semibreve")>=0||r.figs.indexOf("minpont")>=0)) d+=" Em 2/4 não cabem semibreve nem mínima pontuada.";
  else if(r.meter===3&&r.figs.indexOf("semibreve")>=0) d+=" Em 3/4 não cabe semibreve.";
  if(r.mode==="segurar") d+=" Segurar: aperte no começo da nota e solte quando ela acaba; nas pausas, a mão fica levantada.";
  if(r.hands==="duas") d+=" Duas mãos: a direita toca o ritmo (linha de cima) e a esquerda, todos os tempos (linha de baixo).";
  if(r.view==="rolando") d+=r.cursor?" Rolando: as notas passam pela linha fixa; toque quando cada uma chegar nela.":" Rolando: as notas andam da direita para a esquerda no andamento escolhido.";
  document.getElementById("r-desc").textContent=d;
}
function rNew(){R.result=null;R.msg="";rResult.hidden=true;rGenerate();rDraw();rUI();}
function rSetBpm(v){settings.r.bpm=clamp(Math.round(v),40,160);saveSettings();rRenderControls();rUI();}

document.querySelectorAll("[data-meter]").forEach(function(b){
  b.addEventListener("click",function(){if(+b.dataset.meter===settings.r.meter)return;settings.r.meter=+b.dataset.meter;saveSettings();rRenderControls();rNew();});
});
document.querySelectorAll("[data-metro]").forEach(function(b){
  b.addEventListener("click",function(){settings.r.metro=b.dataset.metro;saveSettings();rRenderControls();});
});
document.querySelectorAll("[data-hands-r]").forEach(function(b){
  b.addEventListener("click",function(){
    if(b.dataset.handsR===settings.r.hands) return;
    settings.r.hands=b.dataset.handsR; saveSettings(); rRenderControls();
    R.result=null; R.msg=""; rResult.hidden=true; rDraw(); rUI();
  });
});
document.querySelectorAll("[data-start]").forEach(function(b){
  b.addEventListener("click",function(){
    if(b.dataset.start===settings.r.start) return;
    settings.r.start=b.dataset.start; saveSettings(); rRenderControls();
    R.result=null; R.msg=""; rResult.hidden=true; rDraw(); rUI();
  });
});
document.getElementById("sw-tapsnd").addEventListener("click",function(){settings.r.tapSound=!settings.r.tapSound;saveSettings();rRenderControls();});
document.querySelectorAll("[data-rmode]").forEach(function(b){
  b.addEventListener("click",function(){
    if(b.dataset.rmode===settings.r.mode) return;
    settings.r.mode=b.dataset.rmode; saveSettings(); rRenderControls();
    R.result=null; R.msg=""; rResult.hidden=true; rDraw(); rUI();
  });
});
document.querySelectorAll("[data-view]").forEach(function(b){
  b.addEventListener("click",function(){if(b.dataset.view===settings.r.view)return;settings.r.view=b.dataset.view;saveSettings();rRenderControls();rDraw();});
});
document.getElementById("r-counts").addEventListener("click",function(e){
  var b=e.target.closest("[data-count]"); if(!b||+b.dataset.count===settings.r.measures) return;
  settings.r.measures=+b.dataset.count; saveSettings(); rRenderControls(); rNew();
});
document.getElementById("sw-cursor").addEventListener("click",function(){settings.r.cursor=!settings.r.cursor;saveSettings();rRenderControls();if(settings.r.view==="rolando")rDraw();});
document.getElementById("bpm").addEventListener("input",function(e){rSetBpm(+e.target.value);});
document.getElementById("bpm-down").addEventListener("click",function(){rSetBpm(settings.r.bpm-5);});
document.getElementById("bpm-up").addEventListener("click",function(){rSetBpm(settings.r.bpm+5);});
document.getElementById("r-levels").addEventListener("click",function(e){
  var b=e.target.closest("[data-level]"); if(!b) return;
  settings.r.figs=RLEVELS[+b.dataset.level].figs.slice(); saveSettings(); rRenderControls(); rNew();
});
document.getElementById("r-figs").addEventListener("click",function(e){
  var b=e.target.closest("[data-fig]"); if(!b||b.getAttribute("aria-disabled")==="true") return;
  var id=b.dataset.fig, i=settings.r.figs.indexOf(id);
  if(i>=0) settings.r.figs.splice(i,1); else settings.r.figs.push(id);
  saveSettings(); rRenderControls(); rNew();
});
document.getElementById("r-new").addEventListener("click",rNew);
rGo.addEventListener("click",function(){if(R.state==="idle")rStart("ex");else rStop();});
document.getElementById("r-calib").addEventListener("click",function(){rStart("cal");});
// Cada área de toque responde sozinha, então dá para tocar com as duas mãos ao mesmo tempo no celular.
Object.keys(rPads).forEach(function(h){
  var pad=rPads[h];
  pad.addEventListener("pointerdown",function(e){
    if(R.state!=="run") return;
    e.preventDefault();
    try{pad.setPointerCapture(e.pointerId);}catch(_){}
    rDown(e.timeStamp,rTwo()?h:"R","p"+e.pointerId);
  });
  ["pointerup","pointercancel","lostpointercapture"].forEach(function(ev){pad.addEventListener(ev,function(e){rUp(e.timeStamp,"p"+e.pointerId);});});
});
document.addEventListener("keydown",function(e){
  if(settings.tab!=="ritmo"||R.state==="idle") return;
  if(e.key==="Escape"){rStop();return;}
  if(e.metaKey||e.ctrlKey||e.altKey||e.key==="Tab") return;
  e.preventDefault();
  if(e.repeat) return;
  var h="R";
  if(rTwo()){
    var k=(e.key||"").toLowerCase();
    if(k.length!==1) return;
    if("asdfg".indexOf(k)>=0) h="L"; else if("hjklç;".indexOf(k)>=0) h="R"; else return;
  }
  rDown(e.timeStamp,h,"k"+e.code);
});
document.addEventListener("keyup",function(e){
  if(settings.tab!=="ritmo") return;
  if(R.state!=="idle") e.preventDefault();
  rUp(e.timeStamp,"k"+e.code);
});
// Com o app fora da tela o metrônomo e os toques perdem o sentido: o exercício para, em vez de terminar cheio de faltas.
document.addEventListener("visibilitychange",function(){
  if(!document.hidden||R.state==="idle") return;
  R.msg=(R.kind==="cal"?"Calibração interrompida":"Exercício interrompido")+" porque o app saiu da tela. Aperte “"+(R.kind==="cal"?"Calibrar atraso":"Começar")+"” de novo.";
  rStop();
});
