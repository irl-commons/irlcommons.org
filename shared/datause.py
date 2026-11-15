from __future__ import annotations
import json
import math
from pathlib import Path
MODEL_PATH = Path(__file__).resolve().parent / 'data-use.json'
MODES = ('single', 'bonded', 'redundant')

def load_model(path: Path=MODEL_PATH) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))

def data_use(m: dict, hours: float, video_mbps: float, audio_kbps: float, mode: str, links: int, loss_pct: float, record_mbps: float | None=None) -> dict:
    if mode not in MODES:
        raise ValueError(f'unknown mode {mode!r}')
    secs = hours * 3600
    n = 1 if mode == 'single' else int(links)
    copies = n if mode == 'redundant' else 1
    p = loss_pct / 100
    ts, pk, rs, ct, sl = (m['ts'], m['packet'], m['resend'], m['control'], m['srtla'])
    media = video_mbps * 1000000.0 + audio_kbps * 1000.0
    stream = media * ts['packet_bytes'] / (ts['packet_bytes'] - ts['header_bytes']) + ts['fixed_kbps'] * 1000.0
    ratio = (pk['payload_bytes'] + pk['srt_header_bytes'] + pk['udp_header_bytes'] + pk['ip_header_bytes']) / pk['payload_bytes']
    if mode == 'redundant':
        p_lost = p ** n
        resend = rs['factor'] * p_lost / (1 - p_lost)
        nak_share = p_lost
    else:
        resend = rs['factor'] * p / (1 - p) + (rs['bonded_reorder'] if mode == 'bonded' else 0)
        nak_share = p + (rs['bonded_reorder'] if mode == 'bonded' else 0)
    sent = stream * ratio * (1 + resend)
    acks_up = ct['up_kbps_per_link'] * 1000.0 * n
    acks_down = ct['ack_down_kbps_per_link'] * 1000.0 * n + ct['nak_down_share_per_loss'] * nak_share * stream * copies
    srtla_acks = 0.0
    keepalives = 0.0
    if mode == 'bonded':
        packets = stream * (1 + resend) / (pk['payload_bytes'] * 8)
        srtla_acks = packets / sl['ack_every_packets'] * sl['ack_bytes'] * 8
        keepalives = 2 * n * sl['keepalive_kbps'] * 1000.0
    parts = {'media': media * copies, 'packing': (stream - media) * copies, 'headers': stream * (ratio - 1) * copies, 'resends': stream * ratio * resend * copies, 'control': acks_up + acks_down + srtla_acks, 'keepalives': keepalives}
    up = sent * copies + acks_up + keepalives / 2
    down = acks_down + srtla_acks + keepalives / 2
    total = sum(parts.values())
    to_bytes = lambda bps: bps * secs / 8
    return {'total': to_bytes(total), 'up': to_bytes(up), 'down': to_bytes(down), 'per_link': to_bytes(total / n), 'links': n, 'parts': {k: to_bytes(v) for k, v in parts.items()}, 'overhead_pct': (total / media / copies - 1) * 100, 'recording': None if record_mbps is None else to_bytes(record_mbps * 1000000.0 + audio_kbps * 1000.0 + m['mp4']['fixed_kbps'] * 1000.0)}

def fmt_size(b: float, m: dict) -> str:
    half_up = lambda x: math.floor(x + 0.5)
    gb = b / m['units']['gb_bytes']
    if gb < 0.995:
        mb = half_up(b / m['units']['mb_bytes'] / 10) * 10
        return f'{max(mb, 10):,} MB' if b > 0 else '0 MB'
    if gb < 99.95:
        tenths = half_up(gb * 10)
        return f'{tenths // 10}.{tenths % 10} GB'
    return f'{half_up(gb):,} GB'
