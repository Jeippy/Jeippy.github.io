/* Aba Acordes: os 12 acordes maiores, séries (sorteios, ciclo de quintas, I–IV–V–I), conferência pelo teclado MIDI,
   desenho do teclado e estatísticas por acorde e por troca. */
"use strict";

/* ---------- acordes ---------- */
/* Os 12 acordes maiores em tríade. Um acorde é {L: letra da fundamental (0 = Dó), a: acidente (-1 bemol, 1 sustenido),
   pc: altura de 0 a 11 (0 = Dó), inv: 0 fundamental, 1 e 2 inversões}; na progressão, também {key, deg}.
   Com teclado MIDI o app confere o que você toca; sem ele, você mesmo confere. */
var CROOTS=[[0,0],[4,0],[1,0],[5,0],[2,0],[6,0],[3,1],[1,-1],[5,-1],[2,-1],[6,-1],[3,0]];   // ciclo de quintas: Dó Sol Ré Lá Mi Si Fá♯ Ré♭ Lá♭ Mi♭ Si♭ Fá
// Grupos pelo desenho de teclas brancas e pretas da posição fundamental. roots: índices em CROOTS.
var CGROUPS=[
  {id:"bbb",roots:[0,11,1],desc:function(n){return n[0]+", "+n[1]+" e "+n[2]+": só teclas brancas.";}},
  {id:"bpb",roots:[2,4,3],desc:function(n){return n[0]+", "+n[1]+" e "+n[2]+": branca, preta, branca. A nota do meio é preta.";}},
  {id:"pbp",roots:[7,9,8],desc:function(n){return n[0]+", "+n[1]+" e "+n[2]+": preta, branca, preta. Só a nota do meio é branca.";}},
  {id:"unicos",roots:[6,5,10],desc:function(n){return n[0]+" só tem pretas; "+n[1]+" é branca e duas pretas; "+n[2]+", preta e duas brancas.";}}
];
var CINV=["posição fundamental","1ª inversão","2ª inversão"], CINV_S=["fundamental","1ª inv.","2ª inv."];
var CFING={direita:[[1,3,5],[1,2,5],[1,3,5]],esquerda:[[5,3,1],[5,3,1],[5,2,1]]};   // dedos de baixo para cima, por inversão
var C_COUNTS=[12,24,48];

settings.c=Object.assign({groups:["bbb"],hands:"direita",inv:false,seq:"sorteada",draw:"peso",pace:"livre",beats:4,bpm:60,count:12,shape:false},settings.c||{});
(function(c){
  if(!Array.isArray(c.groups)) c.groups=[];
  c.groups=c.groups.filter(function(id){return CGROUPS.some(function(g){return g.id===id;});});
  if(!c.groups.length) c.groups=["bbb"];
  if(["direita","esquerda","duas"].indexOf(c.hands)<0) c.hands="direita";
  c.inv=c.inv===true;
  if(["sorteada","ciclo","cromatica","progressao","inversoes","ancora"].indexOf(c.seq)<0) c.seq="sorteada";
  if(["peso","todas","dificeis"].indexOf(c.draw)<0) c.draw="peso";
  if(c.pace!=="metro") c.pace="livre";
  c.beats=[4,2,1].indexOf(+c.beats)>=0?+c.beats:4;
  c.bpm=clamp(Math.round(+c.bpm||60),30,160);
  c.count=C_COUNTS.indexOf(+c.count)>=0?+c.count:12;
  c.shape=c.shape===true;
})(settings.c);

// per["altura:inversão"] = {n, w, r, t}, como nas notas; t guarda os últimos tempos de troca.
// pairs["de>para"] = o mesmo para cada troca, com as chaves de per. rounds["sorteio|acordes"] = onde parou a volta
// dos sorteios “Todas as trocas” e “Trocas difíceis” e da sequência “Um com todos” (“ancora|acordes”), separada por
// conjunto de acordes.
function cBlank(){return {answered:0,correct:0,timeMs:0,timed:0,per:{},pairs:{},rounds:{}};}
var cstats=Object.assign(cBlank(),store.get("lcs-chords",{}));
if(!cstats.per||typeof cstats.per!=="object") cstats.per={};
if(!cstats.pairs||typeof cstats.pairs!=="object") cstats.pairs={};
if(!cstats.rounds||typeof cstats.rounds!=="object") cstats.rounds={};
function cSave(){store.set("lcs-chords",cstats);}

function pcOf(L,a){return ((SEMI[L]+a)%12+12)%12;}
function accFor(L,pc){return ((pc-SEMI[L]+18)%12)-6;}
function cItem(L,a,inv,extra){var it={L:L,a:a,pc:pcOf(L,a),inv:inv};if(extra){it.key=extra.key;it.deg=extra.deg;}return it;}
// Fundamental, terça e quinta com a grafia certa (Mi maior: Mi, Sol♯, Si).
function cTones(it){
  return [0,4,7].map(function(semi,i){var l=(it.L+2*i)%7, pc=(it.pc+semi)%12;return {L:l,a:accFor(l,pc),pc:pc};});
}
function cVoice(it){var t=cTones(it);return [[0,1,2],[1,2,0],[2,0,1]][it.inv].map(function(i){return t[i];});}   // de baixo para cima
function cName(it){return cNote(it.L,it.a);}
function cSlash(it){var b=cVoice(it)[0];return it.inv?cName(it)+"/"+cNote(b.L,b.a):cName(it);}
function cKey(it){return it.pc+":"+it.inv;}
function cNeed(){return settings.c.hands==="duas"?6:3;}
function cRoots(){
  var r=[];
  CGROUPS.forEach(function(g){if(settings.c.groups.indexOf(g.id)>=0)r=r.concat(g.roots);});
  return r.sort(function(a,b){return a-b;});   // na ordem do ciclo de quintas
}
// Os mesmos, na ordem do teclado, a partir do Dó.
function cRootsUp(){
  function pc(ri){return pcOf(CROOTS[ri][0],CROOTS[ri][1]);}
  return cRoots().sort(function(a,b){return pc(a)-pc(b);});
}
function cTypical(){
  var all=[];
  Object.keys(cstats.per).forEach(function(k){var p=cstats.per[k];if(p&&p.t)all=all.concat(p.t);});
  return all.length>=5?median(all):0;
}
function cLimit(){return clamp(4*(cTypical()||3000),8000,20000);}
function cBump(p,ok,dt){
  if(!p.r) p.r=[]; if(!p.t) p.t=[];
  p.n++; p.r.push(ok?0:1); if(p.r.length>RECENT) p.r.shift();
  if(!ok) p.w++;
  else if(dt!=null){p.t.push(Math.round(dt));if(p.t.length>TIMES)p.t.shift();}
}
// prev: o acorde anterior na série. Com ele, o resultado também entra na troca de prev para it.
function cRecord(it,ok,dt,prev){
  cstats.answered++; if(ok) cstats.correct++;
  if(dt!=null){cstats.timeMs+=dt;cstats.timed++;}
  var k=cKey(it);
  cBump(cstats.per[k]||(cstats.per[k]={n:0,w:0}),ok,dt);
  if(prev){var pk=cKey(prev)+">"+k;cBump(cstats.pairs[pk]||(cstats.pairs[pk]={n:0,w:0}),ok,dt);}
  cSave();
}

