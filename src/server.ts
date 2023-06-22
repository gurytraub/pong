import * as express  from 'express';
import * as http from 'http';
import { Server as SocketIOServer } from "socket.io";
import * as Matter from 'matter-js'
import * as cors from 'cors';
// import { SDK} from 'agones-sdk';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "http://localhost:1234",
    methods: ["GET", "POST"]
}});
// const agones = new SDK();

// Set up the static file server
app.use(express.static('public'));
app.use(cors());

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Game-Server running on port ${PORT}`);
  // agones.ready();
});

// Game logic
let game: Game | null = null;
const players: { [key: string]: number } = {};

interface Game {
  engine: Matter.Engine;
  world: Matter.World;
  player1: Matter.Body;
  player2: Matter.Body;
  ball: Matter.Body;
  wallTop: Matter.Body;
  wallBottom: Matter.Body;
}

const createGame = (): Game => {
  const engine = Matter.Engine.create({gravity: {y: 0, x:0 }});
  const world = engine.world;

  const paddleWidth = 10;
  const paddleHeight = 80;
  const paddleOpts = { isStatic: true };

  const player1 = Matter.Bodies.rectangle(paddleWidth, 200, paddleWidth, paddleHeight, paddleOpts);
  const player2 = Matter.Bodies.rectangle(800 - paddleWidth, 200, paddleWidth, paddleHeight, paddleOpts);

  const ball = Matter.Bodies.circle(150, 200, 10);
  Matter.Body.setPosition(ball, {x: 50, y: 50});

  const wallTop = Matter.Bodies.rectangle(400, -10, 800, 20, { isStatic: true });
  const wallBottom = Matter.Bodies.rectangle(400, 410, 800, 20, { isStatic: true });

  Matter.World.add(world, [player1, player2, ball, wallTop, wallBottom]);

  const game: Game = {
    engine,
    world,
    player1,
    player2,
    ball,
    wallTop,
    wallBottom,
  };

  return game;
};
const getGameState = () => {
  return {
    player1: {bounds: game?.player1.bounds, position: game?.player1.position},
    player2: {bounds: game?.player2.bounds, position: game?.player2.position},
    ball: {bounds: game?.ball.bounds, position: game?.ball.position},    
    wallTop: {bounds: game?.wallTop.bounds, position: game?.wallTop.position},
    wallBottom: {bounds: game?.wallBottom.bounds, position: game?.wallBottom.position},
  };
};

const updateGame = () => {
  Matter.Engine.update(game!.engine);
  const s = getGameState();
  // console.log({state: s});
  io.emit('gameState', s);
};

const resetGame = () => {
  if (game) {
    Matter.World.clear(game.world, true);
    game = null;
  }
  players.player1 = 0;
  players.player2 = 0;
};

// Socket.io logic
io.on('connection', socket => {
  console.log(`New player connected: ${socket.id}`);

  if (!game) {
    game = createGame();
  }

  if (!players.player1) {
    players.player1 = 1;
    socket.emit('player', 1);
    console.log('Player 1 connected');
  } else if (!players.player2) {
    players.player2 = 2;
    socket.emit('player', 2);
    console.log('Player 2 connected');
    
    io.emit('start');
    Matter.Body.setVelocity(game.ball, {x:0, y: 0});
    

  } else {
    socket.emit('message', 'Game in progress. Please try again later.');
  }

  socket.on('paddleMovement', movement => {
    if (players[socket.id] === 1) {
      Matter.Body.setPosition(game!.player1, {
        x: game!.player1.position.x,
        y: movement.y,
      });
    } else if (players[socket.id] === 2) {
      Matter.Body.setPosition(game!.player2, {
        x: game!.player2.position.x,
        y: movement.y,
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (players[socket.id]) {
      const playerNumber = players[socket.id];
      delete players[socket.id];
      
      if (game) {
        Matter.World.remove(game.world, [game.player1, game.player2]);
      }

      if (Object.keys(players).length === 0) {
        resetGame();
      }
    }
  });
});

// Game loop
setInterval(() => {
  if (game) {
    updateGame();
  }
}, 1000 / 60);
