# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Site de usuário do GitHub Pages (`Jeippy.github.io`). Hoje o único conteúdo é `leitura-partitura/`: um PWA offline em pt-BR para treinar leitura de notas (claves de Sol, Fá e as duas juntas), ritmo com metrônomo, os 12 acordes maiores no teclado e as partituras que o dono exporta do MuseScore. Não existe `index.html` na raiz. O dono usa num Galaxy Tab S9 FE (Chrome, Android) com um piano digital ligado por USB-MIDI.

Não há build nem linter. A única dependência é a biblioteca OpenSheetMusicDisplay 3.0.0 (licença BSD-3), já copiada em `leitura-partitura/vendor/`: o arquivo é o do lançamento no GitHub, sem alteração (o `.gitattributes` impede o git de mexer nos bytes). Os arquivos são servidos exatamente como estão no repositório. As versões antigas chegavam por upload na interface web do GitHub; hoje chegam por commit e push na `main`, que o GitHub Pages publica sozinho.

## Testes

```powershell
node testes/rodar.js
```

Roda em menos de 1 s e não precisa de nada além do Node. `testes/ambiente.js` carrega os 9 scripts de `leitura-partitura/js/` num contexto do Node, na ordem do `index.html`, com uma página falsa e um relógio controlado:
- `env.app` dá acesso às funções e variáveis de cima de cada arquivo, como `env.app.cGen` e `env.app.C`.
- `env.avancar(t, quadro)` anda o relógio e roda os timers. Use `quadro` para chamar `cTick` como o `requestAnimationFrame` faria.
- `env.tecla(aperta, nota)` simula o teclado MIDI.

Os testes cobrem: as séries de acordes, o metrônomo dos Acordes, as teclas juntas no Treino, a folha, o Segurar e a calibração do Ritmo, e nas Partituras as vezes de tocar, a conferência das teclas e os botões de compasso. A biblioteca das partituras não roda no Node: os testes montam as posições à mão (`posicao`, `abrirPeca`) e testam o que vem depois de `pCollect`. Nos testes, uma tecla apertada precisa ser solta antes de ser apertada de novo, como num piano: `midiMsg` ignora um segundo aperto da mesma tecla. **Rode antes de publicar**, e acrescente um teste em `testes/rodar.js` quando corrigir um defeito ou criar uma regra nova.

O navegador de teste pode marcar a página como oculta (`document.hidden`). Nesse caso o `requestAnimationFrame` quase para, e os Acordes com metrônomo param por causa da regra "o app saiu da tela". Teste a lógica com tempo pelos testes em Node.

## Rodar localmente

Abrir `leitura-partitura/index.html` direto no navegador funciona, mas o service worker só é registrado em `http(s)`. Para testar o modo offline/PWA, sirva a raiz do repositório:

```powershell
python -m http.server 8000
```

e abra `http://localhost:8000/leitura-partitura/`. No painel de navegador do Claude Code, use `preview_start` com a configuração `site` de `.claude/launch.json`. O `http.server` do Python no Windows entrega `.js` como `text/plain`, então o registro do service worker falha localmente. Isso é esperado e não acontece no GitHub Pages.

Para testar o teclado MIDI sem teclado, em qualquer aba, troque `navigator.requestMIDIAccess` por uma função falsa antes de clicar em "Conectar teclado MIDI". A função deve devolver `{inputs: new Map([["1", entrada]])}`. Depois, chame `entrada.onmidimessage({data: new Uint8Array([0x90, nota, 100]), timeStamp: performance.now()})` para simular cada nota. `rStamp` só aceita `timeStamp` a menos de 1 s de agora, então tempos de troca simulados precisam de esperas reais (`await new Promise(r => setTimeout(r, ms))`).

No navegador, as funções e as variáveis dos scripts são globais: no console, `cGen()`, `C` e `settings` já estão acessíveis. Para abrir uma partitura sem o seletor de arquivos, chame `pImport(new File([texto ou ArrayBuffer], "nome.musicxml"))`. O navegador guarda os `.js` em cache: depois de editar, busque cada arquivo com `fetch(arquivo, {cache: "reload"})` e recarregue a página.

## Publicar uma mudança: incrementar o cache

