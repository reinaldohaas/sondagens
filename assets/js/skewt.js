/**
 * skewt.js - Renderizador Interativo do Diagrama Termodinâmico Skew-T ln-P
 * Renderização em HTML5 Canvas de alta definição (HiDPI) com linhas termodinâmicas,
 * perfis de T, Td, trajetória da parcela, sombreamento de CAPE/CIN e barbelas de vento.
 */

class SkewTChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!canvasId || !this.canvas) {
            console.error('Canvas element not found:', canvasId);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        // Limites de pressão e temperatura do diagrama padrão
        this.pMin = 100.0;   // Topo (hPa)
        this.pMax = 1050.0;  // Base (hPa)
        this.tMin = -45.0;   // °C
        this.tMax = 45.0;    // °C
        
        // Inclinação Skew (45 graus padrão)
        this.skewFactor = Math.tan(45.0 * Math.PI / 180.0);

        // Margens do diagrama (pixels)
        this.margins = {
            top: 30,
            right: 75, // Espaço para as barbelas de vento
            bottom: 45,
            left: 55   // Rótulos de pressão
        };

        // Opções de visualização de camadas
        this.layers = {
            isobars: true,
            isotherms: true,
            dryAdiabats: true,
            moistAdiabats: true,
            mixingRatio: true,
            tempProfile: true,
            dewpointProfile: true,
            parcelTrajectory: true,
            capeShading: true,
            windBarbs: true,
            criticalLevels: true
        };

        this.data = null;
        this.parcelData = null;
        this.hoverPoint = null;

