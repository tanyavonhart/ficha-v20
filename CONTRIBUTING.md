# Como contribuir

Este projeto é HTML, CSS e JavaScript puro: **não há build nem dependências** para rodar a ficha.

## Rodando

```bash
git clone https://github.com/SEU-USUARIO/ficha-v20.git
cd ficha-v20
python3 -m http.server 8080   # ou abra o index.html direto
```

Abra `http://localhost:8080`. Um servidor local é necessário só para testar o service worker e a sincronização.

## Antes de abrir um pull request

```bash
node --check app.js
node --check v20-automacoes.js
node --check service-worker.js
```

- Teste no computador **e** no celular: boa parte da ficha é usada no iPhone durante a mesa.
- Mudou a versão? Atualize os três lugares: `APP_VERSION` (v20-automacoes.js), `CACHE_VERSION` (service-worker.js) e `data-app-version` (index.html). A verificação automática cobra isso.
- Mudou alguma regra do V20? Diga na descrição qual regra e onde ela está no livro.
- Texto da interface em **português do Brasil**, direto e sem jargão.

## Organização do código

| Arquivo | Responsabilidade |
|---|---|
| `app.js` | Estado, personagens, renderização, cabos e rolagem |
| `v20-automacoes.js` | Regras, XP, grimório, assistente, imersão, sincronização |
| `styles.css` | Temas, layout, impressão e responsivo |
| `netlify/functions/sync.mjs` | Serviço de sincronização |
