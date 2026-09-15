# 🎈 Visualizador Interativo de Radiossondagens

Interface moderna, interativa e profissional para visualização e análise de **radiossondagens atmosféricas (upper-air soundings)** com **foco prioritário no Sul do Brasil** (Rio Grande do Sul, Santa Catarina e Paraná) e suporte a estações de todo o **Brasil, Bacia do Prata e Mundo**.

Permite renderização em alta precisão do diagrama termodinâmico **Skew-T ln-P**, **Hodógrafo de ventos e cisalhamento**, cálculo automatizado de trajetória de parcelas e uma **lista categorizada e completa de parâmetros meteorológicos**.

---

## 🚀 Principais Funcionalidades

### 1. 📍 Foco Especial no Sul do Brasil
- **Botões de Acesso Rápido de 1 Clique**:
  - **Porto Alegre / Salgado Filho (RS)** - `SBPA` (83971)
  - **Santa Maria / Base Aérea (RS)** - `SBSM` (83936)
  - **Curitiba / Afonso Pena (PR)** - `SBCT` (83840)
  - **Foz do Iguaçu / Cataratas (PR)** - `SBFI` (83827)
  - **Passo Fundo (RS)** - `SBPF` (83897)
  - **Uruguaiana (RS)** - `SBUG` (83980)
  - **Pelotas (RS)** - `SBPK` (83997)
  - **Florianópolis / Hercílio Luz (SC)** - `SBFL` (83838)
- **Estações do Cone Sul & Bacia do Prata (Monitoramento do Jato em Baixos Níveis - JBN)**:
  - Resistencia (Argentina - `SARF` 87155)
  - Ezeiza / Buenos Aires (Argentina - `SAEZ` 87576)
  - Montevidéu / Carrasco (Uruguai - `SUMU` 86580)
  - Assunção / Silvio Pettirossi (Paraguai - `SGAS` 86218)
  - Córdoba (Argentina - `SACO` 87344)
- **Cobertura Nacional e Mundial**:
  - Capitais do Brasil (São Paulo, Galeão/RJ, Brasília, Cuiabá, Belém, Manaus, Fortaleza, etc.)
  - Estações de referência mundial (EUA - Norman/OK, Europa, Ásia, Oceania)
  - Campo de busca livre por código WMO de 5 dígitos ou código OACI (ICAO).

---

### 2. 📈 Diagrama Termodinâmico Skew-T ln-P Interativo
- **Escala Logarítmica de Pressão**: 1050 hPa a 100 hPa.
- **Linhas Isotérmicas Inclinadas a 45°**: de -40°C a +40°C com destaque em ciano na isoterma de **0°C**.
- **Isóbaras**: Linhas horizontais nos níveis padrão (1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100 hPa).
- **Curvas Adiabáticas**:
  - Adiabáticas secas (curvas $\theta$ em âmbar).
  - Pseudo-adiabáticas úmidas (curvas saturadas $\theta_e$ em verde esmeralda).
  - Linhas de razão de mistura saturada ($w_s$ em g/kg).
- **Perfis Atmosféricos**:
  - Curva de Temperatura ($T$, vermelho).
  - Curva do Ponto de Orvalho ($T_d$, verde).
  - Trajetória da Parcela Ascendente ($T_{parcel}$, tracejado dourado).
  - **Sombreamento de CAPE** (área positiva em vermelho/laranja) e **CIN** (área negativa em azul).
  - Marcadores dos níveis críticos (**LCL**, **LFC**, **EL**, **0°C Freezing Level**, **-20°C Dendritic Zone**).
- **Coluna de Barbelas de Vento (Wind Barbs)**:
  - Barbelas padronizadas em nós (kt) na lateral direita correspondentes aos níveis verticais.
- **Cursor Interativo (Crosshair)**:
  - Exibe valores exatos de Pressão, Altitude, $T$, $T_d$, Umidade Relativa, Direção e Velocidade do Vento ao passar o mouse.

