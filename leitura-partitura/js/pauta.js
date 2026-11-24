/* Desenho da pauta em SVG e escolha das notas (pesos pelos erros e pela demora), usados pelo Treino, pela Folha e pelo Mapa. */
"use strict";

/* ---------- desenho da pauta ---------- */
// it: {x, st, d, dur (1 semínima, 2 mínima, 4 semibreve), rest, cls, label, lcls, lsize, hit, finger}
function noteSVG(it,g){
  var sp=g.sp, st=it.st, top=g.tops[st], yB=top+4*sp;
  if(it.rest){
    var rx=f(it.x-REST_W*sp/2);
    return it.dur===4
      ? '<use href="#g-restw" class="gl" transform="translate('+rx+' '+g.y(st,6)+') scale('+sp+')"/>'
      : '<use href="#g-resth" class="gl" transform="translate('+rx+' '+g.y(st,4)+') scale('+sp+')"/>';
  }
  var s=it.d-CLEFS[st].base, yy=g.y(st,s), whole=it.dur===4;
  var hw=(whole?WHOLE_W:HEAD_W)*sp, xl=it.x-hw/2;
  var llw=Math.max(1,f(0.16*sp)), ll=hw+0.8*sp, sw=Math.max(1,f(0.12*sp));
  var q='<g class="nt '+(it.cls||"")+'" data-d="'+it.d+'">';
  if(it.hit) q+='<rect x="'+f(it.x-it.hit/2)+'" y="'+f(top-3*sp)+'" width="'+f(it.hit)+'" height="'+f(10*sp)+'" fill="transparent"/>';
  function ledger(l){var ly=g.y(st,l);return '<line class="ledger" x1="'+f(it.x-ll/2)+'" x2="'+f(it.x+ll/2)+'" y1="'+ly+'" y2="'+ly+'" stroke-width="'+llw+'"/>';}
  for(var l=-2;l>=s;l-=2) q+=ledger(l);
  for(var u=10;u<=s;u+=2) q+=ledger(u);
  if(!whole){
    var sx,y1,y2;
    if(s>=4){sx=xl+sw/2;y1=yy+0.168*sp;y2=g.y(st,Math.min(s-7,4));}
    else {sx=xl+hw-sw/2;y1=yy-0.168*sp;y2=g.y(st,Math.max(s+7,4));}
    q+='<line class="stem" x1="'+f(sx)+'" x2="'+f(sx)+'" y1="'+f(y1)+'" y2="'+f(y2)+'" stroke-width="'+sw+'"/>';
  }
  q+='<use href="'+(whole?"#g-headw":it.dur===2?"#g-headh":"#g-head")+'" class="head" transform="translate('+f(xl)+' '+f(yy)+') scale('+sp+')"/>';
  // Nas duas pautas, os nomes da clave de Sol ficam acima dela e os da clave de Fá abaixo.
  var above=g.grand&&st==="sol", ly=above?top-3.9*sp:yB+4.3*sp, step=1.3*(it.lsize||12);
  if(it.label) q+='<text class="lbl '+(it.lcls||"")+'" x="'+f(it.x)+'" y="'+f(ly)+'" font-size="'+f(it.lsize)+'" text-anchor="middle">'+it.label+'</text>';
  if(it.finger) q+='<text class="fing" x="'+f(it.x)+'" y="'+f(above?ly-step:ly+step)+'" font-size="'+f(it.lsize*0.92)+'" text-anchor="middle">'+it.finger+'</text>';
  return q+"</g>";
}

