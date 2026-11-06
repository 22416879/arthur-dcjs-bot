import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
    name: { type: String, required: true },       
    series: { type: String, required: true },     
    version: { type: String, required: true },   // 記錄這張卡片抽到的隨機版本名稱
    imageUrl: { type: String, required: true },  // 記錄這張卡片抽到的特定版本圖片網址
    cardId: { type: String, required: true, unique: true }, 
    rarity: { type: String, required: true },    // 完美對齊 String 型態
    quality: { type: Number, required: true },   
    ownerId: { type: String, default: null },     
    createdAt: { type: Date, default: Date.now }, // 🎯 修正 1：這裡幫你補上了最關鍵的「逗號」！
    code: { type: String, default: "" }           // 🎯 修正 2：清空了夾在中間的中文亂碼
});

// 🛠️ 完美雙重導出：同時相容您專案中有些地方用 import、有些地方用 require 呼叫的架構，防止 Vite-node 重複載入崩潰
const CardModel = mongoose.models.Card || mongoose.model('Card', cardSchema);

export const Card = CardModel;
export default CardModel;
