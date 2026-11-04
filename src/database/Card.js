import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
    name: { type: String, required: true },       
    series: { type: String, required: true },     
    version: { type: String, required: true },   // ✨ 新增：記錄這張卡片抽到的隨機版本名稱
    imageUrl: { type: String, required: true },  // ✨ 新增：記錄這張卡片抽到的特定版本圖片網址
    cardId: { type: String, required: true, unique: true }, 
    // 修改 src/database/Card.js 中的 rarity 定義
rarity: { type: String, required: true }, // 🛠️ 將 Number 改為 String
   
    quality: { type: Number, required: true },   
    ownerId: { type: String, default: null },     
    createdAt: { type: Date, default: Date.now }
});

// 🛠️ 修正：如果已經編譯過就直接用舊的，沒編譯過才建立新的，防止 Vite-node 重複載入崩潰
export const Card = mongoose.models.Card || mongoose.model('Card', cardSchema);


