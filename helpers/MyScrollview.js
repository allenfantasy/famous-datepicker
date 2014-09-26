define(function(require, exports, module) {
    var PhysicsEngine = require('famous/physics/PhysicsEngine');
    var Particle = require('famous/physics/bodies/Particle');
    var Drag = require('famous/physics/forces/Drag');
    var Spring = require('famous/physics/forces/Spring');

    var EventHandler = require('famous/core/EventHandler');
    var OptionsManager = require('famous/core/OptionsManager');
    var ViewSequence = require('famous/core/ViewSequence');
    var Scroller = require('famous/views/Scroller');
    var Utility = require('famous/utilities/Utility');

    var GenericSync = require('famous/inputs/GenericSync');
    var ScrollSync = require('famous/inputs/ScrollSync');
    var TouchSync = require('famous/inputs/TouchSync');
    GenericSync.register({scroll : ScrollSync, touch : TouchSync});

    /**
     * MyScrollview will lay out a collection of renderables sequentially in the specified direction, and will
     * allow you to scroll through them with mousewheel or touch events.
     * @class MyScrollview
     * @constructor
     * @param {Options} [options] An object of configurable options.
     * @param {Number} [options.direction=Utility.Direction.Y] Using the direction helper found in the famous Utility
     * module, this option will lay out the MyScrollview instance's renderables either horizontally
     * (x) or vertically (y). Utility's direction is essentially either zero (X) or one (Y), so feel free
     * to just use integers as well.
     * @param {Boolean} [options.rails=true] When true, MyScrollview's genericSync will only process input in it's primary access.
     * @param {Number} [clipSize=undefined] The size of the area (in pixels) that MyScrollview will display content in.
     * @param {Number} [margin=undefined] The size of the area (in pixels) that MyScrollview will process renderables' associated calculations in.
     * @param {Number} [friction=0.001] Input resistance proportional to the velocity of the input.
     * Controls the feel of the MyScrollview instance at low velocities.
     * @param {Number} [drag=0.0001] Input resistance proportional to the square of the velocity of the input.
     * Affects MyScrollview instance more prominently at high velocities.
     * @param {Number} [edgeGrip=0.5] A coefficient for resistance against after-touch momentum.
     * @param {Number} [egePeriod=300] Sets the period on the spring that handles the physics associated
     * with hitting the end of a MyScrollview.
     * @param {Number} [edgeDamp=1] Sets the damping on the spring that handles the physics associated
     * with hitting the end of a MyScrollview.
     * @param {Boolean} [paginated=false] A paginated MyScrollview will scroll through items discretely
     * rather than continously.
     * @param {Number} [pagePeriod=500] Sets the period on the spring that handles the physics associated
     * with pagination.
     * @param {Number} [pageDamp=0.8] Sets the damping on the spring that handles the physics associated
     * with pagination.
     * @param {Number} [pageStopSpeed=Infinity] The threshold for determining the amount of velocity
     * required to trigger pagination. The lower the threshold, the easier it is to scroll continuosly.
     * @param {Number} [pageSwitchSpeed=1] The threshold for momentum-based velocity pagination.
     * @param {Number} [speedLimit=10] The highest scrolling speed you can reach.
     */
    function MyScrollview(options) {
        this.options = Object.create(MyScrollview.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);

        this._node = null;

        this._nodeSwitch = false;
        this._currentIndex = 0;

        this._physicsEngine = new PhysicsEngine();
        this._particle = new Particle();
        this._physicsEngine.addBody(this._particle);

        this.spring = new Spring({anchor: [0, 0, 0]});

        this.drag = new Drag({forceFunction: Drag.FORCE_FUNCTIONS.QUADRATIC});
        this.friction = new Drag({forceFunction: Drag.FORCE_FUNCTIONS.LINEAR});

        this.sync = new GenericSync(['scroll', 'touch'], {direction : this.options.direction});

        this._eventInput = new EventHandler();
        this._eventOutput = new EventHandler();

        this._eventInput.pipe(this.sync);
        this.sync.pipe(this._eventInput);

        EventHandler.setInputHandler(this, this._eventInput);
        EventHandler.setOutputHandler(this, this._eventOutput);

        this._touchCount = 0;
        this._springState = 0;
        this._onEdge = 0; // -1 for top, 1 for bottom
        this._pageSpringPosition = 0;
        this._edgeSpringPosition = 0;
        this._touchVelocity = undefined;
        this._earlyEnd = false;
        this._needsPaginationCheck = false;

        this._scroller = new Scroller();
        this._scroller.positionFrom(this.getPosition.bind(this));

        this.setOptions(options);

        _bindEvents.call(this);
    }

    /** @const */
    var TOLERANCE = 0.5;

    MyScrollview.DEFAULT_OPTIONS = {
        direction: Utility.Direction.Y,
        rails: true,
        friction: 0.001,
        drag: 0.0001,
        edgeGrip: 0.5,
        edgePeriod: 300,
        edgeDamp: 1,
        margin: 1000,       // mostly safe
        paginated: false,
        pagePeriod: 500,
        pageDamp: 0.8,
        pageStopSpeed: 10,
        pageSwitchSpeed: 0.5,
        speedLimit: 10,
        groupScroll: false
    };

    /** @enum */
    var SpringStates = {
        NONE: 0,
        EDGE: 1,
        PAGE: 2
    };

    function _handleStart(event) {
        this._touchCount = event.count;
        if (event.count === undefined) this._touchCount = 1;

        _detachAgents.call(this);
        this.setVelocity(0);
        this._touchVelocity = 0;
        this._earlyEnd = false;

        this._nodeSwitch = false;
    }

    function _handleMove(event) {
        var velocity = -event.velocity;
        var delta = -event.delta;

        if (this._onEdge && event.slip) {
            if ((velocity < 0 && this._onEdge < 0) || (velocity > 0 && this._onEdge > 0)) {
                if (!this._earlyEnd) {
                    _handleEnd.call(this, event);
                    this._earlyEnd = true;
                }
            }
            else if (this._earlyEnd && (Math.abs(velocity) > Math.abs(this.getVelocity()))) {
                _handleStart.call(this, event);
            }
        }
        if (this._earlyEnd) return;
        this._touchVelocity = velocity;

        if (event.slip) this.setVelocity(velocity);
        else this.setPosition(this.getPosition() + delta);
    }

    function _handleEnd(event) {
        this._touchCount = event.count || 0;
        if (!this._touchCount) {
            _detachAgents.call(this);
            if (this._onEdge) _setSpring.call(this, this._edgeSpringPosition, SpringStates.EDGE);
            _attachAgents.call(this);
            var velocity = -event.velocity;
            var speedLimit = this.options.speedLimit;
            if (event.slip) speedLimit *= this.options.edgeGrip;
            if (velocity < -speedLimit) velocity = -speedLimit;
            else if (velocity > speedLimit) velocity = speedLimit;
            this.setVelocity(velocity);
            this._touchVelocity = undefined;
            this._needsPaginationCheck = true;

            this._nodeSwitch = this._currentIndex !== this._node.index;
        }
    }

    function _bindEvents() {
        this._eventInput.bindThis(this);
        this._eventInput.on('start', _handleStart);
        this._eventInput.on('update', _handleMove);
        this._eventInput.on('end', _handleEnd);

        this._scroller.on('edgeHit', function(data) {
            this._edgeSpringPosition = data.position;
        }.bind(this));
    }

    function _attachAgents() {
        if (this._springState) this._physicsEngine.attach([this.spring], this._particle);
        else this._physicsEngine.attach([this.drag, this.friction], this._particle);
    }

    function _detachAgents() {
        this._springState = SpringStates.NONE;
        this._physicsEngine.detachAll();
    }

    function _nodeSizeForDirection(node) {
        var direction = this.options.direction;
        var nodeSize = (node.getSize() || this._scroller.getSize())[direction];
        if (!nodeSize) nodeSize = this._scroller.getSize()[direction];
        return nodeSize;
    }

    function _handleEdge(edgeDetected) {
        if (!this._onEdge && edgeDetected) {
            this.sync.setOptions({scale: this.options.edgeGrip});
            if (!this._touchCount && this._springState !== SpringStates.EDGE) {
                _setSpring.call(this, this._edgeSpringPosition, SpringStates.EDGE);
            }
        }
        else if (this._onEdge && !edgeDetected) {
            this.sync.setOptions({scale: 1});
            if (this._springState && Math.abs(this.getVelocity()) < 0.001) {
                // reset agents, detaching the spring
                _detachAgents.call(this);
                _attachAgents.call(this);
            }
        }
        this._onEdge = edgeDetected;
    }

    function _handlePagination() {
        if (!this._needsPaginationCheck) return;

        if (this._touchCount) return;
        if (this._springState === SpringStates.EDGE) return;

        var velocity = this.getVelocity();
        if (Math.abs(velocity) >= this.options.pageStopSpeed) return;

        var position = this.getPosition();
        var velocitySwitch = Math.abs(velocity) > this.options.pageSwitchSpeed;

        // parameters to determine when to switch
        var nodeSize = _nodeSizeForDirection.call(this, this._node);
        var positionPrev = position < 0.5 * nodeSize && this._nodeSwitch;
        var positionNext = position > 0.5 * nodeSize;
        var velocityPrev = velocity < 0;
        var velocityNext = velocity > 0;

        if ((positionNext && !velocitySwitch) || (velocitySwitch && velocityNext)) {
          this.goToNextPage();
        }
        else if ((positionPrev && !velocitySwitch) || (velocitySwitch && velocityPrev)) {
          this.goToPreviousPage();
        }
        else _setSpring.call(this, 0, SpringStates.PAGE);

        this._needsPaginationCheck = false;
    }

    function _setSpring(position, springState) {
        var springOptions;
        if (springState === SpringStates.EDGE) {
            this._edgeSpringPosition = position;
            springOptions = {
                anchor: [this._edgeSpringPosition, 0, 0],
                period: this.options.edgePeriod,
                dampingRatio: this.options.edgeDamp
            };
        }
        else if (springState === SpringStates.PAGE) {
            this._pageSpringPosition = position;
            springOptions = {
                anchor: [this._pageSpringPosition, 0, 0],
                period: this.options.pagePeriod,
                dampingRatio: this.options.pageDamp
            };
        }

        this.spring.setOptions(springOptions);
        if (springState && !this._springState) {
            _detachAgents.call(this);
            this._springState = springState;
            _attachAgents.call(this);
        }
        this._springState = springState;
    }

    function _normalizeState() {
        var position = this.getPosition();
        var nodeSize = _nodeSizeForDirection.call(this, this._node);
        var nextNode = this._node.getNext();

        while (position > nodeSize + TOLERANCE && nextNode) {
            _shiftOrigin.call(this, -nodeSize);
            position -= nodeSize;
            this._scroller.sequenceFrom(nextNode);
            this._node = nextNode;
            nextNode = this._node.getNext();
            nodeSize = _nodeSizeForDirection.call(this, this._node);
        }

        var previousNode = this._node.getPrevious();
        var previousNodeSize;

        while (position < -TOLERANCE && previousNode) {
            previousNodeSize = _nodeSizeForDirection.call(this, previousNode);
            this._scroller.sequenceFrom(previousNode);
            this._node = previousNode;
            _shiftOrigin.call(this, previousNodeSize);
            position += previousNodeSize;
            previousNode = this._node.getPrevious();
        }
    }

    function _shiftOrigin(amount) {
        this._edgeSpringPosition += amount;
        this._pageSpringPosition += amount;
        this.setPosition(this.getPosition() + amount);
        if (this._springState === SpringStates.EDGE) {
            this.spring.setOptions({anchor: [this._edgeSpringPosition, 0, 0]});
        }
        else if (this._springState === SpringStates.PAGE) {
            this.spring.setOptions({anchor: [this._pageSpringPosition, 0, 0]});
        }
    }

    MyScrollview.prototype.outputFrom = function outputFrom() {
        return this._scroller.outputFrom.apply(this._scroller, arguments);
    };

    /**
     * Returns the position associated with the MyScrollview instance's current node
     *  (generally the node currently at the top).
     * @method getPosition
     * @param {number} [node] If specified, returns the position of the node at that index in the
     * MyScrollview instance's currently managed collection.
     * @return {number} The position of either the specified node, or the MyScrollview's current Node,
     * in pixels translated.
     */
    MyScrollview.prototype.getPosition = function getPosition() {
        return this._particle.getPosition1D();
    };

    /**
     * Sets position of the physics particle that controls MyScrollview instance's "position"
     * @method setPosition
     * @param {number} x The amount of pixels you want your MyScrollview to progress by.
     */
    MyScrollview.prototype.setPosition = function setPosition(x) {
        this._particle.setPosition1D(x);
    };

    /**
     * Returns the MyScrollview instance's velocity.
     * @method getVelocity
     * @return {Number} The velocity.
     */

    MyScrollview.prototype.getVelocity = function getVelocity() {
        return this._touchCount ? this._touchVelocity : this._particle.getVelocity1D();
    };

    /**
     * Sets the MyScrollview instance's velocity. Until affected by input or another call of setVelocity
     *  the MyScrollview instance will scroll at the passed-in velocity.
     * @method setVelocity
     * @param {number} v The magnitude of the velocity.
     */
    MyScrollview.prototype.setVelocity = function setVelocity(v) {
        this._particle.setVelocity1D(v);
    };

    /**
     * Patches the MyScrollview instance's options with the passed-in ones.
     * @method setOptions
     * @param {Options} options An object of configurable options for the MyScrollview instance.
     */
    MyScrollview.prototype.setOptions = function setOptions(options) {
        if (options) {
            if (options.direction !== undefined) {
                if (options.direction === 'x') options.direction = Utility.Direction.X;
                else if (options.direction === 'y') options.direction = Utility.Direction.Y;
            }

            this._scroller.setOptions(options);
            this._optionsManager.setOptions(options);
        }

        this._scroller.setOptions(this.options);
        if (this.options.groupScroll)
            this._scroller.pipe(this._eventInput);
        else
            this._scroller.unpipe(this._eventInput);

        this.drag.setOptions({strength: this.options.drag});
        this.friction.setOptions({strength: this.options.friction});

        this.spring.setOptions({
            period: this.options.edgePeriod,
            dampingRatio: this.options.edgeDamp
        });

        this.sync.setOptions({
            rails: this.options.rails,
            direction: (this.options.direction === Utility.Direction.X) ? GenericSync.DIRECTION_X : GenericSync.DIRECTION_Y
        });
    };

    /**
     * goToPreviousPage paginates your MyScrollview instance backwards by one item.
     * @method goToPreviousPage
     * @return {ViewSequence} The previous node.
     */
    MyScrollview.prototype.goToPreviousPage = function goToPreviousPage() {
        if (!this._node) return null;
        var previousNode = this._node.getPrevious();
        if (previousNode) {
            var currentPosition = this.getPosition();
            var previousNodeSize = _nodeSizeForDirection.call(this, previousNode);
            this._scroller.sequenceFrom(previousNode);
            this._node = previousNode;
            var previousSpringPosition = (currentPosition < TOLERANCE) ? -previousNodeSize : 0;
            _setSpring.call(this, 0, SpringStates.PAGE);
            _shiftOrigin.call(this, previousNodeSize);
        }
        this._eventOutput.emit('pageChange', {direction: -1});
        return previousNode;
    };

    /**
     * goToNextPage paginates your MyScrollview instance forwards by one item.
     * @method goToNextPage
     * @return {ViewSequence} The next node.
     */
    MyScrollview.prototype.goToNextPage = function goToNextPage() {
        if (!this._node) return null;
        var nextNode = this._node.getNext();
        if (nextNode) {
            var currentPosition = this.getPosition();
            var currentNodeSize = _nodeSizeForDirection.call(this, this._node);
            var nextNodeSize = _nodeSizeForDirection.call(this, nextNode);
            this._scroller.sequenceFrom(nextNode);
            this._node = nextNode;
            //var nextSpringPosition = (currentPosition > currentNodeSize - TOLERANCE) ? currentNodeSize + nextNodeSize : currentNodeSize;
            var nextSpringPosition = (currentPosition > currentNodeSize - TOLERANCE) ? currentNodeSize + nextNodeSize : currentNodeSize;
            _setSpring.call(this, nextSpringPosition, SpringStates.PAGE);
            _shiftOrigin.call(this, -currentNodeSize);
        }
        this._eventOutput.emit('pageChange', {direction: 1});
        return nextNode;
    };

    /**
     * Sets the collection of renderables under the MyScrollview instance's control, by
     *  setting its current node to the passed in ViewSequence. If you
     *  pass in an array, the MyScrollview instance will set its node as a ViewSequence instantiated with
     *  the passed-in array.
     *
     * @method sequenceFrom
     * @param {Array|ViewSequence} node Either an array of renderables or a Famous viewSequence.
     */
    MyScrollview.prototype.sequenceFrom = function sequenceFrom(node) {
        if (node instanceof Array) node = new ViewSequence({array: node});
        this._node = node;
        return this._scroller.sequenceFrom(node);
    };

    /**
     * Returns the width and the height of the MyScrollview instance.
     *
     * @method getSize
     * @return {Array} A two value array of the MyScrollview instance's current width and height (in that order).
     */
    MyScrollview.prototype.getSize = function getSize() {
        return this._scroller.getSize.apply(this._scroller, arguments);
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    MyScrollview.prototype.render = function render() {
        if (!this._node) return null;

        _normalizeState.call(this);
        _handleEdge.call(this, this._scroller.onEdge());
        if (this.options.paginated) _handlePagination.call(this);

        return this._scroller.render();
    };

    MyScrollview.prototype.getActiveIndex = function() {
      var direction = this.options.direction;

      var renderables = this._node._.array;

      // pivot is a 'fake' active item which is always in the scope of `margin`
      var pivot = renderables[this._node.index];
      var itemHeight = pivot.getSize()[direction];
      var matrics = pivot._currTarget.parentNode.style['-webkit-transform'].split(',');
      var parentOffset = parseInt(matrics[matrics.length - (direction === 0 ? 4 : 3)].trim());
      var pivotOffset = pivot._matrix[direction===0?12:13];
      var pIndex = this._node.index;

      var offsets = renderables.map(function(r, index, array) {
        return pivotOffset + (index - pIndex) * itemHeight;
        //return r._matrix[direction === 0 ? 12 : 13];
      });

      // the active index's offset should be 0
      var index;
      var minOffset = Infinity;
      for (var i = 0; i < offsets.length; i++)
        if (Math.abs(offsets[i]) < minOffset) {
          minOffset = Math.abs(offsets[i]);
          index = i;
        }

      // overcome some bug in Famo.us Scrollview: parentOffset
      if (Math.abs(parentOffset) > 1/2 * itemHeight) {
        index += 1;
      }
      return index;
      //return this._node.index;
    };

    MyScrollview.prototype.getActiveContent = function(offset) {
      // TODO: a tricky bug here
      var index = this.getActiveIndex();
      var renderable = this._node._.array[index + (offset?offset:0)];
      var content = renderable.getContent();
      if (content instanceof DocumentFragment)
        content = renderable._currTarget.innerText; 
      return content; 
    };

    module.exports = MyScrollview;
});
