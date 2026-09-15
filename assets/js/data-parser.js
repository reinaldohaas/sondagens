/**
 * data-parser.js - Parser Universal de Dados de Radiossondagens
 * Suporta:
 * 1. Respostas HTML da Universidade de Wyoming (weather.uwyo.edu/wsgi/sounding)
 * 2. Texto simples formato Wyoming / FSL / MetPy
 * 3. Arquivos CSV com colunas meteorológicas
 * 4. Arquivos JSON estruturados
 */

const DataParser = {
    // Parser principal com autodetecção de formato
    parse(content, metadata = {}) {
        if (!content) return null;

        // 1. JSON
        if (typeof content === 'object') {
            return this.validateAndNormalize(content);
        }
        if (typeof content === 'string') {
            const trimmed = content.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    return this.validateAndNormalize(parsed);
                } catch (e) {
                    console.warn('Falha no JSON.parse, tentando outros parsers...', e);
                }
            }

            // 2. HTML de Wyoming
            if (trimmed.includes('<PRE>') || trimmed.includes('<pre>') || trimmed.includes('<!DOCTYPE') || trimmed.includes('<HTML>')) {
                return this.parseWyomingHtml(trimmed, metadata);
            }

            // 3. Texto simples formato Wyoming
            if (trimmed.includes('PRES') && trimmed.includes('HGHT') && trimmed.includes('TEMP')) {
                return this.parseWyomingText(trimmed, metadata);
            }

            // 4. Formato CSV (vírgula ou ponto-e-vírgula)
            if (trimmed.includes(',') || trimmed.includes(';')) {
                return this.parseCsv(trimmed, metadata);
            }
        }

        return null;
    },

    // Parser de HTML da Universidade de Wyoming
    parseWyomingHtml(htmlText, meta = {}) {
        // Extração do bloco <PRE> com os níveis de sondagem
        const preMatch = htmlText.match(/<PRE>([\s\S]*?)<\/PRE>/i);
        if (!preMatch) {
            // Tenta encontrar sem a tag PRE ou como texto puro
            return this.parseWyomingText(htmlText, meta);
        }

        const preContent = preMatch[1];
        const sounding = this.parseWyomingText(preContent, meta);
        if (!sounding) return null;

        // Extração dos índices termodinâmicos da segunda tabela HTML
        const tableMatches = htmlText.match(/<TABLE[\s\S]*?<\/TABLE>/gi);
        if (tableMatches && tableMatches.length > 1) {
            const indexTable = tableMatches[1];
            const rowMatches = indexTable.match(/<TR[\s\S]*?<\/TR>/gi);
            if (rowMatches) {
                const indices = {};
                rowMatches.forEach(row => {
                    const cellMatches = row.match(/<TD[\s\S]*?<\/TD>/gi);
                    if (cellMatches && cellMatches.length >= 3) {
                        const cleanCells = cellMatches.map(c => c.replace(/<[^>]+>/g, '').trim());
                        const code = cleanCells[0];
                        const desc = cleanCells[1];
                        const valStr = cleanCells[2];
                        const unit = cleanCells.length > 3 ? cleanCells[3] : '';
                        const valNum = parseFloat(valStr);

                        indices[code] = {
                            description: desc,
                            value: isNaN(valNum) ? valStr : valNum,
                            unit: unit
                        };
                    }
                });
                sounding.indices = { ...sounding.indices, ...indices };

                // Atualiza coordenadas caso venham nos índices
                if (indices.SLAT && !isNaN(indices.SLAT.value)) sounding.latitude = indices.SLAT.value;
                if (indices.SLON && !isNaN(indices.SLON.value)) sounding.longitude = indices.SLON.value;
                if (indices.SELV && !isNaN(indices.SELV.value)) sounding.elevation = indices.SELV.value;
            }
        }

        return this.validateAndNormalize(sounding);
    },

    // Parser de texto simples formato Wyoming
    parseWyomingText(text, meta = {}) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let headerIdx = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('PRES') && lines[i].includes('HGHT') && lines[i].includes('TEMP')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return null;

        // Linhas de dados começam geralmente 2 linhas após o cabeçalho (após a linha tracejada)
        let dataStart = headerIdx + 1;
        if (dataStart < lines.length && (lines[dataStart].includes('---') || lines[dataStart].includes('hPa'))) {
            dataStart++;
        }
        if (dataStart < lines.length && lines[dataStart].includes('---')) {
            dataStart++;
        }

        const levels = [];
        for (let i = dataStart; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('---') || line.startsWith('<') || line.includes('Station')) break;

            const parts = line.split(/\s+/);
            if (parts.length >= 7) {
                const p = parseFloat(parts[0]);
                const z = parseFloat(parts[1]);
                const t = parseFloat(parts[2]);
                const td = parseFloat(parts[3]);
                const rh = parts.length > 4 ? parseFloat(parts[4]) : null;
                const mr = parts.length > 5 ? parseFloat(parts[5]) : null;
                const wd = parts.length > 6 ? parseFloat(parts[6]) : null;
                const ws = parts.length > 7 ? parseFloat(parts[7]) : null;

                if (!isNaN(p) && !isNaN(t)) {
                    levels.push({
                        pres: p,
                        hght: isNaN(z) ? null : z,
                        temp: t,
                        dwpt: isNaN(td) ? null : td,
                        relh: isNaN(rh) ? null : rh,
                        mixr: isNaN(mr) ? null : mr,
                        drct: isNaN(wd) ? null : wd,
                        sped: isNaN(ws) ? null : ws, // Em m/s no formato Wyoming
                        sped_kt: isNaN(ws) ? null : Math.round(ws * 1.94384 * 10) / 10
                    });
                }
            }
        }

        return this.validateAndNormalize({
            station_id: meta.station_id || 'LOCAL',
            station_name: meta.station_name || 'Sondagem',
            timestamp: meta.timestamp || new Date().toISOString(),
            latitude: meta.latitude || null,
            longitude: meta.longitude || null,
            elevation: meta.elevation || null,
            levels: levels,
            indices: {}
        });
    },

    // Parser para arquivos CSV
    parseCsv(csvText, meta = {}) {
        const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return null;

        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

        const getCol = (names) => {
            for (const n of names) {
                const idx = headers.indexOf(n);
                if (idx !== -1) return idx;
            }
            return -1;
        };

        const pIdx = getCol(['pres', 'pressure', 'pressao', 'p']);
        const tIdx = getCol(['temp', 'temperature', 'temperatura', 't']);
        const tdIdx = getCol(['dwpt', 'dewpoint', 'orvalho', 'td']);
        const zIdx = getCol(['hght', 'height', 'altitude', 'geo_alt', 'z']);
        const rhIdx = getCol(['relh', 'rh', 'humidity', 'umidade']);
        const wdIdx = getCol(['drct', 'wdir', 'dir', 'direcao']);
        const wsIdx = getCol(['sped', 'wspd', 'speed', 'vento', 'vel']);

        if (pIdx === -1 || tIdx === -1) return null;

        const levels = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(delimiter).map(p => p.trim());
            const p = parseFloat(parts[pIdx]);
            const t = parseFloat(parts[tIdx]);
            const td = tdIdx !== -1 ? parseFloat(parts[tdIdx]) : null;
            const z = zIdx !== -1 ? parseFloat(parts[zIdx]) : null;
            const rh = rhIdx !== -1 ? parseFloat(parts[rhIdx]) : null;
            const wd = wdIdx !== -1 ? parseFloat(parts[wdIdx]) : null;
            const ws = wsIdx !== -1 ? parseFloat(parts[wsIdx]) : null;

            if (!isNaN(p) && !isNaN(t)) {
                levels.push({
                    pres: p,
                    hght: isNaN(z) ? null : z,
                    temp: t,
                    dwpt: isNaN(td) ? null : td,
                    relh: isNaN(rh) ? null : rh,
                    mixr: null,
                    drct: isNaN(wd) ? null : wd,
                    sped: isNaN(ws) ? null : ws,
                    sped_kt: isNaN(ws) ? null : Math.round(ws * 1.94384 * 10) / 10
                });
            }
        }

        return this.validateAndNormalize({
            station_id: meta.station_id || 'CSV',
            station_name: meta.station_name || 'Arquivo CSV',
            timestamp: meta.timestamp || new Date().toISOString(),
            levels: levels,
            indices: {}
        });
    },

    // Validação e normalização dos dados meteorológicos
    validateAndNormalize(sounding) {
        if (!sounding || !sounding.levels || sounding.levels.length < 3) {
            return null;
        }

        // Ordena por pressão decrescente (da superfície para o topo)
        sounding.levels.sort((a, b) => b.pres - a.pres);

        // Preenche campos faltantes com fórmulas básicas se necessário
        sounding.levels.forEach((l, idx) => {
            // Se faltar a altitude, estima por fórmula barométrica padrão
            if (l.hght === null && idx > 0) {
                const prev = sounding.levels[idx - 1];
                if (prev.hght !== null) {
                    const avgT = 273.15 + 0.5 * (l.temp + prev.temp);
                    const dz = (287.058 * avgT / 9.80665) * Math.log(prev.pres / l.pres);
                    l.hght = Math.round(prev.hght + dz);
                }
            }
            if (l.hght === null && idx === 0) {
                l.hght = sounding.elevation || 0;
            }

            // Se faltar vento em nós
            if (l.sped_kt === null && l.sped !== null) {
                l.sped_kt = Math.round(l.sped * 1.94384 * 10) / 10;
            }

            // Se faltar a razão de mistura
            if (l.mixr === null && l.dwpt !== null) {
                l.mixr = Math.round(Thermo.satMixingRatio(l.pres, l.dwpt) * 100) / 100;
            }
        });

        sounding.levels_count = sounding.levels.length;
        return sounding;
    }
};
