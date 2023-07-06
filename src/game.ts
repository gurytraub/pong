import { EventEmitter } from 'stream';

interface Vector2D {
    x: number;
    y: number;
}

interface Body {
    position: Vector2D;
    velocity: Vector2D;
    size: Vector2D;
}

function intersect(body1: Body, body2: Body): boolean {
    const body1Right = body1.position.x + body1.size.x;
    const body1Bottom = body1.position.y + body1.size.y;
    const body2Right = body2.position.x + body2.size.x;
    const body2Bottom = body2.position.y + body2.size.y;
  
    return (
        body1.position.x < body2Right &&
        body1Right > body2.position.x &&
        body1.position.y < body2Bottom &&
        body1Bottom > body2.position.y
    );
}

export default class Game extends EventEmitter {
    readonly BASE_PLAYER_SPEED = 180;
    readonly MAX_PLAYER_SPEED = 260;
    readonly SPEED_ACCELERATION = 20;
    readonly BOARD_WIDTH = 800;
    readonly BOARD_HEIGHT = 400;
    readonly BOARD_HCENTER = this.BOARD_WIDTH * 0.5;
    readonly BOARD_VCENTER = this.BOARD_HEIGHT * 0.5;
    readonly PADDLE_WIDTH = 10;
    readonly PADDLE_HEIGHT = 80;
    readonly BALL_RADIUS = 5;
    readonly BASE_BALL_SPEED = 150;

    protected players: Body[];
    protected scores: number[];
    protected ball: Body;

    protected ballSpeed: number = this.BASE_BALL_SPEED;
    protected lastUpdate: number = 0;
    protected loopInterval?: NodeJS.Timeout;

    constructor() {
        super();

        const paddleOpts = { isStatic: false, isSensor: true };

        const [pd, ph] = [this.PADDLE_WIDTH, this.PADDLE_HEIGHT];
        const py = this.BOARD_VCENTER - (this.PADDLE_HEIGHT * 0.5);
        this.players = [
            { position: { x: pd, y: py }, velocity: { x: 0, y: 0 }, size: { x: pd, y: ph } },
            { position: { x: this.BOARD_WIDTH - (2 * pd), y: py }, velocity: { x: 0, y: 0 }, size: { x: pd, y: ph } }
        ];
        for (let i = 0; i < this.players.length; i++) {
            this.setPlayer(i, py, 0);
        }

        const ball: Body = {
            position: { x: this.BOARD_WIDTH * 0.5 - this.BALL_RADIUS, y: this.BOARD_HEIGHT * 0.5 - this.BALL_RADIUS },
            size: { x: this.BALL_RADIUS * 2, y: this.BALL_RADIUS * 2 },
            velocity: { x: 0, y: 0 }
        }
        this.ball = ball;
        this.setBall(ball.position.x, ball.position.y, 0, 0);
        this.scores = [0, 0];
    }

    public start(reset: boolean = true) {
        if (reset) {
            this.resetBall();
            this.scores = [0, 0];
        }
        this.lastUpdate = (new Date()).getTime();
        this.loopInterval = setInterval(this.gameLoop.bind(this), 1000 / 120);
    }

    public stop() {
        if (this.loopInterval) {
            clearInterval(this.loopInterval);
            this.loopInterval = undefined;
        }
    }

    public setPlayer(i: number, y: number, vy: number) {
        if (y < 0 || y + this.PADDLE_HEIGHT > this.BOARD_HEIGHT) {
            return;
        }
        
        const p = this.players[i];
        if (vy > 0) {
            vy = this.BASE_PLAYER_SPEED;
        } else if (vy < 0) {
            vy = -this.BASE_PLAYER_SPEED;
        }

        p.position.y = y;
        p.velocity.y = vy;
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
        this.ball.position = { x, y };
        this.ball.velocity = { x: vx, y: vy };
        this.emit('ball', {
            x: this.ball.position.x,
            y: this.ball.position.y,
            vx: this.ball.velocity.x,
            vy: this.ball.velocity.y
        });
    }

    public resetBall() {
        let vx = Math.random() + this.ballSpeed * 0.5;
        let vy = Math.sqrt(this.ballSpeed * this.ballSpeed - vx * vx)
        if (Math.random() > 0.5) {
            vx = -vx;
        }
        if (Math.random() > 0.5) {
            vy = -vy;
        }

        this.setBall(this.BOARD_HCENTER, this.BOARD_VCENTER, vx, vy);
    }

    protected gameLoop() {
        // update ball position
        const now = (new Date()).getTime();
        const dt = now - this.lastUpdate;
        this.lastUpdate = now;
        const bp = this.ball.position;
        const bv = this.ball.velocity;
        this.ball.position = { x: bp.x + bv.x * dt * 0.001, y: bp.y + bv.y * dt * 0.001 };


        // ball <-> screen boundary collisions
        const vy = Math.abs(this.ball.velocity.y);
        const maxY = this.BOARD_HEIGHT - this.BALL_RADIUS * 2;
        if (bp.y < 0) {
            this.setBall(bp.x, 0, this.ball.velocity.x, vy);
        } else if (bp.y > maxY) {
            this.setBall(bp.x, maxY, this.ball.velocity.x, -vy);
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

        const b = this.ball;
        for (let i = 0; i < 2; i++) {
            // update player position and velocity
            const p = this.players[i];
            const py = p.position.y + p.velocity.y * dt * 0.001;

            let pv = p.velocity.y;
            if (pv != 0) {
                if (p.velocity.y > 0 && p.velocity.y < this.MAX_PLAYER_SPEED) {
                    pv = Math.min(p.velocity.y + this.SPEED_ACCELERATION, this.MAX_PLAYER_SPEED);
                } else if (p.velocity.y > -this.MAX_PLAYER_SPEED) {
                    pv = Math.max(p.velocity.y - this.SPEED_ACCELERATION, -this.MAX_PLAYER_SPEED);
                }
            }
            if (p.position.y != py || p.velocity.y != pv) {
                this.setPlayer(i, py, pv);
            }

            // ball <-> paddle collisions
            if (intersect(p, b)) {
                const max = this.ballSpeed * 0.85;
                const vv = this.ballSpeed * this.ballSpeed;
                const vy = Math.max(-max, Math.min(p.velocity.y * 0.5 + b.velocity.y, max));
                const vx = Math.sqrt(vv - vy * vy) * (i === 0 ? 1 : -1); // set x velocity AND direction by player index
                this.setBall(b.position.x, b.position.y, vx, vy);
                this.emit('hit', { i, x: b.position.x, y: b.position.y });
                break;
            }
        }
    }

}
