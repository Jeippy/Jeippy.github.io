# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Site de usuário do GitHub Pages (`Jeippy.github.io`). Hoje o único conteúdo é `leitura-partitura/`: um PWA offline em pt-BR para treinar leitura de notas (claves de Sol, Fá e as duas juntas), ritmo com metrônomo e os 12 acordes maiores no teclado. Não existe `index.html` na raiz. O dono usa num Galaxy Tab S9 FE (Chrome, Android) com um piano digital ligado por USB-MIDI.

Sem build, sem dependências, sem testes, sem linter. Os arquivos são servidos exatamente como estão no repositório. O histórico mostra que as versões chegam por upload na interface web do GitHub ("Add files via upload").

## Rodar localmente

Abrir `leitura-partitura/index.html` direto no navegador funciona, mas o service worker só é registrado em `http(s)`. Para testar o modo offline/PWA, sirva a raiz do repositório:

```powershell
python -m http.server 8000
```

e abra `http://localhost:8000/leitura-partitura/`. No painel de navegador do Claude Code, use `preview_start` com a configuração `site` de `.claude/launch.json`. O `http.server` do Python no Windows entrega `.js` como `text/plain`, então o registro do service worker falha localmente. Isso é esperado e não acontece no GitHub Pages.

Para testar o teclado MIDI sem teclado, em qualquer aba, troque `navigator.requestMIDIAccess` por uma função falsa antes de clicar em "Conectar teclado MIDI". A função deve devolver `{inputs: new Map([["1", entrada]])}`. Depois, chame `entrada.onmidimessage({data: new Uint8Array([0x90, nota, 100]), timeStamp: performance.now()})` para simular cada nota. `rStamp` só aceita `timeStamp` a menos de 1 s de agora, então tempos de troca simulados precisam de esperas reais (`await new Promise(r => setTimeout(r, ms))`).

Para testar funções internas do IIFE, como gerar centenas de séries, não abra uma cópia fora do projeto: o painel mostra esses arquivos só como imagem estática. Numa aba em `localhost`, busque o `index.html` com `fetch`, troque o `})();` final por `window.__T={cGen:cGen,C:C,...};})();` e carregue a página com `document.open()`, `document.write()` e `document.close()`.

## Publicar uma mudança: incrementar o cache

`sw.js` é cache-first: quem já instalou o app continua vendo a versão em cache até o nome do cache mudar. **Sempre que alterar qualquer arquivo listado em `ASSETS`, incremente `CACHE` em `sw.js`** (hoje `leitura-partitura-v12`). Na ativação, o SW apaga os caches antigos, e o `index.html` recarrega a página uma vez no `controllerchange`. Se adicionar um arquivo novo ao app, inclua-o em `ASSETS`.

## Arquitetura do `index.html`

Tudo fica num único arquivo (~2900 linhas): CSS, um `<svg class="defs">` com os glifos e um IIFE em JS.

