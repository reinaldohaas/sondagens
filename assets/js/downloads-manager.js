/**
 * downloads-manager.js - Gerenciador de Arquivos Baixados e Cache Local
 * Salva automaticamente todas as sondagens baixadas (Wyoming BUFR / TEMP e GFS),
 * sempre verifica se o arquivo já está em cache antes de requisitar a internet,
 * e renderiza o painel com a lista de todos os arquivos baixados.
 */

class DownloadsManager {
    constructor() {
        this.storageKey = 'sondagens_downloads_v1';
        this.downloads = [];
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        await this.refreshList();
        this.updateBadge();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Botão para atualizar a lista
        document.getElementById('btnRefreshDownloads')?.addEventListener('click', () => {
            this.refreshList();
        });

        // Botão para limpar cache
        document.getElementById('btnClearDownloads')?.addEventListener('click', () => {
            if (confirm('Deseja realmente limpar todo o histórico de arquivos baixados do cache?')) {
                this.clearAll();
            }
        });
    }

    // Atualiza a lista tanto do backend local (/api/downloads) quanto do localStorage
    async refreshList() {
        let backendItems = [];
        try {
            const resp = await fetch('/api/downloads', { signal: AbortSignal.timeout(3000) });
            if (resp.ok) {
                backendItems = await resp.json();
            }
        } catch (e) {
            // Servidor local offline, usa localStorage
        }

        const localItems = this.getLocalItems();

        // Faz o merge sem duplicatas por ID
        const map = new Map();
        localItems.forEach(item => map.set(item.id, item));
        backendItems.forEach(item => map.set(item.id, item));

        this.downloads = Array.from(map.values()).filter(it => 
            !it.filename?.includes('Modelo_GFS') && !it.source?.includes('Modelo GFS')
        );
        // Ordena pelos mais recentes
        this.downloads.sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));

        this.saveLocalItems(this.downloads);
        this.updateBadge();
        this.renderUI();
    }

    // -------------------------------------------------------------
    // VERIFICAÇÃO DE CACHE (SEMPRE VERIFICAR SE ESTÁ BAIXADA)
    // -------------------------------------------------------------
    async checkCache(stationId, dtStr) {
        const idClean = String(stationId).trim().toUpperCase();
        // Mapeamento de apelidos
        const lookupId = (idClean === 'SBFL' || idClean === '83838') ? '83899' : idClean;

        const dateClean = dtStr.split(' ')[0].replace(/-/g, '');
        const hourClean = dtStr.split(' ')[1] ? dtStr.split(' ')[1].split(':')[0] : '12';

        // 1. Procura no cache local (memória / localStorage / backend index)
        const match = this.downloads.find(d => 
            (d.station_id === lookupId || d.station_id === idClean) &&
            d.date.replace(/-/g, '') === dateClean &&
            d.hour === hourClean
        );

        if (match) {
            if (match.content) {
                console.log(`⚡ [Cache Hit Local] Encontrado no cache: ${match.filename}`);
                return {
                    source: 'cache_local',
                    item: match,
                    content: match.content
                };
            }
            // Se foi listado pelo backend mas ainda não tem o texto na memória do navegador
            if (match.filename) {
                try {
                    const resp = await fetch(`/api/downloads/file?name=${encodeURIComponent(match.filename)}`, { signal: AbortSignal.timeout(3000) });
                    if (resp.ok) {
                        const text = await resp.text();
                        if (text && text.includes('PRES')) {
                            match.content = text;
                            console.log(`⚡ [Cache Hit Disco] Arquivo lido do disco data/downloads/: ${match.filename}`);
                            return {
                                source: 'cache_disk',
                                item: match,
                                content: text
                            };
                        }
                    }
                } catch (e) {
                    // Falha silenciosa no backend
                }
            }
        }

        return null;
    }

    // -------------------------------------------------------------
    // SALVAR ARQUIVO BAIXADO NO CACHE LOCAL
    // -------------------------------------------------------------
    saveSounding(stationId, stationName, dtStr, rawContent, source = 'Wyoming Real BUFR') {
        if (!rawContent || !rawContent.includes('PRES')) return;

        const idClean = String(stationId).trim().toUpperCase();
        const datePart = dtStr.split(' ')[0];
        const hourPart = dtStr.split(' ')[1] ? dtStr.split(' ')[1].split(':')[0] : '12';
        const dateClean = datePart.replace(/-/g, '');

        // Conta níveis
        let levelsCount = 0;
        const preMatch = rawContent.match(/<PRE>([\s\S]*?)<\/PRE>/i);
        if (preMatch) {
            const lines = preMatch[1].split('\n').map(l => l.trim()).filter(l => l);
            let inData = false;
            for (const line of lines) {
                if (line.includes('PRES') && line.includes('HGHT')) {
                    inData = true;
                    continue;
                }
                if (inData) {
                    if (line.includes('---') || line.includes('hPa')) continue;
                    if (line.startsWith('<') || (!line[0].match(/\d/) && !line.startsWith('-'))) break;
                    levelsCount++;
                }
            }
        }

        const sizeKb = Math.round((rawContent.length / 1024) * 10) / 10;
        const filename = `${idClean}_${dateClean}_${hourPart}Z_${source.replace(/[^a-zA-Z0-9]/g, '_')}.html`;

        const record = {
            id: `${idClean}_${dateClean}_${hourPart}`,
            station_id: idClean,
            station_name: stationName || `Estação ${idClean}`,
            datetime: dtStr,
            date: datePart,
            hour: hourPart,
            source: source,
            filename: filename,
            filesize_kb: sizeKb,
            levels_count: levelsCount,
            downloaded_at: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
            content: rawContent
        };

        // Salva na lista
        this.downloads = this.downloads.filter(d => d.id !== record.id);
        this.downloads.unshift(record);

        // Mantém até 30 sondagens completas no localStorage
        const trimmed = this.downloads.slice(0, 30);
        this.saveLocalItems(trimmed);
        this.updateBadge();
        this.renderUI();

        console.log(`💾 [Salvo em Cache] ${filename} (${levelsCount} níveis, ${sizeKb} KB)`);
        return record;
    }

    // -------------------------------------------------------------
    // RENDERIZAÇÃO DA TABELA DE ARQUIVOS BAIXADOS
    // -------------------------------------------------------------
    renderUI() {
        const tbody = document.getElementById('downloadsTableBody');
        if (!tbody) return;

        if (this.downloads.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        Nenhum arquivo baixado ainda. Ao consultar qualquer radiossondagem da Universidade de Wyoming ou do modelo, ela será salva e exibida aqui automaticamente.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        this.downloads.forEach((item, idx) => {
            const tr = document.createElement('tr');
            
            const isReal = item.source.includes('Wyoming') || item.source.includes('Real') || item.source.includes('BUFR');
            const sourceBadge = isReal 
                ? `<span class="badge badge-favorable" style="background: #064e3b; color: #34d399;">🎈 ${item.source}</span>`
                : `<span class="badge" style="background: #1e293b; color: #38bdf8;">🌐 ${item.source}</span>`;

            tr.innerHTML = `
                <td><strong>${item.date}</strong> <span style="color:var(--text-dim);">${item.hour}Z</span></td>
                <td>
                    <strong>${item.station_name}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">WMO ID: ${item.station_id}</div>
                </td>
                <td>${sourceBadge}</td>
                <td><strong>${item.levels_count || '-'}</strong> níveis</td>
                <td>${item.filesize_kb} KB</td>
                <td style="font-size: 11px; color: var(--text-dim);">${item.downloaded_at || '-'}</td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-sm btn-primary btn-load-cached" data-idx="${idx}" title="Abrir no Skew-T">
                            📈 Abrir
                        </button>
                        <button class="btn btn-sm btn-download-file" data-idx="${idx}" title="Salvar arquivo no computador">
                            💾
                        </button>
                        <button class="btn btn-sm btn-delete-cached" data-idx="${idx}" title="Excluir do cache" style="color: #f87171;">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Eventos dos botões da tabela
        tbody.querySelectorAll('.btn-load-cached').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                this.loadCachedToMain(this.downloads[idx]);
            });
        });

        tbody.querySelectorAll('.btn-download-file').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                this.downloadFileToDisk(this.downloads[idx]);
            });
        });

        tbody.querySelectorAll('.btn-delete-cached').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                this.deleteItem(this.downloads[idx]);
            });
        });
    }

    // Carrega o arquivo baixado diretamente no Skew-T e no Hodógrafo
    async loadCachedToMain(item) {
        if (!item || !window.app) return;

        // Se ainda não tem conteúdo em memória, busca do backend
        if (!item.content && item.filename) {
            try {
                const resp = await fetch(`/api/downloads/file?name=${encodeURIComponent(item.filename)}`);
                if (resp.ok) {
                    item.content = await resp.text();
                }
            } catch (e) {}
        }

        // Se tem conteúdo salvo em texto
        if (item.content) {
            const parsed = DataParser.parse(item.content, {
                station_id: item.station_id,
                station_name: item.station_name,
                timestamp: item.datetime
            });

            if (parsed && parsed.levels.length > 3) {
                window.app.currentData = parsed;
                window.app.currentStationId = item.station_id;
                
                const sel = document.getElementById('stationSelect');
                if (sel) sel.value = item.station_id;

                window.app.updateStationInfo();
                window.app.recalculateAndRender();

                // Alterna para a aba de diagramas
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                document.querySelector('.tab-button[data-tab="tabDiagrams"]')?.classList.add('active');
                document.getElementById('tabDiagrams')?.classList.add('active');

                window.app.showStatus(`⚡ Sondagem carregada do arquivo local já baixado: ${item.filename} (${parsed.levels.length} níveis)`, 'success');
                window.scrollTo({ top: 120, behavior: 'smooth' });
                return;
            }
        }

        // Se não tiver o conteúdo em memória, busca do backend local
        window.app.currentStationId = item.station_id;
        const dateInput = document.getElementById('inputDate');
        const hourInput = document.getElementById('inputHour');
        if (dateInput) dateInput.value = item.date;
        if (hourInput) hourInput.value = item.hour;

        window.app.fetchSounding();
    }

    // Baixa o arquivo para a máquina do usuário via Blob
    async downloadFileToDisk(item) {
        if (!item) return;
        if (!item.content && item.filename) {
            try {
                const resp = await fetch(`/api/downloads/file?name=${encodeURIComponent(item.filename)}`);
                if (resp.ok) {
                    item.content = await resp.text();
                }
            } catch (e) {}
        }

        const content = item.content || `<!-- Arquivo de Sondagem: ${item.filename} -->`;
        const blob = new Blob([content], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Exclui item do cache
    async deleteItem(item) {
        if (!item) return;
        // Notifica o backend se existir
        try {
            await fetch(`/api/downloads?file=${encodeURIComponent(item.filename)}`, { method: 'DELETE' });
        } catch (e) {}

        this.downloads = this.downloads.filter(d => d.id !== item.id);
        this.saveLocalItems(this.downloads);
        this.updateBadge();
        this.renderUI();
    }

    clearAll() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {}
        this.downloads = [];
        this.updateBadge();
        this.renderUI();
    }

    updateBadge() {
        const badge = document.getElementById('downloadsCountBadge');
        if (badge) {
            badge.textContent = this.downloads.length;
            badge.style.display = this.downloads.length > 0 ? 'inline-block' : 'none';
        }
    }

    getLocalItems() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    saveLocalItems(items) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(items));
        } catch (e) {
            console.warn('LocalStorage cheio ou indisponível:', e);
        }
    }
}

// Instância global
window.downloadsManager = new DownloadsManager();
