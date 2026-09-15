import urllib.request
import urllib.parse
import re
import json
import os

def parse_wyoming_html(html_text, station_id, station_name, timestamp):
    pre = re.search(r'<PRE>(.*?)</PRE>', html_text, re.DOTALL | re.IGNORECASE)
    if not pre:
        return None
    lines = [l.strip() for l in pre.group(1).splitlines() if l.strip()]
    header_idx = -1
    for i, line in enumerate(lines):
        if 'PRES' in line and 'HGHT' in line:
            header_idx = i
            break
    if header_idx == -1 or header_idx + 2 >= len(lines):
        return None
    
    levels = []
    for line in lines[header_idx + 2:]:
        parts = line.split()
        if len(parts) >= 11:
            try:
                p = float(parts[0])
                z = float(parts[1])
                t = float(parts[2])
                td = float(parts[3])
                rh = float(parts[4])
                mr = float(parts[5])
                wd = float(parts[6])
                ws = float(parts[7]) # m/s
                thta = float(parts[8]) if len(parts) > 8 else None
                thte = float(parts[9]) if len(parts) > 9 else None
                levels.append({
                    'pres': p,
                    'hght': z,
                    'temp': t,
                    'dwpt': td,
                    'relh': rh,
                    'mixr': mr,
                    'drct': wd,
                    'sped': ws,
                    'sped_kt': round(ws * 1.94384, 1),
                    'thta': thta,
                    'thte': thte
                })
            except ValueError:
                continue

    indices = {}
    tables = re.findall(r'<TABLE.*?>.*?</TABLE>', html_text, re.DOTALL | re.IGNORECASE)
    if len(tables) > 1:
        rows = re.findall(r'<TR>(.*?)</TR>', tables[1], re.DOTALL | re.IGNORECASE)
        for r in rows:
            cells = [re.sub(r'<.*?>', '', c).strip() for c in re.findall(r'<TD.*?>(.*?)</TD>', r, re.DOTALL | re.IGNORECASE)]
            if len(cells) >= 3:
                key = cells[0].strip()
                val = cells[2].strip()
                try:
                    val_num = float(val)
                except ValueError:
                    val_num = val
                indices[key] = {
                    'description': cells[1].strip(),
                    'value': val_num,
                    'unit': cells[3].strip() if len(cells) > 3 else ''
                }

    lat = indices.get('SLAT', {}).get('value', None)
    lon = indices.get('SLON', {}).get('value', None)
    elev = indices.get('SELV', {}).get('value', None)

    return {
        'station_id': str(station_id),
        'station_name': station_name,
        'timestamp': timestamp,
        'latitude': lat,
        'longitude': lon,
        'elevation': elev,
        'levels_count': len(levels),
        'levels': levels,
        'indices': indices
    }

def fetch_and_save(stn_id, name, dt_str, filename):
    params = {'datetime': dt_str, 'id': str(stn_id), 'type': 'TEXT:LIST'}
    url = 'http://weather.uwyo.edu/wsgi/sounding?' + urllib.parse.urlencode(params)
    print(f"Fetching {name} ({stn_id}) at {dt_str}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            txt = r.read().decode('utf-8', errors='ignore')
            if 'PRES' in txt:
                with open(f'data/samples/{filename}.html', 'w', encoding='utf-8') as hf:
                    hf.write(txt)
                data = parse_wyoming_html(txt, stn_id, name, dt_str)
                if data:
                    with open(f'data/samples/{filename}.json', 'w', encoding='utf-8') as jf:
                        json.dump(data, jf, indent=2, ensure_ascii=False)
                    print(f"  -> SUCCESS: {filename}.json ({len(data['levels'])} levels)")
                    return True
            else:
                print(f"  -> NO DATA: No sounding profile found")
    except Exception as e:
        print(f"  -> ERROR: {e}")
    return False

if __name__ == '__main__':
    os.makedirs('data/samples', exist_ok=True)
    
    # Process existing HTMLs
    existing = [
        ('83971', 'Porto Alegre - RS (SBPA)', '2024-05-01 12:00:00', '83971_20240501_12Z_PortoAlegre'),
        ('83840', 'Curitiba - PR (SBCT)', '2024-05-02 12:00:00', '83840_20240502_12Z_Curitiba')
    ]
    for stn_id, name, dt, fname in existing:
        hpath = f'data/samples/{fname}.html'
        if os.path.exists(hpath):
            with open(hpath, 'r', encoding='utf-8') as f:
                d = parse_wyoming_html(f.read(), stn_id, name, dt)
                if d:
                    with open(f'data/samples/{fname}.json', 'w', encoding='utf-8') as jf:
                        json.dump(d, jf, indent=2, ensure_ascii=False)
                    print(f"Converted existing {fname}.json ({len(d['levels'])} levels)")

    # Fetch regional and benchmark soundings
    targets = [
        ('87576', 'Ezeiza / Buenos Aires - Argentina', '2024-05-01 12:00:00', '87576_20240501_12Z_BuenosAires'),
        ('86580', 'Montevidéu / Carrasco - Uruguai', '2024-05-01 12:00:00', '86580_20240501_12Z_Montevideo'),
        ('83746', 'Rio de Janeiro / Galeão - RJ (SBGL)', '2024-05-01 12:00:00', '83746_20240501_12Z_RioGaleao'),
        ('83362', 'Brasília - DF (SBBR)', '2024-05-01 12:00:00', '83362_20240501_12Z_Brasilia')
    ]
    for stn_id, name, dt, fname in targets:
        fetch_and_save(stn_id, name, dt, fname)