`sw.js` é cache-first: quem já instalou o app continua vendo a versão em cache até o nome do cache mudar. **Sempre que alterar qualquer arquivo listado em `ASSETS`, incremente `CACHE` em `sw.js`** (hoje `leitura-partitura-v16`). Na ativação, o SW apaga os caches antigos, e o `index.html` recarrega a página uma vez no `controllerchange`. Antes de recarregar, ele espera `window.lpOcupado()` ficar falso, ou seja, nenhuma série, exercício, folha ou peça em andamento. Se adicionar um arquivo novo ao app, inclua-o em `ASSETS`: uma página que funciona online e quebra offline é sinal de arquivo faltando ali.

## Arquitetura

Os arquivos de `leitura-partitura/`:
- `index.html`: só a marcação. Tem o `<svg class="defs">` com os glifos, os `<link>` dos estilos, os `<script src>` na ordem certa e o registro do service worker.
- `css/fontes.css`: as fontes embutidas em base64 (Bodoni Moda e Atkinson Hyperlegible). São ~130 KB numa linha só: **não leia**.
- `css/app.css`: o resto do estilo.
- Os scripts de `js/`, carregados nesta ordem:
  1. `base.js`: constantes da pauta, utilidades comuns, armazenamento, som e a conexão MIDI.
  2. `pauta.js`: o desenho da pauta e a escolha das notas.
  3. `treino.js`
  4. `folha.js`: a folha e o mapa das notas.
  5. `ajustes.js`: os ajustes do topo.
  6. `ritmo.js`
  7. `acordes.js`
  8. `partituras.js`: a aba Partituras e as peças guardadas no aparelho.
  9. `app.js`: abas, redimensionamento e início.
- `vendor/opensheetmusicdisplay.min.js`: a biblioteca que lê e desenha MusicXML (1,5 MB). Não é carregada pelo `index.html`: `pLibLoad` a insere quando uma peça abre. Está em `ASSETS` para funcionar offline. A licença fica ao lado, em `opensheetmusicdisplay-LICENSE.txt`.

