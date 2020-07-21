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

const dbFile = 'sqlite.db';
const exists = fs.existsSync(dbFile);
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbFile);

// if sqlite.db does not exist, create it, otherwise print records to console
db.serialize(() => {
  if (!exists) {
    db.run('CREATE TABLE Captions (id INTEGER PRIMARY KEY AUTOINCREMENT, caption TEXT, video TEXT, time TEXT)');
    console.log('New table Captions created!');

    // insert default Captions
    db.serialize(() => {
      // BEGIN TRANSACTION;
      // INSERT INTO 'tablename' table VALUES ('data1', 'data2');
      // INSERT INTO 'tablename' table VALUES ('data3', 'data4');
      // ...
      // COMMIT;
      db.run("INSERT INTO Captions (caption, video, time) VALUES ('Find and count my sheep', 'F-JpyC16bNc', '24'), ('Climb a really tall mountain', 'C-JpyC16baB', '123'), ('Wash the dishes', 'W-JpyC16baB', '1119')");
    });

    db.each('SELECT * from Captions', (err, row) => {
      console.log('row', row);
    });
  } else {
    console.log('Database \'Captions\' ready to go!');
    db.each('SELECT * from Captions', (err, row) => {
      console.log('err:', err);
      console.log('row:', row);
      if (row) {
        console.log(`row: ${row}`);
      }
    });
  }
});

app.get('/', (request, response) => {
  response.sendFile(`${__dirname}/views/index.html`);
});

// endpoint to get all the dreams in the database
app.get('/getAll', (request, response) => {
  db.all('SELECT * from Captions', (err, rows) => {
    console.log('err:', err, 'rows:', rows);
    response.send(JSON.stringify(rows));
  });
});

// endpoint to add a caption
app.post('/add', (request, response) => {
  const captions = request.body.captions;
  console.log(`Add to Captions ${captions}`);

  // DISALLOW_WRITE is an ENV variable that gets reset for new projects
  // so they can write to the database
  if (!process.env.DISALLOW_WRITE) {
    // for caption of captions
    // add caption
    const cleansedText = cleanseString(request.body.captions);
    db.run(
      `INSERT INTO Captions (text, foo) VALUES (?, ?)`,
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
          db.each('SELECT * from Captions', (err, row) => {
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
    db.each('SELECT * from Captions',
      (err, row) => {
        console.log('row', row);
        db.run(`DELETE FROM Captions WHERE ID=?`, row.id, (error) => {
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
  console.log(`Your app is listening on port ${listener.address().port}`);
});
