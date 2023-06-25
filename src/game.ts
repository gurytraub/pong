import { EventEmitter } from 'stream';
import * as Matter from 'matter-js';

export default class Game extends EventEmitter {
    private engine: Matter.Engine;
    private paddleWidth = 10;
    private paddleHeight = 80;
    private players: Matter.Body[];
    private ball: Matter.Body;
    private wallTop: Matter.Body;
    private wallBottom: Matter.Body;
    private interval?: NodeJS.Timer;

    readonly BASE_PLAYER_SPEED = 1;
    readonly MAX_PLAYER_SPEED = 2;
    readonly SPEED_ACCELERATION = 0.1;

    constructor() {
        super();

        this.engine = Matter.Engine.create({gravity: { y: 0, x:0 }});
        const paddleOpts = { isStatic: false, isSensor: true };
        
        const [pd, ph] = [this.paddleWidth, this.paddleHeight];
        this.players = [
            Matter.Bodies.rectangle(pd, 160, pd, ph, paddleOpts),
            Matter.Bodies.rectangle(800 - pd - 10, 160, pd, ph, paddleOpts)
        ];
      
        const ball = Matter.Bodies.rectangle(30, 30, 6, 6, {isSensor: true});
        ball.label = "ball";
        ball.friction = 0;
        ball.frictionAir = 0;
        this.ball = ball;
      
        this.wallTop = Matter.Bodies.rectangle(0, 0, 800, 5, { isStatic: true });
        this.wallTop.label = "wallTop";
      
        this.wallBottom = Matter.Bodies.rectangle(0, 395, 800, 5, { isStatic: true });
        this.wallBottom.label = "wallBottom";
        
        Matter.World.add(this.engine.world, [...this.players, ball, this.wallTop, this.wallBottom]);
    }
    
    private collisionHandler(event: Matter.IEventCollision<Matter.Engine>) {
        const pairs = event.pairs;
        console.log('collision');
        console.log({a: pairs[0].bodyA, b: pairs[0].bodyB});
        pairs.forEach(pair => {
            // Check if the ball collides with a paddle
            if (
                (pair.bodyA === this.ball && pair.bodyB === this.players[0]) ||
                (pair.bodyA === this.players[0] && pair.bodyB === this.ball) ||
                (pair.bodyA === this.ball && pair.bodyB === this.players[1]) ||
                (pair.bodyA === this.players[1] && pair.bodyB === this.ball)
            ) {
                // Reverse the ball's velocity in the x-axis
                const oldV = this.ball.velocity.x;
                const newV = -oldV;
                // game.ball.velocity.x = newV;
                Matter.Body.setVelocity(this.ball, {x: newV, y: this.ball.velocity.y})
                console.log('changed v.x from ' + oldV + ' to ' + newV);
                this.emit('ball', {
                    x: this.ball.position.x,
                    y: this.ball.position.y,
                    vx: this.ball.velocity.x,
                    vy: this.ball.velocity.y
                })
            }
        
            if (
                (pair.bodyA === this.ball && pair.bodyB === this.wallTop) ||
                (pair.bodyA === this.wallTop && pair.bodyB === this.ball) ||
                (pair.bodyA === this.ball && pair.bodyB === this.wallBottom) ||
                (pair.bodyA === this.wallBottom && pair.bodyB === this.ball)
            ) {
                // Reverse the ball's velocity in the x-axis
                const oldV = this.ball.velocity.y;
                const newV = -oldV;
                //game.ball.velocity.y = newV;
                Matter.Body.setVelocity(this.ball, {x: this.ball.velocity.x, y: newV})
                console.log('changed v.y from ' + oldV + ' to ' + newV);
            }
        });
    }

    public start(reset: boolean = true) {
        if (reset) {
            Matter.Body.setPosition(this.ball, { x: 30, y: 30 });
            Matter.Body.setVelocity(this.ball, { x: 0.4, y: 0.04 });
        }
        Matter.Events.on(this.engine, 'collisionStart', this.collisionHandler.bind(this));    

        this.interval = setInterval(this.gameLoop.bind(this), 1000 / 60);
    }

    public stop() {
        clearInterval(this.interval);
    }

    public setPlayerVelocity(player: number, velocity: number) {
        if (velocity > 0) {
            velocity = this.BASE_PLAYER_SPEED;
        } else if (velocity < 0) {
            velocity = -this.BASE_PLAYER_SPEED;
        } 
        console.log({velocity});
        Matter.Body.setVelocity(this.players[player], { x: 0, y: velocity});

        this.emit('player', {
            i: player,
            x: this.players[player].position.x,
            y: this.players[player].position.y,
            v: this.players[player].velocity.y,
        })
    }

    private gameLoop() {
        // players acceleration
        for (let i = 0; i < 2; i++) {
            const p = this.players[i];
            if (p.velocity.y != 0) {
                if (p.velocity.y > 0 && p.velocity.y < this.MAX_PLAYER_SPEED) {
                    p.velocity.y = Math.min(p.velocity.y + this.SPEED_ACCELERATION, this.MAX_PLAYER_SPEED);
                } else if (p.velocity.y > -this.MAX_PLAYER_SPEED) {
                    p.velocity.y = Math.max(p.velocity.y - this.SPEED_ACCELERATION, -this.MAX_PLAYER_SPEED);
                }
            }
        }
        Matter.Engine.update(this.engine);
    }

    public World() {
        return this.engine.world;
    }
}