function systemSVG(o){
  var sp=o.sp, sts=o.staves, grand=sts.length>1, lw=Math.max(1,f(0.1*sp)), half=(lw===1?0.5:0);
  var tops={}; tops[sts[0]]=Math.round(o.topPad*sp)+half;
  if(grand) tops[sts[1]]=tops[sts[0]]+Math.round((4+GAP)*sp);
  var yTop=tops[sts[0]], yEnd=tops[sts[sts.length-1]]+4*sp, H=Math.ceil(yEnd+o.bottom*sp);
  var g={sp:sp,tops:tops,grand:grand,y:function(st,s){return f(tops[st]+(8-s)*sp/2);}};
  var x0=1+(grand?(BRACE_W+0.35)*sp:0), xe=o.endX, p=[], bw=Math.max(1,f(0.13*sp));
  if(o.band) p.push('<rect class="band" x="'+f(o.band.x)+'" y="'+f(0.2*sp)+'" width="'+f(o.band.w)+'" height="'+f(H-0.4*sp)+'" rx="'+f(0.45*sp)+'"/>');
  sts.forEach(function(st){
    for(var i=0;i<5;i++){var ly=g.y(st,i*2);p.push('<line class="sl" x1="'+f(x0)+'" x2="'+f(xe)+'" y1="'+ly+'" y2="'+ly+'" stroke-width="'+lw+'"/>');}
  });
  if(grand){
    p.push('<use href="#g-brace" class="gl" transform="translate(1 '+f(yTop-0.1*sp)+') scale('+f(BRACE_W*sp)+' '+f(yEnd-yTop+0.2*sp)+')"/>');
    p.push('<line class="bar" x1="'+f(x0+bw/2)+'" x2="'+f(x0+bw/2)+'" y1="'+f(yTop)+'" y2="'+f(yEnd)+'" stroke-width="'+bw+'"/>');
  }
  sts.forEach(function(st){
    var cl=CLEFS[st];
    p.push('<use href="'+cl.glyph+'" class="gl" transform="translate('+f(x0+0.45*sp)+' '+g.y(st,cl.anchor)+') scale('+sp+')"/>');
    if(o.ts){
      p.push('<use href="#g-ts4" class="gl" transform="translate('+f(o.tsX)+' '+g.y(st,6)+') scale('+sp+')"/>');
      p.push('<use href="#g-ts4" class="gl" transform="translate('+f(o.tsX)+' '+g.y(st,2)+') scale('+sp+')"/>');
    }
  });
  if(o.mnum) p.push('<text class="mnum" x="'+f(x0+0.15*sp)+'" y="'+f(yTop-1.2*sp)+'" font-size="'+f(Math.max(11,1.2*sp))+'">'+o.mnum+'</text>');
  (o.bars||[]).forEach(function(bx){p.push('<line class="bar" x1="'+f(bx)+'" x2="'+f(bx)+'" y1="'+f(yTop)+'" y2="'+f(yEnd)+'" stroke-width="'+bw+'"/>');});
  if(o.final){
    var tw=0.5*sp, tx=xe-tw, thin=tx-0.4*sp-bw/2;
    p.push('<rect class="thick" x="'+f(tx)+'" y="'+f(yTop-lw/2)+'" width="'+f(tw)+'" height="'+f(yEnd-yTop+lw)+'"/>');
    p.push('<line class="bar" x1="'+f(thin)+'" x2="'+f(thin)+'" y1="'+f(yTop)+'" y2="'+f(yEnd)+'" stroke-width="'+bw+'"/>');
  } else if(o.endBar){
    p.push('<line class="bar" x1="'+f(xe-bw/2)+'" x2="'+f(xe-bw/2)+'" y1="'+f(yTop)+'" y2="'+f(yEnd)+'" stroke-width="'+bw+'"/>');
  }
  o.items.forEach(function(it){p.push(noteSVG(it,g));});
  var size=o.fixed?' width="'+Math.ceil(o.W)+'" height="'+H+'"':' class="staff"';
  return '<svg'+size+' viewBox="0 0 '+f(o.W)+' '+H+'" role="img" aria-label="'+o.aria+'" xmlns="http://www.w3.org/2000/svg">'+p.join("")+"</svg>";
}

/* ---------- geração de notas ---------- */
/* Prioridade de cada nota no treino.
   1. Avaliação inicial: enquanto uma nota não foi respondida duas vezes, ela tem peso alto (6), para aparecer mais.
   2. Depois, o peso cresce com os erros recentes (últimas 6 respostas) e com a demora
      (mediana dos últimos 5 acertos comparada ao seu tempo típico). Notas fáceis continuam aparecendo. */
var RECENT=6, TIMES=5, FRESH_N=2;
function typicalMs(){
  var all=[];
  pool().forEach(function(n){var p=stats.per[perKey(n)];if(p&&p.t)all=all.concat(p.t);});
  return all.length>=5?median(all):0;
}
function noteInfo(n,ref){return statInfo(stats.per[perKey(n)],ref);}
// Peso de um item a partir do histórico p = {n, w, r, t}. Vale para as notas e para os acordes.
function statInfo(p,ref){
  if(!p||p.n<FRESH_N) return {fresh:true,weight:6};
  var r=p.r&&p.r.length?p.r:null;
  var errs=r?r.filter(function(x){return x===1;}).length:p.w, tot=r?r.length:p.n, err=tot?errs/tot:0;
  var med=p.t&&p.t.length?median(p.t):0;
  var slow=(med&&ref)?clamp(med/ref-1,0,2):0;
  return {fresh:false,errs:errs,tot:tot,err:err,med:med,slow:slow,weight:1+4*err+1.5*slow};
}
function coverage(){
  var l=pool(), seen=l.filter(function(n){var p=stats.per[perKey(n)];return p&&p.n>=FRESH_N;}).length;
  return {seen:seen,total:l.length,done:seen>=l.length};
}
function pickDrill(prev,line){
  var set=pool(), ref=typicalMs();
  return weighted(set,set.map(function(n){
    if(prev&&n.d===prev.d&&n.st===prev.st) return 0;
    var w=noteInfo(n,ref).weight;
    // Cada repetição na mesma pauta corta o peso pela metade, para espaçar as repetições.
    line.forEach(function(m){if(m.d===n.d&&m.st===n.st)w*=0.5;});
    return w;
  }));
}
// Escolhe a próxima nota de uma melodia, preferindo passos curtos; boost(d) reforça algumas notas.
function pickMelodic(set,prev,boost){
  return weighted(set,set.map(function(d){
    var w=1;
    if(prev!=null){var k=Math.abs(d-prev);w=k===0?0.35:k<=2?3:k<=4?2:0.7;}
    return boost?w*boost(d):w;
  }));
}
