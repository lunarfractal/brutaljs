const WebSocket = require('ws');
const TinyEmitter = require('tiny-emitter');

class Bot extends TinyEmitter {
    constructor(options = {}) {
        super();

        this.id = 0;

        this.webSocket = null;

        this.entities = [];

        this.nick = options.nick || 'botty';
        this.address = options.address;

        this.autoPlay = options.autoPlay;
        this.country = options.country || 'CH';
        this.agent = options.agent;

        this.reconnectAttempts = 0;

        this.shouldReconnect = !!options.reconnect;

        if(this.shouldReconnect) {
            this.reconnectInterval = options.reconnect.interval || 1000;
            this.maxReconnectAttempts = options.reconnect.maxAttempts || 100;
        }

        this.intents = !!options.intents;
        if(this.intents) {
            this.shouldProcessMinimap = options.intents.indexOf("minimap") > -1;
            this.shouldProcessEntities = options.intents.indexOf("entities") > -1;
            this.shouldProcessEvents = options.intents.indexOf("events") > -1;
        }

        this.GAME_SCALE = 10;

        this.opcodes = {
            OPCODE_PING: 0x00,
            OPCODE_HELLO: 0x01,
            OPCODE_HELLO_BOT: 0x02, // For Bots
            OPCODE_ENTER_GAME: 0x03,
            OPCODE_LEAVE_GAME: 0x04,
            OPCODE_INPUT: 0x05,
            OPCODE_INPUT_BRAKE: 0x06,
            OPCODE_AREA_UPDATE: 0x07,
            OPCODE_CLICK: 0x08,

            // Server -> Client
            OPCODE_PONG: 0x00,
            OPCODE_MAP_CONFIG: 0xA0,
            OPCODE_ENTERED_GAME: 0xA1,
            OPCODE_ENTITY_INFO_V1: 0xB4,
            OPCODE_ENTITY_INFO_V2: 0xB3,
            OPCODE_EVENTS: 0xA4,
            OPCODE_LEADERBOARD_V1: 0xA5,
            OPCODE_LEADERBOARD_V2: 0xB5,
            OPCODE_MINIMAP: 0xA6,

            // Event Codes
            EVENT_DID_KILL: 0x01,
            EVENT_WAS_KILLED: 0x02,

            // Entity Types
            ENTITY_ITEM: 4,
            ENTITY_PLAYER: 5,
            ENTITY_COLLIDER: 1,

            // Entity SubTypes
            // PLAYER
            SUB_ENTITY_BASIC_CAR: 0,
            SUB_ENTITY_FLAIL: 1,
            SUB_ENTITY_CHAIN: 2,

            // Colliders
            SUB_ENTITY_BOUNCER: 0,
            SUB_ENTITY_WALL: 1,
            SUB_ENTITY_DANGER: 2,
            SUB_ENTITY_BOUNDARY: 3,
            SUB_ENTITY_NOFLAILZONE: 4,
            SUB_ENTITY_CORE: 5,

            // ENTITY_ITEM
            SUB_ENTITY_ITEM_ATOM: 0,
            SUB_ENTITY_ITEM_ENERGY: 1,
            SUB_ENTITY_ITEM_TRI_PLUS: 2,
            SUB_ENTITY_ITEM_TRI_MINUS: 3,
            SUB_ENTITY_ITEM_REDFLAIL: 4
        };

        if(this.autoPlay) {
            this.shouldProcessEvents = true;
        }


        this.connect();
    }

