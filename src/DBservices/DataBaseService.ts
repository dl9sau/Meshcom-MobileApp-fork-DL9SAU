import {
    SQLiteDBConnection,
    SQLiteConnection,
    CapacitorSQLite,
  } from "@capacitor-community/sqlite";

import { MsgType, PosType, MheardType } from "../utils/AppInterfaces";
import MheardStaticStore from "../utils/MheardStaticStore";
import NodeRuntimeService from "../utils/NodeRuntimeService";
import RelayCountService from "../utils/RelayCountService";
import { msgDiscarded } from "../utils/NotifyPrefs";
import PosiStore from "../store/PosiStore";
import MsgStore from "../store/MsgStore";
import { format, sub } from "date-fns";
import LogS from "../utils/LogService";
import ConfigObject from "../utils/ConfigObject";
import MsgFilterService from "../utils/MsgFilterService";
import AppPrefsStore from "../store/AppPrefsStore";


class DatabaseService {

    static connection: SQLiteConnection | null = null;
    static db: SQLiteDBConnection | null = null;
    static dbName = 'meshcom.db';
    static isInit = false;
    static MAX_AGE_TXT_MSG = 3; // 3 days
    static MAX_AGE_POS = 3; // 3 days
    static MAX_AGE_MHEARD = 2; // 2 days (Heard list is volatile)
    static cached_positions: PosType[] = [];
    private static chatFilterSetting: string = 'ALL';
    