/* ---------- acordes: sequência ---------- */
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
// Inversão que menos move a mão em relação ao acorde anterior (prev: três notas MIDI, de baixo para cima).
function cNearest(L,a,prev){
  var best=null;
  for(var inv=0;inv<3;inv++){
    var it=cItem(L,a,inv), v=cVoice(it).map(function(t){return t.pc;});
    var b=prev[0]+(((v[0]-prev[0])%12)+12)%12; if(b-prev[0]>6) b-=12;
    var n1=b+(v[1]-v[0]+12)%12, n2=n1+(v[2]-v[1]+12)%12;
    // O último termo puxa a mão de volta para perto do Dó central, para ela não ir subindo ou descendo o teclado.
    var cost=Math.abs(b-prev[0])+Math.abs(n1-prev[1])+Math.abs(n2-prev[2])+0.3*Math.abs((b+n2)/2-64);
    if(!best||cost<best.cost) best={it:it,notes:[b,n1,n2],cost:cost};
  }
  return best;
}
// Os acordes escolhidos, nas posições que valem (só a fundamental, ou as três).
function cSetItems(){
  var invs=settings.c.inv?[0,1,2]:[0], out=[];
  cRoots().forEach(function(ri){invs.forEach(function(v){out.push(cItem(CROOTS[ri][0],CROOTS[ri][1],v));});});
  return out;
}
function cRoundKey(pre){return (pre||settings.c.draw)+"|"+cRoots().join(".")+(settings.c.inv?"i":"f");}
// Todas as trocas entre acordes de fundamentais diferentes, como "de>para".
function cAllPairs(items){
  var out=[];
  items.forEach(function(a){items.forEach(function(b){if(a.pc!==b.pc)out.push(cKey(a)+">"+cKey(b));});});
  return out;
}
// Dificuldade de uma troca pelo movimento da mão: os semitons que os três dedos andam (para a oitava mais perto),
// mais 3 por tecla que troca entre branca e preta e mais 3 se a inversão muda, porque a abertura dos dedos muda.
var C_BLACK={1:1,3:1,6:1,8:1,10:1};
function cPitches(it){var v=cVoice(it), p0=v[0].pc, p1=p0+(v[1].pc-v[0].pc+12)%12;return [p0,p1,p1+(v[2].pc-v[1].pc+12)%12];}
function cMove(a,b){
  var A=cPitches(a), B=cPitches(b), best=-1, cor=0, k, i, d;
  for(k=-1;k<=1;k++){d=0;for(i=0;i<3;i++)d+=Math.abs(B[i]+12*k-A[i]);if(best<0||d<best)best=d;}
  for(i=0;i<3;i++) if(!C_BLACK[A[i]%12]!==!C_BLACK[B[i]%12]) cor++;
  return best+3*cor+(a.inv!==b.inv?3:0);
}
// Depois de a troca sair duas vezes, a nota do movimento é multiplicada pela sua demora nela em relação ao seu tempo
// típico (de 0,5 a 2 vezes) e cresce com os erros recentes.
function cHardness(a,b,ref){
  var s=cMove(a,b), p=cstats.pairs[cKey(a)+">"+cKey(b)];
  if(!p||p.n<FRESH_N) return s;
  var r=p.r&&p.r.length?p.r:[], err=r.length?r.filter(function(x){return x===1;}).length/r.length:0;
  var med=p.t&&p.t.length?median(p.t):0;
  return s*(med&&ref?clamp(med/ref,0.5,2):1)*(1+err);
}

/* “Todas as trocas”: cada troca entre os acordes escolhidos sai uma vez por volta (o que também faz cada acorde
   sair o mesmo número de vezes). A volta continua de uma série para a outra: rounds guarda as trocas que faltam
   (left), o último acorde tocado (last) e quantas voltas já se completaram (laps). Cada série começa nesse último
   acorde, para a troca entre uma série e a seguinte também contar. */
// Caminho que passa uma vez por cada troca de left, começando em start (Hierholzer, com as saídas embaralhadas).
function cEuler(left,start){
  var adj={}, st=[start], path=[];
  shuffle(left.slice()).forEach(function(e){var p=e.split(">");(adj[p[0]]||(adj[p[0]]=[])).push(p[1]);});
  while(st.length){var v=st[st.length-1];if(adj[v]&&adj[v].length)st.push(adj[v].pop());else path.push(st.pop());}
  path.reverse();
  // Só vale se usou cada troca uma vez, em sequência.
  var cnt={}; left.forEach(function(e){cnt[e]=1;});
  if(path.length!==left.length+1) return null;
  for(var i=1;i<path.length;i++){var e=path[i-1]+">"+path[i];if(!cnt[e])return null;cnt[e]=0;}
  return path;
}
function cGenAll(n,items){
  var keys={}; items.forEach(function(it){keys[cKey(it)]=it;});
  var all=cAllPairs(items), rk=cRoundKey(), st=cstats.rounds[rk], laps=st&&+st.laps||0;
  var left=st&&Array.isArray(st.left)?st.left.filter(function(e){var p=e.split(">");return keys[p[0]]&&keys[p[1]]&&keys[p[0]].pc!==keys[p[1]].pc;}):all.slice();
  if(!left.length) left=all.slice();
  var cur=st&&keys[st.last]?st.last:cKey(items[Math.floor(Math.random()*items.length)]), seq=[cur];
  while(seq.length<n){
    var path=cEuler(left,cur);
    if(!path){left=all.slice();path=cEuler(left,cur);}   // dados inconsistentes: recomeça a volta
    var take=Math.min(path.length-1,n-seq.length), used={};
    for(var i=1;i<=take;i++){used[path[i-1]+">"+path[i]]=1;seq.push(path[i]);}
    left=left.filter(function(e){return !used[e];});
    if(!left.length){laps++;left=all.slice();}
    cur=seq[seq.length-1];
  }
  C.round={k:rk,draw:"todas",E:all.length,laps:st&&+st.laps||0,st:{left:left,last:cur,laps:laps}};
  return seq.map(function(k){var it=keys[k];return cItem(it.L,it.a,it.inv);});
}

/* “Trocas difíceis”: cada acorde sai uma vez por volta, e cada troca é uma das difíceis. rounds guarda os acordes
   que faltam na volta (left) e o último tocado (last). */
// Para não ficar previsível, cada acorde precisa de pelo menos 8 saídas (acordes de outra fundamental).
function cHardOk(){return (cRoots().length-1)*(settings.c.inv?3:1)>=8;}
// Trocas difíceis: o terço de cima (pelo menos 3) das saídas de cada acorde e também das chegadas a cada acorde,
// para todo acorde ter por onde chegar. Empates são sorteados. Devolve, para cada acorde, para onde ele pode ir.
function cHardExits(items,ref){
  var ex={}, h={}, take=Math.max(3,Math.ceil((items.length-items.length/cRoots().length)/3));
  items.forEach(function(a){var ka=cKey(a);ex[ka]={};h[ka]={};items.forEach(function(b){if(a.pc!==b.pc)h[ka][cKey(b)]=cHardness(a,b,ref);});});
  function top(l){
    return l.map(function(x){return {x:x,r:Math.random()};}).sort(function(p,q){return q.x.h-p.x.h||p.r-q.r;}).slice(0,take).map(function(p){return p.x;});
  }
  items.forEach(function(it){
    var k=cKey(it), outs=[], ins=[];
    Object.keys(h[k]).forEach(function(o){outs.push({a:k,b:o,h:h[k][o]});ins.push({a:o,b:k,h:h[o][k]});});
    top(outs).concat(top(ins)).forEach(function(e){ex[e.a][e.b]=1;});
  });
  Object.keys(ex).forEach(function(k){ex[k]=Object.keys(ex[k]);});
  return ex;
}
// Caminho que passa uma vez por cada acorde de left, só por trocas difíceis, saindo de cur (ou de qualquer um, sem
// cur). Busca em profundidade, indo primeiro para quem tem menos saídas para os que faltam; desiste após 20 mil passos.
function cHardPath(ex,cur,left){
  var rest={}, path=[], steps=0;
  left.forEach(function(k){rest[k]=1;});
  function onward(k){return ex[k].filter(function(x){return rest[x];}).length;}
  function go(from){
    if(path.length===left.length) return true;
    if(++steps>20000) return false;
    var c=(from?ex[from]:left).filter(function(x){return rest[x];})
      .map(function(k){return {k:k,v:onward(k)+Math.random()};}).sort(function(p,q){return p.v-q.v;});
    for(var i=0;i<c.length&&steps<=20000;i++){
      rest[c[i].k]=0; path.push(c[i].k);
      if(go(c[i].k)) return true;
      rest[c[i].k]=1; path.pop();
    }
    return false;
  }
  return go(cur)?path:null;
}
// Sem caminho assim: o primeiro passo, por trocas difíceis, do caminho mais curto até um acorde que falta.
function cHardBridge(ex,cur,left){
  var inLeft={}, prev={}, q=[cur], seen={};
  left.forEach(function(k){inLeft[k]=1;}); seen[cur]=1;
  while(q.length){
    var v=q.shift(), nb=shuffle(ex[v].slice());
    for(var i=0;i<nb.length;i++){
      var w=nb[i]; if(seen[w]) continue;
      seen[w]=1; prev[w]=v;
      if(inLeft[w]){while(prev[w]!==cur)w=prev[w];return w;}
      q.push(w);
    }
  }
  return ex[cur][Math.floor(Math.random()*ex[cur].length)];
}
function cGenHard(n,items){
  var keys={}, all=items.map(function(it){var k=cKey(it);keys[k]=it;return k;});
  var ex=cHardExits(items,cTypical()), rk=cRoundKey(), st=cstats.rounds[rk], laps=st&&+st.laps||0;
  var left=st&&Array.isArray(st.left)?st.left.filter(function(k){return keys[k];}):[];
  if(!left.length) left=all.slice();
  var cur=st&&keys[st.last]?st.last:null, seq=[];
  function add(k){
    seq.push(k); cur=k;
    var i=left.indexOf(k); if(i<0) return;
    left.splice(i,1); if(!left.length){laps++;left=all.slice();}
  }
  while(seq.length<n){
    var path=cHardPath(ex,cur,left);
    if(path) path.slice(0,n-seq.length).forEach(add);
    else add(cur?cHardBridge(ex,cur,left):left[Math.floor(Math.random()*left.length)]);   // repete um acorde no caminho
  }
  C.round={k:rk,draw:"dificeis",laps:st&&+st.laps||0,st:{left:left,last:cur,laps:laps}};
  return seq.map(function(k){var it=keys[k];return cItem(it.L,it.a,it.inv);});
}
// Texto do andamento da volta de “Todas as trocas”.
function cRoundTxt(){
  var items=cSetItems(), E=cAllPairs(items).length, st=cstats.rounds[cRoundKey()];
  var left=st&&Array.isArray(st.left)?st.left.length:E, laps=st&&+st.laps||0;
  return "Volta "+(laps+1)+": "+(E-left).toLocaleString("pt-BR")+" de "+E.toLocaleString("pt-BR")+" trocas.";
}

