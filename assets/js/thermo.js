/**
 * thermo.js - Motor de Física e Termodinâmica Atmosférica
 * Baseado nas fórmulas de Bolton (1980), MetPy, AMS Glossary e manuais da OMM (WMO).
 */

const Thermo = {
    // Constantes físicas fundamentais (SI)
    P0: 1000.0,       // Pressão de referência padrão (hPa)
    Rd: 287.058,      // Constante dos gases para o ar seco (J/(kg*K))
    Rv: 461.5,        // Constante dos gases para o vapor de água (J/(kg*K))
    Cp: 1005.7,       // Calor específico do ar seco a pressão constante (J/(kg*K))
    Cv: 718.0,        // Calor específico a volume constante
    g: 9.80665,       // Aceleração da gravidade (m/s^2)
    Lv: 2.501e6,      // Calor latente de vaporização a 0°C (J/kg)
    epsilon: 0.622,   // Razão Rd/Rv
    kappa: 0.285856,  // Rd / Cp

    // -------------------------------------------------------------
    // CONVERSÕES BÁSICAS
    // -------------------------------------------------------------
    c2k(c) { return c + 273.15; },
    k2c(k) { return k - 273.15; },
    ms2kt(ms) { return ms * 1.94384; },
    kt2ms(kt) { return kt / 1.94384; },

    // Pressão de vapor de saturação (hPa) sobre água líquida - Bolton (1980)
    satVaporPressure(tC) {
        return 6.112 * Math.exp((17.67 * tC) / (tC + 243.5));
    },

    // Temperatura de ponto de orvalho a partir da pressão de vapor (hPa)
    dewpointFromVp(e) {
        if (e <= 0) return -99.9;
        const val = Math.log(e / 6.112);
        return (243.5 * val) / (17.67 - val);
    },

    // Razão de mistura de saturação (g/kg) dada pressão (hPa) e temp (°C)
    satMixingRatio(p, tC) {
        const es = this.satVaporPressure(tC);
        if (p <= es) return 999.0;
        return (this.epsilon * es / (p - es)) * 1000.0;
    },

    // Pressão de vapor (hPa) a partir da razão de mistura (g/kg) e pressão (hPa)
    vaporPressureFromMr(p, mrGkg) {
        const w = mrGkg / 1000.0;
        return (p * w) / (this.epsilon + w);
    },

    // Temperatura potencial Theta (K)
    theta(p, tC) {
        return this.c2k(tC) * Math.pow(this.P0 / p, this.kappa);
    },

    // Temperatura a partir de Theta (K) e pressão (hPa)
    tempFromTheta(p, thetaK) {
        return this.k2c(thetaK * Math.pow(p / this.P0, this.kappa));
    },

    // Temperatura virtual Tv (K)
    virtualTemp(tC, mrGkg) {
        const tK = this.c2k(tC);
        const w = (mrGkg || 0) / 1000.0;
        return tK * (1.0 + 0.61 * w);
    },

    // Temperatura do Nível de Condensação por Levantamento (LCL) - Bolton (1980)
    lclTemperature(tC, tdC) {
        const tK = this.c2k(tC);
        const tdK = this.c2k(tdC);
        if (tK <= 0 || tdK <= 0) return tC;
        const tlclK = (1.0 / ((1.0 / (tdK - 56.0)) + (Math.log(tK / tdK) / 800.0))) + 56.0;
        return this.k2c(tlclK);
    },

    // Pressão do LCL (hPa)
    lclPressure(p, tC, tdC) {
        const tlclC = this.lclTemperature(tC, tdC);
        const tK = this.c2k(tC);
        const tlclK = this.c2k(tlclC);
        return p * Math.pow(tlclK / tK, 1.0 / this.kappa);
    },

    // Gradiente adiabático úmido dT/dp (°C/hPa)
    moistLapseRate(p, tC) {
        const tK = this.c2k(tC);
        const es = this.satVaporPressure(tC);
        const ws = (this.epsilon * es) / (p - es); // kg/kg
        const num = (this.Rd * tK / (p * 100.0 * this.Cp)) * (1.0 + (this.Lv * ws) / (this.Rd * tK));
        const den = 1.0 + (Math.pow(this.Lv, 2) * ws * this.epsilon) / (this.Cp * this.Rd * Math.pow(tK, 2));
        // num/den é dT/dp em K/Pa; multiplicamos por 100 para K/hPa
        return (num / den) * 100.0;
    },

    // Elevar uma parcela saturada de p_start a p_end ao longo da pseudo-adiabática
    liftParcelMoist(pStart, tStartC, pEnd, stepHpa = 5.0) {
        let p = pStart;
        let t = tStartC;
        const dir = pEnd < pStart ? -1 : 1;
        const dp = Math.abs(stepHpa) * dir;

        while ((dir < 0 && p > pEnd) || (dir > 0 && p < pEnd)) {
            const nextP = (dir < 0) ? Math.max(pEnd, p + dp) : Math.min(pEnd, p + dp);
            const actualDp = nextP - p;
            
            // Runge-Kutta 2ª ordem (Euler melhorado / Heun)
            const k1 = this.moistLapseRate(p, t);
            const tMid = t + k1 * actualDp;
            const k2 = this.moistLapseRate(nextP, tMid);
            
            t += 0.5 * (k1 + k2) * actualDp;
            p = nextP;
        }
        return t;
    },

    // Trajetória completa da parcela a partir da superfície até o topo da sondagem
    calcParcelProfile(levels, parcelType = 'surface') {
        if (!levels || levels.length === 0) return null;

        // Seleciona as características iniciais da parcela
        let pSfc = levels[0].pres;
        let tSfc = levels[0].temp;
        let tdSfc = levels[0].dwpt;
        let zSfc = levels[0].hght;

        if (parcelType === 'mixed_layer') {
            // Mistura os primeiros 100 hPa (~1000m)
            const pTopML = Math.max(100, pSfc - 100);
            let sumTheta = 0, sumMr = 0, count = 0;
            for (const l of levels) {
                if (l.pres >= pTopML) {
                    sumTheta += this.theta(l.pres, l.temp);
                    sumMr += (l.mixr || this.satMixingRatio(l.pres, l.dwpt));
                    count++;
                }
            }
            if (count > 0) {
                const meanTheta = sumTheta / count;
                const meanMr = sumMr / count;
                tSfc = this.tempFromTheta(pSfc, meanTheta);
                const vp = this.vaporPressureFromMr(pSfc, meanMr);
                tdSfc = this.dewpointFromVp(vp);
            }
        } else if (parcelType === 'most_unstable') {
            // Busca o nível com maior Theta-E nos 300 hPa mais baixos
            const pTopMU = Math.max(100, pSfc - 300);
            let maxThetaE = -999;
            for (const l of levels) {
                if (l.pres >= pTopMU && l.temp !== null && l.dwpt !== null) {
                    const thte = l.thte || this.theta(l.pres, l.temp);
                    if (thte > maxThetaE) {
                        maxThetaE = thte;
                        pSfc = l.pres;
                        tSfc = l.temp;
                        tdSfc = l.dwpt;
                        zSfc = l.hght;
                    }
                }
            }
        }

        const pLcl = this.lclPressure(pSfc, tSfc, tdSfc);
        const tLcl = this.lclTemperature(tSfc, tdSfc);
        const thetaSfc = this.theta(pSfc, tSfc);

        // Altura aproximada do LCL via aproximação de Espy: z_lcl ~= 125 * (T - Td)
        const zLclApprox = zSfc + 125.0 * (tSfc - tdSfc);

        const parcelTrajectory = [];
        // Ordena níveis decrescentes de pressão (do chão para o topo)
        const sorted = [...levels].filter(l => l.pres !== null && l.temp !== null).sort((a, b) => b.pres - a.pres);

        // Constrói trajetória nível a nível
        for (const l of sorted) {
            let tParcel;
            if (l.pres >= pLcl) {
                // Adiabática seca abaixo do LCL
                tParcel = this.tempFromTheta(l.pres, thetaSfc);
            } else {
                // Pseudo-adiabática úmida acima do LCL
                tParcel = this.liftParcelMoist(pLcl, tLcl, l.pres);
            }
            parcelTrajectory.push({
                pres: l.pres,
                hght: l.hght,
                tEnv: l.temp,
                tdEnv: l.dwpt,
                tParcel: tParcel,
                buoyancy: tParcel - l.temp
            });
        }

        return {
            pSfc, tSfc, tdSfc, zSfc,
            pLcl, tLcl, zLcl: zLclApprox,
            trajectory: parcelTrajectory
        };
    },

    // Cálculo exato e rigoroso de CAPE, CIN, LFC, EL (Definições Meteorológicas AMS / MetPy / SPC)
    calcCapeCin(parcelData) {
        if (!parcelData || !parcelData.trajectory || parcelData.trajectory.length === 0) {
            return { cape: 0, cin: 0, lfc: null, el: null };
        }

        const traj = parcelData.trajectory;
        const pLcl = parcelData.pLcl;
        const pSfc = parcelData.pSfc || traj[0].pres;

        let lfc = null;
        let lfcIdx = -1;

        // 1. Procura o Nível de Convecção Livre (LFC) acima do LCL
        // O LFC é o nível onde a parcela entra em empuxo positivo consistente
        for (let i = 0; i < traj.length - 1; i++) {
            const cur = traj[i];
            if (cur.pres <= pLcl + 1.0) {
                if (cur.buoyancy > 0) {
                    // Validação de camada sustentada para evitar falsos LFCs por ruído de 0.01°C
                    let posCount = 0;
                    for (let j = i; j < Math.min(traj.length, i + 8); j++) {
                        if (traj[j].buoyancy > 0) posCount++;
                    }
                    if (posCount >= 3 || cur.buoyancy >= 0.15) {
                        lfc = { pres: cur.pres, hght: cur.hght };
                        lfcIdx = i;
                        break;
                    }
                }
            }
        }

        // Se NÃO há LFC: a atmosfera é estável. Por definição rigorosa da AMS e MetPy,
        // CAPE = 0 J/kg e CIN = 0 J/kg (não há liberação convectiva).
        if (!lfc || lfcIdx === -1) {
            return {
                cape: 0,
                cin: 0,
                lfc: null,
                el: null,
                lcl: {
                    pres: Math.round(parcelData.pLcl * 10) / 10,
                    temp: Math.round(parcelData.tLcl * 10) / 10,
                    hght: Math.round(parcelData.zLcl)
                }
            };
        }

        // 2. Procura o Nível de Equilíbrio (EL) acima do LFC
        // O EL é o topo da nuvem convectiva onde a parcela volta a ser mais fria que o ambiente
        let el = null;
        let elIdx = -1;

        for (let i = traj.length - 1; i > lfcIdx; i--) {
            if (traj[i].buoyancy >= 0) {
                el = { pres: traj[i].pres, hght: traj[i].hght };
                elIdx = i;
                break;
            }
        }

        if (!el || elIdx <= lfcIdx) {
            el = { pres: traj[traj.length - 1].pres, hght: traj[traj.length - 1].hght };
            elIdx = traj.length - 1;
        }

        // 3. Integração de CIN (Inibição Convectiva):
        // ESTRITAMENTE entre o nível inicial da parcela (superfície) e o LFC!
        let cin = 0;
        for (let i = 0; i < lfcIdx; i++) {
            const p1 = traj[i];
            const p2 = traj[i + 1];
            if (p1.hght === null || p2.hght === null) continue;

            const dz = Math.abs(p2.hght - p1.hght);
            if (dz <= 0) continue;

            const avgBuoy = 0.5 * (p1.buoyancy + p2.buoyancy);
            const avgTEnvK = this.c2k(0.5 * (p1.tEnv + p2.tEnv));

            // Apenas flutuabilidade negativa abaixo do LFC entra no cálculo de CIN
            if (avgBuoy < 0 && p1.pres <= pSfc + 2.0 && p1.pres >= lfc.pres - 2.0) {
                cin += this.g * (avgBuoy / avgTEnvK) * dz;
            }
        }

        // 4. Integração de CAPE (Energia Potencial Convectiva Disponível):
        // ESTRITAMENTE entre o LFC e o EL!
        let cape = 0;
        for (let i = lfcIdx; i <= elIdx && i < traj.length - 1; i++) {
            const p1 = traj[i];
            const p2 = traj[i + 1];
            if (p1.hght === null || p2.hght === null) continue;

            const dz = Math.abs(p2.hght - p1.hght);
            if (dz <= 0) continue;

            const avgBuoy = 0.5 * (p1.buoyancy + p2.buoyancy);
            const avgTEnvK = this.c2k(0.5 * (p1.tEnv + p2.tEnv));

            if (avgBuoy > 0) {
                cape += this.g * (avgBuoy / avgTEnvK) * dz;
            }
        }

        return {
            cape: Math.max(0, Math.round(cape)),
            cin: Math.min(0, Math.round(cin)),
            lfc: lfc,
            el: el,
            lcl: {
                pres: Math.round(parcelData.pLcl * 10) / 10,
                temp: Math.round(parcelData.tLcl * 10) / 10,
                hght: Math.round(parcelData.zLcl)
            }
        };
    },

    // -------------------------------------------------------------
    // ÍNDICES CONVECTIVOS E DE ESTABILIDADE
    // -------------------------------------------------------------
    calcStabilityIndices(levels) {
        // Encontra níveis padrão: 850, 700, 500 hPa
        const getAt = (targetP) => {
            let best = null;
            let minDiff = 9999;
            for (const l of levels) {
                const diff = Math.abs(l.pres - targetP);
                if (diff < minDiff) {
                    minDiff = diff;
                    best = l;
                }
            }
            return (minDiff <= 25) ? best : null;
        };

        const l850 = getAt(850);
        const l700 = getAt(700);
        const l500 = getAt(500);

        let kIndex = null;
        let totalTotals = null;
        let verticalTotals = null;
        let crossTotals = null;
        let showalter = null;
        let sweat = null;

        if (l850 && l500 && l700) {
            // K-Index = (T850 - T500) + Td850 - (T700 - Td700)
            kIndex = (l850.temp - l500.temp) + l850.dwpt - (l700.temp - l700.dwpt);
            kIndex = Math.round(kIndex * 10) / 10;
        }

        if (l850 && l500) {
            // Vertical Totals = T850 - T500
            verticalTotals = l850.temp - l500.temp;
            // Cross Totals = Td850 - T500
            crossTotals = l850.dwpt - l500.temp;
            // Total Totals = VT + CT
            totalTotals = verticalTotals + crossTotals;
            verticalTotals = Math.round(verticalTotals * 10) / 10;
            crossTotals = Math.round(crossTotals * 10) / 10;
            totalTotals = Math.round(totalTotals * 10) / 10;

            // Showalter Index: eleva parcela de 850 hPa até 500 hPa
            const pLcl850 = this.lclPressure(l850.pres, l850.temp, l850.dwpt);
            const tLcl850 = this.lclTemperature(l850.temp, l850.dwpt);
            const tParcel500 = this.liftParcelMoist(pLcl850, tLcl850, 500);
            showalter = Math.round((l500.temp - tParcel500) * 10) / 10;

            // SWEAT Index (Severe Weather Threat Index)
            const ws850kt = l850.sped_kt || this.ms2kt(l850.sped || 0);
            const ws500kt = l500.sped_kt || this.ms2kt(l500.sped || 0);
            const wd850 = l850.drct || 0;
            const wd500 = l500.drct || 0;

            let s1 = 12.0 * Math.max(0, l850.dwpt);
            let s2 = 20.0 * Math.max(0, totalTotals - 49.0);
            let s3 = 2.0 * ws850kt;
            let s4 = ws500kt;
            let s5 = 0;
            const shearAngle = wd500 - wd850;
            if (wd850 >= 130 && wd850 <= 250 && wd500 >= 210 && wd500 <= 310 && shearAngle > 0 && ws850kt >= 15 && ws500kt >= 15) {
                s5 = 125.0 * (Math.sin(shearAngle * Math.PI / 180.0) + 0.2);
            }
            sweat = Math.round(s1 + s2 + s3 + s4 + s5);
        }

        // Lifted Index (LI) em 500 hPa a partir da superfície
        let liftedIndex = null;
        if (levels[0] && l500) {
            const sfc = levels[0];
            const pLclSfc = this.lclPressure(sfc.pres, sfc.temp, sfc.dwpt);
            const tLclSfc = this.lclTemperature(sfc.temp, sfc.dwpt);
            const tParcel500 = this.liftParcelMoist(pLclSfc, tLclSfc, 500);
            liftedIndex = Math.round((l500.temp - tParcel500) * 10) / 10;
        }

        // Água Precipitável Total (PWAT / mm)
        let pwat = 0;
        const sorted = [...levels].filter(l => l.pres !== null && l.mixr !== null).sort((a, b) => b.pres - a.pres);
        for (let i = 0; i < sorted.length - 1; i++) {
            const p1 = sorted[i];
            const p2 = sorted[i + 1];
            const dp = p1.pres - p2.pres;
            if (dp > 0) {
                const avgW = 0.5 * ((p1.mixr || 0) + (p2.mixr || 0)); // g/kg
                pwat += (avgW * dp) / (this.g * 10.0); // mm exato (1 kg/m² = 1 mm)
            }
        }
        pwat = Math.round(pwat * 10) / 10;

        // Nível de Congelamento (Freezing Level 0°C) e nível de -20°C
        let freezingLevel = null;
        let minus20Level = null;
        for (let i = 0; i < sorted.length - 1; i++) {
            const l1 = sorted[i];
            const l2 = sorted[i + 1];
            if (l1.temp >= 0 && l2.temp < 0 && !freezingLevel) {
                const f = (0 - l1.temp) / (l2.temp - l1.temp);
                freezingLevel = {
                    pres: Math.round(l1.pres + f * (l2.pres - l1.pres)),
                    hght: Math.round(l1.hght + f * (l2.hght - l1.hght))
                };
            }
            if (l1.temp >= -20 && l2.temp < -20 && !minus20Level) {
                const f = (-20 - l1.temp) / (l2.temp - l1.temp);
                minus20Level = {
                    pres: Math.round(l1.pres + f * (l2.pres - l1.pres)),
                    hght: Math.round(l1.hght + f * (l2.hght - l1.hght))
                };
            }
        }

        return {
            kIndex,
            totalTotals,
            verticalTotals,
            crossTotals,
            showalter,
            liftedIndex,
            sweat,
            pwat,
            freezingLevel,
            minus20Level
        };
    },

    // -------------------------------------------------------------
    // CISALHAMENTO DO VENTO E CINEMÁTICA
    // -------------------------------------------------------------
    calcKinematics(levels, latitude = -30.0) {
        if (!levels || levels.length === 0) return null;

        const sfc = levels[0];
        const zSfc = sfc.hght || 0;

        // Função para interpolar vento a uma dada altura AGL (m)
        const getWindAtAgl = (targetAgl) => {
            const targetMsl = zSfc + targetAgl;
            for (let i = 0; i < levels.length - 1; i++) {
                const l1 = levels[i];
                const l2 = levels[i + 1];
                if (l1.hght !== null && l2.hght !== null && l1.drct !== null && l2.drct !== null) {
                    if (l1.hght <= targetMsl && l2.hght >= targetMsl) {
                        const f = (targetMsl - l1.hght) / (l2.hght - l1.hght || 1);
                        // Interpola componentes u e v
                        const u1 = -l1.sped * Math.sin(l1.drct * Math.PI / 180);
                        const v1 = -l1.sped * Math.cos(l1.drct * Math.PI / 180);
                        const u2 = -l2.sped * Math.sin(l2.drct * Math.PI / 180);
                        const v2 = -l2.sped * Math.cos(l2.drct * Math.PI / 180);
                        const u = u1 + f * (u2 - u1);
                        const v = v1 + f * (v2 - v1);
                        const spd = Math.hypot(u, v);
                        let dir = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
                        return { u, v, spd, dir, hght: targetMsl };
                    }
                }
            }
            return null;
        };

        const wSfc = getWindAtAgl(0) || { u: 0, v: 0, spd: sfc.sped || 0, dir: sfc.drct || 0 };
        const w1km = getWindAtAgl(1000);
        const w3km = getWindAtAgl(3000);
        const w6km = getWindAtAgl(6000);

        // Bulk Wind Shear (0-1km, 0-3km, 0-6km)
        const shear0_1 = w1km ? Math.hypot(w1km.u - wSfc.u, w1km.v - wSfc.v) : null;
        const shear0_3 = w3km ? Math.hypot(w3km.u - wSfc.u, w3km.v - wSfc.v) : null;
        const shear0_6 = w6km ? Math.hypot(w6km.u - wSfc.u, w6km.v - wSfc.v) : null;

        // Vento Médio 0-6 km (Mean Wind)
        let sumU = 0, sumV = 0, countW = 0;
        for (let z = 0; z <= 6000; z += 500) {
            const w = getWindAtAgl(z);
            if (w) {
                sumU += w.u;
                sumV += w.v;
                countW++;
            }
        }
        const meanU = countW > 0 ? sumU / countW : 0;
        const meanV = countW > 0 ? sumV / countW : 0;
        const meanSpd = Math.hypot(meanU, meanV);
        const meanDir = (Math.atan2(-meanU, -meanV) * 180 / Math.PI + 360) % 360;

        // Movimento de Tempestade de Bunkers (Right-Mover e Left-Mover)
        // No Hemisfério Sul, supercélulas ciclônicas desviam para a ESQUERDA (Left-Mover)!
        const isSouthHemisphere = latitude < 0;
        let rm = null, lm = null;

        if (shear0_6 && shear0_6 > 0 && w6km) {
            const du = w6km.u - wSfc.u;
            const dv = w6km.v - wSfc.v;
            const shearMag = Math.hypot(du, dv);
            const devSpeed = 7.5; // m/s (~15 kt)

            // Vetor perpendicular ao cisalhamento
            const perpU = (dv / shearMag) * devSpeed;
            const perpV = (-du / shearMag) * devSpeed;

            // Hemisfério Norte: RM = Mean + Perp, LM = Mean - Perp
            // Hemisfério Sul: LM é ciclônico (desvia para esquerda do vento médio)
            const rmU = meanU + perpU;
            const rmV = meanV + perpV;
            const lmU = meanU - perpU;
            const lmV = meanV - perpV;

            rm = {
                u: rmU, v: rmV,
                spd: Math.hypot(rmU, rmV),
                dir: (Math.atan2(-rmU, -rmV) * 180 / Math.PI + 360) % 360
            };
            lm = {
                u: lmU, v: lmV,
                spd: Math.hypot(lmU, lmV),
                dir: (Math.atan2(-lmU, -lmV) * 180 / Math.PI + 360) % 360
            };
        }

        // Helicidade Relativa à Tempestade (SRH) 0-1km e 0-3km
        // SRH = integral (v_rel x dV)
        const calcSRH = (maxAgl, stormMotion) => {
            if (!stormMotion) return 0;
            let srh = 0;
            const step = 200;
            for (let z = 0; z < maxAgl; z += step) {
                const w1 = getWindAtAgl(z);
                const w2 = getWindAtAgl(z + step);
                if (w1 && w2) {
                    const du = w2.u - w1.u;
                    const dv = w2.v - w1.v;
                    const uRel = 0.5 * (w1.u + w2.u) - stormMotion.u;
                    const vRel = 0.5 * (w1.v + w2.v) - stormMotion.v;
                    // Termo cruzado (u_rel * dv - v_rel * du)
                    srh += (uRel * dv - vRel * du);
                }
            }
            return Math.round(srh);
        };

        // Usa o movimento da tempestade dominante (LM no HSul, RM no HNorte)
        const dominantStorm = isSouthHemisphere ? (lm || rm) : (rm || lm);
        const srh0_1 = dominantStorm ? calcSRH(1000, dominantStorm) : 0;
        const srh0_3 = dominantStorm ? calcSRH(3000, dominantStorm) : 0;

        return {
            wSfc: { spd: Math.round(this.ms2kt(wSfc.spd)), dir: Math.round(wSfc.dir) },
            w1km: w1km ? { spd: Math.round(this.ms2kt(w1km.spd)), dir: Math.round(w1km.dir) } : null,
            w3km: w3km ? { spd: Math.round(this.ms2kt(w3km.spd)), dir: Math.round(w3km.dir) } : null,
            w6km: w6km ? { spd: Math.round(this.ms2kt(w6km.spd)), dir: Math.round(w6km.dir) } : null,
            shear0_1_ms: shear0_1 ? Math.round(shear0_1 * 10) / 10 : null,
            shear0_1_kt: shear0_1 ? Math.round(this.ms2kt(shear0_1)) : null,
            shear0_3_ms: shear0_3 ? Math.round(shear0_3 * 10) / 10 : null,
            shear0_3_kt: shear0_3 ? Math.round(this.ms2kt(shear0_3)) : null,
            shear0_6_ms: shear0_6 ? Math.round(shear0_6 * 10) / 10 : null,
            shear0_6_kt: shear0_6 ? Math.round(this.ms2kt(shear0_6)) : null,
            meanWind: { spdKt: Math.round(this.ms2kt(meanSpd)), dir: Math.round(meanDir) },
            bunkersRM: rm ? { spdKt: Math.round(this.ms2kt(rm.spd)), dir: Math.round(rm.dir) } : null,
            bunkersLM: lm ? { spdKt: Math.round(this.ms2kt(lm.spd)), dir: Math.round(lm.dir) } : null,
            srh0_1: srh0_1,
            srh0_3: srh0_3,
            isSouthHemisphere
        };
    },

    // Parâmetro de Tornado Significativo (STP) e Energy-Helicity Index (EHI)
    calcCompositeIndices(cape, lclHghtAgl, srh1km, shear6kmMs) {
        if (!cape || cape <= 0) return { stp: 0, ehi: 0 };

        // STP fixo (Thompson et al., 2004)
        // CAPE / 1500 * (2000 - LCL) / 1000 * SRH1 / 150 * BWS6 / 20
        const capeTerm = cape / 1500.0;
        const lclTerm = Math.max(0, Math.min(1.0, (2000.0 - (lclHghtAgl || 1000.0)) / 1000.0));
        const srhTerm = Math.abs(srh1km || 0) / 150.0;
        const shearTerm = Math.min(1.5, (shear6kmMs || 0) / 20.0);

        const stp = Math.max(0, capeTerm * lclTerm * srhTerm * shearTerm);
        const ehi = (cape * Math.abs(srh1km || 0)) / 160000.0;

        return {
            stp: Math.round(stp * 100) / 100,
            ehi: Math.round(ehi * 100) / 100
        };
    }
};
