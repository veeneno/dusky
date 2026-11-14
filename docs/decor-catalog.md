# Catálogo de decorações

O perfil aceita `catalog:<id>` além dos presets e uploads antigos. A validação em
`server/decor.js` só aceita IDs existentes no slot correspondente. Não há migração
de banco: os três campos de texto existentes guardam a seleção e continuam sendo
transmitidos pelo evento `profile_updated`.

`public/decor/catalog.json` é a fonte usada pelo servidor; `catalog.js` contém o
mesmo índice para o navegador. Ambos são gerados pelo importador e versionados.
As mídias locais em `public/decor/media/` não entram no Git. São endereçadas por
SHA-256 e recebem cache imutável; não se deve alterar o conteúdo de um hash.

## Importar ou restaurar nesta instalação

```sh
python3 scripts/import-decor-catalog.py \
  --source /mnt/33/dusky/discord-catalog-20261114
DUSKY_VERIFY_DECOR_MEDIA=1 npm test
```

O importador usa somente os arquivos já baixados e auditados, sem fazer pedidos
de rede. Requer Python 3 e FFmpeg. Reutiliza arquivos por hard link quando possível,
deduplica pelo conteúdo e inclui todos os grupos do acervo histórico. O mapa
`public/decor/import-manifest.json` registra os caminhos de origem e a cobertura.
Em outro servidor, restaure também `public/decor/media/` (ou o acervo de entrada)
antes de reiniciar o serviço: clonar apenas o Git não instala os binários.

O catálogo atual tem 698 molduras, 300 plaquinhas e 368 efeitos únicos. Os arquivos
históricos adicionais também aparecem na galeria. Para efeitos históricos cujo
SKU foi removido da API, as durações são extraídas dos quadros APNG: a primeira
camada é a introdução, as demais repetem após ela. Esses itens são marcados como
`timingSource: apng-fallback`; seus intervalos originais não puderam ser recuperados.

## Reprodução e desempenho

A galeria usa imagens estáticas, busca sem acentos e páginas de 36 itens. A escolha
atualiza a prévia e só persiste ao salvar o perfil. Molduras fora da tela usam a
imagem estática. Plaquinhas carregam vídeo sem som ao receber hover/foco.

Efeitos de perfil só iniciam quando visíveis. As camadas são pré-carregadas e
compartilham a mesma origem de tempo; cada repetição recebe um novo blob URL para
reiniciar o APNG, preservando o cache de rede. São respeitados início, duração,
posição, ordem, intervalo e variantes. Timers e blob URLs são liberados ao sair da
tela, fechar a prévia ou ocultar a aba. Movimento reduzido, tanto do sistema como
do Dusky, mantém as imagens estáticas. O cache em memória guarda até 16 blobs.

Os arquivos foram obtidos para esta instalação; a disponibilidade pública de um
arquivo não transfere os direitos de uso dos cosméticos do Discord.
