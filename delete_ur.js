import 'dotenv/config';
import { MongoClient } from 'mongodb';

// 設定 MongoDB 連線
const mongoUri = process.env.MONGO_URI || "你的_MONGODB_ATLAS_連線字串";
const client = new MongoClient(mongoUri);

async function deleteURCards() {
  try {
    // 連線到 MongoDB
    await client.connect();
    console.log("成功連線至 MongoDB！");
    
    // 指定資料庫與集合名稱
    const database = client.db('card_bot_db'); 
    const cardsCollection = database.collection('cards'); 

    // 🎯 精準比對條件：尋找 rarity 欄位值為 "UR" 的資料
    const query = { rarity: "6" };

    // 1. 安全機制：先查詢符合條件的卡片數量與內容
    const previewCards = await cardsCollection.find(query).toArray();
    
    if (previewCards.length === 0) {
      console.log("❌ 資料庫中目前沒有任何 rarity 為 'UR' 的卡片。");
      return;
    }

    console.log(`\n🔍 預覽即將從 cards 集合中刪除的卡片（共 ${previewCards.length} 張）：`);
    previewCards.forEach(card => {
      // 輸出卡片代碼、名稱與當前稀有度
      console.log(`- [${card.code || '無代碼'}] ${card.name || card.characterName} (rarity: ${card.rarity})`);
    });

    console.log("\n⚠️ 正在執行永久刪除作業...");

    // 2. 執行批量刪除
    const result = await cardsCollection.deleteMany(query);
    
    console.log(`\n🎉 刪除成功！`);
    console.log(`🗑️ 已從 cards 集合中永久刪除了 ${result.deletedCount} 張 UR 卡片。`);

  } catch (error) {
    console.error("刪除過程中發生錯誤:", error);
  } finally {
    // 關閉資料庫連線
    await client.close();
  }
}

deleteURCards();