/* “Um com todos”: um acorde fica fixo e vai e volta para cada um dos outros (Dó, Ré♭, Dó, Ré… Si, Dó), e assim cada
   troca com ele sai nos dois sentidos. Cada série fixa um acorde, subindo pelo teclado a partir do Dó; com inversões,
   cada posição é um fixo. rounds guarda o fixo da próxima série (next), que só avança com a série terminada. */
function cAncoraItems(){return cSetItems().sort(function(a,b){return a.pc-b.pc||a.inv-b.inv;});}
function cAncoraIdx(items){
  var st=cstats.rounds[cRoundKey("ancora")];
  for(var i=0;i<items.length;i++) if(st&&cKey(items[i])===st.next) return i;
  return 0;
}
function cGenAncora(){
  var items=cAncoraItems(), n=items.length, i=cAncoraIdx(items), A=items[i], out=[A];
  // Os outros, a partir do seguinte ao fixo e dando a volta; as outras posições do próprio fixo ficam de fora.
  for(var j=1;j<n;j++){var X=items[(i+j)%n];if(X.pc!==A.pc)out.push(X,A);}
  C.round={k:cRoundKey("ancora"),draw:"ancora",i:i,n:n,st:{next:cKey(items[(i+1)%n])}};
  return out.map(function(it){return cItem(it.L,it.a,it.inv);});
}
function cAncoraTxt(){
  var items=cAncoraItems(), i=cAncoraIdx(items);
  return "Agora: "+cSlash(items[i])+" com cada um ("+(i+1)+" de "+items.length+").";
}
// Texto do resultado: o que vem na série seguinte.
function cAncoraProg(rd){
  var items=cAncoraItems();
  if(rd.i+1>=rd.n) return "Volta completa: cada acorde já foi o fixo. A próxima série recomeça com "+cSlash(items[0])+".";
  return "Na próxima série, "+cSlash(items[(rd.i+1)%items.length])+" com cada um.";
}

/* “Cromática”: os acordes na ordem do teclado, subindo e descendo (com os 12, de semitom em semitom), começando
   no mais grave na fundamental. Sem inversões, a virada não repete o acorde. Com inversões, cada subida ou descida
   é numa posição: na virada, o mesmo acorde passa para a posição seguinte (fundamental, 1ª, 2ª, fundamental…). */
function cGenCrom(n){
  var r=cRootsUp(), m=r.length, out=[], i=0, inv=0, up=true;
  while(out.length<n){
    var R=CROOTS[r[i]]; out.push(cItem(R[0],R[1],inv));
    if(up?i<m-1:i>0) i+=up?1:-1;
    else {up=!up; if(settings.c.inv) inv=(inv+1)%3; else i+=up?1:-1;}
  }
  return out;
}

/* “Inversões”: cada acorde sobe e desce pelas posições, como quem sobe o teclado e volta: fundamental, 1ª, 2ª,
   fundamental uma oitava acima, 2ª, 1ª e fundamental. Depois vem o seguinte, na ordem do teclado. O app não confere
   a oitava, então a fundamental de cima também vale tocada no lugar. */
var C_INV_UP=[0,1,2,0,2,1,0];
function cGenInv(){
  var out=[];
  cRootsUp().forEach(function(ri){var R=CROOTS[ri];C_INV_UP.forEach(function(v){out.push(cItem(R[0],R[1],v));});});
  return out;
}

function cGen(){
  var c=settings.c, roots=cRoots(), n=c.count, out=[], i;
  C.round=null;
  if(c.seq==="progressao"){
    // I–IV–V–I em cada tom, com I na fundamental, IV na 2ª inversão e V na 1ª: a mão quase não sai do lugar.
    var order=[], last=null;
    while(out.length<n){
      if(!order.length){order=shuffle(roots.slice());if(order.length>1&&order[0]===last)order.push(order.shift());}
      var ki=order.shift(), K=CROOTS[ki], kpc=pcOf(K[0],K[1]); last=ki;
      [[0,0,0,"I"],[3,5,2,"IV"],[4,7,1,"V"],[0,0,0,"I"]].forEach(function(d){
        var l=(K[0]+d[0])%7, pc=(kpc+d[1])%12;
        out.push(cItem(l,accFor(l,pc),d[2],{key:{L:K[0],a:K[1]},deg:d[3]}));
      });
    }
  } else if(c.seq==="ancora"){
    out=cGenAncora();   // a série tem o tamanho da volta do fixo, não o de settings.c.count
  } else if(c.seq==="inversoes"){
    out=cGenInv();   // um bloco de 7 por acorde escolhido, também sem settings.c.count
  } else if(c.seq==="cromatica"){
    out=cGenCrom(n);
  } else if(c.seq==="ciclo"){
    var prev=null;
    for(i=0;i<n;i++){
      var R0=CROOTS[roots[i%roots.length]], it;
      if(c.inv&&prev){var bst=cNearest(R0[0],R0[1],prev);it=bst.it;prev=bst.notes;}
      else {it=cItem(R0[0],R0[1],0);var b=60+it.pc;if(it.pc>6)b-=12;prev=[b,b+4,b+7];}
      out.push(it);
    }
  } else if(c.draw==="todas"){
    out=cGenAll(n,cSetItems());
  } else if(c.draw==="dificeis"&&cHardOk()){
    out=cGenHard(n,cSetItems());
  } else {
    // Pelo desempenho: os que você erra ou demora mais têm mais peso; nunca o mesmo acorde duas vezes seguidas.
    var cands=cSetItems(), ref=cTypical();
    for(i=0;i<n;i++){
      var pv=out[i-1], recent=out.slice(Math.max(0,i-4));
      out.push(weighted(cands,cands.map(function(cd){
        if(pv&&cd.pc===pv.pc&&cd.inv===pv.inv) return 0;
        var w=statInfo(cstats.per[cKey(cd)],ref).weight;
        if(pv&&cd.pc===pv.pc) w*=0.3;
        recent.forEach(function(m){if(m.pc===cd.pc&&m.inv===cd.inv)w*=0.5;});
        return w;
      })));
    }
  }
  return out;
}

