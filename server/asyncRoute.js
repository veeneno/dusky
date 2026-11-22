// Express 4 não pega erro de rota async: uma promessa rejeitada (exceção depois de um await) vira
// unhandledRejection, e o pedido fica pendurado sem resposta. asyncRoute(fn) passa esse erro pro
// next(), e o tratador de erro no fim do server/index.js responde 500 { error: 'erro interno' }.
// (O Express 5 já faz isso sozinho; trocar de versão deixa este arquivo sobrando.)
function asyncRoute(fn) {
  return function asyncRouteHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncRoute };
