var hyperquest = require('hyperquest')
var through = require('through2')
var assert = require('assert')

function archiveStream (opts) {
  if (typeof opts === 'string') {
    opts = { repo: opts }
  }

  var repo = opts.repo
  assert.equal(typeof repo, 'string', '.repo required')

  var format = opts.format || 'tarball'
  var ref = opts.ref || 'master'

  var url = [ 'https://api.github.com/repos', repo, format, ref ].join('/')
  var options = {
    headers: {
      'User-Agent': 'github-archive-stream'
    }
  }

  if (opts.auth) {
    assert.equal(typeof opts.auth.user, 'string', '.user required')
    assert.equal(typeof opts.auth.token, 'string', '.token required')
    options.auth = opts.auth.user + ':' + opts.auth.token
  }

  var pass = through()

  var req = hyperquest.get(url, options)
  req.on('response', function (res) {
    var redirect = isRedirect(req.request, res)
    if (typeof redirect !== 'string') {
      return pass.emit('error', new Error(
        'Expected redirect url. Error code: ' + res.statusCode
      ))
    }
    hyperquest.get(redirect, options).pipe(pass)
  })

  return pass
}

function isRedirect (req, res) {
  var codes = [ 301, 302, 307, 308 ]
  return (req.method === 'GET' &&
          codes.indexOf(res.statusCode) !== -1 &&
          res.headers.location)
}

module.exports = archiveStream
