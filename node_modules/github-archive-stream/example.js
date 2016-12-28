var archive = require('./')
archive('ipfs/go-ipfs').pipe(require('fs').createWriteStream('ipfs.tar.gz'))
