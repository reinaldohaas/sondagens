/**
 * period-analyzer.js - Módulo de Análise de Radiossondagens por Período
 * Permite buscar séries temporais de perfis verticais para qualquer estação (ex: SBFL - Florianópolis),
 * calcular índices termodinâmicos (CAPE, CIN, LCL, PWAT, Cisalhamento) para cada dia do período
 * e filtrar dias específicos (ex: dias com CIN maior que determinado limiar).
 */

class PeriodAnalyzer {
    constructor() {
        this.results = [];
        this.filteredResults = [];
        this.chartCanvas = null;
        this.chartCtx = null;
        this.filterCriteria = {
            cinOp: 'abs_gt', // abs_gt, lt_neg, abs_lt, all
            cinVal: 50,
            capeOp: 'gte',
            capeVal: 0,
            pwatOp: 'gte',
            pwatVal: 0
        };
    }

    // Inicialização da interface e canvas do gráfico temporal
    init() {
        this.chartCanvas = document.getElementById('periodChartCanvas');
        if (this.chartCanvas) {
            this.chartCtx = this.chartCanvas.getContext('2d');
            this.setupChartEvents();
        }
    }

    setupChartEvents() {
        if (!this.chartCanvas) return;
        this.chartCanvas.addEventListener('click', (e) => {
            const rect = this.chartCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            this.handleChartClick(clickX);
        });

        window.addEventListener('resize', () => {
            this.renderChart();
        });
    }

    // -------------------------------------------------------------
    // DOWNLOAD E PROCESSAMENTO DO PERÍODO
    // -------------------------------------------------------------
    async fetchPeriod(station, startDate, endDate, synopticHours = ['12']) {
        if (!station || !station.lat || !station.lon) {
            throw new Error('Estação inválida ou sem coordenadas geográficas.');
        }

        // Níveis sinóticos e significativos da atmosfera (12 níveis padrão que cobrem da superfície a 100 hPa)
        const levels = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100];
        const vars = [];
        levels.forEach(p => {
            vars.push(`temperature_${p}hPa`);
            vars.push(`dew_point_${p}hPa`);
            vars.push(`geopotential_height_${p}hPa`);
            vars.push(`wind_speed_${p}hPa`);
            vars.push(`wind_direction_${p}hPa`);
        });