Pontos que valem para todos os scripts:
- **Sem módulos.** São scripts comuns, que dividem o mesmo escopo global, como acontecia dentro do antigo IIFE único. Por isso o `index.html` ainda abre direto do arquivo.
- **Um script só usa, no carregamento, o que os anteriores já definiram.** Isso vale para o código solto no topo, como `var x=f()` e `addEventListener("click", nome)`. Dentro de funções, qualquer nome serve, porque elas só rodam depois que `app.js` inicia o app. Um arquivo novo entra antes de `app.js`, no `index.html`, no `ASSETS` e em `ARQUIVOS` de `testes/ambiente.js`.
- **Os prefixos são históricos:** `c` para acordes, `r` para ritmo, `f` para folha, `p` para partituras. Exceção: `cList`, `cEsc`, `cNote`, `cPcName` e `accSym` moram em `base.js` e servem o app todo.
- **Estilo do JS:** ES5 (`var`, `function`, sem arrow functions) e `"use strict"` no topo de cada arquivo. Comentários, textos da interface e nomes de ajustes ficam em português, e os arquivos usam CRLF. Mantenha esse estilo. O `sed -i` do Git Bash troca CRLF por LF, então prefira a ferramenta Edit.
- **Seções** dentro dos arquivos, marcadas por `/* ---------- nome ---------- */`.
- **Teclado MIDI:** uma conexão para o app todo (`MIDI`, `midiConnect`, `midiAuto`). `midiMsg` manda cada nota para a aba aberta, e `midiChanged` atualiza os textos de todas. Cada aba tem uma linha de estado `.midi-line`. Com `data-midi="opt"`, ela fica vazia nos navegadores sem MIDI. `midiToD` e `dToMidi` convertem entre nota MIDI e nota da pauta (Dó central = 28 = MIDI 60), e `midiDesc` descreve a tecla errada ("o Sol uma oitava abaixo", "Fá♯").
- **Modelo de altura:** uma nota é um inteiro em passos diatônicos, `oitava*7 + índice da letra`, com Dó central = 28. `CLEFS[st].base` é a nota da 1ª linha (Sol: 30, Fá: 18). As extensões (`PRESETS` para uma clave, `GRAND_PRESETS` para as duas pautas) são posições relativas à 1ª linha (0 = 1ª linha, 8 = 5ª). `pool()` devolve `{d, st}` da extensão atual.
- **Desenho:** a pauta é SVG gerado como string (`noteSVG`, `systemSVG`; o ritmo usa `rLayout` e `rDraw`). Os glifos musicais são `<path>` em `<defs>` (`#g-clef`, `#f-clef`, `#g-head`, pausas, bandeirolas, fórmulas de compasso), usados via `<use>` em unidades de "espaço" da pauta. As cores vêm das classes (`.nt.ok`, `.nt.bad`, `.nt.cur`…) ligadas às variáveis CSS.
- **Cinco abas** (`settings.tab`, que também aceita `#treino`, `#folha`, `#ritmo`, `#acordes` ou `#partituras` na URL):
  - *Treino*: escolha ponderada de notas (`pickDrill`). O peso vem de `statInfo(p, ref)`, que a aba Acordes também usa. Cada item aparece primeiro `FRESH_N` vezes. Depois, o peso cresce com os erros recentes (`RECENT`) e com a demora em relação ao tempo típico (`TIMES`). Com MIDI, `drillKey` junta as teclas que chegam em até 70 ms e chama `answer(null, tecla, instante)`. A resposta exige a nota na oitava escrita, e o app não toca o som, porque o piano já soa.
  - *Folha de leitura*: compassos gerados como eventos `{b, dur, d}` por clave (`genSingle`, `genAlternating`, `genTogether` com acordes I/IV/V). Com MIDI, a folha acompanha a leitura no seu tempo. `fBuild` agrupa as notas que começam juntas em ataques (`F.on`) e marca cada evento com `e.oi`. `fKey` avança quando o ataque está completo, e `fCls` pinta as notas. Os erros e os tempos ficam só no resultado da folha (`fResult`), sem entrar nas estatísticas do Treino.
  - *Ritmo*: durações contadas em semicolcheias (semínima = 4). O metrônomo é agendado no relógio do Web Audio e convertido para `performance.now` (`rPerfAt` e `rCtxAt`). O exercício começa no 1º toque. A avaliação (`rMatch` e `rEvaluate`) mede a partir desse toque. A porcentagem do resultado conta notas inteiras certas (`full`): no "Segurar", a nota precisa começar no tempo e durar certo. As contagens só do início (`ok`, `near`) e só da duração (`dOk`…) aparecem nas linhas de detalhe. A calibração compensa o atraso: `settings.r.latency` para o toque na tela e `settings.r.latMidi` para o teclado MIDI. `R.midi` diz qual das duas vale. Quem decide é a entrada do primeiro toque que conta, tecla do piano ou tela (`R.src`), e `rLatOf` e `rCalOf` escolhem a calibração certa. Se o app sai da tela, o exercício para. Com MIDI, cada tecla é um toque com id `"m"+nota`, que não toca o som do toque. Com as duas mãos, as teclas abaixo do Dó central são a mão esquerda. O estado de execução fica no objeto `R`.
  - *Acordes*: as tríades maiores são itens `{L, a, pc, inv}`, e na progressão também `{key, deg}`. A grafia vem de `cTones` (Mi maior = Mi, Sol♯, Si) e a ordem de baixo para cima de `cVoice`. `CROOTS` está na ordem do ciclo de quintas, e `CGROUPS` agrupa os acordes pelo desenho de teclas brancas e pretas. `cGen` monta a série de três jeitos: sorteada, ciclo de quintas (com inversões, `cNearest` escolhe a mais próxima da anterior) ou I–IV–V–I. A sorteada tem três sorteios (`settings.c.draw`):
    - *Pelo desempenho* (`peso`): usa o peso de `statInfo`.
    - *Todas as trocas* (`todas`, `cGenAll`): cada par ordenado de acordes de fundamentais diferentes sai uma vez por volta. A volta é um caminho de Euler (`cEuler`) e continua entre as séries.
    - *Trocas difíceis* (`dificeis`, `cGenHard`): cada acorde sai uma vez por volta, só por trocas difíceis. A dificuldade vem de `cMove`: semitons que os dedos andam, +3 por tecla que muda de cor e +3 se muda a inversão. `cHardness` corrige essa nota pelo tempo medido no par, e `cHardExits` fica com o terço de cima das saídas e das chegadas de cada acorde. Esse sorteio exige pelo menos 8 saídas por acorde (`cHardOk`).

    As voltas ficam em `cstats.rounds` e só avançam em `cFinish`, porque `cGen` deixa o estado pendente em `C.round`. Com MIDI, os acordes usam `MIDI.held`, as notas apertadas. `cMatches` exige 3 notas por mão, na ordem da inversão e dentro de uma oitava. Um erro só conta se houve nota nova (`MIDI.dirty`) e o conjunto ficou parado por 160 ms, porque na troca as notas mudam aos poucos. Com metrônomo, o erro vai para o último acorde cuja vez já abriu e que ainda não foi tocado. Quando a vez de um acorde abre, `cTick` reavalia o que já está apertado (`C.open`). Um acorde apertado antes de a vez abrir conta como adiantado meio tempo (`r.early`) e fica fora da média. "No meu tempo" mede a troca entre completar um acorde e o seguinte. "Com metrônomo" reaproveita `rClick` e `rPerfAt` do Ritmo, e cada acorde vale do meio tempo antes do seu tempo 1 até o fim da sua vez. Sem MIDI, o próprio usuário confere (`cCheck` e `cMark`). O estado da série fica no objeto `C`.
  - *Partituras*: arquivos MusicXML exportados do MuseScore (`.mxl` compactado ou `.musicxml`), lidos e desenhados pelo OpenSheetMusicDisplay (`P.osmd`). Sempre passe um `Blob` para `load()`: um texto que não começa com `<` ou `PK` vira endereço e a biblioteca tenta baixá-lo. `pImport` só guarda o arquivo se a biblioteca conseguir lê-lo, e um arquivo com o mesmo nome substitui o anterior. `pCollect` anda pela peça com um iterador clonado do cursor da biblioteca, que já segue as repetições, e guarda em `P.raw` cada posição com as notas que começam ali (tecla MIDI = `halfTone + 12`). Pausas, apojaturas, notas pequenas e notas invisíveis ficam de fora, e numa peça com piano só os instrumentos de duas pautas contam (`P.two`). `pBuild` filtra pela mão (pauta de cima = direita) e tira as continuações de ligadura, que não pedem tecla nova mas mudam de cor com a vez (`paint`). `pKey` espera todas as teclas da vez, como o `fKey` da Folha, e `pDesc` descreve a tecla errada. A cor das notas vem de `GNote(nota).setColor`, buscada de novo a cada desenho, porque `render()` refaz o SVG. Por isso `pRender` repinta as vezes de `P.colored` e devolve o cursor com `cursor.iterator = vez.it.clone()`. As cores vêm das variáveis do tema, e `pTheme` redesenha quando o aparelho troca entre claro e escuro. Com uma peça aberta nessa aba, a tela fica acesa (wake lock).