    static async initializeDatabase() {
        LogS.log(0, 'Initializing Database');
        try {
            // check the db connection or build one
            await DatabaseService.checkDbConn();
            
            if (DatabaseService.db) {
                try {
                    LogS.log(0, 'DB Name: ' + DatabaseService.db?.getConnectionDBName());
                    LogS.log(0, 'Opening Database: ' + DatabaseService.dbName);
                    await DatabaseService.db.open();
                    const res = await DatabaseService.db.isDBOpen();
                    if (res.result) {
                        LogS.log(0, 'Database is open');
                    } else {
                        LogS.log(1, 'Error opening database');
                    }
                } catch (error) {
                    LogS.log(1, 'Error opening database:' + error);
                }
                
            } else {
                LogS.log(1, 'Error Database could not be opened');
            }

            // TextMessages table
            if (DatabaseService.db) {
                await DatabaseService.db.execute(`
                    CREATE TABLE IF NOT EXISTS TextMessages (
                        id INTEGER PRIMARY KEY,
                        timestamp INTEGER,
                        msgNr INTEGER,
                        msgTime TEXT,
                        fromCall TEXT,
                        toCall TEXT,
                        msgTXT TEXT,
                        via TEXT,
                        ack INTEGER,
                        isDM INTEGER,
                        isGrpMsg INTEGER,
                        grpNum INTEGER,
                        notify INTEGER,
                        gw INTEGER DEFAULT 0
                    )
                `).catch((err) => {
                    LogS.log(1, 'Error creating TextMessages table:' + err);
                });
            }

            // check if we have isGrpMsg and grpNum columns in the TextMessages table
            if (DatabaseService.db) {
                await DatabaseService.db.query(`SELECT isGrpMsg FROM TextMessages;`).catch(async (err) => {
                    LogS.log(1, 'Checking/adding isGrpMsg, grpNum in TextMessages table:' + err);
                    // add isGrpMsg and grpNum columns
                    await DatabaseService.db?.execute(`ALTER TABLE TextMessages ADD COLUMN isGrpMsg INTEGER DEFAULT 0;`);
                    await DatabaseService.db?.execute(`ALTER TABLE TextMessages ADD COLUMN grpNum INTEGER DEFAULT 0;`);
                });
            }

            // check if we have the gw column (gateway/MQTT flag, byte6 bit 0x80) in TextMessages
            if (DatabaseService.db) {
                await DatabaseService.db.query(`SELECT gw FROM TextMessages;`).catch(async (err) => {
                    LogS.log(1, 'Checking/adding gw in TextMessages table:' + err);
                    await DatabaseService.db?.execute(`ALTER TABLE TextMessages ADD COLUMN gw INTEGER DEFAULT 0;`);
                });
            }

            // Positions table (hops/via persist the routing info for the map overlay)
            if (DatabaseService.db) {
                await DatabaseService.db.execute(`
                    CREATE TABLE IF NOT EXISTS Positions (
                        id INTEGER PRIMARY KEY,
                        timestamp INTEGER,
                        callSign TEXT,
                        lat REAL,
                        lon REAL,
                        alt REAL,
                        bat TEXT,
                        hw TEXT,
                        pressure REAL,
                        temperature REAL,
                        humidity REAL,
                        qnh REAL,
                        comment TEXT,
                        temp_2 REAL,
                        co2 REAL,
                        alt_press REAL,
                        gas_res REAL,
                        hops INTEGER DEFAULT -1,
                        via TEXT
                    )
                `).catch((err) => {
                    LogS.log(1, 'Error creating Positions table:' + err);
                });
            }

            // guarded migration: add hops/via to existing Positions tables
            if (DatabaseService.db) {
                await DatabaseService.db.query(`SELECT hops FROM Positions;`).catch(async (err) => {
                    LogS.log(1, 'Checking/adding hops, via in Positions table:' + err);
                    await DatabaseService.db?.execute(`ALTER TABLE Positions ADD COLUMN hops INTEGER DEFAULT -1;`);
                    await DatabaseService.db?.execute(`ALTER TABLE Positions ADD COLUMN via TEXT;`);
                });
            }

            // delete the old ChatFilterTable
            if (DatabaseService.db) {
                await DatabaseService.db.execute(`
                    DROP TABLE IF EXISTS ChatFilterTable;
                `).then(() => {
                    LogS.log(0, 'Old ChatFilterTable deleted');
                }).catch((err) => {
                    LogS.log(1, 'Error deleting ChatFilterTable:' + err);
                });
            }

            if (DatabaseService.db) {
                console.log('Creating reconState table');
                await DatabaseService.db.execute(`CREATE TABLE IF NOT EXISTS reconState (
                    id INTEGER PRIMARY KEY NOT NULL,
                    reconStateVal INTEGER NOT NULL,
                    devID TEXT
                );`).catch((err) => {
                        LogS.log(1, 'Error creating reconState table:' + err);
                });
                
                const res = await DatabaseService.db?.query('SELECT * FROM reconState');
                console.log('reconState:' + res?.values);
                if (res.values === undefined || res.values.length === 0) {
                    console.log('reconState table is empty, adding default value');
                    await DatabaseService.db?.execute('INSERT INTO reconState (id,reconStateVal,devID) VALUES (0,0,"");');

                    const res = await DatabaseService.db?.query('SELECT * FROM reconState');
                    console.log('reconState after insert:' + res?.values);
                }

            } else {
                LogS.log(1, 'Error creating recon table. Database connection not open.');
            }

            if (DatabaseService.db) {
                console.log('Creating ble_pins table');
                await DatabaseService.db.execute(`CREATE TABLE IF NOT EXISTS ble_pins (
                    device_name TEXT PRIMARY KEY NOT NULL,
                    pin TEXT NOT NULL
                );`).catch((err) => {
                    LogS.log(1, 'Error creating ble_pins table:' + err);
                });
            } else {
                LogS.log(1, 'Error creating ble_pins table. Database connection not open.');
            }

            // MsgFilters table (chat block-filter rules; backwards compatible)
            if (DatabaseService.db) {
                console.log('Creating MsgFilters table');
                await DatabaseService.db.execute(`CREATE TABLE IF NOT EXISTS MsgFilters (
                    id INTEGER PRIMARY KEY,
                    ftype TEXT NOT NULL,
                    pattern TEXT NOT NULL
                );`).catch((err) => {
                    LogS.log(1, 'Error creating MsgFilters table:' + err);
                });
                // load the saved rules into MsgFilterService
                await DatabaseService.loadMsgFilters();
            } else {
                LogS.log(1, 'Error creating MsgFilters table. Database connection not open.');
            }

            // AppPrefs table (key/value UI preferences; backwards compatible)
            if (DatabaseService.db) {
                console.log('Creating AppPrefs table');
                await DatabaseService.db.execute(`CREATE TABLE IF NOT EXISTS AppPrefs (
                    key TEXT PRIMARY KEY NOT NULL,
                    val TEXT
                );`).catch((err) => {
                    LogS.log(1, 'Error creating AppPrefs table:' + err);
                });
                // load saved preferences into AppPrefsStore
                await DatabaseService.loadAppPrefs();
            } else {
                LogS.log(1, 'Error creating AppPrefs table. Database connection not open.');
            }

            // Mheard table (persist the Heard list across restarts; one row per
            // heard station per own node)
            if (DatabaseService.db) {
                console.log('Creating Mheard table');
                await DatabaseService.db.execute(`CREATE TABLE IF NOT EXISTS Mheard (
                    id INTEGER PRIMARY KEY,
                    mh_timestamp INTEGER,
                    mh_nodecall TEXT,
                    mh_callSign TEXT,
                    mh_date TEXT,
                    mh_time TEXT,
                    mh_rssi INTEGER,
                    mh_snr INTEGER,
                    mh_hw TEXT,
                    mh_distance REAL,
                    mh_pl INTEGER,
                    mh_mesh INTEGER,
                    mh_ncnt INTEGER,
                    UNIQUE(mh_nodecall, mh_callSign)
                );`).catch((err) => {
                    LogS.log(1, 'Error creating Mheard table:' + err);
                });
                // seed the in-memory Mheard store from the DB
                await DatabaseService.loadMheards();
            } else {
                LogS.log(1, 'Error creating Mheard table. Database connection not open.');
            }


            // housekeeping
            if (DatabaseService.db) {
                await DatabaseService.housekeeping();

                // update the store with txt messages
                const txtMsgs = await DatabaseService.getTextMessages();
                const escTxtMsgs = DatabaseService.escapeQuotesInArr(txtMsgs);

                if (txtMsgs.length > 0) {
                    //apply filters, updates the store then
                    DatabaseService.applyFilters(escTxtMsgs);
                }

                // update the store with positions
                const positions = await DatabaseService.getPositions();
                if (positions.length > 0) {
                    PosiStore.update(s => {
                        s.posArr = positions;
                    });
                    // seed runtime hops/path from persisted positions so the map
                    // overlay shows them right after a restart
                    for (const p of positions as PosType[]) {
                        if (p.via) {
                            NodeRuntimeService.setPath(p.callSign, p.hops ?? -1, p.via);
                            // reconstruct the all-time "Neighbours (max N)" value: the
                            // via path is "ORIGIN > ... > NEIGHBOUR"; the last hop is
                            // our direct neighbour, every call before it was heard via
                            // them. (Direct nodes have via == own call -> single entry,
                            // skipped.)
                            const hops = p.via.split(" > ").map(s => s.trim()).filter(s => s !== "");
                            if (hops.length >= 2) {
                                const neighbour = hops[hops.length - 1];
                                RelayCountService.seedMax(neighbour, hops.slice(0, hops.length - 1));
                            }
                        }
                    }
                }

                DatabaseService.isInit = true;
            }
        } catch (error) {
            LogS.log(1, 'Error initializing database:' + error);
            DatabaseService.isInit = false;
        }
    }

