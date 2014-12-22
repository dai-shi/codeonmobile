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

/* global angular, io, B64 */
/* global difflib, Diff2Html */

angular.module('MainModule', ['ngRoute', 'ngResource', 'ngTouch', 'ngSanitize', 'ui.ace', 'ui.bootstrap']);

angular.module('MainModule').config(function($routeProvider) {
  $routeProvider.
  when('/home', {
    templateUrl: 'static/partials/home.html',
    controller: 'HomeCtrl',
    resolve: {
      Profile: 'Profile'
    }
  }).
  when('/repo', {
    templateUrl: 'static/partials/repo.html',
    controller: 'RepoCtrl',
    resolve: {
      Profile: 'Profile'
    }
  }).
  when('/diff', {
    templateUrl: 'static/partials/diff.html',
    controller: 'DiffCtrl',
    resolve: {
      Profile: 'Profile'
    }
  }).
  when('/edit', {
    templateUrl: 'static/partials/edit.html',
    controller: 'EditCtrl',
    resolve: {
      Profile: 'Profile'
    }
  }).
  otherwise({
    redirectTo: '/home'
  });
});

angular.module('MainModule').run(function($rootScope, $window, $location) {
  var socket = io.connect($location.absUrl());
  socket.on('message', function(data) {
    $rootScope.$broadcast('handleRemoteMessage', data);
  });
  $rootScope.sendMessage = function(data) {
    socket.emit('message', data);
  };

  $rootScope.logout = function() {
    $window.location.href = './logout';
  };

  angular.element($window).bind('scroll', function() {
    $rootScope.$broadcast('scroll');
  });

});

angular.module('MainModule').controller('HomeCtrl', function($scope, Profile, Repos) {
  $scope.profile = Profile.data;
  Repos.query(function(data) {
    $scope.repos = data;
  });
});

angular.module('MainModule').controller('RepoCtrl', function($scope, Profile, $location, RepoFiles, FileCacheService, $window) {
  $scope.profile = Profile.data;
  $scope.repo_name = $location.search().name;
  $scope.repo_branch = $location.search().branch;
  RepoFiles.query({
    repo_name: $scope.repo_name,
    repo_branch: $scope.repo_branch
  }, function(data) {
    $scope.repo_files = data.tree.filter(function(file) {
      return file.type === 'blob' && file.size < 100 * 1000;
    });
  });
  $scope.checkModified = function(file) {
    return FileCacheService.isModified($scope.repo_name, $scope.repo_branch, file.path);
  };
  $scope.checkAllModified = function() {
    var files = $scope.repo_files;
    if (!files) return false;
    for (var i = 0; i < files.length; i++) {
      if ($scope.checkModified(files[i])) {
        return true;
      }
    }
    return false;
  };
  $scope.deleteModified = function(file) {
    if ($window.confirm('Are you sure to delete all changes you made to this file?')) {
      FileCacheService.deleteModified($scope.repo_name, $scope.repo_branch, file.path);
    }
  };
});

angular.module('MainModule').controller('DiffCtrl', function($scope, Profile, $location, $http, $window, RepoFiles, FileCacheService, RepoFilesCache) {
  $scope.profile = Profile.data;
  $scope.repo_name = $location.search().name;
  $scope.repo_branch = $location.search().branch;
  RepoFiles.query({
    repo_name: $scope.repo_name,
    repo_branch: $scope.repo_branch
  }, function(data) {
    $scope.commit_sha = data.sha;
    $scope.repo_files = data.tree.filter(function(file) {
      return file.type === 'blob' && file.size < 100 * 1000;
    });
  });
  $scope.checkModified = function(file) {
    return FileCacheService.isModified($scope.repo_name, $scope.repo_branch, file.path);
  };
  $scope.getModified = function(file) {
    return FileCacheService.get($scope.repo_name, $scope.repo_branch, file.path);
  };
  $scope.getOriginal = function(file) {
    return FileCacheService.getOriginal($scope.repo_name, $scope.repo_branch, file.path);
  };
  $scope.doCommit = function() {
    var files = $scope.repo_files.filter($scope.checkModified);
    $scope.committing = true;
    $http.post('./api/commit', {
      repo_name: $scope.repo_name,
      repo_branch: $scope.repo_branch,
      parent_sha: $scope.commit_sha,
      files: files.map(function(file) {
        return {
          path: file.path,
          content: $scope.getModified(file)
        };
      }),
      message: $scope.commit_message
    }).success(function() {
      $scope.commit_message = '';
      FileCacheService.deleteOriginalAndModified($scope.repo_name, $scope.repo_branch);
      RepoFilesCache.removeAll();
      $scope.committing = false;
      $window.history.back();
    }).error(function() {
      $scope.committing = false;
      $window.alert('Commit failed');
    });
  };
});

