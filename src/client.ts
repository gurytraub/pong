import * as io from 'socket.io-client';

// Connect to the server
const socket = io.connect('http://localhost:3000');

// Handle the 'connect' event
socket.on('connect', () => {
  console.log('Connected to server');
});

// Handle the 'message' event
socket.on('start', (data: string) => {
  console.log('game started');
});

// Send a message to the server
socket.emit('message', 'Hello, server!');