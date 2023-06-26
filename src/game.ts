import { EventEmitter } from 'stream';
import * as Matter from 'matter-js';

export enum GameMode { CLIENT, SERVER };

export default class Game extends EventEmitter {
    protected engine: Matter.Engine;
    protected paddleWidth = 10;
    protected paddleHeight = 80;
    protected players: Matter.Body[];
    protected ball: Matter.Body;
    protected wallTop: Matter.Body;
    protected wallBottom: Matter.Body;
    protected interval?: NodeJS.Timer;
    protected mode: GameMode;

    protected lastUpdate: number = 0;

    readonly BASE_PLAYER_SPEED = 1;
    readonly MAX_PLAYER_SPEED = 2;
    readonly SPEED_ACCELERATION = 0.05;

    constructor(mode: GameMode) {
        super();

        this.mode = mode;
        this.engine = Matter.Engine.create({ gravity: { y: 0, x: 0 } });
        const paddleOpts = { isStatic: false, isSensor: true };

        const [pd, ph] = [this.paddleWidth, this.paddleHeight];
        this.players = [
            Matter.Bodies.rectangle(pd, 160, pd, ph, paddleOpts),
            Matter.Bodies.rectangle(800 - pd - 10, 160, pd, ph, paddleOpts)
        ];

        const ball = Matter.Bodies.rectangle(394, 194, 6, 6, { isSensor: true });
        ball.label = 'ball';
        ball.friction = 0;
        ball.frictionAir = 0;
        this.ball = ball;

        this.wallTop = Matter.Bodies.rectangle(0, 0, 800, 5, { isStatic: true });
        this.wallTop.label = 'wallTop';

        this.wallBottom = Matter.Bodies.rectangle(0, 395, 800, 5, { isStatic: true });
        this.wallBottom.label = 'wallBottom';

        Matter.World.add(this.engine.world, [...this.players, ball, this.wallTop, this.wallBottom]);
    }

    private collisionHandler(event: Matter.IEventCollision<Matter.Engine>) {
        const b = this.ball;
        for (const pair of event.pairs) {
            for (const player of this.players) {
                if (pair.bodyA === b && pair.bodyB === player ||
                    pair.bodyA === player && pair.bodyB === b
                ) {
                    if (this.mode === GameMode.SERVER) {
                        // Reverse the ball's velocity in the x-axis
                        this.setBall(b.position.x, b.position.y, -b.velocity.x, b.velocity.y);
                    } else {
                        this.setBall(b.position.x, b.position.y, 0, 0);
                    }
                    break;
                }
            }
            for (const wall of [this.wallTop, this.wallBottom]) {
                if (pair.bodyA === this.ball && pair.bodyB === wall ||
                    pair.bodyA === wall && pair.bodyB === this.ball
                ) {
                    // Reverse the ball's velocity in the x-axis
                    this.setBall(b.position.x, b.position.y, b.velocity.x, -b.velocity.y);
                    break;
                }
            }
        }
    }

    public start(reset: boolean = true) {
        if (this.mode === GameMode.SERVER && reset) {
            this.setBall(30, 30, 0.4, 0.04);
        }
        Matter.Events.on(this.engine, 'collisionStart', this.collisionHandler.bind(this));
        this.lastUpdate = (new Date()).getTime();
        this.interval = setInterval(this.gameLoop.bind(this), 1000 / 60);
    }

    public stop() {
        clearInterval(this.interval);
    }

    public setPlayer(i: number, y: number, vy: number) {
        const p = this.players[i];
        if (vy > 0) {
            vy = this.BASE_PLAYER_SPEED;
        } else if (vy < 0) {
            vy = -this.BASE_PLAYER_SPEED;
        }

        Matter.Body.setPosition(p, { x: p.position.x, y });
        Matter.Body.setVelocity(p, { x: 0, y: vy });

        this.emit('player', { i, y, vy });
    }

    public movePlayer(i: number, direction: number) {
        const p = this.players[i];
        let vy = 0;
        if (direction > 0) {
            vy = this.BASE_PLAYER_SPEED;
        } else if (direction < 0) {
            vy = -this.BASE_PLAYER_SPEED;
        }
        this.setPlayer(i, p.position.y, vy);
    }

    public setBall(x: number, y: number, vx: number, vy: number) {
        Matter.Body.setPosition(this.ball, { x, y });
        Matter.Body.setVelocity(this.ball, { x: vx, y: vy });
        this.emit('ball', {
            x: this.ball.position.x,
            y: this.ball.position.y,
            vx: this.ball.velocity.x,
            vy: this.ball.velocity.y
        });
    }

    protected gameLoop() {
        // players acceleration
        for (let i = 0; i < 2; i++) {
            const p = this.players[i];

            if (p.velocity.y != 0) {
                if (p.velocity.y > 0 && p.velocity.y < this.MAX_PLAYER_SPEED) {
                    this.setPlayer(i, p.position.y, Math.min(p.velocity.y + this.SPEED_ACCELERATION, this.MAX_PLAYER_SPEED));
                } else if (p.velocity.y > -this.MAX_PLAYER_SPEED) {
                    this.setPlayer(i, p.position.y, Math.max(p.velocity.y - this.SPEED_ACCELERATION, -this.MAX_PLAYER_SPEED));
                }
            }
        }

        const now = (new Date()).getTime();
        const delta = now - this.lastUpdate;
        Matter.Engine.update(this.engine, delta);
        this.lastUpdate = now;

    }

    public World() {
        return this.engine.world;
    }
}