/* ---------- acordes: teclado MIDI ---------- */
function cHeld(){return Object.keys(MIDI.held).map(Number).sort(function(a,b){return a-b;});}
// Certo: três notas por mão, de baixo para cima na ordem da inversão, juntas (dentro de uma oitava).
function cMatches(notes,it){
  var need=cNeed(), v=cVoice(it);
  if(notes.length!==need) return false;
  for(var g=0;g<need;g+=3){
    if(notes[g]%12!==v[0].pc||notes[g+1]%12!==v[1].pc||notes[g+2]%12!==v[2].pc||notes[g+2]-notes[g]>=12) return false;
  }
  return true;
}
function cDiagnose(notes,it){
  var tones=cTones(it), v=cVoice(it), need=cNeed(), pcs=tones.map(function(t){return t.pc;});
  var flat=tones.some(function(t){return t.a<0;});
  function nm(pc){var i=pcs.indexOf(pc);return i>=0?cNote(tones[i].L,tones[i].a):cPcName(pc,flat);}
  var played=[]; notes.forEach(function(x){if(played.indexOf(x%12)<0)played.push(x%12);});
  var wrong=played.filter(function(pc){return pcs.indexOf(pc)<0;}), missing=pcs.filter(function(pc){return played.indexOf(pc)<0;});
  var head=cName(it)+(it.inv?", "+CINV[it.inv]:"")+": "+cList(v.map(function(t){return cNote(t.L,t.a);}))+".";
  if(wrong.length===1&&missing.length===1) return head+" O "+nm(wrong[0])+" deveria ser "+nm(missing[0])+".";
  if(wrong.length&&wrong.length===played.length) return head+" Você tocou "+cList(played.map(nm))+".";
  if(wrong.length||missing.length){
    var s=[];
    if(wrong.length) s.push((wrong.length>1?"sobraram ":"sobrou ")+cList(wrong.map(nm)));
    if(missing.length) s.push((missing.length>1?"faltaram ":"faltou ")+cList(missing.map(nm)));
    var t=s.join("; ")+".";
    return head+" "+t.charAt(0).toUpperCase()+t.slice(1);
  }
  if(notes.length!==need) return head+(need===3?" As notas estão certas, mas toque só três, com uma mão.":" As notas estão certas, mas toque três em cada mão: a esquerda embaixo, a direita em cima.");
  for(var g=0;g<need;g+=3){
    if(notes[g]%12!==v[0].pc) return head+" As notas estão certas, mas "+(need===6?(g?"na mão direita ":"na mão esquerda "):"")+"a de baixo deveria ser "+nm(v[0].pc)+".";
  }
  return head+" As notas estão certas, mas junte as três, sem pular para a outra oitava.";
}

/* ---------- acordes: série ---------- */
/* Duas formas de trocar. No meu tempo: o próximo acorde aparece quando o atual é reconhecido, e a troca é o tempo
   entre completar um acorde e completar o seguinte. Com metrônomo: cada acorde dura N tempos depois de um compasso
   de contagem; cada um vale do meio tempo antes do seu tempo 1 até o fim da sua vez. */
var C={state:"idle",items:[],res:[],idx:0,mode:"self",pace:"livre",N:4,slot:-1,fin:0,startPerf:0,beatMs:0,lastT:null,shownT:0,revealT:0,
  asked:false,revealed:false,interrupted:false,pend:0,raf:0,bus:null,wake:null};