- **Linha 18 = fontes embutidas em base64** (Bodoni Moda 500/600 normal e itálico, Atkinson Hyperlegible 400/700), com ~130 KB numa linha só. Não leia essa linha. Use `Read` com `offset: 19`, ou `Grep`, porque ler o arquivo do início estoura o limite.
- **Estilo do JS:** ES5 (`var`, `function`, sem arrow functions, `"use strict"` dentro do IIFE). Comentários, textos da interface e nomes de ajustes em português. Os arquivos usam CRLF. Mantenha esse estilo. O `sed -i` do Git Bash troca CRLF por LF: prefira a ferramenta Edit.
- **Seções**, marcadas por comentários `/* ---------- nome ---------- */`: armazenamento, som, teclado MIDI, desenho da pauta, geração de notas, treino, desempenho, folha de leitura (e o acompanhamento pelo teclado MIDI), mapa, ajustes, ritmo, acordes (sequência, teclado MIDI, série, desenho, ajustes e desempenho), abas, redimensionamento, início.
- **Teclado MIDI:** uma conexão para o app todo (`MIDI`, `midiConnect`, `midiAuto`). `midiMsg` manda cada nota para a aba aberta, e `midiChanged` atualiza os textos de todas. Cada aba tem uma linha de estado `.midi-line`. Com `data-midi="opt"`, ela fica vazia nos navegadores sem MIDI. `midiToD` e `dToMidi` convertem entre nota MIDI e nota da pauta (Dó central = 28 = MIDI 60), e `midiDesc` descreve a tecla errada ("o Sol uma oitava abaixo", "Fá♯").
- **Modelo de altura:** uma nota é um inteiro em passos diatônicos, `oitava*7 + índice da letra`, com Dó central = 28. `CLEFS[st].base` é a nota da 1ª linha (Sol: 30, Fá: 18). As extensões (`PRESETS` para uma clave, `GRAND_PRESETS` para as duas pautas) são posições relativas à 1ª linha (0 = 1ª linha, 8 = 5ª). `pool()` devolve `{d, st}` da extensão atual.
- **Desenho:** a pauta é SVG gerado como string (`noteSVG`, `systemSVG`; o ritmo usa `rLayout` e `rDraw`). Os glifos musicais são `<path>` em `<defs>` (`#g-clef`, `#f-clef`, `#g-head`, pausas, bandeirolas, fórmulas de compasso), usados via `<use>` em unidades de "espaço" da pauta. As cores vêm das classes (`.nt.ok`, `.nt.bad`, `.nt.cur`…) ligadas às variáveis CSS.
- **Quatro abas** (`settings.tab`, que também aceita `#treino`, `#folha`, `#ritmo` ou `#acordes` na URL):
  - *Treino*: escolha ponderada de notas (`pickDrill`). O peso vem de `statInfo(p, ref)`, que a aba Acordes também usa. Cada item aparece primeiro `FRESH_N` vezes. Depois, o peso cresce com os erros recentes (`RECENT`) e com a demora em relação ao tempo típico (`TIMES`). Com MIDI, `answer(null, tecla)` exige a nota na oitava escrita, e o app não toca o som, porque o piano já soa.
  - *Folha de leitura*: compassos gerados como eventos `{b, dur, d}` por clave (`genSingle`, `genAlternating`, `genTogether` com acordes I/IV/V). Com MIDI, a folha acompanha a leitura no seu tempo. `fBuild` agrupa as notas que começam juntas em ataques (`F.on`) e marca cada evento com `e.oi`. `fKey` avança quando o ataque está completo, e `fCls` pinta as notas. Os erros e os tempos ficam só no resultado da folha (`fResult`), sem entrar nas estatísticas do Treino.
  - *Ritmo*: durações contadas em semicolcheias (semínima = 4). O metrônomo é agendado no relógio do Web Audio e convertido para `performance.now` (`rPerfAt` e `rCtxAt`). O exercício começa no 1º toque. A avaliação (`rMatch` e `rEvaluate`) mede a partir desse toque, e a calibração compensa o atraso: `settings.r.latency` para o toque na tela e `settings.r.latMidi` para o teclado MIDI. `R.midi` diz qual das duas vale no exercício, e `rLatOf` e `rCalOf` escolhem a certa. Com MIDI, cada tecla é um toque com id `"m"+nota`, que não toca o som do toque. Com as duas mãos, as teclas abaixo do Dó central são a mão esquerda. O estado de execução fica no objeto `R`.
  - *Acordes*: as tríades maiores são itens `{L, a, pc, inv}`, e na progressão também `{key, deg}`. A grafia vem de `cTones` (Mi maior = Mi, Sol♯, Si) e a ordem de baixo para cima de `cVoice`. `CROOTS` está na ordem do ciclo de quintas, e `CGROUPS` agrupa os acordes pelo desenho de teclas brancas e pretas. `cGen` monta a série de três jeitos: sorteada, ciclo de quintas (com inversões, `cNearest` escolhe a mais próxima da anterior) ou I–IV–V–I. A sorteada tem três sorteios (`settings.c.draw`):
    - *Pelo desempenho* (`peso`): usa o peso de `statInfo`.
    - *Todas as trocas* (`todas`, `cGenAll`): cada par ordenado de acordes de fundamentais diferentes sai uma vez por volta. A volta é um caminho de Euler (`cEuler`) e continua entre as séries.
    - *Trocas difíceis* (`dificeis`, `cGenHard`): cada acorde sai uma vez por volta, só por trocas difíceis. A dificuldade vem de `cMove`: semitons que os dedos andam, +3 por tecla que muda de cor e +3 se muda a inversão. `cHardness` corrige essa nota pelo tempo medido no par, e `cHardExits` fica com o terço de cima das saídas e das chegadas de cada acorde. Esse sorteio exige pelo menos 8 saídas por acorde (`cHardOk`).

    As voltas ficam em `cstats.rounds` e só avançam em `cFinish`, porque `cGen` deixa o estado pendente em `C.round`. Com MIDI, os acordes usam `MIDI.held`, as notas apertadas. `cMatches` exige 3 notas por mão, na ordem da inversão e dentro de uma oitava. Um erro só conta se houve nota nova (`MIDI.dirty`) e o conjunto ficou parado por 160 ms, porque na troca as notas mudam aos poucos. "No meu tempo" mede a troca entre completar um acorde e o seguinte. "Com metrônomo" reaproveita `rClick` e `rPerfAt` do Ritmo, e cada acorde vale do meio tempo antes do seu tempo 1 até o fim da sua vez. Sem MIDI, o próprio usuário confere (`cCheck` e `cMark`). O estado da série fica no objeto `C`.
- **Som:** Web Audio sintetizado na hora (osciladores e ruído). Não há arquivos de áudio.
- **Persistência:** `localStorage` via `store`, com três chaves:
  - `lcs-settings`: os ajustes. Os do ritmo ficam em `settings.r` e os dos acordes em `settings.c`.
  - `lcs-stats`: estatísticas por nota em `stats.per["clave:nota"]`.
  - `lcs-chords`: estatísticas dos acordes em `cstats.per["altura:inversão"]`, de cada troca em `cstats.pairs["de>para"]` (`cRecord` recebe o acorde anterior) e as voltas em `cstats.rounds["sorteio|fundamentais+f/i"]`. Só os tempos medidos pelo MIDI entram na troca média. Na carga, os ajustes são mesclados com os padrões e validados um a um. **Ao criar um ajuste novo, adicione o padrão e a validação**, e se mudar o formato dos dados, faça a migração no carregamento (como a das chaves antigas sem `clave:`), para não quebrar dados já salvos nos aparelhos.
- **Tema:** variáveis CSS em `:root`, com modo escuro por `prefers-color-scheme` ou `data-theme`. `theme-color` aparece em `index.html` e em `manifest.webmanifest` (`#EDF0F3`).

`LEIA-ME.txt` são as instruções de instalação para o usuário final (hospedar em https e adicionar à tela inicial). Atualize esse arquivo se o fluxo de instalação ou de atualização mudar.
