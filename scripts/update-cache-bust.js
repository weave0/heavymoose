// updates cache-bust.txt with the current ISO timestamp
// run: node scripts/update-cache-bust.js

'use strict';

const fs = require('fs');
const path = require('path');

const bustFile = path.join(__dirname, '..', 'cache-bust.txt');
const stamp = new Date().toISOString();

fs.writeFileSync(bustFile, stamp + '\n', 'utf8');
console.log('cache-bust.txt updated:', stamp);
