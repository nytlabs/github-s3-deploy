# github-archive-stream

Streams a `.tar.gz` (or `.zip`) archive from GitHub using the [archive link api](https://developer.github.com/v3/repos/contents/#get-archive-link). It makes two http requests since the first is _always_ a `30x` redirect response.

```
$ npm i github-archive-stream -S
```

[![build status](http://img.shields.io/travis/ralphtheninja/github-archive-stream.svg?style=flat)](http://travis-ci.org/ralphtheninja/github-archive-stream)

## Usage

Stream latest master branch of `ipfs/go-ipfs` to the file `'ipfs.tar.gz'`.

```js
var archive = require('github-archive-stream')
archive('ipfs/go-ipfs').pipe(require('fs').createWriteStream('ipfs.tar.gz'))
```

## API

#### `var stream = archive(repo|opts)`

Create an archive stream.

Parameter can either be a string or an object. Use the string version to stream an open source archive. For private repositories you need to provide the `opts.auth` property, see below.

Options takes the following properties:

```js
{
  repo: 'user/repo',      // github repository, required
  auth: {
    user: 'username',     // github user, required if private repo
    token: 'agithubtoken' // github token, required if private repo
  },
  ref: '315ae99',         // git ref, defaults to 'master'
  format: 'zipball'       // archive format, defaults to 'tarball'
}
```

## License

MIT