    static getServerForRegion(region, isSecure = false) {
        return new Promise((resolve, reject) => {
            let c = '';
            if(isSecure) c = 's';

            fetch(`http${c}://master.brutal.io`, {
                    "method": "PUT",
                    "headers": {
                        'Content-Type': 'text/plain'
                    },
                    "body": region
                })
                .then(i => i.text())
                .then((response) => {
                    if (response === '1' || response === '0') {
                        reject('Server is full or link has expired');
                    }

                    const data = response.split(":");
                    let ip = data[0].split(".");
                    let port = data[1].split("/");
                    let roomNumber = port[1].split("!")[0];
                    let insecurePortNumber = parseInt(roomNumber) + 8080;
                    let finalPortNumber = parseInt(roomNumber) + 8080 + 1E3;
                    if(isSecure)
                        resolve(`wss://${ip[0]}-${ip[1]}-${ip[2]}-${ip[3]}.brutal.io:${finalPortNumber}`);
                    else
                        resolve(`ws://${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}:${insecurePortNumber}`);
                });
        });
    }

    getServer(isSecure) {
        return new Promise((resolve, reject) => {
            let c = '';
            if(isSecure) c = 's';

            fetch(`http${c}://master.brutal.io`, {
                    "method": "PUT",
                    "headers": {
                        'Content-Type': 'text/plain'
                    },
                    "body": this.country
                })
                .then(i => i.text())
                .then((response) => {
                    if (response === '1' || response === '0') {
                        reject('Server is full or link has expired');
                    }

                    const data = response.split(":");
                    let ip = data[0].split(".");
                    let port = data[1].split("/");
                    let roomNumber = port[1].split("!")[0];
                    let insecurePortNumber = parseInt(roomNumber) + 8080;
                    let finalPortNumber = parseInt(roomNumber) + 8080 + 1E3;
                    if(isSecure)
                        resolve(`wss://${ip[0]}-${ip[1]}-${ip[2]}-${ip[3]}.brutal.io:${finalPortNumber}`);
                    else
                        resolve(`ws://${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}:${insecurePortNumber}`);
                });
        });
    }

    CreateEntity(type, subType) {
        var entity = null;
		switch(type)
		{
			case this.opcodes.ENTITY_PLAYER:
			{
				entity = new Ship();
				break;
			}
			case this.opcodes.ENTITY_ITEM:
			{
				if(subType == this.opcodes.SUB_ENTITY_ITEM_ATOM)
					entity = new Atom();
				else if(subType == this.opcodes.SUB_ENTITY_ITEM_ENERGY)
					entity = new Energy();
				else if(subType == this.opcodes.SUB_ENTITY_ITEM_TRI_PLUS || subType == this.opcodes.SUB_ENTITY_ITEM_TRI_MINUS)
					entity = new Tri(subType);
				else if(subType == this.opcodes.SUB_ENTITY_ITEM_REDFLAIL)
					entity = new RedFlailPowerup(subType);
				break;
			}
			case this.opcodes.ENTITY_COLLIDER:
			{
				if(subType == this.opcodes.SUB_ENTITY_BOUNDARY)
				{
					entity = new Boundary();
				}else{
					entity = new Collider(subType);
				}
				break;
			}
			default:
			{
				console.log('ERROR: Creating unknown entity type: ' + type + ' Subtype: ' + subType);
				break;
			}
		}
		return entity;
    }

    processMap(view) {
        var offset = 1;
        var cfg_arenaWidth = view.getFloat32(offset, true);
        offset += 4;
        var cfg_arenaHeight = view.getFloat32(offset, true);
        offset += 4;

        var mapVersion = view.getUint8(offset, true);

        var arenaWidth = cfg_arenaWidth * 10;
        var arenaHeight = cfg_arenaHeight * 10;

        this.emit('map', {
            version: mapVersion,
            width: arenaWidth,
            height: arenaHeight
        });
    }

