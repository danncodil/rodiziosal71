# Publicar o rodízio Sal 71

## Arquivos para enviar

Use o arquivo `entrega/sal71-dominio.zip`. Ele contém somente:

- `index.html`
- `styles.css`
- `app.js`
- `rodizio.js`
- `assets/sal71-logo-white.png`
- `assets/sal71-watermark.png`

## Instalação

1. No painel da hospedagem, abra a pasta pública associada ao domínio (normalmente `public_html`, `www` ou `htdocs`).
2. Se já houver outro site nessa pasta, faça uma cópia dele antes de substituir arquivos.
3. Envie e extraia o ZIP nessa pasta. O arquivo `index.html` deve ficar diretamente na pasta pública, junto dos demais arquivos, e não dentro de uma pasta `dist`.
4. Ative o HTTPS pelo painel da hospedagem e abra o domínio. Não é necessário instalar Node.js, PHP ou banco de dados.
5. Confira as três abas e a equipe. Para um teste, registre um corte e confira o resumo e o histórico. Use “Zerar dia” somente se os registros daquele dia forem de teste.

Se preferir enviar sem ZIP, copie o conteúdo de `dist` mantendo a pasta `assets`. A mesma estrutura também funciona em uma subpasta do domínio. Não envie `.git`, `.openai`, `tests` nem este guia.

## Como os dados são guardados

Esta versão é estática e salva equipe, posição do rodízio e histórico diário no armazenamento local do navegador (`localStorage`).

- Reabrir o mesmo endereço no mesmo navegador mantém os registros.
- Outro aparelho, navegador, perfil ou domínio possui registros separados.
- Os dados usados no arquivo local ou no endereço de testes não são transferidos automaticamente para o domínio novo. O ZIP contém o programa, não os registros.
- Limpar os dados do site no navegador apaga esse histórico. Navegação privada não é indicada para registros que precisam ser mantidos.
- Prefira um único aparelho e uma aba para operar a fila. Há detecção de alterações entre abas, mas não sincronização entre aparelhos.
- Não há login nem banco de dados compartilhado nesta versão.

Os dias seguem o fuso de São Paulo. O botão “Pular vez” muda apenas a posição da fila; não adiciona um corte ao histórico.

As fontes são carregadas do Google Fonts. Se esse serviço não estiver disponível, o site utiliza as fontes alternativas do navegador.

## Manutenção

O código legível fica em `dist`, com os cálculos em `rodizio.js`, a interface em `app.js` e o visual em `styles.css`. Os testes ficam separados em `tests` e não precisam ser publicados.

Para repetir as verificações em um computador com Node.js:

```sh
node --test tests/*.test.cjs
```

Após futuras alterações, gere um novo ZIP do conteúdo de `dist`; o pacote em `entrega` representa apenas esta revisão.
