# Playfair Display (self-hosted)

`PlayfairDisplay-latin-variable.woff2` is the latin-subset variable font
Google Fonts serves for Playfair Display v40, downloaded from
`fonts.gstatic.com` and committed here.

It replaced `next/font/google`, which fetched the same file during every
build. That made each build — and so each CI run — depend on reaching
Google, and a failed fetch broke the build with a module-not-found on the
generated font CSS rather than anything resembling a network error.

One file covers both weights the design uses: it carries a `wght` axis
from 400 to 900, which is why `layout.tsx` declares that range instead of
a list of static weights. Google served this same file for 600 and 700.

Licensed under the SIL Open Font License 1.1 — see `OFL.txt`. The OFL
permits bundling and redistribution; the reserved font name means a
*modified* copy may not be called "Playfair Display". This copy is
unmodified.

To refresh it (only needed to pick up a new upstream version):

```bash
curl -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap"
# then download the URL under the /* latin */ block
```

The user agent matters: without a modern one Google returns TrueType
rather than woff2.
