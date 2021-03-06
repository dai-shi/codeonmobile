/*
  Copyright (C) 2014, Daishi Kato <daishi@axlight.com>
  All rights reserved.

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
  "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
  LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
  A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
  HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
  LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
  THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
  OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/* jshint undef: true, unused: true, latedef: true */
/* jshint quotmark: single, eqeqeq: true */
/* jshint node: true */

var path = require('path');
var http = require('http');
var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var expressSession = require('express-session');
var socket_io = require('socket.io');
var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var GitHubApi = require('github');
var async = require('async');
var jade = require('jade');
var vm = require('vm');
var makeSafeCode = require('./safeCode.js').makeSafeCode;

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    scope: 'repo',
    callbackURL: process.env.BASE_URL + '/auth/github/callback'
  },
  function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
      return done(null, {
        accessToken: accessToken,
        refreshToken: refreshToken,
        profile: profile
      });
    });
  }
));

function getGitHubUserClient(req_user) {
  var token = req_user.accessToken;
  var github = new GitHubApi({
    version: '3.0.0',
    headers: {
      'user-agent': 'CodeOnMobile'
    }
  });
  github.authenticate({
    type: 'oauth',
    token: token
  });
  return github;
}

var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(cookieParser());
app.use(bodyParser.json());
app.use(expressSession({
  store: process.env.DATABASE_URL && new(require('connect-pg-simple')(expressSession))(),
  secret: process.env.SESSION_SECRET || 'secret-749845378925947473418910',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/auth/github',
  passport.authenticate('github'));

app.get('/auth/github/callback',
  passport.authenticate('github', {
    successRedirect: '/',
    failureRedirect: '/'
  }));

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.get('/api/profile', function(req, res) {
  if (!req.user) {
    res.json({});
    return;
  }
  var profile_json = req.user.profile ? req.user.profile._json : {};
  res.json({
    login: profile_json.login,
    name: profile_json.name,
    avatar_url: profile_json.avatar_url
  });
});

app.get('/api/repos', function(req, res) {
  if (!req.user) {
    res.json([]);
    return;
  }
  var github = getGitHubUserClient(req.user);
  github.repos.getAll({
    type: 'owner',
    sort: 'pushed',
    per_page: 100
  }, function(err, result) {
    if (err) {
      console.log('error in github.repos.getAll', err);
      res.sendStatus(500);
      return;
    }
    //console.log(result);
    res.json(result.map(function(x) {
      return {
        name: x.name,
        default_branch: x.default_branch
      };
    }));
  });
});

app.get('/api/repo/files', function(req, res) {
  if (!req.user) {
    res.json({});
    return;
  }
  var github = getGitHubUserClient(req.user);
  github.gitdata.getReference({
    user: req.user.profile.username,
    repo: req.query.repo_name,
    ref: 'heads/' + req.query.repo_branch
  }, function(err, result) {
    if (err) {
      console.log('error in github.gitdata.getReference', err, req.query);
      res.sendStatus(500);
      return;
    }
    var commit_sha = result.object.sha;
    github.gitdata.getTree({
      user: req.user.profile.username,
      repo: req.query.repo_name,
      sha: commit_sha,
      recursive: true
    }, function(err, result) {
      if (err) {
        console.log('error in github.gitdata.getReference', err);
        res.sendStatus(500);
        return;
      }
      delete result.meta;
      res.json(result);
    });
  });
});

app.get('/api/repo/file/blob', function(req, res) {
  if (!req.user) {
    res.json({});
    return;
  }
  var github = getGitHubUserClient(req.user);
  github.gitdata.getBlob({
    user: req.user.profile.username,
    repo: req.query.repo_name,
    sha: req.query.file_sha
  }, function(err, result) {
    if (err) {
      console.log('error in github.gitdata.getBlob', err);
      res.sendStatus(500);
      return;
    }
    delete result.meta;
    res.json(result);
  });
});

app.post('/api/commit', function(req, res) {
  if (!req.user) {
    res.json(false);
    return;
  }
  if (!req.body.repo_name) {
    res.status(500).send('no repo_name specified');
    return;
  }
  if (!req.body.repo_branch) {
    res.status(500).send('no repo_branch specified');
    return;
  }
  if (!req.body.parent_sha) {
    res.status(500).send('no parent_sha specified');
    return;
  }
  if (!req.body.message) {
    res.status(500).send('no message specified');
    return;
  }
  if (!req.body.files || req.body.files.length < 1) {
    res.status(500).send('no files specified');
    return;
  }
  var github = getGitHubUserClient(req.user);
  async.waterfall([

    function(cb) {
      github.gitdata.getReference({
        user: req.user.profile.username,
        repo: req.body.repo_name,
        ref: 'heads/' + req.body.repo_branch
      }, cb);
    },
    function(result, cb) {
      var commit_sha = result.object.sha;
      if (commit_sha !== req.body.parent_sha) {
        cb('commit proceeds from the previous state');
        return;
      }
      var tree_sha = commit_sha;
      var tree = req.body.files.map(function(file) {
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          content: file.content
        };
      });
      github.gitdata.createTree({
        user: req.user.profile.username,
        repo: req.body.repo_name,
        tree: tree,
        base_tree: tree_sha
      }, cb);
    },
    function(result, cb) {
      var new_sha = result.sha;
      github.gitdata.createCommit({
        user: req.user.profile.username,
        repo: req.body.repo_name,
        message: req.body.message,
        tree: new_sha,
        parents: [req.body.parent_sha]
      }, cb);
    },
    function(result, cb) {
      var new_commit_sha = result.sha;
      github.gitdata.updateReference({
        user: req.user.profile.username,
        repo: req.body.repo_name,
        ref: 'heads/' + req.body.repo_branch,
        sha: new_commit_sha
      }, cb);
    }

  ], function(err) {
    if (err) {
      console.log('error in creating a new commit', err);
      res.sendStatus(500);
      return;
    }
    res.json(true);
  });
});

app.get('/api/cache/files', function(req, res) {
  if (!req.user) {
    res.json([]);
    return;
  }
  res.json(req.user.cache_files || {});
});

app.post('/api/cache/files', function(req, res) {
  if (!req.user) {
    res.json(false);
    return;
  }
  if (!req.body.key) {
    res.status(500).send('no key specified');
    return;
  }
  if (!req.body.content) {
    res.status(500).send('no content specified');
    return;
  }
  if (!req.user.cache_files) {
    req.user.cache_files = {};
  }
  req.user.cache_files[req.body.key] = req.body.content;
  res.json(true);
});

app.delete('/api/cache/files', function(req, res) {
  if (!req.user) {
    res.json(false);
    return;
  }
  if (!req.query.key) {
    res.status(500).send('no key specified');
    return;
  }
  if (!req.user.cache_files) {
    res.json(false);
    return;
  }
  delete req.user.cache_files[req.query.key];
  res.json(true);
});

function processDummyServer(req, res, fetchFile) {
  fetchFile('dummyServer.js', function(err, content) {
    if (err) {
      // probably there is no such file.
      console.log('error getting dummyServer.js', err);
      res.status(404).send();
      return;
    }
    var sandbox = {
      req: req,
      res: res,
      fetchFile: fetchFile,
      renderJade: function(str, opts) {
        return jade.render(str, opts);
      }
    };
    var varname = 'counter' + Math.random().toString().substring(2);
    sandbox[varname] = 0;
    vm.runInNewContext('(' + makeSafeCode(content, varname) + ')(req, res, fetchFile);', sandbox);
  });
}

var fetchFileCache = {};

function getFetchFile(req_user, target_repo, target_branch) {
  function checkCache() {
    var name = req_user.profile.username;
    if (fetchFileCache[name] && fetchFileCache[name]['////CREATED////'] + 60 * 1000 < Date.now()) {
      delete fetchFileCache[name];
    }
    if (!fetchFileCache[name]) {
      fetchFileCache[name] = {
        '////CREATED////': Date.now()
      };
    }
  }

  function getCache(target_path) {
    checkCache();
    return fetchFileCache[req_user.profile.username][target_path];
  }

  function setCache(target_path, content) {
    checkCache();
    fetchFileCache[req_user.profile.username][target_path] = content;
  }

  var github = getGitHubUserClient(req_user);
  return function(target_path, callback) {
    if (!callback) return console.log('fetchFile fatal error: no callback');
    var key = target_repo + ':' + target_branch + ':' + target_path;
    if (req_user.cache_files && req_user.cache_files[key]) {
      callback(null, req_user.cache_files[key]);
      return;
    }
    var cachedContent = getCache(target_path);
    if (cachedContent === false) { // negative cachedContent
      callback(new Error('no such file: ' + target_path));
      return;
    }
    if (cachedContent) {
      callback(null, cachedContent);
      return;
    }
    //XXX you can also cache getTree result
    async.waterfall([

      function(cb) {
        github.gitdata.getReference({
          user: req_user.profile.username,
          repo: target_repo,
          ref: 'heads/' + target_branch
        }, cb);
      },
      function(result, cb) {
        var commit_sha = result.object.sha;
        github.gitdata.getTree({
          user: req_user.profile.username,
          repo: target_repo,
          sha: commit_sha,
          recursive: true
        }, cb);
      },
      function(result, cb) {
        var files = result.tree;
        var file = null;
        for (var i = 0; i < files.length; i++) {
          if (files[i].type === 'blob' && files[i].path === target_path) {
            file = files[i];
            break;
          }
        }
        if (file) {
          cb(null, file);
        } else {
          setCache(target_path, false); // negative cache
          cb(new Error('no such file: ' + target_path));
        }
      },
      function(result, cb) {
        var file_sha = result.sha;
        github.gitdata.getBlob({
          user: req_user.profile.username,
          repo: target_repo,
          sha: file_sha
        }, cb);
      }

    ], function(err, result) {
      if (err) return callback(err);
      var content = result.content;
      if (result.encoding === 'base64') {
        content = new Buffer(content, 'base64').toString();
      }
      setCache(target_path, content);
      callback(null, content);
    });
  };
}

app.use('/dummy/:repo/:branch', function(req, res) {
  if (!req.user) {
    res.status(500).send('not logged in');
    return;
  }
  processDummyServer(req, res, getFetchFile(req.user, req.params.repo, req.params.branch));
});

app.get(new RegExp('^/static/(.+)\\.html$'), function(req, res) {
  var view_name = req.params[0];
  res.render(view_name);
});

app.use('/static', express.static(path.join(__dirname, 'public')));

var server = http.createServer(app);
var sio = socket_io(server);
server.listen(process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 3000, process.env.OPENSHIFT_NODEJS_IP, function() {
  console.log('Express server listening.');
});

sio.on('connection', function(socket) {
  socket.on('message', function(data) {
    socket.broadcast.emit('message', data);
  });
});
