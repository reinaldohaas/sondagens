/**
 * app.js - Orquestrador Principal da Aplicação de Radiossondagens
 * Gerencia a interface, seleção de estações (foco Sul do Brasil), busca de dados (Wyoming + GFS Open-Meteo),
 * cálculo e exibição de parâmetros organizados por categoria, e análise por período com filtro de CIN.
 */

class SoundingApp {
    constructor() {
        this.skewt = null;
        this.hodo = null;
        this.currentData = null;
        this.currentParcelType = 'surface';
        
        // Estação inicial padrão: Florianópolis (SC) - SBFL / WMO 83899 (Wyoming BUFR Real)
        this.currentStationId = '83899';
        
        // Data padrão: 2026-09-15 12Z
        this.currentDate = '2026-09-15';
        this.currentHour = '12';

        // Mapeamento de arquivos locais pré-carregados
        this.sampleFiles = {
            '83971_20240501_12': 'data/samples/83971_20240501_12Z_PortoAlegre.json',
            '83971_20240115_12': 'data/samples/83971_20240115_12Z_PortoAlegre_Verao.json',
            '83840_20240502_12': 'data/samples/83840_20240502_12Z_Curitiba.json',
            '83746_20240501_12': 'data/samples/83746_20240501_12Z_RioGaleao.json',
            '72357_severe': 'data/samples/72357_Severe_Benchmark.json'
        };

        this.init();
    }

    init() {
        // Inicializa gráficos Canvas
        this.skewt = new SkewTChart('skewtCanvas');
        this.hodo = new HodographChart('hodoCanvas');

        // Inicializa analisador de período
        if (window.periodAnalyzer) {
            window.periodAnalyzer.init();
        }

        this.populateStationSelect();
        this.setupEventListeners();
        this.setupPeriodAnalyzerListeners();

        // Carrega inicialmente SBFL (Florianópolis) via modelo GFS
        this.updateStationInfo();
        this.fetchSounding();
    }

    // Preenche o seletor dropdown com as estações categorizadas
    populateStationSelect() {
        const select = document.getElementById('stationSelect');
        const periodSelect = document.getElementById('periodStationSelect');
        if (!select) return;
        select.innerHTML = '';
        if (periodSelect) periodSelect.innerHTML = '';

        const groups = [
            { key: 'south_brazil', label: '📍 Sul do Brasil (Foco Principal)' },
            { key: 'cone_sur', label: '🌎 Bacia do Prata & Cone Sul (Vizinhos)' },
            { key: 'brazil', label: '🇧🇷 Brasil (Demais Regiões)' },
            { key: 'world', label: '🌐 Mundo (Referências e Benchmarks)' }
        ];

        groups.forEach(g => {
            const optGroup = document.createElement('optgroup');
            optGroup.label = g.label;
            const optGroup2 = document.createElement('optgroup');
            optGroup2.label = g.label;

            const list = STATIONS_CATALOG[g.key] || [];
            list.forEach(stn => {
                const opt = document.createElement('option');
                opt.value = stn.id;
                opt.textContent = `${stn.id} - ${stn.name} (${stn.state ? stn.state + ', ' : ''}${stn.country})`;
                if (stn.id === this.currentStationId) opt.selected = true;
                optGroup.appendChild(opt);

                const opt2 = opt.cloneNode(true);
                optGroup2.appendChild(opt2);
            });
            select.appendChild(optGroup);
            if (periodSelect) periodSelect.appendChild(optGroup2);
        });
    }

