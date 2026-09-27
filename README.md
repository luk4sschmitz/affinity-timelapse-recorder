# Timelapse Recorder para Affinity

Grava um timelapse do seu processo criativo dentro do [Affinity](https://www.affinity.studio/): **cada edição real vira um frame**, e ao terminar o vídeo MP4 é montado automaticamente.

> **EN**: Affinity script that records a timelapse of your work (one frame per real edit) and auto-builds the MP4 through a small Windows watcher included here. Windows only. Docs in Portuguese below.

**Autor**: Lucas Schmitz ([@luk4sschmitz](https://github.com/luk4sschmitz)) · **Contato**: schiochettschmitz@gmail.com · **Licença**: MIT

---

## Requisitos

- Windows 10 ou 11 (o PowerShell 5.1 já vem com o Windows).
- Affinity 3.3 ou mais recente, com scripting habilitado.
- Internet na primeira vez que um vídeo for gerado: o ffmpeg (~180 MB) é baixado sozinho, a menos que você já tenha o `ffmpeg` no PATH.

## O que vem neste repositório

```
timelapse-recorder.js           o script do Affinity
registry.json                   instalação em 1 clique pelo Script Manager for Affinity
tools/
  Instalar Video Automatico.bat   instalador do vigia (dois cliques, 1x por PC)
  install-auto-video.ps1          registra o vigia como tarefa agendada do Windows
  timelapse-watcher.ps1           o vigia: monta o MP4 quando uma gravação termina
  make-timelapse-video.ps1        o montador: junta os frames com ffmpeg
  Criar Video Timelapse.bat       gera o vídeo na mão (sessão mais recente)
  ffmpeg/                         criado na 1ª execução (download automático)
  watcher.log                     log do vigia
```

## Instalação

### 1. Baixe o repositório

Em **Code > Download ZIP**, extraia numa pasta fixa, por exemplo `Documentos\affinity-timelapse-recorder`. O vigia roda a partir dessa pasta: se movê-la depois, rode o instalador do passo 4 de novo.

### 2. Instale o script no Affinity

Antes, crie ao menos uma categoria no painel Scripts (**Janela > Scripts**). Depois escolha uma opção:

- **Script Manager for Affinity** ([site](https://jirikrblich.github.io/Affinity-script-manager/)): em *Repositories*, adicione
  `https://raw.githubusercontent.com/luk4sschmitz/affinity-timelapse-recorder/main/registry.json`
  e instale o *Timelapse Recorder*.
- **Manual**: no painel Scripts, importe o arquivo `timelapse-recorder.js`.

### 3. Libere o acesso à Área de Trabalho (Affinity 3.3+)

O script grava os frames na sua Área de Trabalho. A partir do Affinity 3.3, scripts só acessam pastas liberadas explicitamente. Sem os dois ajustes abaixo, o script para com `Error: PERMISSION_DENIED`.

1. **Preferências > Scripting**: na lista de pastas liberadas, clique em **Adicionar** e escolha a sua Área de Trabalho.
   Se o seu Windows usa OneDrive, a Área de Trabalho fica em `C:\Users\<você>\OneDrive\Área de Trabalho`. Escolha essa.
2. No painel Scripts, abra o **Timelapse Recorder** no Editor de scripts, clique na engrenagem e, em **Permissões do script**, marque **Sistema de arquivos**.
   Dica: marque também **Sistema de arquivos** em **Permissões padrão** (Preferências > Scripting), assim reinstalações já vêm com a permissão.

### 4. Instale o vigia do Windows

Dê dois cliques em `tools\Instalar Video Automatico.bat`, uma vez por PC. Ele registra a tarefa agendada `AffinityTimelapseWatcher`, que inicia junto com o Windows, roda oculta e já começa a funcionar na hora.

## Uso

1. Com o documento aberto, rode **Timelapse Recorder** e escolha:
   - **Área**: prancheta específica, spread atual ou documento todo;
   - **Formato**: JPEG (recomendado) ou PNG;
   - **Cadência**: a cada edição, ou intervalo fixo;
   - **Intervalo mínimo** entre frames e **duração máxima** da gravação.
2. Trabalhe normalmente.
3. Para parar, rode o script de novo e confirme. Em alguns segundos o Explorer abre com o MP4 pronto.

## Pastas criadas

```
Área de Trabalho\
  AffinityTimelapse\
    _running\                    existe enquanto há uma gravação ativa
    _stop\                       pedido de parada (criado pela 2ª execução)
    MeuDocumento_20260927_101500\
      frame_00000.jpg ...        um frame por edição (ou por intervalo)
      _ultimo.jpg                último estado exportado (só durante a gravação)
      _render\                   sinal para o vigia montar o vídeo
      timelapse_30fps.mp4        o vídeo final
```

As pastas com `_` são sinalizadores: o script e o vigia conversam por elas, porque o Affinity não permite outra forma de comunicação. Elas somem sozinhas. Se a montagem do vídeo falhar, a sessão fica marcada com `_render_failed` para você conferir.

## Como funciona

1. **Liga/desliga por execução**: a 1ª execução configura e inicia; a 2ª cria `_stop`, e o gravador (que continua vivo em segundo plano) captura o frame final e encerra.
2. **Detecção de edição pelo histórico**: um timer confere `doc.history.position/size` a cada 250 ms. Mudou (inclusive desfazer/refazer), a edição acabou de ser concluída.
3. **Captura só depois de soltar o mouse**: exportar a tela enquanto você arrasta um objeto faz o Affinity se perder no arraste, e o objeto foge do cursor. Como o histórico só muda quando o mouse é solto, o script exporta **somente logo após uma edição concluída**, nunca em horário arbitrário. Cada export vai para um arquivo de reserva (`_ultimo.jpg`), e os frames são cópias dele.
   - **A cada edição**: um frame por edição concluída. Se ela chega antes do intervalo mínimo, aparece no frame seguinte.
   - **Intervalo fixo**: no ritmo escolhido, o script copia o último estado como próximo frame, mesmo sem edição. O vídeo acompanha o tempo real sem nenhum export fora de hora.
4. **Histórico cheio**: quando o limite de desfazer enche (padrão 1024 passos), o Affinity congela esses contadores e as edições novas ficam invisíveis. Nesse caso o script exporta a cada 3 s e compara os **bytes** com o export anterior. O export do Affinity é determinístico (sem mudança, bytes idênticos): se forem iguais, descarta; se forem diferentes, vira frame.
5. **Sem travar a interface**: as capturas usam `doc.promises.export` (assíncrono). O export síncrono travaria a tela ~1,2 s por frame em documentos grandes.
6. **Vídeo**: ao parar, o script cria `_render` na sessão. O vigia confere a cada 5 s, monta `timelapse_30fps.mp4` com ffmpeg (`libx264`, `crf 18`) e abre o Explorer no arquivo. O vigia existe porque o Affinity não pode executar programas externos.

## Solução de problemas

- **`Error: PERMISSION_DENIED`**: refaça o passo 3 da instalação (pasta liberada e "Sistema de arquivos").
- **O script diz que já está gravando, mas não está** (o Affinity fechou no meio): rode o script, marque **Forçar limpeza** e dê OK.
- **O vídeo não apareceu**:
  - veja `tools\watcher.log`: cada início do vigia e cada vídeo montado ficam registrados;
  - confira se a tarefa `AffinityTimelapseWatcher` existe no Agendador de Tarefas (ou rode o instalador de novo);
  - gere na mão: `tools\Criar Video Timelapse.bat` monta a sessão mais recente. Para outra sessão ou fps:
    `powershell -ExecutionPolicy Bypass -File tools\make-timelapse-video.ps1 -SessionDir "C:\...\AffinityTimelapse\<sessão>" -Fps 60`
- **Atualizar o script**: no Affinity 3.3, instalar por cima de um script com o mesmo nome não substitui o antigo. Apague o Timelapse Recorder no painel Scripts, instale de novo e reative a permissão "Sistema de arquivos".
- **Remover o vigia**: apague a tarefa `AffinityTimelapseWatcher` no Agendador de Tarefas.

## Limitações

- Somente Windows (o vigia e o montador são PowerShell).
- **Histórico cheio**: depois de 1024 passos de desfazer no documento, a API não informa mais quando há edição. A captura passa a exportar a cada 3 s e pode voltar a cair no meio de um arraste, com o objeto fugindo do cursor. Para sessões longas, aumente **Preferências > Limite de Desfazer** antes de abrir o documento. Se isso acontecer durante a gravação, o aviso final avisa.
- Os presets de export do Affinity mudam de nome conforme o idioma; o script os encontra em tempo de execução, então funciona em qualquer idioma.
- Por segurança, a gravação encerra sozinha ao passar de 20.000 frames ou da duração máxima escolhida.

## Licença

MIT. Veja [LICENSE](LICENSE).
