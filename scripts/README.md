# Icon generation

Regenerates the app icons in [`public/`](../public). Only needed when the icon
artwork itself changes — the output is committed, so a normal build and deploy
never runs any of this.

```powershell
# from the repo root
New-Item -ItemType Directory -Force .\.icons | Out-Null
.\scripts\make-icons.ps1 .\.icons
node .\scripts\make-ico.mjs .\.icons .\public\favicon.ico
Copy-Item .\.icons\icon-192.png, .\.icons\icon-512.png, `
          .\.icons\icon-maskable-512.png, .\.icons\apple-touch-icon.png .\public\
Remove-Item -Recurse .\.icons
```

`make-icons.ps1` draws with `System.Drawing` (Windows only, no npm dependency);
`make-ico.mjs` wraps the 16/32/48 PNGs in an ICO container.

**[`public/favicon.svg`](../public/favicon.svg) is maintained by hand and is not
generated.** It carries the same paths in the same 1024×1024 space as the script,
so if you change one you must change the other — otherwise the tab icon and the
home-screen icon quietly stop matching.