    // get all text messages from the TextMessages table
    static async getTextMessages() {
        if (DatabaseService.db) {
            console.log('DB Getting text messages');
            try {
                const res = await DatabaseService.db.query('SELECT * FROM TextMessages ORDER BY timestamp ASC;');
                if (res.values) {
                    //console.log('TextMessages:', res.values);
                    // print all the messages
                    /*res.values.forEach((msg: MsgType) => {
                        console.log('MsgNr:', msg.msgNr, 'MsgTimestamp:', msg.timestamp, 'MsgTime:', msg.msgTime, 'From:', msg.fromCall, 'To:', msg.toCall, 'Msg:', msg.msgTXT, 'Via:', msg.via, 'Ack:', msg.ack, 'isDM:', msg.isDM, 'Notify:', msg.notify);
                    });*/
                    return res.values;
                }
            } catch (error) {
                LogS.log(1, 'Error getting text messages:' + error);
            }
        } else {
            LogS.log(1, 'Error getting text messages. Database not open.');
        }
        return [];
    }

    // writeTxtMsg to the TextMessages table
    static async writeTxtMsg(msg: MsgType, isInitMsg: boolean) {
        msg.msgTXT = DatabaseService.escapeQuotes(msg.msgTXT);

        if (DatabaseService.db) {
            // check first if we have that message alredy in the database
            const res = await DatabaseService.db.query(`SELECT * FROM TextMessages WHERE msgNr = ${msg.msgNr} AND fromCall = '${msg.fromCall}' AND msgTXT = '${msg.msgTXT}'`);
            if (res.values && res.values.length > 0) {
                console.log('DB Writing Txt Msg: Message already in database');
                return;
            }

            console.log('DB Writing text message:' + msg.msgTXT);

            try {
                const id = Date.now();
                const query_str = `INSERT INTO TextMessages (id,timestamp, msgNr, msgTime, fromCall, toCall, msgTXT, via, ack, isDM, isGrpMsg, grpNum, notify, gw) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
                const values = [id, msg.timestamp, msg.msgNr, msg.msgTime, msg.fromCall, msg.toCall, msg.msgTXT, msg.via, msg.ack, msg.isDM, msg.isGrpMsg, msg.grpNum, msg.notify, msg.gw ?? 0];
                const ret = await DatabaseService.db.run(query_str, values);
                console.log('DB writeTxtMsg ret:' + ret.changes?.values);
                // read back all messages
                const txtMsgs = await DatabaseService.getTextMessages();
                const escTxtMsgs = DatabaseService.escapeQuotesInArr(txtMsgs);
                //apply filters, updates the store then
                DatabaseService.applyFilters(escTxtMsgs);
                // if this is not during init load from node connection, we need to mark the segment buttons in chat page
                if (isInitMsg) {
                    if (msg.isDM === 0 && msg.isGrpMsg === 0) {
                        ConfigObject.addInitChatSegmentMarker("ALL");
                    } else if (msg.isDM === 1 && msg.isGrpMsg === 0) {
                        ConfigObject.addInitChatSegmentMarker("DM");
                    } else if (msg.isDM === 1 && msg.isGrpMsg === 1) {
                        ConfigObject.addInitChatSegmentMarker(msg.grpNum.toString());
                    }
                }
            } catch (error) {
                LogS.log(1, 'Error writing text message:' + error);
            }
        } else {
            LogS.log(1, 'Error writing text message. Database not open.');
        }
    }

    // escape single and double quotes in a single message
    static escapeQuotes(str: string) {
        return str.replace(/'/g, "''").replace(/"/g, '""');
    }

    // replace single and double quotes in the whole array of messages for diplaying
    static escapeQuotesInArr(arr: MsgType[]) {
        for (let i = 0; i < arr.length; i++) {
            arr[i].msgTXT = arr[i].msgTXT.replace(/''/g, "'").replace(/""/g, '"');
        }
        return arr;
    }

    // Acknowledge Text Message
    static async ackTxtMsg(msgNr: number, ack_type: number) {
        if (DatabaseService.db) {
            console.log('DB Acknowledging text message:' + msgNr);
            try {
                // get message(s) with msgNr
                const res = await DatabaseService.db.query(`SELECT * FROM TextMessages WHERE msgNr = ${msgNr}`);
                if (res.values) {
                    if(res.values.length > 1) {
                        LogS.log(1, 'More than one message with the same msgNr!');
                    }
                    for (let i = 0; i < res.values.length; i++) {
                        const msg: MsgType = res.values[i];
                        if (msg.ack !== 2) {
                            console.log("Setting Ack for MSGID: " + msgNr);
                            console.log("Ack Type: " + ack_type);
                            console.log("Ack Msg Nr. in DB: " + msg.msgNr);

                            if (ack_type === 0x01) {
                                // msg came from GW
                                msg.ack = 2;
                            }
                            if (ack_type === 0x00) {
                                // msg came from another node 
                                msg.ack = 1;
                            }
                            if (ack_type === 0x02) {
                                // msg came from DM Node. Should 0 and 1 instead of 0 and 2
                                msg.ack = 2;
                            }

                            // update in DB
                            const query_str = `UPDATE TextMessages SET ack = ${msg.ack} WHERE msgNr = ${msgNr}`;
                            const ret = await DatabaseService.db.execute(query_str);
                            console.log('DB ackTxtMsg ret:', ret.changes);
                            // read back all messages
                            const txtMsgs = await DatabaseService.getTextMessages();
                            const escTxtMsgs = DatabaseService.escapeQuotesInArr(txtMsgs);
                            //console.log("Last Message in DB:", escTxtMsgs[escTxtMsgs.length - 1]);
                            if (txtMsgs.length > 0) {
                                //apply filters, updates the store then
                                DatabaseService.applyFilters(escTxtMsgs);
                            }
                        }
                    }
                }
            } catch (error) {
                LogS.log(1, 'Error acknowledging text message:' + error);
            }
        } else {
            LogS.log(1, 'Error acknowledging text message. Database not open.');
        }
    }

    // get all positions from the Positions table
    static async getPositions() {
        if (DatabaseService.db) {
            console.log('DB Getting positions');
            try {
                const res = await DatabaseService.db.query('SELECT * FROM Positions;');
                if (res.values) {
                    //console.log('Positions:', res.values);
                    return res.values;
                }
            } catch (error) {
                LogS.log(1, 'Error getting positions:' + error);
            }
        } else {
            LogS.log(1, 'Error getting positions. Database not open.');
        }
        return [];
    }

    // get a single position
    static async getPos(callSign: string) {
        if (DatabaseService.db) {
            console.log('DB Getting position for:', callSign);
            try {
                const res = await DatabaseService.db.query(`SELECT * FROM Positions WHERE callSign = '${callSign}'`);
                if (res.values) {
                    //console.log('Position:', res.values);
                    return res.values[0];
                }
            } catch (error) {
                LogS.log(1, 'Error getting position:' + error);
            }
        } else {
            LogS.log(1, 'Error getting position. Database not open.');
        }
        return null;
    }

    // writePos to the Positions table
    static async writePos(pos: PosType) {
        // check first if we have that position alredy in the database (same callSign) and update it
        const res = await DatabaseService.db?.query(`SELECT * FROM Positions WHERE callSign = '${pos.callSign}'`);
        if (res?.values && res.values.length > 0) {
            console.log('DB Writing Pos: Updating position');
            await DatabaseService.updatePos(pos);
            return;
        }
        if (DatabaseService.db) {
            console.log('DB Writing position:', pos.callSign);
            try {
                const id = Date.now();
                const query_str = `INSERT INTO positions (id,timestamp, callSign, lat, lon, alt, bat, hw, pressure, temperature, humidity, qnh, comment, temp_2, co2, alt_press, gas_res, hops, via) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
                const values = [id, pos.timestamp, pos.callSign, pos.lat, pos.lon, pos.alt, pos.bat, pos.hw, pos.pressure, pos.temperature, pos.humidity, pos.qnh, pos.comment, pos.temp_2, pos.co2, pos.alt_press, pos.gas_res, pos.hops ?? -1, pos.via ?? ""];
                const ret = await DatabaseService.db.run(query_str, values);
                console.log('DB writePos ret:', ret.changes?.values);
                // update the store
                PosiStore.update(s => {
                    s.posArr.push(pos);
                });
            } catch (error) {
                LogS.log(1, 'Error writing position:' + error);
            }
        } else {
            LogS.log(1, 'Error writing position. Database connection not open.');
        }
    }


