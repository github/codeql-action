const unzip = require('./unzip');
const fs = require('fs');
const http = require('https');
const process = require('process');

console.log('Trying to open', process.argv[2]);

let parser = unzip.Parse({debug: false});
parser.on('end', () => { console.log('ended'); });
//parser.drainAll();

/*
let req = http.get('https://www.colorado.edu/conflict/peace/download/peace_example.ZIP');

req.on('response', (resp) => {
  resp.pipe(parser);
});
*/

fs.createReadStream(process.argv[2]).pipe(parser).on('entry', (e) => {
  console.log("entry", e.path);
  if (!e.isDirectory) {
    //console.log("Data for ", e.path);
    e.on('data', (chunk) => {
      //console.log(e.path, ">>>", chunk.length, "byte chunk > ...");
    });
  }
})