- **Som:** Web Audio sintetizado na hora (osciladores e ruído). Não há arquivos de áudio.
- **Persistência:** `localStorage` via `store`, com três chaves, e as peças das Partituras no IndexedDB:
  - `lcs-settings`: os ajustes. Os do ritmo ficam em `settings.r`, os dos acordes em `settings.c` e os das partituras em `settings.p` (mão, tamanho e a última peça aberta, que reabre ao entrar na aba).
  - `lcs-stats`: estatísticas por nota em `stats.per["clave:nota"]`.
  - `lcs-chords`: estatísticas dos acordes em `cstats.per["altura:inversão"]`, de cada troca em `cstats.pairs["de>para"]` (`cRecord` recebe o acorde anterior) e as voltas em `cstats.rounds["sorteio|fundamentais+f/i"]`. Só os tempos medidos pelo MIDI entram na troca média. Na carga, os ajustes são mesclados com os padrões e validados um a um. **Ao criar um ajuste novo, adicione o padrão e a validação**, e se mudar o formato dos dados, faça a migração no carregamento (como a das chaves antigas sem `clave:`), para não quebrar dados já salvos nos aparelhos.
  - IndexedDB `leitura-partitura`, depósito `pecas`: cada peça é `{id, nome, titulo, compositor, arquivo (Blob), criada, aberta}`. Para mudar esse formato, suba a versão em `indexedDB.open` e migre em `onupgradeneeded`.
- **Tema:** variáveis CSS em `:root` (`css/app.css`), com modo escuro por `prefers-color-scheme` ou `data-theme`. `theme-color` aparece em `index.html` e em `manifest.webmanifest` (`#EDF0F3`).

`LEIA-ME.txt` são as instruções de instalação para o usuário final (hospedar em https e adicionar à tela inicial). Atualize esse arquivo se o fluxo de instalação ou de atualização mudar.
