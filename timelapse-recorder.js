/**
 * name: Timelapse Recorder
 * description: Grava um timelapse do seu processo criativo. Rode 1x para iniciar (escolhendo prancheta, formato e cadencia); rode novamente para parar. Cada edicao real vira um frame; ao finalizar, o MP4 e gerado automaticamente pelo vigia instalado no Windows.
 * version: 1.3.0
 * author: Lucas Schmitz (@luk4sschmitz)
 * contact: schiochettschmitz@gmail.com
 */

'use strict';

// Timelapse Recorder — liga/desliga por execução:
//  - 1ª execução: diálogo de configuração e início da gravação.
//  - 2ª execução: sinaliza parada; o gravador finaliza e marca a sessão com
//    _render — o vigia (tools/timelapse-watcher.ps1, tarefa agendada) monta o MP4.
// Frames: Área de Trabalho/AffinityTimelapse/<sessão>/frame_00000.ext
//
// Notas de engenharia (validadas ao vivo — ver README):
//  - doc.export síncrono bloqueia a UI (~1,2s num doc grande) = travadinha a cada
//    captura. doc.promises.export retorna em ~5ms e renderiza fora da UI (v1.2).
//  - Sandbox: caminhos iniciados com "." dão PERMISSION_DENIED → flags _running/_stop.
//  - Histórico saturado (undoLimit, padrão 1024): position/size congelam; o script
//    troca para detecção por bytes do export (determinístico) — v1.1.
//  - Export no meio de um arraste faz o objeto fugir do cursor. Só exporta logo após
//    o histórico mudar (= mouse solto); frames são cópias do último export — v1.3.

const { app } = require('/application');
const { FileExportOptions, FileExportArea } = require('/document');
const { Dialog, DialogResult, UnitType } = require('/dialog');
const { setInterval, Timer } = require('/timers');
const fsys = require('/fs');

const BASE = app.userDesktopPath + '/AffinityTimelapse';
const RUNNING_FLAG = BASE + '/_running';
const STOP_FLAG = BASE + '/_stop';

const POLL_MS = 250;          // cadência de verificação do histórico
const SAT_MS = 3000;          // histórico cheio: intervalo entre exports de comparação
const MAX_FRAMES = 20000;     // trava de segurança

function pad(n, w) { return String(n).padStart(w, '0'); }

