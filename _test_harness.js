process.loadEnvFile('.env');
const express = require('express');
const http = require('http');

const authStub = (req, res, next) => { req.user = { id: 1, username: 'veneno' }; next(); };
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith('middleware/auth')) return { requireAuth: authStub };
  return origLoad.apply(this, arguments);
};

const musicbotRoutes = require('./server/routes/musicbot');
const realtime = require('./server/realtime');
const queue = require('./server/bots/musicBot/queue');

const app = express();
app.use('/api/musicbot', musicbotRoutes);
const server = http.createServer(app);
realtime.init(server);
server.listen(3999, () => console.log('harness up on 3999'));

setTimeout(async () => {
  console.log('enfileirando faixa de teste...');
  await queue.enqueue(999, [{
    title: 'Me at the zoo', artist: 'jawed', durationSec: 19,
    youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    thumbnail: null, source: 'youtube', requestedBy: 'teste',
  }], { id: 1, username: 'veneno' });
  console.log('isPlaying:', queue.isPlaying());
}, 300);
