function dummyServer(req, res, fetchFile) {
  var match = req.url.match(/^\/static\/(.+)\.html$/);
  if (req.url === '/') {
    match = [null, 'index'];
  }
  if (match) {
    fetchFile('views/' + match[1] + '.jade', function(err, content) {
      if (err) {
        res.status(404).send('no such file');
      } else {
        res.send(renderJade(content));
      }
    });
  } else {
    fetchFile('public/' + req.url.replace(/^\/static\//, ''), function(err, content) {
      if (err) {
        res.status(404).send('no such file');
      } else {
        res.send(content);
      }
    });
  }
}