    // update a position in the Positions table from a specific callsign
    static async updatePos(pos: PosType) {
        if (DatabaseService.db) {
            console.log('DB Updating position:', pos.callSign);
            try {
                const query_str = `UPDATE positions SET timestamp = ?, lat = ?, lon = ?, alt = ?, bat = ?, hw = ?, pressure = ?, temperature = ?, humidity = ?, qnh = ?, comment = ?, temp_2 = ?, co2 = ?, alt_press = ?, gas_res = ?, hops = ?, via = ? WHERE callSign = ?`;
                const values = [pos.timestamp, pos.lat, pos.lon, pos.alt, pos.bat, pos.hw, pos.pressure, pos.temperature, pos.humidity, pos.qnh, pos.comment, pos.temp_2, pos.co2, pos.alt_press, pos.gas_res, pos.hops ?? -1, pos.via ?? "", pos.callSign];
                const ret = await DatabaseService.db.run(query_str, values);
                console.log('DB updatePos ret:', ret.changes?.values);
                // read back all positions
                const positions:PosType[] = await DatabaseService.getPositions();
                if (positions.length > 0) {
                    PosiStore.update(s => {
                        s.posArr = positions;
                    });
                }
            } catch (error) {
                LogS.log(1, 'Error updating position:' + error);
            }
        } else {
            LogS.log(1, 'Error updating position. Database connection not open.');
        }
    }


