import mongoose from "mongoose";

// 定義版本的子結構
const versionSchema = new mongoose.Schema({
    versionName: { type: String, required: true }, // 版本名稱（如：Normal, Bankai, Gear5）
    imageUrl: { type: String, required: true }    // 該版本對應的圖片網址
});

const characterPoolSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // 角色中文名（唯一）
    searchKey: { type: String, required: true },          // 搜尋基礎關鍵字
    series: { type: String, required: true },             // 出處作品
    versions: [versionSchema]                             // ✨ 關鍵：改為陣列，存放同角色的多個不同版本圖片
});

export const CharacterPool = mongoose.model('CharacterPool', characterPoolSchema);

