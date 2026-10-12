#!/usr/bin/env python3
"""Download editorial shop photographs with retained page provenance.

The research cache stays in /tmp. Only explicitly selected, visually checked
photographs are saved in assets/shops and data/shop-photos.json.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path('/tmp/tokyo-photo-research')
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; TokyoCafePhotoResearch/1.0)', 'Accept': 'text/html,image/avif,image/webp,image/*;q=0.9,*/*;q=0.8'}


def read_url(url):
    url = urllib.parse.quote(url, safe=':/?=&%+;,@!~*()#')
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as response:
        data = response.read()
        return data, response.geturl(), response.headers.get('Content-Type', '')


class Images(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base, self.images = base, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta' and a.get('property', a.get('name', '')) in ('og:image', 'twitter:image'):
            self.add(a.get('content', ''), 'metadata', a.get('property', a.get('name')))
        if tag == 'img':
            src = a.get('data-src') or a.get('data-original') or a.get('src') or ''
            self.add(src, a.get('alt', ''), a.get('class', ''))
            srcset = a.get('srcset') or a.get('data-srcset') or ''
            if srcset:
                self.add(srcset.split(',')[-1].strip().split(' ')[0], a.get('alt', ''), 'srcset')

    def add(self, src, alt, kind):
        url = urllib.parse.urljoin(self.base, html.unescape(src))
        if url.startswith(('https://', 'http://')) and not any(x['url'] == url for x in self.images):
            self.images.append({'url': url, 'alt': alt, 'kind': kind})


def scan(item):
    sid, url = item
    try:
        raw, final, content_type = read_url(url)
        encoding = re.search(br'charset=["\s]*([a-zA-Z0-9_-]+)', raw[:12000])
        enc = encoding.group(1).decode() if encoding else 'utf-8'
        try:
            text = raw.decode(enc, errors='replace')
        except LookupError:
            text = raw.decode('utf-8', errors='replace')
        (CACHE / f'{sid}.html').write_text(text)
        parser = Images(final)
        parser.feed(text)
        # Background images and Shopify's JSON image fields are legitimate
        # candidates too; each selection is still checked against page context.
        for match in re.finditer(r'(?:url\([\s\"\x27]*|[\"\x27])((?:https?:)?//[^\s\"\x27<>]+\.(?:jpe?g|png|webp)(?:\?[^\s\"\x27<>]*)?)', text, re.I):
            parser.add(match.group(1), '', 'embedded')
        for match in re.finditer(r'url\([\s\"\x27]*([^\s\"\x27<>\)]+\.(?:jpe?g|png|webp)(?:\?[^\s\"\x27<>\)]*)?)', text, re.I):
            parser.add(match.group(1), '', 'background')
        title = re.search(r'<title[^>]*>(.*?)</title>', text, re.S | re.I)
        return sid, {'source': url, 'final': final, 'title': html.unescape(title.group(1)).strip() if title else '', 'images': parser.images}
    except Exception as exc:
        return sid, {'source': url, 'error': str(exc)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['scan', 'download'])
    parser.add_argument('--input', type=Path)
    args = parser.parse_args()
    CACHE.mkdir(exist_ok=True)
    if args.action == 'scan':
        shops = json.loads((ROOT / 'data/shops.json').read_text())['shops']
        urls = json.loads(args.input.read_text()) if args.input else {s['id']: s['sourceUrl'] for s in shops}
        report_path = CACHE / 'candidates.json'
        report = json.loads(report_path.read_text()) if report_path.exists() else {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            for sid, result in pool.map(scan, urls.items()):
                report[sid] = result
                print(sid, result.get('error', f"{len(result.get('images', []))} candidates"), flush=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    else:
        selections = json.loads((args.input or ROOT / 'data/shop-photos.json').read_text())
        asset_dir = ROOT / 'assets/shops'
        asset_dir.mkdir(exist_ok=True)
        mapping_path = ROOT / 'data/shop-photos.json'
        mapping = json.loads(mapping_path.read_text()) if mapping_path.exists() else {}
        for sid, choice in selections.items():
            original_url = choice.get('imageOriginalUrl') or choice.get('downloadUrl')
            if not original_url:
                raise ValueError(f'{sid}: missing original photograph URL')
            raw, final, content_type = read_url(original_url)
            if len(raw) < 1500 or not content_type.startswith('image/'):
                raise ValueError(f'{sid}: not a usable photograph: {content_type}')
            suffix = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif'}.get(content_type.split(';')[0])
            if not suffix:
                raise ValueError(f'{sid}: unexpected photograph type {content_type}')
            original_path = CACHE / f'{sid}-original{suffix}'
            original_path.write_bytes(raw)
            path = asset_dir / f'{sid}.webp'
            subprocess.run([
                'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                '-i', str(original_path), '-vf',
                "scale=w='min(960,iw)':h='min(960,ih)':force_original_aspect_ratio=decrease",
                '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82',
                '-compression_level', '5', '-threads', '1', str(path)
            ], check=True)
            metadata = {key: value for key, value in choice.items() if key not in ('image', 'downloadUrl')}
            mapping[sid] = {'image': path.relative_to(ROOT).as_posix(), **metadata,
                            'imageOriginalUrl': original_url}
            print(sid, path.stat().st_size, path.name, flush=True)
        mapping_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