        // Determina se usa API de Arquivo Histórico, Historical Forecast ou Previsão
        const now = new Date();
        const yyyy = now.getUTCFullYear();
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(now.getUTCDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const startDt = new Date(`${startDate}T00:00:00Z`);
        const daysAgoStart = (now.getTime() - startDt.getTime()) / (1000 * 3600 * 24);
        const reqYear = parseInt(startDate.substring(0, 4), 10);

        let reqEndDate = endDate;
        if (endDate > todayStr && daysAgoStart > 85) {
            reqEndDate = todayStr;
        }

        // Lista inteligente de clusters candidatos ordenados por cota disponível e suporte temporal
        const candidates = [];

        // 1. Cluster de Previsão Histórica (historical-forecast-api):
        // Cluster rápido de reanálise, com cota dedicada independente e sem o bloqueio 429 de archive-api
        if (reqYear >= 2022) {
            candidates.push({
                baseUrl: 'https://historical-forecast-api.open-meteo.com/v1/forecast',
                model: 'gfs_seamless',
                name: 'Historical Forecast (GFS Seamless)'
            });
        } else {
            // Para anos anteriores a 2022 (ex: 2020), o modelo JMA possui 100% dos níveis verticais disponíveis
            candidates.push({
                baseUrl: 'https://historical-forecast-api.open-meteo.com/v1/forecast',
                model: 'jma_seamless',
                name: 'Historical Forecast (JMA Seamless)'
            });
            candidates.push({
                baseUrl: 'https://historical-forecast-api.open-meteo.com/v1/forecast',
                model: 'gfs_seamless',
                name: 'Historical Forecast (GFS Seamless)'
            });
        }

        // 2. Cluster de Arquivo Histórico (archive-api)
        candidates.push({
            baseUrl: 'https://archive-api.open-meteo.com/v1/archive',
            model: 'gfs_seamless',
            name: 'Archive API (GFS)'
        });
        candidates.push({
            baseUrl: 'https://archive-api.open-meteo.com/v1/archive',
            model: 'era5',
            name: 'Archive API (ERA5)'
        });

        // 3. Cluster Operacional (api.open-meteo.com) - para períodos recentes dentro de 90 dias
        if (daysAgoStart <= 90) {
            candidates.push({
                baseUrl: 'https://api.open-meteo.com/v1/forecast',
                model: 'gfs_seamless',
                name: 'Forecast API (GFS)'
            });
        }

        let data = null;
        let lastError = null;

        for (const cand of candidates) {
            try {
                const queryParams = new URLSearchParams({
                    latitude: station.lat.toFixed(4),
                    longitude: station.lon.toFixed(4),
                    start_date: startDate,
                    end_date: reqEndDate,
                    models: cand.model,
                    hourly: vars.join(',')
                });

                console.log(`[PeriodAnalyzer] Buscando período para ${station.name} (${startDate} a ${reqEndDate}) via ${cand.name}...`);
                const resp = await fetch(`${cand.baseUrl}?${queryParams.toString()}`);

                if (resp.ok) {
                    const json = await resp.json();
                    if (json && json.hourly && json.hourly.time && json.hourly.time.length > 0) {
                        // Verifica se vieram dados válidos de temperatura (não apenas array de nulls)
                        const testKey = `temperature_1000hPa_${cand.model}` in json.hourly 
                            ? `temperature_1000hPa_${cand.model}` 
                            : 'temperature_1000hPa';
                        const testVals = json.hourly[testKey] || json.hourly['temperature_850hPa'] || [];
                        const hasValidData = testVals.some(v => v !== null && v !== undefined);

                        if (hasValidData) {
                            data = json;
                            // Normaliza variáveis caso venham sufixadas pelo nome do modelo
                            if (cand.model) {
                                levels.forEach(p => {
                                    ['temperature', 'dew_point', 'geopotential_height', 'wind_speed', 'wind_direction'].forEach(param => {
                                        const modelKey = `${param}_${p}hPa_${cand.model}`;
                                        const stdKey = `${param}_${p}hPa`;
                                        if (data.hourly[modelKey] && (!data.hourly[stdKey] || data.hourly[stdKey].length === 0)) {
                                            data.hourly[stdKey] = data.hourly[modelKey];
                                        }
                                    });
                                });
                            }
                            console.log(`[PeriodAnalyzer] Sucesso via ${cand.name}! ${data.hourly.time.length} passos temporais obtidos.`);
                            break;
                        } else {
                            console.warn(`[PeriodAnalyzer] ${cand.name} retornou dados sem perfis verticais válidos para este ano. Tentando próximo...`);
                        }
                    }
                } else {
                    const errData = await resp.json().catch(() => ({}));
                    const reason = errData.reason || `HTTP ${resp.status}`;
                    console.warn(`[PeriodAnalyzer] ${cand.name} falhou: ${reason}. Tentando próximo candidato...`);
                    lastError = reason;
                }
            } catch (err) {
                console.warn(`[PeriodAnalyzer] Exceção ao consultar ${cand.name}:`, err);
                lastError = err.message;
            }
        }

        if (!data) {
            if (lastError && (lastError.includes('limit exceeded') || lastError.includes('429'))) {
                throw new Error('Limite de requisições por hora atingido no servidor externo. Aguarde alguns minutos ou selecione um intervalo de datas menor (ex: 15 a 30 dias).');
            }
            throw new Error(lastError || 'Não foi possível obter dados para o período solicitado em nenhum dos servidores.');
        }

        if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
            throw new Error('Nenhum dado retornado para o período solicitado.');
        }

        // Processa cada passo de tempo correspondente aos horários sinóticos desejados
        const times = data.hourly.time;
        const processed = [];

