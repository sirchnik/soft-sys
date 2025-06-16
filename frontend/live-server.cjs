var liveServer = require("live-server");

var params = {
  port: 3000,
  open: true,
  host: "localhost",
  file: "index.html", // When set, serve this file (server root relative) for every 404 (useful for single-page applications)
  middleware: [
    function (req, res, next) {
      next();
    },
  ], // Takes an array of Connect-compatible middleware that are injected into the server middleware stack
};
liveServer.start(params);
