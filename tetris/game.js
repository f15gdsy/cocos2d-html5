/**
 * @enum {number}
 */
var GAME_STATES = {
	RUNNING:      0,
	PAUSED:       1,
	REMOVING_ROW: 2,
	OVER:         3
};

/**
 * returns a simple hash from the point coords.
 * Assumes coords are never greater than 0xff (which should be just
 * fine for our game)
 * @return {number}
 */
var hashFromCoord = function (point) {
	return (0xffff & ((point.x << 8) | point.y));
};

/**
 * @type {Object}
 */
var Game = {};

/**
 * @const
 * @type {number}
 */
Game.TILE_SIZE = 24;

/**
 * @const
 * @type {number}
 */
Game.COLS = 13;

/**
 * @const
 * @type {number}
 */
Game.ROWS = 20;

/**
 * The main game scene
 * @type {?CCScene}
 */
Game.scene = null;

/**
 * The current game state
 * @type {number}
 */
Game.state = GAME_STATES.RUNNING;

/**
 * The current speed of the game
 */
Game.speed = 0.200;

/**
 * Internal time accumulator
 * @type {number}
 * @ignore
 */
Game.__timeAccum = 0.0;

/**
 * @type {?Block}
 */
Game.currentBlock = null;

/**
 * The matrix for the game
 * @type {?Array.<number>}
 */
Game.matrix = null;

/**
 * The batch node
 * @type {?CCSpriteBatchNode}
 */
Game.batchNode = null;

/**
 * adds a new random block at the top of the screen
 */
Game.addNewBlock = function (scene) {
	Game.currentBlock = Block.random();
	Game.currentBlock.setPosition(5, Game.ROWS - 1);
	Game.currentBlock.addToScene(scene);
    Game.fast = false;
};

/**
 * just debugs the internal matrix
 */
Game.debugMatrix = function () {
	for (var j=Game.ROWS - 1; j >= 0; j--) {
		var arr = [];
		for (var i=0; i < Game.COLS; i++) {
			if (this.matrix[j*Game.COLS + i] > 0) {
				arr.push(1);
			} else {
				arr.push(0);
			}
		}
		cc.LOG("" + arr.join(" "));
	}
};

/**
 * Will copy a block to the game matrix and add the needed
 * sprites to fill in the colors
 * @param {Block} block
 */
Game.copyToMatrix = function (block) {
	var cols = block.cols;
	for (var j=0; j < cols; j++) {
		for (var i=0; i < cols; i++) {
			if (block.matrix[j * cols + i] > 0) {
				var pos = new cc.Point(block.position.x + i, block.position.y + (cols - j) - 1);
				// cc.LOG("creating block for matrix in " + pos.x + "," + pos.y);
				this.matrix[pos.y * Game.COLS + pos.x] = 1;
				var sprite = cc.Sprite.spriteWithSpriteFrameName(COLOR_NAMES[block.color]);
				sprite.setTag(hashFromCoord(pos));
				sprite.setAnchorPoint(new cc.Point(0, 0));
				sprite.setPosition(new cc.Point(pos.x * Game.TILE_SIZE, pos.y * Game.TILE_SIZE));
				this.batchNode.addChild(sprite);
			}
		}
	}
	// this.debugMatrix();
};

/**
 * will check the matrix for full lines, and if so, then remove those lines
 */
Game.checkLines = function () {
	for (var j=0; j < Game.ROWS; j++) {
		var full = true;
		for (var i=0; i < Game.COLS; i++) {
			var hasBlock = false;
			if (this.matrix[j * Game.COLS + i] > 0) {
				hasBlock = true;
				if (j == Game.ROWS - 1) {
					Game.gameOver();
					return;
				}
			}
			full = full && hasBlock;
		}
		if (full) {
			// destroy row j and check the same row
			Game.destroyRow(j--);
		}
	}
};

/**
 * destroy a row
 * @param {number} row
 */