    // check if we have db connection and db is open
    static async checkDbConn() {
        // do we have a sqlite connection object?
        if(DatabaseService.connection === null) {
            LogS.log(0, 'DB - No connection object. Crating a new one');
            const sqlite = new SQLiteConnection(CapacitorSQLite);
            DatabaseService.connection = sqlite as SQLiteConnection; // Cast to SQLiteConnection
        }
        // check if we have connection
        const retCC = (await DatabaseService.connection.checkConnectionsConsistency()).result;
        const conn = (await DatabaseService.connection?.isConnection(DatabaseService.dbName, false)).result;
        if (conn && retCC) {
            LogS.log(0, 'DB - getting SQLite Connection:' + conn);
            DatabaseService.db = await DatabaseService.connection.retrieveConnection(DatabaseService.dbName, false);
        } else {
            LogS.log(0, 'DB - Database connection not open');
            // create a new connection
            try {
                LogS.log(0, 'DB - Creating new connection');
                DatabaseService.db = await DatabaseService.connection.createConnection(DatabaseService.dbName, false, 'no-encryption', 1, false);
            } catch (error) {
                LogS.log(1, 'Error creating new connection:' + error);
                DatabaseService.isInit = false;
            }
        }
        // check if db is open
        if (DatabaseService.db) {
            const res = await DatabaseService.db.isDBOpen();
            if (res.result) {
                LogS.log(0, 'DB - Database is open');
                DatabaseService.isInit = true;
            } else {
                LogS.log(1, 'Database is not open');
                // open the database
                try {
                    LogS.log(0, 'DB - Opening database');
                    await DatabaseService.db.open();
                    // check if db is open
                    const res = await DatabaseService.db.isDBOpen();
                    if (res.result) {
                        LogS.log(0, 'Database is open');
                        DatabaseService.isInit = true;
                    } else {
                        LogS.log(1, 'Database is not open');
                        DatabaseService.isInit = false;
                    }
                } catch (error) {
                    LogS.log(1, 'Error opening database:' + error);
                    DatabaseService.isInit = false;
                }
            }
        } else {
            LogS.log(1, 'Error Database could not be opened');
            DatabaseService.isInit = false;
        }
    }

     
    // close the database connection
    static async closeConnection() {
        if (DatabaseService.db) {
            LogS.log(0, 'DB Closing database');
            try {
                await DatabaseService.db.close();
                await DatabaseService.connection?.closeConnection(this.dbName, false);
                DatabaseService.isInit = false;
            } catch (error) {
                LogS.log(1, 'Error closing database:' + error);
            }
        }
    }

    // return reconStateVal
    static async getReconState() {
        console.log('SQLite Connection:', DatabaseService.connection);
        console.log('SQLite DB:', DatabaseService.db);

        if (DatabaseService.db) {
            console.log('DB Getting reconState');
            try {
                const res = await DatabaseService.db.query('SELECT * FROM reconState WHERE id = 0;');
                if (res.values) {
                    console.log('reconStateVal:', res.values[0].reconStateVal);
                    return res.values[0].reconStateVal;
                }
            } catch (error) {
                console.error('Error getting reconState:', error);
            }
        } else {
            console.error('Error getting reconState. Database not open.');
            return -1;
        }
        
    }

    // get stored BLE PIN for a device (keyed by device name / callsign)
    static async getBlePin(deviceName: string): Promise<string | null> {
        console.log("Getting BLE PIN for device:", deviceName);
        if (DatabaseService.db) {
            try {
                const res = await DatabaseService.db.query(
                    `SELECT pin FROM ble_pins WHERE device_name = '${deviceName}';`
                );
                if (res.values && res.values.length > 0) {
                    return res.values[0].pin as string;
                }
                return null;
            } catch (error) {
                console.error('Error getting BLE PIN:', error);
                return null;
            }
        } else {
            console.error('Error getting BLE PIN. Database not open.');
            return null;
        }
    }