angular.module('MainModule').controller('EditCtrl', function($scope, Profile, $location, RepoFileBlob, FileCacheService, $window, $timeout, $interval) {
  $scope.profile = Profile.data;
  $scope.repo_name = $location.search().name;
  $scope.repo_branch = $location.search().branch;
  $scope.file_path = $location.search().path;
  $scope.file_sha = $location.search().sha;
  $scope.content = null;
  RepoFileBlob.get({
    repo_name: $scope.repo_name,
    file_sha: $scope.file_sha
  }, function(data) {
    var content = data.content;
    if (data.encoding === 'base64') {
      try {
        content = B64.decode(data.content.replace(/\s/g, ''));
      } catch (e) {
        $window.alert('base64 decode error: ' + e);
      }
    }
    FileCacheService.setOriginal($scope.repo_name, $scope.repo_branch, $scope.file_path, content);
    $scope.content = FileCacheService.get($scope.repo_name, $scope.repo_branch, $scope.file_path);
    $timeout(updateEditorHeight, 10);
  });
  var autosaveTimer = $interval(function() {
    if ($scope.content) {
      FileCacheService.setModified($scope.repo_name, $scope.repo_branch, $scope.file_path, $scope.content);
    }
  }, 10 * 1000);
  $scope.$on('$routeChangeStart', function() {
    $interval.cancel(autosaveTimer);
    if ($scope.content) {
      FileCacheService.setModified($scope.repo_name, $scope.repo_branch, $scope.file_path, $scope.content);
    }
  });

  $scope.editorHeight = 200;

  function updateEditorHeight() {
    if (!$scope.aceEditor) return;
    $scope.editorHeight = Math.max(200, (1 + $scope.aceEditor.getSession().getScreenLength()) *
      $scope.aceEditor.renderer.lineHeight +
      $scope.aceEditor.renderer.scrollBar.getWidth());
  }
  $window.addEventListener('resize', function() {
    $scope.$apply(updateEditorHeight);
  });
  var modelist = $window.ace.require('ace/ext/modelist');
  var mode = modelist.getModeForPath($scope.file_path).mode;
  $scope.aceOption = {
    useWrapMode: true,
    showGutter: true,
    theme: 'merbivore',
    mode: mode.match(/\/([^\/]+)$/)[1],
    onLoad: function(editor) {
      $scope.aceEditor = editor;
      var aceTA = $window.document.getElementsByClassName('ace_text-input')[0];
      aceTA.setAttribute('autocorrect', 'off');
      $scope.aceEditor.getSession().setTabSize(2);
      $scope.aceEditor.getSession().selection.on('changeCursor', function() {
        $scope.cursorTop = $scope.aceEditor.renderer.$cursorLayer.getPixelPosition().top + 'px';
      });
    },
    onChange: updateEditorHeight
  };
  $scope.scrollTop = 0;
  $scope.$on('scroll', function() {
    $scope.$apply(function() {
      $scope.scrollTop = $window.document.body.scrollTop;
    });
  });

  $scope.commandMode = false;
  var textareaEle = $window.document.getElementById('panel-textarea');
  angular.element(textareaEle).on('focus', function() {
    $scope.commandMode = true;
  });
  angular.element(textareaEle).on('blur', function() {
    $scope.commandMode = false;
  });
  angular.element(textareaEle).on('keydown', function(event) {
    //console.log(event.keyCode);
    switch (event.keyCode) {
      case 72:
        $scope.aceEditor.navigateLeft();
        break;
      case 74:
        $scope.aceEditor.navigateDown();
        $window.document.body.scrollTop += $scope.aceEditor.renderer.lineHeight;
        break;
      case 75:
        $scope.aceEditor.navigateUp();
        $window.document.body.scrollTop -= $scope.aceEditor.renderer.lineHeight;
        break;
      case 76:
        $scope.aceEditor.navigateRight();
        break;
      case 85:
        $scope.aceEditor.undo();
        break;
      case 82:
        $scope.aceEditor.redo();
        break;
      case 88:
        var session = $scope.aceEditor.getSession();
        var selection = session.selection;
        selection.selectRight();
        session.remove(selection.getRange());
        selection.clearSelection();
        break;
      case 81:
        $scope.aceEditor.focus();
        break;
    }
    event.preventDefault();
  });
  $scope.toggleCommandMode = function() {
    if ($scope.commandMode) {
      $scope.aceEditor.focus();
    } else {
      textareaEle.focus();
    }
  };

});

angular.module('MainModule').factory('Profile', function($http) {
  return $http.get('./api/profile');
});

