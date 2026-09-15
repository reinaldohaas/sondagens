/**
 * stations.js - Catálogo de estações de radiossondagem com foco prioritário no Sul do Brasil,
 * Brasil, América do Sul e estações de referência mundial.
 */

const STATIONS_CATALOG = {
    // -------------------------------------------------------------
    // SUL DO BRASIL (FOCO PRIORITÁRIO)
    // -------------------------------------------------------------
    south_brazil: [
        {
            id: '83971',
            icao: 'SBPA',
            name: 'Porto Alegre / Salgado Filho',
            state: 'RS',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -30.00,
            lon: -51.18,
            elev: 3,
            badge: 'Prioridade',
            desc: 'Estação principal do Rio Grande do Sul. Monitoramento da bacia do Guaíba, frentes frias, ciclogêneses e Linhas de Instabilidade.'
        },
        {
            id: '83936',
            icao: 'SBSM',
            name: 'Santa Maria / Base Aérea',
            state: 'RS',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -29.70,
            lon: -53.70,
            elev: 85,
            badge: 'Prioridade',
            desc: 'Centro do RS. Posição estratégica para Complexos Convectivos de Mesoescala (CCMs) e Jatos de Baixos Níveis (JBN).'
        },
        {
            id: '83840',
            icao: 'SBCT',
            name: 'Curitiba / Afonso Pena',
            state: 'PR',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -25.53,
            lon: -49.17,
            elev: 908,
            badge: 'Prioridade',
            desc: 'Primeiro Planalto Paranaense. Monitoramento de frentes frias, massas polares e instabilidades pré-frontais.'
        },
        {
            id: '83827',
            icao: 'SBFI',
            name: 'Foz do Iguaçu / Cataratas',
            state: 'PR',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -25.60,
            lon: -54.58,
            elev: 192,
            badge: 'Fronteira',
            desc: 'Tríplice Fronteira (PR/Argentina/Paraguai). Monitoramento chave da entrada de umidade amazônica (JBN) e tempestades severas.'
        },
        {
            id: '83897',
            icao: 'SBPF',
            name: 'Passo Fundo',
            state: 'RS',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -28.25,
            lon: -52.40,
            elev: 684,
            badge: 'Norte RS',
            desc: 'Planalto Médio do RS. Região de frequente incidência de granizo severo e vendavais associados a cavados.'
        },
        {
            id: '83980',
            icao: 'SBUG',
            name: 'Uruguaiana',
            state: 'RS',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -29.78,
            lon: -57.03,
            elev: 78,
            badge: 'Fronteira Oeste',
            desc: 'Fronteira Oeste do RS com a Argentina. Corredor de advecção quente e úmida da Bacia do Prata.'
        },
        {
            id: '83997',
            icao: 'SBPK',
            name: 'Pelotas',
            state: 'RS',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -31.72,
            lon: -52.33,
            elev: 18,
            badge: 'Sul RS',
            desc: 'Litoral Sul Gaúcho e bacia da Lagoa dos Patos. Impacto de ciclones extratropicais e frentes frias.'
        },
        {
            id: '83899',
            icao: 'SBFL',
            aliases: ['83838', 'SBFL', 'FLN'],
            name: 'Florianópolis / Hercílio Luz',
            state: 'SC',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -27.667,
            lon: -48.541,
            elev: 5,
            badge: 'Prioridade • BUFR Real',
            desc: 'Aeroporto Internacional Hercílio Luz. Radiossondagens reais de alta resolução BUFR da Universidade de Wyoming (WMO 83899).'
        },
        {
            id: '83788',
            icao: 'SBLO',
            name: 'Londrina',
            state: 'PR',
            region: 'Sul do Brasil',
            country: 'Brasil',
            lat: -23.33,
            lon: -51.13,
            elev: 566,
            badge: 'Norte PR',
            desc: 'Norte do Paraná. Transição entre o clima subtropical do Sul e tropical do Centro-Oeste/Sudeste.'
        }
    ],

    // -------------------------------------------------------------
    // BACIA DO PRATA E CONE SUL (VIZINHOS DIRETOS DO SUL DO BRASIL)
    // -------------------------------------------------------------
    cone_sur: [
        {
            id: '87155',
            icao: 'SARF',
            name: 'Resistencia',
            state: 'Chaco',
            region: 'Cone Sul',
            country: 'Argentina',
            lat: -27.45,
            lon: -59.05,
            elev: 52,
            badge: 'JBN Prata',
            desc: 'Região central da Chaco-Pampa. Ponto de origem e intensificação do Jato em Baixos Níveis que alimenta tempestades no Sul do Brasil.'
        },
        {
            id: '87576',
            icao: 'SAEZ',
            name: 'Ezeiza / Buenos Aires',
            state: 'Buenos Aires',
            region: 'Cone Sul',
            country: 'Argentina',
            lat: -34.82,
            lon: -58.53,
            elev: 20,
            badge: 'Cone Sul',
            desc: 'Região metropolitana de Buenos Aires e estuário do Rio da Prata.'
        },
        {
            id: '86580',
            icao: 'SUMU',
            name: 'Montevidéu / Carrasco',
            state: 'Canelones',
            region: 'Cone Sul',
            country: 'Uruguai',
            lat: -34.83,
            lon: -56.02,
            elev: 32,
            badge: 'Uruguai',
            desc: 'Estação principal do Uruguai. Antecessora de frentes frias que chegam ao Rio Grande do Sul.'
        },
        {
            id: '86218',
            icao: 'SGAS',
            name: 'Assunção / Silvio Pettirossi',
            state: 'Central',
            region: 'Cone Sul',
            country: 'Paraguai',
            lat: -25.24,
            lon: -57.52,
            elev: 89,
            badge: 'Paraguai',
            desc: 'Posição-chave no centro da América do Sul para advecção de calor e umidade em direção ao Sul do Brasil.'
        },
        {
            id: '87344',
            icao: 'SACO',
            name: 'Córdoba / Pajas Blancas',
            state: 'Córdoba',
            region: 'Cone Sul',
            country: 'Argentina',
            lat: -31.32,
            lon: -64.21,
            elev: 495,
            badge: 'Serras',
            desc: 'Pé de serra das Serras de Córdoba. Área célebre pelas maiores taxas de convecção profunda do planeta (projeto RELAMPAGO).'
        },
        {
            id: '87418',
            icao: 'SAME',
            name: 'Mendoza / El Plumerillo',
            state: 'Mendoza',
            region: 'Cone Sul',
            country: 'Argentina',
            lat: -32.83,
            lon: -68.80,
            elev: 704,
            badge: 'Andes',
            desc: 'Região pré-andina, influência do vento Zonda e tempestades com granizo severo.'
        }
    ],

    // -------------------------------------------------------------
    // DEMAIS REGIÕES DO BRASIL
    // -------------------------------------------------------------
    brazil: [
        {
            id: '83779',
            icao: 'SBMT',
            name: 'São Paulo / Campo de Marte',
            state: 'SP',
            region: 'Sudeste',
            country: 'Brasil',
            lat: -23.51,
            lon: -46.63,
            elev: 722,
            badge: 'Sudeste',
            desc: 'Região metropolitana de São Paulo. Ilha de calor urbana, brisa marítima e frentes frias vindas do Sul.'
        },
        {
            id: '83746',
            icao: 'SBGL',
            name: 'Rio de Janeiro / Galeão',
            state: 'RJ',
            region: 'Sudeste',
            country: 'Brasil',
            lat: -22.81,
            lon: -43.25,
            elev: 9,
            badge: 'Sudeste',
            desc: 'Baía de Guanabara. Circulação litorânea, ZCAS e frentes frias atlânticas.'
        },
        {
            id: '83362',
            icao: 'SBBR',
            name: 'Brasília / Pres. JK',
            state: 'DF',
            region: 'Centro-Oeste',
            country: 'Brasil',
            lat: -15.87,
            lon: -47.92,
            elev: 1061,
            badge: 'Planalto Central',
            desc: 'Planalto Central. Monitoramento da Zona de Convergência do Atlântico Sul (ZCAS) e período seco/chuvoso.'
        },
        {
            id: '83361',
            icao: 'SBCY',
            name: 'Cuiabá / Marechal Rondon',
            state: 'MT',
            region: 'Centro-Oeste',
            country: 'Brasil',
            lat: -15.65,
            lon: -56.12,
            elev: 188,
            badge: 'Pantanal',
            desc: 'Bacia do Pantanal. Monitoramento da advecção de ar tropical e friagens de inverno.'
        },
        {
            id: '83378',
            icao: 'SBCG',
            name: 'Campo Grande',
            state: 'MS',
            region: 'Centro-Oeste',
            country: 'Brasil',
            lat: -20.47,
            lon: -54.67,
            elev: 560,
            badge: 'Centro-Oeste',
            desc: 'Mato Grosso do Sul. Rota de cavados e instabilidade que se conectam ao Paraná e Rio Grande do Sul.'
        },
        {
            id: '83587',
            icao: 'SBCF',
            name: 'Belo Horizonte / Confins',
            state: 'MG',
            region: 'Sudeste',
            country: 'Brasil',
            lat: -19.62,
            lon: -43.97,
            elev: 827,
            badge: 'Sudeste',
            desc: 'Minas Gerais. Eixo frequente da ZCAS no verão.'
        },
        {
            id: '83612',
            icao: 'SBVT',
            name: 'Vitória / Goiabeiras',
            state: 'ES',
            region: 'Sudeste',
            country: 'Brasil',
            lat: -20.26,
            lon: -40.29,
            elev: 3,
            badge: 'Litoral',
            desc: 'Litoral do Espírito Santo.'
        },
        {
            id: '82332',
            icao: 'SBMN',
            name: 'Manaus / Ponta Pelada',
            state: 'AM',
            region: 'Norte',
            country: 'Brasil',
            lat: -3.15,
            lon: -59.98,
            elev: 84,
            badge: 'Amazônia',
            desc: 'Coração da Amazônia. Convecção tropical úmida profunda, alta água precipitável (PWAT) e linhas de instabilidade amazônicas.'
        },
        {
            id: '82193',
            icao: 'SBBE',
            name: 'Belém / Val-de-Cans',
            state: 'PA',
            region: 'Norte',
            country: 'Brasil',
            lat: -1.38,
            lon: -48.48,
            elev: 16,
            badge: 'Equatorial',
            desc: 'Litoral Norte e Foz do Rio Amazonas. Linhas de instabilidade costeiras (squall lines) e ZCIT.'
        },
        {
            id: '82599',
            icao: 'SBNT',
            name: 'Natal / Augusto Severo',
            state: 'RN',
            region: 'Nordeste',
            country: 'Brasil',
            lat: -5.91,
            lon: -35.25,
            elev: 52,
            badge: 'Nordeste',
            desc: 'Borda oriental do Nordeste. Alísios de sudeste e Ondas de Leste.'
        },
        {
            id: '82994',
            icao: 'SBRF',
            name: 'Recife / Guararapes',
            state: 'PE',
            region: 'Nordeste',
            country: 'Brasil',
            lat: -8.13,
            lon: -34.92,
            elev: 10,
            badge: 'Nordeste',
            desc: 'Litoral Pernambucano. Distúrbios Ondulatórios de Leste (DOL) e chuvas torrenciais de outono/inverno.'
        },
        {
            id: '82397',
            icao: 'SBFZ',
            name: 'Fortaleza / Pinto Martins',
            state: 'CE',
            region: 'Nordeste',
            country: 'Brasil',
            lat: -3.78,
            lon: -38.53,
            elev: 25,
            badge: 'Nordeste',
            desc: 'Litoral Cearense. Zona de Convergência Intertropical (ZCIT) e Vórtices Ciclônicos de Altos Níveis (VCAN).'
        },
        {
            id: '83229',
            icao: 'SBSV',
            name: 'Salvador / Dep. Luís Eduardo Magalhães',
            state: 'BA',
            region: 'Nordeste',
            country: 'Brasil',
            lat: -12.91,
            lon: -38.33,
            elev: 20,
            badge: 'Litoral Leste',
            desc: 'Recôncavo Baiano.'
        }
    ],

    // -------------------------------------------------------------
    // RESTO DO MUNDO (BENCHMARKS E REFERÊNCIAS INTERNACIONAIS)
    // -------------------------------------------------------------
    world: [
        {
            id: '72357',
            icao: 'KOUN',
            name: 'Norman / OUN (Oklahoma)',
            state: 'OK',
            region: 'Grandes Planícies',
            country: 'Estados Unidos',
            lat: 35.24,
            lon: -97.47,
            elev: 358,
            badge: 'SPC / Tornado Alley',
            desc: 'Centro Nacional de Tempestades Severas (SPC/NSSL). Referência mundial de supercélulas e tornados.'
        },
        {
            id: '72250',
            icao: 'KBRO',
            name: 'Brownsville (Texas)',
            state: 'TX',
            region: 'Golfo do México',
            country: 'Estados Unidos',
            lat: 25.91,
            lon: -97.42,
            elev: 7,
            badge: 'Subtropical',
            desc: 'Borda do Golfo do México. Extrema umidade e alta instabilidade convectiva.'
        },
        {
            id: '72249',
            icao: 'KFWD',
            name: 'Fort Worth / Dallas (Texas)',
            state: 'TX',
            region: 'Sul EUA',
            country: 'Estados Unidos',
            lat: 32.83,
            lon: -97.30,
            elev: 196,
            badge: 'Tempestades',
            desc: 'Norte do Texas.'
        },
        {
            id: '72202',
            icao: 'KMFL',
            name: 'Miami (Flórida)',
            state: 'FL',
            region: 'Flórida',
            country: 'Estados Unidos',
            lat: 25.75,
            lon: -80.38,
            elev: 5,
            badge: 'Tropical',
            desc: 'Monitoramento de furacões e convecção marítima tropical.'
        },
        {
            id: '03005',
            icao: 'EGLL',
            name: 'Londres / Heathrow',
            state: '',
            region: 'Europa Ocidental',
            country: 'Reino Unido',
            lat: 51.48,
            lon: -0.45,
            elev: 25,
            badge: 'Europa',
            desc: 'Atmosfera marítima polar temperada.'
        },
        {
            id: '07145',
            icao: 'LFPO',
            name: 'Paris / Orly',
            state: '',
            region: 'Europa Ocidental',
            country: 'França',
            lat: 48.72,
            lon: 2.37,
            elev: 89,
            badge: 'Europa',
            desc: 'Bacia de Paris.'
        },
        {
            id: '10868',
            icao: 'EDDM',
            name: 'Munique',
            state: 'Baviera',
            region: 'Europa Central',
            country: 'Alemanha',
            lat: 48.35,
            lon: 11.78,
            elev: 453,
            badge: 'Alpes',
            desc: 'Pé dos Alpes Bávaros. Tempestades convectivas alpinas com granizo.'
        },
        {
            id: '47662',
            icao: 'RJTT',
            name: 'Tóquio / Haneda',
            state: 'Kanto',
            region: 'Ásia',
            country: 'Japão',
            lat: 35.55,
            lon: 139.78,
            elev: 6,
            badge: 'Ásia',
            desc: 'Planície de Kanto, ciclones tropicais (Tufões) e jatos extratropicais intensos.'
        },
        {
            id: '94767',
            icao: 'YSSY',
            name: 'Sydney / Mascot',
            state: 'NSW',
            region: 'Oceania',
            country: 'Austrália',
            lat: -33.95,
            lon: 151.18,
            elev: 6,
            badge: 'Oceania',
            desc: 'Costa Leste Australiana.'
        },
        {
            id: '85586',
            icao: 'SCEL',
            name: 'Santiago / Pudahuel',
            state: '',
            region: 'Andes Centrais',
            country: 'Chile',
            lat: -33.38,
            lon: -70.79,
            elev: 474,
            badge: 'Andes / Pacífico',
            desc: 'Vale Central do Chile, bloqueios anticiclônicos e rios atmosféricos pacíficos.'
        }
    ]
};

