// init project
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const fs = require('fs');

app.use(bodyParser.urlencoded({
  extended: true,
}));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('port', 9999);

const DB_FILE = 'sqlite.db';
const DB_NAME = 'captions';

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_FILE, (error) => {
  if (error) {
    return console.error(error.message);
  }
  console.log(`Connected to in-memory SQLite database ${DB_FILE}.`);
});

const captions = [{video: 'F-JpyC16bNc', time: '24', text: 'Find and count my sheep'},
  {video: 'C-JpyC16baB', time: '123', text: 'Climb a really tall mountain'},
  {video: 'W-JpyC16baB', time: '1119', text: 'Wash the dishes'}];
const values = [];
for (const caption of captions) {
  const value = `('${caption.video}', '${caption.time}', '${caption.text}')`;
  values.push(value);
}

db.serialize(() => {
  if (!fs.existsSync(DB_FILE)) {
    db.run(`CREATE TABLE ${DB_NAME} (video TEXT, time TEXT, text TEXT)`, (error) => {
      if (error) {
        return console.error('Error creating table:', error.message);
        process.exit(1);
      };
    });
    console.log(`New table '${DB_NAME}' created.`);
    db.run(`INSERT INTO ${DB_NAME} VALUES ${values.join(',')}`);
  } else {
    console.log(`Database '${DB_NAME}' already exists.`);
  }
  logCaptions();
});

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
    search(response, request.query.q);
  } else {
    console.log('No query');
    response.send('No query');
  }
});

// endpoint to get all the dreams in the database
app.get('/getAll', (request, response) => {
  db.all(`SELECT * from ${DB_NAME}`, (error, rows) => {
    console.log('error:', error, 'rows:', rows);
    response.send(JSON.stringify(rows));
  });
});

// endpoint to add a caption
app.post('/add', (request, response) => {
  const captions = request.body.captions;
  console.log(`Add to ${DB_NAME}:`, captions);

  // DISALLOW_WRITE is an ENV variable that gets reset for new projects
  // so they can write to the database
  if (!process.env.DISALLOW_WRITE) {
    // for caption of captions
    // add caption
    const cleansedText = cleanseString(captions);
    db.run(
      `INSERT INTO ${DB_NAME} (text, foo) VALUES (?, ?)`,
      cleansedText,
      'fdasfs',
      (error) => {
        if (error) {
          console.log('error!!!', error);
          response.send({
            message: 'error!',
          });
        } else {
          console.log('success!!!');
          response.send({
            message: 'success',
          });
          db.each(`SELECT * from ${DB_NAME}`, (err, row) => {
            if (row) {
              console.log(`record: ${row.foo}`);
            }
          });
        }
      });
  }
});

// endpoint to clear Captions from the database
app.get('/clearCaptions', (request, response) => {
  // DISALLOW_WRITE is an ENV variable that gets reset for new projects so you can write to the database
  if (!process.env.DISALLOW_WRITE) {
    db.each(`SELECT * from ${DB_NAME}`,
      (err, row) => {
        console.log('row', row);
        db.run(`DELETE FROM ${DB_NAME} WHERE ID=?`, row.id, (error) => {
          if (row) {
            console.log(`deleted row ${row.id}`);
          }
        });
      },
      (error) => {
        if (error) {
          response.send({
            message: 'error!',
          });
        } else {
          response.send({
            message: 'success',
          });
        }
      });
  }
});

// helper function that prevents html/css/script malice
const cleanseString = (string) => {
  return string.replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

// listen for requests :)
const listener = app.listen(process.env.PORT || 9999, () => {
  console.log(`App is listening on port ${listener.address().port}`);
});

// Search the database then call sendSearchResult().
function search(response, query) {
  console.log('Query in search():', query);
  db.serialize(() => {
    db.all(`SELECT * FROM ${DB_NAME} WHERE text LIKE '%${query}%'`, (error, rows) => {
      if (error) {
        console.error('search() error:', error.message);
      } else {
        response.send(rows);
      }
    });
  });
}

// function closeDatabase() {
//   db.close((error) => {
//     if (error) {
//       return console.error(error.message);
//     }
//     console.log(`Closed connection to '${DB_NAME}' database.`);
//   });
// }

function logCaptions() {
  db.all(`SELECT * from ${DB_NAME}`, (error, rows) => {
    if (error) {
      console.error('logCaptions() error:', error);
      process.exit(1);
    }
    for (const row of rows) {
      console.log('row:', row);
    }
  });
}