    // store BLE PIN for a device (upsert)
    static async setBlePin(deviceName: string, pin: string): Promise<void> {
        console.log("Storing BLE PIN for device:", deviceName);
        if (DatabaseService.db) {
            try {
                await DatabaseService.db.execute(
                    `INSERT INTO ble_pins (device_name, pin) VALUES ('${deviceName}', '${pin}')
                     ON CONFLICT(device_name) DO UPDATE SET pin = '${pin}';`
                );
                console.log('BLE PIN stored for:', deviceName);
            } catch (error) {
                console.error('Error storing BLE PIN:', error);
            }
        } else {
            console.error('Error storing BLE PIN. Database not open.');
        }
    }

    // clear stored BLE PIN for a device
    static async clearBlePin(deviceName: string): Promise<void> {
        console.log("Clearing BLE PIN for device:", deviceName);
        if (DatabaseService.db) {
            try {
                await DatabaseService.db.execute(
                    `DELETE FROM ble_pins WHERE device_name = '${deviceName}';`
                );
                console.log('BLE PIN cleared for:', deviceName);
            } catch (error) {
                console.error('Error clearing BLE PIN:', error);
            }
        } else {
            console.error('Error clearing BLE PIN. Database not open.');
        }
    }

    // clear all stored BLE PINs
    static async clearAllBlePins(): Promise<void> {
        if (DatabaseService.db) {
            try {
                await DatabaseService.db.execute(`DELETE FROM ble_pins;`);
                console.log('All BLE PINs cleared');
            } catch (error) {
                console.error('Error clearing all BLE PINs:', error);
            }
        } else {
            console.error('Error clearing all BLE PINs. Database not open.');
        }
    }   

    // set reconStateVal
    static async setReconState(val: number, devID_: string) {
        if (DatabaseService.db) {
            console.log('DB Setting reconState:', val + ' ' + devID_);
            try {
                await DatabaseService.db.execute(`UPDATE reconState SET reconStateVal = ${val}, devID = "${devID_}" WHERE id = 0;`);
                // print the new reconStateVal
                const res = await DatabaseService.db.query('SELECT * FROM reconState WHERE id = 0;');
                if (res.values) {
                    console.log('New reconStateVal:', res.values[0].reconStateVal);
                }
            } catch (error) {
                console.error('Error setting reconState:', error);
            }
        } else {
            console.error('Error setting reconState. Database not open.');
        }
    }

    // clear the TextMessages table
    static async clearTextMessages() {
        if (DatabaseService.db) {
            console.log('DB Clearing TextMessages');
            try {
                await DatabaseService.db.execute('DELETE FROM TextMessages;');
                MsgStore.update(s => {
                    s.msgArr = [];
                });
            } catch (error) {
                console.error('Error clearing TextMessages:', error);
            }
        } else {
            console.error('Error clearing TextMessages. Database not open.');
        }
    }

    // clear the Positions table
    static async clearPositions() {
        if (DatabaseService.db) {
            console.log('DB Clearing Positions');
            try {
                await DatabaseService.db.execute('DELETE FROM Positions;');
                // update the store
                PosiStore.update(s => {
                    s.posArr = [];
                });
            } catch (error) {
                console.error('Error clearing Positions:', error);
            }
        } else {
            console.error('Error clearing Positions. Database not open.');
        }
    }