    processEvents(view, op) {
        let offset = 1;

        while(true) {
           let _byte = view.getUint8(offset, true);
           offset += 1;

           if(_byte === 0x0) break;

           switch(_byte) {
               case this.opcodes.EVENT_DID_KILL: {
                   let id = view.getUint16(offset, true);
                   offset += 2;

                   let res = this.getString(view, offset);
                   let nick = res.nick;
                   offset = res.offset;

                   this.emit('kill', {
                       id: id,
                       nick: nick
                   });
               }
               break;

               case this.opcodes.EVENT_WAS_KILLED: {
                   let id = view.getUint8(offset, true);
                   offset += 2;

                   let res = this.getString(view, offset);
                   let nick = res.nick;
                   offset = res.offset;

                   this.emit('death', {
                       id: id,
                       nick: nick
                   });

                   if(this.autoPlay)
                       setTimeout(() => this.sendNick(), 100);
               }
               break;

               default:
                   console.log('I encountered a weird error lol');
               break;
           }
       }
    }

    updateEntities(view, op) {
        var offset = 1;

        while(true) {
            var id = view.getUint16(offset, true);
            offset += 2;

            if(id == 0x0) { // if the id is 0, the next two bytes are for the king's id i think
                if(offset != view.byteLength) {
                    var kingId = view.getUint16(offset, true);
                    this.kingId = kingId;
                    offset += 2;
                    if(kingId > 0) {
                        var kingX = view.getFloat32(offset, true);
                        offset += 4;
                        var kingY = -view.getFloat32(offset, true);
                        offset += 4;

                        this.emit('king', {
                            id: kingId,
                            x: kingX * 10,
                            y: kingY * 10
                        });
                    }
                }
                break;
            }

            var flags = view.getUint8(offset, true);
            offset += 1;

            var entity;

            switch(flags) {
                case 0x0: { // Partial
                    entity = this.entities[id];
                    if(entity) {
                        offset = entity.updateNetwork(view, offset, false, op);
                        this.emit('updateEntity', entity);
                    }
                    else {
                        console.log('Entity with id: ' + id + ' not found');
                    }
                    break;
                }
                case 0x1: { // Full
                    var entityType = view.getUint8(offset);
                    offset += 1;

                    var entitySubType = view.getUint8(offset);
                    offset += 1;

                    var res = this.getString(view, offset);

                    var nick = res.nick;
                    offset = res.offset;

                    var entity = this.CreateEntity(entityType, entitySubType);
                    if(entity) {
                        entity.nick = nick;
                        entity.id = id;
                        this.entities[id] = entity;
                        offset = entity.updateNetwork(view, offset, true, op);
                        this.emit('createEntity', entity);
                    } else {
                        console.log('Unable to create entity. Entity type is: ' + entityType);
                    }
                    break;
                }
                case 0x2: { // Delete
                    var killedByID = view.getUint16(offset, true);
                    offset += 2;

                    var killReason = view.getUint8(offset);
                    offset += 1;

                    var entity = this.entities[id];
                    if(entity) {
                        entity.killReason = killReason;
                        entity.killedByID = killedByID;
                        offset = entity.deleteNetwork(view, offset);
                        this.emit('deleteEntity', entity);
                    } else {
                        console.log('Error, entity does not exist', id);
                    }
                    break;
                }
                default:
                    console.log('Invalid entity flag');
                    break;
            }
        }
    }

    processLeaderboard(view, op) {
        var offset = 1;

        var leaderboardInfo = [];
        var containsData = false;
        while(true) {
            var id = view.getUint16(offset, true);
            offset += 2;
            if(id == 0x0) {
                break;
            }

            containsData = true;

            var score;
            if(op == this.opcodes.OPCODE_LEADERBOARD_V1) {
                score = view.getUint16(offset, true);
                offset += 2;
            } else {
                score = view.getUint32(offset, true);
                offset += 4;
            }

            var res = this.getString(view, offset);
            var nick = res.nick;
            offset = res.offset;

            var leaderboardItemInfo = {
                nick: nick,
                score: score,
                id: id
            };

            leaderboardInfo.push(leaderboardItemInfo);
        }

        var id = view.getUint16(offset, true);
        offset += 2;

        if(id > 0) {
            var score;
            if(op == this.opcodes.OPCODE_LEADERBOARD_V1) {
                score = view.getUint16(offset, true);
                offset += 2;
            } else {
                score = view.getUint32(offset, true);
                offset == 4;
            }

            var rank = view.getUint16(offset, true);
            offset += 2;

            var me = {
                id: id,
                score: score,
                rank: rank
            }

            leaderboardInfo.push(me);
            leaderboardInfo.me = function() {
                return leaderboardInfo[leaderboardInfo.length - 1];
            }
        }

        if(containsData) {
            this.emit('leaderboard', leaderboardInfo);
        }
    }

