// config central com chaves de serviços externos — lidas do .env (nunca hardcoded aqui,
// nunca comitadas). se faltar alguma, a feature correspondente cai pra um modo sem ela.
module.exports = {
  meteredDomain: process.env.METERED_DOMAIN || '',
  meteredSecretKey: process.env.METERED_SECRET_KEY || '',
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  // credenciais do app Spotify (Client Credentials Flow) — só pra ler metadado de
  // faixa/playlist/álbum (nome, artista, duração, capa). o áudio tocado sempre vem do
  // youtube, já que a api do spotify não entrega stream de áudio pra terceiros.
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
};
