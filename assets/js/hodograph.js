/**
 * hodograph.js - Renderizador Interativo do Hodógrafo
 * Diagrama polar de cisalhamento do vento nas camadas atmosféricas (0-1km, 1-3km, 3-6km, >6km)
 * com vetores de movimento de tempestade de Bunkers (RM e LM) e cálculo visual de helicidade (SRH).
 */

class HodographChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('Canvas element not found:', canvasId);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.maxSpeedKt = 80; // Escala máxima em nós
        this.data = null;
        this.kinematics = null;

        this.setupEvents();
    }

    setupEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.render();
        });
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || 360;
        this.height = rect.height || 360;

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.resetTransform();
        this.ctx.scale(dpr, dpr);

        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.radius = Math.min(this.width, this.height) / 2 - 25;
    }

    setData(soundingData, kinematics = null) {
        this.data = soundingData;
        this.kinematics = kinematics;
        this.resize();
        this.render();
    }

    // Conversão de componentes u, v (nós) para coordenadas de tela x, y
    coordsFromUV(uKt, vKt) {
        const scale = this.radius / this.maxSpeedKt;
        // u positivo para a direita (Leste)
        // v positivo para cima (Norte), logo Y decresce na tela
        const x = this.centerX + uKt * scale;
        const y = this.centerY - vKt * scale;
        return { x, y };
    }

    render() {
        if (!this.ctx) return;
        const ctx = this.ctx;

        // Fundo
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, this.width, this.height);

        // Anéis concêntricos de velocidade do vento (10, 20, 30, 40, 50, 60, 70, 80 kt)
        const speeds = [20, 40, 60, 80];
        ctx.lineWidth = 1;
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        speeds.forEach(spd => {
            const r = (spd / this.maxSpeedKt) * this.radius;
            ctx.strokeStyle = (spd === 40 || spd === 60) ? '#334155' : '#1e293b';
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, r, 0, 2 * Math.PI);
            ctx.stroke();

            // Rótulo da velocidade no eixo Leste
            ctx.fillStyle = '#64748b';
            ctx.fillText(`${spd}`, this.centerX + r, this.centerY - 7);
        });

        // Eixos ortogonais principais e diagonais
        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        // Eixo X (Oeste - Leste)
        ctx.moveTo(this.centerX - this.radius, this.centerY);
        ctx.lineTo(this.centerX + this.radius, this.centerY);
        // Eixo Y (Sul - Norte)
        ctx.moveTo(this.centerX, this.centerY - this.radius);
        ctx.lineTo(this.centerX, this.centerY + this.radius);
        ctx.stroke();

        // Rótulos cardeais
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillText('N', this.centerX, this.centerY - this.radius - 12);
        ctx.fillText('S', this.centerX, this.centerY + this.radius + 12);
        ctx.fillText('L', this.centerX + this.radius + 12, this.centerY);
        ctx.fillText('O', this.centerX - this.radius - 12, this.centerY);

        if (!this.data || !this.data.levels || this.data.levels.length < 2) {
            ctx.fillStyle = '#64748b';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.fillText('Aguardando dados...', this.centerX, this.centerY);
            return;
        }

        // Prepara pontos de vento por altitude AGL
        const sfc = this.data.levels[0];
        const zSfc = sfc.hght || 0;

        const pts = [];
        this.data.levels.forEach(l => {
            if (l.hght === null || l.drct === null || l.sped === null) return;
            const agl = l.hght - zSfc;
            if (agl < 0 || agl > 14000) return;

            const spdKt = l.sped_kt || Thermo.ms2kt(l.sped);
            // Componentes u (Leste) e v (Norte)
            const rad = l.drct * Math.PI / 180;
            const uKt = -spdKt * Math.sin(rad);
            const vKt = -spdKt * Math.cos(rad);

            pts.push({
                agl,
                spdKt,
                drct: l.drct,
                uKt,
                vKt,
                coords: this.coordsFromUV(uKt, vKt)
            });
        });

        pts.sort((a, b) => a.agl - b.agl);

        if (pts.length < 2) return;

        // Desenha os segmentos do hodógrafo com cores padrão SPC
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const avgAgl = 0.5 * (p1.agl + p2.agl);

            if (avgAgl <= 1000) {
                ctx.strokeStyle = '#ec4899'; // 0-1 km: Rosa choque
            } else if (avgAgl <= 3000) {
                ctx.strokeStyle = '#ef4444'; // 1-3 km: Vermelho
            } else if (avgAgl <= 6000) {
                ctx.strokeStyle = '#10b981'; // 3-6 km: Verde esmeralda
            } else if (avgAgl <= 9000) {
                ctx.strokeStyle = '#f59e0b'; // 6-9 km: Âmbar
            } else {
                ctx.strokeStyle = '#06b6d4'; // >9 km: Ciano
            }

            ctx.beginPath();
            ctx.moveTo(p1.coords.x, p1.coords.y);
            ctx.lineTo(p2.coords.x, p2.coords.y);
            ctx.stroke();
        }

        // Marcadores nos níveis-chave (1, 3, 6, 9 km)
        const keyHeights = [1000, 3000, 6000, 9000];
        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';

        keyHeights.forEach(targetAgl => {
            // Encontra ponto mais próximo
            let best = null;
            let minDiff = 9999;
            pts.forEach(p => {
                const diff = Math.abs(p.agl - targetAgl);
                if (diff < minDiff) {
                    minDiff = diff;
                    best = p;
                }
            });

            if (best && minDiff < 400) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(best.coords.x, best.coords.y, 3.5, 0, 2 * Math.PI);
                ctx.fill();

                ctx.fillStyle = '#e2e8f0';
                ctx.fillText(`${targetAgl / 1000}km`, best.coords.x + 5, best.coords.y - 4);
            }
        });

        // Ponto de Superfície
        if (pts.length > 0) {
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(pts[0].coords.x, pts[0].coords.y, 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillText('SFC', pts[0].coords.x + 5, pts[0].coords.y + 4);
        }

        // Vetores de Bunkers (Storm Motion)
        if (this.kinematics) {
            const k = this.kinematics;

            // Vento Médio (MW)
            if (k.meanWind) {
                const rad = k.meanWind.dir * Math.PI / 180;
                const u = -k.meanWind.spdKt * Math.sin(rad);
                const v = -k.meanWind.spdKt * Math.cos(rad);
                const pos = this.coordsFromUV(u, v);

                ctx.fillStyle = '#94a3b8';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 4, 0, 2 * Math.PI);
                ctx.fill();
                ctx.font = 'bold 9px Inter, system-ui, sans-serif';
                ctx.fillText('MW', pos.x + 5, pos.y);
            }

            // Right-Mover (RM)
            if (k.bunkersRM) {
                const rad = k.bunkersRM.dir * Math.PI / 180;
                const u = -k.bunkersRM.spdKt * Math.sin(rad);
                const v = -k.bunkersRM.spdKt * Math.cos(rad);
                const pos = this.coordsFromUV(u, v);

                ctx.fillStyle = '#3b82f6'; // Azul
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillText('RM', pos.x + 6, pos.y);
            }

            // Left-Mover (LM - Ciclônico no Sul do Brasil / Hemisfério Sul!)
            if (k.bunkersLM) {
                const rad = k.bunkersLM.dir * Math.PI / 180;
                const u = -k.bunkersLM.spdKt * Math.sin(rad);
                const v = -k.bunkersLM.spdKt * Math.cos(rad);
                const pos = this.coordsFromUV(u, v);

                ctx.fillStyle = '#ef4444'; // Vermelho
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillText(k.isSouthHemisphere ? 'LM (Ciclônico)' : 'LM', pos.x + 6, pos.y);
            }
        }

        // Legenda de Altitudes do Hodógrafo
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        const legY = this.height - 18;
        
        ctx.fillStyle = '#ec4899'; ctx.fillRect(10, legY, 10, 8);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText('0-1km', 24, legY + 7);

        ctx.fillStyle = '#ef4444'; ctx.fillRect(65, legY, 10, 8);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText('1-3km', 79, legY + 7);

        ctx.fillStyle = '#10b981'; ctx.fillRect(120, legY, 10, 8);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText('3-6km', 134, legY + 7);

        ctx.fillStyle = '#f59e0b'; ctx.fillRect(175, legY, 10, 8);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText('6-9km', 189, legY + 7);

        ctx.fillStyle = '#06b6d4'; ctx.fillRect(230, legY, 10, 8);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText('>9km', 244, legY + 7);
    }
}
