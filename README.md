CodeOnMobile
============

A coding tool on mobile devices targeting GitHub/Codeship/Heroku

Introduction
------------

Ever wanted to code on your mobile phone?
This is yet another tool to code with your GitHub repositories.
Usually, coding on small mobile devices is a pain and
it is a challenge to overcome this issue.
I have tried several GitHub clients for iPhone,
but didn't find anything comfortable.

Hence, I decided to create my own version.
It's a web app primarily targeting iPhone
but it is also usable with other mobile devices and even PCs.
It uses the GitHub API and expects to use Codeship to deploy an app to Heroku.
Although it is designed for Express/Node.js-based single page applications,
it can be used for other frameworks.

The main features of this tool are the followings:

- Simple interface designed for iPhone Safari (ex. no back button)
- Command mode in the editor for iPhone virtual keyboard (vim inspired)
- Dummy server to check client-side behavior before committing

Screencast
----------

![Preview](http://dai-shi.github.io/codeonmobile/screencast.gif)

Usage
-----

1. Login using your GitHub account.
2. Once you logged in, you will see the list of your repositories.
3. If you select a repository, you will see a list of files in the repository.
4. If you select a file, an editor will be opened.
5. Edit a file in the editor. (Learn the command mode keybind)
6. After you finish the editing, go back by swiping right.
7. If you have proper dummyServer.js, you can run locally with your change.
8. You can check diffs before commit.
9. After entering a commit message, you can commit the change.
10. If you have Codeship configured properly, you can deploy it to Heroku.