angular.module('MainModule').factory('Repos', function($resource) {
  return $resource('./api/repos', {}, {
    query: {
      method: 'GET',
      isArray: true,
      cache: true
    }
  });
});

angular.module('MainModule').factory('RepoFilesCache', function($cacheFactory) {
  return $cacheFactory('RepoFilesCache');
});

angular.module('MainModule').factory('RepoFiles', function($resource, RepoFilesCache) {
  return $resource('./api/repo/files', {}, {
    query: {
      method: 'GET',
      isArray: false,
      cache: RepoFilesCache
    }
  });
});

angular.module('MainModule').factory('RepoFileBlob', function($resource) {
  return $resource('./api/repo/file/blob', {}, {
    get: {
      method: 'GET',
      cache: true
    }
  });
});

angular.module('MainModule').factory('RemoteFileCache', function($resource) {
  return $resource('./api/cache/files');
});

angular.module('MainModule').factory('FileCacheService', function(RemoteFileCache, RepoFiles, RepoFileBlob, $window) {
  var cacheOriginal = {};
  var cacheModified = RemoteFileCache.get(function() {
    Object.keys(cacheModified).forEach(function(key) {
      if (key.lastIndexOf('$', 0) === 0) return;
      fetchOriginal(key);
    });
  });

  function fetchOriginal(key) {
    var splited = key.split(':');
    var repo = splited[0];
    var branch = splited[1];
    var path = splited[2];
    RepoFiles.query({
      repo_name: repo,
      repo_branch: branch
    }, function(data) {
      var files = data.tree;
      files.forEach(function(file) {
        if (file.path === path) {
          RepoFileBlob.get({
            repo_name: repo,
            file_sha: file.sha
          }, function(data) {
            var content = data.content;
            if (data.encoding === 'base64') {
              try {
                content = B64.decode(data.content.replace(/\s/g, ''));
              } catch (e) {
                $window.alert('base64 decode error: ' + e);
              }
            }
            cacheOriginal[key] = content;
            if (cacheModified[key] === content) {
              delete cacheModified[key];
              RemoteFileCache.delete({
                key: key
              });
            }
          });
        }
      });
    });
  }
  return {
    setOriginal: function(repo, branch, path, content) {
      var key = repo + ':' + branch + ':' + path;
      cacheOriginal[key] = content;
    },
    setModified: function(repo, branch, path, content) {
      var key = repo + ':' + branch + ':' + path;
      if (cacheOriginal[key] === content) {
        delete cacheModified[key];
        RemoteFileCache.delete({
          key: key
        });
      } else if (cacheModified[key] !== content) {
        cacheModified[key] = content;
        RemoteFileCache.save({
          key: key,
          content: content
        });
      }
    },
    deleteModified: function(repo, branch, path) {
      var key = repo + ':' + branch + ':' + path;
      delete cacheModified[key];
      RemoteFileCache.delete({
        key: key
      });
    },
    getOriginal: function(repo, branch, path) {
      var key = repo + ':' + branch + ':' + path;
      return cacheOriginal[key] || false;
    },
    get: function(repo, branch, path) {
      var key = repo + ':' + branch + ':' + path;
      return cacheModified[key] || cacheOriginal[key] || false;
    },
    isModified: function(repo, branch, path) {
      var key = repo + ':' + branch + ':' + path;
      return !!cacheModified[key];
    },
    deleteOriginalAndModified: function(repo, branch) {
      var keyPrefix = repo + ':' + branch + ':';
      Object.keys(cacheOriginal).forEach(function(key) {
        if (key.lastIndexOf(keyPrefix, 0) === 0) {
          delete cacheOriginal[key];
          delete cacheModified[key];
          RemoteFileCache.delete({
            key: key
          });
        }
      });
    }
  };
});

angular.module('MainModule').directive('myDiff', function() {
  return {
    restrict: 'AE',
    scope: {
      path: '@',
      oldContent: '@',
      newContent: '@'
    },
    link: function(scope, element /*, attrs*/ ) {
      var udiff = difflib.unifiedDiff(scope.oldContent.split('\n'), scope.newContent.split('\n'), {
        lineterm: ''
      });
      var udiffStr = 'diff --git a/' + scope.path + ' b/' + scope.path + '\n';
      udiffStr += udiff.join('\n');
      element[0].innerHTML = Diff2Html.getPrettyHtmlFromDiff(udiffStr);
    }
  };
});

// ng-touchstart -> my-touchbegin
angular.module('MainModule').directive('myTouchbegin', function($parse, $swipe) {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var handler = $parse(attrs.myTouchbegin);
      $swipe.bind(element, {
        start: function() {
          scope.$apply(function() {
            handler(scope);
          });
        }
      });
    }
  };
});