Game.destroyRow = function (row) {
	cc.AudioManager.sharedEngine().playEffect("Resources/check_in.ogg");
	Game.state = GAME_STATES.REMOVING_ROW;
	var i;
	for (i=0; i < Game.COLS; i++) {
		var point = new cc.Point(i, row);
		this.batchNode.removeChildByTag(hashFromCoord(point));
		// reset the matrix as well
		Game.matrix[row * Game.COLS + i] = 0;
	}
	// now move all elements from the row after to the next one
	for (var j=row+1; j < Game.ROWS; j++) {
		for (i=0; i < Game.COLS; i++) {
			if (Game.matrix[j * Game.COLS + i] > 0) {
				var hash = hashFromCoord(new cc.Point(i, j));
				var sprite = this.batchNode.getChildByTag(hash);
				sprite.setTag(hashFromCoord(new cc.Point(i, j-1)));
				sprite.setPosition(new cc.Point(i * Game.TILE_SIZE, (j-1) * Game.TILE_SIZE));
				// and update matrix
				Game.matrix[    j * Game.COLS + i] = 0;
				Game.matrix[(j-1) * Game.COLS + i] = 1;
			} else {
				// just copy the blank space
				Game.matrix[(j-1) * Game.COLS + i] = 0;
			}
		}
	}
	Game.state = GAME_STATES.RUNNING;
};

/**
 * should display the game over function
 */
Game.gameOver = function () {
	Game.state = GAME_STATES.OVER;
	Game.cleanup();
	cc.AudioManager.sharedEngine().stopBackgroundMusic();
	cc.LOG("game over!");
	cc.Director.sharedDirector().popScene();
};

/**
 * clean up the game scene and other things
 */
Game.cleanup = function () {
	//Game.scene.unregisterAsTouchHandler();
    console.log("game cleanup");
    cc.Scheduler.sharedScheduler().unscheduleUpdateForTarget(this);
    cc.TouchDispatcher.sharedDispatcher().removeDelegate(this);
    cc.KeypadDispatcher.sharedDispatcher().removeDelegate(this);
    //cc.Scheduler.sharedScheduler().unscheduleSelector(Game.updateLoop,this);
    //cc.Scheduler.sharedScheduler().unscheduleSelector(Game.start.accelerate, this);
};

/**
 * scroll the block one line below, if not possible, then
 * move the contents of the block to the matrix
 */
Game.tick = function () {
	if (Game.currentBlock && Game.state == GAME_STATES.RUNNING) {
        //cc.Log("ChildrenLength:" + Game.scene.getChildrenCount());
		if (Game.currentBlock.canMoveDown(Game.matrix)) {
			// cc.LOG("  will move block down");
			Game.currentBlock.moveDown();
		} else {
			// cc.LOG("  need to copy block to matrix");
			// cc.LOG("  copying block from " + Game.currentBlock.position.x + "," + Game.currentBlock.position.y);
			Game.copyToMatrix(Game.currentBlock);
			Game.currentBlock.removeFromScene(Game.scene);
			Game.addNewBlock(Game.scene);
		}
		// check for full lines
		Game.checkLines();
	}
};

Game.updateLoop = function (delta) {
    //console.log("Game.tick();"+ delta);
    Game.__timeAccum += delta;
    if (Game.__timeAccum >= Game.speed) {
        //console.log("Game.tick();");
        Game.tick();
        Game.__timeAccum = 0.0;
    }
}

/**
 * start a new game
 */
