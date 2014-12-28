/* jshint undef: true, unused: true, latedef: true */
/* jshint quotmark: single, eqeqeq: true */
/* jshint node: true */
/* global renderJade */
/* exported dummyServer */

function dummyServer(req, res, fetchFile) {

  function processJadeInclude(base, jade, callback) {
    var match = jade.match(/\n( +)include (.+)\n/);
    if (!match) return callback(null, jade);
    var indent = match[1];
    var file = base + match[2];
    fetchFile('views/' + file + '.jade', function(err, content) {
      if (err) return callback(err);
      processJadeInclude(file.replace(/[^\/]*$/, ''), content, function(err, content) {
        if (err) return callback(err);
        content = content.slice(0, -1);
        content = indent + content.replace(/\n/g, '\n' + indent) + '\n';
        jade = jade.replace(/\n( +)include (.+)\n/, '\n' + content);
        processJadeInclude(base, jade, callback);
      });
    });
  }

  function processApi(req, res) {
    if (req.url === '/api/profile') {
      res.json({
        login: 'dai-shi',
        name: 'Daishi Kato',
        'avatar_url': 'https://avatars.githubusercontent.com/u/490574?v=3'
      });
    } else if (req.url === '/api/repos') {
      res.json([{
        name: 'codeonmobile',
        'default_branch': 'master'
      }, {
        name: 'TestForCodeOnMobile',
        'default_branch': 'master'
      }]);
    } else {
      res.status(500).send();
    }
  }

  var dummy_socket_io_client = 'io={connect:function(){return{on:function(){}}}};';
  if (req.url === '/socket.io/socket.io.js') {
    res.send(dummy_socket_io_client);
    return;
  }
  if (req.url.match('/api/')) {
    processApi(req, res);
    return;
  }
  var match = req.url.match(/^\/static\/(.+)\.html$/);
  if (req.url === '/') {
    match = [null, 'index'];
  }
  if (match) {
    fetchFile('views/' + match[1] + '.jade', function(err, content) {
      if (err) return res.status(404).send('no such file');
      processJadeInclude(match[1].replace(/[^\/]*$/, ''), content, function(err, content) {
        if (err) return res.status(500).send('jade error');
        res.type('html');
        res.send(renderJade(content));
      });
    });
  } else {
    fetchFile('public/' + req.url.replace(/^\/static\//, ''), function(err, content) {
      if (err) return res.status(404).send('no such file');
      res.type(req.url.match(/\.(\w+)$/)[1]);
      res.send(content);
    });
  }
}