// Obter todas as estações em lista única
function getAllStations() {
    const list = [];
    for (const group in STATIONS_CATALOG) {
        list.push(...STATIONS_CATALOG[group]);
    }
    return list;
}

// Buscar estação por ID WMO, código OACI ou texto
function findStation(query) {
    if (!query) return null;
    const q = String(query).trim().toUpperCase();
    const all = getAllStations();
    
    // 1. Busca exata por ID WMO, ICAO ou aliases
    const exact = all.find(s => 
        s.id === q || 
        s.icao === q || 
        (s.aliases && s.aliases.some(a => a.toUpperCase() === q))
    );
    if (exact) return exact;

    // 2. Busca parcial por nome ou estado
    return all.find(s => 
        s.name.toUpperCase().includes(q) || 
        (s.state && s.state.toUpperCase() === q) ||
        s.country.toUpperCase().includes(q)
    ) || null;
}

// Retorna o ID WMO correto para consulta na Universidade de Wyoming
function getWyomingStationId(query) {
    const stn = findStation(query);
    if (stn) {
        return stn.id;
    }
    const q = String(query).trim().toUpperCase();
    // Mapeamentos diretos conhecidos
    if (q === 'SBFL' || q === '83838') return '83899';
    if (q === 'SBPA') return '83971';
    if (q === 'SBCT') return '83840';
    if (q === 'SBSM') return '83936';
    if (q === 'SBFI') return '83827';
    if (q === 'SBMT') return '83779';
    if (q === 'SBGL') return '83746';
    return q;
}