        // Inicialização de eventos de mouse/touch
        this.setupEvents();
    }

    // Configura eventos de mouse e resize
    setupEvents() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
            this.handleHover(mouseX, mouseY);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverPoint = null;
            this.render();
        });

        window.addEventListener('resize', () => {
            this.resize();
            this.render();
        });
    }

    // Ajuste de resolução HiDPI / Retina
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || 800;
        this.height = rect.height || 700;

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.resetTransform();
        this.ctx.scale(dpr, dpr);

        this.plotWidth = this.width - this.margins.left - this.margins.right;
        this.plotHeight = this.height - this.margins.top - this.margins.bottom;
    }

    // -------------------------------------------------------------
    // TRANSFORMAÇÕES DE COORDENADAS (SKEW-T ln-P)
    // -------------------------------------------------------------
    yFromPres(p) {
        if (p < this.pMin) p = this.pMin;
        if (p > this.pMax) p = this.pMax;
        const logP = Math.log(p);
        const logMax = Math.log(this.pMax);
        const logMin = Math.log(this.pMin);
        // pMax fica na base (plotHeight), pMin no topo (0)
        return this.margins.top + this.plotHeight * ((logP - logMin) / (logMax - logMin));
    }

    presFromY(y) {
        const relY = y - this.margins.top;
        const normY = relY / this.plotHeight;
        const logMax = Math.log(this.pMax);
        const logMin = Math.log(this.pMin);
        return Math.exp(logMin + normY * (logMax - logMin));
    }

    xFromTempPres(tC, p) {
        const y = this.yFromPres(p);
        const deltaY = (this.margins.top + this.plotHeight) - y;
        const xAtBase = this.margins.left + this.plotWidth * ((tC - this.tMin) / (this.tMax - this.tMin));
        // Efeito Skew: inclina para a direita conforme sobe (deltaY aumenta)
        return xAtBase + deltaY * this.skewFactor;
    }

    tempFromXY(x, y) {
        const p = this.presFromY(y);
        const deltaY = (this.margins.top + this.plotHeight) - y;
        const xAtBase = x - deltaY * this.skewFactor;
        return this.tMin + ((xAtBase - this.margins.left) / this.plotWidth) * (this.tMax - this.tMin);
    }

    // -------------------------------------------------------------
    // ATUALIZAR DADOS E RENDERIZAR
    // -------------------------------------------------------------
    setData(soundingData, parcelData = null) {
        this.data = soundingData;
        this.parcelData = parcelData;
        this.resize();
        this.render();
    }

    render() {
        if (!this.ctx) return;
        const ctx = this.ctx;

        // Fundo do gráfico (tema escuro meteorológico moderno)
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.fillRect(0, 0, this.width, this.height);

        // Área útil do plot
        ctx.save();
        ctx.beginPath();
        ctx.rect(this.margins.left, this.margins.top, this.plotWidth, this.plotHeight);
        ctx.clip();

        // 1. Linhas Isóbaras (horizontais)
        if (this.layers.isobars) this.drawIsobars(ctx);

        // 2. Linhas Isotérmicas (inclinadas a 45°)
        if (this.layers.isotherms) this.drawIsotherms(ctx);

        // 3. Linhas Adiabáticas Secas (curvas Theta)
        if (this.layers.dryAdiabats) this.drawDryAdiabats(ctx);

        // 4. Linhas Razão de Mistura Saturada (Isohumes)
        if (this.layers.mixingRatio) this.drawMixingRatioLines(ctx);

        // 5. Linhas Pseudo-Adiabáticas Úmidas (curvas Theta-E)
        if (this.layers.moistAdiabats) this.drawMoistAdiabats(ctx);

        // 6. Sombreamento de CAPE e CIN
        if (this.layers.capeShading && this.parcelData) {
            this.drawCapeCinShading(ctx);
        }

        // 7. Trajetória da Parcela
        if (this.layers.parcelTrajectory && this.parcelData) {
            this.drawParcelTrajectory(ctx);
        }

        // 8. Perfis de Temperatura e Ponto de Orvalho
        if (this.data && this.data.levels) {
            if (this.layers.dewpointProfile) this.drawProfile(ctx, 'dwpt', '#10b981', 2.8); // Verde Esmeralda
            if (this.layers.tempProfile) this.drawProfile(ctx, 'temp', '#ef4444', 3.0);     // Vermelho Brilhante
        }

        ctx.restore();

        // 9. Níveis Críticos (LCL, LFC, EL, 0°C)
        if (this.layers.criticalLevels && this.parcelData) {
            this.drawCriticalLevels(ctx);
        }

        // 10. Barbelas de Vento (coluna direita)
        if (this.layers.windBarbs && this.data && this.data.levels) {
            this.drawWindBarbsColumn(ctx);
        }

        // 11. Eixos e Rótulos Externos
        this.drawAxesAndLabels(ctx);

        // 12. Cursor Interativo e Tooltip
        if (this.hoverPoint) {
            this.drawHoverTooltip(ctx);
        }
    }

    // -------------------------------------------------------------
    // DESENHO DAS LINHAS DE REFERÊNCIA TERMODINÂMICAS
    // -------------------------------------------------------------
    drawIsobars(ctx) {
        const standardPressures = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100];
        ctx.strokeStyle = '#1e293b'; // slate-800
        ctx.lineWidth = 1;

        standardPressures.forEach(p => {
            const y = this.yFromPres(p);
            ctx.beginPath();
            ctx.moveTo(this.margins.left, y);
            ctx.lineTo(this.margins.left + this.plotWidth, y);
            ctx.stroke();

            // Linhas secundárias mais finas
            if (p === 850 || p === 700 || p === 500 || p === 300 || p === 200) {
                ctx.strokeStyle = '#334155'; // slate-700
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1;
            }
        });
    }

    drawIsotherms(ctx) {
        for (let t = -80; t <= 60; t += 10) {
            ctx.beginPath();
            if (t === 0) {
                ctx.strokeStyle = '#06b6d4'; // Ciano brilhante para a isoterma de 0°C
                ctx.lineWidth = 1.8;
                ctx.setLineDash([]);
            } else {
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
            }

            const p1 = this.pMax;
            const p2 = this.pMin;
            const x1 = this.xFromTempPres(t, p1);
            const x2 = this.xFromTempPres(t, p2);
            const y1 = this.yFromPres(p1);
            const y2 = this.yFromPres(p2);

            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    drawDryAdiabats(ctx) {
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.25)'; // Âmbar sutil
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        for (let theta = 250; theta <= 440; theta += 15) {
            ctx.beginPath();
            let started = false;
            for (let p = this.pMax; p >= this.pMin; p -= 20) {
                const t = Thermo.tempFromTheta(p, theta);
                const x = this.xFromTempPres(t, p);
                const y = this.yFromPres(p);
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    drawMoistAdiabats(ctx) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)'; // Verde esmeralda suave
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        for (let tw = -10; tw <= 36; tw += 4) {
            ctx.beginPath();
            let pStart = 1000.0;
            let t = tw;
            let started = false;

            for (let p = pStart; p >= 150; p -= 25) {
                const x = this.xFromTempPres(t, p);
                const y = this.yFromPres(p);
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
                t = Thermo.liftParcelMoist(p, t, p - 25);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    drawMixingRatioLines(ctx) {
        const mrValues = [0.5, 1, 2, 4, 8, 12, 16, 20];
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'; // Cinza sutil
        ctx.lineWidth = 0.9;
        ctx.setLineDash([2, 4]);

        mrValues.forEach(w => {
            ctx.beginPath();
            let started = false;
            for (let p = this.pMax; p >= 400; p -= 30) {
                const vp = Thermo.vaporPressureFromMr(p, w);
                const td = Thermo.dewpointFromVp(vp);
                const x = this.xFromTempPres(td, p);
                const y = this.yFromPres(p);
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        });
        ctx.setLineDash([]);
    }

    // -------------------------------------------------------------
    // DESENHO DOS PERFIS E ÁREAS DE CAPE/CIN
    // -------------------------------------------------------------
    drawProfile(ctx, field, color, lineWidth) {
        if (!this.data || !this.data.levels) return;
        const validLevels = this.data.levels.filter(l => l.pres !== null && l[field] !== null && l[field] > -90);
        if (validLevels.length < 2) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        let started = false;
        validLevels.forEach(l => {
            const x = this.xFromTempPres(l[field], l.pres);
            const y = this.yFromPres(l.pres);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
    }

    drawParcelTrajectory(ctx) {
        if (!this.parcelData || !this.parcelData.trajectory) return;
        const traj = this.parcelData.trajectory;
        if (traj.length < 2) return;

        ctx.strokeStyle = '#f59e0b'; // Âmbar vivo
        ctx.lineWidth = 2.2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();

        let started = false;
        traj.forEach(pt => {
            if (pt.pres < 100) return;
            const x = this.xFromTempPres(pt.tParcel, pt.pres);
            const y = this.yFromPres(pt.pres);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawCapeCinShading(ctx) {
        const traj = this.parcelData.trajectory;
        if (!traj || traj.length < 2) return;

        for (let i = 0; i < traj.length - 1; i++) {
            const p1 = traj[i];
            const p2 = traj[i + 1];
            if (p1.pres < 100 || p2.pres < 100) continue;

            const y1 = this.yFromPres(p1.pres);
            const y2 = this.yFromPres(p2.pres);

            const xEnv1 = this.xFromTempPres(p1.tEnv, p1.pres);
            const xEnv2 = this.xFromTempPres(p2.tEnv, p2.pres);
            const xPar1 = this.xFromTempPres(p1.tParcel, p1.pres);
            const xPar2 = this.xFromTempPres(p2.tParcel, p2.pres);

            const avgBuoy = 0.5 * (p1.buoyancy + p2.buoyancy);

            ctx.beginPath();
            ctx.moveTo(xEnv1, y1);
            ctx.lineTo(xPar1, y1);
            ctx.lineTo(xPar2, y2);
            ctx.lineTo(xEnv2, y2);
            ctx.closePath();

            if (avgBuoy > 0) {
                // CAPE: Vermelho/laranja semitransparente
                ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
                ctx.fill();
            } else {
                // CIN: Azul arroxeado semitransparente
                ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
                ctx.fill();
            }
        }
    }

    drawCriticalLevels(ctx) {
        const pData = this.parcelData;
        const levelsToDraw = [];

        if (pData.pLcl) {
            levelsToDraw.push({ pres: pData.pLcl, label: `LCL ${Math.round(pData.pLcl)} hPa`, color: '#38bdf8' });
        }
        if (pData.lfc) {
            levelsToDraw.push({ pres: pData.lfc.pres, label: `LFC ${Math.round(pData.lfc.pres)} hPa`, color: '#fbbf24' });
        }
        if (pData.el) {
            levelsToDraw.push({ pres: pData.el.pres, label: `EL ${Math.round(pData.el.pres)} hPa`, color: '#ec4899' });
        }
        if (pData.freezingLevel) {
            levelsToDraw.push({ pres: pData.freezingLevel.pres, label: `0°C ${Math.round(pData.freezingLevel.hght)}m`, color: '#06b6d4' });
        }

        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';

        levelsToDraw.forEach(item => {
            const y = this.yFromPres(item.pres);
            if (y >= this.margins.top && y <= this.margins.top + this.plotHeight) {
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 1.2;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(this.margins.left, y);
                ctx.lineTo(this.margins.left + this.plotWidth, y);
                ctx.stroke();

                // Tag
                ctx.fillStyle = item.color;
                ctx.fillText(item.label, this.margins.left + this.plotWidth - 8, y - 3);
            }
        });
        ctx.setLineDash([]);
    }

    // -------------------------------------------------------------
    // BARBELAS DE VENTO (COLUNA LATERAL)
    // -------------------------------------------------------------
    drawWindBarbsColumn(ctx) {
        const colX = this.margins.left + this.plotWidth + 35;
        const levels = this.data.levels;

        // Eixo vertical da linha de vento
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(colX, this.margins.top);
        ctx.lineTo(colX, this.margins.top + this.plotHeight);
        ctx.stroke();

        // Filtra níveis espaçados para não sobrepor barbelas
        let lastY = -999;
        const minSpacing = 22; // pixels

        levels.forEach(l => {
            if (l.pres === null || l.drct === null || l.sped === null) return;
            const y = this.yFromPres(l.pres);
            if (y < this.margins.top || y > this.margins.top + this.plotHeight) return;

            if (Math.abs(y - lastY) >= minSpacing) {
                lastY = y;
                const spdKt = l.sped_kt || Thermo.ms2kt(l.sped);
                this.drawSingleWindBarb(ctx, colX, y, l.drct, spdKt);
            }
        });
    }

    drawSingleWindBarb(ctx, cx, cy, dirDeg, spdKt) {
        ctx.save();
        ctx.translate(cx, cy);

        // Vento calmo (< 2.5 nós): círculo pequeno
        if (spdKt < 2.5) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Rotação: ângulo do vetor apontando na direção de onde o vento vem
        // Convenção meteorológica: vento de 360° (Norte) aponta para cima
        const rot = (dirDeg - 90) * Math.PI / 180.0;
        ctx.rotate(rot);

        ctx.strokeStyle = '#38bdf8'; // Azul céu
        ctx.fillStyle = '#38bdf8';
        ctx.lineWidth = 1.4;

        const staffLen = 25;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(staffLen, 0);
        ctx.stroke();

        let remaining = spdKt;
        let pos = staffLen;
        const barbLen = 10;

        // Bandeirolas de 50 nós (pennants)
        while (remaining >= 47.5) {
            ctx.beginPath();
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos - 4, -barbLen);
            ctx.lineTo(pos - 8, 0);
            ctx.closePath();
            ctx.fill();
            pos -= 8;
            remaining -= 50;
        }

        // Barbelas de 10 nós
        while (remaining >= 7.5) {
            ctx.beginPath();
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos - 2, -barbLen);
            ctx.stroke();
            pos -= 4;
            remaining -= 10;
        }

        // Meia-barbela de 5 nós
        if (remaining >= 2.5) {
            ctx.beginPath();
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos - 1, -barbLen * 0.5);
            ctx.stroke();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------
    // EIXOS, RÓTULOS E LEGENDA
    // -------------------------------------------------------------
    drawAxesAndLabels(ctx) {
        // Moldura externa
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(this.margins.left, this.margins.top, this.plotWidth, this.plotHeight);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        // Rótulos de Pressão (Eixo Y esquerdo)
        const pLabels = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100];
        pLabels.forEach(p => {
            const y = this.yFromPres(p);
            ctx.fillText(`${p}`, this.margins.left - 8, y);
        });

        // Unidade Y
        ctx.save();
        ctx.translate(14, this.margins.top + this.plotHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Pressão (hPa)', 0, 0);
        ctx.restore();

        // Rótulos de Temperatura (Eixo X inferior)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let t = -40; t <= 40; t += 10) {
            const x = this.xFromTempPres(t, this.pMax);
            if (x >= this.margins.left && x <= this.margins.left + this.plotWidth) {
                ctx.fillStyle = t === 0 ? '#06b6d4' : '#94a3b8';
                ctx.fillText(`${t}°`, x, this.margins.top + this.plotHeight + 8);
            }
        }

        // Título Eixo X
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Temperatura (°C)', this.margins.left + this.plotWidth / 2, this.margins.top + this.plotHeight + 26);

        // Título da Coluna de Vento
        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('Vento', this.margins.left + this.plotWidth + 35, this.margins.top - 14);
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('(kt)', this.margins.left + this.plotWidth + 35, this.margins.top - 2);

        // Legenda no canto superior esquerdo
        ctx.textAlign = 'left';
        ctx.font = '10px Inter, system-ui, sans-serif';
        
        // T (Vermelho)
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(this.margins.left + 12, this.margins.top + 10, 14, 3);
        ctx.fillStyle = '#f87171';
        ctx.fillText('Temperatura (T)', this.margins.left + 32, this.margins.top + 13);

        // Td (Verde)
        ctx.fillStyle = '#10b981';
        ctx.fillRect(this.margins.left + 130, this.margins.top + 10, 14, 3);
        ctx.fillStyle = '#34d399';
        ctx.fillText('Ponto de Orvalho (Td)', this.margins.left + 150, this.margins.top + 13);

        // Parcela (Âmbar)
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(this.margins.left + 280, this.margins.top + 10, 14, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('Parcela Ascendente', this.margins.left + 300, this.margins.top + 13);
    }

    // -------------------------------------------------------------
    // INTERAÇÃO / TOOLTIP
    // -------------------------------------------------------------
    handleHover(mouseX, mouseY) {
        if (mouseX < this.margins.left || mouseX > this.margins.left + this.plotWidth ||
            mouseY < this.margins.top || mouseY > this.margins.top + this.plotHeight) {
            this.hoverPoint = null;
            this.render();
            return;
        }

        const pres = this.presFromY(mouseY);
        const temp = this.tempFromXY(mouseX, mouseY);

        // Encontra o nível real mais próximo da sondagem
        let nearestLevel = null;
        if (this.data && this.data.levels) {
            let minDiff = 99999;
            this.data.levels.forEach(l => {
                const diff = Math.abs(l.pres - pres);
                if (diff < minDiff) {
                    minDiff = diff;
                    nearestLevel = l;
                }
            });
        }

        this.hoverPoint = {
            x: mouseX,
            y: mouseY,
            pres: Math.round(pres * 10) / 10,
            tempCursor: Math.round(temp * 10) / 10,
            nearest: nearestLevel
        };

        this.render();
    }

    drawHoverTooltip(ctx) {
        const hp = this.hoverPoint;
        if (!hp) return;

        // Mira/linhas guia
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 2]);

        // Linha horizontal de pressão
        ctx.beginPath();
        ctx.moveTo(this.margins.left, hp.y);
        ctx.lineTo(this.margins.left + this.plotWidth, hp.y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Informações da caixa de texto
        const l = hp.nearest;
        const lines = [
            `Pressão: ${hp.pres} hPa`,
            l ? `Altitude: ${Math.round(l.hght)} m` : '',
            l && l.temp !== null ? `T: ${l.temp.toFixed(1)} °C` : '',
            l && l.dwpt !== null ? `Td: ${l.dwpt.toFixed(1)} °C` : '',
            l && l.relh !== null ? `UR: ${Math.round(l.relh)} %` : '',
            l && l.drct !== null && l.sped !== null ? `Vento: ${Math.round(l.drct)}° / ${Math.round(l.sped_kt || Thermo.ms2kt(l.sped))} kt` : ''
        ].filter(Boolean);

        const boxWidth = 140;
        const boxHeight = lines.length * 16 + 14;
        let bx = hp.x + 15;
        let by = hp.y - boxHeight / 2;

        if (bx + boxWidth > this.margins.left + this.plotWidth) {
            bx = hp.x - boxWidth - 15;
        }
        if (by < this.margins.top) by = this.margins.top + 5;
        if (by + boxHeight > this.margins.top + this.plotHeight) by = this.margins.top + this.plotHeight - boxHeight - 5;

        // Fundo do card tooltip
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxWidth, boxHeight, 6);
        ctx.fill();
        ctx.stroke();

        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        lines.forEach((line, idx) => {
            if (idx === 0) ctx.fillStyle = '#38bdf8';
            else if (line.startsWith('T:')) ctx.fillStyle = '#f87171';
            else if (line.startsWith('Td:')) ctx.fillStyle = '#34d399';
            else ctx.fillStyle = '#cbd5e1';
            ctx.fillText(line, bx + 10, by + 8 + idx * 16);
        });
    }

    // Exportar para imagem PNG
    exportToPng() {
        return this.canvas.toDataURL('image/png');
    }
}