---

### 3. 🧭 Hodógrafo de Ventos & Dinâmica
- Diagrama polar de cisalhamento do vento de 0 a 12 km de altitude.
- Cores padronizadas por camadas (convenção internacional SPC):
  - **0 - 1 km**: Rosa choque (`#ec4899`)
  - **1 - 3 km**: Vermelho (`#ef4444`)
  - **3 - 6 km**: Verde esmeralda (`#10b981`)
  - **6 - 9 km**: Âmbar (`#f59e0b`)
  - **> 9 km**: Ciano (`#06b6d4`)
- Vetores de Movimento de Tempestade de Bunkers:
  - **MW**: Vento Médio 0-6 km.
  - **RM**: Right-Mover.
  - **LM**: Left-Mover (*supercélulas ciclônicas no Hemisfério Sul desviam para a esquerda do vento médio*).
- Cálculo visual de **Helicidade Relativa à Tempestade (SRH)**.

---

### 4. 📋 Lista Organizada de Parâmetros Meteorológicos

Os parâmetros são organizados em 4 painéis com **badges de severidade e cores indicativas**:

#### ⚡ 1. Instabilidade Convectiva
- **CAPE**: Energia Potencial Convectiva Disponível (J/kg) calculada para parcelas:
  - *Superfície (SBCAPE)*
  - *Camada Misturada 100 hPa (MLCAPE)*
  - *Mais Instável 300 hPa (MUCAPE)*
- **CIN**: Inibição Convectiva (J/kg)
- **Lifted Index (LI)**: Índice de Levantamento a 500 hPa (°C)
- **Showalter Index (SI)**: Estabilidade entre 850 e 500 hPa (°C)
- **K-Index (KI)**: Potencial para tempestades convectivas e chuvas volumosas (°C)
- **Total Totals (TT)**: Gradiente e umidade vertical (com VT e CT) (°C)
- **SWEAT Index**: Índice de Ameaça de Tempo Severo

#### 📏 2. Níveis Críticos da Atmosfera
- **Pressão de Superfície (P_sfc)** (hPa e metros)
- **LCL**: Nível de Condensação por Levantamento (hPa e metros AGL)
- **LFC**: Nível de Convecção Livre (hPa e metros AGL)
- **EL**: Nível de Equilíbrio / Topo da Convecção (hPa e metros MSL)
- **Nível de 0°C (Freezing Level)**: Altura da isoterma de congelamento
- **Nível de -20°C**: Zona de crescimento dendrítico e eletrificação de nuvens (granizo)

#### 🌪️ 3. Cisalhamento do Vento & Dinâmica (Kinematic)
- **Cisalhamento 0-6 km (Deep Layer Shear)**: em nós (kt) e m/s
- **Cisalhamento 0-1 km (Low-Level Shear)**: em nós (kt) e m/s
- **Cisalhamento 0-3 km**: em nós (kt) e m/s
- **SRH 0-1 km**: Helicidade Relativa à Tempestade ($m^2/s^2$)
- **SRH 0-3 km**: Helicidade Relativa à Tempestade ($m^2/s^2$)
- **Movimento Bunkers**: Direção e velocidade para tempestades LM e RM

#### 💧 4. Umidade Atmosférica & Índices Compostos
- **Água Precipitável (PWAT)**: Total de vapor d'água na coluna em mm (alerta de chuvas torrenciais &gt; 40 mm)
- **Razão de Mistura na Superfície ($w$)**: em g/kg
- **Depressão do Ponto de Orvalho ($T - T_d$)**: na superfície e 850 hPa
- **STP (Significant Tornado Parameter)**: Parâmetro composto de tempo severo
- **EHI (Energy-Helicity Index 0-1km)**: Índice composto energia-helicidade

---