function sanitize(name) {
    return String(name).replace(/[<>:"/\\|?*]/g, '').trim() || 'documento';
}

function sessionFolderName(doc) {
    const t = new Date();
    return sanitize(doc.title) + '_' + t.getFullYear() + pad(t.getMonth() + 1, 2) + pad(t.getDate(), 2) + '_' + pad(t.getHours(), 2) + pad(t.getMinutes(), 2) + pad(t.getSeconds(), 2);
}

function listArtboards(doc) {
    const out = [];
    try {
        if (!doc.hasArtboards) return out;
        const abs = doc.artboards;
        const n = abs ? abs.length : 0;
        for (let i = 0; i < n; i++) {
            const node = abs.at ? abs.at(i) : abs[i];
            let label = '';
            try { label = String(node.description ?? ''); } catch (e) { }
            out.push({ node, label: label || ('Prancheta ' + (i + 1)), index: i });
        }
    } catch (e) { }
    return out;
}

function makeArea(choice, artboards) {
    // choice: 0 = spread atual, 1 = documento todo, 2+ = prancheta específica
    if (choice === 1) return FileExportArea.createForWholeDocument();
    if (choice >= 2) {
        const ab = artboards[choice - 2];
        try { return FileExportArea.createForArtboard(ab.node); } catch (e) { }
        try { return FileExportArea.createForArtboard(ab.index); } catch (e) { }
    }
    return FileExportArea.createForCurrentSpread();
}

function pickPreset(useJpeg) {
    const names = String(FileExportOptions.allPresetNames).split(',');
    if (useJpeg) return names.find(n => /^JPEG/i.test(n)) || names[0];
    return names.find(n => /^PNG$/i.test(n)) || names.find(n => /^PNG/i.test(n)) || names[0];
}

// ---------------------------------------------------------------------------

function requestStop() {
    const dlg = Dialog.create('Timelapse — gravando');
    dlg.initialWidth = 420;
    const g = dlg.addColumn().addGroup('');
    g.addStaticText('', 'OK para a gravação e gera o vídeo.').setIsFullWidth(true);
    const forceCtl = g.addCheckBox('Forçar limpeza (gravação travada/crash)', false);
    const r = dlg.runModal();
    if (r?.value !== DialogResult.Ok.value) return;
    if (forceCtl.value) {
        try { fsys.removeAll(RUNNING_FLAG); } catch (e) { }
        try { fsys.removeAll(STOP_FLAG); } catch (e) { }
        app.alert('Sinalizadores limpos. Rode de novo para iniciar nova gravação.');
    } else {
        fsys.createDirectories(STOP_FLAG);
    }
}

function startRecording() {
    const doc = app.documents.current;
    if (!doc) { app.alert('Abra um documento antes de gravar o timelapse.'); return; }

    // flag de parada órfã de sessão anterior
    try { if (fsys.exists(STOP_FLAG)) fsys.removeAll(STOP_FLAG); } catch (e) { }

    const artboards = listArtboards(doc);
    const areaLabels = ['Spread atual', 'Documento todo'];
    for (const ab of artboards) areaLabels.push('Prancheta: ' + ab.label);

    const dlg = Dialog.create('Timelapse Recorder');
    dlg.initialWidth = 440;
    const col = dlg.addColumn();

    const gCap = col.addGroup('Captura');
    const areaCtl = gCap.addComboBox('Área', areaLabels, artboards.length ? 2 : 0);
    const fmtCtl = gCap.addComboBox('Formato', ['JPEG (recomendado)', 'PNG'], 0);

    const gCad = col.addGroup('Cadência');
    const modeCtl = gCad.addComboBox('Capturar', ['A cada edição', 'Intervalo fixo'], 0);
    const gapCtl = gCad.addUnitValueEditor('Intervalo mín. (s)', UnitType.Number, UnitType.Number, 1, 0, 600);
    gapCtl.precision = 1;
    const maxCtl = gCad.addUnitValueEditor('Duração máx. (min)', UnitType.Number, UnitType.Number, 240, 1, 1440);
    maxCtl.precision = 0;

    col.addGroup('').addStaticText('', 'OK inicia. Para PARAR e gerar o vídeo, rode o script de novo.').setIsFullWidth(true);

    const r = dlg.runModal();
    if (r?.value !== DialogResult.Ok.value) return;

    const fixedMode = modeCtl.selectedIndex === 1;
    const gapMs = Math.max(0, (gapCtl.value ?? 1)) * 1000;
    const maxMs = Math.max(1, (maxCtl.value ?? 240)) * 60000;
    const areaChoice = areaCtl.selectedIndex ?? 0;
    const useJpeg = fmtCtl.selectedIndex === 0;
    const ext = useJpeg ? 'jpg' : 'png';

    const outDir = BASE + '/' + sessionFolderName(doc);
    try {
        fsys.createDirectories(outDir);
        if (!fsys.isDirectory(outDir)) throw new Error('pasta não criada');
    } catch (e) {
        app.alert('Não consegui criar a pasta de saída: ' + e);
        return;
    }

    const opts = FileExportOptions.createWithPresetName(pickPreset(useJpeg));
    const area = makeArea(areaChoice, artboards);
    const histKey = () => {
        try { return doc.history.position + '/' + doc.history.size; } catch (e) { return 'x'; }
    };
    let undoLimit = 1024;
    try { undoLimit = Number(app.settings.undoLimit) || 1024; } catch (e) { }
    // histórico cheio: position/size param de se mover e não denunciam edições novas
    const saturated = () => {
        try { return doc.history.size >= undoLimit && doc.history.position === doc.history.size; } catch (e) { return false; }
    };

    fsys.createDirectories(RUNNING_FLAG);

    const t0 = Date.now();
    let frames = 0, prevKey = histKey(), lastExport = 0, lastEmit = 0, bufBytes = -1;
    let done = false, inflight = null, sawSaturation = false;

    const framePath = () => outDir + '/frame_' + pad(frames, 5) + '.' + ext;
    const bufPath = outDir + '/_ultimo.' + ext;       // último estado exportado
    const tmpPath = outDir + '/_ultimo_tmp.' + ext;   // export em andamento

    // Exporta o estado atual para o buffer. Resolve true se os bytes mudaram.
    // Assíncrono (não trava a UI); inflight garante 1 export por vez.
    const refresh = () => {
        lastExport = Date.now();
        inflight = doc.promises.export(tmpPath, opts, area).then(() => {
            const sz = Number(fsys.getFileSize(tmpPath));
            fsys.rename(tmpPath, bufPath);    // substitui: o buffer nunca fica pela metade
            const changed = sz !== bufBytes;
            bufBytes = sz;
            return changed;
        }).catch(() => false).finally(() => { inflight = null; });
        return inflight;
    };

    // Frame = cópia do buffer (operação de arquivo, sem export).
    const emit = () => {
        if (bufBytes < 0) return;
        try { fsys.copyFile(bufPath, framePath()); frames++; lastEmit = Date.now(); } catch (e) { }
    };

    const finish = (reason) => {
        done = true;
        Timer.cancelAll();
        const wrapUp = () => {
            try { fsys.remove(bufPath); fsys.remove(tmpPath); } catch (e) { }
            try { fsys.createDirectories(outDir + '/_render'); } catch (e) { }  // sinal p/ vigia montar o MP4
            try { fsys.removeAll(RUNNING_FLAG); } catch (e) { }
            try { fsys.removeAll(STOP_FLAG); } catch (e) { }
            const secs = Math.round((Date.now() - t0) / 1000);
            app.alert(reason + '\n'
                + frames + ' frames em ' + Math.floor(secs / 60) + 'min ' + (secs % 60) + 's (~' + (frames / 30).toFixed(1) + 's de vídeo a 30fps).\n'
                + 'O MP4 será gerado automaticamente — o Explorer abre na pasta quando ficar pronto.\n'
                + 'Pasta: ' + outDir
                + (sawSaturation ? '\n\nAviso: o histórico de desfazer encheu durante a gravação. Para evitar, aumente Preferências > Limite de Desfazer.' : ''));
        };
        // frame final: espera o export em voo, captura o estado final
        Promise.resolve(inflight).then(refresh).then(ch => { if (ch || fixedMode) emit(); }).then(wrapUp, wrapUp);
    };

    refresh().then(emit);  // frame inicial

    setInterval(POLL_MS, (err) => {
        if (done) return;
        if (err) { done = true; Timer.cancelAll(); try { fsys.removeAll(RUNNING_FLAG); } catch (e2) { } return; }
        try {
            if (fsys.exists(STOP_FLAG)) { finish('Gravação encerrada por você.'); return; }
            if (Date.now() - t0 > maxMs) { finish('Duração máxima atingida.'); return; }
            if (frames >= MAX_FRAMES) { finish('Limite de frames atingido.'); return; }
            if (!doc.isOpen) { done = true; Timer.cancelAll(); try { fsys.removeAll(RUNNING_FLAG); } catch (e2) { } return; }

            const now = Date.now();
            const key = histKey();
            const fresh = key !== prevKey;   // edição concluída agora (mouse acabou de soltar)
            prevKey = key;
            const sat = saturated();
            if (sat) sawSaturation = true;

            // Exportar no meio de um arraste faz o objeto "fugir" do cursor. O histórico
            // só muda ao soltar o mouse, então só exporta logo após uma edição concluída.
            // Mudança perdida (export em voo ou intervalo mín.) entra no próximo frame.
            if (!inflight) {
                if (!sat && fresh && (fixedMode || now - lastExport >= gapMs)) {
                    refresh().then(ch => { if (ch && !fixedMode) emit(); });
                } else if (sat && now - lastExport >= Math.max(gapMs, SAT_MS)) {
                    // histórico cheio: sem sinal de edição; compara bytes de um export periódico
                    // ponytail: pode cair no meio de um arraste; a API não expõe outro sinal
                    refresh().then(ch => { if (ch && !fixedMode) emit(); });
                }
            }
            // intervalo fixo: ritmo regular copiando o último estado, sem exportar
            if (fixedMode && now - lastEmit >= Math.max(gapMs, 500)) emit();
        } catch (e) {
            // documento fechado ou erro: encerra limpando flags
            done = true;
            Timer.cancelAll();
            try { fsys.removeAll(RUNNING_FLAG); } catch (e2) { }
            try { fsys.removeAll(STOP_FLAG); } catch (e2) { }
        }
    });
}

function main() {
    fsys.createDirectories(BASE);
    if (fsys.exists(RUNNING_FLAG)) requestStop();
    else startRecording();
}

main();