    async connect() {
        try {
            if(!this.address) this.address = await this.getServer(false);

            if(typeof this.agent !== 'undefined' || this.agent !== null) {
                this.webSocket = new WebSocket(this.address, {
                    headers: {
                        'origin': 'https://brutal.io'
                    },
                    agent: this.agent
                });
            } else {
                this.webSocket = new WebSocket(this.address, {
                    headers: {
                        'origin': 'https://brutal.io'
                    },
                });
            }

            this.webSocket.binaryType = 'arraybuffer';

            this.webSocket.on('open', () => {
                this.onSocketOpen();
                this.emit('open');
            });

            this.webSocket.on('close', (...args) => {
                this.onSocketClose();
                this.emit('close', ...args);
            });

            this.webSocket.on('message', (msg) => {
                this.onSocketMessage(new DataView(msg));
                this.emit('message', msg);
            });

            this.webSocket.on('error', (err) => {
                this.emit('error', err);
            })
        } catch (err) {
            console.log('error', err);
        }
    }

    disconnect() {
        this.webSocket.close();
        this.webSocket.removeAllListeners();
    }

    onSocketOpen() {
        this.sendHello();
        this.ping();

        if(this.autoPlay) {
            this.sendNick();
        }
    }

    onSocketClose() {
        if(this.reconnectAttempts >= this.maxReconnectAttempts)
            return;

        if(this.shouldReconnect) {
            var timeout = this.reconnectInterval || 1000;
            setTimeout(() => this.connect(), timeout);
        }

        this.reconnectAttempts++;
    }

    onEnterGame(view) {
        var id = view.getUint32(1, true);;
        this.id = id;

        this.emit('enterGame', {
            id: id
        });
    }

    onSocketMessage(view) {
        let op = view.getUint8(0);

        switch (op) {
            case this.opcodes.OPCODE_PONG:
                this.emit('pong');
                break;

            case this.opcodes.OPCODE_ENTERED_GAME:
                this.onEnterGame(view);
                break;

            case this.opcodes.OPCODE_ENTITY_INFO_V1:
            case this.opcodes.OPCODE_ENTITY_INFO_V2:
                if(this.shouldProcessEntities)
                    this.updateEntities(view, op);
                break;

            case this.opcodes.OPCODE_MAP_CONFIG:
                this.processMap(view);
                break;

            case this.opcodes.OPCODE_EVENTS:
                if(this.shouldProcessEvents)
                    this.processEvents(view, op);
                break;

            case this.opcodes.OPCODE_LEADERBOARD_V1:
            case this.opcodes.OPCODE_LEADERBOARD_V2:
                if(this.shouldProcessLeaderboard) {
                    this.processLeaderboard(view, op);
                }
                break;

            case this.opcodes.OPCODE_MINIMAP:
                break;

            default:
                break;
        }
    }

    getString(view, offset) {
        var nick = "";
      	for(;;){
	    	    var v = view.getUint16(offset, true);
	    	    offset += 2;
		        if(v == 0) {
		      	    break;
		        }

	     	    nick += String.fromCharCode(v);
      	}
	      return {
		        nick: nick,
		        offset: offset
	      };
    }

