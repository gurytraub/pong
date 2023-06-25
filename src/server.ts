import * as express  from 'express';
import * as http from 'http';
import { Socket, Server as SocketIOServer } from "socket.io";
import * as Matter from 'matter-js'
import * as cors from 'cors';

import Game from './game';
class GameManager {
    private socketsToPlayers: { [key: string]: number } = {};
    private playersCount: number;
    private game: Game;
    private io: SocketIOServer;
    private server: http.Server;
    
    readonly PORT = 3000;

    constructor() {
        const app = express();
        this.server = http.createServer(app);
        this.io = new SocketIOServer(this.server, {
          cors: {
            origin: "http://localhost:8080",
            methods: ["GET", "POST"]
        }});
        
        // Set up the static file server
        app.use(express.static('public'));
        app.use(cors());
        
        this.playersCount = 0;
        this.socketsToPlayers = {};
        this.game = new Game();
    }

    public listen() {
        // Start the server
        this.server.listen(this.PORT, () => {
            console.log(`Game-Server running on port ${this.PORT}`);
        });
        this.io.on('connection', this.onConnection.bind(this));
    }

    private onConnection(socket: Socket) {
        if (this.playersCount < 2) {
            this.socketsToPlayers[socket.id] = this.playersCount;
            socket.emit('player', this.playersCount);
            console.log(`Player ${this.playersCount} connected`);

            socket.on('disconnect', () => {
                const index = this.socketsToPlayers[socket.id];
                if (index != null) {
                    console.log(`Player ${index} disconnected`);
                    this.playersCount--;
                    if (this.playersCount == 0) {
                        this.resetGame();
                    }
                }
            });

            socket.on('move', movement => {
                console.log('paddle movement event', movement);
                this.game.setPlayerVelocity(this.playersCount, movement.v)
            });

            this.playersCount++;

            if (this.playersCount == 2) {
                this.game.start();
            }

        } else {
            socket.emit('message', 'Game in progress. Please try again later.');
            console.log('3rd player rejected');
        }

    }
    

    private resetGame() {
        if (this.game) {
            Matter.World.clear(this.game.World(), true);
            this.game = new Game();
            this.playersCount = 0;
            this.socketsToPlayers = {};
        }  
    }
}


const gameManager = new GameManager();
gameManager.listen();