Game.start = function () {
	// load tile frames
    cc.SpriteFrameCache.sharedSpriteFrameCache().addSpriteFramesWithJson(tiles);
    //cc.SpriteFrameCache.sharedSpriteFrameCache().addSpriteFramesWithFile("Resources/tiles.plist");

	Game.matrix = new Array(Game.COLS * Game.ROWS);
	Game.batchNode = new cc.SpriteBatchNode("Resources/tiles.png");
	Game.batchNode.setPosition(new cc.Point(0, 0));
	Game.batchNode.setAnchorPoint(new cc.Point(0, 0));

	// create the scene
	//var scene = new cc.Scene();
    var scene = new Game.TetrisLayer();
    scene.setIsTouchEnabled(true);
    scene.setIsKeypadEnabled(true);
	scene.setPosition(new cc.Point(4, 0));

	var background = cc.Sprite.spriteWithFile("Resources/background.png");
	background.setPosition(new cc.Point(-4, 0));
	scene.addChild(background,0);

	scene.addChild(Game.batchNode,1);

	Game.state = GAME_STATES.RUNNING;
	Game.addNewBlock(scene);

	// schedule every frame
	Game.__updateId = cc.Scheduler.sharedScheduler().scheduleSelector(Game.updateLoop, this,0,false);
    this.accelerate = function()
    {
        if(Game.goleft && Game.currentBlock)
        {
            Game.currentBlock.moveHorizontally(-Game.TILE_SIZE);
        }
        if(Game.goright && Game.currentBlock)
        {
            Game.currentBlock.moveHorizontally(Game.TILE_SIZE);
        }
        if(Game.fast && Game.currentBlock)
        {
            if (Game.currentBlock.canMoveDown(Game.matrix)) {
                // cc.LOG("  will move block down");
                Game.currentBlock.moveDown();
            }
        }
    };
    cc.Scheduler.sharedScheduler().scheduleSelector(this.accelerate,this,0.1,false);

/*	scene.registerAsTouchHandler();
	scene.touchesBegan = function (points) {
		this.initialPoint = points[0];
		this.movedBlock = false;
	};

	scene.touchesMoved = function (points) {
		if (Game.currentBlock) {
			var distx = points[0].x - this.initialPoint.x;
			var disty = points[0].y - this.initialPoint.y;
			if (Math.abs(distx) > Game.TILE_SIZE) {
				Game.currentBlock.moveHorizontally(distx);
				this.initialPoint = points[0];
				Game.movedBlock = true;
			}
			// do not use the drag down/up for now
			// but do not allow to rotate the block using that
			if (Math.abs(disty) > Game.TILE_SIZE) {
				Game.movedBlock = true;
			}
		}
	};

	scene.touchesEnded = function (points) {
		if (Game.currentBlock && !Game.movedBlock) {
			Game.currentBlock.rotate();
		}
		Game.movedBlock = false;
	};
*/
	Game.scene = scene;
	// play the music (not at full volume, and loop)
	cc.AudioManager.sharedEngine().playBackgroundMusic("Resources/music.mp3", true);
	cc.AudioManager.sharedEngine().setBackgroundMusicVolume(0.1);

	// run the game scene with a transition
	//var transitionScene = new cc.TransitionTurnOffTiles(1.0, Game.scene);
	//cc.Director.pushScene(transitionScene);
    //var tScene = new cc.Scene();
    //tScene.addChild(tScene);
    //return Game.scene;
    //cc.Director.sharedDirector().popScene();
    cc.Director.sharedDirector().pushScene(Game.scene);
};

Game.TetrisLayer = cc.Layer.extend({
    initialPoint:cc.PointZero(),
    movedBlock:false,
    isMouseDown:false,
    keyDown:function(e)
    {
        //alert(1);
        if(e[cc.key.left])
        {
            Game.goleft = true;
            if(Game.currentBlock)
            {
                Game.currentBlock.moveHorizontally(-Game.TILE_SIZE);
            }
        }
        else if(e[cc.key.right])
        {
            Game.goright = true;
            if(Game.currentBlock)
            {
                Game.currentBlock.moveHorizontally(Game.TILE_SIZE);
            }
        }
        if(e[cc.key.space] || e[cc.key.up])
        {
            Game.currentBlock.rotate();
        }
        if(e[cc.key.down])
        {
            Game.fast = true;
        }
        if(e[cc.key.escape])
        {
            Game.gameOver();
        }
    },
    keyUp: function(e)
    {
        switch(e)
        {
            case cc.key.down:
                Game.fast = false;
                Game.speed = 0.5;
                break;
            case cc.key.left:
                Game.goleft=false;
                break;
            case cc.key.right:
                Game.goright = false;
                break;
        }
    },
    ccTouchesBegan:function(pTouches,pEvent){
        this.isMouseDown = true;
        var getPoint = new cc.Point(pTouches[0].locationInView(0).x,pTouches[0].locationInView(0).y);
        this.initialPoint = getPoint;
        this.movedBlock = false;
    },
    ccTouchesMoved:function(pTouches,pEvent){
        if(!this.isMouseDown){
            return;
        }
        if (Game.currentBlock) {
            var getPoint = new cc.Point(pTouches[0].locationInView(0).x,pTouches[0].locationInView(0).y);
            var distx = getPoint.x - this.initialPoint.x;
            var disty = getPoint.y - this.initialPoint.y;
            if (Math.abs(distx) > Game.TILE_SIZE) {
                Game.currentBlock.moveHorizontally(distx);
                this.initialPoint = getPoint;
                Game.movedBlock = true;
            }
            // do not use the drag down/up for now
            // but do not allow to rotate the block using that
            if (Math.abs(disty) > Game.TILE_SIZE) {
                Game.movedBlock = true;
            }
        }
    },
    ccTouchesEnded:function(pTouches,pEvent){
        this.isMouseDown = false;
        if (Game.currentBlock && !Game.movedBlock) {
            Game.currentBlock.rotate();
        }
        Game.movedBlock = false;
    },
    ccTouchesCancelled:function(pTouches,pEvent){
        console.log("ccTouchesCancelled");
    }
});