### 5. 📂 Casos Históricos Pré-Carregados (Funciona Offline!)
A aplicação inclui amostras de dados reais arquivadas para visualização imediata:
- **Porto Alegre (RS) - Maio/2024**: Sondagem do evento extremo das enchentes históricas do Rio Grande do Sul (PWAT &gt; 45 mm, forte jato em baixos níveis).
- **Porto Alegre (RS) - Janeiro/2024**: Caso de alta instabilidade convectiva de verão no RS.
- **Curitiba (PR) - Maio/2024**: Perfil subtropical paranaense com cisalhamento acentuado.
- **Rio de Janeiro / Galeão (RJ) - Maio/2024**: Perfil litorâneo do Sudeste.
- **Norman / Oklahoma (EUA)**: Benchmark mundial de supercélula severa em alta resolução.

---

## 🛠️ Como Executar

### Opção 1: Rodando com o Servidor Local Python (Recomendado)
O projeto inclui um servidor leve nativo (`app.py`) que roda com a biblioteca padrão do Python (sem necessidade de instalar pacotes adicionais) e atua como proxy para contornar restrições de CORS ao buscar dados ao vivo da Universidade de Wyoming:

```bash
# Entrar na pasta do projeto
cd C:\Users\haas\github\sondagens

# Iniciar o servidor (porta 8080)
python app.py
```
O navegador abrirá automaticamente em `http://localhost:8080`.

### Opção 2: Abrindo Diretamente no Navegador (ou GitHub Pages)
Como a interface foi desenvolvida em HTML5, CSS3 e JavaScript modular padrão, você pode abrir diretamente o arquivo `index.html` em qualquer navegador ou publicá-la no **GitHub Pages**!
No modo estático, a aplicação:
- Utiliza os casos locais em `data/samples/`;
- Utiliza proxies CORS públicos para requisições ao vivo;
- Permite arrastar e soltar arquivos próprios de radiossondagem (`.txt`, `.csv`, `.json`).

---

## 📁 Estrutura do Repositório

```
sondagens/
├── index.html                  # Interface principal completa (Single-Page App)
├── app.py                      # Servidor Python com Proxy de API local
├── requirements.txt            # Dependências opcionais
├── README.md                   # Documentação detalhada
├── .gitignore                  # Arquivos ignorados pelo Git
├── assets/
│   ├── css/
│   │   └── style.css           # Estilos meteorológicos profissionais dark mode
│   └── js/
│       ├── app.js              # Controlador principal da UI e eventos
│       ├── stations.js         # Catálogo de estações (foco Sul do Brasil)
│       ├── thermo.js           # Motor de física atmosférica e cálculos termodinâmicos
│       ├── skewt.js            # Renderizador do Skew-T ln-P em Canvas HiDPI
│       ├── hodograph.js        # Renderizador do Hodógrafo polar
│       └── data-parser.js      # Parser universal (Wyoming HTML/Text, CSV, JSON)
├── data/
│   └── samples/                # Sondagens reais pré-carregadas (Porto Alegre, Curitiba, etc.)
└── scripts/
    └── build_samples.py        # Script utilitário para download e conversão de amostras
```

---

## 🌐 Publicação no GitHub Pages
Para habilitar o acesso online público gratuito pelo GitHub Pages:
1. Acesse o repositório em `https://github.com/reinaldohaas/sondagens`
2. Vá em **Settings** > **Pages**
3. Em **Branch**, selecione `main` e pasta `/(root)`
4. Clique em **Save**
5. O aplicativo estará disponível em: `https://reinaldohaas.github.io/sondagens/`

---

## 📊 Fontes de Dados
- **University of Wyoming - Department of Atmospheric Science**: Banco global de dados de radiossondagem atmosférica (`weather.uwyo.edu`).
- **INMET / DECEA / REDEMET**: Rede de estações meteorológicas de altitude do Brasil.
- Fórmulas termodinâmicas baseadas em Bolton (1980), MetPy e manuais da Organização Meteorológica Mundial (WMO).