    sendHello() {
        if (!this.webSocket || this.webSocket.readyState !== 1) return;
        let buffer = new ArrayBuffer(5);
        let view = new DataView(buffer);

        view.setUint8(0, this.opcodes.OPCODE_HELLO);
        view.setUint16(1, 1680 / 10 * 1, 1);
        view.setUint16(3, 1050 / 10 * 1, 1);

        this.webSocket.send(buffer);
    }

    ping() {
        if (!this.webSocket || this.webSocket.readyState !== 1) return;
        let buffer = new ArrayBuffer(1);
        new DataView(buffer)
            .setUint8(0, this.opcodes.OPCODE_PING);

        this.webSocket.send(buffer);
    }

    leave() {
        if (!this.webSocket || this.webSocket.readyState !== 1) return;
        let buffer = new ArrayBuffer(1);
        let view = new DataView(buffer);
        view.setUint8(0, this.opcodes.OPCODE_LEAVE_GAME);
        this.webSocket.send(buffer);
    }

    sendNick(nick = this.nick) {
        if (!this.webSocket || this.webSocket.readyState !== 1) return;
        let buffer = new ArrayBuffer(3 + 2 * nick.length),
            view = new DataView(buffer);
        view.setUint8(0, this.opcodes.OPCODE_ENTER_GAME);

        for (let e = 0; e < nick.length; ++e) {
            view.setUint16(1 + 2 * e, nick.charCodeAt(e), 1);
        }

        this.webSocket.send(buffer);
    }

    sendInput(angle = 0, throttle = 0) {
        if (!this.webSocket || this.webSocket.readyState !== 1) return;
        var buf = new ArrayBuffer(1 + 8 + 1);
        var view = new DataView(buf);
        view.setUint8(0, this.opcodes.OPCODE_INPUT);

        view.setFloat64(1, angle, true);

        var flags = 0x0;

        if (throttle)
            flags = flags | 0x1;

        view.setUint8(1 + 8, flags, true);
        this.webSocket.send(buf);
    }

    sendClick(shooting) {
        if (!this.webSocket || this.webSocket.readyState !== 1) return;
        var buf = new ArrayBuffer(1 + 1);
        var view = new DataView(buf);
        view.setUint8(0, this.opcodes.OPCODE_CLICK);
        if (shooting)
            view.setUint8(1, 0x1);
        else
            view.setUint8(1, 0x0);

        this.webSocket.send(buf);
    }

}


