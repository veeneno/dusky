#!/usr/bin/env bash
# configura uma VM Ubuntu (24.04) do zero pra rodar o dusky:
#   - swap de 2GB (a B1s só tem 1GB de RAM — sem swap o npm install pode morrer compilando bcrypt/sqlite)
#   - Node 22, ffmpeg e yt-dlp (bot de música)
#   - serviço systemd (sobe sozinho no boot e reinicia se cair)
#   - Caddy na frente fazendo HTTPS automático (Let's Encrypt) — HTTPS é obrigatório pro
#     navegador liberar microfone/câmera, então sem isso as calls não funcionam
#
# uso (dentro da VM, com o projeto já copiado pra ~/dusky):
#   bash ~/dusky/deploy/setup-vm.sh seu.dominio.com
#
# pode rodar de novo sem medo (ex: depois de atualizar o código) — ele reaproveita o que já existe.
set -euo pipefail

DOMAIN="${1:?uso: bash setup-vm.sh seu.dominio.com}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="$(whoami)"

echo "==> dusky em $APP_DIR, usuário $APP_USER, domínio $DOMAIN"

# --- swap -------------------------------------------------------------------
if ! swapon --show | grep -q '/swapfile'; then
  echo "==> criando swap de 2GB"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# --- pacotes do sistema -----------------------------------------------------
echo "==> instalando pacotes básicos + ffmpeg"
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg build-essential python3 ffmpeg \
  debian-keyring debian-archive-keyring apt-transport-https openssl

# --- Node 22 ----------------------------------------------------------------
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "==> instalando Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# --- yt-dlp (versão do apt costuma ser velha demais pro YouTube) ------------
echo "==> instalando/atualizando yt-dlp"
sudo curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# --- Caddy ------------------------------------------------------------------
if ! command -v caddy >/dev/null; then
  echo "==> instalando Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi

# --- dependências do app ----------------------------------------------------
echo "==> instalando dependências do dusky"
cd "$APP_DIR"
npm ci --omit=dev
mkdir -p public/uploads/attachments public/uploads/avatars public/uploads/banners public/uploads/server

# SESSION_SECRET de verdade (se o .env ainda não tiver um)
touch .env
if ! grep -q '^SESSION_SECRET=' .env; then
  echo "==> gerando SESSION_SECRET"
  echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env

# --- serviço systemd --------------------------------------------------------
# o serviço se chamava "didiscord": se ainda existir, desliga e remove (senão os dois brigam pela porta)
if [ -f /etc/systemd/system/didiscord.service ]; then
  echo "==> removendo o serviço antigo didiscord"
  sudo systemctl disable --now didiscord || true
  sudo rm -f /etc/systemd/system/didiscord.service
fi
echo "==> configurando serviço dusky"
sudo tee /etc/systemd/system/dusky.service >/dev/null <<EOF
[Unit]
Description=dusky
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable dusky
sudo systemctl restart dusky

# --- Caddy (HTTPS + proxy, WebSocket incluso) -------------------------------
echo "==> configurando Caddy pra $DOMAIN"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
sudo systemctl enable caddy
sudo systemctl restart caddy

echo
echo "pronto! abre https://$DOMAIN no navegador."
echo "logs do app:   journalctl -u dusky -f"
echo "logs do Caddy: journalctl -u caddy -f"
