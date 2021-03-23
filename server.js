const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const host = 'localhost';
const port = 8000;
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const controller = require(__dirname + '/controller');

let config;

var app = express();

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

app.use(
	session({
	secret: 'rosaelefant',
	saveUninitialized: false,
	resave: false,
	cookie: {sameSite: true}
	})
);

app.use(express.static(__dirname + '/frontend'));

app.get('/', function (req, res) {
	if (req.session.auth){
		return res.redirect('/admin');
	}
	return res.redirect('/login');
});

app.get('/login', function (req, res) {

	req.session.auth = false;
	req.session.destroy(function(err) {
		if (err){
			console.error(err);
		}
		res.sendFile( __dirname + "/frontend/" + "login.html" );
	});
  
});

app.get('/admin', function (req, res) {
	if (!req.session.auth){
		return res.redirect('/login');
	}
	res.sendFile( __dirname + "/frontend/" + "admin.html" );
});

app.get('/get-status', function (req, res) {
	if (!req.session.auth){
		return res.status(403).send("no");
	}
	return res.json(controller.getPVData());
});

app.get('/get-config', function (req, res) {
	if (!req.session.auth){
		return res.status(403).send("no");
	}
	let retConfig = Object.assign({}, config);
	retConfig.password = "";
	return res.json(retConfig);
});

app.post('/set-password', async function (req, res) {
	if (!req.session.auth){
		return res.status(403).send("no");
	}
	
	config.password = await bcrypt.hash(req.body.password, 10); 

	await writeFile(__dirname + '/config.json', JSON.stringify(config, null, 2));
	
	res.send( "ok" );
});

app.post('/set-config', async function (req, res) {
	if (!req.session.auth){
		return res.status(403).send("no");
	}
	let configToSave = Object.assign({}, req.body.config);
	configToSave.password = config.password;

	//Todo some checks

	await writeFile(__dirname +'/config.json', JSON.stringify(configToSave, null, 2));

	config = Object.assign({}, configToSave);

	await controller.callRefresh();
	
	res.send( "ok" );
});

app.post('/login', async function (req, res) {	
	const checkPasswordResult = await bcrypt.compare(req.body.password, config.password);
	if (checkPasswordResult){
		req.session.auth = true;
		res.send( "ok" );
	}else{
		res.status(403).send("no");
	}
	
});


var server = app.listen(port, async function() {  //das async ist noch nicht schön hier
	const data = await readFile(__dirname + '/config.json', 'utf8');
	config = JSON.parse(data);
	console.log("car carger app listening at http://%s:%s", host, port)
})