    // Configura listeners de eventos da UI
    setupEventListeners() {
        // Mudança no select de estação
        document.getElementById('stationSelect')?.addEventListener('change', (e) => {
            this.currentStationId = e.target.value;
            this.updateStationInfo();
            this.fetchSounding();
        });

        // Botões rápidos de 1 clique para o Sul do Brasil
        document.querySelectorAll('.btn-quick-station').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stnId = btn.getAttribute('data-station');
                this.selectQuickStation(stnId);
            });
        });

        // Botões de amostras históricas pré-carregadas
        document.querySelectorAll('.btn-sample').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sampleKey = btn.getAttribute('data-sample');
                this.loadSample(sampleKey);
            });
        });

        // Botão Carregar Sondagem
        document.getElementById('btnFetch')?.addEventListener('click', () => {
            this.fetchSounding();
        });

        // Seletor de Tipo de Parcela (Superfície, Mixed Layer, Most Unstable)
        document.querySelectorAll('input[name="parcelType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentParcelType = e.target.value;
                this.recalculateAndRender();
            });
        });

        // Toggles de camadas do Skew-T
        const layerIds = [
            'layerIsobars', 'layerIsotherms', 'layerDryAdiabats',
            'layerMoistAdiabats', 'layerMixingRatio', 'layerParcel',
            'layerCapeCin', 'layerWindBarbs'
        ];
        layerIds.forEach(id => {
            const chk = document.getElementById(id);
            if (chk) {
                chk.addEventListener('change', (e) => {
                    const layerKey = chk.getAttribute('data-layer');
                    if (this.skewt && layerKey) {
                        this.skewt.layers[layerKey] = e.target.checked;
                        this.skewt.render();
                    }
                });
            }
        });

        // Navegação de Horário (+12h / -12h / 00Z / 12Z)
        document.getElementById('btnPrev12h')?.addEventListener('click', () => this.shiftTime(-12));
        document.getElementById('btnNext12h')?.addEventListener('click', () => this.shiftTime(12));
        document.getElementById('btnSet00Z')?.addEventListener('click', () => {
            this.setSynopticHour('00');
            this.fetchSounding();
        });
        document.getElementById('btnSet12Z')?.addEventListener('click', () => {
            this.setSynopticHour('12');
            this.fetchSounding();
        });

        // Upload de arquivo local (arrastar ou selecionar)
        const fileInput = document.getElementById('fileUploadInput');
        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFileUpload(file);
        });

        // Exportação para imagem PNG
        document.getElementById('btnExportPng')?.addEventListener('click', () => {
            this.exportSkewtImage();
        });

        // Exportação para CSV dos níveis
        document.getElementById('btnExportCsv')?.addEventListener('click', () => {
            this.exportSoundingCsv();
        });

        // Alternância de Abas
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-tab');
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(target)?.classList.add('active');

                // Renderiza gráficos da aba selecionada
                if (target === 'tabDiagrams') {
                    if (this.skewt) this.skewt.render();
                    if (this.hodo) this.hodo.render();
                } else if (target === 'tabPeriod') {
                    if (window.periodAnalyzer) window.periodAnalyzer.renderChart();
                }
            });
        });

        // Campo de busca rápida de estações
        const searchInput = document.getElementById('stationSearchInput');
        searchInput?.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val.length >= 2) {
                const match = findStation(val);
                if (match) {
                    const sel = document.getElementById('stationSelect');
                    if (sel) {
                        sel.value = match.id;
                        this.currentStationId = match.id;
                        this.updateStationInfo();
                    }
                }
            }
        });
    }

    // Configuração dos controles da Análise por Período
    setupPeriodAnalyzerListeners() {
        const btnFetchPeriod = document.getElementById('btnFetchPeriod');
        const periodStnSelect = document.getElementById('periodStationSelect');
        const cinOpSelect = document.getElementById('periodCinOp');
        const cinValInput = document.getElementById('periodCinVal');
        const cinValSlider = document.getElementById('periodCinSlider');
        const capeValInput = document.getElementById('periodCapeVal');
        const pwatValInput = document.getElementById('periodPwatVal');
        const btnExportPeriodCsv = document.getElementById('btnExportPeriodCsv');

        // Sincroniza estação entre seletor principal e de período
        if (periodStnSelect) {
            periodStnSelect.addEventListener('change', (e) => {
                this.currentStationId = e.target.value;
                const mainSel = document.getElementById('stationSelect');
                if (mainSel) mainSel.value = this.currentStationId;
                this.updateStationInfo();
            });
        }

        // Botão principal de buscar período
        btnFetchPeriod?.addEventListener('click', async () => {
            const stnId = periodStnSelect ? periodStnSelect.value : this.currentStationId;
            const stn = findStation(stnId);
            const startDt = document.getElementById('periodStartDate')?.value || '2024-01-01';
            const endDt = document.getElementById('periodEndDate')?.value || '2024-01-15';

            const synoptic = [];
            if (document.getElementById('periodCheck12Z')?.checked) synoptic.push('12');
            if (document.getElementById('periodCheck00Z')?.checked) synoptic.push('00');
            if (synoptic.length === 0) synoptic.push('12');

            this.showStatus(`Baixando e analisando série temporal para ${stn ? stn.name : stnId} (${startDt} a ${endDt})...`, 'loading');
            btnFetchPeriod.disabled = true;
            btnFetchPeriod.textContent = '⏳ Baixando...';

            try {
                const results = await window.periodAnalyzer.fetchPeriod(stn, startDt, endDt, synoptic);
                this.showStatus(`Análise de período concluída: ${results.length} passos de tempo processados para ${stn ? stn.name : stnId}.`, 'success');
            } catch (err) {
                console.error('Erro na análise de período:', err);
                this.showStatus(`Erro ao processar período: ${err.message}`, 'error');
            } finally {
                btnFetchPeriod.disabled = false;
                btnFetchPeriod.textContent = '📥 Baixar Período & Analisar';
            }
        });

        // Sincroniza slider e número de CIN
        if (cinValInput && cinValSlider) {
            cinValSlider.addEventListener('input', (e) => {
                cinValInput.value = e.target.value;
                this.triggerPeriodFilterUpdate();
            });
            cinValInput.addEventListener('input', (e) => {
                cinValSlider.value = e.target.value;
                this.triggerPeriodFilterUpdate();
            });
        }

        cinOpSelect?.addEventListener('change', () => this.triggerPeriodFilterUpdate());
        capeValInput?.addEventListener('input', () => this.triggerPeriodFilterUpdate());
        pwatValInput?.addEventListener('input', () => this.triggerPeriodFilterUpdate());

        // Botões de atalho para períodos rápidos
        document.querySelectorAll('.btn-period-quick').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.getAttribute('data-days'));
                const preset = btn.getAttribute('data-preset');
                const startEl = document.getElementById('periodStartDate');
                const endEl = document.getElementById('periodEndDate');

                if (preset === 'jan24') {
                    if (startEl) startEl.value = '2024-01-01';
                    if (endEl) endEl.value = '2024-01-31';
                } else if (preset === 'may24') {
                    if (startEl) startEl.value = '2024-05-01';
                    if (endEl) endEl.value = '2024-05-15';
                } else if (days) {
                    const today = new Date();
                    const past = new Date();
                    past.setDate(today.getDate() - days);

                    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    if (startEl) startEl.value = fmt(past);
                    if (endEl) endEl.value = fmt(today);
                }

                btnFetchPeriod?.click();
            });
        });

        // Exportar CSV do período
        btnExportPeriodCsv?.addEventListener('click', () => {
            if (window.periodAnalyzer) window.periodAnalyzer.exportCsv();
        });
    }

    triggerPeriodFilterUpdate() {
        if (!window.periodAnalyzer) return;
        const op = document.getElementById('periodCinOp')?.value || 'abs_gt';
        const cinVal = parseFloat(document.getElementById('periodCinVal')?.value || '50');
        const capeVal = parseFloat(document.getElementById('periodCapeVal')?.value || '0');
        const pwatVal = parseFloat(document.getElementById('periodPwatVal')?.value || '0');

        window.periodAnalyzer.setFilters({
            cinOp: op,
            cinVal: isNaN(cinVal) ? 0 : cinVal,
            capeVal: isNaN(capeVal) ? 0 : capeVal,
            pwatVal: isNaN(pwatVal) ? 0 : pwatVal
        });
    }

    // Seleção rápida de estação do Sul do Brasil
    selectQuickStation(stnId) {
        this.currentStationId = stnId;
        const sel = document.getElementById('stationSelect');
        if (sel) sel.value = stnId;

        const pSel = document.getElementById('periodStationSelect');
        if (pSel) pSel.value = stnId;
        
        document.querySelectorAll('.btn-quick-station').forEach(btn => {
            if (btn.getAttribute('data-station') === stnId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.updateStationInfo();
        this.fetchSounding();
    }

    // Atualiza o painel com as informações da estação selecionada
    updateStationInfo() {
        const stn = findStation(this.currentStationId);
        const elName = document.getElementById('stnInfoName');
        const elMeta = document.getElementById('stnInfoMeta');
        const elDesc = document.getElementById('stnInfoDesc');

        if (stn) {
            if (elName) elName.textContent = `${stn.name} (${stn.icao || stn.id})`;
            if (elMeta) elMeta.textContent = `WMO ID: ${stn.id} | Lat: ${stn.lat}° | Lon: ${stn.lon}° | Alt: ${stn.elev}m | ${stn.region}, ${stn.country}`;
            if (elDesc) elDesc.textContent = stn.desc || '';
        } else {
            if (elName) elName.textContent = `Estação ${this.currentStationId}`;
            if (elMeta) elMeta.textContent = `WMO ID: ${this.currentStationId}`;
            if (elDesc) elDesc.textContent = '';
        }
    }

    // Ajusta o horário sinótico
    setSynopticHour(hour) {
        this.currentHour = hour;
        const hourInput = document.getElementById('inputHour');
        if (hourInput) hourInput.value = hour;
    }

    shiftTime(hours) {
        const dateInput = document.getElementById('inputDate');
        const hourInput = document.getElementById('inputHour');
        if (!dateInput || !hourInput) return;

        let curDt = new Date(`${dateInput.value}T${hourInput.value}:00:00Z`);
        if (isNaN(curDt.getTime())) curDt = new Date();

        curDt.setUTCHours(curDt.getUTCHours() + hours);
        const yyyy = curDt.getUTCFullYear();
        const mm = String(curDt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(curDt.getUTCDate()).padStart(2, '0');
        const hh = String(curDt.getUTCHours()).padStart(2, '0');

        dateInput.value = `${yyyy}-${mm}-${dd}`;
        hourInput.value = (hh === '00' || hh === '12') ? hh : (parseInt(hh) < 12 ? '00' : '12');
        this.currentDate = dateInput.value;
        this.currentHour = hourInput.value;
        this.fetchSounding();
    }

    // Carrega amostra pré-gravada
    async loadSample(sampleKey) {
        const path = this.sampleFiles[sampleKey];
        if (!path) return;

        this.showStatus('Carregando amostra local...', 'loading');
        try {
            const resp = await fetch(path);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            
            this.currentData = DataParser.parse(data);
            this.currentStationId = this.currentData.station_id;
            
            const sel = document.getElementById('stationSelect');
            if (sel) sel.value = this.currentStationId;
            
            this.updateStationInfo();
            this.recalculateAndRender();
            this.showStatus(`Amostra carregada: ${this.currentData.station_name} (${this.currentData.timestamp})`, 'success');
        } catch (err) {
            console.error('Erro ao carregar amostra:', err);
            this.showStatus(`Erro ao carregar amostra local: ${err.message}`, 'error');
        }
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // BUSCA DE SONDAGEM COM CACHE-FIRST E PRIORIDADE WYOMING BUFR
    // -------------------------------------------------------------
    async fetchSounding() {
        const dateInput = document.getElementById('inputDate');
        const hourInput = document.getElementById('inputHour');
        const stnId = this.currentStationId;
        const stn = findStation(stnId);

        const dateStr = dateInput ? dateInput.value : this.currentDate;
        const hourStr = hourInput ? hourInput.value : this.currentHour;
        const dtFormatted = `${dateStr} ${hourStr}:00:00`;
        const wyomingId = getWyomingStationId(stnId);

        this.showStatus(`Verificando cache e buscando sondagem ${stnId} (${wyomingId}) para ${dtFormatted}...`, 'loading');

        // =============================================================
        // PASSO 1: SEMPRE VERIFICAR SE O ARQUIVO JÁ ESTÁ BAIXADO EM CACHE
        // =============================================================
        try {
            const cached = await window.downloadsManager?.checkCache(wyomingId, dtFormatted);
            if (cached && cached.content) {
                const parsed = DataParser.parse(cached.content, {
                    station_id: stnId,
                    station_name: stn ? stn.name : `Estação ${stnId}`,
                    timestamp: dtFormatted
                });

                if (parsed && parsed.levels.length > 3) {
                    this.currentData = parsed;
                    this.recalculateAndRender();
                    const cacheType = cached.source === 'cache_disk' ? '💾 Arquivo em Disco' : '⚡ Cache Local';
                    this.showStatus(`[${cacheType}] Sondagem já baixada carregada instantaneamente (${parsed.levels.length} níveis)`, 'success');
                    return;
                }
            }
        } catch (err) {
            console.warn('Erro ao verificar cache local:', err);
        }

        // =============================================================
        // PASSO 2: PRIORIZAR SONDAGEM REAL NA UNIV. OF WYOMING (src=BUFR)
        // =============================================================
        // 2A. Via backend Python local (/api/sounding) - já verifica disco e faz fetch Wyoming BUFR com timeout adequado
        try {
            const localApiUrl = `/api/sounding?id=${encodeURIComponent(wyomingId)}&datetime=${encodeURIComponent(dtFormatted)}`;
            const localResp = await fetch(localApiUrl, { signal: AbortSignal.timeout(28000) });
            if (localResp.ok) {
                const text = await localResp.text();
                const isCacheHit = localResp.headers.get('X-Sounding-Cache') === 'HIT';
                const sourceTag = localResp.headers.get('X-Sounding-Source') || (text.includes('BUFR') ? 'Wyoming Real BUFR' : 'Wyoming Real');
                
                const parsed = DataParser.parse(text, {
                    station_id: stnId,
                    station_name: stn ? stn.name : `Estação ${stnId}`,
                    timestamp: dtFormatted
                });

                if (parsed && parsed.levels.length > 3) {
                    this.currentData = parsed;
                    this.recalculateAndRender();

                    // Salva no gerenciador de downloads para atualizar contador e tabela
                    window.downloadsManager?.saveSounding(stnId, stn?.name, dtFormatted, text, isCacheHit ? 'Arquivo Local Baixado' : sourceTag);

                    const hitMsg = isCacheHit ? '⚡ Carregado do arquivo salvo em data/downloads/' : `🎈 Sondagem real baixada da Univ. of Wyoming (${sourceTag})`;
                    this.showStatus(`${hitMsg} (${parsed.levels.length} níveis)`, 'success');
                    return;
                }
            }
        } catch (e) {
            console.log('Backend local não respondeu ou demorou. Tentando métodos alternativos...', e);
        }

        // 2B. Requisição direta cliente ao Wyoming (se hospedado no mesmo domínio ou via proxy)
        try {
            const wyomingBUFRUrl = `https://weather.uwyo.edu/wsgi/sounding?datetime=${encodeURIComponent(dtFormatted)}&id=${encodeURIComponent(wyomingId)}&src=BUFR&type=TEXT:LIST`;
            const wyomingResp = await fetch(wyomingBUFRUrl, { signal: AbortSignal.timeout(12000) });
            if (wyomingResp.ok) {
                const text = await wyomingResp.text();
                if (text.includes('PRES')) {
                    const parsed = DataParser.parse(text, {
                        station_id: stnId,
                        station_name: stn ? stn.name : `Estação ${stnId}`,
                        timestamp: dtFormatted
                    });
                    if (parsed && parsed.levels.length > 3) {
                        this.currentData = parsed;
                        this.recalculateAndRender();
                        window.downloadsManager?.saveSounding(stnId, stn?.name, dtFormatted, text, 'Wyoming Real BUFR');
                        this.showStatus(`🎈 Sondagem real baixada diretamente da Univ. of Wyoming BUFR (${parsed.levels.length} níveis)`, 'success');
                        return;
                    }
                }
            }
        } catch (e) {
            // Wyoming bloqueado por CORS ou indisponível no cliente
        }

        // =============================================================
        // PASSO 3: FALLBACK MODELO GFS / REANÁLISE (QUANDO NÃO HOUVER BALÃO REAL)
        // =============================================================
        if (stn && stn.lat && stn.lon) {
            const success = await this.fetchOpenMeteoSounding(stn, dateStr, hourStr);
            if (success) {
                // Registra no download manager
                window.downloadsManager?.saveSounding(
                    stnId, 
                    stn.name, 
                    dtFormatted, 
                    `<!-- Modelo GFS Open-Meteo para ${stn.name} em ${dtFormatted} -->\nPRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SPED\nhPa     m      C      C      %     g/kg    deg    knot\n----------------------------------------------------\n` +
                    this.currentData.levels.map(l => `${String(l.pres).padStart(7)} ${String(l.hght||'').padStart(6)} ${String(l.temp||'').padStart(6)} ${String(l.dwpt||'').padStart(6)} ${String(l.relh||'').padStart(6)} ${String(l.mixr||'').padStart(6)} ${String(l.drct||'').padStart(6)} ${String(l.sped_kt||'').padStart(7)}`).join('\n'),
                    'Modelo GFS Reanálise'
                );
                return;
            }
        }

        // =============================================================
        // PASSO 4: FALLBACK PARA AMOSTRAS SALVAS
        // =============================================================
        const sampleKey = `${stnId}_${dateStr.replace(/-/g, '')}_${hourStr}`;
        if (this.sampleFiles[sampleKey]) {
            this.showStatus('Carregando amostra salva de referência...', 'warning');
            this.loadSample(sampleKey);
            return;
        }

        if (stnId === '83971' || wyomingId === '83971') {
            this.loadSample('83971_20240501_12');
            return;
        }

        this.showStatus(`Nenhuma sondagem disponível para ${stnId} em ${dtFormatted}. Verifique a data ou utilize a aba Análise por Período.`, 'error');
    }

    // Busca perfil vertical diretamente via API Open-Meteo GFS (Zero CORS block, 100% de disponibilidade)
    async fetchOpenMeteoSounding(station, dateStr, hourStr) {
        try {
            const levels = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50];
            const vars = [];
            levels.forEach(p => {
                vars.push(`temperature_${p}hPa`);
                vars.push(`dew_point_${p}hPa`);
                vars.push(`relative_humidity_${p}hPa`);
                vars.push(`wind_speed_${p}hPa`);
                vars.push(`wind_direction_${p}hPa`);
                vars.push(`geopotential_height_${p}hPa`);
            });

            // Determina se data é histórica ou recente
            const now = new Date();
            const reqDt = new Date(`${dateStr}T12:00:00Z`);
            const daysDiff = (now.getTime() - reqDt.getTime()) / (1000 * 3600 * 24);

            const endpoint = daysDiff >= 3 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';

            const query = new URLSearchParams({
                latitude: station.lat.toFixed(4),
                longitude: station.lon.toFixed(4),
                start_date: dateStr,
                end_date: dateStr,
                models: 'gfs_seamless',
                hourly: vars.join(',')
            });

            const resp = await fetch(`${endpoint}?${query.toString()}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            const times = data.hourly.time;
            const targetIso = `${dateStr}T${hourStr}:00`;
            const idx = times.indexOf(targetIso) !== -1 ? times.indexOf(targetIso) : (parseInt(hourStr) || 12);

            const profileLevels = [];
            levels.forEach(p => {
                const t = data.hourly[`temperature_${p}hPa`][idx];
                const td = data.hourly[`dew_point_${p}hPa`][idx];
                const z = data.hourly[`geopotential_height_${p}hPa`][idx];
                const rh = data.hourly[`relative_humidity_${p}hPa`][idx];
                const ws = data.hourly[`wind_speed_${p}hPa`][idx];
                const wd = data.hourly[`wind_direction_${p}hPa`][idx];

                if (t !== null && t !== undefined) {
                    const wsKt = ws !== null ? Math.round((ws / 1.852) * 10) / 10 : 0;
                    profileLevels.push({
                        pres: p,
                        hght: z !== null ? Math.round(z) : null,
                        temp: Math.round(t * 10) / 10,
                        dwpt: td !== null ? Math.round(td * 10) / 10 : null,
                        relh: rh !== null ? Math.round(rh) : null,
                        mixr: td !== null ? Math.round(Thermo.satMixingRatio(p, td) * 100) / 100 : null,
                        drct: wd !== null ? Math.round(wd) : null,
                        sped: ws !== null ? ws / 3.6 : 0,
                        sped_kt: wsKt
                    });
                }
            });

            if (profileLevels.length < 4) return false;

            profileLevels.sort((a, b) => b.pres - a.pres);

            this.currentData = {
                station_id: station.id || station.icao || 'SBFL',
                station_name: station.name,
                timestamp: `${dateStr} ${hourStr}:00:00`,
                latitude: station.lat,
                longitude: station.lon,
                elevation: station.elev || profileLevels[0].hght || 5,
                levels: profileLevels,
                source: 'Modelo GFS / Reanálise'
            };

            this.recalculateAndRender();
            this.showStatus(`Sondagem carregada via GFS para ${station.name} (${profileLevels.length} níveis)`, 'success');
            return true;
        } catch (e) {
            console.warn('Falha no Open-Meteo:', e);
            return false;
        }
    }

    // Processamento de arquivo enviado pelo usuário
    handleFileUpload(file) {
        this.showStatus(`Lendo arquivo: ${file.name}...`, 'loading');
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const parsed = DataParser.parse(content, {
                station_id: file.name.split('.')[0],
                station_name: `Arquivo: ${file.name}`
            });

            if (parsed && parsed.levels.length >= 3) {
                this.currentData = parsed;
                this.currentStationId = parsed.station_id;
                this.recalculateAndRender();
                this.showStatus(`Arquivo carregado com sucesso (${parsed.levels.length} níveis)`, 'success');
            } else {
                this.showStatus('Formato de arquivo não reconhecido ou níveis insuficientes.', 'error');
            }
        };
        reader.onerror = () => {
            this.showStatus('Erro ao ler o arquivo selecionado.', 'error');
        };
        reader.readAsText(file);
    }

    // Recalcula parcelas, estabilidade, cisalhamento e atualiza toda a interface
    recalculateAndRender() {
        if (!this.currentData || !this.currentData.levels) return;

        const levels = this.currentData.levels;
        const stn = findStation(this.currentStationId);
        const lat = (stn && stn.lat !== undefined) ? stn.lat : (this.currentData.latitude || -27.67);

        // 1. Cálculo da Parcela e CAPE/CIN
        const parcelData = Thermo.calcParcelProfile(levels, this.currentParcelType);
        const capeCin = Thermo.calcCapeCin(parcelData);
        parcelData.cape = capeCin.cape;
        parcelData.cin = capeCin.cin;
        parcelData.lfc = capeCin.lfc;
        parcelData.el = capeCin.el;

        // 2. Índices de Estabilidade Termodinâmica
        const indices = Thermo.calcStabilityIndices(levels);
        parcelData.freezingLevel = indices.freezingLevel;
        parcelData.minus20Level = indices.minus20Level;

        // 3. Cinemática e Cisalhamento do Vento
        const kinematics = Thermo.calcKinematics(levels, lat);

        // 4. Índices Compostos (STP e EHI)
        const lclAgl = parcelData.zLcl - (parcelData.zSfc || 0);
        const composites = Thermo.calcCompositeIndices(
            parcelData.cape,
            lclAgl,
            kinematics ? kinematics.srh0_1 : 0,
            kinematics ? kinematics.shear0_6_ms : 0
        );

        // 5. Renderização dos gráficos Skew-T e Hodógrafo
        this.skewt.setData(this.currentData, parcelData);
        this.hodo.setData(this.currentData, kinematics);

        // 6. Atualização da Tabela de Parâmetros
        this.renderParametersTable(parcelData, indices, kinematics, composites);

        // 7. Atualização da Tabela de Níveis
        this.renderLevelsTable(levels);
    }

    // Exibição organizada dos parâmetros com cartões e indicadores de severidade
    renderParametersTable(parcel, indices, kinematics, composites) {
        const container = document.getElementById('parametersContainer');
        if (!container) return;

        const fmt = (val, unit = '', decimals = 1) => {
            if (val === null || val === undefined || isNaN(val)) return '<span class="text-muted">N/D</span>';
            const num = typeof val === 'number' ? val.toFixed(decimals) : val;
            return `<strong>${num}</strong> <span class="unit">${unit}</span>`;
        };

        const getCapeBadge = (val) => {
            if (!val || val <= 0) return '<span class="badge badge-stable">Estável</span>';
            if (val < 1000) return '<span class="badge badge-marginal">Fraca</span>';
            if (val < 2500) return '<span class="badge badge-moderate">Moderada</span>';
            return '<span class="badge badge-extreme">Severa / Extrema</span>';
        };

        const getCinBadge = (val) => {
            if (!val || Math.abs(val) <= 25) return '<span class="badge badge-favorable">Livre (|CIN| ≤ 25)</span>';
            if (Math.abs(val) <= 80) return '<span class="badge badge-moderate">Tampa Moderada</span>';
            return '<span class="badge badge-extreme">Tampa Forte (|CIN| > 80)</span>';
        };

        const getShearBadge = (kt) => {
            if (!kt || kt < 20) return '<span class="badge badge-stable">Fraco</span>';
            if (kt < 35) return '<span class="badge badge-moderate">Moderado</span>';
            return '<span class="badge badge-extreme">Forte / Supercelular</span>';
        };

        const wIndices = this.currentData.indices || {};

        container.innerHTML = `
            <div class="params-grid">
                <!-- CARD 1: INSTABILIDADE CONVECTIVA -->
                <div class="param-card">
                    <div class="param-card-header">
                        <span class="card-icon">⚡</span>
                        <h3>Instabilidade Convectiva</h3>
                    </div>
                    <div class="param-card-body">
                        <div class="param-row highlight-row">
                            <div class="param-name">CAPE (${this.currentParcelType.toUpperCase()})</div>
                            <div class="param-val">${fmt(parcel.cape, 'J/kg', 0)} ${getCapeBadge(parcel.cape)}</div>
                        </div>
                        <div class="param-row highlight-row" style="background: rgba(59, 130, 246, 0.1);">
                            <div class="param-name"><strong>CIN (Inibição Convectiva)</strong></div>
                            <div class="param-val">${fmt(parcel.cin, 'J/kg', 0)} ${getCinBadge(parcel.cin)}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Lifted Index (LI 500 hPa)</div>
                            <div class="param-val">${fmt(indices.liftedIndex, '°C')}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Showalter Index (SI)</div>
                            <div class="param-val">${fmt(indices.showalter, '°C')}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">K-Index (KI)</div>
                            <div class="param-val">${fmt(indices.kIndex, '°C')} ${indices.kIndex > 30 ? '<span class="badge badge-moderate">Tempestades</span>' : ''}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Total Totals (TT)</div>
                            <div class="param-val">${fmt(indices.totalTotals, '°C')} (VT: ${indices.verticalTotals || '-'} | CT: ${indices.crossTotals || '-'})</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">SWEAT Index</div>
                            <div class="param-val">${fmt(indices.sweat, '')} ${indices.sweat > 300 ? '<span class="badge badge-extreme">Severo</span>' : ''}</div>
                        </div>
                    </div>
                </div>

                <!-- CARD 2: NÍVEIS CRÍTICOS E CAMADAS -->
                <div class="param-card">
                    <div class="param-card-header">
                        <span class="card-icon">📏</span>
                        <h3>Níveis Críticos da Atmosfera</h3>
                    </div>
                    <div class="param-card-body">
                        <div class="param-row">
                            <div class="param-name">Superfície (P_sfc)</div>
                            <div class="param-val">${fmt(parcel.pSfc, 'hPa')} (${Math.round(parcel.zSfc || 0)} m)</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">LCL (Condensação Levantada)</div>
                            <div class="param-val">${fmt(parcel.pLcl, 'hPa')} (~${Math.round(parcel.zLcl || 0)} m)</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">LFC (Convecção Livre)</div>
                            <div class="param-val">${parcel.lfc ? fmt(parcel.lfc.pres, 'hPa') + ` (~${parcel.lfc.hght} m)` : '<span class="text-muted">Sem LFC</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">EL (Nível de Equilíbrio)</div>
                            <div class="param-val">${parcel.el ? fmt(parcel.el.pres, 'hPa') + ` (~${parcel.el.hght} m)` : '<span class="text-muted">Sem EL</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Nível de 0°C (Freezing Level)</div>
                            <div class="param-val">${indices.freezingLevel ? fmt(indices.freezingLevel.pres, 'hPa') + ` (${indices.freezingLevel.hght} m)` : '<span class="text-muted">N/D</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Nível de -20°C (Dendritos/Granizo)</div>
                            <div class="param-val">${indices.minus20Level ? fmt(indices.minus20Level.pres, 'hPa') + ` (${indices.minus20Level.hght} m)` : '<span class="text-muted">N/D</span>'}</div>
                        </div>
                    </div>
                </div>

                <!-- CARD 3: CISALHAMENTO E DINÂMICA (KINEMATIC) -->
                <div class="param-card">
                    <div class="param-card-header">
                        <span class="card-icon">🌪️</span>
                        <h3>Cisalhamento do Vento & Dinâmica</h3>
                    </div>
                    <div class="param-card-body">
                        <div class="param-row highlight-row">
                            <div class="param-name">Cisalhamento 0-6 km (Deep Layer)</div>
                            <div class="param-val">${kinematics && kinematics.shear0_6_kt ? fmt(kinematics.shear0_6_kt, 'kt', 0) + ` (${kinematics.shear0_6_ms} m/s)` : '<span class="text-muted">N/D</span>'} ${kinematics ? getShearBadge(kinematics.shear0_6_kt) : ''}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Cisalhamento 0-1 km (Low Level)</div>
                            <div class="param-val">${kinematics && kinematics.shear0_1_kt ? fmt(kinematics.shear0_1_kt, 'kt', 0) + ` (${kinematics.shear0_1_ms} m/s)` : '<span class="text-muted">N/D</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Cisalhamento 0-3 km</div>
                            <div class="param-val">${kinematics && kinematics.shear0_3_kt ? fmt(kinematics.shear0_3_kt, 'kt', 0) + ` (${kinematics.shear0_3_ms} m/s)` : '<span class="text-muted">N/D</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">SRH 0-1 km (Helicidade)</div>
                            <div class="param-val">${kinematics ? fmt(kinematics.srh0_1, 'm²/s²', 0) : '<span class="text-muted">N/D</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">SRH 0-3 km (Helicidade)</div>
                            <div class="param-val">${kinematics ? fmt(kinematics.srh0_3, 'm²/s²', 0) : '<span class="text-muted">N/D</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Bunkers Storm Motion (${kinematics && kinematics.isSouthHemisphere ? 'Hemisfério Sul' : 'Hemisfério Norte'})</div>
                            <div class="param-val">${kinematics && kinematics.bunkersLM ? `LM: ${kinematics.bunkersLM.dir}° / ${kinematics.bunkersLM.spdKt} kt` : '-'} | ${kinematics && kinematics.bunkersRM ? `RM: ${kinematics.bunkersRM.dir}° / ${kinematics.bunkersRM.spdKt} kt` : '-'}</div>
                        </div>
                    </div>
                </div>

                <!-- CARD 4: UMIDADE, PRECIPITAÇÃO E ÍNDICES COMPOSTOS -->
                <div class="param-card">
                    <div class="param-card-header">
                        <span class="card-icon">💧</span>
                        <h3>Umidade & Índices Compostos</h3>
                    </div>
                    <div class="param-card-body">
                        <div class="param-row highlight-row">
                            <div class="param-name">Água Precipitável (PWAT)</div>
                            <div class="param-val">${fmt(indices.pwat || (wIndices.PWAT ? wIndices.PWAT.value : null), 'mm')} ${indices.pwat > 40 ? '<span class="badge badge-extreme">Chuva Torrencial</span>' : ''}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Razão de Mistura Superfície (w)</div>
                            <div class="param-val">${fmt(parcel.tdSfc ? Thermo.satMixingRatio(parcel.pSfc, parcel.tdSfc) : null, 'g/kg')}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">Depressão do Ponto de Orvalho (T - Td)</div>
                            <div class="param-val">${fmt(parcel.tSfc - parcel.tdSfc, '°C')}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">STP (Significant Tornado Parameter)</div>
                            <div class="param-val">${fmt(composites.stp, '', 2)} ${composites.stp >= 1.0 ? '<span class="badge badge-extreme">Potencial Tornádico</span>' : '<span class="badge badge-stable">Baixo</span>'}</div>
                        </div>
                        <div class="param-row">
                            <div class="param-name">EHI (Energy-Helicity Index 0-1km)</div>
                            <div class="param-val">${fmt(composites.ehi, '', 2)} ${composites.ehi >= 1.0 ? '<span class="badge badge-extreme">Severo</span>' : '<span class="badge badge-stable">Baixo</span>'}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Tabela detalhada de níveis verticais (PRES, HGHT, TEMP, DWPT, RELH, MIXR, DRCT, SPED)
    renderLevelsTable(levels) {
        const tbody = document.getElementById('levelsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        levels.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${l.pres.toFixed(1)}</strong></td>
                <td>${l.hght !== null ? Math.round(l.hght) : '-'}</td>
                <td class="text-danger">${l.temp !== null ? l.temp.toFixed(1) : '-'}</td>
                <td class="text-success">${l.dwpt !== null ? l.dwpt.toFixed(1) : '-'}</td>
                <td>${l.relh !== null ? Math.round(l.relh) : '-'}</td>
                <td>${l.mixr !== null ? l.mixr.toFixed(2) : '-'}</td>
                <td>${l.drct !== null ? Math.round(l.drct) + '°' : '-'}</td>
                <td>${l.sped_kt !== null ? Math.round(l.sped_kt) : (l.sped ? Math.round(Thermo.ms2kt(l.sped)) : '-')}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Exibição de mensagens de status (carregando, sucesso, erro)
    showStatus(msg, type = 'info') {
        const bar = document.getElementById('statusBar');
        if (!bar) return;
        bar.textContent = msg;
        bar.className = `status-bar status-${type}`;
    }

    // Exportação da imagem do Skew-T em PNG
    exportSkewtImage() {
        if (!this.skewt) return;
        const dataUrl = this.skewt.exportToPng();
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `sondagem_${this.currentStationId}_${this.currentDate}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // Exportação dos dados dos níveis para arquivo CSV
    exportSoundingCsv() {
        if (!this.currentData || !this.currentData.levels) return;
        let csv = 'PRES_hPa,HGHT_m,TEMP_C,DWPT_C,RELH_pct,MIXR_gkg,DRCT_deg,SPED_kt\n';
        this.currentData.levels.forEach(l => {
            const spd = l.sped_kt !== null ? l.sped_kt : (l.sped ? Thermo.ms2kt(l.sped) : '');
            csv += `${l.pres},${l.hght || ''},${l.temp || ''},${l.dwpt || ''},${l.relh || ''},${l.mixr || ''},${l.drct || ''},${spd}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sondagem_${this.currentStationId}_${this.currentDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Inicializa a aplicação assim que o DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SoundingApp();
});
