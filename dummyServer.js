function dummyServer(req, res, fetchFile) {
  var dummy_socket_io_client = 'io={connect:function(){return{on:function(){}}}};';
  if (req.url === '/socket.io/socket.io.js') {
    res.send(dummy_socket_io_client);
    return;
  }
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