var cHost=document.getElementById("c-kbd"), cFb=document.getElementById("c-feedback"), cResult=document.getElementById("c-result");
function cFeedback(t,cls){cFb.textContent=t||"";cFb.className="feedback"+(cls?" "+cls:"");}
function cT(k){return C.startPerf+k*C.N*C.beatMs;}
function cOkWin(){return clamp(0.15*C.beatMs,60,140);}
function cNew(){
  C.items=cGen(); C.res=[]; C.idx=0; C.slot=-1; C.asked=false; C.revealed=settings.c.shape;
  cResult.hidden=true; cFeedback(""); cRender();
}
function cWake(){
  try{if(navigator.wakeLock)navigator.wakeLock.request("screen").then(function(w){if(C.state==="idle"){try{w.release();}catch(e){}}else C.wake=w;}).catch(function(){});}catch(e){}
}
function cStart(){
  if(C.state!=="idle") return;
  var c=settings.c;
  C.mode=MIDI.state==="on"?"midi":"self"; C.pace=c.pace; C.N=c.beats;
  C.res=C.items.map(function(){return {st:null,err:false,dt:null,off:null,played:null};});
  C.idx=0; C.slot=-1; C.fin=0; C.open=-1; C.lastT=null; C.asked=false; C.revealed=c.shape; C.interrupted=false;
  MIDI.dirty=false; cResult.hidden=true; cFeedback("");
  // No tablet deitado os ajustes ocupam o alto da tela: rola até o cartão para o acorde ficar à vista.
  var card=document.querySelector("#panel-acordes .card"), rc=card.getBoundingClientRect();
  if(rc.top<0||rc.bottom>window.innerHeight) card.scrollIntoView({block:"start",behavior:"smooth"});
  if(C.pace==="livre"){C.state="run";C.shownT=performance.now();cWake();cRender();return;}
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){cFeedback("Este navegador não consegue tocar o metrônomo.","bad");return;}
  actx=actx||new AC();
  var ctx=actx;
  C.state="starting"; cRender();
  Promise.resolve(ctx.state==="suspended"?ctx.resume():null).then(function(){
    if(C.state!=="starting") return;
    var beat=60/c.bpm, bus=ctx.createGain(); bus.connect(ctx.destination); C.bus=bus;
    var T0=ctx.currentTime+0.35, total=4+C.items.length*C.N;
    // Um compasso de contagem; depois, o clique agudo marca cada troca (com 1 tempo por acorde, o começo de cada 4).
    for(var k=0;k<total;k++) rClick(ctx,bus,T0+k*beat,k===0||(k>=4&&(k-4)%(C.N>1?C.N:4)===0));
    C.beatMs=beat*1000; C.startPerf=rPerfAt(ctx,T0)+4*C.beatMs;
    C.state="run"; cWake(); cRender();
    C.raf=requestAnimationFrame(cTick);
  }).catch(function(){C.state="idle";cFeedback("Não foi possível ligar o som. Toque em “Começar” de novo.","bad");cRender();});
}
function cTick(){
  if(C.state!=="run") return;
  var now=performance.now(), bm=C.beatMs, rel=now-C.startPerf, n=C.items.length, slotMs=C.N*bm;
  var slot=rel<0?-1:Math.min(Math.floor(rel/slotMs),n-1);
  // A virada não apaga MIDI.dirty: um acorde errado tocado logo antes dela ainda precisa ser avaliado (cMaybeWrong).
  if(slot!==C.slot){
    C.slot=slot; C.idx=Math.max(0,slot);
    C.revealed=settings.c.shape||(slot>=0&&C.res[slot].err);
    cRender();
  }
  // Sem teclado, o desenho aparece na metade de cada acorde, para você comparar com o que tocou.
  if(C.mode==="self"&&!C.revealed&&rel>=0&&rel-Math.max(0,slot)*slotMs>=slotMs/2){C.revealed=true;cRenderKbd();cRenderFing();}
  var beat=rel<-4*bm?"":rel<0?Math.floor((rel+4*bm)/bm)+1:Math.min(Math.floor((rel-Math.max(0,slot)*slotMs)/bm)+1,C.N);
  var bEl=document.getElementById("c-beat"); if(bEl.textContent!==String(beat)) bEl.textContent=beat;
  // Fecha os acordes cuja vez passou sem que você os tocasse.
  while(C.fin<n&&now>=cT(C.fin+1)){
    var r=C.res[C.fin];
    if(C.mode==="midi"&&!r.st){r.st="bad";r.miss=true;cRecord(C.items[C.fin],false,null,C.items[C.fin-1]);}
    C.fin++;
  }
  // Quando a vez de um acorde abre, as notas já apertadas que mudaram desde o último acorde reconhecido são avaliadas:
  // um acorde errado tocado antes e segurado na virada também conta como erro.
  var open=-1; for(var j=C.fin;j<n&&cT(j)-0.5*bm<=now;j++) open=j;
  if(open!==C.open){C.open=open;if(C.mode==="midi"&&MIDI.dirty)cMaybeWrong();}
  if(C.mode==="midi") cMetroCheck();
  if(now>=cT(n)+400){cFinish();return;}
  C.raf=requestAnimationFrame(cTick);
}
function cOnNotes(){
  if(settings.tab!=="acordes") return;
  cRenderKbd();
  // No meu tempo, tocar o primeiro acorde já começa a série: as mãos não precisam sair do teclado.
  if(C.state==="idle"&&settings.c.pace==="livre"&&MIDI.dirty&&cMatches(cHeld(),C.items[0])) cStart();
  if(C.state!=="run"||C.mode!=="midi") return;
  if(C.pace==="metro"){cMetroCheck();cMaybeWrong();return;}
  if(cMatches(cHeld(),C.items[C.idx])) cLivreHit(); else cMaybeWrong();
}
function cLivreHit(){
  clearTimeout(C.pend);
  var it=C.items[C.idx], r=C.res[C.idx], dt=null;
  if(C.idx>0&&!r.err&&C.lastT!=null&&!C.interrupted){dt=MIDI.setT-C.lastT;if(dt>cLimit())dt=null;}
  r.st=r.err?"bad":"ok"; r.dt=dt; cRecord(it,!r.err,dt,C.items[C.idx-1]);
  C.lastT=MIDI.setT; C.interrupted=false; MIDI.dirty=false;
  cFeedback(r.err?"Agora sim: "+cSlash(it)+".":"Certo"+(dt!=null?": troca em "+fmt1(dt/1000)+" s.":"."),r.err?"":"ok");
  cAdvance();
}
function cAdvance(){
  C.idx++; C.asked=false; C.revealed=settings.c.shape; C.shownT=performance.now();
  if(C.idx>=C.items.length) cFinish(); else cRender();
}
function cMetroCheck(){
  var held=cHeld(); if(held.length!==cNeed()) return;
  var now=performance.now(), bm=C.beatMs;
  for(var k=C.fin;k<C.items.length&&cT(k)-0.5*bm<=now;k++){
    var r=C.res[k]; if(r.st) continue;
    if(!cMatches(held,C.items[k])) continue;
    // Acorde já apertado antes de a vez abrir (por exemplo, durante a contagem): conta como adiantado meio tempo,
    // sem entrar na média de adiantado/atrasado.
    var early=MIDI.setT<cT(k)-0.5*bm, off=early?-0.5*bm:MIDI.setT-cT(k), ms=Math.round(Math.abs(off));
    r.off=off; r.early=early; r.st=r.err?"bad":(!early&&ms<=cOkWin()?"ok":"near");
    cRecord(C.items[k],!r.err,null,C.items[k-1]); MIDI.dirty=false; clearTimeout(C.pend);
    cFeedback(cSlash(C.items[k])+": "+(r.err?"certo depois de um erro":early?"já estava apertado antes da vez; troque no tempo 1"
      :r.st==="ok"?"no tempo":ms+" ms "+(off>0?"atrasado":"adiantado"))+".",r.st==="ok"?"ok":(r.st==="bad"?"bad":""));
    cRenderKbd();
    return;
  }
}
// Erro só quando o conjunto de notas fica parado por um instante: na passagem de um acorde para outro, as notas mudam aos poucos.
function cMaybeWrong(){
  clearTimeout(C.pend);
  var held=cHeld(); if(!MIDI.dirty||held.length<cNeed()) return;
  var sig=held.join(",");
  C.pend=setTimeout(function(){
    if(C.state!=="run"||!MIDI.dirty||cHeld().join(",")!==sig) return;
    var k=C.idx;
    if(C.pace==="metro"){
      // O acorde em jogo é o último cuja vez já abriu (meio tempo antes do tempo 1) e que ainda não foi tocado.
      var now=performance.now(); k=-1;
      for(var j=C.fin;j<C.items.length&&cT(j)-0.5*C.beatMs<=now;j++) if(!C.res[j].st) k=j;
    }
    if(k<0||k>=C.items.length) return;
    var r=C.res[k], it=C.items[k]; if(r.st||cMatches(held,it)) return;
    r.err=true; r.played=held; MIDI.dirty=false; C.revealed=true; C.asked=true;
    cFeedback(cDiagnose(held,it)+(C.pace==="livre"?" Toque de novo para seguir.":""),"bad");
    cRender();
  },160);
}
// Botão “Não lembro” (com teclado) ou “Conferir” (sem teclado).
function cCheck(){
  if(C.state!=="run"||C.pace!=="livre"||C.asked) return;
  if(C.mode==="midi"&&settings.c.shape) return;   // o desenho já está à vista: não há o que mostrar, nem erro a marcar
  C.asked=true; C.revealed=true;
  if(C.mode==="midi"){C.res[C.idx].err=true;cFeedback("Toque o acorde do desenho para seguir. Ele conta como erro.","");}
  else {C.revealT=performance.now();cFeedback("Confira no desenho: você acertou?","");}
  cRender();
}
function cMark(ok){
  if(C.state!=="run"||C.mode!=="self"||C.pace!=="livre"||!C.asked) return;
  var it=C.items[C.idx], r=C.res[C.idx], dt=C.revealT-C.shownT;
  if(!ok||C.interrupted||dt>cLimit()) dt=null;
  // O tempo até conferir inclui o toque na tela: aparece no resultado da série, mas não entra na troca média.
  r.st=ok?"ok":"bad"; r.dt=dt; cRecord(it,ok,null,C.items[C.idx-1]); C.interrupted=false;
  cFeedback(ok?"Certo"+(dt!=null?" em "+fmt1(dt/1000)+" s.":"."):"Anotado como erro: "+cSlash(it)+".",ok?"ok":"bad");
  cAdvance();
}
function cRelease(){
  clearTimeout(C.pend); cancelAnimationFrame(C.raf);
  if(C.bus){try{C.bus.disconnect();}catch(e){}C.bus=null;}
  if(C.wake){try{C.wake.release();}catch(e){}C.wake=null;}
}
function cStop(msg){
  if(C.state==="idle") return;
  C.state="idle"; cRelease();
  C.idx=0; C.slot=-1; C.asked=false; C.revealed=settings.c.shape;
  cFeedback(msg||"Série interrompida. Aperte “Começar” para tocar de novo do início.","");
  cRender();
}
function cFinish(){
  C.state="idle"; cRelease();
  var done={items:C.items,res:C.res,mode:C.mode,pace:C.pace,N:C.N,bpm:settings.c.bpm}, rd=C.round;
  // A volta dos sorteios “Todas as trocas” e “Trocas difíceis” e o fixo de “Um com todos” só avançam com a série terminada.
  if(rd){
    cstats.rounds[rd.k]=rd.st; cSave();
    if(rd.draw==="todas") done.prog=(rd.st.laps>rd.laps?"Volta "+rd.st.laps+" completa: cada uma das "+rd.E.toLocaleString("pt-BR")+" trocas saiu uma vez. ":"")+cRoundTxt();
    else if(rd.draw==="ancora") done.prog=cAncoraProg(rd);
  }
  C.items=cGen(); C.res=[]; C.idx=0; C.slot=-1; C.asked=false; C.revealed=settings.c.shape;
  cFeedback(""); cShowResult(done); cRenderStats(); cRenderWeak(); cRenderControls(); cRender();
}
function cShowResult(d){
  var n=d.items.length, cnt={ok:0,near:0,bad:0}, lines=[], html, legend="";
  d.res.forEach(function(r){if(r.st)cnt[r.st]++;});
  function mean(a){return a.reduce(function(s,x){return s+x;},0)/a.length;}
  if(d.mode==="self"&&d.pace==="metro"){
    html='<p class="r-score">Série completa: '+n+' acordes</p>';
    lines.push("Sem teclado conectado, o app não confere o que você tocou. Com o teclado ligado no USB, ele marca cada troca: no tempo, fora do tempo ou errada.");
  } else if(d.pace==="metro"){
    html='<p class="r-score">'+cnt.ok+' de '+n+' no tempo</p>';
    lines.push((cnt.near===1?"1 fora do tempo":cnt.near+" fora do tempo")+" e "+(cnt.bad===1?"1 errado ou não tocado":cnt.bad+" errados ou não tocados")+", a "+d.bpm+" bpm com "+d.N+(d.N>1?" tempos":" tempo")+" por acorde.");
    var offs=d.res.filter(function(r){return r.off!=null&&!r.err&&!r.early;}).map(function(r){return r.off;});
    if(offs.length>=3&&Math.abs(mean(offs))>40) lines.push("Em média você trocou "+Math.round(Math.abs(mean(offs)))+" ms "+(mean(offs)>0?"atrasado: prepare a mão olhando o “Depois” antes do tempo 1.":"adiantado."));
    lines.push(cnt.bad?"Diminua o andamento ou deixe cada acorde durar mais tempos até não sobrar nenhum vermelho."
      :cnt.near?"Repita até ficarem todos verdes.":"Tudo no tempo: suba 5 bpm ou deixe cada acorde durar menos tempos.");
    legend='<span class="dot ok"></span>no tempo &nbsp; <span class="dot near"></span>fora do tempo &nbsp; <span class="dot bad"></span>errado ou não tocado.';
  } else {
    var self=d.mode==="self", times=[], slow=-1;
    d.res.forEach(function(r,i){if(r.dt!=null){times.push(r.dt);if(slow<0||r.dt>d.res[slow].dt)slow=i;}});
    html='<p class="r-score">'+cnt.ok+' de '+n+' certos'+(self?' na sua conferência':'')+'</p>';
    if(times.length) lines.push((self?"Tempo médio até conferir: ":"Troca média: ")+fmt1(mean(times)/1000)+" s. Mais "+(self?"demorado":"lenta")+": "+(self||!slow?"":cSlash(d.items[slow-1])+" → ")+cSlash(d.items[slow])+", "+fmt1(d.res[slow].dt/1000)+" s.");
    if(cnt.bad) lines.push("Os acordes em vermelho tiveram erro. Treine-os com o desenho sempre à vista e depois desligue de novo.");
    else if(times.length&&mean(times)>1500) lines.push("Continue no seu tempo até a troca média chegar perto de 1 s.");
    else if(!self) lines.push("Troca rápida e sem erros: passe para o metrônomo, com 4 tempos por acorde a 60 bpm.");
    legend=self?"":'<span class="dot ok"></span>certo &nbsp; <span class="dot bad"></span>com erro. A troca é o tempo entre completar um acorde e completar o seguinte; o primeiro acorde não conta.';
  }
  if(d.prog) lines.push(d.prog);
  html+='<ol class="c-seq" aria-label="Acordes da série">'+d.items.map(function(it,i){var st=d.res[i]&&d.res[i].st;return '<li'+(st?' class="'+st+'"':'')+'>'+cSlash(it)+'</li>';}).join("")+'</ol>';
  lines.forEach(function(s){html+='<p class="r-line">'+s+'</p>';});
  if(legend) html+='<p class="r-legend">'+legend+'</p>';
  cResult.innerHTML=html; cResult.hidden=false;
}

