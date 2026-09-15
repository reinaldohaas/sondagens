#!/usr/bin/env python3
"""
app.py - Servidor Web e API de Radiossondagens
Prioriza a sondagem real da Universidade de Wyoming (com suporte a BUFR),
salva automaticamente todas as sondagens baixadas em cache local (data/downloads/),
sempre verifica se a sondagem já está baixada antes de fazer nova requisição,
e expõe rota para listar e gerenciar todos os arquivos baixados.

Execução:
    python app.py [porta] (padrão: 8080)
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import re
import sys
import webbrowser
from datetime import datetime, timezone

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(BASE_DIR, 'data', 'downloads')
INDEX_FILE = os.path.join(DOWNLOADS_DIR, 'index.json')

# Garante a existência do diretório de downloads
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Mapeamento de apelidos e estações conhecidas para Wyoming
STATION_MAPPING = {
    'SBFL': {'id': '83899', 'name': 'Florianópolis / Hercílio Luz (SC)'},
    '83838': {'id': '83899', 'name': 'Florianópolis / Hercílio Luz (SC)'},
    '83899': {'id': '83899', 'name': 'Florianópolis / Hercílio Luz (SC)'},
    'SBPA': {'id': '83971', 'name': 'Porto Alegre / Salgado Filho (RS)'},
    '83971': {'id': '83971', 'name': 'Porto Alegre / Salgado Filho (RS)'},
    'SBCT': {'id': '83840', 'name': 'Curitiba / Afonso Pena (PR)'},
    '83840': {'id': '83840', 'name': 'Curitiba / Afonso Pena (PR)'},
    'SBSM': {'id': '83936', 'name': 'Santa Maria (RS)'},
    '83936': {'id': '83936', 'name': 'Santa Maria (RS)'},
    'SBFI': {'id': '83827', 'name': 'Foz do Iguaçu (PR)'},
    '83827': {'id': '83827', 'name': 'Foz do Iguaçu (PR)'},
    'SBMT': {'id': '83779', 'name': 'São Paulo / Campo de Marte (SP)'},
    '83779': {'id': '83779', 'name': 'São Paulo / Campo de Marte (SP)'},
    'SBGL': {'id': '83746', 'name': 'Rio de Janeiro / Galeão (RJ)'},
    '83746': {'id': '83746', 'name': 'Rio de Janeiro / Galeão (RJ)'}
}

def get_downloads_index():
    items = []
    if os.path.exists(INDEX_FILE):
        try:
            with open(INDEX_FILE, 'r', encoding='utf-8') as f:
                items = json.load(f)
        except Exception:
            items = []
    
    # Auto-indexa arquivos físicos presentes em data/downloads/
    indexed_filenames = {it.get('filename') for it in items}
    modified = False
    for fname in os.listdir(DOWNLOADS_DIR):
        if fname.endswith('.html') and fname not in indexed_filenames:
            fpath = os.path.join(DOWNLOADS_DIR, fname)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    content = f.read()
                parts = fname.replace('.html', '').split('_')
                stn_id = parts[0] if len(parts) > 0 else '83899'
                date_raw = parts[1] if len(parts) > 1 else '20260915'
                date_fmt = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}" if len(date_raw) == 8 else date_raw
                hour_raw = parts[2].replace('Z', '') if len(parts) > 2 else '12'
                stn_name = STATION_MAPPING.get(stn_id, {}).get('name', f"Estação {stn_id}")
                source_label = ' '.join(parts[4:]) if len(parts) > 4 else 'Wyoming BUFR'

                # Extrai quantidade de níveis da sondagem
                levels_count = 0
                pre_match = re.search(r'<PRE>(.*?)</PRE>', content, re.DOTALL | re.IGNORECASE)
                if pre_match:
                    lines = [l.strip() for l in pre_match.group(1).splitlines() if l.strip()]
                    header_idx = -1
                    for i, l in enumerate(lines):
                        if 'PRES' in l and 'HGHT' in l:
                            header_idx = i
                            break
                    if header_idx != -1:
                        for l in lines[header_idx + 1:]:
                            if '---' in l or 'hPa' in l or 'PRES' in l:
                                continue
                            if l.startswith('<') or not (l[0].isdigit() or l.startswith('-')):
                                break
                            levels_count += 1

                file_size_kb = round(os.path.getsize(fpath) / 1024, 1)
                dt_str = f"{date_fmt} {hour_raw}:00:00"
                record = {
                    'id': f"{stn_id}_{date_fmt.replace('-', '')}_{hour_raw}",
                    'station_id': str(stn_id),
                    'station_name': stn_name,
                    'datetime': dt_str,
                    'date': date_fmt,
                    'hour': hour_raw,
                    'source': f"🎈 {source_label}",
                    'filename': fname,
                    'filesize_kb': file_size_kb,
                    'levels_count': levels_count,
                    'downloaded_at': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
                }
                items.insert(0, record)
                modified = True
            except Exception as ex:
                print(f"Erro auto-indexando {fname}: {ex}")

    if modified:
        save_downloads_index(items)

    return items

def save_downloads_index(items):
    try:
        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Aviso] Falha ao salvar índice de downloads: {e}")

def register_downloaded_file(station_id, station_name, dt_str, source, filename, file_path, content):
    index = get_downloads_index()
    
    # Extrai quantidade de níveis da sondagem
    levels_count = 0
    pre_match = re.search(r'<PRE>(.*?)</PRE>', content, re.DOTALL | re.IGNORECASE)
    if pre_match:
        lines = [l.strip() for l in pre_match.group(1).splitlines() if l.strip()]
        header_idx = -1
        for i, l in enumerate(lines):
            if 'PRES' in l and 'HGHT' in l:
                header_idx = i
                break
        if header_idx != -1:
            for l in lines[header_idx + 1:]:
                if '---' in l or 'hPa' in l or 'PRES' in l:
                    continue
                if l.startswith('<') or not (l[0].isdigit() or l.startswith('-')):
                    break
                levels_count += 1

    file_size_kb = round(os.path.getsize(file_path) / 1024, 1)

    record = {
        'id': f"{station_id}_{dt_str.replace(' ', '_').replace(':', '')}",
        'station_id': str(station_id),
        'station_name': station_name,
        'datetime': dt_str,
        'date': dt_str.split()[0],
        'hour': dt_str.split()[1].split(':')[0] if len(dt_str.split()) > 1 else '12',
        'source': source,
        'filename': filename,
        'filesize_kb': file_size_kb,
        'levels_count': levels_count,
        'downloaded_at': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    }

    # Atualiza ou adiciona
    index = [item for item in index if item['id'] != record['id']]
    index.insert(0, record)
    save_downloads_index(index)
    return record

class SoundingRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 1. Rota de API: /api/sounding?id=...&datetime=...
        if parsed.path == '/api/sounding':
            self.handle_api_sounding(parsed.query)
            return

        # 2. Rota de API: /api/downloads (lista arquivos baixados)
        if parsed.path == '/api/downloads':
            self.handle_api_downloads()
            return

        # 3. Rota de API: /api/downloads/file?name=... (retorna conteúdo do arquivo baixado)
        if parsed.path == '/api/downloads/file':
            self.handle_api_download_file(parsed.query)
            return

        # Arquivos estáticos normais
        return super().do_GET()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/downloads':
            self.handle_delete_download(parsed.query)
            return
        self.send_response(404)
        self.end_headers()

    def handle_api_downloads(self):
        """Retorna lista de todos os arquivos baixados com metadados"""
        index = get_downloads_index()
        # Valida se os arquivos físicos existem no disco
        valid_items = []
        for item in index:
            fpath = os.path.join(DOWNLOADS_DIR, item['filename'])
            if os.path.exists(fpath):
                valid_items.append(item)
        if len(valid_items) != len(index):
            save_downloads_index(valid_items)

        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(valid_items, ensure_ascii=False).encode('utf-8'))

    def handle_delete_download(self, query_str):
        qs = urllib.parse.parse_qs(query_str)
        fname = qs.get('file', [''])[0]
        if not fname:
            self.send_response(400)
            self.end_headers()
            return

        fpath = os.path.join(DOWNLOADS_DIR, os.path.basename(fname))
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
            except Exception as e:
                print(f"Erro ao deletar {fpath}: {e}")

        index = [item for item in get_downloads_index() if item['filename'] != fname]
        save_downloads_index(index)

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'deleted': fname}).encode('utf-8'))

    def handle_api_download_file(self, query_str):
        qs = urllib.parse.parse_qs(query_str)
        fname = qs.get('name', [''])[0]
        fpath = os.path.join(DOWNLOADS_DIR, os.path.basename(fname))
        if os.path.exists(fpath):
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="{fname}"')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def handle_api_sounding(self, query_str):
        qs = urllib.parse.parse_qs(query_str)
        raw_id = qs.get('id', ['83899'])[0].strip().upper()
        dt_val = qs.get('datetime', [''])[0].strip()

        if not dt_val:
            dt_val = datetime.now(timezone.utc).strftime('%Y-%m-%d 12:00:00')

        # Normaliza o ID da estação para Wyoming
        stn_info = STATION_MAPPING.get(raw_id, {'id': raw_id, 'name': f'Estação {raw_id}'})
        stn_id = stn_info['id']
        stn_name = stn_info['name']

        # Extrai data e hora limpos para nomeação de cache
        date_clean = dt_val.split()[0].replace('-', '')
        hour_clean = dt_val.split()[1].split(':')[0] if len(dt_val.split()) > 1 else '12'

        # -------------------------------------------------------------
        # PASSO 1: SEMPRE VERIFICAR SE JÁ ESTÁ BAIXADA NO DISCO LOCAL
        # -------------------------------------------------------------
        cache_pattern = f"{stn_id}_{date_clean}_{hour_clean}Z"
        for fname in os.listdir(DOWNLOADS_DIR):
            if fname.startswith(cache_pattern) and fname.endswith('.html'):
                cached_path = os.path.join(DOWNLOADS_DIR, fname)
                try:
                    with open(cached_path, 'r', encoding='utf-8') as cf:
                        cached_content = cf.read()
                    if 'PRES' in cached_content:
                        print(f"⚡ [CACHE HIT] Sondagem {stn_id} ({dt_val}) carregada do arquivo local: {fname}")
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/html; charset=utf-8')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('X-Sounding-Cache', 'HIT')
                        self.send_header('X-Sounding-File', fname)
                        self.end_headers()
                        self.wfile.write(cached_content.encode('utf-8'))
                        return
                except Exception as e:
                    print(f"[Aviso] Erro ao ler cache {cached_path}: {e}")

        # -------------------------------------------------------------
        # PASSO 2: PRIORIZAR A SONDAGEM REAL DA UNIV. OF WYOMING
        # -------------------------------------------------------------
        print(f"🌐 [WYOMING] Buscando sondagem REAL para {stn_id} ({stn_name}) em {dt_val}...")
        
        # 2A. Tenta primeiro com src=BUFR (alta resolução moderna)
        bufr_params = {'datetime': dt_val, 'id': str(stn_id), 'src': 'BUFR', 'type': 'TEXT:LIST'}
        bufr_url = 'https://weather.uwyo.edu/wsgi/sounding?' + urllib.parse.urlencode(bufr_params)
        
        wyoming_content = None
        source_tag = 'Wyoming_Real_BUFR'

        try:
            req = urllib.request.Request(bufr_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=25) as resp:
                txt = resp.read().decode('utf-8', errors='ignore')
                if 'PRES' in txt:
                    wyoming_content = txt
                    print(f"  -> SUCESSO Wyoming BUFR: {len(txt)} bytes recebidos!")
        except Exception as e:
            print(f"  -> BUFR indisponível ou 400 ({e}). Tentando Wyoming TEMP tradicional...")

        # 2B. Se falhar no BUFR, tenta sem src=BUFR (mensagem TEMP tradicional alfanumérica)
        if not wyoming_content:
            trad_params = {'datetime': dt_val, 'id': str(stn_id), 'type': 'TEXT:LIST'}
            trad_url = 'https://weather.uwyo.edu/wsgi/sounding?' + urllib.parse.urlencode(trad_params)
            try:
                req = urllib.request.Request(trad_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    txt = resp.read().decode('utf-8', errors='ignore')
                    if 'PRES' in txt:
                        wyoming_content = txt
                        source_tag = 'Wyoming_Real_TEMP'
                        print(f"  -> SUCESSO Wyoming TEMP Tradicional: {len(txt)} bytes recebidos!")
            except Exception as e:
                print(f"  -> Wyoming Tradicional sem dados ({e}).")

        # Se encontrou na Wyoming: SALVA LOCALMENTE E RETORNA!
        if wyoming_content:
            clean_name = re.sub(r'[^a-zA-Z0-9]', '', stn_name.split('/')[0])
            save_fname = f"{stn_id}_{date_clean}_{hour_clean}Z_{clean_name}_{source_tag}.html"
            save_path = os.path.join(DOWNLOADS_DIR, save_fname)
            try:
                with open(save_path, 'w', encoding='utf-8') as f:
                    f.write(wyoming_content)
                register_downloaded_file(stn_id, stn_name, dt_val, f"🎈 {source_tag.replace('_', ' ')}", save_fname, save_path, wyoming_content)
                print(f"💾 [SALVO] Arquivo gravado em cache: {save_fname}")
            except Exception as err:
                print(f"[Aviso] Falha ao salvar arquivo local: {err}")

            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('X-Sounding-Cache', 'MISS')
            self.send_header('X-Sounding-Source', source_tag)
            self.end_headers()
            self.wfile.write(wyoming_content.encode('utf-8'))
            return

        # -------------------------------------------------------------
        # PASSO 3: FALLBACK MODELO GFS (SE A SONDAGEM REAL NÃO EXISTIR)
        # -------------------------------------------------------------
        print(f"⚠️ [MODELO] Sem sondagem física na Wyoming. Gerando perfil vertical GFS Open-Meteo...")
        self.fetch_and_save_openmeteo(stn_id, stn_name, dt_val, date_clean, hour_clean)

    def fetch_and_save_openmeteo(self, stn_id, stn_name, dt_val, date_clean, hour_clean):
        coords = {'lat': -27.667, 'lon': -48.541} # Padrão Florianópolis
        if stn_id in ['83971', 'SBPA']: coords = {'lat': -30.00, 'lon': -51.18}
        elif stn_id in ['83840', 'SBCT']: coords = {'lat': -25.53, 'lon': -49.17}
        elif stn_id in ['83936', 'SBSM']: coords = {'lat': -29.70, 'lon': -53.70}
        elif stn_id in ['83779', 'SBMT']: coords = {'lat': -23.51, 'lon': -46.63}

        date_part = dt_val.split()[0]
        hour_part = hour_clean

        levels = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50]
        vars = []
        for p in levels:
            vars.extend([f'temperature_{p}hPa', f'dew_point_{p}hPa', f'relative_humidity_{p}hPa', f'wind_speed_{p}hPa', f'wind_direction_{p}hPa', f'geopotential_height_{p}hPa'])

        req_dt = datetime.strptime(date_part, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        days_ago = (datetime.now(timezone.utc) - req_dt).days
        endpoint = 'https://archive-api.open-meteo.com/v1/archive' if days_ago >= 4 else 'https://api.open-meteo.com/v1/forecast'

        query = {
            'latitude': coords['lat'],
            'longitude': coords['lon'],
            'start_date': date_part,
            'end_date': date_part,
            'models': 'gfs_seamless',
            'hourly': ','.join(vars)
        }
        om_url = f"{endpoint}?{urllib.parse.urlencode(query)}"

        try:
            req = urllib.request.Request(om_url, headers={'User-Agent': 'Mozilla/5.0'})
            resp_bytes = None
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    resp_bytes = resp.read()
            except Exception as e_first:
                # Se falhou, tenta o endpoint alternativo (ex: Archive vs Forecast)
                alt_endpoint = 'https://api.open-meteo.com/v1/forecast' if 'archive' in endpoint else 'https://archive-api.open-meteo.com/v1/archive'
                alt_url = f"{alt_endpoint}?{urllib.parse.urlencode(query)}"
                req_alt = urllib.request.Request(alt_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req_alt, timeout=15) as resp_alt:
                    resp_bytes = resp_alt.read()

            data = json.loads(resp_bytes.decode('utf-8'))
                
                times = data['hourly']['time']
                target_iso = f"{date_part}T{hour_part}:00"
                idx = times.index(target_iso) if target_iso in times else (12 if len(times) > 12 else 0)

                lines = [
                    "-----------------------------------------------------------------------------",
                    "   PRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SPED   THTA   THTE   THTV",
                    "    hPa      m      C      C      %   g/kg    deg    m/s      K      K      K ",
                    "-----------------------------------------------------------------------------"
                ]

                for p in levels:
                    t = data['hourly'].get(f'temperature_{p}hPa', [None])[idx]
                    td = data['hourly'].get(f'dew_point_{p}hPa', [None])[idx]
                    z = data['hourly'].get(f'geopotential_height_{p}hPa', [None])[idx]
                    rh = data['hourly'].get(f'relative_humidity_{p}hPa', [None])[idx]
                    ws = data['hourly'].get(f'wind_speed_{p}hPa', [None])[idx]
                    wd = data['hourly'].get(f'wind_direction_{p}hPa', [None])[idx]

                    if t is not None:
                        z_val = int(z) if z is not None else 0
                        td_val = td if td is not None else (t - 10.0)
                        rh_val = int(rh) if rh is not None else 50
                        ws_ms = (ws / 3.6) if ws is not None else 0.0
                        wd_val = int(wd) if wd is not None else 0
                        es = 6.112 * (10 ** ((7.5 * td_val) / (237.3 + td_val)))
                        w_val = round((0.622 * es / (p - es)) * 1000.0, 2) if p > es else 0.0

                        line_str = f"{p:>7.1f} {z_val:>6d} {t:>6.1f} {td_val:>6.1f} {rh_val:>6d} {w_val:>6.2f} {wd_val:>6d} {ws_ms:>6.1f}    0.0    0.0    0.0"
                        lines.append(line_str)

                text_content = f"<!DOCTYPE html><HTML><PRE>\n" + "\n".join(lines) + f"\n</PRE>\n"
                text_content += f"<TABLE><TR><TD>SLAT</TD><TD>Lat</TD><TD>{coords['lat']}</TD></TR><TR><TD>SLON</TD><TD>Lon</TD><TD>{coords['lon']}</TD></TR></TABLE></HTML>"

                # Salva no disco
                clean_name = re.sub(r'[^a-zA-Z0-9]', '', stn_name.split('/')[0])
                save_fname = f"{stn_id}_{date_clean}_{hour_clean}Z_{clean_name}_Modelo_GFS.html"
                save_path = os.path.join(DOWNLOADS_DIR, save_fname)
                with open(save_path, 'w', encoding='utf-8') as f:
                    f.write(text_content)
                register_downloaded_file(stn_id, stn_name, dt_val, "🌐 Modelo GFS Reanálise", save_fname, save_path, text_content)
                print(f"💾 [SALVO] Perfil GFS gravado em cache: {save_fname}")

                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('X-Sounding-Cache', 'MISS')
                self.send_header('X-Sounding-Source', 'Modelo_GFS')
                self.end_headers()
                self.wfile.write(text_content.encode('utf-8'))

        except Exception as err:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(err)}).encode('utf-8'))

def run_server():
    os.chdir(BASE_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), SoundingRequestHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 70)
        print(" 🎈 Visualizador de Radiossondagens (Sul do Brasil & Mundo)")
        print("=" * 70)
        print(f" ✅ Priorizando sondagens REAIS em https://weather.uwyo.edu/ (BUFR)")
        print(f" ✅ Verificação automática de cache local (data/downloads/)")
        print(f" ✅ Servidor rodando em: {url}")
        print("=" * 70)
        
        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")

if __name__ == '__main__':
    run_server()
