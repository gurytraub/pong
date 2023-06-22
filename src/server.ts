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
const socketsToPlayers: { [key: string]: number } = {};
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
  const paddleOpts = { isStatic: false, isSensor: true };

  const player1 = Matter.Bodies.rectangle(paddleWidth, 160, paddleWidth, paddleHeight, paddleOpts);
  player1.label = "player1";
  const player2 = Matter.Bodies.rectangle(800 - paddleWidth - 10, 160, paddleWidth, paddleHeight, paddleOpts);
  player2.label = "player2";

  const ball = Matter.Bodies.rectangle(30, 30, 6, 6, {isSensor: true});
  ball.label = "ball";
  Matter.Body.setVelocity(ball, {x: 2, y: 2});
  ball.friction = 0;
  ball.frictionAir = 0;

  const wallTop = Matter.Bodies.rectangle(0, 0, 800, 5, { isStatic: true });
  wallTop.label = "wallTop";

  const wallBottom = Matter.Bodies.rectangle(0, 395, 800, 5, { isStatic: true });
  wallBottom.label = "wallBottom";
  
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

  Matter.Events.on(engine, 'collisionStart', event => {
    const pairs = event.pairs;
    console.log('collision');
    console.log({a: pairs[0].bodyA, b: pairs[0].bodyB});
    pairs.forEach(pair => {
      // Check if the ball collides with a paddle
      if (
        (pair.bodyA === game.ball && pair.bodyB === game.player1) ||
        (pair.bodyA === game.player1 && pair.bodyB === game.ball) ||
        (pair.bodyA === game.ball && pair.bodyB === game.player2) ||
        (pair.bodyA === game.player2&& pair.bodyB === game.ball)
      ) {
        // Reverse the ball's velocity in the x-axis
        const oldV = game.ball.velocity.x;
        const newV = -oldV;
        // game.ball.velocity.x = newV;
        Matter.Body.setVelocity(ball, {x: newV, y: game.ball.velocity.y})
        console.log('changed v.x from ' + oldV + ' to ' + newV);
      }

      if (
        (pair.bodyA === game.ball && pair.bodyB === game.wallTop) ||
        (pair.bodyA === game.wallTop && pair.bodyB === game.ball) ||
        (pair.bodyA === game.ball && pair.bodyB === game.wallBottom) ||
        (pair.bodyA === game.wallBottom&& pair.bodyB === game.ball)
      ) {
          // Reverse the ball's velocity in the x-axis


        const oldV = game.ball.velocity.y;
        const newV = -oldV;
        //game.ball.velocity.y = newV;
        Matter.Body.setVelocity(ball, {x: game.ball.velocity.x, y: newV})
        console.log('changed v.y from ' + oldV + ' to ' + newV);
      }
    });
  });

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
  // console.log(s.wallBottom.position?.x, s.wallBottom.position?.y, s.ball.position?.x, s.ball.position?.y);
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
    socketsToPlayers[socket.id] = 1;
    socket.emit('player', 1);
    console.log('Player 1 connected');
  } else if (!players.player2) {
    players.player2 = 2;
    socketsToPlayers[socket.id] = 2;
    socket.emit('player', 2);
    console.log('Player 2 connected');
    
    io.emit('start');
    Matter.Body.setVelocity(game.ball, {x:0, y: 0});
    

  } else {
    socket.emit('message', 'Game in progress. Please try again later.');
  }

  socket.on('paddleMovement', movement => {
    console.log('paddle movement event', movement);
    if (socketsToPlayers[socket.id] === 1) {
      Matter.Body.setPosition(game!.player1, {
        x: game!.player1.position.x,
        y: movement.y,
      });
      console.log('set position was done');
    } else if (socketsToPlayers[socket.id] === 2) {
      Matter.Body.setPosition(game!.player2, {
        x: game!.player2.position.x,
        y: movement.y,
      });
      console.log('set position was done');
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    // if (players[socket.id]) {
    //   delete players[socket.id];
      
    //   if (game) {
    //     Matter.World.remove(game.world, [game.player1, game.player2]);
    //   }

    //   if (Object.keys(players).length === 0) {
    resetGame();
    //   }
    // }
  });
});

// Game loop
setInterval(() => {
  if (game) {
    updateGame();
  }
}, 1000 / 60);
