let app = require('express')(),
	http = require('http').Server(app),
	io = require('socket.io')(http);

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
  socket.broadcast.emit('hey moin');
  io.emit('this', { will: 'be received by everyone'});

  socket.on('chat message', function(msg){
    console.dir(msg);
    io.emit('chat message', msg);
  });

    socket.on('disconnect', function () {
        io.emit('user disconnected');
    });
});



http.listen(3000, function(){
  console.log('listening on *:3000');
});