var Ship = class Ship {
    constructor() {
        this.killReason = 0;

        this.id = 0;
        this.x = 0;
        this.y = 0;
        this.energy = 0;
        this.transferEnergy = 0;
        this.angle = 0.0;

        this.chainSegments = [];

        this.flailX = 0;
        this.flailY = 0;
        this.flailAngle = 0.0;
        this.flailRadius = 0;

        this.hue = 0;
        this.attached = true;
        this.attracting = false;
        this.invulnerable = false;
        this.shock = false;
        this.decay = false;
        this.still = false;
        this.inside = false;
        this.charging = false;

        this.nick = '';

        this.beingDeleted = false;
        this.killedByID = 0;

        this.redFlail = false;
        this.redFlailDeployed = false;
        this.dangerLowFreq = false;
        this.lowFreqFrame = 0;
        this.holoAngle = 0;
        this.holoIn = 0;

        this.GAME_SCALE = 10;

        this.flags = {
            FLAG_FLAIL_ATTACHED: 0x01,
            FLAG_FLAIL_ATTRACTING: 0x02,
            FLAG_INVULNERABLE: 0x04,
            FLAG_SHOCK: 0x08,
            FLAG_DECAY: 0x10,
            FLAG_STILL: 0x20,
            FLAG_INSIDE: 0x40,
            FLAG_CHARGING: 0x80,
            FLAG_REDFLAIL: 0x100,
            FLAG_REDFLAIL_DEPLOYED: 0x200
        }
    }

    EnergyToRadius(energy) {
        var f = (energy)/5000.0;
        if(f > 1.0)
                f = 1.0;
        var add = 0.3*Math.pow(f, 1/3);
        var rootVal = 1.0/(1.7+add);
        return Math.pow(energy/100, rootVal)*4.0 - 3;
    }

    updateNetworkFlail(view, offset, isFull, op) {
        var curX;
        var curY;
        var curAngle;
        var flailRadius, energy;
        curX = view.getFloat32(offset, true);
        offset += 4;
        curY = -view.getFloat32(offset, true);
        offset += 4;
        curAngle = -view.getFloat32(offset, true);
        offset += 4;

        energy = view.getUint32(offset, true);
        offset += 4;

        this.energy = energy;

        flailRadius = this.EnergyToRadius(energy);
        var flags;

        if (op == 0xB3 /* OPCODE_ENTITY_INFO_V2 */ ) {
            flags = view.getUint8(offset, true);
            offset += 1;
        } else {
            flags = view.getUint16(offset, true);
            offset += 2;
        }

        var wasAttached = this.attached;
        this.attached = flags & this.flags.FLAG_FLAIL_ATTACHED;

        this.attracting = flags & this.flags.FLAG_FLAIL_ATTRACTING;
        this.invulnerable = flags & this.flags.FLAG_INVULNERABLE;
        this.shock = flags & this.flags.FLAG_SHOCK;
        var prevDecay = this.decay;
        this.decay = flags & this.flags.FLAG_DECAY;

        var prevStill = this.still;
        this.still = flags & this.flags.FLAG_STILL;
        this.inside = flags & this.flags.FLAG_INSIDE;
        this.charging = flags & this.flags.FLAG_CHARGING;

        if (op != 0xB3) {
            this.redFlail = flags & this.flags.FLAG_REDFLAIL;

            this.redFlailDeployed = flags & this.flags.FLAG_REDFLAIL_DEPLOYED;

            var redFlailTime = 0;
            if (this.redFlailDeployed) {
                redFlailTime = view.getUint8(offset, true);
                this.redFlailTime = redFlailTime;
                offset++;
            }
        }

        this.flailX = curX * this.GAME_SCALE;
        this.flailY = curY * this.GAME_SCALE;
        this.flailAngle = curAngle;

        this.flailRadius = flailRadius * this.GAME_SCALE;

        return offset;
    }

    updateChainFlail(view, offset, isFull) {
        var numSegments;
        numSegments = view.getUint8(offset);
        offset += 1;

        for (var i = 0; i < numSegments; i++) {

            if (isFull) {
                // Initialize segments
                this.chainSegments.push({
                    x: 0,
                    y: 0
                });
            }

            var curX = view.getFloat32(offset, true);
            offset += 4;
            var curY = -view.getFloat32(offset, true);
            offset += 4;

            var segmentInfo = this.chainSegments[i];

            segmentInfo.x = curX * this.GAME_SCALE;
            segmentInfo.y = curY * this.GAME_SCALE;
        }


        return offset;
    }

    updateNetwork(view, offset, isFull, op) {
        var curX;
        var curY;
        var curAngle;

        var transferEnergy;
        transferEnergy = view.getUint8(offset, true);
        offset += 1;
        this.transferEnergy = transferEnergy;

        curX = view.getFloat32(offset, true);
        offset += 4;

        curY = -view.getFloat32(offset, true);
        offset += 4;

        curAngle = view.getFloat32(offset, true);
        offset += 4;

        this.x = curX * this.GAME_SCALE;
        this.y = curY * this.GAME_SCALE;

        this.angle = curAngle;

        offset = this.updateChainFlail(view, offset, isFull);
        offset = this.updateNetworkFlail(view, offset, isFull, op);

        if(isFull) {
            this.hue = view.getUint16(offset, true);
                        offset += 2;
        }

        return offset;
    }

    deleteNetwork(view, offset) {
		this.beingDeleted = true;
		return offset;
	}
}

