const { authUrl, buildStateCookie, handleOptions, sendJson } = require('./_qbo');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  try {
    const location = await authUrl(req);
    const state = new URL(location).searchParams.get('state');
    res.statusCode = 302;
    res.setHeader('Set-Cookie', buildStateCookie(state));
    res.setHeader('Location', location);
    res.end();
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
};