        for (let i = 0; i < times.length; i++) {
            const timeStr = times[i]; // formato: "2024-01-01T12:00"
            const hourPart = timeStr.substring(11, 13);

            if (!synopticHours.includes(hourPart)) {
                continue;
            }

            // Constrói o perfil vertical de radiossondagem para esta hora
            const profileLevels = [];
            levels.forEach(p => {
                const t = data.hourly[`temperature_${p}hPa`][i];
                const td = data.hourly[`dew_point_${p}hPa`] ? data.hourly[`dew_point_${p}hPa`][i] : null;
                const z = data.hourly[`geopotential_height_${p}hPa`] ? data.hourly[`geopotential_height_${p}hPa`][i] : null;
                const rhRaw = data.hourly[`relative_humidity_${p}hPa`] ? data.hourly[`relative_humidity_${p}hPa`][i] : null;
                const ws = data.hourly[`wind_speed_${p}hPa`] ? data.hourly[`wind_speed_${p}hPa`][i] : null; // km/h
                const wd = data.hourly[`wind_direction_${p}hPa`] ? data.hourly[`wind_direction_${p}hPa`][i] : null;

                if (t !== null && t !== undefined) {
                    const wsKt = (ws !== null && ws !== undefined) ? Math.round((ws / 1.852) * 10) / 10 : 0;
                    const wsMs = (ws !== null && ws !== undefined) ? ws / 3.6 : 0;
                    const calcRh = (rhRaw !== null && rhRaw !== undefined) 
                        ? rhRaw 
                        : (td !== null ? Math.round(Thermo.relativeHumidity(t, td)) : null);

                    profileLevels.push({
                        pres: p,
                        hght: (z !== null && z !== undefined) ? Math.round(z) : null,
                        temp: Math.round(t * 10) / 10,
                        dwpt: (td !== null && td !== undefined) ? Math.round(td * 10) / 10 : null,
                        relh: calcRh,
                        mixr: td !== null ? Math.round(Thermo.satMixingRatio(p, td) * 100) / 100 : null,
                        drct: (wd !== null && wd !== undefined) ? Math.round(wd) : null,
                        sped: wsMs,
                        sped_kt: wsKt
                    });
                }
            });

            if (profileLevels.length < 5) continue;

            // Ordena níveis decrescentes de pressão (superfície ao topo)
            profileLevels.sort((a, b) => b.pres - a.pres);

            // Objeto completo de sondagem
            const soundingObj = {
                station_id: station.id || station.icao || 'SBFL',
                station_name: station.name,
                timestamp: timeStr.replace('T', ' ') + ':00',
                date: timeStr.substring(0, 10),
                hour: hourPart,
                latitude: station.lat,
                longitude: station.lon,
                elevation: station.elev || profileLevels[0].hght || 0,
                levels: profileLevels,
                source: 'Modelo GFS / Reanálise'
            };

            // Calcula a termodinâmica completa
            const parcel = Thermo.calcParcelProfile(profileLevels, 'surface');
            const capeCin = Thermo.calcCapeCin(parcel);
            const indices = Thermo.calcStabilityIndices(profileLevels);
            const kinematics = Thermo.calcKinematics(profileLevels, station.lat);

            processed.push({
                datetime: timeStr,
                date: timeStr.substring(0, 10),
                hour: hourPart,
                sounding: soundingObj,
                parcel: parcel,
                cape: capeCin.cape,
                cin: capeCin.cin,
                cinAbs: Math.abs(capeCin.cin),
                lfc: capeCin.lfc,
                el: capeCin.el,
                lclPres: Math.round(parcel.pLcl),
                lclHght: Math.round(parcel.zLcl),
                pwat: indices.pwat,
                kIndex: indices.kIndex,
                totalTotals: indices.totalTotals,
                showalter: indices.showalter,
                liftedIndex: indices.liftedIndex,
                shear0_6_kt: kinematics ? kinematics.shear0_6_kt : null,
                srh0_1: kinematics ? kinematics.srh0_1 : null
            });
        }

        this.results = processed;
        this.applyFilter();
        return this.filteredResults;
    }

    // -------------------------------------------------------------
    // FILTROS DE PARÂMETROS (COM FOCO EM CIN E CAPE)
    // -------------------------------------------------------------
    setFilters(criteria) {
        this.filterCriteria = { ...this.filterCriteria, ...criteria };
        this.applyFilter();
    }

    applyFilter() {
        const c = this.filterCriteria;

        this.filteredResults = this.results.filter(item => {
            // Filtro de CIN
            if (c.cinOp === 'abs_gt') {
                // Módulo de CIN maior que X (ex: |CIN| > 50 J/kg)
                if (item.cinAbs < c.cinVal) return false;
            } else if (c.cinOp === 'lt_neg') {
                // CIN menor que -X (ex: CIN < -50 J/kg)
                if (item.cin > -Math.abs(c.cinVal)) return false;
            } else if (c.cinOp === 'abs_lt') {
                // Módulo de CIN menor que X (livre de inibição, convecção espontânea)
                if (item.cinAbs > c.cinVal) return false;
            }

            // Filtro de CAPE
            if (c.capeVal > 0) {
                if (item.cape < c.capeVal) return false;
            }

            // Filtro de PWAT
            if (c.pwatVal > 0) {
                if (!item.pwat || item.pwat < c.pwatVal) return false;
            }

            return true;
        });

        this.renderStats();
        this.renderTable();
        this.renderChart();
    }

    // -------------------------------------------------------------
    // RENDERIZAÇÃO DO PAINEL DE ESTATÍSTICAS
    // -------------------------------------------------------------
    renderStats() {
        const el = document.getElementById('periodStatsContainer');
        if (!el) return;

        const total = this.results.length;
        const matched = this.filteredResults.length;
        const pct = total > 0 ? Math.round((matched / total) * 100) : 0;

        // Cálculos de resumo
        let maxCape = 0;
        let maxCinAbs = 0;
        let sumCape = 0;
        let sumCin = 0;

        this.filteredResults.forEach(r => {
            if (r.cape > maxCape) maxCape = r.cape;
            if (r.cinAbs > maxCinAbs) maxCinAbs = r.cinAbs;
            sumCape += r.cape;
            sumCin += r.cin;
        });

        const avgCape = matched > 0 ? Math.round(sumCape / matched) : 0;
        const avgCin = matched > 0 ? Math.round(sumCin / matched) : 0;

        el.innerHTML = `
            <div class="period-stats-grid">
                <div class="stat-box highlight-box">
                    <div class="stat-label">Dias Filtrados com Critério</div>
                    <div class="stat-value">${matched} <span class="stat-sub">de ${total} analisados (${pct}%)</span></div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Maior Inibição (|CIN| Máx)</div>
                    <div class="stat-value" style="color: #60a5fa;">${maxCinAbs} <span class="stat-unit">J/kg</span></div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">CIN Médio dos Dias</div>
                    <div class="stat-value">${avgCin} <span class="stat-unit">J/kg</span></div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">CAPE Máximo no Período</div>
                    <div class="stat-value" style="color: #f87171;">${maxCape} <span class="stat-unit">J/kg</span></div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">CAPE Médio</div>
                    <div class="stat-value">${avgCape} <span class="stat-unit">J/kg</span></div>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------
    // RENDERIZAÇÃO DA TABELA DO PERÍODO
    // -------------------------------------------------------------
    renderTable() {
        const tbody = document.getElementById('periodTableBody');
        if (!tbody) return;

        if (this.filteredResults.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhum dia atendeu aos filtros selecionados.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        this.filteredResults.forEach((r, idx) => {
            const tr = document.createElement('tr');
            
            // Destaca severidade de CIN
            let cinClass = 'badge-favorable';
            if (r.cinAbs >= 100) cinClass = 'badge-extreme';
            else if (r.cinAbs >= 40) cinClass = 'badge-moderate';

            // Destaca CAPE
            let capeClass = 'text-muted';
            if (r.cape >= 2500) capeClass = 'text-danger font-bold';
            else if (r.cape >= 1000) capeClass = 'text-warning font-bold';
            else if (r.cape > 0) capeClass = 'text-success';

            tr.innerHTML = `
                <td><strong>${r.date}</strong></td>
                <td><span class="badge" style="background:#1e293b;">${r.hour}Z</span></td>
                <td class="${capeClass}"><strong>${r.cape}</strong> J/kg</td>
                <td><span class="badge ${cinClass}">${r.cin} J/kg</span></td>
                <td>${r.lclPres} hPa (${r.lclHght}m)</td>
                <td>${r.lfc ? r.lfc.pres + ' hPa' : '-'}</td>
                <td><strong>${r.pwat !== null ? r.pwat.toFixed(1) : '-'}</strong> mm</td>
                <td>${r.shear0_6_kt !== null ? r.shear0_6_kt + ' kt' : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary btn-load-day" data-idx="${idx}">
                        📈 Ver Skew-T
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Adiciona listeners aos botões para carregar no Skew-T principal
        tbody.querySelectorAll('.btn-load-day').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                this.loadToMainApp(this.filteredResults[idx]);
            });
        });
    }

    // Carrega a sondagem deste dia diretamente no Skew-T e no Hodógrafo principal
    loadToMainApp(item) {
        if (!item || !window.app) return;
        window.app.currentData = item.sounding;
        window.app.currentStationId = item.sounding.station_id;
        window.app.recalculateAndRender();

        // Alterna para a aba de diagramas
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        const tabBtn = document.querySelector('.tab-button[data-tab="tabDiagrams"]');
        const tabContent = document.getElementById('tabDiagrams');
        if (tabBtn) tabBtn.classList.add('active');
        if (tabContent) tabContent.classList.add('active');

        window.app.showStatus(`Sondagem carregada da série temporal: ${item.date} ${item.hour}Z (CAPE: ${item.cape} J/kg, CIN: ${item.cin} J/kg)`, 'success');
        window.scrollTo({ top: 120, behavior: 'smooth' });
    }

    // -------------------------------------------------------------
    // GRÁFICO INTERATIVO DE SÉRIE TEMPORAL (CAPE & CIN AO LONGO DO PERÍODO)
    // -------------------------------------------------------------
    renderChart() {
        if (!this.chartCanvas || !this.chartCtx) return;
        const ctx = this.chartCtx;
        const rect = this.chartCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        const w = rect.width || 800;
        const h = 260;
        this.chartCanvas.width = w * dpr;
        this.chartCanvas.height = h * dpr;
        ctx.resetTransform();
        ctx.scale(dpr, dpr);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        const data = this.results;
        if (data.length === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Nenhum dado baixado. Selecione um período e clique em "Baixar Período".', w / 2, h / 2);
            return;
        }

        const padLeft = 55;
        const padRight = 55;
        const padTop = 30;
        const padBottom = 40;
        const plotW = w - padLeft - padRight;
        const plotH = h - padTop - padBottom;

        // Escala vertical: CAPE máximo no topo, CIN máximo na base
        let maxCape = 1000;
        let maxCinAbs = 100;
        data.forEach(d => {
            if (d.cape > maxCape) maxCape = d.cape;
            if (d.cinAbs > maxCinAbs) maxCinAbs = d.cinAbs;
        });
        maxCape = Math.ceil(maxCape / 500) * 500;
        maxCinAbs = Math.ceil(maxCinAbs / 50) * 50;

        // Grid horizontal e eixos duplos
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';

        // Linhas de CAPE (Eixo Esquerdo, Vermelho)
        for (let cVal = 0; cVal <= maxCape; cVal += maxCape / 4) {
            const y = padTop + plotH * (1.0 - cVal / maxCape);
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(padLeft + plotW, y);
            ctx.stroke();

            ctx.textAlign = 'right';
            ctx.fillStyle = '#f87171';
            ctx.fillText(`${Math.round(cVal)}`, padLeft - 6, y + 3);
        }

        // Rótulo Eixo Esquerdo (CAPE)
        ctx.save();
        ctx.translate(12, padTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText('CAPE (J/kg)', 0, 0);
        ctx.restore();

        // Rótulo Eixo Direito (CIN)
        ctx.save();
        ctx.translate(w - 12, padTop + plotH / 2);
        ctx.rotate(Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#60a5fa';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText('|CIN| (J/kg)', 0, 0);
        ctx.restore();

        // Valores de CIN na direita
        for (let cinVal = 0; cinVal <= maxCinAbs; cinVal += maxCinAbs / 4) {
            const y = padTop + plotH * (1.0 - cinVal / maxCinAbs);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#60a5fa';
            ctx.fillText(`${Math.round(cinVal)}`, padLeft + plotW + 6, y + 3);
        }

        // Linha do Limiar de CIN do Filtro
        if (this.filterCriteria.cinVal > 0) {
            const yThresh = padTop + plotH * (1.0 - Math.min(this.filterCriteria.cinVal, maxCinAbs) / maxCinAbs);
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(padLeft, yThresh);
            ctx.lineTo(padLeft + plotW, yThresh);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#eab308';
            ctx.textAlign = 'right';
            ctx.fillText(`Filtro: ${this.filterCriteria.cinVal} J/kg`, padLeft + plotW - 10, yThresh - 4);
        }

        // Plota as Barras de CAPE
        const barWidth = Math.max(3, (plotW / data.length) * 0.45);
        const stepX = plotW / data.length;

        data.forEach((d, i) => {
            const cx = padLeft + (i + 0.5) * stepX;
            const barH = (d.cape / maxCape) * plotH;
            const yTop = padTop + plotH - barH;

            // Barra de CAPE
            ctx.fillStyle = d.cape >= 1500 ? 'rgba(239, 68, 68, 0.75)' : 'rgba(245, 158, 11, 0.65)';
            ctx.fillRect(cx - barWidth - 1, yTop, barWidth, barH);

            // Barra de |CIN| (Azul)
            const cinBarH = (Math.min(d.cinAbs, maxCinAbs) / maxCinAbs) * plotH;
            const cinYTop = padTop + plotH - cinBarH;
            ctx.fillStyle = d.cinAbs >= this.filterCriteria.cinVal ? 'rgba(59, 130, 246, 0.85)' : 'rgba(148, 163, 184, 0.4)';
            ctx.fillRect(cx + 1, cinYTop, barWidth, cinBarH);

            // Rótulos de data no eixo X (a cada X passos)
            const labelInterval = Math.ceil(data.length / 10);
            if (i % labelInterval === 0 || i === data.length - 1) {
                ctx.fillStyle = '#94a3b8';
                ctx.textAlign = 'center';
                ctx.font = '9px Inter, sans-serif';
                ctx.fillText(d.date.substring(5), cx, padTop + plotH + 14);
                ctx.fillText(`${d.hour}Z`, cx, padTop + plotH + 26);
            }
        });

        // Legenda do Gráfico
        ctx.textAlign = 'left';
        ctx.font = '10px Inter, sans-serif';
        
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(padLeft + 10, 10, 12, 10);
        ctx.fillStyle = '#f87171';
        ctx.fillText('CAPE (J/kg)', padLeft + 28, 18);

        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(padLeft + 120, 10, 12, 10);
        ctx.fillStyle = '#60a5fa';
        ctx.fillText('|CIN| Inibição (J/kg)', padLeft + 138, 18);

        ctx.strokeStyle = '#eab308';
        ctx.beginPath();
        ctx.moveTo(padLeft + 270, 15);
        ctx.lineTo(padLeft + 295, 15);
        ctx.stroke();
        ctx.fillStyle = '#eab308';
        ctx.fillText('Linha do Filtro', padLeft + 302, 18);
    }

    handleChartClick(clickX) {
        const rect = this.chartCanvas.getBoundingClientRect();
        const padLeft = 55;
        const padRight = 55;
        const plotW = rect.width - padLeft - padRight;
        
        if (clickX < padLeft || clickX > padLeft + plotW || this.results.length === 0) return;
        
        const relX = clickX - padLeft;
        const stepX = plotW / this.results.length;
        const idx = Math.floor(relX / stepX);
        
        if (idx >= 0 && idx < this.results.length) {
            this.loadToMainApp(this.results[idx]);
        }
    }

    // Exportação dos resultados do período para CSV
    exportCsv() {
        if (this.results.length === 0) return;
        let csv = 'DATA,HORA_UTC,CAPE_Jkg,CIN_Jkg,LCL_hPa,LCL_m,LFC_hPa,PWAT_mm,SHEAR_0_6km_kt,PASSOU_FILTRO\n';
        
        this.results.forEach(r => {
            const passed = this.filteredResults.includes(r) ? 'SIM' : 'NAO';
            csv += `${r.date},${r.hour},${r.cape},${r.cin},${r.lclPres},${r.lclHght},${r.lfc ? r.lfc.pres : ''},${r.pwat || ''},${r.shear0_6_kt || ''},${passed}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analise_periodo_${this.results[0].sounding.station_id}_${this.results[0].date}_a_${this.results[this.results.length - 1].date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Instância global
window.periodAnalyzer = new PeriodAnalyzer();