/* ---------- acordes: desenho ---------- */
var KB_W=[0,2,4,5,7,9,11], KB_B={1:1,3:2,6:4,8:5,10:6};   // teclas brancas; pretas: tecla branca à direita delas
function cCurItem(){
  if(C.state!=="idle"&&C.pace==="metro"&&C.slot<0) return C.items[0];
  return C.items[Math.min(C.idx,C.items.length-1)];
}
// Teclado de duas oitavas (três com as duas mãos), a partir de um Dó. O acorde fica com a nota de baixo na primeira oitava.
function cRenderKbd(){
  var cw=cHost.clientWidth; if(!cw) return;
  var c=settings.c, two=c.hands==="duas", oct=two?3:2, nW=7*oct, ww=cw/nW, H=Math.round(Math.min(ww*4.6,170)), bw=ww*0.58, bh=Math.round(H*0.62);
  var it=cCurItem(), show=!!it&&(C.revealed||c.shape), cls={}, fing={}, names={}, target=[];
  if(show){
    var v=cVoice(it), p0=v[0].pc, p1=p0+(v[1].pc-v[0].pc+12)%12, p2=p1+(v[2].pc-v[1].pc+12)%12;
    (two?[["esquerda",0],["direita",12]]:[[c.hands,0]]).forEach(function(h){
      [p0,p1,p2].forEach(function(p,j){var q=p+h[1];target.push(q);cls[q]="t";fing[q]=CFING[h[0]][it.inv][j];names[q]=cNote(v[j].L,v[j].a);});
    });
  }
  // Teclas que você está segurando (ou a última tentativa errada), com as mesmas distâncias entre elas.
  var held=cHeld(), r=C.state!=="idle"&&C.res[C.idx];
  if(!held.length&&show&&r&&r.err&&r.played) held=r.played;
  if(held.length){
    var base=held[0]%12;
    if(show){var dd=((held[0]-target[0])%12+12)%12;if(dd>6)dd-=12;base=target[0]+dd;if(base<0)base+=12;}
    var pcs=show?cTones(it).map(function(t){return t.pc;}):[], flat=show&&cTones(it).some(function(t){return t.a<0;});
    held.forEach(function(nt){
      var q=base+(nt-held[0]); while(q>=oct*12) q-=12;
      if(!show) cls[q]="p";
      else if(cls[q]==="t") cls[q]="g";
      else if(pcs.indexOf(nt%12)<0){cls[q]="x";names[q]=cPcName(nt%12,flat);}
      else if(!cls[q]) cls[q]="p";
    });
  }
  function xOf(q){var o=Math.floor(q/12), pc=q%12;return KB_B[pc]!=null?(o*7+KB_B[pc])*ww:(o*7+KB_W.indexOf(pc)+0.5)*ww;}
  // Os nomes das notas erradas ficam numa segunda linha, para não encostar nos nomes das certas ao lado.
  var hasNames=Object.keys(names).length>0, hasX=Object.keys(names).some(function(k){return cls[k]==="x";});
  var Ht=H+(hasNames?26:2)+(hasX?18:0), fs=f(Math.min(18,ww*0.5)), ns=f(clamp(ww*0.42,11,15));
  var s='<svg class="kbd" viewBox="0 0 '+f(cw)+' '+Ht+'" width="'+f(cw)+'" height="'+Ht+'" role="img" aria-label="'
    +(show?"Teclado com "+cList(target.map(function(q){return names[q];}))+" destacadas":"Teclado")+'">';
  var w, q, o;
  for(w=0;w<nW;w++){q=Math.floor(w/7)*12+KB_W[w%7];s+='<rect class="kw'+(cls[q]?" "+cls[q]:"")+'" x="'+f(w*ww+0.5)+'" y="0.5" width="'+f(ww-1)+'" height="'+H+'" rx="3"/>';}
  for(o=0;o<oct;o++) Object.keys(KB_B).forEach(function(pc){
    var qq=o*12+(+pc);
    s+='<rect class="kbk'+(cls[qq]?" "+cls[qq]:"")+'" x="'+f((o*7+KB_B[pc])*ww-bw/2)+'" y="0.5" width="'+f(bw)+'" height="'+bh+'" rx="2"/>';
  });
  Object.keys(fing).forEach(function(k){
    var qq=+k, blk=KB_B[qq%12]!=null;
    s+='<text class="kfn" x="'+f(xOf(qq))+'" y="'+(blk?bh-8:H-12)+'" font-size="'+fs+'">'+fing[k]+'</text>';
  });
  Object.keys(names).forEach(function(k){
    var bad=cls[k]==="x";
    s+='<text class="knm'+(bad?" x":"")+'" x="'+f(xOf(+k))+'" y="'+(H+19+(bad?18:0))+'" font-size="'+ns+'">'+names[k]+'</text>';
  });
  cHost.innerHTML=s+'</svg>';
}
function cRenderFing(){
  var it=cCurItem(), el=document.getElementById("c-fing"), h=settings.c.hands;
  if(!it||!(C.revealed||settings.c.shape)){el.textContent="";return;}
  var v=cVoice(it).map(function(t){return cNote(t.L,t.a);});
  function line(hand){var fg=CFING[hand][it.inv];return "dedo "+fg[0]+" no "+v[0]+", "+fg[1]+" no "+v[1]+" e "+fg[2]+" no "+v[2];}
  el.textContent=h==="duas"?"Mão esquerda: "+line("esquerda")+". Mão direita, uma oitava acima: "+line("direita")+"."
    :(h==="direita"?"Mão direita: ":"Mão esquerda: ")+line(h)+".";
}
function cSub(it){
  var b=cVoice(it)[0], s=it.deg?it.deg+" no tom de "+cNote(it.key.L,it.key.a):"maior";
  if(it.inv) s+=" · "+CINV[it.inv]+", "+cNote(b.L,b.a)+" embaixo";
  else if(settings.c.inv||it.deg||settings.c.seq==="inversoes") s+=" · "+CINV[0];
  return s;
}
function cRender(){
  var c=settings.c, run=C.state!=="idle", n=C.items.length, it=cCurItem(); if(!it) return;
  var counting=run&&C.pace==="metro"&&C.slot<0, i=counting?0:Math.min(C.idx,n-1), nx=C.items[i+1];
  var midi=run?C.mode==="midi":MIDI.state==="on", metro=run?C.pace==="metro":c.pace==="metro";
  document.getElementById("c-lead").textContent=!run?"Primeiro acorde":counting?"Comece com":"Agora";
  document.getElementById("c-name").textContent=cName(it);
  document.getElementById("c-sub").textContent=cSub(it);
  document.getElementById("c-next-box").hidden=!nx;
  if(nx){
    document.getElementById("c-next").textContent=cName(nx);
    document.getElementById("c-next-sub").textContent=nx.deg?nx.deg+(nx.inv?" · "+CINV_S[nx.inv]:""):(nx.inv?CINV_S[nx.inv]:"");
  }
  if(!(run&&metro)) document.getElementById("c-beat").textContent="";
  cRenderKbd(); cRenderFing();
  document.getElementById("c-controls").disabled=run;
  document.getElementById("c-new").disabled=run;
  document.getElementById("c-go").textContent=run?"Parar":"Começar";
  var livre=run&&C.pace==="livre", chk=document.getElementById("c-check");
  chk.hidden=!(livre&&!C.asked&&!(C.mode==="midi"&&c.shape));
  chk.textContent=C.mode==="midi"?"Não lembro":"Conferir";
  document.getElementById("c-yes").hidden=document.getElementById("c-no").hidden=!(livre&&C.mode==="self"&&C.asked);
  document.getElementById("c-status").textContent=(run?(counting?"Contagem":"Acorde "+(i+1)+" de "+n):n+" acordes")
    +" · "+(c.hands==="duas"?"duas mãos":"mão "+c.hands)+" · "+(metro?c.bpm+" bpm, "+c.beats+(c.beats>1?" tempos":" tempo")+" por acorde":"no seu tempo");
  document.getElementById("c-hint").textContent=midi
    ?(metro?"Depois da contagem, troque de acorde no tempo 1 de cada um; "+((run?C.N:c.beats)>1?"o clique agudo marca a troca.":"o clique agudo marca o começo de cada compasso.")+" Olhe o “Depois” para preparar a mão antes. Esc para parar."
      :(run?"":"Para começar, toque o primeiro acorde ou aperte “Começar”. ")+"O próximo acorde aparece assim que o app reconhece o atual."
        +(c.shape?"":" Se não lembrar, aperte “Não lembro” (ou a barra de espaço) para ver o desenho.")+" Esc para parar.")
    :(metro?"Sem teclado conectado, o app não confere: o desenho aparece na metade de cada acorde para você comparar com o que tocou."
      :"Sem teclado conectado: toque o acorde, aperte “Conferir” para ver o desenho e marque se acertou. No teclado do computador ou num pedal de virar página, → mostra o desenho e depois marca acerto; ← marca erro.");
}

