# Publicar a ficha: passo a passo

Três caminhos, do mais simples ao mais completo.

| Caminho | Endereço | Sincronização | Atualiza sozinho |
|---|---|---|---|
| Arrastar a pasta no Netlify | `algo.netlify.app` | ❌ | ❌ |
| GitHub Pages | `usuario.github.io/ficha-v20` | ❌ | ✅ a cada push |
| **GitHub + Netlify** | `ficha-v20.netlify.app` | ✅ | ✅ a cada push |

---

## 1. Criar o repositório no GitHub

### Pelo site

1. Entre em **github.com** → botão **+** (canto superior direito) → **New repository**.
2. **Repository name:** `ficha-v20`
3. **Description:** `Ficha de personagem de Vampiro: A Máscara (V20) — rolador, regras automáticas e uso offline.`
4. Escolha **Public** (necessário para o GitHub Pages no plano grátis).
5. **Não** marque "Add a README", "Add .gitignore" nem "Choose a license": já vêm prontos no pacote.
6. **Create repository**.

### Enviar os arquivos

Na pasta descompactada, com o Git instalado:

```bash
cd ficha-v20
git remote add origin https://github.com/SEU-USUARIO/ficha-v20.git
git branch -M main
git push -u origin main
```

Se pedir senha, use um **token**: GitHub → *Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token*, com a permissão `repo`. Cole o token no lugar da senha.

> Prefere a linha de comando do GitHub? Com a [CLI](https://cli.github.com) instalada: `gh repo create ficha-v20 --public --source=. --remote=origin --push`

### Deixar a página com cara de projeto

- **About** (engrenagem à direita): descrição, site (`https://ficha-v20.netlify.app`) e **Topics**: `vampire-the-masquerade`, `v20`, `rpg`, `character-sheet`, `pwa`, `javascript`, `ttrpg`, `portugues`.
- Marque **Releases** e **Packages** como ocultos se quiser uma lateral mais limpa.
- Em **Settings → General → Features**, deixe **Issues** ligado e **Wikis/Projects** desligados, se não for usar.

## 2. Ligar o GitHub Pages (opcional)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Pronto: o fluxo `.github/workflows/pages.yml` publica a cada push.
3. O endereço aparece em **Actions → Publicar no GitHub Pages**.

A ficha funciona inteira ali, menos a sincronização (que precisa do Netlify).

## 3. Ligar o Netlify ao repositório

1. Entre em **app.netlify.com** → **Add new site → Import an existing project**.
2. **Deploy with GitHub** → autorize → escolha `ficha-v20`.
3. Confirme as opções (o `netlify.toml` já preenche):
   - **Branch:** `main`
   - **Build command:** `npm install --no-audit --no-fund`
   - **Publish directory:** `.`
   - **Functions directory:** `netlify/functions`
4. **Deploy site**. A partir daí, todo `git push` publica sozinho.

### Já tem o site `ficha-v20` no Netlify?

**Site configuration → Build & deploy → Continuous deployment → Link repository**, e escolha o repositório. O nome e o endereço continuam os mesmos.

### Conferir a sincronização

1. Abra o site publicado → **💾 Arquivo → ☁️ Sincronizar**.
2. **Enviar deste aparelho**. Se aparecer "o servidor respondeu 404", o build não rodou: confira o **Build command** e o log em **Deploys**.
3. No celular, abra o mesmo site, digite o mesmo código e PIN e toque em **Baixar**.

## 4. Acabamentos profissionais

- **Selo de build:** no `README.md`, troque `SEU-USUARIO` pelo seu nome de usuário. Para o selo do Netlify, use *Site configuration → General → Status badges*.
- **Versões:** ao lançar, marque a versão e publique a release:
  ```bash
  git tag -a v2.1 -m "Ficha V20 2.1"
  git push origin v2.1
  ```
  Depois, em **Releases → Draft a new release**, escolha a tag e cole o trecho do `CHANGELOG.md`.
- **Proteger a branch:** *Settings → Branches → Add rule* em `main`, exigindo pull request e o check **Verificação**.
- **Domínio próprio:** no Netlify, *Domain management → Add a domain*. O HTTPS é automático.
- **Previews:** cada pull request ganha um endereço de teste no Netlify, sem tocar no site principal.
