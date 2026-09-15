#!/usr/bin/env python3
"""
app.py - Servidor Web e API Proxy Local de Radiossondagens
Permite rodar a interface localmente sem problemas de CORS, fazendo requisições
diretas aos servidores da Universidade de Wyoming e Open-Meteo GFS.

Execução:
    python app.py [porta] (padrão: 8080)
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys
import webbrowser
from datetime import datetime, timezone

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Coordenadas conhecidas para fallback e Open-Meteo
STATION_COORDS = {
    '83838': {'lat': -27.67, 'lon': -48.55, 'name': 'Florianópolis / Hercílio Luz (SC)'},
    'SBFL': {'lat': -27.67, 'lon': -48.55, 'name': 'Florianópolis / Hercílio Luz (SC)'},
    '83971': {'lat': -30.00, 'lon': -51.18, 'name': 'Porto Alegre (RS)'},
    'SBPA': {'lat': -30.00, 'lon': -51.18, 'name': 'Porto Alegre (RS)'},
    '83936': {'lat': -29.70, 'lon': -53.70, 'name': 'Santa Maria (RS)'},
    'SBSM': {'lat': -29.70, 'lon': -53.70, 'name': 'Santa Maria (RS)'},
    '83840': {'lat': -25.53, 'lon': -49.17, 'name': 'Curitiba (PR)'},
    'SBCT': {'lat': -25.53, 'lon': -49.17, 'name': 'Curitiba (PR)'},
    '83827': {'lat': -25.60, 'lon': -54.58, 'name': 'Foz do Iguaçu (PR)'},
    'SBFI': {'lat': -25.60, 'lon': -54.58, 'name': 'Foz do Iguaçu (PR)'},
    '83897': {'lat': -28.25, 'lon': -52.40, 'name': 'Passo Fundo (RS)'},
    '83980': {'lat': -29.78, 'lon': -57.03, 'name': 'Uruguaiana (RS)'},
    '83997': {'lat': -31.72, 'lon': -52.33, 'name': 'Pelotas (RS)'},
    '83779': {'lat': -23.51, 'lon': -46.63, 'name': 'São Paulo (SP)'},
    '83746': {'lat': -22.81, 'lon': -43.25, 'name': 'Rio de Janeiro / Galeão (RJ)'},
    '83362': {'lat': -15.87, 'lon': -47.92, 'name': 'Brasília (DF)'}
}

class SoundingRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # Rota de API de sondagem individual: /api/sounding?id=...&datetime=...
        if parsed.path == '/api/sounding':
            self.handle_api_sounding(parsed.query)
            return

        # Rota de proxy para Open-Meteo: /api/openmeteo?...
        if parsed.path == '/api/openmeteo':
            self.handle_api_openmeteo(parsed.query)
            return

        # Arquivos estáticos normais
        return super().do_GET()

    def handle_api_sounding(self, query_str):
        qs = urllib.parse.parse_qs(query_str)
        stn_id = qs.get('id', ['83971'])[0].upper()
        dt_val = qs.get('datetime', [''])[0]
        source_pref = qs.get('source', ['auto'])[0]

        if not dt_val:
            dt_val = datetime.now(timezone.utc).strftime('%Y-%m-%d 12:00:00')

        # Se for Florianópolis (SBFL / 83838), esta estação não lança balão físico no Wyoming.
        # Usa Open-Meteo GFS diretamente!
        if stn_id in ['83838', 'SBFL'] or source_pref == 'model':
            print(f"[API] Estação {stn_id} (Florianópolis / Modelo): buscando perfil via Open-Meteo GFS...")
            self.fetch_open_meteo_profile(stn_id, dt_val)
            return

        # Tenta Wyoming primeiro para estações que possuem balão operacional
        params = {
            'datetime': dt_val,
            'id': str(stn_id),
            'type': 'TEXT:LIST'
        }
        wyoming_url = 'http://weather.uwyo.edu/wsgi/sounding?' + urllib.parse.urlencode(params)
        print(f"[API] Consultando Wyoming para {stn_id} em {dt_val}...")

        try:
            req = urllib.request.Request(
                wyoming_url,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SoundingViewer/1.0'}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                content = resp.read().decode('utf-8', errors='ignore')
                
                # Se retornou perfil com sucesso
                if 'PRES' in content:
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'public, max-age=3600')
                    self.end_headers()
                    self.wfile.write(content.encode('utf-8'))
                    print(f"  -> Sucesso Wyoming: {len(content)} bytes retornados.")
                    return
                else:
                    print("  -> Wyoming respondeu sem tabela PRES. Tentando fallback Open-Meteo...")
                    self.fetch_open_meteo_profile(stn_id, dt_val)
                    return

        except Exception as e:
            print(f"  -> Wyoming indisponível ({e}). Tentando fallback Open-Meteo GFS...")
            self.fetch_open_meteo_profile(stn_id, dt_val)

    def fetch_open_meteo_profile(self, stn_id, dt_val):
        """Busca o perfil vertical da estação via Open-Meteo GFS Pressure Levels"""
        info = STATION_COORDS.get(stn_id, {'lat': -27.67, 'lon': -48.55, 'name': stn_id})
        lat = info['lat']
        lon = info['lon']

        # Converte dt_val (ex: "2024-05-01 12:00:00") para data e hora
        try:
            date_part = dt_val.split()[0]
            hour_part = dt_val.split()[1].split(':')[0]
        except Exception:
            date_part = datetime.utcnow().strftime('%Y-%m-%d')
            hour_part = '12'

        levels = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50]
        vars = []
        for p in levels:
            vars.extend([
                f'temperature_{p}hPa',
                f'dew_point_{p}hPa',
                f'relative_humidity_{p}hPa',
                f'wind_speed_{p}hPa',
                f'wind_direction_{p}hPa',
                f'geopotential_height_{p}hPa'
            ])

        # Determina endpoint (archive para datas passadas, forecast para recentes)
        req_dt = datetime.strptime(date_part, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        days_ago = (datetime.now(timezone.utc) - req_dt).days
        endpoint = 'https://archive-api.open-meteo.com/v1/archive' if days_ago >= 4 else 'https://api.open-meteo.com/v1/forecast'

        query = {
            'latitude': lat,
            'longitude': lon,
            'start_date': date_part,
            'end_date': date_part,
            'models': 'gfs_seamless',
            'hourly': ','.join(vars)
        }
        om_url = f"{endpoint}?{urllib.parse.urlencode(query)}"

        try:
            req = urllib.request.Request(om_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                
                # Monta a tabela texto padrão Wyoming para compatibilidade com o parser
                times = data['hourly']['time']
                target_iso = f"{date_part}T{hour_part}:00"
                idx = times.index(target_iso) if target_iso in times else (12 if len(times) > 12 else 0)

                lines = []
                lines.append(f"-----------------------------------------------------------------------------")
                lines.append(f"   PRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SPED   THTA   THTE   THTV")
                lines.append(f"    hPa      m      C      C      %   g/kg    deg    m/s      K      K      K ")
                lines.append(f"-----------------------------------------------------------------------------")

                for p in levels:
                    t = data['hourly'].get(f'temperature_{p}hPa', [None])[idx]
                    td = data['hourly'].get(f'dew_point_{p}hPa', [None])[idx]
                    z = data['hourly'].get(f'geopotential_height_{p}hPa', [None])[idx]
                    rh = data['hourly'].get(f'relative_humidity_{p}hPa', [None])[idx]
                    ws = data['hourly'].get(f'wind_speed_{p}hPa', [None])[idx] # km/h
                    wd = data['hourly'].get(f'wind_direction_{p}hPa', [None])[idx]

                    if t is not None:
                        z_val = int(z) if z is not None else 0
                        td_val = td if td is not None else (t - 10.0)
                        rh_val = int(rh) if rh is not None else 50
                        ws_ms = (ws / 3.6) if ws is not None else 0.0
                        wd_val = int(wd) if wd is not None else 0
                        # Razão de mistura simples
                        es = 6.112 * (10 ** ((7.5 * td_val) / (237.3 + td_val)))
                        w_val = round((0.622 * es / (p - es)) * 1000.0, 2) if p > es else 0.0

                        line_str = f"{p:>7.1f} {z_val:>6d} {t:>6.1f} {td_val:>6.1f} {rh_val:>6d} {w_val:>6.2f} {wd_val:>6d} {ws_ms:>6.1f}    0.0    0.0    0.0"
                        lines.append(line_str)

                text_content = f"<!DOCTYPE html><HTML><PRE>\n" + "\n".join(lines) + f"\n</PRE>\n"
                text_content += f"<TABLE><TR><TD>SLAT</TD><TD>Lat</TD><TD>{lat}</TD></TR><TR><TD>SLON</TD><TD>Lon</TD><TD>{lon}</TD></TR></TABLE></HTML>"

                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(text_content.encode('utf-8'))
                print(f"  -> Sucesso Open-Meteo GFS para {stn_id}: {len(lines)-4} níveis convertidos.")

        except Exception as err:
            print(f"  -> Erro no Open-Meteo: {err}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            err_body = json.dumps({'error': str(err), 'station': stn_id})
            self.wfile.write(err_body.encode('utf-8'))

    def handle_api_openmeteo(self, query_str):
        """Proxy transparente para Open-Meteo para requisições de período"""
        url = f"https://archive-api.open-meteo.com/v1/archive?{query_str}"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

def run_server():
    os.chdir(BASE_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), SoundingRequestHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 65)
        print(" 🎈 Visualizador de Radiossondagens (Sul do Brasil & Mundo)")
        print("=" * 65)
        print(f" Servidor iniciado com sucesso!")
        print(f" Acesse no navegador: {url}")
        print(" Pressione Ctrl+C para encerrar o servidor.")
        print("=" * 65)
        
        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado pelo usuário.")

if __name__ == '__main__':
    run_server()
