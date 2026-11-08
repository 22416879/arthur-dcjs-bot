import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'userInventory.json');

// 讀取所有玩家的背包資料
function readDB() {
    try {
        if (!fs.existsSync(dbPath)) {
            fs.writeFileSync(dbPath, JSON.stringify({}));
        }
        const data = fs.readFileSync(dbPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('讀取背包資料庫失敗:', error);
        return {};
    }
}

// 儲存所有玩家的背包資料
function writeDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 4));
    } catch (error) {
        console.error('寫入背包資料庫失敗:', error);
    }
}

export const inventoryDB = {
    // 獲取特定玩家的背包，若無資料則初始化
    get: (userId) => {
        const db = readDB();
        if (!db[userId]) {
            db[userId] = {
                'c_ticket': 0,
                'r_ticket': 0,
                'sr_ticket': 0,
                'ssr_ticket': 0,
                'sss_ticket': 0
            };
            writeDB(db);
        }
        return db[userId];
    },

    // 增加或減少玩家的道具數量 (例如：addTicket('123456', 'ssr_ticket', 1))
    addTicket: (userId, ticketType, amount) => {
        const db = readDB();
        if (!db[userId]) {
            inventoryDB.get(userId); // 初始化
            return inventoryDB.addTicket(userId, ticketType, amount);
        }
        
        db[userId][ticketType] = (db[userId][ticketType] || 0) + amount;
        
        // 確保不會扣到負數
        if (db[userId][ticketType] < 0) db[userId][ticketType] = 0;
        
        writeDB(db);
        return db[userId];
    }
};
