# Baut eine einzelne HTML-Datei (alle Module inline) – für Tests und Einbettung ohne Modul-Loader.
import re, sys
root = sys.argv[1] if len(sys.argv) > 1 else 'www'
out = sys.argv[2] if len(sys.argv) > 2 else 'dist-single.html'
html = open(f'{root}/index.html').read()
def strip(src):
    src = re.sub(r'^import .*?;\s*$', '', src, flags=re.M)
    return re.sub(r'^export (const|function|let)', r'\1', src, flags=re.M)
def wrap(src, names): return '(()=>{' + strip(src) + f'\nreturn {{{",".join(names)}}};}})()'
core = 'const C=' + wrap(open(f'{root}/core.js').read(), ['W','H','TPS','DANGER_Y','MAX_SPARKS','RULES','createGame','tap','rescue','step','simulate','dayKey','weekKey','seedFor','MAX_TICKS']) + ';'
cfg = strip(open(f'{root}/config.js').read())
mon = 'const {Monetize}=' + wrap(open(f'{root}/monetize.js').read(), ['Monetize']) + ';'
net = 'const {Net}=' + wrap(open(f'{root}/net.js').read(), ['Net']) + ';'
m = re.search(r'<script type="module">(.*)</script>', html, re.S)
bundle = '\n'.join([cfg, core, mon, net, strip(m.group(1))])
html = html[:m.start()] + '<script>\n' + bundle + '\n</script>' + html[m.end():]
open(out, 'w').write(html)
print(out, len(html))
