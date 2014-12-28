function dummyServer(req, res, fetchFile) {

  function processJadeInclude(base, jade, callback) {
    var match = jade.match(/\n( +)include (.+)\n/);
    if (!match) {
      callback(null, jade);
      return;
    }
    var indent = match[1];
    var file = base + match[2];
    fetchFile('views/' + file, function(err, content) {
      if (err) return callback(err);
      processJadeInclude(file.replace(/[^\/]*$/, ''), content, function(err, content) {
        if (err) return callback(err);
        content = content.replace(/\n$/, '');
        content = index + content.replace(/\n/, '\n' + indent) + '\n';
        jade = jade.replace(/\n( +)include (.+)\n/, '\n' + content);
        processJadeInclude(base, jade, callback);
      });
    });
  }

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