var Collider = class Collider {
    constructor(subType) {
        this.id = 0;
        this.shapeIndex = 0;
        this.x = 0;
        this.y = 0;
        this.subType = subType;
        this.hitValue = 0.0;
        this.margin = 30;
        this.pulsing = false;
        this.pulseValue = 0.0;
        this.coreRotation = 0.0;

        this.types = {
            SUB_ENTITY_BOUNCER: 0,
            SUB_ENTITIY_WALL: 1,
            SUB_ENTITY_DANGER: 2,
            SUB_ENTITY_BOUNDARY: 3,
            SUB_ENTITY_NOFLAILZONE: 4,
            SUB_ENTITY_CORE: 5,
        }

        this.shapes = {
            SHAPE_CIRCLE: 0x01,
            SHAPE_POLY: 0x02
        }

        this.FLAG_PULSE = 0x8;
    }

    updateNetwork(view, offset, isFull) {
        var curX;
        var curY;
        var curAngle;
        var shapeIndex;

        curX = view.getFloat32(offset, true);
        offset += 4;
        curY = -view.getFloat32(offset, true);
        offset += 4;
        curAngle = view.getFloat32(offset, true);
        offset += 4;

        shapeIndex = view.getUint8(offset, true);
        offset += 1;

        if(this.subType == this.types.SUB_ENTITY_BOUNCER)
        {
            var didHit = view.getUint8(offset, true);
            if(didHit)
            {
                this.hitValue = 1.0;
            }
            offset += 1;

            var count = view.getUint8(offset++, true);
        }else if(this.subType == this.types.SUB_ENTITY_CORE)
        {
            var flags = view.getUint8(offset++, true);
            var coreStage = flags & (~this.FLAG_PULSE);
            var pulse = flags & this.FLAG_PULSE;
            if(pulse)
                this.pulsing = true;

            var coreRotation = view.getFloat32(offset, true);
            offset += 4;
        }

        this.x = curX;
        this.y = curY;
        this.angle = curAngle;
        this.shapeIndex = shapeIndex;

        return offset;
    }

    deleteNetwork(view, offset) {
        return offset;
    }
}

var Atom = class Atom {
    constructor() {
        this.id = 0;
        this.x = 0;
        this.y = 0;
        this.energy = 255;
        this.angle = 0.0;

        this.nick = '';
        this.hue = 0;
        this.killedByID = 0;

        this.t = 0;

        this.beingDeleted = false;
        this.canInterpolate = false;
        this.beginGrabX = 0;
        this.beginGrabY = 0;
        this.flailGrabbed = false;
    }

    updateNetwork(view, offset, isFull) {
        var curX;
        var curY;
        var curAngle;

        var energy;
        energy = view.getUint16(offset, true);
        offset += 2;

        curX = view.getFloat32(offset, true);
        offset += 4;

        curY = -view.getFloat32(offset, true);
        offset += 4;

        curAngle = view.getFloat32(offset, true);
        offset += 4;

        this.x = curX * 10;
        this.y = curY * 10;
        this.angle = curAngle;
        this.energy = energy;

        if(isFull) {
            this.hue = view.getUint16(offset, true);
            offset += 2;
        }
        else {
            this.canInterpolate = true;
        }

        return offset;
    }

    deleteNetwork(view, offset) {
		if(true)
		{
			this.flailGrabbed = view.getUint8(offset);
			offset++;

			this.beingDeleted = true;
			this.beginGrabX = this.x;
			this.beginGrabY = this.y;
			return offset;
		}else{
            offset += 1;
			return offset;
		}
	}
}

