# lucasacchi-net

Repository contenente il codice sorgente del sito [lucasacchi.net](https://lucasacchi.net).

## Sezioni

- **Chi Sono** — Profilo professionale e metodo didattico
- **Corsi** — 6 corsi: Linux Base/Intermedio/Avanzato, JavaScript, NodeJS, HTML5/CSS3
- **YouTube** — Video corsi e tutorial
- **Blog** — Articoli tecnici (coming soon)
- **Contatti** — Form di contatto e recapiti

## Demo

- **Live (custom domain):** https://lucasacchi.net
- **GitHub Pages:** https://lucasacchiricciardi.github.io/lucasacchi-net

## Tech Stack

- HTML5 + Tailwind CSS (build via CLI)
- Vanilla JavaScript (zero framework)
- Web Worker per async fetching
- LZ-string compression per localStorage
- Service Worker per offline support
- GitHub Actions CI/CD con deploy su GitHub Pages

## Comandi

```bash
npm ci --force                    # Installa dipendenze
node scripts/build-news.mjs      # Build completo in dist/
node --test scripts/build-news.test.mjs
node --test src/home/newsWorker.test.mjs
node --test src/home/main.test.mjs
python3 -m http.server 8000 --directory dist  # Serve locale
```

## Autore

**Luca Sacchi Ricciardi**

## Licenza

Vedere il file [LICENSE.txt](LICENSE.txt) per i termini completi.

<!-- maintained by lucasacchiricciardi -->
