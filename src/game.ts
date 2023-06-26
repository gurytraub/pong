import { EventEmitter } from 'stream';
import * as Matter from 'matter-js';

export enum GameMode { CLIENT, SERVER };

export default class Game extends EventEmitter {
    protected engine: Matter.Engine;
    protected players: Matter.Body[];
    protected scores: number[];
    protected ball: Matter.Body;
    protected active: boolean = false;
    protected mode: GameMode;

    protected lastUpdate: number = 0;

    readonly BASE_PLAYER_SPEED = 1;
    readonly MAX_PLAYER_SPEED = 2;
    readonly SPEED_ACCELERATION = 0.05;
    readonly BOARD_WIDTH = 800;
    readonly BOARD_HEIGHT = 400;
    readonly BOARD_HCENTER = this.BOARD_WIDTH * 0.5;
    readonly BOARD_VCENTER = this.BOARD_HEIGHT * 0.5;
    readonly PADDLE_WIDTH = 10;
    readonly PADDLE_HEIGHT = 80;
    readonly BALL_RADIUS = 5;
    readonly BALL_SPEED = 2;

    constructor(mode: GameMode) {
        super();

        this.mode = mode;
        this.engine = Matter.Engine.create({ gravity: { y: 0, x: 0 } });
        const paddleOpts = { isStatic: false, isSensor: true };

        const [pd, ph] = [this.PADDLE_WIDTH, this.PADDLE_HEIGHT];
        this.players = [
            Matter.Bodies.rectangle(pd, this.BOARD_VCENTER - (this.PADDLE_HEIGHT * 0.5), pd, ph, paddleOpts),
            Matter.Bodies.rectangle(this.BOARD_WIDTH - pd - 10, this.BOARD_VCENTER - (this.PADDLE_HEIGHT * 0.5), pd, ph, paddleOpts)
        ];
        this.players[0].label = "player0";
        this.players[1].label = "player1";

        const ball = Matter.Bodies.rectangle(
            this.BOARD_WIDTH * 0.5 - this.BALL_RADIUS, this.BOARD_HEIGHT * 0.5 - this.BALL_RADIUS,
            this.BALL_RADIUS * 2, this.BALL_RADIUS * 2, { isSensor: true });
        ball.label = 'ball';
        ball.friction = 0;
        ball.frictionAir = 0;
        this.ball = ball;
        this.scores = [0, 0];

        Matter.World.add(this.engine.world, [...this.players, ball]);
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
        }
    }

    public start(reset: boolean = true) {
        if (this.mode === GameMode.SERVER && reset) {
            this.resetBall();
            this.scores = [0, 0];
        }
        Matter.Events.on(this.engine, 'collisionStart', this.collisionHandler.bind(this));
        this.lastUpdate = (new Date()).getTime();
        this.active = true;
        this.gameLoop();
    }

    public stop() {
        this.active = false;
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

    public resetBall() {
        let vx = Math.random() + 0.8;
        let vy = Math.sqrt(this.BALL_SPEED * this.BALL_SPEED - vx * vx)
        if (Math.random() > 0.5) {
            vx = -vx;
        }
        if (Math.random() > 0.5) {
            vy = -vy;
        }

        this.setBall(this.BOARD_HCENTER, this.BOARD_VCENTER, vx, vy);
    }

    protected requestAnimationFrame() {
        setTimeout(this.gameLoop.bind(this), 1000 / 60);
    }

    protected gameLoop() {
        if (!this.active) {
            return;
        }
        if (this.mode === GameMode.SERVER) {
            // ball collision
            const bp = this.ball.position;
            if (bp.y < 0 || bp.y > this.BOARD_HEIGHT - this.BALL_RADIUS * 2) {
                this.setBall(bp.x, bp.y, this.ball.velocity.x, -this.ball.velocity.y);
            }
            if (bp.x < 0) {
                this.scores[0]++;
                this.emit('score', { i: 0, scores: this.scores });
                this.resetBall();
            } else if (bp.x > this.BOARD_WIDTH - this.BALL_RADIUS * 2) {
                this.scores[1]++;
                this.emit('score', { i: 1, scores: this.scores });
                this.resetBall();
            }
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
        }

        const now = (new Date()).getTime();
        const delta = now - this.lastUpdate;
        Matter.Engine.update(this.engine, delta);
        this.lastUpdate = now;

        this.requestAnimationFrame();
    }

    public World() {
        return this.engine.world;
    }
}
