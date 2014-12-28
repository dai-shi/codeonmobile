function dummyServer(req, res, fetchFile) {
  if (req.url === '/') {
    req.url = '/index.html';
  }
  var fetchPublic = function() {
    fetchFile('public' + req.url, function(err, content) {
      if (err) {
        res.status(404).send('no such file');
      } else {
        res.send(content);
      }
    });
  };
  if (req.url.match(/\.html$/)) {
    fetchFile('views' + req.url.replace(/\.html$/, '.jade'), function(err, content) {
      if (err) return fetchPublic();
      res.send(renderJade(content));
    });
  } else {
    fetchFile();
  }
}