/* ---------- acordes: ajustes e desempenho ---------- */
function cRenderControls(){
  var c=settings.c;
  document.getElementById("c-groups").innerHTML=CGROUPS.map(function(g){
    var nm=g.roots.map(function(ri){return cNote(CROOTS[ri][0],CROOTS[ri][1]);});
    return '<button type="button" class="chip" role="checkbox" id="cg-'+g.id+'" data-cgroup="'+g.id+'" aria-checked="'+(c.groups.indexOf(g.id)>=0)+'">'+nm.join(" · ")+'</button>';
  }).join("");
  [["chand","hands"],["cseq","seq"],["cdraw","draw"],["cpace","pace"]].forEach(function(p){
    document.querySelectorAll("[data-"+p[0]+"]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset[p[0]]===c[p[1]]));});
  });
  document.querySelectorAll("[data-cinv]").forEach(function(b){b.setAttribute("aria-checked",String((b.dataset.cinv==="1")===c.inv));});
  document.querySelectorAll("[data-cbeats]").forEach(function(b){b.setAttribute("aria-checked",String(+b.dataset.cbeats===c.beats));});
  document.querySelectorAll("[data-ccount]").forEach(function(b){b.setAttribute("aria-checked",String(+b.dataset.ccount===c.count));});
  document.getElementById("f-cdraw").hidden=c.seq!=="sorteada";
  // A série dessas duas tem tamanho próprio; e a progressão e as inversões já escolhem as posições.
  document.getElementById("f-ccount").hidden=c.seq==="ancora"||c.seq==="inversoes";
  document.getElementById("f-cinv").hidden=c.seq==="progressao"||c.seq==="inversoes";
  document.getElementById("f-cbeats").hidden=document.getElementById("f-cbpm").hidden=c.pace!=="metro";
  document.getElementById("c-bpm").value=c.bpm;
  document.getElementById("c-bpm-val").textContent=c.bpm;
  document.getElementById("sw-cshape").setAttribute("aria-checked",String(c.shape));
  document.getElementById("cshape-txt").textContent=c.shape?"Sempre à vista":"Só na resposta";
  var sel=CGROUPS.filter(function(g){return c.groups.indexOf(g.id)>=0;});
  var d=(sel.length===CGROUPS.length?"Os 12 acordes maiores. ":"")+sel.map(function(g){return g.desc(g.roots.map(function(ri){return cNote(CROOTS[ri][0],CROOTS[ri][1]);}));}).join(" ");
  if(c.seq==="progressao") d+=" I–IV–V–I em cada tom escolhido, com as inversões que deixam a mão quase parada: I na fundamental, IV na 2ª inversão e V na 1ª.";
  else if(c.seq==="ancora"){
    var an=cAncoraItems(), rn=cRoots().length;
    d+=" Um com todos: o primeiro acorde fica fixo e vai e volta para cada um dos outros, e assim cada troca com ele sai nos dois sentidos."
      +" A série seguinte fixa o próximo, do "+cName(an[0])+" ao "+cName(an[an.length-1])
      +(c.inv?". Com inversões, cada posição é um fixo: são "+an.length+" séries de "+(1+2*3*(rn-1))+" acordes.":", em "+an.length+" séries de "+(2*rn-1)+" acordes.")
      +" “Nova série” pula para o próximo fixo. "+cAncoraTxt();
  }
  else if(c.seq==="cromatica"){
    var cr=cRootsUp(), m=cr.length;
    d+=" Na ordem do teclado, subindo e descendo"+(m===12?" de semitom em semitom":"")+": "+cList(cr.map(function(ri){return cNote(CROOTS[ri][0],CROOTS[ri][1]);}))+".";
    if(c.inv) d+=" Com inversões, cada subida ou descida é numa posição, e na virada o mesmo acorde passa para a seguinte: fundamental, 1ª e 2ª inversão."
      +(c.count<2*m+1?" Para a série chegar à 2ª inversão, escolha "+(2*m+1>24?"48":"24")+" acordes.":"");
  }
  else if(c.seq==="inversoes"){
    var ir=cRootsUp();
    d+=" Inversões: cada acorde sobe e desce pelas posições, como quem sobe o teclado e volta: fundamental, 1ª, 2ª, fundamental uma oitava acima, 2ª, 1ª e fundamental."
      +" Depois vem o seguinte, do "+cNote(CROOTS[ir[0]][0],CROOTS[ir[0]][1])+" ao "+cNote(CROOTS[ir[ir.length-1]][0],CROOTS[ir[ir.length-1]][1])+": são "+7*ir.length+" acordes."
      +(ir.length>3?" Para uma série mais curta, escolha menos grupos.":"");
  }
  else if(c.seq==="ciclo") d+=" Na ordem do ciclo de quintas: "+cList(cRoots().map(function(ri){return cNote(CROOTS[ri][0],CROOTS[ri][1]);}))+"."+(c.inv?" Cada acorde vem na inversão mais perto do anterior, para a mão andar pouco.":"");
  else {
    if(c.inv) d+=" Cada acorde pode vir na fundamental, na 1ª ou na 2ª inversão.";
    if(c.draw==="todas") d+=" Todas as trocas: cada troca entre estes acordes sai uma vez por volta, e assim cada acorde também sai o mesmo número de vezes."
      +" Cada série começa no acorde em que a anterior terminou, e a volta só avança quando você termina a série. "+cRoundTxt();
    else if(c.draw==="dificeis") d+=cHardOk()
      ?" Trocas difíceis: cada acorde sai o mesmo número de vezes, sempre por uma das saídas mais difíceis do acorde anterior: a mão anda mais, mais teclas trocam entre branca e preta, ou a inversão muda."
        +" Depois que uma troca sai duas vezes, ela conta como mais difícil se você demora mais que o seu normal, e mais fácil se troca mais rápido."
      :" Trocas difíceis: com estes acordes, cada um tem poucas saídas e a série ficaria previsível. Escolha pelo menos três grupos na fundamental, ou dois com inversões. Enquanto isso, a série é sorteada pelo desempenho.";
  }
  if(c.hands==="duas") d+=" Com as duas mãos: três notas em cada, a esquerda embaixo.";
  if(!c.shape) d+=" Para começar um grupo novo, deixe o desenho sempre à vista por alguns dias.";
  document.getElementById("c-desc").textContent=d;
}
function cRenderStats(){
  var a=cstats.answered, rows=[
    ["Acordes",a],
    ["Precisão",a?Math.round(cstats.correct/a*100)+"%":"—"],
    ["Troca média",cstats.timed?fmt1(cstats.timeMs/cstats.timed/1000)+" s":"—"]
  ];
  document.getElementById("c-figs").innerHTML=rows.map(function(r){return "<div><dt>"+r[0]+"</dt><dd>"+r[1]+"</dd></div>";}).join("");
}
function cItemOfKey(k){
  var p=k.split(":"), pc=+p[0], inv=+p[1], R1=null;
  CROOTS.forEach(function(rr){if(pcOf(rr[0],rr[1])===pc)R1=rr;});
  return R1&&inv>=0&&inv<3?cItem(R1[0],R1[1],inv):null;
}
function cWeakParts(x){
  var parts=[];
  if(x.errs>0) parts.push('<b>'+x.errs+' de '+x.tot+' com erro</b>');
  if(x.med) parts.push(x.slow>=0.3?'<i>'+fmt1(x.med/1000)+' s</i>':fmt1(x.med/1000)+' s');
  return parts.join(" · ");
}
function cWeakTop(list){
  return list.filter(function(x){return !x.fresh&&(x.errs>0||x.slow>=0.3);}).sort(function(a,b){return b.weight-a.weight;}).slice(0,5);
}
function cRenderWeak(){
  var ref=cTypical(), el=document.getElementById("c-weak"), keys=Object.keys(cstats.per);
  var list=cWeakTop(keys.map(function(k){var x=statInfo(cstats.per[k],ref);x.it=cItemOfKey(k);return x;}).filter(function(x){return x.it;}));
  el.innerHTML=list.length?list.map(function(x){
    return '<li><span class="wn">'+cName(x.it)+'</span><span class="wp">'+CINV[x.it.inv]+'</span><span class="wr">'+cWeakParts(x)+'</span></li>';
  }).join(""):'<li class="empty">'+(keys.length?"Nenhum acorde se destaca agora: você está acertando todos num tempo parecido.":"Toque algumas séries para ver aqui os acordes que pedem mais treino.")+'</li>';
  // A mesma lista para as trocas, com o tempo típico dos acordes como referência.
  var pel=document.getElementById("c-weak-pairs"), pkeys=Object.keys(cstats.pairs);
  var pl=cWeakTop(pkeys.map(function(k){var x=statInfo(cstats.pairs[k],ref), p=k.split(">");x.a=cItemOfKey(p[0]);x.b=cItemOfKey(p[1]);return x;}).filter(function(x){return x.a&&x.b;}));
  pel.innerHTML=pl.length?pl.map(function(x){
    return '<li class="tr"><span class="wn">'+cSlash(x.a)+' → '+cSlash(x.b)+'</span><span class="wr">'+cWeakParts(x)+'</span></li>';
  }).join(""):'<li class="empty">'+(!pkeys.length?"Toque algumas séries para ver aqui as trocas que pedem mais treino."
    :pkeys.some(function(k){return cstats.pairs[k].n>=FRESH_N;})?"Nenhuma troca se destaca agora."
    :"Uma troca entra aqui depois de sair duas vezes. O sorteio “Todas as trocas” passa por todas por igual.")+'</li>';
}
var cResetEl=document.getElementById("c-reset");
function cRenderReset(confirming){
  cResetEl.innerHTML=confirming
    ? '<span>Apagar o histórico dos acordes?</span><button class="txtbtn" id="crs-yes">Apagar</button><button class="txtbtn" id="crs-no">Cancelar</button>'
    : '<button class="txtbtn" id="crs-ask">Zerar estatísticas</button>';
}
cResetEl.addEventListener("click",function(e){
  var id=e.target.id;
  if(id==="crs-ask") cRenderReset(true);
  else if(id==="crs-no") cRenderReset(false);
  else if(id==="crs-yes"){
    cstats=cBlank();cSave();cRenderStats();cRenderWeak();cRenderReset(false);cRenderControls();
    // As voltas também recomeçam. Com uma série em andamento, o fim dela não grava mais a volta antiga.
    if(C.state==="idle") cNew(); else C.round=null;
  }
});

function cSet(key,val){if(settings.c[key]===val)return;settings.c[key]=val;saveSettings();cRenderControls();cNew();}
document.getElementById("c-groups").addEventListener("click",function(e){
  var b=e.target.closest("[data-cgroup]"); if(!b) return;
  var g=settings.c.groups, i=g.indexOf(b.dataset.cgroup);
  if(i>=0){if(g.length===1)return;g.splice(i,1);} else g.push(b.dataset.cgroup);
  saveSettings(); cRenderControls(); cNew();
});
document.querySelectorAll("[data-chand]").forEach(function(b){b.addEventListener("click",function(){cSet("hands",b.dataset.chand);});});
document.querySelectorAll("[data-cinv]").forEach(function(b){b.addEventListener("click",function(){cSet("inv",b.dataset.cinv==="1");});});
document.querySelectorAll("[data-cseq]").forEach(function(b){b.addEventListener("click",function(){cSet("seq",b.dataset.cseq);});});
document.querySelectorAll("[data-cdraw]").forEach(function(b){b.addEventListener("click",function(){cSet("draw",b.dataset.cdraw);});});
document.querySelectorAll("[data-cpace]").forEach(function(b){b.addEventListener("click",function(){cSet("pace",b.dataset.cpace);});});
document.querySelectorAll("[data-cbeats]").forEach(function(b){b.addEventListener("click",function(){cSet("beats",+b.dataset.cbeats);});});
document.querySelectorAll("[data-ccount]").forEach(function(b){b.addEventListener("click",function(){cSet("count",+b.dataset.ccount);});});
function cSetBpm(v){settings.c.bpm=clamp(Math.round(v),30,160);saveSettings();cRenderControls();cRender();}
document.getElementById("c-bpm").addEventListener("input",function(e){cSetBpm(+e.target.value);});
document.getElementById("c-bpm-down").addEventListener("click",function(){cSetBpm(settings.c.bpm-5);});
document.getElementById("c-bpm-up").addEventListener("click",function(){cSetBpm(settings.c.bpm+5);});
document.getElementById("sw-cshape").addEventListener("click",function(){
  settings.c.shape=!settings.c.shape; saveSettings(); cRenderControls();
  if(C.state==="idle") C.revealed=settings.c.shape;
  cRender();
});
document.getElementById("c-go").addEventListener("click",function(){if(C.state==="idle")cStart();else cStop();});
document.getElementById("c-new").addEventListener("click",function(){
  // Em “Um com todos”, a série nova é a do próximo acorde fixo.
  if(settings.c.seq==="ancora"&&C.round){cstats.rounds[C.round.k]=C.round.st;cSave();cRenderControls();}
  cNew();
});
document.getElementById("c-check").addEventListener("click",cCheck);
document.getElementById("c-yes").addEventListener("click",function(){cMark(true);});
document.getElementById("c-no").addEventListener("click",function(){cMark(false);});
// Teclado do computador ou pedal de virar página (que manda setas ou Page Up/Down).
document.addEventListener("keydown",function(e){
  if(settings.tab!=="acordes"||e.metaKey||e.ctrlKey||e.altKey) return;
  var k=e.key;
  if(C.state==="idle"){if(k==="PageDown"||k==="ArrowRight"){e.preventDefault();cStart();}return;}
  if(k==="Escape"){e.preventDefault();cStop();return;}
  var yes=k===" "||k==="Enter"||k==="ArrowRight"||k==="PageDown", no=k==="ArrowLeft"||k==="PageUp"||k==="Backspace";
  if(!yes&&!no) return;
  e.preventDefault();
  if(e.repeat||C.pace!=="livre") return;
  // Sem teclado, ← antes de conferir já marca erro (num pedal, a primeira tecla apertada pode ser a de erro).
  if(!C.asked){if(yes)cCheck();else if(C.mode==="self"){cCheck();cMark(false);}}
  else if(C.mode==="self") cMark(yes);
});
document.addEventListener("visibilitychange",function(){
  if(C.state==="idle") return;
  // Ao voltar para a tela, o navegador já soltou o bloqueio de tela apagada: pede de novo.
  if(!document.hidden){if(C.state==="run")cWake();return;}
  if(C.pace==="metro") cStop("Série interrompida porque o app saiu da tela.");
  else C.interrupted=true;
});
