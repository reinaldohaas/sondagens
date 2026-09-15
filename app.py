#!/usr/bin/env python3
"""
app.py - Servidor Web e API Proxy Local de Radiossondagens
Permite rodar a interface localmente sem problemas de CORS, fazendo requisições
diretas aos servidores da Universidade de Wyoming e servindo os arquivos estáticos.

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
from datetime import datetime

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class SoundingRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # Rota de API: /api/sounding?id=83971&datetime=2024-05-01 12:00:00
        if parsed.path == '/api/sounding':
            self.handle_api_sounding(parsed.query)
            return

        # Arquivos estáticos normais
        return super().do_GET()

    def handle_api_sounding(self, query_str):
        qs = urllib.parse.parse_qs(query_str)
        stn_id = qs.get('id', ['83971'])[0]
        dt_val = qs.get('datetime', [''])[0]

        if not dt_val:
            # Padrão: 12Z de ontem ou hoje
            dt_val = datetime.utcnow().strftime('%Y-%m-%d 12:00:00')

        # Formata para URL da Universidade de Wyoming
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
            with urllib.request.urlopen(req, timeout=15) as resp:
                content = resp.read()
                
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'public, max-age=3600')
                self.end_headers()
                self.wfile.write(content)
                print(f"  -> Sucesso: {len(content)} bytes retornados.")

        except urllib.error.HTTPError as e:
            print(f"  -> Erro HTTP {e.code}: {e.reason}")
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            err_body = json.dumps({'error': f'HTTP Error {e.code}: {e.reason}', 'station': stn_id, 'datetime': dt_val})
            self.wfile.write(err_body.encode('utf-8'))

        except Exception as e:
            print(f"  -> Erro na requisição: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            err_body = json.dumps({'error': str(e), 'station': stn_id, 'datetime': dt_val})
            self.wfile.write(err_body.encode('utf-8'))

def run_server():
    os.chdir(BASE_DIR)
    
    # Permite reutilizar a porta imediatamente se fechada recentemente
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
        
        # Abre o navegador automaticamente
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
