export default {
  async fetch(request, env) {
    if (typeof weatherProxy !== 'undefined') {
      const response = await weatherProxy(request);
      if (response) return response;
    }
    // Pass requests through unchanged: the asset binding serves '/' as index.html itself,
    // and rewriting to '/index.html' can loop with html_handling's canonical redirect.
    return env.ASSETS.fetch(request);
  },
};
