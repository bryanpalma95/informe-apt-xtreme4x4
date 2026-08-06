# Formulario Duoc

App web mobile para digitalizar cupones fisicos de eventos Duoc UC usando IA.

## Que hace

1. Sacas foto al cupon desde el celular
2. Gemini (IA de Google) extrae los datos automaticamente
3. Revisas, corriges lo que haga falta y confirmas
4. Exportas los registros o los cargas al formulario de Duoc

## Como usar

1. Abre la app: https://bryanpalma95.github.io/FormularioDuoc/
2. La primera vez te pide una API Key de Gemini (gratis en https://aistudio.google.com/apikey)
3. Saca foto del cupon y toca "Extraer datos"
4. Revisa los datos, corrige si es necesario y confirma

## Tecnologias

- HTML/CSS/JS puro (sin frameworks)
- Gemini 2.0 Flash API (OCR con IA, gratis)
- GitHub Pages (hosting gratuito)
- Funciona 100% desde el navegador, sin backend

## Limites

- Gemini free: 15 requests/minuto, 1500/dia
- La API key se guarda en el navegador local (nunca se sube al repo)