    // Housekeeping function to remove old messages from the TextMessages and Positions table
    // Both have the timestamp field
    static async housekeeping() {
        LogS.log(0, 'DB Housekeeping');
        if (!DatabaseService.db) {
            LogS.log(1, 'Error housekeeping. Database not open.');
            return;
        }
        const today = new Date();
        const p = AppPrefsStore.getRawState();
        const own = (p.ownCall || '').replace(/'/g, "''");
        // days -> cutoff ms; a retention of 0 means "unlimited" (skip the delete)
        const cutoff = (days: number) => sub(today, { days }).getTime();

        try {
            // ALL / broadcast (isDM=0, isGrpMsg=0)
            if (p.retAll > 0)
                await DatabaseService.db.execute(`DELETE FROM TextMessages WHERE isDM = 0 AND isGrpMsg = 0 AND timestamp < ${cutoff(p.retAll)};`);
            // group channels (isGrpMsg=1)
            if (p.retGroup > 0)
                await DatabaseService.db.execute(`DELETE FROM TextMessages WHERE isGrpMsg = 1 AND timestamp < ${cutoff(p.retGroup)};`);
            // DMs need the own call to split mine vs overheard; skip if unknown (first run before any connect)
            if (own) {
                if (p.retMyDM > 0)
                    await DatabaseService.db.execute(`DELETE FROM TextMessages WHERE isDM = 1 AND isGrpMsg = 0 AND (fromCall = '${own}' OR toCall = '${own}') AND timestamp < ${cutoff(p.retMyDM)};`);
                if (p.retForeignDM > 0)
                    await DatabaseService.db.execute(`DELETE FROM TextMessages WHERE isDM = 1 AND isGrpMsg = 0 AND fromCall != '${own}' AND toCall != '${own}' AND timestamp < ${cutoff(p.retForeignDM)};`);
            }
            // positions
            if (p.retPos > 0)
                await DatabaseService.db.execute(`DELETE FROM Positions WHERE timestamp < ${cutoff(p.retPos)};`);
            // Mheard
            if (p.retMheard > 0)
                await DatabaseService.db.execute(`DELETE FROM Mheard WHERE mh_timestamp < ${cutoff(p.retMheard)};`);
            console.log('DB housekeeping done');
        } catch (err) {
            LogS.log(1, 'Error during housekeeping deletes: ' + err);
        }
    }

    // FILTERING
    // set the filterstring based on the seqgment button selection in the Chat page
    static async setChatFilters(filterStr: string) {

        this.chatFilterSetting = filterStr;
        console.log('DB Setting Chat Filters to:', filterStr);
        try {
            const msgs = await this.getTextMessages();
            this.applyFilters(msgs);
            // write the settings to the ChatFilterTable table
            //await this.writeChatFilterSettings();
        } catch (error) {
            LogS.log(1, 'DB Error setting DM/Grp filter:' + error);
        }
    }


    // function to apply the filters and return the filtered messages. Also show always own send messages
    static applyFilters(msgs: MsgType[]) {
        let filtered_msgs:MsgType[] = [];
        const currentCallsign = ConfigObject.getConf().CALL;

        // apply the chat filter string
        if (this.chatFilterSetting === 'ALL') {
            filtered_msgs = msgs.filter((msg) => {
                return (msg.fromCall === currentCallsign && msg.isDM !== 1 && msg.isGrpMsg !== 1) || (msg.isDM !== 1 && msg.isGrpMsg !== 1);
            });
        } else if (this.chatFilterSetting === 'DM') {
            const showAll = AppPrefsStore.getRawState().dmShowAll;
            filtered_msgs = msgs.filter((msg) => {
                if (!(msg.isDM === 1 && msg.isGrpMsg !== 1)) return false;
                // default: only my own DMs (to or from me); the toggle reveals all
                // overheard DM traffic (monitoring)
                return showAll || msg.fromCall === currentCallsign || msg.toCall === currentCallsign;
            });
        } else {
            // check if it is a group number
            const _grpNum = parseInt(this.chatFilterSetting);
            if (!isNaN(_grpNum)) {
                filtered_msgs = msgs.filter((msg) => {
                    return msg.isGrpMsg === 1 && msg.grpNum === _grpNum || (msg.fromCall === currentCallsign && msg.isGrpMsg === 1 && msg.grpNum === _grpNum);
                });
            }
        }

        // apply the configurable block filter (channel messages only; DMs and
        // own messages are never blocked - see MsgFilterService)
        filtered_msgs = filtered_msgs.filter(msg => !MsgFilterService.isChannelMsgBlocked(msg));

        // hide discarded channels (ALL / a TG hidden via the tab menu; foreign DMs
        // when not monitoring). Own DMs are never discarded.
        filtered_msgs = filtered_msgs.filter(msg => !msgDiscarded(msg, currentCallsign));

        // update the store
        MsgStore.update(s => {
            s.msgArr = filtered_msgs;
        });
    }

    // get the current chat filter setting string
    static getChatFilterSetting() {
        return this.chatFilterSetting;
    }

    // load the block-filter rules from the MsgFilters table into MsgFilterService
    static async loadMsgFilters() {
        try {
            if (!DatabaseService.db) return;
            const res = await DatabaseService.db.query('SELECT ftype, pattern FROM MsgFilters ORDER BY id;');
            const calls: string[] = [];
            const texts: string[] = [];
            if (res.values) {
                for (const row of res.values) {
                    if (row.ftype === 'call') calls.push(row.pattern);
                    else if (row.ftype === 'text') texts.push(row.pattern);
                }
            }
            MsgFilterService.setRules(calls.join('\n'), texts.join('\n'));
            LogS.log(0, `MsgFilters loaded: ${calls.length} calls, ${texts.length} text patterns`);
        } catch (err) {
            LogS.log(1, 'Error loading MsgFilters:' + err);
        }
    }

    // persist the block-filter rules and refresh the chat view
    static async saveMsgFilters(callRaw: string, textRaw: string) {
        // update the in-memory rules right away
        MsgFilterService.setRules(callRaw, textRaw);

        try {
            if (DatabaseService.db) {
                await DatabaseService.db.execute('DELETE FROM MsgFilters;');
                const calls = callRaw.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
                const texts = textRaw.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
                for (const c of calls) {
                    await DatabaseService.db.run('INSERT INTO MsgFilters (ftype, pattern) VALUES (?, ?);', ['call', c]);
                }
                for (const t of texts) {
                    await DatabaseService.db.run('INSERT INTO MsgFilters (ftype, pattern) VALUES (?, ?);', ['text', t]);
                }
                LogS.log(0, `MsgFilters saved: ${calls.length} calls, ${texts.length} text patterns`);
            }
        } catch (err) {
            LogS.log(1, 'Error saving MsgFilters:' + err);
        }

        // re-run the current segment filter so the chat updates immediately
        await DatabaseService.reapplyChatFilters();
    }

    // delete all stored group messages of a given TG number (used when a group
    // slot is repurposed to a different number or cleared - the old TG's messages
    // are stale for that slot)
    static async deleteGroupMessages(grpNum: number) {
        try {
            if (!DatabaseService.db || !(grpNum > 0)) return;
            await DatabaseService.db.execute(`DELETE FROM TextMessages WHERE isGrpMsg = 1 AND grpNum = ${grpNum};`);
            LogS.log(0, 'Deleted messages of TG ' + grpNum);
        } catch (err) {
            LogS.log(1, 'Error deleting group messages:' + err);
        }
    }

    // re-apply the current segment + block filters to the stored messages
    static async reapplyChatFilters() {
        try {
            const msgs = await DatabaseService.getTextMessages();
            DatabaseService.applyFilters(msgs);
        } catch (err) {
            LogS.log(1, 'Error reapplying chat filters:' + err);
        }
    }

    // load UI preferences from the AppPrefs table into AppPrefsStore
    static async loadAppPrefs() {
        try {
            if (!DatabaseService.db) return;
            const res = await DatabaseService.db.query(`SELECT key, val FROM AppPrefs;`);
            const prefs: { [k: string]: string } = {};
            if (res.values) {
                for (const row of res.values) prefs[row.key] = row.val;
            }
            const numPref = (key: string, cur: number): number => {
                if (!(key in prefs)) return cur;
                const n = parseInt(prefs[key]);
                return isNaN(n) ? cur : n;
            };
            AppPrefsStore.update(s => {
                // only override the default when a value was actually saved
                if ('compactHeader' in prefs) s.compactHeader = prefs['compactHeader'] === '1';
                if ('dmShowAll' in prefs) s.dmShowAll = prefs['dmShowAll'] === '1';
                if ('alertAll' in prefs) s.alertAll = prefs['alertAll'] === '1';
                if ('alertTGs' in prefs) s.alertTGs = prefs['alertTGs'];
                // dmAlert tri-state; migrate from the old alertDMmine boolean
                if ('dmAlert' in prefs) s.dmAlert = prefs['dmAlert'];
                else if ('alertDMmine' in prefs) s.dmAlert = prefs['alertDMmine'] === '1' ? 'mine' : 'none';
                if ('discardAll' in prefs) s.discardAll = prefs['discardAll'] === '1';
                if ('discardTGs' in prefs) s.discardTGs = prefs['discardTGs'];
                if ('tabHintSeen' in prefs) s.tabHintSeen = prefs['tabHintSeen'] === '1';
                if ('tgLabels' in prefs) s.tgLabels = prefs['tgLabels'];
                if ('ownCall' in prefs) s.ownCall = prefs['ownCall'];
                s.retAll = numPref('retAll', s.retAll);
                s.retGroup = numPref('retGroup', s.retGroup);
                s.retMyDM = numPref('retMyDM', s.retMyDM);
                s.retForeignDM = numPref('retForeignDM', s.retForeignDM);
                s.retPos = numPref('retPos', s.retPos);
                s.retMheard = numPref('retMheard', s.retMheard);
            });
        } catch (err) {
            LogS.log(1, 'Error loading AppPrefs:' + err);
        }
    }

    // persist a single UI preference (key/value)
    static async setPref(key: string, val: string) {
        try {
            if (!DatabaseService.db) return;
            await DatabaseService.db.run(`INSERT OR REPLACE INTO AppPrefs (key, val) VALUES (?, ?);`, [key, val]);
        } catch (err) {
            LogS.log(1, 'Error saving AppPref ' + key + ':' + err);
        }
    }

    // upsert one Mheard entry (unique per nodecall+callSign)
    static async writeMheard(mh: MheardType) {
        try {
            if (!DatabaseService.db) return;
            const q = `INSERT OR REPLACE INTO Mheard (mh_timestamp, mh_nodecall, mh_callSign, mh_date, mh_time, mh_rssi, mh_snr, mh_hw, mh_distance, mh_pl, mh_mesh, mh_ncnt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
            const v = [mh.mh_timestamp, mh.mh_nodecall, mh.mh_callSign, mh.mh_date, mh.mh_time, mh.mh_rssi, mh.mh_snr, mh.mh_hw, mh.mh_distance, mh.mh_pl, mh.mh_mesh, mh.mh_ncnt];
            await DatabaseService.db.run(q, v);
        } catch (err) {
            LogS.log(1, 'Error writing Mheard:' + err);
        }
    }

    // load persisted Mheard rows into the in-memory MheardStaticStore
    static async loadMheards() {
        try {
            if (!DatabaseService.db) return;
            const res = await DatabaseService.db.query('SELECT * FROM Mheard;');
            if (res.values) {
                MheardStaticStore.seedFromDB(res.values as MheardType[]);
            }
        } catch (err) {
            LogS.log(1, 'Error loading Mheards:' + err);
        }
    }

    // clear the persisted Mheard table (the in-memory clear is separate)
    static async clearMheardsDB() {
        try {
            if (DatabaseService.db) await DatabaseService.db.execute('DELETE FROM Mheard;');
        } catch (err) {
            LogS.log(1, 'Error clearing Mheard table:' + err);
        }
    }

}

export default DatabaseService;