var Energy = class Energy {
    constructor() {
        this.id = 0;
        this.x = 0;
        this.y = 0;
        this.energy = 255;
        this.angle = 0.0;

        this.hue = 0;
        this.nick = '';
        this.type = 1;

        this.beingDeleted = false;
        this.canInterpolate = false;
        this.killedByID = 0;
        this.beginGrabX = 0;
        this.beginGrabY = 0;
    }

    updateNetwork(view, offset, isFull) {
        var curX;
        var curY;
        var curAngle;

        var energy;
        energy = view.getUint16(offset, true);
        offset += 2;

        curX = view.getFloat32(offset, true);
        offset += 4;
        curY = -view.getFloat32(offset, true);
        offset += 4;
        curAngle = view.getFloat32(offset, true);
        offset += 4;

        this.energy = energy;

        this.x = curX * 10;
        this.y = curY * 10;
        this.angle = curAngle;

        if(isFull) {
            this.hue = view.getUint16(offset, true);
            offset += 2;
            this.type = view.getUint8(offset);
            offset += 1;
        } else {
            this.canInterpolate = true;
        }

        return offset;
    }

    deleteNetwork(view, offset) {
        this.flailGrabbed = view.getUint8(offset);
        offset++;

        this.beingDeleted = true;
        this.beginGrabX = this.x;
        this.beginGrabY = this.y;

        return offset;
    }
}


var Tri = class Tri {
    constructor(subType) {
        this.subType = subType;
        this.id = 0;
        this.x = 0;
        this.y = 0;
        this.energy = 255;
        this.angle = 0.0;

        this.nick = '';
        this.killedByID = 0;

        this.beingDeleted = false;
        this.canInterpolate = false;
    }

    updateNetwork(view, offset, isFull) {
        var curX;
        var curY;
        var curAngle;

        var energy;
        energy = view.getUint16(offset, true);
        offset += 2;

        curX = view.getFloat32(offset, true);
        offset += 4;
        curY = -view.getFloat32(offset, true);
        offset += 4;
        curAngle = view.getFloat32(offset, true);
        offset += 4;

        this.x = curX * 10;
        this.y = curY * 10;
        this.angle = curAngle;

        this.energy = energy;

        var impulse = view.getUint8(offset);
        if(impulse) this.impulseValue = 1.0;
        offset += 1;

        if(isFull) {
            this.positive = view.getUint8(offset);
            offset += 1;

            if(this.positive)
                this.hue = 116;
            else
                this.hue = 0;

        }
        return offset;
    }

    deleteNetwork(view, offset) {
        this.flailGrabbed = view.getUint8(offset);
        this.beingDeleted = true;
        offset += 1;
        return offset;
    }
}

var Boundary = class Boundary {
    constructor(subType) {
        this.id = 0;
        this.subType = subType;
    }

    updateNetwork(view, offset) {
        return offset;
    }

    deleteNetwork(view, offset) {
        return offset;
    }
}

var RedFlailPowerup = class RedFlailPowerup {
    constructor() {
        this.id = -1;
	    this.x = 0;
	    this.y = 0;
	    this.energy = 255;
     	this.nick = '';
     	this.hue = 0;
    	this.killedByID = 0;
        this.beingDeleted = false;
	    this.canInterpolate = false;
    }

    updateNetwork(view, offset, isFull) {
		var curX;
		var curY;

		curX = view.getFloat32(offset, true);
		//console.log('curX ' + curX);
		offset += 4;
		curY = -view.getFloat32(offset, true);
		//console.log('curY ' + curY);
		offset += 4;

		// Do not interpolate, it just appeared on screen
		if(isFull)
		{
			this.x = curX * 10;
			this.y = curY * 10;
		}else{
			this.canInterpolate = true;
		}

    	return offset;
	}

    deleteNetwork(view, offset) {
		if(true)
		{
			this.flailGrabbed = view.getUint8(offset);
			offset++;

			this.beingDeleted = true;
			this.beginGrabX = this.x;
			this.beginGrabY = this.y;
			return offset;
		}else{
			return ++offset;
		}
	}
}

module.exports = {
    Bot: Bot,
    Collider: Collider,
    Ship: Ship,
    Tri: Tri,
    Boundary: Boundary,
    Atom: Atom,
    Energy: Energy
}
