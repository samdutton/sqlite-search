const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const express = require('express');

const port = process.env.PORT || 9999;

const app = express();
app.use(bodyParser.urlencoded({
  extended: true,
}));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('port', port);
const listener = app.listen(port, () => {
  const host = listener.address().address === '::' ? 'http://localhost' :
    'http://' + listener.address().address;
  console.log(`${__filename} is listening on ${host}:${listener.address().port}\n`);
});

const DB_FILE = 'captions.db';
const TABLE_NAME = 'captions';

const db = new Database(DB_FILE);

app.get('/', (request, response) => {
  console.log('/ request.path', request.path);
  if (request.query.q) {
    console.log('query:', request.query.q);
    response.send(`query:, ${request.query.q}`);
  }
  response.sendFile(`${__dirname}/views/index.html`);
});

app.get('/search', (request, response) => {
  if (request.query.q) {
    console.log('>>> Query received:', request.query.q);
    try {
      search(response, request.query.q.replace(/[^\w-]/g), '');
    } catch (error) {
      console.error('search() error: ', error);
    }
  } else {
    console.log('No query value in search request.');
    response.send('No query value in search request.');
  }
});

// endpoint to get all the dreams in the database
app.get('/all', (request, response) => {
  db.all(`SELECT * from ${TABLE_NAME}`, (error, rows) => {
    console.log('error:', error, 'rows:', rows);
    response.send(JSON.stringify(rows));
  });
});

// Search the database then call sendSearchResult().
function search(response, query) {
  console.log('Query in search():', query);
  const rows =
    db.prepare(`SELECT * FROM ${TABLE_NAME} WHERE text like @query`).all({query: `%${query}%`});
  console.log(rows);
  response.send(rows);
}
