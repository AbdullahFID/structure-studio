import re, pathlib
root = pathlib.Path(__file__).parent
src = root / 'src'
strip = lambda s: re.sub(r'^export\s+', '', s, flags=re.M)
t = (src / 'index.html').read_text()
t = t.replace('/*__CSS__*/', (src / 'styles.css').read_text())
t = t.replace('/*__ENGINE__*/', strip((src / 'engine.js').read_text()))
t = t.replace('/*__VIEWER__*/', strip((src / 'viewer.js').read_text()))
t = t.replace('/*__APP__*/', (src / 'app.js').read_text())
out = root / 'dist' / 'structure-studio.html'
out.write_text(t)
# Local test page: emulate the artifact skeleton
skel = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')
page = skel + t + '</body></html>'
(root / 'test' / 'page.html').write_text(page)
# Hosted entry point (Vercel serves dist/): same skeleton the app was tested in
(root / 'dist' / 'index.html').write_text(page)
print('built', out, len(t)//1024, 'KB')
