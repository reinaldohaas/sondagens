/**
 * app.js - Orquestrador Principal da Aplicação de Radiossondagens
 * Gerencia a interface, seleção de estações (foco Sul do Brasil), busca de dados,
 * cálculo e exibição de parâmetros organizados por categoria.
 */

class SoundingApp {
    constructor() {
        this.skewt = null;
        this.hodo = null;
        this.currentData = null;
        this.currentParcelType = 'surface';
        
        // Estação inicial padrão: Porto Alegre (RS) - SBPA / 83971
        this.currentStationId = '83971';
        this.currentDate = '2024-05-01';
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

        this.populateStationSelect();
        this.setupEventListeners();

        // Carrega a sondagem inicial de Porto Alegre
        this.loadSample('83971_20240501_12');
    }

    // Preenche o seletor dropdown com as estações categorizadas
    populateStationSelect() {
        const select = document.getElementById('stationSelect');
        if (!select) return;
        select.innerHTML = '';

        const groups = [
            { key: 'south_brazil', label: '📍 Sul do Brasil (Foco Principal)' },
            { key: 'cone_sur', label: '🌎 Bacia do Prata & Cone Sul (Vizinhos)' },
            { key: 'brazil', label: '🇧🇷 Brasil (Demais Regiões)' },
            { key: 'world', label: '🌐 Mundo (Referências e Benchmarks)' }
        ];

        groups.forEach(g => {
            const optGroup = document.createElement('optgroup');
            optGroup.label = g.label;
            const list = STATIONS_CATALOG[g.key] || [];
            list.forEach(stn => {
                const opt = document.createElement('option');
                opt.value = stn.id;
                opt.textContent = `${stn.id} - ${stn.name} (${stn.state ? stn.state + ', ' : ''}${stn.country})`;
                if (stn.id === this.currentStationId) opt.selected = true;
                optGroup.appendChild(opt);
            });
            select.appendChild(optGroup);
        });
    }

    // Configura listeners de eventos da UI
    setupEventListeners() {
        // Mudança no select de estação
        document.getElementById('stationSelect')?.addEventListener('change', (e) => {
            this.currentStationId = e.target.value;
            this.updateStationInfo();
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

        // Alternância de Abas (Diagramas vs Tabela de Níveis)
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-tab');
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(target)?.classList.add('active');
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

    // Seleção rápida de estação do Sul do Brasil
    selectQuickStation(stnId) {
        this.currentStationId = stnId;
        const sel = document.getElementById('stationSelect');
        if (sel) sel.value = stnId;
        
        // Destaque visual no botão clicado
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

    // Busca de sondagem remota (com fallback para backend Python e proxies CORS)
    async fetchSounding() {
        const dateInput = document.getElementById('inputDate');
        const hourInput = document.getElementById('inputHour');
        const stnId = this.currentStationId;

        const dateStr = dateInput ? dateInput.value : this.currentDate;
        const hourStr = hourInput ? hourInput.value : this.currentHour;
        const dtFormatted = `${dateStr} ${hourStr}:00:00`;

        this.showStatus(`Buscando sondagem ${stnId} para ${dtFormatted}...`, 'loading');

        // 1. Tenta via backend Python local (/api/sounding) se estiver ativo
        try {
            const localApiUrl = `/api/sounding?id=${encodeURIComponent(stnId)}&datetime=${encodeURIComponent(dtFormatted)}`;
            const localResp = await fetch(localApiUrl, { signal: AbortSignal.timeout(6000) });
            if (localResp.ok) {
                const text = await localResp.text();
                const parsed = DataParser.parse(text, { station_id: stnId, timestamp: dtFormatted });
                if (parsed && parsed.levels.length > 3) {
                    this.currentData = parsed;
                    this.recalculateAndRender();
                    this.showStatus(`Sondagem carregada via Backend Python (${parsed.levels.length} níveis)`, 'success');
                    return;
                }
            }
        } catch (e) {
            // Backend local não disponível, tenta proxies de internet
        }

        // 2. Tenta via Wyoming direto e proxies públicos
        const wyomingUrl = `http://weather.uwyo.edu/wsgi/sounding?datetime=${encodeURIComponent(dtFormatted)}&id=${encodeURIComponent(stnId)}&type=TEXT%3ALIST`;
        const proxyUrls = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(wyomingUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(wyomingUrl)}`
        ];

        for (const url of proxyUrls) {
            try {
                const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
                if (resp.ok) {
                    const text = await resp.read ? await resp.text() : await resp.text();
                    if (text.includes('PRES') && text.includes('HGHT')) {
                        const parsed = DataParser.parse(text, { station_id: stnId, timestamp: dtFormatted });
                        if (parsed && parsed.levels.length > 3) {
                            this.currentData = parsed;
                            this.recalculateAndRender();
                            this.showStatus(`Sondagem carregada via Wyoming (${parsed.levels.length} níveis)`, 'success');
                            return;
                        }
                    }
                }
            } catch (err) {
                console.warn('Proxy falhou:', url, err);
            }
        }

        // 3. Se falhar, verifica se temos uma amostra local compatível
        const sampleKey = `${stnId}_${dateStr.replace(/-/g, '')}_${hourStr}`;
        if (this.sampleFiles[sampleKey]) {
            this.showStatus('Sondagem remota offline. Carregando dados da amostra local salva...', 'warning');
            this.loadSample(sampleKey);
            return;
        }

        // Se for Porto Alegre, carrega o caso histórico como fallback
        if (stnId === '83971') {
            this.showStatus('Servidor remoto sem resposta. Carregando caso de referência de Porto Alegre...', 'warning');
            this.loadSample('83971_20240501_12');
            return;
        }

        this.showStatus(`Não foi possível obter dados para ${stnId} em ${dtFormatted}. Verifique a data (00Z/12Z) ou carregue uma amostra.`, 'error');
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
        const lat = (stn && stn.lat !== undefined) ? stn.lat : (this.currentData.latitude || -30.0);

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

        // Helpers de formatação e badges de severidade
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
            if (!val || val > -25) return '<span class="badge badge-favorable">Livre</span>';
            if (val > -100) return '<span class="badge badge-moderate">Moderada</span>';
            return '<span class="badge badge-cap">Tampa Forte (Cap)</span>';
        };

        const getShearBadge = (kt) => {
            if (!kt || kt < 20) return '<span class="badge badge-stable">Fraco</span>';
            if (kt < 35) return '<span class="badge badge-moderate">Moderado</span>';
            return '<span class="badge badge-extreme">Forte / Supercelular</span>';
        };

        // Dados reportados pelo Wyoming se existirem
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
                        <div class="param-row">
                            <div class="param-name">CIN (Inibição Convectiva)</div>
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
